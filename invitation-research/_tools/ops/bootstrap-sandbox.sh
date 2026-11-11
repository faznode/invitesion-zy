#!/usr/bin/env bash
# bootstrap-sandbox.sh — rebuild the research toolchain in a fresh sandbox. Idempotent; safe to re-run.
#
#   bash invitation-research/_tools/ops/bootstrap-sandbox.sh git     # git metadata OUTSIDE the project (no push, no force)
#   bash invitation-research/_tools/ops/bootstrap-sandbox.sh tools   # Chromium libs + Chrome for Testing, Node 24.22.2, REA 6.8.0, Lighthouse 12.8.2
#   bash invitation-research/_tools/ops/bootstrap-sandbox.sh chrome  # foreground CDP Chrome on 127.0.0.1:9222 -> run it as a BACKGROUND task
#   bash invitation-research/_tools/ops/bootstrap-sandbox.sh check   # one line per tool
#   source /vercel/share/work/tools/env.sh                                  # REA_NODE REA_BIN LH_BIN CHROME_PATH INVITESION_PRIVATE_DIR CDP_HTTP GIT_RESEARCH
#
# Why outside the project: the hosting platform persists /vercel/share/v0-project only; everything under
# /vercel/share/work is lost when the sandbox is recycled, so this script recreates it (see _handoff/LATEST.md).
set -uo pipefail

