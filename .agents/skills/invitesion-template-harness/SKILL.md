---
name: invitesion-template-harness
description: >-
  Invitesion's own workflow for guest-page design: design families (B-030), palette tokens (B-016), the template
  harness, rendered review and the emerging house taste. Use before creating, changing or reviewing a design family,
  a palette, the guest-page renderer (components/invitation/), a harness sample or a template manifest, and before
  writing any claim about how a guest page looks.
---

# invitesion-template-harness

Precedence: `AGENTS.md` > this skill > third-party skills. Third-party design skills (`design-taste-frontend`,
`frontend-design`, …) may inform craft; they never override the rules below.

## Hard rules
- **Invitesion has no established taste yet.** Gapura, Kartu, Riang and Lontar are experiments. Keep, revise or
  retire a family on rendered evidence, never because it exists or because a brief says so.
- **No copying.** Extract principles, structure and measurements only. Never a competitor's layout, component
  combination, asset, font, audio, illustration, branding or wording.
- **Observed or not claimed.** Every visual statement names the render it comes from (file, viewport, fixture,
  date). RSVPify is the owner's preferred reference for a modern, elegant frontend, but the evidence holds no rendered
  observation of it (S-RSV-002: 403 to non-browser clients; no guest page identified). Do not describe its look.
- **Technical PASS ≠ visual approval.** Tests, overflow and contrast checks are gates; taste is a separate,
  written review. Never invent a score ("AI-slop score", "taste score") as proof of quality or originality.
- **Religious text** only from `content/verified-religious-texts/` (empty today → no quotation, no prayer text).
- **Fake data only** in fixtures and screenshots (UU PDP); stress guests come from the fixtures below.

## The loop
| Step | Do | Where |
|---|---|---|
| 1 Reference research | Read dossiers and captures for principles, not looks | `invitation-research/03-teardowns/`, `raw/` |
| 2 Principles | 3–5 transferable principles with evidence IDs | the brief |
| 3 Directions | One structured brief per direction (format in `templates/_briefs/README.md`) | `templates/_briefs/<id>.md` |
| 4 Prototype | Family layout on the shared guest view (contract below) | `components/invitation/families/<id>.tsx` |
| 5 Render | Real routes on the local stack with the review fixture; screenshots at 4 widths + reduced motion | commands below |
| 6 Critique | Look at the actual screenshots; write findings with IDs against the brief | `invitation-research/_handoff/family-review-*.md` |
| 7 Curate and refine | Fix, re-render, re-review; or revise the brief; or retire the family | code + brief |
| 8 Document taste | Only principles that survived step 6 on more than one family go into "Emerging taste" below | this file |

## Family contract (enforced by tests unless marked)
- Register the id in `FAMILY_IDS` / `FAMILIES` (`lib/invitation/families.ts`), its manifest in `FAMILY_MANIFESTS`
  (`lib/invitation/family-manifest.ts`: sections and order rules, event types, photo slots, logo frame, motion tier,
  music, palettes, byte budget, provenance; B-030) and the layout in `FAMILY_LAYOUTS`
  (`components/invitation/public-renderer.tsx`). A missing or retired id renders the legacy layout byte-identically.
  Changing which family a new invitation starts on is `defaultFamilyFor` (same file; F-02, D-048) and the manifest's
  `startsNewFor`, never the renderer. `pnpm harness families` validates every manifest.
- Draw sections as renderers keyed by `SectionId` and return `composeSections(FAMILY_MANIFESTS.<id>, renderers,
  sharedSections(props, view))` (`components/invitation/family-sections.tsx`): the manifest decides the order, a section
  the family does not draw falls back to the shared block, and each section root carries `data-section="<id>"`.
- Take every derived value from `buildGuestView()` (`guest-view.ts`): dates and times in the event zone, countdown and
  calendar rules, `canRespond`, `coverText()`. Never call `isFlagOn`, `calendarEventsFromConfig` or read
  `invitation.status` in a layout.
- Compose every guest-facing section of the legacy page through the shared blocks (`guest-blocks.tsx`: `EventFacts`,
  `MapLink`, `CalendarLinks`, `RsvpBlock`, `GuestbookBlock`, `ReadOnlyNotice`). Never build a guest form.
- Colour only through palette tokens (`tone.*`); opacity only on images; text never straight over a photo except
  names in ink, and small text over a photo goes through `coverText()` (bounded by `worstContrastOverImage()`).
- Host-typed names: `dir="auto"` or `<bdi>`, and `[overflow-wrap:anywhere]`.
- Declare the manifest's `motionTier` and take the entrance class from `motionClasses(tier).rise(…)`, never typed into
  the layout; tier 1 is `inv-rise` only (off under `prefers-reduced-motion`), never on the names or a control. No
  higher tier exists until it has a byte budget, a reduced-motion fallback and a written review.
