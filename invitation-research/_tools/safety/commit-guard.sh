#!/usr/bin/env bash
# Run before every research commit. Fails loudly if private material could be committed.
# Why: on 2026-10-29 the hosting sandbox replaced .gitignore with its own template and five
# _private files were committed (incident log: invitation-research/_progress.md, Q-D06).
#   GIT="git --git-dir=/vercel/share/work/invitesion.git --work-tree=." bash commit-guard.sh
set -euo pipefail
GIT=${GIT:-git}
fail() { echo "commit-guard: FAIL — $*" >&2; exit 1; }

for rule in 'invitation-research/_private' '.env' '*.pem' '/.clerk/'; do
  grep -qxF "$rule" .gitignore || fail ".gitignore lost rule '$rule' (sandbox may have rewritten it)"
done
$GIT check-ignore -q invitation-research/_private/probe.txt || fail "_private is not ignored"
tracked=$($GIT ls-files -- invitation-research/_private | wc -l)
[ "$tracked" -eq 0 ] || fail "$tracked file(s) under invitation-research/_private are tracked"
staged_private=$($GIT diff --cached --name-only --diff-filter=ACMR | grep -E '(^|/)_private/|\.env$|\.pem$' || true)
[ -z "$staged_private" ] || fail "staged private-looking files: $staged_private"
raw_kb=$(du -sk invitation-research/raw 2>/dev/null | cut -f1 || echo 0)
[ "${raw_kb:-0}" -lt 51200 ] || fail "invitation-research/raw is ${raw_kb} KB (limit 50 MB, R7)"
big=$($GIT diff --cached --name-only --diff-filter=ACMR | while read -r f; do [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt 5242880 ] && echo "$f"; done || true)
[ -z "$big" ] || fail "staged files over 5 MB: $big"
SAFETY=$(dirname "$0")
python3 -B "$SAFETY/redact-discovery.py" --check > /dev/null || fail "customer-showcase links in discovery files (run redact-discovery.py)"
python3 -B "$SAFETY/pseudonymize-slugs.py" --check > /dev/null || fail "identifying URL slugs in committed files (run pseudonymize-slugs.py)"
python3 -B "$SAFETY/redact-demo-names.py" --check > /dev/null || fail "demo-couple names in pseudonymized captures (run redact-demo-names.py, D-017)"
python3 -B "$SAFETY/../capture/eligibility.py" --check > /dev/null || fail "benchmark-exclusions.csv or a capture has eligibility errors (run eligibility.py --check, D-023)"
echo "commit-guard: OK (private material ignored, no showcase links, identifying slugs or demo names, exclusion register valid, raw/ ${raw_kb} KB)"
