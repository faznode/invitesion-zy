#!/usr/bin/env bash
# local-stack.sh — run Invitesion locally for measurement, tests and harness work: production build + Postgres 16.
# Builds from a snapshot copy ($APP) so it never fights the platform's `next dev` over the project's .next/ and
# node_modules/. Idempotent; secrets are never written to disk (placeholder Clerk keys live only in the child env).
#
#   bash invitation-research/_tools/ops/local-stack.sh pg      # install + init + start Postgres 16 on 127.0.0.1:5433 (trust, db invitesion)
#   bash invitation-research/_tools/ops/local-stack.sh sync    # copy the project into $APP (no node_modules/.next/research raw data)
#   bash invitation-research/_tools/ops/local-stack.sh deps    # CI=true pnpm install --frozen-lockfile in $APP
#   bash invitation-research/_tools/ops/local-stack.sh db      # migrate + seed 64 templates + fixture (2 invitations x 5 stress guests)
#   bash invitation-research/_tools/ops/local-stack.sh build   # production build with a production-mode placeholder Clerk key
#   bash invitation-research/_tools/ops/local-stack.sh start   # foreground `next start -p 3100` -> run it as a BACKGROUND task
#   bash invitation-research/_tools/ops/local-stack.sh verify  # typecheck + unit tests in $APP (after sync + deps)
#   bash invitation-research/_tools/ops/local-stack.sh up      # pg + sync + deps + db + build (then run `start` in the background)
#   bash invitation-research/_tools/ops/local-stack.sh check
#
# Guest pages after `start`: http://127.0.0.1:3100/i/budi-sari/<guest> and /i/dimas-laras-makassar/<guest>, guests:
# budi-hartono, nama-panjang, hostile-name, rtl-name, emoji-name (fixture: _tools/setup/seed-local-demo.ts).
set -uo pipefail

WORK=${WORK:-/vercel/share/work}
PROJECT=${PROJECT:-/vercel/share/v0-project}
APP=${APP:-$WORK/app}
PGDATA=${PGDATA:-$WORK/pgdata}
PGPORT=${PGPORT:-5433}
APP_PORT=${APP_PORT:-3100}
LOGS=$WORK/logs
export POSTGRES_URL=${POSTGRES_URL:-postgres://postgres@127.0.0.1:$PGPORT/invitesion}
export NEXT_TELEMETRY_DISABLED=1
mkdir -p "$WORK" "$LOGS"

placeholder_env() {
  # pk_live_ = base64("<frontend api>$"). A pk_test_ key makes Clerk bounce every browser navigation through a dev
  # handshake (quality-audit H-INV-005), so the measured page would not be what a production guest receives.
  export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_$(printf 'clerk.invitesion.invalid$' | base64 -w0)"
  # Supply real credentials through the environment; this fallback is a non-secret marker.
  export CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-YOUR_CLERK_SECRET_KEY}"
  export NEXT_PUBLIC_APP_URL="http://127.0.0.1:$APP_PORT"
}

measurement_middleware() {
  # s06 finding (P-INV-010): with placeholder Clerk keys, the production build's clerkMiddleware never answers the
  # first middleware-matched request (100 % CPU, RSS +570 MB in 15 s; same with a resolvable frontend-API host).
  # Without real keys we therefore build the snapshot WITHOUT middleware.ts (copy only, product code untouched).
  # Effect on measurements: no CSP header, no `locale` cookie, no Clerk headers; page payload is unchanged.
  # Set KEEP_MIDDLEWARE=1 when real Clerk keys are available. Next 16 names the file proxy.ts (F-01); either is set aside.
  if [ "${KEEP_MIDDLEWARE:-0}" != "1" ]; then
    for file in middleware.ts proxy.ts; do
      if [ -f "$APP/$file" ]; then
        mv "$APP/$file" "$APP/.$file.measurement-off"
        echo "build: measurement variant ($file set aside in $APP only)"
      fi
    done
  fi
}

