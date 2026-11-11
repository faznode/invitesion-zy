#!/usr/bin/env python3
"""Throwaway secrets scanner for the research run (rule R6).

Scans the working tree and the full git history for credential-shaped strings.
It never prints a secret: stdout gets counts only, and the detailed report
(file, line/commit, rule, SHA-256 fingerprint of the match) is written to
invitation-research/_private/secrets-report.md, which is git-ignored.

Usage:
  python3 secrets-scan.py --git-dir /path/to/.git --work-tree /path/to/repo
"""
import argparse
import hashlib
import os
import re
import subprocess
from pathlib import Path

RULES = {
    "private-key-block": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----",
    "aws-access-key-id": r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b",
    "stripe-secret": r"\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b",
    "stripe-webhook-secret": r"\bwhsec_[0-9a-zA-Z]{16,}\b",
    "clerk-secret": r"\bsk_(?:live|test)_[0-9a-zA-Z]{20,}\b",
    "github-token": r"\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}\b|\bgithub_pat_[0-9A-Za-z_]{40,}\b",
    "google-api-key": r"\bAIza[0-9A-Za-z_\-]{35}\b",
    "slack-token": r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b",
    "jwt": r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    "db-url-with-password": r"\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis)://[^\s:/@'\"]+:[^\s@'\"]{4,}@[^\s'\"]+",
    "generic-assignment": r"(?i)\b(?:secret|password|passwd|api[_-]?key|token)\b\s*[:=]\s*['\"][^'\"\s]{12,}['\"]",
}
# Values that are obviously placeholders or test vectors are reported separately.
PLACEHOLDER = re.compile(r"(?i)(example|placeholder|changeme|xxxx|your[_-]|dummy|test-vector|<|\$\{|process\.env)")
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".lock"}


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def scan_text(text: str):
    for rule, pattern in RULES.items():
        for match in re.finditer(pattern, text):
            yield rule, match.group(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--git-dir", required=True)
    parser.add_argument("--work-tree", required=True)
    parser.add_argument("--report", default=None)
    args = parser.parse_args()

    work_tree = Path(args.work_tree)
    report_path = Path(args.report or os.environ.get("INVITESION_PRIVATE_DIR", str(work_tree / "invitation-research/_private")) + "/secrets-report.md")
    git = ["git", f"--git-dir={args.git_dir}", f"--work-tree={args.work_tree}"]

    findings = []
    tracked = subprocess.run(git + ["ls-files"], capture_output=True, text=True, check=True).stdout.split()
    for rel in tracked:
        path = work_tree / rel
        if path.suffix.lower() in SKIP_SUFFIXES or not path.is_file():
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for number, line in enumerate(lines, 1):
            for rule, value in scan_text(line):
                kind = "placeholder" if PLACEHOLDER.search(line) else "candidate"
                findings.append(("tree", rel, str(number), rule, kind, fingerprint(value)))

    history = subprocess.run(git + ["log", "--all", "-p", "--no-color", "--format=COMMIT %H"], capture_output=True, text=True, errors="ignore").stdout
    commit, current_file = "?", "?"
    for line in history.splitlines():
        if line.startswith("COMMIT "):
            commit = line.split()[1][:10]
        elif line.startswith("+++ b/"):
            current_file = line[6:]
        elif line.startswith("+") and not line.startswith("+++"):
            if Path(current_file).suffix.lower() in SKIP_SUFFIXES:
                continue
            for rule, value in scan_text(line):
                kind = "placeholder" if PLACEHOLDER.search(line) else "candidate"
                findings.append(("history", current_file, commit, rule, kind, fingerprint(value)))

    unique = sorted(set(findings))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    rows = ["| scope | file | line/commit | rule | kind | sha256[:16] |", "|---|---|---|---|---|---|"]
    rows += [f"| {' | '.join(f)} |" for f in unique]
    report_path.write_text(
        "# Secrets scan (PRIVATE, git-ignored)\n\n"
        "Values are never stored; each match is identified by a SHA-256 prefix so it can be\n"
        "located and rotated without copying the secret.\n\n" + "\n".join(rows) + "\n",
        encoding="utf-8",
    )
    candidates = [f for f in unique if f[4] == "candidate"]
    print(f"findings={len(unique)} candidates={len(candidates)} placeholders={len(unique) - len(candidates)}")
    print("rules:", sorted({f[3] for f in candidates}))
    print(f"report: {report_path}")


if __name__ == "__main__":
    main()
