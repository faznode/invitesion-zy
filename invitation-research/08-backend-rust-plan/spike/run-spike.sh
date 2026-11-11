#!/usr/bin/env bash
# run-spike.sh <result-set> next|next-min|rust — reseed the fake data, then run the three k6 scenarios against ONE target
# with per-second CPU/RSS sampling and a database consistency snapshot after each scenario.
#
#   bash run-spike.sh s09-20261103 next
#
# Prerequisites: local-stack.sh Postgres (127.0.0.1:5433, db invitesion, data dir $WORK/pgdata); the target listening
# (next / next-min: local-stack.sh start on :3100 with spike/next-min copied into the snapshot; rust: :3200); nothing
# else under load. Writes results/<set>/<target>-<scenario>-{k6.json,k6.txt,proc.json,proc.txt,db.json,status.json}.
#
# Session 09 rules: the database identity is verified before seeding; a scenario counts only if k6 exits 0 (its
# thresholds encode validity) AND the sampler saw the server and produced plausible values; any failed scenario makes
# this script exit 1 and is marked FAILED in its status file, so a wrapper reaching its last line proves nothing.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
K6=${K6:-/vercel/share/work/tools/k6}
PGURL=${SPIKE_PG:-postgres://postgres@127.0.0.1:5433/invitesion}
EXPECTED_DB=${SPIKE_EXPECTED_DB:-invitesion|127.0.0.1|5433|/vercel/share/work/pgdata}
SET=${1:?usage: run-spike.sh <result-set> next|next-min|rust}
TARGET=${2:?usage: run-spike.sh <result-set> next|next-min|rust}
OUT=$HERE/results/$SET
case "$TARGET" in
  next) BASE=http://127.0.0.1:3100; PREFIX=''; SERVER='cwd:/vercel/share/work/app'; IDLE='idle-rust=invitesion-spike' ;;
  next-min) BASE=http://127.0.0.1:3100; PREFIX='/spike-min'; SERVER='cwd:/vercel/share/work/app'; IDLE='idle-rust=invitesion-spike' ;;
  rust) BASE=http://127.0.0.1:3200; PREFIX=''; SERVER='invitesion-spike'; IDLE='idle-next=cwd:/vercel/share/work/app' ;;
  *) echo "unknown target $TARGET"; exit 2 ;;
esac
mkdir -p "$OUT"
cd "$HERE"

{
  echo "captured=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host_cores=$(nproc) mem_total_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo) kernel=$(uname -r)"
  echo "k6=$("$K6" version 2>&1 | head -1)"
  echo "postgres=$(psql "$PGURL" -Atc 'SHOW server_version' 2>&1) max_connections=$(psql "$PGURL" -Atc 'SHOW max_connections' 2>&1)"
  echo "node=$(node -v 2>&1)"
  echo "next=$(node -p "require('/vercel/share/work/app/node_modules/next/package.json').version" 2>&1) build_id=$(cat /vercel/share/work/app/.next/BUILD_ID 2>&1)"
  echo "next_min_routes=$([ -f "/vercel/share/work/app/app/spike-min/i/[slug]/[guestSlug]/route.ts" ] && echo present || echo absent)"
  echo "next_db_pool=${POSTGRES_POOL_MAX:-10 (lib/db/drizzle.ts default)}"
  echo "rustc=$(RUSTUP_HOME=${RUSTUP_HOME:-/vercel/share/work/tools/rustup} CARGO_HOME=${CARGO_HOME:-/vercel/share/work/tools/cargo} /vercel/share/work/tools/cargo/bin/rustc --version 2>&1 | head -1) binary_sha256_16=$(sha256sum /vercel/share/work/spike-target/release/invitesion-spike 2>/dev/null | cut -c1-16)"
  echo "rust_server_log=$(head -1 /vercel/share/work/logs/s09-rust-spike.log 2>/dev/null)"
  echo "platform_next_dev_procs=$(pgrep -fc 'next dev' || true)"
} > "$OUT/$TARGET-env.txt"

