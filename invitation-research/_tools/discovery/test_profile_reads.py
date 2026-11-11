#!/usr/bin/env python3
"""Offline regression tests for profile-reads.py (no network): RFC 9309 matching, D-022 fetch outcomes, D-030
AI-agent applicability (applicable / uncertain / recorded, Content-Signal) and hand-followed redirects with per-origin
robots checks and pacing.

    python3 -B invitation-research/_tools/discovery/test_profile_reads.py
"""
import importlib.util
import os
import unittest

_spec = importlib.util.spec_from_file_location("profile_reads", os.path.join(os.path.dirname(__file__), "profile-reads.py"))
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

A, B = "https://a.example", "https://b.example"
ROBOTS_OK = (200, {"content-type": "text/plain"}, b"User-agent: *\nAllow: /\n")
PAGE = (200, {"content-type": "text/html"}, b"<html><title>ok</title><body>" + b"x" * 70000 + b"</body></html>")


def allowed(txt, path):
    return pr.robots_allows(txt, path)[0]


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class FakeTransport:
    """Canned responses by URL; records (time, url) for every request so pacing can be asserted."""

    def __init__(self, clock, responses):
        self.clock, self.responses, self.log = clock, responses, []

    def get(self, url):
        self.log.append((self.clock.now, url))
        self.clock.now += 0.2  # request latency
        return self.responses.get(url, (404, {"content-type": "text/html"}, b"not found"))


def redirect(location, code=301):
    return (code, {"location": location}, b"")


def reader_with(responses):
    clock = FakeClock()
    transport = FakeTransport(clock, responses)
    return pr.Reader(transport, clock=clock.clock, sleep=clock.sleep), transport


