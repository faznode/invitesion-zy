<!-- SUMMARY (first 7 lines — greppable) -->
# 08-template-system-and-harness.md — template contract (manifest v1), tier budgets, quality gates, harness CLI, dogfood plan
> WHAT: How a template is declared, checked and shipped: the machine-readable manifest, budgets with their provenance, every gate and its honest limit, the CLI, the verified-religious-text rule, and the path from today's palette-only renderer to template system v2 (B-030).
> STATUS: **s26 (2026-11-06): §8 template and content contract and §9 taste process added** (owner / template split, editable-field map, version compatibility, family capabilities, media, generation workflow; reference → validated principle with T1 / T3; gates separate from visual approval, D-041). **s25 (2026-11-06): body brought to current code.** §1 has today's five layouts; new §4a covers the product guest-page gates (contrast, byte census on the Q-D17 basis, cover fold, design acceptance, page review), run by hand with no CI (B-012 delivered as manual gates); §6's sample reports are still s10's; §7 records the path taken (four families behind `theme.familyId`, not manifests; B-030 partial). The manifest contract (§2–§5) is unchanged; budgets stay internal, not competitor parity. Earlier: verified s10 (v1 s09).
> OWNER: Research agent (Architect role)
> DEPS: ../01-codebase-audit/template-system.md, ../06-gap-analysis/template-catalog-roadmap.md, ../05-feature-matrix/feature-matrix.csv, ../04-template-benchmarks/benchmark-pack.md, 06-backlog.md (B-003, B-009, B-012, B-030), 12-decision-log.md (ADR-O04, ADR-O05), C-INV-001…005
> GREP: template, manifest, harness, budget, gate, reduced motion, 3D, fallback, license, originality, religious, snapshot, dogfood, product gates, design families, Q-D17
> UPDATED: 2026-11-11 (s48: §8 lists the B-032 / I-11 content fields `settings.occasion`, `settings.countdown`, `quote.corpusId`; earlier 2026-11-06)

## 1. Today (audit baseline `64678cf`; s09 changes marked)
A template is a data row in `lib/invitation/templates.ts` (64 entries; tiers free 34 / premium 24 / signature 6; 18 palettes, now in `lib/invitation/palettes.ts` since E-010; 27 categories). Guests see **one layout for every template**: `components/invitation/public-renderer.tsx` varies only the palette. Theme art is hot-linked Unsplash; fonts are Manrope + Instrument Serif self-hosted by `next/font`; no audio element, no motion, no 3D, no per-template assets, licenses or budgets. At the baseline, catalog-created invitations lost their preset and three presets carried Qur'an translations of unknown provenance; both were fixed in s09 (B-001, B-003; the verified corpus `content/verified-religious-texts/` is empty).

**Today (s25):** the 64 registry entries and 18 palettes are unchanged.
- **Layouts:** guests see one of **five layouts**. The classic renderer stays the default and is byte-identical by design. Four design families — Gapura, Kartu, Riang, Lontar — are chosen per invitation through `theme.familyId` (B-030; E-016, E-018 and their revisions; briefs in `../../templates/_briefs/`; review record `../_handoff/family-review-20261104-s16.md` §1–§15).
- **What the families share:** the data path and the blocks (content contract E-014), the shell's fonts and stylesheet, and the palette tokens. Since B-016 / E-015 those tokens are contrast-safe pairs with a photo bound.
- **What differs per family:** composition and ornament only. A family's own bytes are its document plus the few files only it loads (§4a).
- **Still absent:** no audio element (B-009) and no 3D. Motion is limited to what the design-acceptance gate checks under reduced motion. No per-template manifest exists for the product yet.
- **Corpus:** the verified corpus still has 0 entries (ADR-O04). Since I-11 (s47–s48, E-091, D-068) an invitation's quote can reference an entry by `quote.corpusId`; with no approved entry nothing renders from it.

## 2. Contract: `template.manifest.json` (schema v1)
Machine-readable, validated by `tools/template-harness/schema.ts` (zod, strict: unknown keys fail). Every template directory holds the manifest, its own files (`template.html`, `template.css`, optional `template.js`), and an `assets/` folder.