identity=$(psql "$PGURL" -Atc "SELECT current_database() || '|' || host(inet_server_addr()) || '|' || current_setting('port') || '|' || current_setting('data_directory')" 2>&1)
if [ "$identity" != "$EXPECTED_DB" ]; then
  echo "refusing to seed: database identity '$identity' != '$EXPECTED_DB'"; exit 2
fi
psql "$PGURL" -Atc "SELECT 1 FROM invitations WHERE slug = 'budi-sari'" | grep -q 1 || { echo "fixture invitation budi-sari missing"; exit 2; }
psql "$PGURL" -q -v ON_ERROR_STOP=1 -f "$HERE/seed-spike-guests.sql" > "$OUT/$TARGET-seed.txt" 2>&1 || { echo "seed failed (see $OUT/$TARGET-seed.txt)"; exit 2; }
psql "$PGURL" -At -f "$HERE/db-snapshot.sql" > "$OUT/$TARGET-seeded-db.json"
echo "seeded: $(cat "$OUT/$TARGET-seeded-db.json")"

page=$(curl -s -w '\n%{http_code}' "$BASE$PREFIX/i/budi-sari/tamu-001")
[ "$(tail -1 <<< "$page")" = 200 ] && grep -q 'Kepada' <<< "$page" || { echo "$TARGET not ready at $BASE$PREFIX"; exit 1; }
echo "warm-up: 30 sequential reads (curl, not measured)"
for i in $(seq 1 30); do curl -s -o /dev/null "$BASE$PREFIX/i/budi-sari/tamu-$(printf %03d "$i")"; done
sleep 3

failed=()
for SC in read-spike rsvp-burst fixed-read; do
  done_file="$OUT/.$TARGET-$SC.k6-done"
  rm -f "$done_file"
  started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  python3 -B "$HERE/sample-proc.py" --out "$OUT/$TARGET-$SC-proc.json" --seconds 150 --until-file "$done_file" \
    --group server="$SERVER" --group postgres=postgres --group platform-dev='cwd:/vercel/share/v0-project' \
    --group k6='k6 run' --group "$IDLE" > "$OUT/$TARGET-$SC-proc.txt" 2>&1 &
  sampler=$!
  sleep 1
  "$K6" run -q -e TARGET="$TARGET" -e BASE="$BASE" -e SCENARIO="$SC" --summary-export "$OUT/$TARGET-$SC-k6.json" \
    "$HERE/k6/spike.js" > "$OUT/$TARGET-$SC-k6.txt" 2>&1
  k6_exit=$?
  touch "$done_file"
  wait "$sampler"
  sampler_exit=$?
  rm -f "$done_file"
  ended=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  sleep 3
  psql "$PGURL" -At -f "$HERE/db-snapshot.sql" > "$OUT/$TARGET-$SC-db.json"
  server_seen=$(python3 -B -c "import json,sys; print(json.load(open(sys.argv[1]))['summary']['server']['max_pids'])" "$OUT/$TARGET-$SC-proc.json" 2>/dev/null || echo 0)
  ok=true
  [ "$k6_exit" -eq 0 ] || ok=false
  [ "$sampler_exit" -eq 0 ] || ok=false
  [ "${server_seen:-0}" -gt 0 ] || ok=false
  printf '{"target":"%s","scenario":"%s","started":"%s","ended":"%s","k6_exit":%d,"sampler_exit":%d,"server_pids_seen":%d,"ok":%s}\n' \
    "$TARGET" "$SC" "$started" "$ended" "$k6_exit" "$sampler_exit" "${server_seen:-0}" "$ok" > "$OUT/$TARGET-$SC-status.json"
  echo "$SC: k6 exit $k6_exit, sampler exit $sampler_exit, server pids $server_seen -> $([ "$ok" = true ] && echo OK || echo FAILED)"
  cat "$OUT/$TARGET-$SC-proc.txt"
  echo "db: $(cat "$OUT/$TARGET-$SC-db.json")"
  [ "$ok" = true ] || failed+=("$SC")
  sleep 5
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED scenarios for $TARGET: ${failed[*]}"; exit 1
fi
echo "all scenarios valid for $TARGET"