- Two self-hosted fonts only (`font-serif`, `font-sans`). Touch targets ≥ 44 px (`min-h-11`). (review)

## Catalog manifests (G-062)
- Each of the 64 catalog templates has a derived manifest (`lib/invitation/catalog-manifest.ts`): never edit one by
  hand; change the registry, the palette tokens or the art register, and the manifest follows. `pnpm harness catalog`
  validates every manifest and hashes every declared art file on disk (the sandbox app job runs it). New theme art
  needs a register entry with its prompt, original digest, crop and review; the owner's review stays pending until
  recorded, and the admin console (`/admin/<entry>/templates`) shows that state read-only.

## Commands
```bash
pnpm typecheck && pnpm test                     # rendered tests iterate legacy + every family automatically
pnpm harness families && pnpm harness catalog   # B-030 family manifests; G-062 catalog manifests + art files
bash invitation-research/_tools/ops/bootstrap-sandbox.sh tools   # Chrome for Testing, Lighthouse (background)
bash invitation-research/_tools/ops/local-stack.sh up            # Postgres + snapshot build without middleware
bash invitation-research/_tools/ops/local-stack.sh start         # background; :3100
(cd /vercel/share/work/app && npx tsx invitation-research/_tools/setup/seed-family-review.ts \
   --cover-url http://127.0.0.1:3100/review/cover.png --palettes)   # copy a fictional cover into $APP/public/review/
source /vercel/share/work/tools/env.sh
npx tsx tools/template-harness/page-review.ts --out /tmp/review --url gapura=http://127.0.0.1:3100/i/review-gapura-full/nama-panjang
npx tsx tools/template-harness/page-review.ts --out /tmp/review-m --mobile-only --url …   # stress guests at 360 × 800
npx tsx tools/template-harness/rendered-contrast.ts --out /tmp/contrast --url legacy-ivory=…/i/review-legacy-p-ivory/budi-hartono
npx tsx tools/template-harness/product-bytes.ts --out /tmp/product-bytes \
   --url legacy=…/i/review-legacy-full/budi-hartono --url gapura=…/i/review-gapura-full/budi-hartono …  # every family
```
**Product-family bytes** (`product-bytes.ts`, budgets `PRODUCT_PAGE_BUDGETS` in `policy.ts`, tests `tests/product-bytes.test.ts`):
one page per family with the same content. The shell (what every family page loads under the same URL) is budgeted
once; a family's own bytes (its document plus anything only it loads) and each page's total are budgeted per family.
A new family is judged on its own bytes; the total keeps the guest page inside the cold-load budget.
Run it on two contents (s23r): the wedding (`-full`) and the long corporate programme (`-programme`, seeded with
`--programme`; no logo or cover, so uploads do not count as family bytes). The `relative` line (bytes above the leanest
layout) compares layouts only; it is not a budget and not competitor parity. An uploaded logo or cover has a different
URL per invitation, so it lands in each family's own bytes.