| Block | Fields (required unless marked optional) | Why |
|---|---|---|
| Identity | `schemaVersion: 1`, `id` (kebab slug), `name`, `version` (semver), `niche` (wedding, islamic-wedding, birthday, aqiqah, khitanan, corporate, memorial, …), `tier` (`basic` / `premium` / `signature`), `locales` (≥ 1 of `id`, `en`), `defaultLocale` | catalog, routing, budgets |
| Sections | ordered list of `{ id, required, slots: [{ key, kind: text / richtext / image / datetime / list, maxLength?, localized? }] }` from the canonical set cover, couple, events, countdown, gallery, gift, rsvp, wishes, quote, closing | editor shows only what the template renders (audit §9.4) |
| Design tokens | `colors` (`background`, `surface`, `text`, `mutedText`, `accent`, `onAccent`), `typography` (`display`, `body` → font asset ids), `radius`, `spacingScale` | one source of truth, contrast gate |
| Motion | `level` 0–3 (0 none, 1 fades, 2 choreographed reveals, 3 scroll-linked / 3D), `durationsMs`, `easing`, `reducedMotion: "none" / "fade-only"` | reduced-motion gate |
| 3D (optional) | `{ asset, fallbackImage, lazy: true, trigger: "interaction" / "visible", maxBytes }` | lazy 3D with fallback gate |
| Audio (optional) | `{ asset, preload: "none", startsOn: "open-gesture", control: true }` | autoplay policy, pause control |
| Assets | `[{ id, path, kind: image / font / audio / model / og, bytes, width?, height?, license, source, author, provenance: own-work / licensed / generated, deferred: bool }]` | budgets, licensing, originality |
| Personalization | `guestName: { slot, maxLength, dir: "auto" }`, `allowedSources: ["guests-table"]` (never a free-text `?to=`) | sanitization gate |
| Accessibility | `minContrast` (≥ 4.5 body, ≥ 3 large), `lang`, `focusVisible: true` | a11y gate |
| Budgets | tier defaults (§3); a template may only tighten them | performance gate |
| Localization | `strings: { key: { id: "…", en: "…" } }` | completeness gate |
| Religious text (optional) | `quotes: [{ section, corpusId }]` only; text comes from `content/verified-religious-texts/corpus.json` | ADR-O04 |
| Originality | `originality: { statement, references: [] }` (references = own moodboards; never competitor URLs) | originality gate |
| OG | `og: { asset }` (1200×630) | OG gate |
| External scripts | `externalScripts: []` (must be ⊆ the harness allowlist, empty by default) | allowlist gate |

## 3. Tier budgets and their provenance
**No competitor-parity threshold is set.** The s10 benchmark pack (`../04-template-benchmarks/benchmark-pack.md`, D-027) now classifies 31 competitor themes into basic 3 (Barunson only, low confidence), premium 20 and signature 8 in the unconditional population (s13, D-031; 37 with premium 26 when the provisional Enviory themes are admitted), and its §5 forbids reading the aggregates as parity thresholds. Budgets therefore stay **internal**, anchored on our own pre-P0 lab page C-INV-005 (311 KiB cold load, LCP 2.53 s, a11y 96; limits: lab, no middleware, placeholder Clerk) with headroom per tier [ASSUMPTION; revisit when the basic and signature tiers reach high confidence or field data arrives].

