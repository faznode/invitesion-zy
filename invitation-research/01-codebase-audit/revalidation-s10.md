<!-- SUMMARY (first 7 lines — greppable) -->
# revalidation-s10.md — own-product audit revalidated at `7a00a6d`: Phase-1 baseline vs shipped P0
> WHAT: For every Phase-1 audit document, what still holds at `7a00a6d`, what the s09 P0 work changed (with entry IDs), and what was corrected in s10. The Phase-1 files keep their baseline (`22ed99e`) content unless a statement was wrong at the time.
> STATUS: DONE s10 (2026-11-04). Method: file reads and greps on the worktree, `git diff 22ed99e 7a00a6d`, `pnpm typecheck` / `pnpm test` in this sandbox; no live signed-in session (Clerk keys absent, P-INV-010).
> OWNER: Oracle (research)
> DEPS: architecture.md, module-map.md, feature-inventory.csv, template-system.md, niche-coverage.md, quality-audit.md, style-observations.md, flows.md, data-model.md, ../_handoff/IMPLEMENTATION-LOG.md, ../09-masterplan/06-backlog.md
> GREP: revalidation, baseline, p0, delta, 7a00a6d, 22ed99e, current state
> UPDATED: 2026-11-04

## 1. Scope of change since the audit baseline
`git diff 22ed99e 7a00a6d` over product paths (`app/`, `components/`, `lib/`, `content/`, `tests/`, `tools/`, `scripts/`, `middleware.ts`, `next.config.ts`, `package.json`): **59 paths (35 added, 24 modified)**. All of it is the s09 P0 work (E-001…E-011) plus the template harness (`tools/template-harness/`, `templates/_harness-samples/`, `tests/template-harness.test.ts`). `middleware.ts` is unchanged. Tests: 49 `test()` cases at the baseline → **92** at `7a00a6d` → **94** with the two s10 harness-report tests (six files in `tests/`).

## 2. Per document
| Audit document | Still holds at `7a00a6d` | Changed by P0 (entry) | Corrected in s10 |
|---|---|---|---|
| `architecture.md` | Next.js App Router (canary 15.6), React 19, Postgres via Drizzle, Clerk auth, payments through QRIS (own EMVCo payload + provider adapter) and Stripe (REST + own signature check), Server Actions with Post/Redirect/Get for guest RSVP and wishes, no CI workflow | Feature flags without a vendor (`lib/flags.ts`, E-008/E-011); PPR `incremental` with `/i/[slug]/**` opted out (E-011); side routes `calendar.ics`, `og.png` (E-008, E-010); owner preview route `/preview/[id]` (E-005) | "no `.github`" wording |
| `module-map.md` (M-001…M-040) | Module boundaries unchanged; new files sit inside existing modules: M-013 public renderer (`countdown.tsx`, `lib/invitation/{calendar,event-time,headline,palettes,preview-image}.ts`), M-012 public page and loader (`og.png`, `calendar.ics`, `guest-link.ts`, `public-path.ts`), M-014 guest interactions (`rsvp-rules.ts`), M-020 guest CSV export (`lib/csv.ts`), M-009 detail config (`template-defaults.ts`, `religious-text.ts`) | Migrations 0009 (`guests.attending_count`), 0010 (`guests.link_token`), both additive | M-036 design-system row: hex tokens in `app/globals.css`; the oklch file is archived |
| `feature-inventory.csv` (F-001…F-102) | Baseline statuses are the matrix's "ours" column (s08, `64678cf` = `22ed99e` product code) | See §3 delta table | — |
| `template-system.md` | Catalog = 64 palette-only presets rendered by one renderer; no per-template layout, ornament or motion in the product | Presets keep their art (E-001); no religious text in presets (E-003); harness contract + three static samples exist but **are not loadable by the product** | Platform-token row (hex, no spacing / easing tokens) |
| `niche-coverage.md` | Ratings unchanged: every niche shares the renderer, so none exceeds 2 | Religious presets lost their unverified quotations (E-003), which removes a risk but adds no niche depth | — |
| `quality-audit.md` (QA-001…QA-027) | Findings not listed in §4 remain open as written | See §4 | Seed-script path |
| `style-observations.md` | Rose / magenta editorial platform, quiet stationery guest page | Palettes moved to `lib/invitation/palettes.ts` and feed the link preview (E-010); countdown boxes use `soft` | §1, §2, §5, §7, §8 rewritten from active files |
| `flows.md` | Creator and admin steps read from code (not clicked through), guest flow measured on the baseline | Guest flow gained countdown + `.ics` (E-008), real 404 for unknown guests (E-011), RSVP keeps the allowance (E-007); editor preview opens the real renderer (E-005) | — |
| `data-model.md` | Tables and relations as audited | `guests.attending_count` (0009), `guests.link_token` (0010) | — |

