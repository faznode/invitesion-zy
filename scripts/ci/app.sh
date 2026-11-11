#!/usr/bin/env bash
# CI job "app" (B-020): typecheck, unit tests, the family manifests (B-030) and the production build exactly as deployed
# (proxy.ts included).
#   CI=true bash scripts/ci/app.sh            # in a disposable workspace; locally: bash scripts/ci/local.sh app
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/ci/lib.sh
ci_require_disposable
ci_placeholder_env
# lib/env validates POSTGRES_URL when page data is collected. Nothing may query at build time, so an address where no
# database listens is enough, and a page that starts querying during the build fails this job instead of passing.
export POSTGRES_URL=${POSTGRES_URL:-postgres://build:build@127.0.0.1:9/no-database-at-build-time}

step "typecheck" pnpm typecheck
step "unit tests" pnpm test
step "family manifests (B-030, pnpm harness families)" pnpm harness families
# G-062: every catalog template's manifest and its art files on disk, byte for byte.
step "catalog manifests (G-062, pnpm harness catalog)" pnpm harness catalog
step "production build (with proxy)" pnpm build
