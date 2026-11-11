#!/usr/bin/env bash
# Sequential, resumable capture batch (sequential on purpose: parallel Lighthouse runs share CPU and
# inflate TBT/LCP, which would make competitor and Invitesion numbers incomparable).
#   bash run-batch.sh queue.tsv            # queue.tsv: id<TAB>competitor<TAB>kind<TAB>url[<TAB>profile]
# Skips IDs whose summary already exists with a successful Lighthouse run (R10 resumability).
# s13: optional 5th column = capture profile (capture-profile.mjs; default v1-412); competitor "invitesion" = own page (--own).
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
RESEARCH=$(cd "$HERE/../.." && pwd)
NODE=${REA_NODE:-/vercel/share/work/tools/node-v24.22.2-linux-x64/bin/node}
export INVITESION_PRIVATE_DIR=${INVITESION_PRIVATE_DIR:-/vercel/share/work/invitesion-private}
QUEUE=${1:?queue.tsv required}
while IFS=$'\t' read -r id competitor kind url profile; do
  [[ -z "${id:-}" || "$id" == \#* ]] && continue
  summary="$RESEARCH/raw/$competitor/$id.json"
  if [[ -f "$summary" ]] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if (d.get('lighthouse') or {}).get('ok') else 1)" "$summary" 2>/dev/null; then
    echo "{\"id\":\"$id\",\"skipped\":\"already captured\"}"
    continue
  fi
  extra=()
  [[ "$kind" == demo ]] && extra+=(--open-cover)
  [[ -n "${profile:-}" ]] && extra+=(--profile "$profile")
  [[ "$competitor" == invitesion ]] && extra+=(--own)
  timeout 420 "$NODE" "$RESEARCH/_tools/capture/capture.mjs" --id "$id" --competitor "$competitor" --kind "$kind" --url "$url" --lighthouse "${extra[@]}" < /dev/null 2>&1 | grep -E '^\{' | tail -1 || echo "{\"id\":\"$id\",\"error\":\"capture failed or timed out\"}"
done < "$QUEUE"
echo "{\"batch\":\"done\",\"queue\":\"$(basename "$QUEUE")\"}"
