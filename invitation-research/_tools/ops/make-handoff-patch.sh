#!/usr/bin/env bash
# make-handoff-patch.sh — owner handoff patch + manifest, built from a TEMPORARY index of the research git.
#   bash invitation-research/_tools/ops/make-handoff-patch.sh <base-commit> <out.patch>
# Never touches the real index, the platform's project .git, or any file. Honours .gitignore and additionally
# drops .clerk/, .env*, storage/ and _private/ even if a rewritten .gitignore stopped ignoring them.
# Verification: the patch is applied to a fresh index of <base>; the resulting tree must equal the tree
# built from the working copy (exit 1 otherwise). Prints the manifest the session record needs.
set -euo pipefail
PROJECT=${PROJECT:-/vercel/share/v0-project}
GIT_DIR_RESEARCH=${GIT_DIR_RESEARCH:-/vercel/share/work/invitesion.git}
BASE=${1:?usage: make-handoff-patch.sh <base-commit> <out.patch>}
OUT=${2:?usage: make-handoff-patch.sh <base-commit> <out.patch>}
G="git --git-dir=$GIT_DIR_RESEARCH --work-tree=$PROJECT"
TMP=$(mktemp -d /tmp/handoff.XXXXXX)
trap 'rm -f "$TMP"/index "$TMP"/verify-index; rmdir "$TMP" 2>/dev/null || true' EXIT
cd "$PROJECT"

export GIT_INDEX_FILE="$TMP/index"
$G read-tree "$BASE"
$G add -A -- .
for p in .clerk .env .env.local storage invitation-research/_private; do
  $G rm -r -q --cached --ignore-unmatch -- "$p" > /dev/null
done
forbidden=$($G diff --cached --name-only "$BASE" | grep -E '(^|/)(_private|node_modules|\.clerk|\.next)/|(^|/)\.env($|\.)|\.pem$' || true)
[ -z "$forbidden" ] || { echo "make-handoff-patch: FAIL — forbidden paths staged: $forbidden" >&2; exit 1; }
big=$($G diff --cached --name-only --diff-filter=ACMR "$BASE" | while read -r f; do [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt 5242880 ] && echo "$f"; done || true)
[ -z "$big" ] || { echo "make-handoff-patch: FAIL — files over 5 MB: $big" >&2; exit 1; }
TREE=$($G write-tree)
$G diff --cached --binary --full-index -M "$BASE" > "$OUT"

echo "base:        $($G rev-parse "$BASE")"
echo "result tree: $TREE"
echo "patch:       $OUT ($(stat -c %s "$OUT") bytes)"
echo "status counts (A added, M modified, D deleted, R renamed):"
$G diff --cached --name-status -M "$BASE" | cut -c1 | sort | uniq -c
echo "mode changes, non-644 new files, symlinks, renames (empty = none):"
$G diff --cached --summary -M "$BASE" | grep -E 'mode change|rename|create mode 1(00755|20000)' || true
$G diff --cached --raw "$BASE" | awk '$2 ~ /^120/ {print "  symlink: " $NF}'
$G diff --cached --shortstat "$BASE"
echo "paths:"
$G diff --cached --name-status -M "$BASE" | sed 's/^/  /'

export GIT_INDEX_FILE="$TMP/verify-index"
$G read-tree "$BASE"
git --git-dir="$GIT_DIR_RESEARCH" apply --cached --whitespace=nowarn "$OUT"
VERIFY=$(git --git-dir="$GIT_DIR_RESEARCH" write-tree)
if [ "$VERIFY" = "$TREE" ]; then
  echo "verified: applying the patch to $BASE reproduces tree $TREE"
else
  echo "make-handoff-patch: FAIL — patch on $BASE gives $VERIFY, expected $TREE" >&2
  exit 1
fi