Since s25 (E-053; Q-O11 resolved as Q-D17), the family budget judges `design` bytes: family bytes minus host uploads
(`FAMILY_BUDGET_BASIS` in `policy.ts`). The uploads stay inside both page totals and are printed per layout on their
own line. If layouts fetch different uploads for the same content, that is a layout choice: check the first render.
Every run stores the other basis's verdict (`otherBasis`), and `--family-basis family` reproduces the s21–s24 verdict
for one run. Always report a verdict together with its basis.
**Cover fold** (`cover-fold.ts`, s23r): per page × guest × viewport, whether the guest's name ends inside the first
viewport with every cover image loaded (a missing image is INCOMPLETE, never PASS); `--expect-broken-logo` for pages
whose logo is meant to fail.
**Cover gate** (`cover-gate.ts`, s28, B-009 / D-045): the "Buka Undangan" cover and the music on the `music` fixture pages
(seed with `--music-url <origin>/review/tone.wav` after `cover-gate.ts --write-tone public/review/tone.wav`, a generated
tone, never a recording). It checks no-JS opening, the tap that starts the music, I-15's 1.5 s, reduced motion, the
`aria-pressed` toggle, keyboard and Escape, and that the audio is not fetched before a tap. The gate is one shared island
around every layout; a layout never builds its own cover gate or `<audio>`.
Fixture pages: `/i/review-<legacy|gapura|kartu|riang|lontar>-<full|photo|corporate|sparse|birthday|expired|dark>/<guest>`
(legacy: full, photo, corporate); guests `budi-hartono`, `nama-panjang`, `hostile-name`, `rtl-name`, `emoji-name`, plus one
opaque-link guest per invitation (token in the seed output); palette sweep `/i/review-<layout>-p-<paletteId>/budi-hartono`.
New invitations (F-02, D-048) start on Gapura (wedding), Riang (birthday, aqiqah, tasyakuran, khitanan) or Lontar
(corporate) under `DEFAULT_FAMILY`: `--new-invitations` seeds `/i/review-new-<eventType>/budi-hartono` (gated by
product-gates' "rendered contrast: new invitations"), `--new-invitation-palettes` every family × palette they can start on.
Never run screenshots, builds or tests while a capture batch runs (shared CPU skews its measurements).

**Rendered-contrast verdicts** (`rendered-contrast.ts`, logic in `contrast-gate.ts`, tests `tests/rendered-contrast.test.ts`):
PASS (exit 0) only when every page ran, scored 1 with no failing node, and axe's needs-review list holds no
`color-contrast` node; FAIL (exit 1) on any failing node; INCOMPLETE (exit 3) for a null / missing / errored /
not-applicable audit, a runtime error, a redirect, an unreadable report, missing artifacts or unmeasured text (text over
a photo always lands here; it is bounded by `worstContrastOverImage`, not by axe). INCOMPLETE is never a finished gate.

**Review-only fonts.** The sandbox has Noto Sans only, so Arabic and emoji render as boxes. For review screenshots,
unpack `dejavu-sans-fonts` and `google-noto-emoji-color-fonts` (`sudo dnf install --downloadonly`, `rpm2archive`) into
`/tmp/review-fonts` and point only the review Chrome at them with `FONTCONFIG_FILE` (recipe in
`family-review-20261104-s16.md` §2). Disclose it in the record; these fonts never ship and the capture Chrome never uses them.

## Review checklist (per family, per render)
1. 360 × 800, 390 × 844, 412 × 915, 1280 × 800, 390 × 844 reduced motion; overflow 0 px everywhere.
2. Stress: long names, RTL, emoji, hostile text; sparse content; no photo and a high-contrast photo; dark palette;
   expired (read-only notices, no forms); non-wedding event; token guest link.
3. Hierarchy (what reads first, second, third), spacing rhythm between sections, type scale at 360 px, alignment.
4. Imagery and ornament: does ornament support the composition or only fill space? Remove what is only decoration.
5. Emotional tone and cultural fit for the event type; Indonesian copy reads naturally.
6. Forms: labels, hints, error and saved notices, keyboard order and visible focus, 44 px targets.
7. Contrast in context: rendered sweep per palette; text over photos; interaction states (not automated).
8. Verdict: technical PASS / FAIL (gates) and visual verdict (keep / revise / retire) on separate lines.

## Current families and review state
See `templates/_briefs/` (one brief each) and the latest `invitation-research/_handoff/family-review-*.md`
(s16: Gapura revise, Kartu kept, Riang kept for celebrations, Lontar kept for formal / corporate events).

## Emerging taste
A principle is listed here only after it survived a written review on more than one family. Candidates and their
evidence live in the review records (T1 promoted s18; T3 promoted s23r; open: T5 the organiser's mark as one row).
- **One rhythm on phones; no screen-high gaps** (T3, promoted s23r). At 360 × 800 no band without content reaches half
  the viewport, and a family keeps its gaps to its own one or two tiers (block and section). Evidence:
  `family-review-20261104-s16.md` §14 (all five layouts, 44 pages, largest gap 217 px). Gate: `design-acceptance.ts`
  (`t3-rhythm`), which also checks stress names, reduced motion and the icons in forced colours and print.
- **Repeated rows share one container.** A schedule, a list of sessions or any run of same-shaped rows is one card
  divided by hairlines, with a scanning column (time) where the rows have one; separate cards are for distinct
  entities (an event, a speaker, a gift account). Evidence: s15 F1 (30 agenda cards took ≈ 3,100 px of a 6,378 px page
  at 360 px) and `family-review-20261104-s16.md` §3–§4 (one divided card on all five layouts, corporate pages
  5,727–6,289 px at 360 px, readable at 360 and 1280).
- **Frame the photo; never fade it behind text** (T1, promoted s18). A cover photo stays at full strength in its own
  frame (an arch window, beside a date band, alone under the names) and no line of text sits on it, so legibility never
  depends on the photo. Text over a photo cannot be measured by the contrast gate (it stays INCOMPLETE) and weakens on a
  low-contrast photo. Evidence: s16 X1 (high-contrast photo; Kartu and Lontar against legacy and the old Gapura); s18
  written reviews with the low-contrast photo on two families, Gapura's framed window (`family-review-20261104-s16.md`
  §11) and Lontar beside the band and on its own (IMPLEMENTATION-LOG E-032); contrast run 6 PASS on both families'
  `photo-low` pages, while legacy's headline on the photo is the INCOMPLETE case in every run. Limits: static frames,
  one font environment, device scale 1; Kartu's and Riang's low-contrast renders not re-inspected in s18.
