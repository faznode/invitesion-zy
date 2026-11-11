#!/usr/bin/env python3
"""Re-evaluate recorded profile reads against the *current* robots.txt with profile-reads.py's matcher.

Only robots.txt is requested (one paced request per origin, redirects per RFC 9309); no page is fetched. Use it after a
change to the robots policy or matcher to find past reads that the current rules would not allow, and to confirm that
recorded AI-agent restrictions (D-030: applicable opt-outs and the uncertain legacy-token restriction) still hold. robots.txt can change between the original read and the re-check, so a difference
is a finding to investigate, not proof that the original read was wrong.

    python3 -B recheck-robots.py ../../raw/_discovery/profile-reads-YYYY-MM-DD.jsonl [--extra-origin https://x.example]
"""
import argparse
import importlib.util
import json
import os
import sys

_spec = importlib.util.spec_from_file_location("profile_reads", os.path.join(os.path.dirname(__file__), "profile-reads.py"))
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)


def recorded_urls(rec):
    """Every URL a record requested or landed on (url, redirect hops, final_url)."""
    urls = []
    for page in rec.get("pages", []):
        if "skipped" in page:
            continue
        urls.append(page["url"])
        urls.extend(hop["location"] for hop in page.get("redirects", []))
        if page.get("final_url") and page["final_url"] not in urls:
            urls.append(page["final_url"])
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl", nargs="+")
    ap.add_argument("--extra-origin", action="append", default=[], help="origin recorded as excluded (no pages) to re-check")
    a = ap.parse_args()
    reader = pr.Reader(pr.HttpTransport())
    findings = 0
    excluded = list(a.extra_origin)
    for path in a.jsonl:
        for line in open(path, encoding="utf-8"):
            rec = json.loads(line)
            if "excluded" in rec:
                excluded.extend(o for o in rec.get("origins", []) if o not in excluded)
                print(f"{rec['code']}: recorded as excluded ({rec['excluded'][:90]})")
                continue
            for url in recorded_urls(rec):
                st = reader.robots(pr.origin_of(url))
                optout = pr.ai_agent_optout(st.robots_text, pr.path_with_query(url)) if st.robots_text else []
                if st.robots.startswith("disallow-all"):
                    verdict = f"NOT ALLOWED now ({st.robots})"
                elif optout:
                    verdict = f"NOT ALLOWED now (AI-agent restriction {optout}, D-030)"
                elif st.robots_text and not pr.robots_allows(st.robots_text, pr.path_with_query(url))[0]:
                    verdict = f"NOT ALLOWED now (* rules: {pr.robots_allows(st.robots_text, pr.path_with_query(url))[1]})"
                else:
                    verdict = "allowed"
                findings += verdict != "allowed"
                print(f"{rec['code']}: {url} -> {verdict}  [{st.robots}]")
    for origin in excluded:
        st = reader.robots(origin)
        policy = pr.agent_policy(st.robots_text, "/") if st.robots_text else {"applicable": [], "uncertain": []}
        print(f"excluded origin {origin}: '/' applicable {policy['applicable'] or 'NONE'}, uncertain "
              f"{policy['uncertain'] or 'NONE'} (D-030)  [{st.robots}]")
    print(f"recheck-robots: {len(reader.requests)} robots.txt requests, {findings} recorded reads not allowed under current rules",
          file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
