#!/usr/bin/env python3
"""D-030 robots applicability audit over every competitor origin this research has listed, read or captured.

Only robots.txt is requested (profile-reads.py's Reader: paced per origin, redirects per RFC 9309, D-022 fetch outcomes);
no page is fetched. For each origin the current file is classified for `/` and for every path the research recorded
there (captures, profile reads, WebFetch reads), under the documented rule:

  * scripts  - our tools (generic browser UA, no product token): `*` rules + D-030 classes
  * webfetch - the agent platform's reader, which identified itself as ExaUser on 2026-11-04: RFC 9309 binds it to an
               `ExaUser` group if one exists, else `*`; the D-030 classes apply as well because the same agent reads

A current file says nothing about what applied when an older read or capture was made; the output is a re-check, and a
difference is a finding to investigate (see ../../02-competitor-discovery/robots-applicability-s12.md).

    python3 -B robots-applicability-audit.py --out ../../raw/_discovery/robots-applicability-YYYY-MM-DD.jsonl
"""
import argparse, csv, hashlib, importlib.util, json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
spec = importlib.util.spec_from_file_location("profile_reads", os.path.join(HERE, "profile-reads.py"))
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

OWN_HOSTS = re.compile(r"(^|\.)(invitesion\.|localhost|127\.0\.0\.1|github\.com|web\.archive\.org|vercel\.)", re.I)


def recorded_paths():
    """{origin: {"paths": set, "clients": set, "codes": set}} from the research records."""
    found = {}

    def add(url, client, code=""):
        p = urllib.parse.urlsplit(url.strip())
        if p.scheme not in ("http", "https") or not p.netloc or OWN_HOSTS.search(p.netloc):
            return
        entry = found.setdefault(f"{p.scheme}://{p.netloc}".lower(), {"paths": set(), "clients": set(), "codes": set()})
        entry["paths"].add(pr.path_with_query(url.strip()))
        entry["clients"].add(client)
        if code:
            entry["codes"].add(code)

    with open(os.path.join(ROOT, "02-competitor-discovery", "competitor-longlist.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("url"):
                add(row["url"] if "://" in row["url"] else "https://" + row["url"], "listed", row.get("code", ""))
    with open(os.path.join(ROOT, "raw", "_captures.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            add(row["url"], "scripts", row["capture_id"].split("-")[1])
    disc = os.path.join(ROOT, "raw", "_discovery")
    for name in sorted(os.listdir(disc)):
        if name.startswith("profile-reads-") and name.endswith(".jsonl"):
            with open(os.path.join(disc, name), encoding="utf-8") as f:
                for line in f:
                    rec = json.loads(line)
                    for page in rec.get("pages", []):
                        if page.get("status") is None:
                            continue  # skipped or failed before a request: refused at the time, not a read
                        for key in ("url", "final_url"):
                            if page.get(key):
                                add(page[key], "scripts", rec.get("code", ""))
                    for origin in rec.get("origins", []):
                        add(origin + "/", "scripts", rec.get("code", ""))
    with open(os.path.join(ROOT, "_evidence-index.md"), encoding="utf-8") as f:
        for line in f:
            if "WebFetch" in line:
                code = (re.match(r"\|\s*S-([A-Z]{3})", line) or [None, ""])[1]
                for url in re.findall(r"https?://[^\s|`)\]>,]+", line):
                    add(url.rstrip(".;"), "webfetch", code)
    return found


def classify(text, path, client):
    """D-030 verdict for one path. Returns (verdict, detail) with verdict in
    allowed | opt-out | restricted-uncertain | disallowed-by-rules."""
    policy = pr.agent_policy(text, path)
    if policy["applicable"]:
        return "opt-out", ",".join(policy["applicable"])
    if policy["uncertain"]:
        return "restricted-uncertain", ",".join(policy["uncertain"])
    groups = pr.parse_groups(text)
    rules = (pr.rules_for(groups, "exauser") or pr.rules_for(groups, "*")) if client == "webfetch" else pr.rules_for(groups, "*")
    ok, rule = pr.match_rules(rules, path)
    if not ok:
        return "disallowed-by-rules", f"{'Allow' if rule[0] else 'Disallow'}: {rule[1]}"
    return "allowed", ""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    ap.add_argument("--private-dir", default=os.environ.get("INVITESION_PRIVATE_DIR", ""))
    a = ap.parse_args()
    reader = pr.Reader(pr.HttpTransport())
    origins = recorded_paths()
    rows = []
    for origin in sorted(origins):
        info = origins[origin]
        st = reader.robots(origin)
        text = st.robots_text or ""
        row = {"origin": origin, "codes": sorted(info["codes"]), "clients": sorted(info["clients"]),
               "checked_at_utc": pr.now_utc(), "robots": st.robots}
        if text:
            row["robots_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
            if a.private_dir:
                os.makedirs(os.path.join(a.private_dir, "robots-s12"), exist_ok=True)
                with open(os.path.join(a.private_dir, "robots-s12", urllib.parse.urlsplit(origin).netloc + ".txt"), "w",
                          encoding="utf-8") as rf:
                    rf.write(text)
            root = pr.agent_policy(text, "/")
            row.update(root_applicable=root["applicable"], root_uncertain=root["uncertain"],
                       root_recorded=root["recorded"], root_signals=root["signals"],
                       exauser_group=bool(pr.rules_for(pr.parse_groups(text), "exauser")))
        verdicts = {}
        for client in sorted(c for c in info["clients"] if c != "listed") or ["scripts"]:
            for path in sorted(info["paths"] | {"/"}):
                if st.robots.startswith("disallow-all"):
                    verdicts[f"{client} {path}"] = ["disallow-all", st.robots]
                elif text:
                    v, detail = classify(text, path, client)
                    if v != "allowed" or path == "/":
                        verdicts[f"{client} {path}"] = [v, detail]
                elif path == "/":
                    verdicts[f"{client} {path}"] = ["allowed", st.robots]
        row["verdicts"] = verdicts
        rows.append(row)
    with open(a.out, "w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    restricted = [r for r in rows if any(v[0] != "allowed" for v in r["verdicts"].values())]
    print(f"robots-applicability-audit: {len(rows)} origins, {len(reader.requests)} robots.txt requests, "
          f"{len(restricted)} with a non-allowed path under D-030", file=sys.stderr)
    for r in restricted:
        bad = {k: v for k, v in r["verdicts"].items() if v[0] != "allowed"}
        print(f"{r['origin']} {r['codes']}: {json.dumps(bad, ensure_ascii=False)[:600]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
