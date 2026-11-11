#!/usr/bin/env bash
# CI job "product-gates" (B-020 running B-012's gates unattended; G-065, I-02): seed the family review fixture, build the
# measurement variant, serve it, and run the product-page gates against the real routes.
#   CI=true POSTGRES_URL=… CHROME_PATH=… LH_BIN=… bash scripts/ci/product-gates.sh   # locally: scripts/ci/local.sh product-gates
#
# Gates (exit 1 on FAIL, 3 on INCOMPLETE; any non-zero fails the job):
#   product-bytes      wedding and long-programme content on all five layouts, PRODUCT_PAGE_BUDGETS on design bytes (Q-D17)
#   design-acceptance  overflow, stress names, T3 rhythm, reduced motion, forced-colour icons at 360 × 800 (with the
#                      families' photo-less couple profiles under stress, B-023)
#   cover-fold         the greeting fits the first viewport on phones and a laptop
#   rendered-contrast  Lighthouse color-contrast on every layout and the dark palette
#   cover-gate         B-009: the "Buka Undangan" cover and the music on every layout (no-JS opening, the tap that starts
#                      the music, I-15's 1.5 s, reduced motion, the toggle, keyboard), with a tone generated in this copy
#   gift-privacy       B-026 / G-021: gift details kept to personal links reach no other audience (HTML, RSC payload,
#                      metadata, calendar file, preview image) and both QRIS routes serve only who may see them
#   gallery-gate       B-025: each family's grid, masonry and carousel at 360 × 800 (no shift, no overflow), the lightbox by
#                      keyboard and pointer (focus kept inside, Escape, focus returned, no motion), video facades that ask
#                      no provider before a tap, axe on the gallery and the open lightbox; legacy unchanged (D-041); with
#                      photos generated here
# The fixture has no cover photos: photo pages need generated review assets, which never enter the repository, so the
# legacy-over-photo INCOMPLETE pages (D-041) stay a manual run.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/ci/lib.sh
ci_require_disposable
ci_require_database
ci_placeholder_env

APP_PORT=${APP_PORT:-3100}
BASE="http://127.0.0.1:$APP_PORT"
# One upload root for the server and the checks that place fixture objects (B-026's QRIS images).
export UPLOAD_ROOT=${UPLOAD_ROOT:-$PWD/storage/uploads}
LAYOUTS=(legacy gapura kartu riang lontar)
FAMILIES=(gapura kartu riang lontar)
STRESS_GUESTS=(nama-panjang hostile-name rtl-name emoji-name)
export CHROME_PATH=${CHROME_PATH:-$(command -v google-chrome || command -v chromium || true)}
[ -n "$CHROME_PATH" ] || { echo "Chrome not found: set CHROME_PATH" >&2; exit 2; }
[ -n "${LH_BIN:-}" ] || { echo "Lighthouse not found: set LH_BIN" >&2; exit 2; }

build_without_middleware() {
  # P-INV-010: with placeholder Clerk keys the production clerkMiddleware never answers its first matched request.
  # Guest-page payloads are unchanged without it (no CSP header, no locale cookie). Next 16 names the file proxy.ts.
  for file in middleware.ts proxy.ts; do
    if [ -f "$file" ]; then mv "$file" ".$file.ci-off"; echo "$file set aside in this workspace"; fi
  done
  pnpm build
}

# B-011 / QA-003: a wrong link must answer a real 404, never a 200 shell followed by a not-found page.
real_404() {
  local code ok=0
  for path in "/i/review-gapura-full/no-such-guest" "/i/no-such-invitation-ci" "/i/no-such-invitation-ci/budi-hartono"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
    printf '%s %s\n' "$code" "$path"
    [ "$code" = 404 ] || ok=1
  done
  code=$(curl -s -o /dev/null -w '%{http_code}' "$(page gapura full budi-hartono)")
  printf '%s %s (a right link)\n' "$code" "/i/review-gapura-full/budi-hartono"
  [ "$code" = 200 ] || ok=1
  return "$ok"
}

SERVER_PID=
stop_server() { if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2> /dev/null || true; wait "$SERVER_PID" 2> /dev/null || true; fi; }
trap stop_server EXIT

start_server() {
  local probe="$BASE/i/review-gapura-full/budi-hartono"
  ./node_modules/.bin/next start -p "$APP_PORT" -H 127.0.0.1 > "$CI_OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$probe"; then echo "server: $probe answers (pid $SERVER_PID)"; return 0; fi
    kill -0 "$SERVER_PID" 2> /dev/null || { tail -n 40 "$CI_OUT/server.log"; return 1; }
    sleep 1
  done
  tail -n 40 "$CI_OUT/server.log"
  return 1
}

page() { printf '%s/i/review-%s-%s/%s' "$BASE" "$1" "$2" "$3"; }

bytes() {
  local variant=$1 args=()
  for layout in "${LAYOUTS[@]}"; do args+=(--url "$layout=$(page "$layout" "$variant" budi-hartono)"); done
  npx tsx tools/template-harness/product-bytes.ts --out "$CI_OUT/bytes-$variant" "${args[@]}"
}

