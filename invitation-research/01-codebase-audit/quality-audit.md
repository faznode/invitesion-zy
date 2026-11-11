<!-- SUMMARY (first 7 lines — greppable) -->
# quality-audit.md — security, performance, a11y, SEO/OG, i18n, tests, CI, observability, debt
> WHAT: Findings QA-001…QA-027 with severity, evidence and module IDs; our guest pages measured with the SAME protocol as competitors (C-INV-001…004).
> STATUS: DONE (Phase 1)
> OWNER: Oracle (research) — risk flags, not fixes (scope guard)
> DEPS: module-map.md, data-model.md, ../04-template-benchmarks/protocol (in _rea-playbook.md §4), ../_evidence-index.md
> GREP: quality, security, xss, rate limit, performance, lighthouse, accessibility, contrast, seo, og, i18n, tests, ci, observability
> UPDATED: 2026-10-29

## Run log (how the numbers were produced)
1. Production build of `22ed99e` with local Postgres 16 and placeholder Clerk keys passed on the command line (never written to disk); seeded 64 templates + fixture `invitation-research/_tools/setup/seed-local-demo.ts` (then at `scripts/`, moved in session 05; 2 published weddings: `budi-sari` WIB, `dimas-laras-makassar` WITA; 5 stress guests each: normal, 80-char long name, hostile HTML, Arabic RTL, emoji).
2. First attempt with a `pk_test_` key: every browser navigation got `307 → https://<instance>.clerk.accounts.dev/v1/client/handshake` with `x-clerk-auth-reason: dev-browser-missing` [OBSERVED H-INV-005]. curl without browser headers did not trigger it. Rebuilt with a production-mode placeholder key → `200`, `x-clerk-auth-status: signed-out`.
3. Served with `TZ=UTC` (how Vercel functions run) on `:3100`; captured with `capture.mjs` (REA 6.8.0 + CDP 412×915 @2.625, Android UA) and Lighthouse 12.8.2 mobile simulate (150 ms RTT, 1.6 Mbps, 4× CPU).
4. The clerk-js bundle the production page requests (`clerk-js@6/dist/clerk.browser.js`) cannot resolve in the sandbox; its size was measured from the public CDN: **325,247 B raw / 70,709 B brotli** [OBSERVED H-INV-004]. Add it to every guest-page weight below.

## Scorecard (measured)
| Capture | Page | Perf | A11y | BP | SEO | LCP | TBT | CLS | Requests | Transfer |
|---|---|---|---|---|---|---|---|---|---|---|
| C-INV-001 | Guest page, ivory, WIB | 94 | 96 | 93 | 60* | 2.60 s | 186 ms | 0 | 19 | 323 KB (+71 KB clerk-js) |
| C-INV-002 | Guest page, gold-noir, WITA, 80-char name | 95 | 96 | 93 | 60* | 2.45 s | 172 ms | 0 | 18 | 294 KB (+71 KB) |
| C-INV-003 | Template preview `/templates/eternal-ivory` | 75 | 96 | 93 | 91 | 4.33 s | 411 ms | 0 | 26 | 356 KB |
| C-INV-004 | Marketing home `/` | 88 | 94 | 93 | 90 | 3.61 s | 130 ms | 0 | 62 | 413 KB (+71 KB) |
\* SEO 60 is expected: guest pages are correctly `noindex, nofollow`.
JS dominates guest-page weight: 195 KB of script for a page with zero client interactivity besides two forms; Lighthouse "unused JavaScript" ≈ 51 KiB.