step_pg() {
  if ! command -v pg_ctl > /dev/null 2>&1; then
    sudo dnf install -y -q postgresql16 postgresql16-server > "$LOGS/pg-dnf.log" 2>&1 || { echo "pg: dnf FAILED (see $LOGS/pg-dnf.log)"; return 1; }
  fi
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 > "$LOGS/pg-initdb.log" 2>&1 || { echo "pg: initdb FAILED"; return 1; }
  fi
  if ! pg_ctl -D "$PGDATA" status > /dev/null 2>&1; then
    pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$LOGS/postgres.log" -w start > /dev/null || { echo "pg: start FAILED"; return 1; }
  fi
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='invitesion'" | grep -q 1 \
    || createdb -h 127.0.0.1 -p "$PGPORT" -U postgres invitesion
  echo "pg: up on 127.0.0.1:$PGPORT ($(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc 'SHOW server_version'))"
}

step_sync() {
  mkdir -p "$APP"
  # Product code only: research evidence and handoff files are not needed to build or run the app.
  (cd "$PROJECT" && tar --exclude=./node_modules --exclude=./.next --exclude=./invitation-research/raw \
    --exclude=./invitation-research/_private --exclude=./.git -cf - .) | (cd "$APP" && tar -xf -)
  echo "sync: $PROJECT -> $APP"
}

step_deps() {
  (cd "$APP" && CI=true pnpm install --frozen-lockfile > "$LOGS/app-install.log" 2>&1) \
    && echo "deps: ok" || { echo "deps: FAILED (see $LOGS/app-install.log)"; return 1; }
}

step_db() {
  (cd "$APP" && pnpm db:migrate > "$LOGS/app-migrate.log" 2>&1) || { echo "db: migrate FAILED (see $LOGS/app-migrate.log)"; return 1; }
  (cd "$APP" && pnpm db:seed:templates > "$LOGS/app-seed-templates.log" 2>&1) || { echo "db: template seed FAILED"; return 1; }
  # The fixture insert is not idempotent and $PGDATA survives sandbox restarts, so seed it only once.
  if psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d invitesion -tAc "SELECT 1 FROM invitations WHERE slug = 'budi-sari'" 2>/dev/null | grep -q 1; then
    echo "db: fixture already present (budi-sari), not re-seeded"
  else
    (cd "$APP" && npx tsx invitation-research/_tools/setup/seed-local-demo.ts > "$LOGS/app-seed-demo.log" 2>&1) || { echo "db: fixture seed FAILED"; return 1; }
  fi
  echo "db: migrated + seeded ($(tail -1 "$LOGS/app-seed-templates.log" | cut -c1-80))"
}

step_build() {
  placeholder_env
  measurement_middleware
  (cd "$APP" && pnpm build > "$LOGS/app-build.log" 2>&1) && echo "build: ok" || { echo "build: FAILED (see $LOGS/app-build.log)"; return 1; }
}

step_start() {
  placeholder_env
  cd "$APP" && exec pnpm start -p "$APP_PORT" -H 127.0.0.1
}

step_verify() {
  (cd "$APP" && pnpm typecheck > "$LOGS/app-typecheck.log" 2>&1) && echo "typecheck: ok" || echo "typecheck: FAILED (see $LOGS/app-typecheck.log)"
  (cd "$APP" && pnpm test > "$LOGS/app-test.log" 2>&1) && echo "test: ok ($(grep -E '^# (pass|fail)' "$LOGS/app-test.log" | tr '\n' ' '))" || echo "test: FAILED (see $LOGS/app-test.log)"
}

step_check() {
  printf 'postgres: '; pg_ctl -D "$PGDATA" status > /dev/null 2>&1 && echo "up :$PGPORT" || echo down
  printf 'app copy: '; [ -f "$APP/package.json" ] && echo "$APP" || echo missing
  printf 'deps:     '; [ -d "$APP/node_modules/next" ] && echo installed || echo missing
  printf 'build:    '; [ -f "$APP/.next/BUILD_ID" ] && cat "$APP/.next/BUILD_ID" || echo missing
  printf 'server:   '; curl -s -m 5 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$APP_PORT/" || echo down
}

case "${1:-check}" in
  pg) step_pg ;;
  sync) step_sync ;;
  deps) step_deps ;;
  db) step_db ;;
  build) step_build ;;
  start) step_start ;;
  verify) step_verify ;;
  up) step_pg && step_sync && step_deps && step_db && step_build ;;
  check) step_check ;;
  *) echo "usage: $0 pg|sync|deps|db|build|start|verify|up|check"; exit 2 ;;
esac
