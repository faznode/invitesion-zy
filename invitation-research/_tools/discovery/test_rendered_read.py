#!/usr/bin/env python3
"""Offline tests for rendered-read.py (no network, no browser): robots before any browser request, D-030 opt-outs,
pacing, access blocks and challenges end the attempt with nothing kept, redirects away from the origin are discarded,
and a readable page yields facts only in the record while its text stays in the private directory.

    python3 -B invitation-research/_tools/discovery/test_rendered_read.py
"""
import importlib.util
import json
import os
import tempfile
import unittest

_spec = importlib.util.spec_from_file_location("rendered_read", os.path.join(os.path.dirname(__file__), "rendered-read.py"))
rr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rr)
pr = rr.pr

SITE = "https://shop.example"
URL = SITE + "/"
SECRET_SENTENCE = "Kalimat pemasaran yang tidak boleh masuk repo"


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.slept = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


class FakeTransport:
    def __init__(self, clock, robots):
        self.clock, self.robots, self.log = clock, robots, []

    def get(self, url):
        self.log.append(url)
        self.clock.now += 0.2
        return self.robots


class FakeRender:
    """Stands in for rendered-read.mjs: writes `html` to the requested path and returns `result`."""

    def __init__(self, result, html=None):
        self.result, self.html, self.calls = result, html, []

    def __call__(self, url, html_path):
        self.calls.append(url)
        if self.html is not None:
            with open(html_path, "w", encoding="utf-8") as fh:
                fh.write(self.html)
        return dict(self.result)


def robots(text, status=200):
    return (status, {"content-type": "text/plain"}, text.encode())


def run(robots_response, render):
    clock = FakeClock()
    reader = pr.Reader(FakeTransport(clock, robots_response), clock=clock.clock, sleep=clock.sleep)
    private = tempfile.mkdtemp()
    rec = rr.rendered_read(reader, render, "TST", "Test vendor", URL, private, clock=clock.clock, sleep=clock.sleep)
    return rec, clock, os.path.join(private, "TST")


PAGE_HTML = ("<html lang=\"ko\"><head><title>Contoh</title></head><body><nav><a href=\"/pricing\">Harga</a></nav>"
             f"<main><h1>Undangan</h1><p>{SECRET_SENTENCE}. RSVP dan galeri foto.</p></main></body></html>")
OK_RESULT = {"status": 200, "finalUrl": URL, "contentType": "text/html; charset=utf-8", "redirects": [],
             "requests": {"firstParty": 9, "thirdParty": 3, "failed": 0}, "thirdPartyHosts": ["cdn.example"],
             "renderedBytes": len(PAGE_HTML), "innerTextChars": 80, "timedOut": False}


class RobotsFirst(unittest.TestCase):
    def test_disallow_means_no_browser_request(self):
        render = FakeRender(OK_RESULT, PAGE_HTML)
        rec, _, _ = run(robots("User-agent: *\nDisallow: /\n"), render)
        self.assertEqual(render.calls, [])
        self.assertIn("disallows", rec["pages"][0]["skipped"])

    def test_claude_user_opt_out_is_applicable(self):
        render = FakeRender(OK_RESULT, PAGE_HTML)
        rec, _, _ = run(robots("User-agent: *\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /\n"), render)
        self.assertEqual(render.calls, [])
        self.assertIn("D-030", rec["pages"][0]["skipped"])

    def test_robots_unreachable_disallows(self):
        render = FakeRender(OK_RESULT, PAGE_HTML)
        rec, _, _ = run(robots("oops", status=503), render)
        self.assertEqual(render.calls, [])
        self.assertIn("D-022", rec["pages"][0]["skipped"])

    def test_page_waits_for_the_spacing_after_robots(self):
        render = FakeRender(OK_RESULT, PAGE_HTML)
        _, clock, _ = run(robots("User-agent: *\nAllow: /\n"), render)
        self.assertEqual(render.calls, [URL])
        self.assertTrue(clock.slept and abs(sum(clock.slept) - (pr.SPACING_S - 0.2)) < 1e-6)


class Stops(unittest.TestCase):
    def test_access_block_keeps_nothing(self):
        render = FakeRender({**OK_RESULT, "status": 403}, PAGE_HTML)
        rec, _, pdir = run(robots("User-agent: *\nAllow: /\n"), render)
        self.assertIn("blocked", rec["pages"][0])
        self.assertFalse(os.path.exists(os.path.join(pdir, "rendered.html")))
        self.assertFalse(os.path.exists(os.path.join(pdir, "01-rendered.txt")))

    def test_challenge_in_rendered_dom_keeps_nothing(self):
        render = FakeRender(OK_RESULT, "<html><title>Just a moment...</title><body>cf-chl</body></html>")
        rec, _, pdir = run(robots("User-agent: *\nAllow: /\n"), render)
        self.assertIn("blocked", rec["pages"][0])
        self.assertFalse(os.path.exists(os.path.join(pdir, "rendered.html")))

    def test_redirect_away_is_discarded(self):
        render = FakeRender({**OK_RESULT, "aborted": "redirect to https://other.example/: another origin"}, PAGE_HTML)
        rec, _, pdir = run(robots("User-agent: *\nAllow: /\n"), render)
        self.assertIn("another origin", rec["pages"][0]["skipped"])
        self.assertFalse(os.path.exists(os.path.join(pdir, "rendered.html")))

    def test_renderer_error_is_recorded(self):
        render = FakeRender({"error": "Chrome did not expose a page target"})
        rec, _, _ = run(robots("User-agent: *\nAllow: /\n"), render)
        self.assertIn("Chrome", rec["pages"][0]["error"])


class Profiled(unittest.TestCase):
    def test_facts_in_record_text_in_private_dir(self):
        render = FakeRender(OK_RESULT, PAGE_HTML)
        rec, _, pdir = run(robots("User-agent: *\nAllow: /\n"), render)
        page = rec["pages"][0]
        self.assertEqual(page["status"], 200)
        self.assertEqual(page["lang"], "ko")
        self.assertIn("rsvp", page["features"])
        self.assertIn("/pricing", page["internal_paths"])
        self.assertEqual(page["third_party_hosts"], ["cdn.example"])
        self.assertNotIn(SECRET_SENTENCE, json.dumps(rec, ensure_ascii=False))
        with open(os.path.join(pdir, "01-rendered.txt"), encoding="utf-8") as fh:
            self.assertIn(SECRET_SENTENCE, fh.read())
        self.assertTrue(os.path.exists(os.path.join(pdir, "robots-shop.example.txt")))


if __name__ == "__main__":
    unittest.main()