## Findings
| ID | Sev | Area | Finding | Evidence | Modules |
|---|---|---|---|---|---|
| QA-001 | P0 | Correctness | Template choice silently discarded: `default_config.art` fails the strict schema → `createInvitation` stores `{}` (no palette, no preset sections) | probe 64/64 `unrecognized_keys: art` | M-008, M-009, M-010 |
| QA-002 | P0 | Correctness | Event times formatted in server timezone with hard-coded "WIB": akad 08:00 WIB renders **01.00 WIB**; resepsi 11:00–14:00 → **04.00–07.00 WIB**; WITA 19:00 → **11.00 WIB** | H-INV-002 (curl of C-INV-001/002 pages, TZ=UTC) | M-013 |
| QA-003 | P0 | Security / PDP | Guest slug = slugified name and is the only credential: anyone with the invitation link can guess `/i/x/budi-hartono`, see the guest's name, RSVP or post wishes as them. Unknown slugs return **200** with a streamed "tidak ditemukan" body, so enumeration works by content | code M-014/M-015; H-INV-006 | M-014, M-015, M-019 |
| QA-004 | P1 | Abuse | No rate limiting anywhere (no limiter in `app/`, `lib/`, middleware); wishes accept 1,000 chars per post without limit; `guestbook.moderation` is a flag nothing reads; `is_hidden` is never set | grep; code | M-014, M-019 |
| QA-005 | P1 | Data | RSVP overwrites the pax allowance (`guest_count`): decline → 0 → re-confirm capped at 1 | `app/i/[slug]/actions.ts:44-48` | M-014 |
| QA-006 | P1 | Performance | Guest page uncacheable: `Cache-Control: private, no-store` + `Set-Cookie: locale` from middleware + `force-dynamic`; 13 DB queries per open (loader runs twice: metadata + page) | H-INV-001; code | M-012, M-032 |
| QA-007 | P1 | Performance | Anonymous guests download clerk-js (+70.7 KB br / 325 KB parse) because `ClerkProvider` wraps the root layout | H-INV-004; `app/layout.tsx` | M-030, M-032 |
| QA-008 | P1 | A11y | Colour contrast fails: 11 nodes (ivory accent `#a1743c` on `#faf7f2` = 3.86:1) and 16 nodes on dark palettes (light ink on `bg-white/70` cards = **1.64:1**) | C-INV-001/002 Lighthouse `color-contrast` | M-013 |
| QA-009 | P1 | Share/SEO | No per-invitation share card: `og:title` = settings.title only, description/image inherited from the platform ("Invitesion — Undangan Pernikahan Digital"), no `og:image` → WhatsApp preview never shows the couple | C-INV-001 `og.image=false`; curl | M-012 |
| QA-010 | P1 | Scale | No indexes on `guest_messages(invitation_id, created_at)` / `analytics_events(…)`; per-view dedupe scans | migrations | M-035 |
| QA-011 | P1 | Creator UX | Editor "Pratinjau" opens `/${slug}` (no such route → 404); "Tema & Cover" tab gated on `config.addons.theme`, which the strict schema forbids → unreachable | editor.tsx:106,118 | M-018 |
| QA-012 | P2 | Security | Guest CSV export quotes values but does not neutralise `= + - @` → spreadsheet formula injection via guest names | analytics/route.ts | M-020 |
| QA-013 | P2 | Correctness | Per-invitation guest list builds `wa.me/<digits>` without 08→62 normalisation (the other page uses `toWhatsAppNumber`) | invitations/[id]/guests/page.tsx | M-019 |
| QA-014 | P2 | Assets/legal | Theme art hot-links Unsplash `…/download?force=true` (download-tracking endpoint) and sits outside our CSP `img-src` | theme-art.ts | M-007 |
| QA-015 | P2 | Religious text | Presets ship 3 Qur'an translations (QS 51:49, 14:40, 59:10) of unknown provenance/translation | templates.ts | M-006 |
| QA-016 | P2 | Media | No image pipeline: guests receive originals up to 5 MB, square-cropped `<img>`, no `srcset`/WebP/AVIF | upload route; renderer | M-027, M-013 |
| QA-017 | P2 | i18n | Guest UI strings hard-coded Indonesian; `settings.language: 'en'` presets (corporate, gala) still render "Rangkaian Acara", "Konfirmasi Kehadiran" | renderer | M-013, M-034 |
| QA-018 | P2 | Tests/CI | 49 tests cover rules/payment/SigV4 only; nothing on renderer, guest actions, editor, template sync; no CI workflow | tests/, `.github` absent | M-037 |
| QA-019 | P2 | Ops | No error tracking, tracing, uptime or log aggregation | repo | M-033 |
| QA-020 | P2 | Platform | Next.js **canary** in production; build fails without `POSTGRES_URL` | package.json; setup-log | M-033 |
| QA-021 | P2 | Non-prod | With `pk_test_` keys (preview/staging), every guest's first visit bounces through Clerk's handshake — demo links shared from staging break in in-app browsers | H-INV-005 | M-032 |
| QA-022 | P2 | Privacy | Gift account numbers render for anyone with `/i/:slug` (no guest link) and sit in the RSC payload | renderer | M-013 |
| QA-023 | P2 | Privacy | Per-guest open tracking without any guest-facing notice | public.ts | M-012 |
| QA-024 | P2 | Content | Marketing feature pages describe modules that are config-only (ticketing, seating, check-in, reminders) [INFERRED medium] | M-002 vs feature-inventory.csv | M-002 |
| QA-025 | P3 | Debt | Two `slugify` implementations; dashboard `any` types in editor; tokens named for an old brand ("Vienne"); stale comments ("63 tema"). *s10 correction:* the "Vienne" tokens lived only in the never-imported file now at `archive/tokens-old-brand.css`; the live naming debt is the deprecated `orange-*` alias in `app/globals.css`, and there are three `slugify` definitions (`lib/invitation/slug.ts` + two local copies) | code | M-015, M-018, M-036 |
| QA-026 | P3 | UX | Editor advertises SVG uploads; storage rejects SVG (correctly) → confusing error | editor.tsx:86, storage/index.ts:29 | M-018 |
| QA-027 | P3 | Data | RSVP deadline, `settings.linkSlug`, `revision_count` (max 3) exist but are never enforced/used | grep | M-009, M-014 |

## Security posture — what is good
- Guest names and wishes are React-escaped: hostile name `<img src=x onerror=…>` renders inert, zero raw `<script>` in output [OBSERVED H-INV-003].
- Ownership enforced at every query (`requireOwnedInvitation`), roles in DB, private admin entry.
- Upload allow-list (no SVG), `/media` served with `default-src 'none'; sandbox` + `nosniff`.
- Payment webhooks idempotent (`payment_events` unique), integer minor units, official test vectors.
- Baseline headers present; per-request CSP nonce infrastructure exists (report-only).
- Secrets: no live keys in tree/history (`_private/secrets-report.md`).

## In-app browsers (WhatsApp / Instagram)
Not testable without a physical Android device → [UNKNOWN]. Static risks: no audio exists yet (so no autoplay issue today); `upgrade-insecure-requests` + HSTS fine; Clerk handshake (QA-021) is the main in-app-browser hazard in non-production.
