#!/usr/bin/env bash
# scripts/api/contract.sh: the Rust API contract pipeline (R-01). Three generated artifacts are committed:
#   services/api/openapi.json   OpenAPI 3.1 from the Rust types and handlers (utoipa)
#   lib/api/schema.d.ts         TypeScript types for the Next.js client, from openapi.json (openapi-typescript)
#   services/api/.sqlx/         sqlx offline query metadata, described against a database migrated by drizzle-kit
#
#   bash scripts/api/contract.sh generate   # rewrite all three (the .sqlx step needs DATABASE_URL or POSTGRES_URL)
#   bash scripts/api/contract.sh check      # regenerate into a scratch directory and fail on any difference
set -euo pipefail
cd "$(dirname "$0")/../.."
MODE=${1:-check}
API=services/api
DB_URL=${DATABASE_URL:-${POSTGRES_URL:-}}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

openapi() { cargo run -q --locked --manifest-path "$API/Cargo.toml" --bin openapi > "$1"; }
client_types() { pnpm exec openapi-typescript "$1" --output "$2" > /dev/null; }
sqlx_metadata() {
  # Re-expanding the query macros online with SQLX_OFFLINE_DIR set makes them write their metadata there.
  cargo clean -q -p invitesion-api --manifest-path "$API/Cargo.toml"
  DATABASE_URL=$DB_URL SQLX_OFFLINE=false SQLX_OFFLINE_DIR=$1 cargo check -q --locked --all-targets --manifest-path "$API/Cargo.toml"
}

case $MODE in
  generate)
    # Query metadata first: the offline OpenAPI build below needs it complete for any query added since the last run.
    if [ -n "$DB_URL" ]; then
      mkdir -p "$SCRATCH/sqlx" && sqlx_metadata "$SCRATCH/sqlx"
      find "$API/.sqlx" -name 'query-*.json' -delete 2> /dev/null || true
      mkdir -p "$API/.sqlx" && cp "$SCRATCH"/sqlx/query-*.json "$API/.sqlx/"
    else
      echo "contract: .sqlx not regenerated (set DATABASE_URL to a database migrated by drizzle-kit)" >&2
    fi
    SQLX_OFFLINE=true openapi "$API/openapi.json"
    client_types "$API/openapi.json" lib/api/schema.d.ts
    echo "contract: generated"
    ;;
  check)
    failed=0
    SQLX_OFFLINE=true openapi "$SCRATCH/openapi.json"
    diff -u "$API/openapi.json" "$SCRATCH/openapi.json" || { echo "contract: openapi.json drifted from the Rust code" >&2; failed=1; }
    client_types "$API/openapi.json" "$SCRATCH/schema.d.ts"
    diff -u lib/api/schema.d.ts "$SCRATCH/schema.d.ts" || { echo "contract: lib/api/schema.d.ts drifted from openapi.json" >&2; failed=1; }
    if [ -n "$DB_URL" ]; then
      mkdir -p "$SCRATCH/sqlx" && sqlx_metadata "$SCRATCH/sqlx"
      diff -ru "$API/.sqlx" "$SCRATCH/sqlx" || { echo "contract: .sqlx metadata drifted from the queries or the schema" >&2; failed=1; }
    else
      echo "contract: .sqlx not checked online (no DATABASE_URL); offline builds still require it to be complete" >&2
    fi
    [ "$failed" = 0 ] && echo "contract: openapi.json, schema.d.ts and .sqlx are current"
    exit "$failed"
    ;;
  *) echo "usage: $0 generate|check" >&2; exit 2 ;;
esac