design() {
  local args=()
  for layout in "${LAYOUTS[@]}"; do
    for guest in "${STRESS_GUESTS[@]}"; do args+=(--url "$layout-full-$guest=$(page "$layout" full "$guest")"); done
    args+=(--url "$layout-programme=$(page "$layout" programme budi-hartono)")
  done
  for family in "${FAMILIES[@]}"; do args+=(--url "$family-sparse=$(page "$family" sparse budi-hartono)"); done
  # B-023: the families' couple profiles without photos, with long, Arabic and emoji names and markup in the parents.
  for family in "${FAMILIES[@]}"; do args+=(--url "$family-profiles=$(page "$family" profiles budi-hartono)"); done
  npx tsx tools/template-harness/design-acceptance.ts --out "$CI_OUT/design" "${args[@]}"
}

fold() {
  local pages=()
  for layout in "${LAYOUTS[@]}"; do pages+=("review-$layout-full" "review-$layout-corporate"); done
  npx tsx tools/template-harness/cover-fold.ts --out "$CI_OUT/fold" --base "$BASE" \
    --pages "$(IFS=,; echo "${pages[*]}")" --viewports 360x800,412x915,1280x800
}

contrast() {
  local args=()
  for layout in "${LAYOUTS[@]}"; do args+=(--url "$layout-full=$(page "$layout" full budi-hartono)"); done
  for family in "${FAMILIES[@]}"; do args+=(--url "$family-dark=$(page "$family" dark budi-hartono)"); done
  npx tsx tools/template-harness/rendered-contrast.ts --out "$CI_OUT/contrast" "${args[@]}"
}

# F-02 (D-041 (3)): what a new invitation of each event type starts as must pass with 0 FAIL and 0 INCOMPLETE.
contrast_new() {
  local args=()
  for type in wedding birthday aqiqah tasyakuran khitanan corporate; do args+=(--url "new-$type=$BASE/i/review-new-$type/budi-hartono"); done
  npx tsx tools/template-harness/rendered-contrast.ts --out "$CI_OUT/contrast-new" "${args[@]}"
}

# B-009: the music fixture's audio is a tone generated here (no recording, no licence), placed under public/ of this
# disposable copy before the build so the measurement build serves it.
TONE_URL="$BASE/review/tone.wav"
fixture_tone() { npx tsx tools/template-harness/cover-gate.ts --write-tone public/review/tone.wav; }

gate() {
  local pages=()
  for layout in "${LAYOUTS[@]}"; do pages+=("review-$layout-music"); done
  npx tsx tools/template-harness/cover-gate.ts --out "$CI_OUT/gate" --base "$BASE" --pages "$(IFS=,; echo "${pages[*]}")" \
    --manual review-legacy-music-manual,review-gapura-music-manual --plain review-legacy-full,review-gapura-full
}

# B-025: the gallery fixture's photos are gradients generated here (no photograph, no licence), placed under public/ of
# this disposable copy before the build so the measurement build serves them.
GALLERY_URLS="$(for n in 1 2 3 4 5; do printf '%s/review/gallery-%s.png,' "$BASE" "$n"; done)"
GALLERY_URLS="${GALLERY_URLS%,}"
fixture_photos() { npx tsx tools/template-harness/gallery-gate.ts --write-photos public/review; }

gallery() {
  local pages=()
  for family in "${FAMILIES[@]}"; do for layout in grid masonry carousel; do pages+=("review-$family-gallery-$layout"); done; done
  npx tsx tools/template-harness/gallery-gate.ts --out "$CI_OUT/gallery" --base "$BASE" --pages "$(IFS=,; echo "${pages[*]}")" \
    --legacy review-legacy-gallery-carousel
}

step "migrate (drizzle-kit)" pnpm db:migrate
step "seed the theme catalog" pnpm db:seed:templates
step "fixture tone (B-009, generated)" fixture_tone
step "fixture photos (B-025, generated)" fixture_photos
step "seed the review fixture (+ programme, music, new invitations, profiles, gallery)" npx tsx invitation-research/_tools/setup/seed-family-review.ts --programme --music-url "$TONE_URL" --new-invitations --profiles --gallery "$GALLERY_URLS"
step "build (measurement variant)" build_without_middleware
step "serve on :$APP_PORT" start_server
step "wrong links answer a real 404 (B-011)" real_404
step "gift privacy on the served build (B-026)" env BASE_URL="$BASE" npx tsx scripts/verify-gift-privacy.ts
step "product bytes: wedding" bytes full
step "product bytes: long programme" bytes programme
step "product bytes: wedding with music (B-009)" bytes music
step "design acceptance (360 × 800)" design
step "cover fold (phones and laptop)" fold
step "rendered contrast (Lighthouse)" contrast
step "rendered contrast: new invitations (F-02)" contrast_new
step "cover gate and music (B-009)" gate
step "gallery: layouts, lightbox and video facades (B-025)" gallery
