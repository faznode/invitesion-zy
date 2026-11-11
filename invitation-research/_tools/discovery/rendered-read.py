#!/usr/bin/env python3
"""Rendered read of ONE public page for a competitor profile (analysis script, not product code).

For a page whose static HTML is a client-rendered shell (RQ-COMP-04: Sonett, S-SNT-002) the capture browser renders
it once. Everything profile-reads.py decides still applies, from the same code:
  * robots.txt first through profile-reads.py's Reader (fetch outcome D-022, RFC 9309 matching, D-030 AI-agent
    policy); a disallow or an applicable / uncertain opt-out means no browser request at all;
  * >= SPACING_S between the robots.txt request and the page;
  * a 401 / 403 / 429 / 503 answer or a bot challenge in the rendered DOM ends the attempt: nothing of the page is
    kept, no retry, no other client or route (playbook §5);
  * one page: no links followed, no clicks, scrolling or forms; a redirect to another origin or to a demo / customer /
    auth / commerce page stops loading (rendered-read.mjs).
Only a challenge-free HTML page is profiled, with profile-reads.py's facts() on the rendered DOM. The JSONL record holds
facts only; the rendered DOM and its visible text go to --private-dir and are never committed.

  source /vercel/share/work/tools/env.sh
  python3 -B rendered-read.py --code SNT --name Sonett --url https://sonett.kr/ \
      --out ../../raw/_discovery/rendered-reads-YYYY-MM-DD.jsonl --private-dir "$INVITESION_PRIVATE_DIR/rendered-reads"
  python3 -B test_rendered_read.py      # offline tests (no network, no browser)
"""
import argparse, importlib.util, json, os, subprocess, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("profile_reads", os.path.join(HERE, "profile-reads.py"))
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

BLOCK_STATUS = (401, 403, 429, 503)


def render_with_chrome(url, html_path, settle_ms=4000):
    run = subprocess.run(["node", os.path.join(HERE, "rendered-read.mjs"), "--url", url, "--html", html_path,
                          "--settle-ms", str(settle_ms)], capture_output=True, text=True, timeout=90)
    lines = (run.stdout or "").strip().splitlines()
    return json.loads(lines[-1]) if lines else {"error": f"renderer gave no output (exit {run.returncode})"}


def _discard(path):
    if os.path.exists(path):
        os.remove(path)


def rendered_read(reader, render, code, name, url, private_dir, clock=time.monotonic, sleep=time.sleep):
    """One target → one JSONL record (facts only). `reader` is a profile-reads.py Reader; `render(url, html_path)`
    returns rendered-read.mjs's result dict and writes the DOM to html_path."""
    rec = {"code": code, "name": name, "observed_at_utc": pr.now_utc(),
           "method": "rendered-read.py (robots via profile-reads.py Reader; one navigation in headless Chrome, "
                     "Android UA, 412x915 mobile emulation, no interaction)",
           "pages": [], "robots": {}}
    origin = pr.origin_of(url)
    pdir = os.path.join(private_dir, code)
    os.makedirs(pdir, exist_ok=True)
    ok, reason = reader.verdict(url)
    st = reader.state(origin)
    rec["robots"][origin] = st.robots
    if st.recorded:
        rec["ai_groups_not_binding"] = {origin: st.recorded}
    if st.robots_text:
        with open(os.path.join(pdir, f"robots-{urllib.parse.urlsplit(origin).netloc}.txt"), "w", encoding="utf-8") as fh:
            fh.write(st.robots_text)
    entry = {"url": url, "at_utc": pr.now_utc()}
    rec["pages"].append(entry)
    if not ok:
        entry["skipped"] = reason
        return rec
    if st.last is not None:
        gap = clock() - st.last
        if gap < reader.spacing:
            sleep(reader.spacing - gap)
    st.last = clock()
    reader.requests.append(url)
    html_path = os.path.join(pdir, "rendered.html")
    res = render(url, html_path)
    if "error" in res:
        entry["error"] = str(res["error"])[:200]
        _discard(html_path)
        return rec
    entry.update(status=res.get("status"), final_url=res.get("finalUrl"),
                 content_type=(res.get("contentType") or "").split(";")[0] or None)
    for key, field in (("redirects", "redirects"), ("requests", "requests"), ("thirdPartyHosts", "third_party_hosts"),
                       ("renderedBytes", "rendered_bytes"), ("innerTextChars", "inner_text_chars"), ("timedOut", "timed_out")):
        if key in res:
            entry[field] = res[key]
    if res.get("aborted"):
        entry["skipped"] = res["aborted"]
        _discard(html_path)
        return rec
    status = res.get("status")
    page = ""
    if os.path.exists(html_path):
        with open(html_path, encoding="utf-8", errors="replace") as fh:
            page = fh.read()
    if status in BLOCK_STATUS or (len(page) < 60000 and pr.CHALLENGE.search(page[:20000])):
        st.stopped = f"HTTP {status} / challenge at {url}"
        entry["blocked"] = "challenge or access block: no further requests to this origin, no fallback"
        _discard(html_path)
        return rec
    if status != 200 or "html" not in (entry["content_type"] or "").lower() or not page:
        entry["error"] = f"not a readable HTML page (status {status}, {entry['content_type']})"
        _discard(html_path)
        return rec
    final = entry["final_url"] or url
    found, _follow, text = pr.facts(url, final, page, pr.origin_of(final))
    entry.update(found)
    with open(os.path.join(pdir, "01-rendered.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"{url}\nstatus {status} (rendered)\n\n{text}\n")
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--private-dir", required=True)
    ap.add_argument("--settle-ms", type=int, default=4000)
    a = ap.parse_args()
    reader = pr.Reader(pr.HttpTransport())
    rec = rendered_read(reader, lambda u, p: render_with_chrome(u, p, a.settle_ms), a.code, a.name, a.url, a.private_dir)
    with open(a.out, "a", encoding="utf-8") as out:
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    page = rec["pages"][0]
    outcome = page.get("skipped") or page.get("blocked") or page.get("error") or f"status {page.get('status')}, {page.get('text_chars')} chars"
    print(f"{a.code}: robots {list(rec['robots'].values())}; {outcome}", file=sys.stderr)


if __name__ == "__main__":
    main()
