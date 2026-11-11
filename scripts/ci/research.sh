#!/usr/bin/env bash
# CI job "research" (B-020): the research repository's own checks: references, the commit guard (privacy, showcase links,
# eligibility), derived outputs reproduce, dispositions agree with the upgrade order, and the research-tool unit tests.
# Read-only; Python standard library only; no network.
#   bash scripts/ci/research.sh            # GIT=… overrides the git command (the commit guard needs a repository)
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/ci/lib.sh
export GIT=${GIT:-git}
R=invitation-research

step "references resolve" python3 -B "$R/_tools/safety/check-references.py"
step "commit guard" bash "$R/_tools/safety/commit-guard.sh"
step "feature matrix reproduces" python3 -B "$R/05-feature-matrix/build-matrix.py" --check
step "idea ranking reproduces" python3 -B "$R/07-ideation/score-ideas.py" --check
step "dispositions agree with the upgrade order" python3 -B "$R/06-gap-analysis/check-dispositions.py"
step "benchmark pack reproduces" python3 -B "$R/_tools/capture/benchmark-pack.py" --check
for test in "$R"/_tools/*/test_*.py; do
  step "unit: ${test#"$R"/_tools/}" python3 -B "$test"
done
