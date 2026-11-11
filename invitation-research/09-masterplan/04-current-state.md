<!-- SUMMARY (first 7 lines — greppable) -->
# 04-current-state.md — Invitesion today: strengths, defects, debt, security, performance, architecture, constraints
> WHAT: The product as of s25 (code: the platform's commit `a60a46b` of s24's tree, plus s25's harness-only E-053). Covers what changed since the plan's `7a00a6d`, what still holds from the Phase-1 audit baseline (`22ed99e` = `64678cf`), defects with their current state, debt, posture and constraints.
> STATUS: **s25 (2026-11-06): body brought from `7a00a6d` to current code** (sections 1–7), read from code and IMPLEMENTATION-LOG E-001…E-053; baseline facts are kept where still true, and dated. Own lab numbers: the pre-P0 C-INV-001…005 (`22ed99e`) remain the population for competitor comparisons. The current page has only the s23r own-build comparison (RQ-OWN-02: one host; FCP, TTI and transfer; LCP not established) and the harness byte census. Earlier: verified s10 (v2 s09, v1 s08).
> OWNER: Research agent
> DEPS: ../01-codebase-audit/*, ../01-codebase-audit/revalidation-s10.md, ../_handoff/IMPLEMENTATION-LOG.md, ../_handoff/deferred-acceptance.md, ../04-template-benchmarks/own-builds/own-build-comparison-s23r.md, 06-backlog.md ("State at s25"), C-INV-001…005
> GREP: current state, strengths, defects, debt, security, performance, architecture, constraints, p0, baseline, s25
> UPDATED: 2026-11-06

## 1. Architecture
**Unchanged since the audit** (`../01-codebase-audit/architecture.md`, `module-map.md`):
- Next.js App Router (`15.6.0-canary.59`) with React 19.1.4, TypeScript, Tailwind 4 and shadcn primitives.
- Clerk for identity, with roles in our own `users` table (M-030).
- Postgres via Drizzle: 18 tables, pool max 10 (M-035).
- Storage local or S3-compatible, with an in-house SigV4 signer (M-028).
- Payments: a QRIS EMVCo payload and Stripe adapters behind a rail interface, with idempotent webhooks (M-025, M-026).
- Guest pages are dynamic server renders at `/i/[slug]/[guestSlug]` (M-012).

**Changed since `7a00a6d`** (IMPLEMENTATION-LOG):
- **Renderer:** one deterministic data path for all 64 catalog templates, drawn by one of five layouts:
  - The classic layout is the default and stays byte-identical by design.
  - Four design families can be chosen per invitation through `theme.familyId`: Gapura, Kartu, Riang and Lontar. B-030: E-016, E-018, with revisions E-027, E-028, E-032, E-040, E-045, E-048 and E-051.
  - Shared blocks carry the content contract (E-014); icons are CSS masks (E-046); palettes are contrast-safe token pairs with a photo bound (B-016, E-015).
- **Guest route:**
  - One loader call per request, and no locale cookie on `/i/*` (B-014 step 1, E-013).
  - No Clerk provider or chunk on guest, public and home pages: `ClerkProvider` lives only in the three signed-in route-group layouts (B-015, E-042).
  - Shared date formatters (E-043).
  - The whole-page cache was evaluated and not shipped (D-039).
- **Data:** migrations 0011–0015 since `7a00a6d` (0000–0015 in total):
  - 0011: the view-dedupe index (B-017a, with a per-guest advisory lock; E-012).
  - 0012: RSVP answers.
  - 0013: durable event ids.
  - 0014: answers per event.
  - 0015: invited event ids on the guest row (D-037).
- **Media:**
  - Person photos (D-038, E-039).
  - Children's photos live in a protected namespace, `protected/<invitation>/…` (D-040, E-047):
    - `/media/protected/*` serves the signed-in owner only.
    - Guests receive a child's photo through `/i/<slug>/<guest>/photo/<slot>`, with checks on every request.
    - Ownership is enforced at save, render and delivery.
    - Older uploads move with a byte-verified migration that has a rollback.
- **Flags (`lib/flags.ts`):** `GUEST_CALENDAR`, `RSVP_MAYBE`, `RSVP_QUESTIONS`, `RSVP_PER_EVENT` and `INVITE_ONLY_EVENTS` are on. `OPAQUE_GUEST_LINKS` is off (the owner's "slug without token" decision).
- **Harness (not product code):** `tools/template-harness/` gates harness templates. Since s16–s25 it also gates the product's guest pages on the review fixture:
  - Rendered contrast (E-019).
  - A byte census with shell, family and page budgets (E-044, E-049). Since Q-D17 / E-053 the family budget judges design bytes.
  - Cover fold and design acceptance (E-050).
- **`middleware.ts`:** Clerk middleware with a report-only nonce CSP, as at the baseline, plus explicit `/media/protected/*` coverage (E-047).

## 2. Strengths to keep
- **Guest-page weight and speed:**
  - **Competitor comparisons** still use the pre-P0 lab population (C-INV-001/002/005 on `22ed99e`): Perf 94, LCP 2.53 s, TBT 184 ms, 311 KiB, accessibility 96, 0 third-party entities. Limits: `../06-gap-analysis/where-we-lead.md`.
  - **The current page against our older builds** (s23r, RQ-OWN-02; one host, 6 interleaved runs each):
    - FCP ≈ 950 ms, against 1,624 / 1,772 ms for `22ed99e` / `9bbd813`.
    - ≈ 67–69 KB less transfer than either.
    - LCP, TBT and score not established.
    - This is a separate population, never pooled with captures (`../04-template-benchmarks/own-builds/own-build-comparison-s23r.md`).
  - **Server cost:** CPU per view 28.5 → 22.2 ms after E-042 / E-043 (one host); the guest page went from 125 to 50 KB (E-042).
  - **Harness census** on the review fixture (s24, the same content per layout), against internal budgets of 640 / 80 / 720 / 320 KiB:
    - Shell: 613.0 KiB decoded, 217.8 KiB served.
    - Families: 38.6–72.2 KiB of design bytes.
    - Page totals: at most 702.9 KiB decoded and 253.5 KiB served.
- **Shipped since the audit:**
  - **The s09 P0 set:** catalog art preserved, prices from `lib/pricing.ts`, event zones, a working editor preview, CSV formula neutralisation, the RSVP allowance kept, countdown and add-to-calendar, a link-preview image, a real 404 for unknown guests, and opaque links behind a flag.
  - **Since `7a00a6d`:**
    - Atomic view counts (B-017a).
    - RSVP depth (B-027): deadline, "maybe", custom questions, an answer per event, and invite-only events with a host override.
    - Corporate programme, organiser mark, ceremony profiles, dress code and hashtag (B-029).
    - Four design families (B-030) and contrast-safe palettes (B-016).
    - Person photos and the children's-photo access contract (D-038, D-040).
- **Tests:** 49 at the baseline → 92 at `7a00a6d` → **311** at s25, in 38 files covering the renderer, guest actions, families, the harness, migrations and access rules.
- **Security basics:**
  - React-escaped guest data: hostile names are inert (H-INV-003).
  - Ownership checks on every query.
  - An upload allow-list without SVG, and a sandboxed `/media`.
  - A private 404 for any failed check on protected media.
  - No secrets in the tree.
- **Payment engineering:** integer minor units, official QRIS test vectors, and idempotent settlement (`scripts/verify-payment.ts` 10 / 10 in s24).
- **Product policies:**
  - Unlimited editing after publish, 12 months active, and free drafting.
  - Noindex guest pages and fictional template previews.
  - ~90 SEO pages, and a filterable catalog with 27 categories.
  - Prices in IDR and USD.

## 3. Defects (baseline `64678cf`; state at s25)
| ID | Defect | Baseline evidence | State at s25 |
|---|---|---|---|
| QA-001 | Catalog invitations lose their preset | re-verified s08 (ADR-O01) | Fixed s09 (B-001, E-001) |
| QA-002 | Times shown in the server's zone with a hard-coded WIB | code | Fixed s09 (B-004, E-004) |
| QA-003 | Guessable guest slugs are the only credential; unknown guests answer 200 | 200 re-verified s09 | Mitigated s09 (B-011, E-011): a real 404. Opaque tokens sit behind `OPAQUE_GUEST_LINKS`, default **off** (owner decision), so guessable slugs stay the default credential |
| QA-005 | RSVP overwrites the allowance | re-verified s08, s09 | Fixed s09 (B-007, E-007) |
| s09 spike | Read-then-insert VIEW dedupe inflates `opened_count` | `s09-20261103-r1` | Fixed s11 (B-017a, E-012; `verify-view-dedupe` 6 / 6 in s24) |
| QA-006 | The loader runs twice per request; the full render costs ≈ 27–30 ms against ≈ 4 ms for minimal HTML | s09 spike | Partly fixed: one loader call (E-013); 22.2 ms per view after E-042 / E-043. The whole-page cache was not shipped (D-039), and the ≤ 2 × `next-min` target is not met (B-014) |
| QA-007 | clerk-js on guest pages (+70.7 KB brotli) | H-INV-004 | Fixed s21 (B-015, E-042). Signed-in pages with real keys are not accepted (DA-01, deferred) |
| QA-008 | Text contrast below AA on several palettes | C-INV-001/002 | Fixed s14–s15 (B-016, E-015), with a rendered gate (E-019): 0 FAIL. **2 pages INCOMPLETE** on the s23r / s24 fixture (the legacy headline over a cover photo); owner decision pending |
| QA-011 | Editor preview gives a 404; theme tab unreachable | code | Fixed s09 (B-005, E-005) |
| QA-012 | CSV formula injection | code | Fixed s09 (B-006, E-006) |
| ADR-O02 | "Rp0 / GRATIS" in marketing vs the checkout price | Q-O02 | Fixed s09 (B-002, E-002) |
| QA-015 | Qur'an translations of unknown provenance in presets | code | Fixed s09 (B-003, E-003). The verified corpus is still empty (0 entries; ADR-O04) |
| QA-009 | No per-invitation link-preview image | C-INV-001 | Fixed s09 for Latin-script names (B-010, E-010) |
| QA-026 (s09) | The config PATCH accepts any `theme.templateId` / `paletteId` without an entitlement check. Not the quality audit's QA-026, which is about SVG uploads | found doing B-005 | **Fixed s26 (B-041, E-054; D-042):** `updateDetailConfig` refuses a changed palette or theme the package does not include (403 `THEME_NOT_ENTITLED`). Re-checked open at s25 |
| QA-013 / 016 / 022 / 023 / 024 | wa.me everywhere; no image pipeline; accounts visible without a guest link; undisclosed tracking; over-claiming pages | `../01-codebase-audit/quality-audit.md` | Open (B-018, B-019, B-026 / G-021, B-021, B-022). s25 spot checks found the marketing roadmap honestly labelled |
| Review findings s16–s24 | Fold, photo and form defects found in rendered reviews: S17-G1, S18-G2, S18-Q1…Q4, S18-E1, S21-K1, S22-K2, S23r-P1, M1, M2 | `../_handoff/family-review-20261104-s16.md` | All fixed (E-027…E-051). Still open: **R1** (legacy does not isolate bidirectional names) and **M3** (in Kartu and Lontar an Arabic organisation name aligns right under a left-aligned mark; a design decision) |

## 4. Debt
- **Five layouts over one data path.** Shared blocks keep the content identical across layouts, but every new block must be checked on all five. The harness does this on the review fixture, not in CI (B-020).
- **Config-only modules still without guest UI:** meals, seating and ticketing, which the manage centre labels "Foundation" or "Integration required". RSVP questions, dress code and agenda gained guest UI (B-027, B-029).
- **Code debt:**
  - Four `slugify` definitions: `lib/invitation/slug.ts`, the two guest `actions.ts` files, and `app/marketing-registry.ts`.
  - Five `any` types left in the editor state.
  - The deprecated `orange-*` alias in `app/globals.css`.
  - Next.js canary.
  - The build requires `POSTGRES_URL` (QA-020, QA-025).
- **No CI:** the 311 tests and the harness gates run by hand (B-020).

## 5. Security and privacy posture
**Good basics** (above), plus, since `7a00a6d`:
- Children's photos are behind an access contract (D-040):
  - Protected media is owner-only.
  - The personal-link photo route checks every request.
  - Ownership is enforced at save, render and delivery.
  - Limits: bytes already served publicly cannot be recalled, and a forwarded personal link works for whoever holds it.
- Clerk is off the guest pages (E-042).

**Gaps:**
- Guest credential (QA-003): a real 404, but opaque links are off by default.
- No rate limiting on RSVP or wishes (QA-004, B-013).
- The CSP is report-only (F-094, B-038).
- Gift accounts are visible without a guest link (QA-022; G-021 with B-026). Bank details are personal data under UU PDP.
- Per-guest tracking without notice (QA-023, B-021).
- No retention or deletion (F-099, B-031, pending legal review).
- The theme entitlement is checked on save since s26 (B-041, E-054). It was not checked at `2a6015f`.
- Residual exposure in git history (ADR-O07, `../00-setup/privacy-hygiene.md` §4).

**Not accepted in this phase** (owner, s25; `../_handoff/deferred-acceptance.md`):
- Signed-in flows with a real Clerk instance (DA-01).
- The children's-photo migration in real environments (DA-02, a deployment step).

Unit tests with stubbed sessions are implementation evidence, not that acceptance.

## 6. Performance posture
- **Client side:** see §2 (own-build comparison and harness census).
  - At risk from original uploads of up to 5 MB once galleries fill (QA-016, B-019).
  - At risk from music and motion (B-009; B-030 motion tiers). The harness budgets guard against this, but run by hand.
- **Server side:**
  - **s09 spike** (lab, no middleware, `64678cf`): ≈ 27–30 ms server CPU and ≈ 141.7 KB of HTML per view; minimal HTML with one loader call costs ≈ 4 ms.
  - **Now: 22.2 ms per view** on one host (s21), after one loader call (E-013), no Clerk on the guest route (E-042) and shared formatters (E-043).
  - What remains is React's HTML render and Flight work, in proportion to the page. Candidates are in LATEST §4: a smaller inline RSC payload (30–37 KiB per family page), fewer client boundaries, and one config parse per request.
  - Verdict and plan: `09-backend-and-frontend-architecture.md`, ADR-A1, D-039.

## 7. Constraints
- No production access or analytics, and no device lab for in-app browsers (needed to verify playback for B-009).
- Real Clerk keys are not requested in this phase (owner, s25). With placeholder keys a middleware build hangs on its first request (P-INV-010), so local measurement builds omit `middleware.ts` (D-012).
- No QRIS acquirer contract (ADR-O03); no approved religious corpus (ADR-O04: 0 entries); legal review pending for privacy texts (B-021, B-031).
- The owner pushes manually; agent runs never push (`AGENTS.md`).
