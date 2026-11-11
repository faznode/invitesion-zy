# scripts/ci/lib.sh: helpers shared by the CI job scripts (B-020). Sourced, never executed.
# Every job script runs from the repository root with `set -euo pipefail` and calls `step <name> <command…>`.

CI_OUT=${CI_OUT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/invitesion-ci}
mkdir -p "$CI_OUT"

ci_group_start() { if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::group::$1"; else echo "── $1"; fi; }
ci_group_end() { if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::endgroup::"; fi; }

step() {
  local name=$1
  shift
  local started=$SECONDS
  ci_group_start "$name"
  # Tools such as drizzle-kit end without a newline; the summary must start its own line to stay greppable.
  if "$@"; then
    echo
    ci_group_end
    printf 'ci: %-52s ok (%ss)\n' "$name" $((SECONDS - started))
  else
    local code=$?
    echo
    ci_group_end
    printf 'ci: %-52s FAILED, exit %s (%ss)\n' "$name" "$code" $((SECONDS - started))
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::error title=$name::exit $code"; fi
    exit "$code"
  fi
}

# Builds write .next and the product gates set proxy.ts aside, so they run only where the workspace is thrown
# away afterwards: a CI runner, or the copy that scripts/ci/local.sh makes. In this repository's v0 sandbox the
# platform's dev server serves the project folder from its own .next.
ci_require_disposable() {
  if [ "${CI:-}" != "true" ]; then
    echo "refusing to run outside a disposable workspace (set CI=true there, or use scripts/ci/local.sh)" >&2
    exit 2
  fi
}

# Production-mode placeholder Clerk configuration (local-stack.sh's placeholder_env). A pk_test_ key would bounce every
# navigation through Clerk's development handshake. Real keys, when present in the environment, win.
ci_placeholder_env() {
  export NEXT_TELEMETRY_DISABLED=1
  export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-pk_live_$(printf 'clerk.invitesion.invalid$' | base64 | tr -d '\n')}"
  export CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-YOUR_CLERK_SECRET_KEY}"
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://127.0.0.1:${APP_PORT:-3100}}"
}

ci_require_database() {
  if [ -z "${POSTGRES_URL:-}" ]; then
    echo "POSTGRES_URL must name a scratch database this job may migrate and seed" >&2
    exit 2
  fi
}
