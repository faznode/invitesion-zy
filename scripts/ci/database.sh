#!/usr/bin/env bash
# CI job "database" (B-020): migrations from empty, schema drift, the template seed, and the database-backed checks
# AGENTS.md requires before anything is called done (verify-payment, verify-view-dedupe).
#   POSTGRES_URL=postgres://…/scratch bash scripts/ci/database.sh       # locally: bash scripts/ci/local.sh database
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/ci/lib.sh
ci_require_database

migration_fingerprint() { find lib/db/migrations -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum; }

# drizzle-kit owns every migration (ADR-A2). A schema.ts change without its generated migration is drift.
no_schema_drift() {
  local before after log="$CI_OUT/drizzle-generate.log"
  before=$(migration_fingerprint)
  pnpm exec drizzle-kit generate > "$log" 2>&1 || { cat "$log"; return 1; }
  after=$(migration_fingerprint)
  if [ "$before" != "$after" ]; then
    cat "$log"
    echo "lib/db/schema.ts differs from the committed migrations: run pnpm db:generate and commit the result" >&2
    return 1
  fi
  grep -q 'No schema changes' "$log" || { cat "$log"; echo "unexpected drizzle-kit output" >&2; return 1; }
}

step "migrate from empty (drizzle-kit)" pnpm db:migrate
step "schema drift (drizzle-kit generate is a no-op)" no_schema_drift
step "seed the theme catalog" pnpm db:seed:templates
step "seed a customer row (fictional email)" env CUSTOMER_SEED_EMAIL=ci-customer@example.com pnpm db:seed
step "seed the demo invitations (Budi & Sari)" npx tsx invitation-research/_tools/setup/seed-local-demo.ts
step "verify-payment (QRIS / Stripe vectors)" npx tsx scripts/verify-payment.ts
step "verify-checkout-key (B-039: one order per key, conflicts, scope)" npx tsx scripts/verify-checkout-key.ts
step "verify-coupons (G-053: server-side discounts, caps under concurrency, stacking)" npx tsx scripts/verify-coupons.ts
# G-052 (D-067): reseller workspaces through the Next.js writer (the rust job runs the same script for both writers).
step "verify-workspaces (G-052: isolation, roles, revocation, flag off, credit ledger)" npx tsx scripts/verify-workspaces.ts
step "verify-view-dedupe (B-017a)" npx tsx scripts/verify-view-dedupe.ts
step "verify-theme-entitlement (B-041, B-036)" npx tsx scripts/verify-theme-entitlement.ts
step "verify-host-analytics (B-034)" npx tsx scripts/verify-host-analytics.ts
step "verify-host-logs (G-045, I-04)" npx tsx scripts/verify-host-logs.ts
step "verify-wishes-book (I-22)" npx tsx scripts/verify-wishes-book.ts
# B-031 (D-063): deletion and restore through the Next.js entry points. Its Rust section (the purge, the dry run and the
# sweep through the real binary) runs in the rust job, which builds invitesion-jobs and refuses to skip it.
step "verify-retention (B-031, Next.js entry points)" npx tsx scripts/verify-retention.ts
