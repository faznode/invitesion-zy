#!/usr/bin/env python3
"""Static vetting pass for third-party agent skills (protocol in SKILLS-LOCK.md).

For each skill directory it inventories every file and flags lines that match
risk classes from the vetting protocol:

  exec      downloads/executes code, shells out, installs packages
  secrets   reads environment variables, tokens, credential files
  global    touches global agent config, hooks, permission bypasses
  injection hidden unicode, "ignore previous instructions"-style text
  net       network access (summarised by domain; noisy by nature)
  blob      long base64-like blobs that could hide payloads

The scanner narrows manual review; it does not replace it. Every flagged line is
read by a human/agent before a skill is approved, stripped, or rejected.

Usage: vet-skills.py <manifest.tsv> <out.json>
  manifest columns: id <TAB> repo_dir <TAB> skill_subdir
"""
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

TEXT_SUFFIXES = {".md", ".mdx", ".txt", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sh", ".bash",
                 ".zsh", ".json", ".yaml", ".yml", ".toml", ".csv", ".html", ".css", ".ps1", ".rb", ".go", ""}
RULES = {
    "exec": r"\bsubprocess\b|\bos\.system\b|\beval\(|\bexec\(|child_process|\bspawn(Sync)?\(|\bexecSync\b|\|\s*(?:ba)?sh\b|\bnpx\s+-y\b|\bpip3? install\b|\bnpm (?:i|install)\b|\bbunx?\b|\buvx?\b|curl[^\n|]*\|\s*(?:ba)?sh|Invoke-Expression|\biex\b",
    "secrets": r"process\.env|os\.environ|\bgetenv\b|\.env\b|API_KEY|_TOKEN\b|SECRET|~/\.ssh|~/\.aws|\bcredentials?\b|keychain",
    "global": r"~/\.claude|~/\.codex|~/\.cursor|~/\.config|\.claude/settings|settings\.json|\bhooks?\b.*\b(pre|post)|--dangerously|skip-permissions|bypassPermissions|\$HOME/\.",
    "injection": r"(?i)ignore (?:all |any )?(?:previous|prior|above) instructions|do not (?:tell|inform|mention to) the user|without (?:asking|telling) the user|disable (?:the )?safety|reveal (?:your|the) system prompt|[\u200b-\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069]",
    "blob": r"[A-Za-z0-9+/]{240,}={0,2}",
}
URL_RE = re.compile(r"https?://[^\s)\"'<>`]+")


def git_meta(repo: Path) -> dict:
    def run(*args):
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True).stdout.strip()
    return {"sha": run("rev-parse", "HEAD"), "commit_date": run("log", "-1", "--format=%cs"),
            "remote": run("remote", "get-url", "origin")}


def find_license(repo: Path, skill: Path) -> str:
    for base in (skill, repo):
        for path in sorted(base.glob("*")):
            if path.is_file() and re.match(r"(?i)^(license|licence|copying)", path.name):
                head = path.read_text(errors="ignore")[:400]
                for name in ("MIT License", "Apache License", "BSD", "Mozilla Public", "GNU", "CC0", "Creative Commons", "ISC"):
                    if name.lower() in head.lower():
                        scope = "skill" if base == skill else "repo"
                        return f"{name} ({scope}:{path.name})"
                return f"custom ({path.name})"
    return "NONE FOUND"


def scan_skill(skill_id: str, repo: Path, skill: Path) -> dict:
    files, sizes, scripts, binaries = [], 0, [], 0
    hits = {k: [] for k in RULES}
    domains = Counter()
    for path in sorted(p for p in skill.rglob("*") if p.is_file()):
        rel = str(path.relative_to(skill))
        size = path.stat().st_size
        sizes += size
        files.append(rel)
        if path.suffix in {".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".bash", ".ps1", ".rb"}:
            scripts.append(rel)
        if path.suffix.lower() not in TEXT_SUFFIXES or size > 3_000_000:
            binaries += 1
            continue
        text = path.read_text(errors="ignore")
        for number, line in enumerate(text.splitlines(), 1):
            for url in URL_RE.findall(line):
                try:
                    domains[urlparse(url).netloc] += 1
                except ValueError:
                    domains["<unparseable>"] += 1
            for rule, pattern in RULES.items():
                if re.search(pattern, line):
                    if len(hits[rule]) < 60:
                        hits[rule].append(f"{rel}:{number}: {line.strip()[:160]}")
    skill_md = (skill / "SKILL.md").read_text(errors="ignore") if (skill / "SKILL.md").exists() else ""
    front = re.match(r"---\n(.*?)\n---", skill_md, re.S)
    name = re.search(r"^name:\s*(.+)$", front.group(1), re.M).group(1).strip() if front else "?"
    return {
        "id": skill_id, **git_meta(repo), "path": str(skill.relative_to(repo)), "name": name,
        "license": find_license(repo, skill), "files": len(files), "bytes": sizes, "binaries": binaries,
        "scripts": scripts, "skill_md_lines": len(skill_md.splitlines()),
        "hit_counts": {k: len(v) for k, v in hits.items()}, "hits": hits,
        "domains": domains.most_common(15),
    }


def main() -> None:
    manifest, out = Path(sys.argv[1]), Path(sys.argv[2])
    results = []
    for line in manifest.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        skill_id, repo_dir, sub = line.split("\t")
        repo = Path(repo_dir)
        results.append(scan_skill(skill_id, repo, repo / sub))
    out.write_text(json.dumps(results, indent=1, ensure_ascii=False))
    for r in results:
        c = r["hit_counts"]
        print(f"{r['id']:34} {r['license'][:30]:30} files={r['files']:4} kb={r['bytes']//1024:5} scripts={len(r['scripts']):3} "
              f"exec={c['exec']:2} sec={c['secrets']:2} glob={c['global']:2} inj={c['injection']:2} blob={c['blob']:2} sha={r['sha'][:10]} {r['commit_date']}")


if __name__ == "__main__":
    main()
