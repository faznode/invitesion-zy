#!/usr/bin/env bash
# CI job "rust" (B-020, ADR-A2): every Rust crate in the repository against a database migrated by drizzle-kit, the only
# migration owner. The service crate (R-01) must be formatted and lint-clean, build from its committed query metadata
# alone, keep its contract artifacts current, and serve its slices end to end through the Next.js call sites: views
# (R-02), RSVP (R-03) and wishes (R-04), with host idempotency keys bound to their owner (s29, D-046); the jobs binary
# carries B-031's purge, dry run and retention sweep across both languages, and delivers B-039's entitlement outbox after
# settlement through both writers, issuing G-050's receipts. The s26 feasibility experiment is frozen research and only
# has to keep passing.
#   POSTGRES_URL=postgres://…/scratch bash scripts/ci/rust.sh        # locally: bash scripts/ci/local.sh rust
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/ci/lib.sh
ci_require_database
export TEST_DATABASE_URL=${TEST_DATABASE_URL:-$POSTGRES_URL}

SERVICE=services/api
EXPERIMENT=invitation-research/08-backend-rust-plan/feasibility-s26
API_PORT=${API_PORT:-8090}
# The RSVP acceptance serves the owner-token JWKS itself (keys made per run, no Clerk credential) and needs limits low
# enough to reach their boundaries.
JWKS_PORT=${JWKS_PORT:-8091}
OWNER_ISSUER=https://clerk.invitesion.test
OWNER_PARTY=http://127.0.0.1:3100
RSVP_LIMIT_LINK=8
RSVP_LIMIT_IP=20
WISH_LIMIT_LINK=8
WISH_LIMIT_IP=20

API_PID=
API_SECRET=
API_BIN=
# B-024: the guest-pass secrets, per run; both are accepted, as during a rotation.
PASS_SECRET=
PASS_PREVIOUS=
stop_api() { if [ -n "$API_PID" ]; then kill "$API_PID" 2> /dev/null || true; wait "$API_PID" 2> /dev/null || true; fi; }
trap stop_api EXIT

# The real binary on the migrated database, configured for every slice's end-to-end check.
start_api() {
  API_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  PASS_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  PASS_PREVIOUS=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  SQLX_OFFLINE=true cargo build -q --locked --manifest-path "$SERVICE/Cargo.toml" --bin invitesion-api
  API_BIN="$(cargo metadata --format-version 1 --no-deps --manifest-path "$SERVICE/Cargo.toml" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')/debug/invitesion-api"
  DATABASE_URL=$POSTGRES_URL INTERNAL_API_SECRET=$API_SECRET PORT=$API_PORT RUST_LOG=warn \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_JWKS_URL="http://127.0.0.1:$JWKS_PORT/.well-known/jwks.json" \
    OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY \
    RATE_LIMIT_RSVP_LINK="$RSVP_LIMIT_LINK/600" RATE_LIMIT_RSVP_IP="$RSVP_LIMIT_IP/600" \
    RATE_LIMIT_WISH_LINK="$WISH_LIMIT_LINK/600" RATE_LIMIT_WISH_IP="$WISH_LIMIT_IP/600" \
    GUEST_PASS_SECRET=$PASS_SECRET GUEST_PASS_SECRET_PREVIOUS=$PASS_PREVIOUS \
    "$API_BIN" > "$CI_OUT/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$API_PORT/v1/health"; then return 0; fi
    kill -0 "$API_PID" 2> /dev/null || { cat "$CI_OUT/api.log"; return 1; }
    sleep 1
  done
  echo "the API did not answer /v1/health" >&2
  return 1
}

# R-02: the guest page's view writer selection against the binary.
views_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET npx tsx scripts/verify-views-api.ts
}

# R-03: the guest's RSVP action and the host's dashboard action, through both writers, against the binary.
rsvp_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY \
    RSVP_LIMIT_LINK=$RSVP_LIMIT_LINK RSVP_LIMIT_IP=$RSVP_LIMIT_IP npx tsx scripts/verify-rsvp-api.ts
}

# R-04: the guest's wish action and the host's moderation and reply actions, through both writers, against the binary.
wishes_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY \
    WISH_LIMIT_LINK=$WISH_LIMIT_LINK WISH_LIMIT_IP=$WISH_LIMIT_IP npx tsx scripts/verify-wishes-api.ts
}

# B-033: every roster call site (both lists, invite-only events, the import and its undo, self-registration and the
# host's decisions) through both writers against the binary, with the default registration limits.
roster_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY npx tsx scripts/verify-roster-api.ts
}