class Matching(unittest.TestCase):
    def test_wildcards_and_end_anchor(self):
        txt = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /private*/\nDisallow: /fish$\nDisallow: /*?sort=\n"
        self.assertFalse(allowed(txt, "/file.pdf"))
        self.assertFalse(allowed(txt, "/a/b/c.pdf"))
        self.assertTrue(allowed(txt, "/file.pdf?x=1"), "$ anchors the end of path + query")
        self.assertTrue(allowed(txt, "/file.pdfx"))
        self.assertFalse(allowed(txt, "/private-area/x"))
        self.assertTrue(allowed(txt, "/privatex"))
        self.assertFalse(allowed(txt, "/fish"))
        self.assertTrue(allowed(txt, "/fish/"))
        self.assertTrue(allowed(txt, "/fishing"))
        self.assertFalse(allowed(txt, "/cards?sort=new"))
        self.assertTrue(allowed(txt, "/cards"))

    def test_longest_match_wins(self):
        txt = "User-agent: *\nAllow: /p\nDisallow: /page\n"
        self.assertFalse(allowed(txt, "/page"))
        self.assertFalse(allowed(txt, "/pages/x"))
        self.assertTrue(allowed(txt, "/p"))
        self.assertTrue(allowed(txt, "/pricing"))
        root = "User-agent: *\nAllow: /$\nDisallow: /\n"
        self.assertTrue(allowed(root, "/"))
        self.assertFalse(allowed(root, "/page"))

    def test_equal_specificity_goes_to_allow_in_either_order(self):
        for txt in ("User-agent: *\nDisallow: /folder/\nAllow: /folder/\n",
                    "User-agent: *\nAllow: /folder/\nDisallow: /folder/\n"):
            self.assertTrue(allowed(txt, "/folder/page"), txt)
        for txt in ("User-agent: *\nAllow: /page*\nDisallow: /*page\n",
                    "User-agent: *\nDisallow: /*page\nAllow: /page*\n"):
            self.assertTrue(allowed(txt, "/page"), txt)

    def test_group_selection(self):
        named_only = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n"
        self.assertTrue(allowed(named_only, "/"))
        self.assertFalse(allowed(named_only, "/admin/x"))
        self.assertFalse(allowed("User-agent: *\nUser-agent: Bingbot\nDisallow: /private\n", "/private/a"))
        combined = "User-agent: *\nDisallow: /a\n\nUser-agent: Foo\nDisallow: /\n\nUser-agent: *\nDisallow: /b\n"
        self.assertFalse(allowed(combined, "/a"))
        self.assertFalse(allowed(combined, "/b"), "groups naming the same agent are combined")
        self.assertTrue(allowed(combined, "/c"))
        self.assertTrue(allowed("Disallow: /\nUser-agent: *\nAllow: /\n", "/x"), "rules before any user-agent are ignored")
        self.assertTrue(allowed("User-agent: *\nDisallow:\n", "/anything"), "empty Disallow allows")
        self.assertTrue(allowed("User-agent: *\nSitemap: https://a.example/s.xml\nCrawl-delay: 5\nDisallow: /x\n", "/y"))
        self.assertFalse(allowed("User-agent: *\nSitemap: https://a.example/s.xml\nDisallow: /x\n", "/x/1"))

    def test_percent_encoding_normalisation(self):
        self.assertFalse(allowed("User-agent: *\nDisallow: /%7Ejoe/\n", "/~joe/index.html"))
        self.assertFalse(allowed("User-agent: *\nDisallow: /~joe/\n", "/%7ejoe/index.html"))
        self.assertFalse(allowed("User-agent: *\nDisallow: /foo/bar/ツ\n", "/foo/bar/%E3%83%84"))
        self.assertFalse(allowed("User-agent: *\nDisallow: /foo/bar/%e3%83%84\n", "/foo/bar/ツ"))
        literal_star = "User-agent: *\nDisallow: /file-%2A.html\n"
        self.assertFalse(allowed(literal_star, "/file-*.html"))
        self.assertTrue(allowed(literal_star, "/file-x.html"), "%2A in a rule is a literal *, not a wildcard")

    def test_robots_txt_is_always_allowed(self):
        self.assertTrue(allowed("User-agent: *\nDisallow: /\n", "/robots.txt"))


class AiAgentOptOut(unittest.TestCase):
    def test_legacy_tokens_are_uncertain_and_keep_the_restriction(self):
        legacy = "User-agent: *\nAllow: /\n\nUser-agent: Claude-Web\nDisallow: /\n\nUser-agent: anthropic-ai\nDisallow: /\n"
        self.assertEqual(pr.ai_agent_optout(legacy, "/"), ["anthropic-ai", "claude-web"])
        self.assertEqual(pr.ai_agent_optout(legacy, "/product?x=1"), ["anthropic-ai", "claude-web"])
        policy = pr.agent_policy(legacy, "/")
        self.assertEqual((policy["applicable"], policy["uncertain"]), ([], ["anthropic-ai", "claude-web"]))

    def test_claude_user_is_applicable(self):
        self.assertEqual(pr.agent_policy("User-agent: Claude-User/1.0\nDisallow: /\n", "/a")["applicable"], ["claude-user"])

    def test_other_operators_agents_are_recorded_not_binding(self):
        txt = "User-agent: ChatGPT-User/1.0\nUser-agent: Perplexity-User\nUser-agent: ExaUser\nDisallow: /\n"
        self.assertEqual(pr.ai_agent_optout(txt, "/a"), [], "D-026 overreach removed (D-030)")
        self.assertEqual(pr.agent_policy(txt, "/a")["recorded"], ["chatgpt-user", "exauser", "perplexity-user"])

    def test_wildcard_and_path_specific_rules(self):
        self.assertEqual(pr.ai_agent_optout("User-agent: Claude-Web\nDisallow: /*\n", "/x"), ["claude-web"])
        partial = "User-agent: Claude-User\nDisallow: /admin\n"
        self.assertEqual(pr.ai_agent_optout(partial, "/"), [])
        self.assertEqual(pr.ai_agent_optout(partial, "/admin/users"), ["claude-user"])
        mixed = "User-agent: Claude-User\nDisallow: /\nAllow: /harga\n"
        self.assertEqual(pr.ai_agent_optout(mixed, "/harga"), [])
        self.assertEqual(pr.ai_agent_optout(mixed, "/"), ["claude-user"])

    def test_content_signal_ai_input_no_is_applicable(self):
        cs = "User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-input=no\nAllow: /\n"
        self.assertEqual(pr.ai_agent_optout(cs, "/"), ["content-signal:ai-input=no"])
        self.assertEqual(pr.ai_agent_optout("User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n", "/"), [])
        self.assertEqual(pr.ai_agent_optout("User-agent: GPTBot\nContent-Signal: ai-input=no\nDisallow:\n", "/"), [],
                         "a signal in a group that does not bind us")
        scoped = "User-agent: *\nContent-Signal: ai-input=no\nContent-Signal: /about ai-input=yes\nAllow: /\n"
        self.assertEqual(pr.ai_agent_optout(scoped, "/about/team"), [], "longest path-scoped signal wins")
        self.assertEqual(pr.ai_agent_optout(scoped, "/harga"), ["content-signal:ai-input=no"])
        self.assertEqual(pr.parse_signal("ai-train=no, bogus=no, search=maybe"), (None, {"ai-train": False}))

    def test_equal_specificity_in_an_ai_group_goes_to_allow(self):
        for txt in ("User-agent: anthropic-ai\nDisallow: /\nAllow: /\n", "User-agent: anthropic-ai\nAllow: /\nDisallow: /\n"):
            self.assertEqual(pr.ai_agent_optout(txt, "/"), [], txt)

    MANAGED = ("# As a condition of accessing this website, you agree to abide by the following\n"
               "# BEGIN Cloudflare Managed content\nUser-agent: *\nContent-Signal: search=yes,ai-train=no,use=reference\n"
               "Allow: /\n# Training crawlers\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: anthropic-ai\nDisallow: /\n"
               "User-agent: Claude-Web\nDisallow: /\n# END Cloudflare Managed Content\nUser-Agent: *\nAllow: /\nDisallow: /api/\n")

    def test_managed_training_section_is_a_documented_training_optout(self):
        policy = pr.agent_policy(self.MANAGED, "/")
        self.assertEqual((policy["applicable"], policy["uncertain"]), ([], []))
        self.assertEqual(policy["recorded"], ["anthropic-ai (managed training section)",
                                              "claude-web (managed training section)", "claudebot"])
        self.assertEqual(policy["signals"], {"search": True, "ai-train": False, "use": "reference"})
        self.assertTrue(pr.robots_allows(self.MANAGED, "/harga")[0])
        self.assertFalse(pr.robots_allows(self.MANAGED, "/api/x")[0], "the site-authored * section still binds")

    def test_site_authored_legacy_group_or_unmanaged_label_stays_uncertain(self):
        self.assertEqual(pr.agent_policy(self.MANAGED + "User-agent: anthropic-ai\nDisallow: /\n", "/")["uncertain"],
                         ["anthropic-ai"])
        self.assertEqual(pr.agent_policy("# Training crawlers\nUser-agent: Claude-Web\nDisallow: /\n", "/")["uncertain"],
                         ["claude-web"])
        sitemu = self.MANAGED + "User-Agent: Claude-Web\nAllow: /\n"
        self.assertFalse([t for t in pr.agent_policy(sitemu, "/")["recorded"] if t.startswith("claude-web")],
                         "the site's own Allow ties the managed Disallow")

    def test_managed_agent_section_and_use_immediate_are_applicable(self):
        agents = "# BEGIN Cloudflare Managed content\n# AI agents\nUser-agent: ChatGPT-User\nDisallow: /\n# END Cloudflare Managed Content\n"
        self.assertEqual(pr.agent_policy(agents, "/")["applicable"], ["cloudflare-managed:agent-policy"])
        self.assertEqual(pr.ai_agent_optout("User-agent: *\nContent-Signal: use=immediate\nAllow: /\n", "/"),
                         ["content-signal:use=immediate"])

    def test_training_and_search_crawlers_and_star_do_not_count(self):
        txt = "User-agent: ClaudeBot\nUser-agent: GPTBot\nUser-agent: Claude-SearchBot\nDisallow: /\n"
        self.assertEqual(pr.ai_agent_optout(txt, "/"), [])
        self.assertEqual(pr.agent_policy(txt, "/")["recorded"], ["claude-searchbot", "claudebot", "gptbot"])
        self.assertEqual(pr.ai_agent_optout("User-agent: *\nDisallow: /\n", "/"), [])


class TransferCoding(unittest.TestCase):
    def test_gzip_and_deflate_bodies_are_decoded_and_plain_bodies_untouched(self):
        import gzip, zlib
        page = "<html><title>易企秀</title></html>".encode("utf-8")
        self.assertEqual(pr.HttpTransport.decode_body({"content-encoding": "gzip"}, gzip.compress(page)), page)
        self.assertEqual(pr.HttpTransport.decode_body({"content-encoding": "deflate"}, zlib.compress(page)), page)
        self.assertEqual(pr.HttpTransport.decode_body({}, page), page)
        self.assertEqual(pr.HttpTransport.decode_body({"content-encoding": "gzip"}, b"not gzip"), b"not gzip")


class FetchOutcomes(unittest.TestCase):
    def verdict_for(self, robots_response, path="/"):
        reader, _ = reader_with({A + "/robots.txt": robots_response})
        return reader.verdict(A + path)

    def test_status_classes(self):
        self.assertTrue(self.verdict_for((404, {"content-type": "text/html"}, b""))[0], "4xx = no rules")
        for status in (429, 500, 503, None):
            self.assertFalse(self.verdict_for((status, {}, b""))[0], f"{status} = disallow everything (D-022)")
        self.assertTrue(self.verdict_for((200, {"content-type": "text/html"}, b"<!doctype html><p>hi"))[0])
        self.assertFalse(self.verdict_for((200, {"content-type": "text/plain"}, b"User-agent: *\nDisallow: /\n"))[0])

    def test_robots_redirect_rules_apply_to_the_initial_authority(self):
        reader, transport = reader_with({
            A + "/robots.txt": redirect(B + "/robots.txt"),
            B + "/robots.txt": (200, {"content-type": "text/plain"}, b"User-agent: *\nDisallow: /x\n"),
        })
        self.assertFalse(reader.verdict(A + "/x/1")[0])
        self.assertTrue(reader.verdict(A + "/y")[0])
        self.assertEqual([u for _, u in transport.log], [A + "/robots.txt", B + "/robots.txt"])
        self.assertIsNone(reader.origins[B].robots, "B's own robots verdict is read separately when B is visited")

    def test_robots_redirect_chain_longer_than_five_hops_disallows(self):
        chain = {f"{A}/r{i}": redirect(f"{A}/r{i + 1}") for i in range(10)}
        chain[A + "/robots.txt"] = redirect(A + "/r0")
        reader, transport = reader_with(chain)
        ok, reason = reader.verdict(A + "/")
        self.assertFalse(ok)
        self.assertIn("more than 5 redirects", reason)
        self.assertEqual(len(transport.log), 6)


class Redirects(unittest.TestCase):
    def assertPaced(self, transport, spacing=pr.SPACING_S):
        last = {}
        for t, url in transport.log:
            origin = pr.origin_of(url)
            if origin in last:
                self.assertGreaterEqual(t - last[origin], spacing - 1e-9, f"{url} requested too soon after {origin}")
            last[origin] = t

    def test_same_origin_redirect_is_paced_and_checked(self):
        reader, transport = reader_with({A + "/robots.txt": ROBOTS_OK, A + "/": redirect("/id/"), A + "/id/": PAGE})
        res = reader.get(A + "/")
        self.assertEqual(res["status"], 200)
        self.assertEqual(res["final_url"], A + "/id/")
        self.assertEqual(res["hops"], [{"url": A + "/", "status": 301, "location": A + "/id/"}])
        self.assertEqual([u for _, u in transport.log], [A + "/robots.txt", A + "/", A + "/id/"])
        self.assertPaced(transport)

    def test_cross_origin_redirect_reads_the_destination_robots_before_any_page_request(self):
        reader, transport = reader_with({
            A + "/robots.txt": ROBOTS_OK, A + "/": redirect(B + "/landing"),
            B + "/robots.txt": (200, {"content-type": "text/plain"}, b"User-agent: *\nDisallow: /landing\n"),
            B + "/landing": PAGE,
        })
        res = reader.get(A + "/")
        self.assertIn("robots.txt disallows", res["skipped"])
        self.assertNotIn(B + "/landing", [u for _, u in transport.log])
        self.assertEqual([u for _, u in transport.log], [A + "/robots.txt", A + "/", B + "/robots.txt"])

    def test_redirect_into_an_ai_agent_optout_stops_that_origin(self):
        reader, transport = reader_with({
            A + "/robots.txt": ROBOTS_OK, A + "/": redirect(B + "/"),
            B + "/robots.txt": (200, {"content-type": "text/plain"}, b"User-agent: *\nAllow: /\n\nUser-agent: Claude-Web\nDisallow: /\n"),
            B + "/": PAGE, B + "/harga": PAGE,
        })
        self.assertIn("D-030", reader.get(A + "/")["skipped"])
        self.assertIn("origin stopped", reader.get(B + "/harga")["skipped"])
        self.assertEqual([u for _, u in transport.log], [A + "/robots.txt", A + "/", B + "/robots.txt"])

    def test_redirect_to_a_demo_or_login_page_is_not_requested(self):
        for target in ("/login?next=/", "/demo/aurora", "/contoh/undangan-1", "/i/budi-sari/tamu"):
            reader, transport = reader_with({A + "/robots.txt": ROBOTS_OK, A + "/harga": redirect(target), A + target: PAGE})
            res = reader.get(A + "/harga")
            self.assertIn("never-reach", res["skipped"], target)
            self.assertNotIn(A + target, [u for _, u in transport.log])

    def test_redirect_loop_stops_after_five_hops(self):
        reader, transport = reader_with({A + "/robots.txt": ROBOTS_OK, A + "/a": redirect("/b"), A + "/b": redirect("/a")})
        res = reader.get(A + "/a")
        self.assertIn("more than 5 redirects", res["skipped"])
        self.assertEqual(sum(1 for _, u in transport.log if u != A + "/robots.txt"), 6)
        self.assertPaced(transport)

    def test_block_on_a_redirect_target_stops_only_that_origin(self):
        reader, transport = reader_with({
            A + "/robots.txt": ROBOTS_OK, A + "/": redirect(B + "/"), A + "/fitur": PAGE,
            B + "/robots.txt": ROBOTS_OK, B + "/": (403, {"content-type": "text/html"}, b"Access denied"),
        })
        self.assertIn("blocked", reader.get(A + "/"))
        self.assertIn("origin stopped", reader.get(B + "/tema")["skipped"])
        self.assertEqual(reader.get(A + "/fitur")["status"], 200)
        self.assertNotIn(B + "/tema", [u for _, u in transport.log])
        self.assertPaced(transport)

    def test_challenge_page_with_200_stops_the_origin(self):
        reader, _ = reader_with({A + "/robots.txt": ROBOTS_OK, A + "/": (200, {"content-type": "text/html"}, b"<title>Just a moment...</title>")})
        self.assertIn("blocked", reader.get(A + "/"))
        self.assertIn("origin stopped", reader.get(A + "/harga")["skipped"])


class FollowRules(unittest.TestCase):
    def test_homepage_links_skip_demo_auth_blog_and_query_pages(self):
        page = ('<a href="/harga">Harga</a><a href="/tema/">Tema</a><a href="/demo/x">Tema demo</a>'
                '<a href="/blog/harga-undangan">Harga blog</a><a href="/paket?ref=1">Paket</a><a href="/login">Masuk</a>'
                '<a href="https://other.example/pricing">Pricing</a>')
        _, follow, _ = pr.facts(A + "/", A + "/", page, A)
        self.assertEqual(follow, [A + "/harga", A + "/tema/"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
