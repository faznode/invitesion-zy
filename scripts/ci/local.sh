#!/usr/bin/env bash
# scripts/ci/local.sh: run the five sandbox release-check jobs before transfer (B-020, ADR-O13).
# Each job that builds or writes a database runs in a disposable copy of the project with a fresh database, so the
# project folder (served by the platform's dev server from its own .next) and the working database are never touched.
#   bash scripts/ci/local.sh research|app|database|product-gates|rust|all
# Needs: Postgres on 127.0.0.1:$PGPORT (local-stack.sh pg), the tools from bootstrap-sandbox.sh (Chrome, Lighthouse)
# and, for the Rust job, rustup under $WORK/rust. Logs: $WORK/logs/ci-<job>.log.
set -euo pipefail
PROJECT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${WORK:-/vercel/share/work}
COPY=${CI_COPY:-$WORK/ci-app}
PGPORT=${PGPORT:-5433}
CI_DB=${CI_DB:-invitesion_ci}
LOGS=$WORK/logs
mkdir -p "$LOGS"

if [ -f "$WORK/tools/env.sh" ]; then . "$WORK/tools/env.sh"; fi
if [ -d "$WORK/rust/cargo/bin" ]; then
  export RUSTUP_HOME=$WORK/rust/rustup CARGO_HOME=$WORK/rust/cargo PATH=$WORK/rust/cargo/bin:$PATH
fi
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$WORK/rust/target}
export CI_OUT=${CI_OUT:-$WORK/ci-out}

sync_copy() {
  mkdir -p "$COPY"
  find "$COPY" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  (cd "$PROJECT" && tar --exclude=./node_modules --exclude=./.next --exclude=./.git \
    --exclude=./invitation-research/_private -cf - .) | (cd "$COPY" && tar -xf -)
  (cd "$COPY" && CI=true pnpm install --frozen-lockfile --prefer-offline > "$LOGS/ci-install.log" 2>&1) \
    || { echo "install failed (see $LOGS/ci-install.log)"; return 1; }
}

fresh_db() {
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -qAt -c "DROP DATABASE IF EXISTS $CI_DB WITH (FORCE)" -c "CREATE DATABASE $CI_DB" > /dev/null
  export POSTGRES_URL="postgres://postgres@127.0.0.1:$PGPORT/$CI_DB"
}

run_job() {
  local job=$1 log="$LOGS/ci-$1.log" started=$SECONDS code=0
  rm -rf "${CI_OUT:?}/$job"
  case $job in
    research)
      (cd "$PROJECT" && GIT="git --git-dir=$WORK/invitesion.git --work-tree=$PROJECT" CI_OUT="$CI_OUT/$job" \
        bash scripts/ci/research.sh) > "$log" 2>&1 || code=$?
      ;;
    app)
      sync_copy && (cd "$COPY" && CI=true CI_OUT="$CI_OUT/$job" bash scripts/ci/app.sh) > "$log" 2>&1 || code=$?
      ;;
    database | product-gates | rust)
      sync_copy && fresh_db && (cd "$COPY" && CI=true CI_OUT="$CI_OUT/$job" bash "scripts/ci/$job.sh") > "$log" 2>&1 || code=$?
      ;;
    *) echo "usage: $0 research|app|database|product-gates|rust|all" >&2; return 2 ;;
  esac
  grep '^ci: ' "$log" || true
  printf 'job %-14s %s in %ss (log %s)\n' "$job" "$([ "$code" = 0 ] && echo PASS || echo "FAIL ($code)")" $((SECONDS - started)) "$log"
  return "$code"
}

if [ "${1:-}" = "all" ]; then
  failed=0
  for job in research app database rust product-gates; do run_job "$job" || failed=1; done
  exit "$failed"
fi
run_job "${1:-}"