# B-024 (D-056, ADR-A3): the scanner's check-in route and manual fallback through both roster writers against the binary:
# every kind of scan, one arrival across desks, writers and the guest list, replays across writers, one writer per call,
# a missing secret (the binary started once more without one), the route's exposure rules and limit, the flag off.
guest_pass_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY \
    GUEST_PASS_SECRET=$PASS_SECRET GUEST_PASS_SECRET_PREVIOUS=$PASS_PREVIOUS API_BIN=$API_BIN \
    npx tsx scripts/verify-guest-pass-api.ts
}

# G-044 (D-057, ADR-A3): an invitation's team through both writers against the binary: the join lifecycle and its races,
# the capability matrix at every page, action, route and export for owner, co-host, usher, outsider and administrator,
# the usher's names-only desk, FLAG_TEAM_ACCESS off with the grants kept, a revoked member's replays refused in both
# writers and the route, and one answer and one arrival under concurrency.
team_access_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY \
    GUEST_PASS_SECRET=$PASS_SECRET GUEST_PASS_SECRET_PREVIOUS=$PASS_PREVIOUS API_BIN=$API_BIN \
    npx tsx scripts/verify-team-access-api.ts
}

# B-035: the editor's save (the detail route's GET and PATCH) through both content writers against the binary: version
# check, two saves from one version, stale edits, lost answers, wrong owner, entitlement, protected media, readback, flips.
content_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY npx tsx scripts/verify-content-api.ts
}

# B-037 (D-055): the wizard's actions and the catalog's creation path through both content writers against the binary:
# nothing stored before the save, sign-in at the save, the draft with its defaults and version 1, one draft per key across
# retries, concurrency and writers, hostile and long names, preview parity, exactly one writer, the flag off.
creation_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY npx tsx scripts/verify-creation-api.ts
}

# s29: a host's Idempotency-Key replays only to its owner, on the same invitation and guest or wish (signed requests with
# chosen keys and valid owner tokens, against the binary).
host_replay_isolation() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY npx tsx scripts/verify-host-replay-isolation.ts
}

# B-031 (D-063): the jobs binary, built like the API from the committed query metadata with the locked dependencies.
JOBS_BIN=
jobs_binary() {
  SQLX_OFFLINE=true cargo build -q --locked --manifest-path "$SERVICE/Cargo.toml" --bin invitesion-jobs || return 1
  JOBS_BIN="$(cargo metadata --format-version 1 --no-deps --manifest-path "$SERVICE/Cargo.toml" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')/debug/invitesion-jobs"
  if [ ! -x "$JOBS_BIN" ]; then
    echo "invitesion-jobs was not built at $JOBS_BIN" >&2
    return 1
  fi
}

# B-031 (D-063): deletion across both languages through the real binary, on this job's migrated database with a
# disposable upload root and a configuration the script builds from nothing: Next.js deletes and restores, the Rust
# runner plans, purges (storage refusing once, then the retry), honours stale jobs and sweeps expired invitations.
# A missing binary or a skipped Rust section fails the step.
retention_end_to_end() {
  local log="$CI_OUT/verify-retention.log" code=0
  REQUIRE_JOBS_BIN=1 JOBS_BIN=$JOBS_BIN npx tsx scripts/verify-retention.ts > "$log" 2>&1 || code=$?
  cat "$log"
  if [ "$code" != 0 ]; then return "$code"; fi
  if ! grep -q 'rust section: ran' "$log" || grep -q '^SKIP' "$log"; then
    echo "verify-retention did not run every section through the binary" >&2
    return 1
  fi
}

# B-039 (09 §8.6): settlement through both writers against the binary, one writer per call (`BACKEND_PAYMENT`): every
# scenario's rows compared across writers (duplicates, refusals that keep nothing, closing, deleted and purged
# invitations, themes, running windows, concurrent events, a deletion racing the settlement, the administrator's
# confirmation, the signed Stripe webhook), the Rust key's replay and lost answer, rollback across writers, then the
# entitlement outbox delivered by `invitesion-jobs`. A missing binary or a skipped section fails the step.
payment_end_to_end() {
  local log="$CI_OUT/verify-payment-api.log" code=0
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET REQUIRE_JOBS_BIN=1 JOBS_BIN=$JOBS_BIN \
    npx tsx scripts/verify-payment-api.ts > "$log" 2>&1 || code=$?
  cat "$log"
  if [ "$code" != 0 ]; then return "$code"; fi
  if grep -q '^SKIP' "$log"; then
    echo "verify-payment-api skipped a section" >&2
    return 1
  fi
}