| Budget (bytes on disk of the template's own files and non-deferred assets) | basic | premium | signature |
|---|---|---|---|
| Cold-load total (HTML + CSS + JS + fonts + non-deferred images) | ≤ 320 KiB | ≤ 380 KiB | ≤ 420 KiB |
| Template JS (non-deferred) | ≤ 8 KiB | ≤ 20 KiB | ≤ 40 KiB |
| Fonts (≤ 2 families) | ≤ 120 KiB | ≤ 160 KiB | ≤ 160 KiB |
| Any single image | ≤ 200 KiB | ≤ 250 KiB | ≤ 250 KiB |
| Deferred audio (after the open gesture) | none | ≤ 1.5 MiB | ≤ 1.5 MiB |
| Deferred 3D model (after interaction / visible) | none | none | ≤ 900 KiB, fallback image ≤ 120 KiB |
| Motion level allowed | ≤ 1 | ≤ 2 | ≤ 3 |

Measured from files, not from manifest claims: a declared `bytes` that differs from the file fails `check`. `bench` adds a Lighthouse cold-load run of the generated preview when Chrome and Lighthouse 12.8.2 are installed (`bootstrap-sandbox.sh tools`); otherwise it reports "Lighthouse not run" and never invents a score.

## 4. Gates (`check` = static, `bench` / `snapshot` = browser)
| Gate | How it is checked | Honest limit |
|---|---|---|
| Schema | zod strict parse | — |
| Tier budgets + correct asset measurement | file sizes, PNG/JPEG/WebP headers for dimensions, declared vs actual bytes | transfer size after compression is measured only by `bench` |
| Lighthouse (performance, accessibility) | `bench`: Lighthouse 12.8.2 mobile on the generated `preview.html` (`$TMPDIR/invitesion-harness/<id>/`, outside the repo); a run with a runtime error, no performance score or no LCP is reported as **no valid result**, never as a score (s10 fix) | lab only; TBT is not INP |
| Contrast | WCAG 2.2 ratio of text / muted / accent pairs from tokens | computed on tokens, not on rendered pixels over images |
| Reduced motion | motion level > 0 ⇒ CSS has `@media (prefers-reduced-motion: reduce)` and the manifest declares the fallback | static; behaviour confirmed in `snapshot` with emulated reduced motion |
| Lazy 3D + fallback | model declared `deferred`, `lazy: true`, fallback image present, model path absent from initial HTML | real-device frame rate not measured |
| Long names, RTL/Arabic, emoji, timezone labels | preview rendered with fixtures (long Indonesian name, Arabic name, emoji name, hostile markup) into isolated `dir="auto"` / `<bdi>` slots; event times via `Intl` in the event zone with WIB / WITA / WIT labels | visual overflow judged in snapshots |
| Personalization sanitization (our own pages) | hostile fixture must appear escaped; no raw `<script` / `on*=` from guest data | harness renderer, not the product renderer (product: H-INV-003) |
| Browser / audio behaviour | `<audio preload="none">`, no `autoplay`, starts on the open gesture, pause control with `aria-pressed` | playback itself is not verified without a device (opening ≠ playback) |
| Visual snapshots 360×800, 390×844, 412×915 | `snapshot`: headless Chrome screenshots, hashes in the report | images are not committed (git-ignored); hashes and sizes are |
| Localization completeness | every `strings` key has every declared locale | — |
| External-script allowlist | no `<script src>` / `@import` / `url(http…)` outside the allowlist (empty) | — |
| OG image | `og.asset` exists, 1200×630 | — |
| Asset licensing | every asset has license + source + author; license ∈ allowlist (OFL-1.1, Apache-2.0, MIT, CC0-1.0, CC-BY-4.0, own-work); fonts must be OFL-1.1 / Apache-2.0 | declaration is trusted; provenance review stays human |
| Originality | no competitor brand, domain or asset reference (list from the research shortlist) in any template file or asset source | cannot prove visual dissimilarity; reviewer sign-off in the report |
| Religious text | quotes only by `corpusId` present in the corpus with source, edition, permission, verifier, date; inline religious text fails | the corpus starts empty: no quote blocks until the owner approves entries |

## 4a. Product guest-page gates (s16–s25)
The product renderer is still not a harness template, so the manifest gates of §4 do not apply to it. Since s16, standalone tools in `tools/template-harness/` gate the product's rendered guest pages instead.
- **How they run:** on the review fixture, by hand, against a D-012 build (no middleware). There is no CI (B-020).
- **Content:** the review fixture renders the same content through every layout, plus stress guests and variants. Only fictional data, generated outside the repo.
- **Ownership:** the skill `invitesion-template-harness` owns how to run the tools and how to read their verdicts.

| Tool | What it decides | Since | Honest limit |
|---|---|---|---|
| `rendered-contrast.ts` | Lighthouse `color-contrast` on rendered pages. A page passes only when every node was judged: a node over a photo is INCOMPLETE, never PASS | E-019 (s16); runs 1–12 | The legacy headline over a cover photo stays INCOMPLETE (2 pages on the s23r / s24 fixture). The photo bound never turns INCOMPLETE into PASS |
| `product-bytes.ts` | Byte census per layout: the shared shell once, each family's own bytes, each page's total. Budgets `PRODUCT_PAGE_BUDGETS` (shell ≤ 640, family ≤ 80, page ≤ 720 KiB decoded and ≤ 320 KiB served). **The family budget judges design bytes** (family minus host uploads; `FAMILY_BUDGET_BASIS`, Q-D17). Host uploads stay in both page totals and are reported per layout; every run stores the other basis's verdict | E-044 (s21), E-049, E-052, E-053 | Budgets are internal, anchored on build `NqzpKCeG8LELJLqtDZ24K` with ≈ 5 % headroom on the shell and ≈ 30 % on the largest family [ASSUMPTION]. Lab bytes, not speed. Decoded bytes judge; transfer is recorded |
| `cover-fold.ts` | Whether the guest's name ends inside the first viewport with every cover image loaded, per page × guest × viewport | E-048 (s23r), E-051 (s24): 105 / 105 | Emulated viewports, one font environment. Gapura's three-line name has 16 px of margin at 360 × 800 |
| `design-acceptance.ts` | Phone rhythm (T3), stress names, reduced motion, and icons in forced colours and print | E-050 (s23r): 144 / 144 and 80 / 80; on E-051's changed pages 78 / 78 | Headless Chrome, not a device or an in-app browser |
| `page-review.ts` | Full-page screenshots and horizontal overflow for review contact sheets | s16 | Screenshots stay outside the repo; a human review judges taste (ADR-O09 self-review) |

**Verdict style:** PASS / FAIL / INCOMPLETE as in §5. An INCOMPLETE is never relabelled. Every census verdict names its family-budget basis.

## 5. CLI (`pnpm harness <command>`, implemented in `tools/template-harness/`)
`new <dir> --tier --niche --locale` (scaffold that passes `check`), `check <dir>` (all static gates, exit 1 on failure, JSON + text), `bench <dir>` (budgets + Lighthouse when available), `preview <dir>` (`preview.html` + fixture variants in `$TMPDIR/invitesion-harness/<id>/`), `snapshot <dir>` (three viewports + four fixtures + reduced motion when Chrome is available), `report <dir>` (writes `GENERATION-REPORT.md`; STATUS is PASS only when static gates, proofs, a valid Lighthouse result and every planned snapshot are present, INCOMPLETE when a browser check is missing or invalid, FAIL otherwise; exit 0 / 3 / 1). Self-tests in `tests/template-harness.test.ts` prove the happy path and the deliberate failures: oversized asset, unlicensed font, missing reduced motion, unsafe guest input, unverified religious text, external script.

## 6. Dogfood (original work, `templates/_harness-samples/`)
1. **Basic wedding** — level-1 motion, no audio, two self-hosted fonts.
2. **Premium Islamic wedding** — audio after the open gesture, Bismillah-free layout; **no quotation block** (corpus empty, ADR-O04).
3. **Signature 3D / motion** — level-3 motion with reduced-motion fallback, a lazily loaded 3D scene behind an interaction, fallback image.
Assets are generated or drawn for this repository (`provenance: own-work` / `generated`), fonts only OFL with the license file alongside. Each has a generation report with pass evidence and the deliberate-failure proofs.

**Reports at s10, not regenerated since** (the three reports were generated 2026-11-04 01:35–01:36Z; `templates/_harness-samples/*/GENERATION-REPORT.md`, regenerated 2026-11-04 with Chrome for Testing 156.0.8078.4 and Lighthouse 12.8.2 after the validity fix; the s09 basic report that said PASS with performance 0 / LCP 0 ms was invalid and is superseded):

| Sample | Status | Lighthouse perf / a11y | LCP | CLS | Transfer | Snapshots |
|---|---|---|---|---|---|---|
| basic-wedding-melati | PASS | 100 / 100 | 1,351 ms | 0 | 48.6 KiB | 8 / 8 |
| premium-islamic-zamrud | PASS | 100 / 100 | 1,358 ms | 0 | 83 KiB | 8 / 8 |
| signature-cincin-3d | PASS (first report for this sample) | 100 / 95 | 1,203 ms | 0.013 | 40.7 KiB | 8 / 8 |

Limits: one lab run each on the harness's static server (no CDN, no compression), sample pages rather than product guest pages, no device or field data.

## 7. Path into the product (B-030, template system v2)
1. Generate manifests for the 64 registry entries from `templates.ts` (identity, tier, palette → tokens) so the catalog and the harness share one source; drop the hand-synced palette table in the renderer.
2. Section components per template family behind the manifest's section list; `DetailConfig` stays the per-invitation content schema (strict; ADR-O01 keeps template-owned keys such as `art` out of it).
3. `check` in CI for every changed template; `bench` on a nightly runner with Chrome.
4. Rollback: the manifest is additive; the current renderer stays the fallback for templates without section components.

**State at s25 (B-030 PARTIAL):**
- **Step 2 happened in a different form:** layout components per design family, behind `theme.familyId`, over the shared blocks and the strict `DetailConfig`. A retired family id falls back to the legacy layout (`.catch`).
- **Step 1 has not started:** there are no manifests for the 64 registry entries, and the palettes still live in `lib/invitation/palettes.ts`.

**State at s42 (B-030 DONE in the sandbox for the families, E-087):** the §8 family manifest exists for the four design families (`lib/invitation/family-manifest.ts`, validated by `validateFamilyManifest` and `pnpm harness families`). It is the source of each family's section order (`composeSections` in `components/invitation/family-sections.tsx`), of the shared fallback for a section a family does not draw (`sharedSections`) and of the motion tier (`motionClasses`: tier 0 still, tier 1 `inv-rise` entrance only). Each section root carries `data-section`, which `tests/b030-family-manifest.test.ts` reads on every review page. **State at s46 (G-062 read-only slice DONE in the sandbox, E-090):** step 1 above is met for the 64 catalog entries by derived manifests (`lib/invitation/catalog-manifest.ts`, data only, validated with their art files by `pnpm harness catalog` in the sandbox app job) and a read-only admin console; reviewed publishing waits for a recorded owner review.
- **Step 3 has not started:** there is no CI. The product-page gates of §4a run by hand.
- **Rollback stays per family:** an invitation without `theme.familyId` renders the classic layout.

Next steps from the reconciled backlog: B-020's CI, so §4a runs unattended, then manifests for the families before any motion tier, so that B-009's audio and any motion are declared with licences and budgets.

## 8. Template and content contract (s26 specification; implemented by U3 and U7, `06-backlog.md` "Upgrade order (s26)")

**Two owners, never mixed:**
- The **template** (family plus manifest) owns layout, ornament, motion tier, fonts, palettes and art, each with a licence (ADR-O01).
- The **invitation** owns content in `DetailConfig` (strict zod schema, `CONTENT_SCHEMA_VERSION = 2`).
- Nothing template-owned enters the invitation config, and nothing invitation-owned is hard-coded in a template.

**Editable fields:**
- `RENDER_CAPABILITIES` in `lib/invitation/content-contract.ts` is the single map. For each section it lists:
  - `rendered`: what the guest page shows;
  - `storedOnly`: stored, and labelled in the editor as "not on the invitation yet";
  - `hostOnly`: never guest-facing;
  - `caveat`.
- A test keeps the map and the renderer in agreement. A field moves from `storedOnly` to `rendered` in the change that renders it.
- **B-032 / I-11 fields (s47–s48, E-091, D-068), all `rendered`, optional, absent in every config stored before them:**
  - `settings.occasion` (`'memorial'` only, `lib/invitation/occasion.ts`): set by the `tahlilan` preset on a `tasyakuran` invitation; the product's own words read it, pricing and the writers read the event type. Absent = the event type's own occasion, so a stored invitation renders as before.
  - `settings.countdown` (boolean): `false` hides the countdown and nothing else (the calendar links stay); absent or `true` = shown. The editor always sends a boolean.
  - `quote.corpusId` (`''` or a kebab id ≤ 120): names an entry of `content/verified-religious-texts/corpus.json`. The design families render an **approved** entry's text, citation and provenance line, and nothing for any other id, never the typed `quote.text` in its place; `''` clears a reference (the merge keeps a key a save leaves out). **D-041:** the frozen legacy layout keeps rendering the typed quote only.
  - Both content writers store and refuse these alike: the facade validates and merges, the Rust writer stores the prepared config opaquely (`verify-content-api`, `verify-creation-api`).
- From U2, the map plus the zod schema are exported as JSON Schema for the Rust validators, so both sides reject the same input.

**Version compatibility:**
- The content version only rises with a reader migration (`content-read.ts`, lenient read path) and, where stored rows change, a backfill migration. Version 2 = durable event ids (D-036, migration 0013).
- Saved versions are never rewritten. A restore goes through `rekeyRestoredEvents` so answers keyed by event id survive.
- A template change never requires a content change: a family must render every version-2 config, including empty optional sections.

**Family capabilities (manifest, U7 step 1):** each family declares:
- the sections it renders and their order rules;
- supported event types;
- photo slots (cover, couple, person, gallery) with aspect windows;
- logo frames;
- motion tier;
- whether it can render music and the cover gate (B-009);
- palettes as tokens (B-016);
- byte budget (Q-D17).

The harness validates the manifest. A family without a section degrades to the shared block, never to a blank.

**Media:**
- Uploads stay host-owned.
- Derivatives come from Rust jobs (U3): fixed widths, AVIF / WebP, and Save-Data variants (I-28).
- Children's photos follow D-040 (protected namespace, personal-link route, ownership at save, render and delivery).
- Audio (B-009) only from licensed files with a recorded licence. It never autoplays before the guest's tap.

**Design-generation workflow:**
1. Brief (`templates/_briefs/`).
2. Family component over the shared blocks.
3. Manifest.
4. Gates: contrast, bytes, cover fold, design acceptance, page review.
5. Rendered review against the taste principles.
6. Fix.
7. Promote a principle only after evidence on at least two families.

No competitor HTML, CSS, assets or copy at any step (`AGENTS.md`).

## 9. Taste process (s26)
Invitesion's taste is emerging. Its record, in order:

| Step | What it is | Where |
|---|---|---|
| Reference | Owner-supplied directions and our own measured pages; competitors only as principle-level observations | Owner: the **modern, elegant direction he associates with RSVPify** is an owner reference, not an observation (no rendered RSVPify finding exists, `../_handoff/research-closure-s26.md` §4) |
| Principles | Candidate rules phrased as testable statements | skill `invitesion-template-harness` (emerging taste) |
| Directions | Two or three concrete directions per brief | `templates/_briefs/` |
| Prototype | A family component on fictional fixtures | `components/invitation/families/` |
| Rendered critique | Screenshots at 360 / 390 / 412 / 1280 px with the gates' figures; findings with ids (S16-…, S23r-P1) | `../_handoff/family-review-20261104-s16.md` §1–§15 |
| Refinement | Fixes with before / after evidence | IMPLEMENTATION-LOG (E-027, E-028, E-032, E-040, E-045, E-048, E-051) |
| Validated principle | Promoted only with evidence on two or more families | **T1** "frame the photo, never fade it behind text" (s18); **T3** "one rhythm on phones, no screen-high gaps" (s23r). Candidates: T5 (organiser's mark as one row), T6 (greeting before a decorative photo on phones) |

**Technical gates are separate from visual approval.**
- A page can pass every gate and still be rejected in the rendered critique.
- A visual approval never overrides a FAIL or INCOMPLETE gate verdict (D-041).
- Licensed assets, accessibility (contrast, forced colours, reduced motion), responsive behaviour and the Q-D17 byte budgets are preconditions of any visual approval.