## 3. Feature-inventory delta (baseline → `7a00a6d`)
| F-ID | Feature | Baseline status | Current status | Evidence |
|---|---|---|---|---|
| F-005 | Countdown timer | missing | **full** (client island, hides after the event; `FLAG_GUEST_CALENDAR` default on) | E-008, `components/invitation/countdown.tsx` |
| F-012 | Add to calendar (ICS / Google) | missing | **full**: "Simpan ke Google Calendar" link and `.ics` download (RFC 5545, `DTSTART` in UTC from the event zone) | E-008, `lib/invitation/calendar.ts`, `app/i/[slug]/calendar.ics/route.ts` |
| F-029 | Quote / verse block | full (presets carried unverified religious text, QA-015) | full, unchanged block; presets ship **without** religious text; owner-verified corpus scaffold, empty | E-003, `content/verified-religious-texts/` |
| F-032 | Per-invitation OG share card | partial (title only) | **full** for Latin-script names (1200×630 image, names + date); names outside the bundled font stay out of the image | E-010, `app/i/[slug]/og.png/route.tsx` |
| F-003, F-004, F-072 | Cover gate, background music, music library | missing / config-only / missing | unchanged (B-009 open, not started in this phase) | 06-backlog.md B-009 |

Other P0 items fixed defects rather than adding inventory features: catalog art preserved (QA-001), price copy (G-003), event time zone (QA-002), editor preview (QA-011), CSV formula neutralisation (QA-012), RSVP allowance (QA-005), opaque guest links behind a default-off flag (QA-003).

## 4. Quality-audit findings closed or changed by P0
| QA | Finding (short) | State at `7a00a6d` | Evidence |
|---|---|---|---|
| QA-001 | Catalog art dropped by the strict schema | **fixed** | E-001, `tests/p0-trust-fixes.test.ts` |
| QA-002 | Event times in server zone with hard-coded "WIB" | **fixed** (WIB / WITA / WIT from the event zone) | E-004 |
| QA-003 | Guessable guest slugs; unknown guest answers 200 | **mitigated**: real 404 for unknown guests; opaque tokens exist but `FLAG_OPAQUE_GUEST_LINKS` defaults **off** (owner's "slug without token" decision), so guessable slugs remain the default | E-011 |
| QA-005 | RSVP overwrites the allowance | **fixed** (separate `attending_count`, clamped) | E-007 |
| QA-009 | No per-invitation share card | **fixed** for Latin names | E-010 |
| QA-011 | Editor preview 404 / theme tab unreachable | **fixed** (owner route `/preview/[id]`) | E-005 |
| QA-012 | CSV formula injection | **fixed** | E-006 |
| QA-015 | Unverified Qur'an translations in presets | **fixed** (removed; corpus empty) | E-003 |
| QA-006, QA-007 | Uncacheable guest page; clerk-js for anonymous guests | **open** (B-014, B-015); the s09 spike measured the render, not the network effect of QA-007 | 06-backlog.md |
| QA-004, QA-008, QA-010, QA-013, QA-014, QA-016…QA-027 | — | **open** as written in `quality-audit.md` | — |

## 5. What was not re-verified (limits)
- No signed-in owner session and no `middleware.ts` in any local build (placeholder Clerk keys): authorization paths, CSP and the locale cookie are verified by code reading only (P-INV-010).
- The guest page has **not been re-measured** since P0: own captures C-INV-001…005 are `22ed99e` builds, so every own-vs-competitor number in the masterplan describes the pre-P0 page.
- Real devices, in-app browsers and audio playback: never tested.