# G-050: receipts issued by `invitesion-jobs` from the outbox after settlements through both writers: one per paid order
# copied from its payment record, gapless numbers under two concurrent runners, no number taken by a redelivery, owner-only
# reads, earlier payments on request. The script refuses to start without the binary.
receipts_end_to_end() {
  local log="$CI_OUT/verify-receipts.log" code=0
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET JOBS_BIN=$JOBS_BIN \
    npx tsx scripts/verify-receipts.ts > "$log" 2>&1 || code=$?
  cat "$log"
  if [ "$code" != 0 ]; then return "$code"; fi
  if grep -q '^SKIP' "$log"; then
    echo "verify-receipts skipped a section" >&2
    return 1
  fi
}

# G-053: coupon orders settle at their discounted amount through the Rust writer as through Next.js (the full price is
# refused and nothing kept); the database job runs the same script for the Next.js writer alone.
coupons_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET REQUIRE_RUST=1 npx tsx scripts/verify-coupons.ts
}

# G-052 (D-067): reseller workspace staff through both writers against the binary: a manager as a co-host and a desk as an
# usher on client invitations only, refused after revocation, while the workspace is disabled, once an invitation is taken
# back or deleted, and with FLAG_WORKSPACES off; plus the credit ledger. The database job runs it for Next.js alone.
workspaces_end_to_end() {
  API_BASE_URL="http://127.0.0.1:$API_PORT" INTERNAL_API_SECRET=$API_SECRET OWNER_TOKEN_JWKS_PORT=$JWKS_PORT \
    OWNER_TOKEN_ISSUER=$OWNER_ISSUER OWNER_TOKEN_AUTHORIZED_PARTIES=$OWNER_PARTY REQUIRE_RUST=1 npx tsx scripts/verify-workspaces.ts
}

step "migrate (drizzle-kit)" pnpm db:migrate
step "toolchain" cargo --version
if [ -f "$SERVICE/Cargo.toml" ]; then
  step "fmt ($SERVICE)" cargo fmt --manifest-path "$SERVICE/Cargo.toml" --check
  # SQLX_OFFLINE: every query must build from the committed .sqlx metadata alone.
  step "clippy ($SERVICE, offline metadata)" env SQLX_OFFLINE=true cargo clippy --manifest-path "$SERVICE/Cargo.toml" --locked --all-targets -- -D warnings
  step "test ($SERVICE)" env SQLX_OFFLINE=true cargo test --manifest-path "$SERVICE/Cargo.toml" --locked
  step "contract: openapi.json, schema.d.ts, .sqlx" bash scripts/api/contract.sh check
  step "api binary (owner tokens, RSVP and wish limits)" start_api
  step "views end to end (BACKEND_VIEWS=rust)" views_end_to_end
  step "rsvp end to end (BACKEND_RSVP, both writers)" rsvp_end_to_end
  step "wishes end to end (BACKEND_WISHES, both writers)" wishes_end_to_end
  step "roster end to end (BACKEND_ROSTER, both writers)" roster_end_to_end
  step "guest passes end to end (B-024, BACKEND_ROSTER, both writers)" guest_pass_end_to_end
  step "team access end to end (G-044, FLAG_TEAM_ACCESS, both writers)" team_access_end_to_end
  step "workspaces end to end (G-052, FLAG_WORKSPACES, both writers, credit ledger)" workspaces_end_to_end
  step "content end to end (BACKEND_CONTENT, both writers)" content_end_to_end
  step "creation end to end (wizard, BACKEND_CONTENT, both writers)" creation_end_to_end
  step "host replay isolation (owner, invitation, resource)" host_replay_isolation
  step "jobs binary (invitesion-jobs, offline metadata, locked)" jobs_binary
  step "retention end to end (B-031: Next.js deletion, Rust plan, purge and sweep)" retention_end_to_end
  step "payment end to end (B-039, BACKEND_PAYMENT, both writers, outbox)" payment_end_to_end
  step "receipts end to end (G-050, outbox delivery, gapless numbers, owner reads)" receipts_end_to_end
  step "coupons end to end (G-053, discounted orders through both writers)" coupons_end_to_end
fi
step "test ($EXPERIMENT)" cargo test --manifest-path "$EXPERIMENT/Cargo.toml" --locked
