#!/usr/bin/env bash
# checkpoint.sh — archive the project's committable files (research-git view: .gitignore and global excludes honoured)
# and a binary patch since the base commit, as a download when platform synchronisation cannot be verified.
# Uses a throw-away index: never touches the project's files or the research git's own index. Kept in the repo since
# s26 (the s24 / s25 copy lived under /vercel/share/work and was lost with the sandbox).
#   LABEL=s26 BASE=2a6015f bash invitation-research/_tools/ops/checkpoint.sh
set -euo pipefail
LABEL=${LABEL:?set LABEL, e.g. LABEL=s26}
PROJECT=${PROJECT:-/vercel/share/v0-project}
GITDIR=${GITDIR:-/vercel/share/work/invitesion.git}
BASE=${BASE:-2a6015f}
OUT=${OUT:-/vercel/share/artifacts/invitesion-$LABEL}
mkdir -p "$OUT"
export GIT_INDEX_FILE
GIT_INDEX_FILE=$(mktemp -u /tmp/ckpt-index.XXXXXX)
G="git --git-dir=$GITDIR --work-tree=$PROJECT"
$G read-tree HEAD
$G add -A
TREE=$($G write-tree)
LIST=$(mktemp /tmp/ckpt-list.XXXXXX)
$G ls-files -z > "$LIST"
N=$(tr -cd '\0' < "$LIST" | wc -c)
ARCHIVE="$OUT/invitesion-$LABEL-worktree.tar.gz"
PATCH="$OUT/invitesion-$LABEL-since-$BASE.patch"
tar -C "$PROJECT" --null -T "$LIST" -czf "$ARCHIVE"
A=$(tar -tzf "$ARCHIVE" | wc -l)
$G diff --cached --binary "$BASE" > "$PATCH"
STAT=$($G diff --cached --shortstat "$BASE")
echo "checkpoint: $N entries listed, $A archived; tree $TREE; since $BASE:$STAT"
echo "checkpoint: sha256 $(sha256sum "$ARCHIVE" | cut -c1-16)… size $(du -h "$ARCHIVE" | cut -f1); patch $(wc -l < "$PATCH") lines"
