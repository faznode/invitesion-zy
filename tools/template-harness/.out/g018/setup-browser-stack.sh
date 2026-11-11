#!/usr/bin/env bash
# Scratch (git-ignored): a production build of the work tree with the REAL proxy and a cookie Clerk stub, on a fresh
# database, for G-018's browser acceptance. Real Clerk stays DA-01 item 16.
set -euo pipefail
PROJECT=/vercel/share/v0-project
W=/vercel/share/work
B=$W/s49-browser
APP=$B/app
DB=s49_browser
export POSTGRES_URL=postgres://postgres@127.0.0.1:5433/$DB
export NEXT_TELEMETRY_DISABLED=1
mkdir -p "$B" "$W/logs"
cd "$PROJECT"

echo "sync"; APP=$APP bash invitation-research/_tools/ops/local-stack.sh sync
echo "deps"; APP=$APP bash invitation-research/_tools/ops/local-stack.sh deps

echo "clerk stub"
REAL=$(readlink -f "$APP/node_modules/@clerk/nextjs")
rm "$APP/node_modules/@clerk/nextjs"
mkdir -p "$APP/node_modules/@clerk/nextjs"
cp tools/template-harness/.out/g018/clerk-stub/{package.json,index.js,server.js} "$APP/node_modules/@clerk/nextjs/"
printf "export * from '%s/dist/types/index';\n" "$REAL" > "$APP/node_modules/@clerk/nextjs/index.d.ts"
printf "export * from '%s/dist/types/server/index';\n" "$REAL" > "$APP/node_modules/@clerk/nextjs/server.d.ts"

echo "database"
psql -h 127.0.0.1 -p 5433 -U postgres -qAt -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB" > /dev/null
(cd "$APP" && pnpm db:migrate > "$W/logs/s49-migrate.log" 2>&1)
(cd "$APP" && pnpm db:seed:templates > "$W/logs/s49-seed-templates.log" 2>&1)
(cd "$APP" && npx tsx invitation-research/_tools/setup/seed-local-demo.ts > "$W/logs/s49-seed-demo.log" 2>&1)

echo "tone"
(cd "$APP" && npx tsx tools/template-harness/cover-gate.ts --write-tone public/review/tone.wav > /dev/null)

echo "review fixture"
(cd "$APP" && npx tsx invitation-research/_tools/setup/seed-family-review.ts --ceremony --programme --questions --profiles \
  --music-url http://127.0.0.1:3100/review/tone.wav \
  --match '^review-(gapura|kartu|riang|lontar|legacy)-(full|aqiqah|khitanan|tasyakuran|programme|questions|music|birthday|expired)$' \
  > "$W/logs/s49-seed-review.log" 2>&1)

echo "stub users and pass opt-in"
psql "$POSTGRES_URL" -qAt <<'SQL'
UPDATE users SET clerk_user_id = 'user_s49_owner' WHERE email = 'demo.owner@example.test';
INSERT INTO users (email, name, clerk_user_id) VALUES ('other.customer@example.test', 'Pelanggan Lain (fiktif)', 'user_s49_other')
  ON CONFLICT (email) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id;
UPDATE invitations SET config = jsonb_set(config, '{checkInSettings}', '{"enabled": true}'::jsonb)
  WHERE slug IN ('review-gapura-full', 'review-legacy-full', 'review-kartu-aqiqah');
UPDATE invitation_versions v SET config = i.config FROM invitations i
  WHERE v.invitation_id = i.id AND v.is_live AND i.slug IN ('review-gapura-full', 'review-legacy-full', 'review-kartu-aqiqah');
SQL
psql "$POSTGRES_URL" -qAt -c "SELECT count(*) || ' invitations, ' || (SELECT count(*) FROM guests) || ' guests, ' || (SELECT count(*) FROM templates) || ' templates' FROM invitations"

echo "build (real proxy, stubbed Clerk)"
(
  cd "$APP"
  export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_$(printf 'clerk.invitesion.invalid$' | base64 -w0)"
  export CLERK_SECRET_KEY=YOUR_CLERK_SECRET_KEY
  export NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
  pnpm build > "$W/logs/s49-build.log" 2>&1
)
echo "build id $(cat "$APP/.next/BUILD_ID")"
test -f "$APP/proxy.ts" && echo "proxy.ts kept in the build"
