#!/usr/bin/env bash
# make-handoff-zips.sh — the two handoff archives the mission asks for after every phase.
#   source /vercel/share/work/tools/env.sh && bash invitation-research/_tools/ops/make-handoff-zips.sh [BASE]
# -> $OUT/invitesion-handoff.zip            new/changed files vs BASE (default 22ed99e = develop): no .git, node_modules,
#                                            _private/, or files > 5 MB
# -> $OUT/invitesion-handoff-manifest.txt   the file list that went into it
# -> $OUT/invitesion-private.zip            everything in $INVITESION_PRIVATE_DIR (secrets report, competitor thumbnails,
#                                            raw third-party evidence). Keep it out of every repo.
set -euo pipefail
PROJECT=${PROJECT:-/vercel/share/v0-project}
OUT=${OUT:-/vercel/share/artifacts}
BASE=${1:-22ed99e}
GIT="git --git-dir=${GIT_DIR_OUT:-/vercel/share/work/invitesion.git} --work-tree=$PROJECT"
PRIV=${INVITESION_PRIVATE_DIR:-/vercel/share/work/invitesion-private}
mkdir -p "$OUT"
cd "$PROJECT"

manifest="$OUT/invitesion-handoff-manifest.txt"
{ $GIT diff --name-only --diff-filter=ACMR "$BASE" --; $GIT ls-files --others --exclude-standard; } \
  | sort -u | grep -vE '(^|/)(_private|node_modules|\.git)(/|$)' \
  | while read -r f; do [ -f "$f" ] && [ "$(stat -c %s "$f")" -le 5242880 ] && echo "$f"; done > "$manifest"

zip -q -X "$OUT/.handoff.tmp.zip" -@ < "$manifest"
mv "$OUT/.handoff.tmp.zip" "$OUT/invitesion-handoff.zip"

if [ -d "$PRIV" ] && [ -n "$(ls -A "$PRIV")" ]; then
  (cd "$PRIV" && zip -q -r -X "$OUT/.private.tmp.zip" .)
  mv "$OUT/.private.tmp.zip" "$OUT/invitesion-private.zip"
fi

echo "handoff: $(wc -l < "$manifest") files, $(du -h "$OUT/invitesion-handoff.zip" | cut -f1) (base $BASE)"
[ -f "$OUT/invitesion-private.zip" ] && echo "private: $(unzip -Z1 "$OUT/invitesion-private.zip" | grep -vc '/$') files, $(du -h "$OUT/invitesion-private.zip" | cut -f1)"
echo "manifest: $manifest"