WORK=${WORK:-/vercel/share/work}
PROJECT=${PROJECT:-/vercel/share/v0-project}
TOOLS=$WORK/tools
GIT_DIR_OUT=$WORK/invitesion.git
REPO_URL=${REPO_URL:-https://github.com/faznode/invitesion.git}
BRANCH=${BRANCH:-v0/faznode-3b993736}
LOCAL_BRANCH=${LOCAL_BRANCH:-agent/research-harness}
NODE_VER=v24.22.2
REA_VER=6.8.0
LH_VER=12.8.2

mkdir -p "$WORK" "$TOOLS"

write_env() {
  local chrome
  chrome=$(ls -d "$TOOLS"/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)
  cat > "$TOOLS/env.sh" <<EOF
export REA_NODE=$TOOLS/node-$NODE_VER-linux-x64/bin/node
export REA_BIN=$TOOLS/rea-cli/node_modules/rea-agents/scripts/rea.mjs
export LH_BIN=$TOOLS/lh/node_modules/.bin/lighthouse
export CHROME_PATH=$chrome
export INVITESION_PRIVATE_DIR=$WORK/invitesion-private
export CDP_HTTP=http://127.0.0.1:9222
export GIT_RESEARCH="git --git-dir=$GIT_DIR_OUT --work-tree=$PROJECT"
EOF
  mkdir -p "$WORK/invitesion-private"
  echo "env: wrote $TOOLS/env.sh"
}

step_git() {
  if [ -d "$GIT_DIR_OUT" ]; then echo "git: $GIT_DIR_OUT already exists"; return 0; fi
  local tmp="$WORK/clone-tmp-$$" G
  git clone --quiet --no-checkout --branch "$BRANCH" "$REPO_URL" "$tmp" || { echo "git: clone FAILED"; return 1; }
  mv "$tmp/.git" "$GIT_DIR_OUT" && rmdir "$tmp"
  G="git --git-dir=$GIT_DIR_OUT --work-tree=$PROJECT"
  $G config core.worktree "$PROJECT"
  $G config core.bare false
  # New local branch at the fetched tip; `reset` (mixed) fills the index from HEAD and never touches files.
  $G branch "$LOCAL_BRANCH" 2>/dev/null || true
  $G symbolic-ref HEAD "refs/heads/$LOCAL_BRANCH"
  $G reset --quiet
  echo "git: $GIT_DIR_OUT -> worktree $PROJECT on $LOCAL_BRANCH (base $BRANCH @ $($G rev-parse --short HEAD))"
}

step_tools() {
  sudo dnf install -y -q nss nspr atk at-spi2-atk at-spi2-core mesa-libgbm mesa-libEGL alsa-lib libxkbcommon \
    cups-libs libdrm libXcomposite libXdamage libXrandr libXfixes libXext libX11 libxcb pango cairo libxshmfence \
    dbus-libs expat glib2 > "$TOOLS/dnf.log" 2>&1 && echo "libs: ok" || echo "libs: FAILED (see $TOOLS/dnf.log)"

  if [ ! -x "$TOOLS/node-$NODE_VER-linux-x64/bin/node" ]; then
    (cd "$TOOLS" && curl -sSfL -m 300 -O "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz" \
      && tar -xJf "node-$NODE_VER-linux-x64.tar.xz") || echo "node: download FAILED"
  fi

  if ! ls "$TOOLS"/ms-playwright/chromium-*/chrome-linux64/chrome > /dev/null 2>&1; then
    (cd "$TOOLS" && PLAYWRIGHT_BROWSERS_PATH="$TOOLS/ms-playwright" npx -y playwright@1 install chromium > "$TOOLS/pw.log" 2>&1) \
      || echo "chromium: FAILED (see $TOOLS/pw.log)"
  fi

  export PATH="$TOOLS/node-$NODE_VER-linux-x64/bin:$PATH"
  if [ ! -f "$TOOLS/rea-cli/node_modules/rea-agents/package.json" ]; then
    (mkdir -p "$TOOLS/rea-cli" && cd "$TOOLS/rea-cli" && npm init -y > /dev/null \
      && npm i --no-fund --no-audit "rea-agents@$REA_VER" > "$TOOLS/rea-install.log" 2>&1) || echo "rea: install FAILED"
  fi
  if [ ! -x "$TOOLS/lh/node_modules/.bin/lighthouse" ]; then
    (mkdir -p "$TOOLS/lh" && cd "$TOOLS/lh" && npm init -y > /dev/null \
      && npm i --no-fund --no-audit "lighthouse@$LH_VER" > "$TOOLS/lh-install.log" 2>&1) || echo "lighthouse: install FAILED"
  fi
  write_env
  step_check
}

step_chrome() {
  # shellcheck disable=SC1091
  source "$TOOLS/env.sh"
  local profile=/tmp/rea-browser-profile
  # The sandbox can restart with its filesystem restored but no processes (seen 2026-10-29 04:11Z): the old
  # Chromium's Singleton* locks then block every launch. Clear them only when no live Chrome uses the profile.
  if ! pgrep -f -- "--user-data-dir=$profile" > /dev/null 2>&1; then
    for lock in SingletonLock SingletonCookie SingletonSocket; do
      if [[ -L "$profile/$lock" || -e "$profile/$lock" ]]; then unlink "$profile/$lock" && echo "cleared stale $lock"; fi
    done
  fi
  exec "$CHROME_PATH" --headless=new --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$profile" --password-store=basic --no-first-run --no-default-browser-check \
    --disable-gpu --disable-dev-shm-usage --window-size=412,915 --lang=id-ID about:blank
}

step_check() {
  # shellcheck disable=SC1091
  [ -f "$TOOLS/env.sh" ] && source "$TOOLS/env.sh"
  printf 'node24:     '; "${REA_NODE:-/nonexistent}" -v 2> /dev/null || echo missing
  printf 'rea:        '; ("${REA_NODE:-/nonexistent}" "${REA_BIN:-/nonexistent}" --version 2> /dev/null | head -1) | grep . || echo missing
  printf 'lighthouse: '; "${LH_BIN:-/nonexistent}" --version 2> /dev/null || echo missing
  printf 'chrome:     '; "${CHROME_PATH:-/nonexistent}" --version 2> /dev/null || echo missing
  printf 'cdp:        '; curl -s -m 3 http://127.0.0.1:9222/json/version > /dev/null && echo up || echo down
  printf 'git:        '; [ -d "$GIT_DIR_OUT" ] && git --git-dir="$GIT_DIR_OUT" --work-tree="$PROJECT" rev-parse --abbrev-ref HEAD || echo missing
}

case "${1:-check}" in
  git) step_git ;;
  tools) step_tools ;;
  chrome) step_chrome ;;
  env) write_env ;;
  check) step_check ;;
  all) step_git; step_tools ;;
  *) echo "usage: $0 git|tools|chrome|env|check|all"; exit 2 ;;
esac
