<!-- SUMMARY (first 7 lines — greppable) -->
# module-map.md — stable module IDs (M-001…) for every later gap and upgrade
> WHAT: Each module: ID, paths, responsibility, quality notes (Q: 1 poor … 5 strong). Gap analysis and the upgrade map cite these IDs.
> STATUS: DONE (Phase 1) — base commit 22ed99e
> OWNER: Oracle (research)
> DEPS: architecture.md, feature-inventory.csv, quality-audit.md
> GREP: module, M-0, paths, responsibility, quality
> UPDATED: 2026-10-29

IDs are stable: if a module is split later, keep the old ID and add suffixes (M-013a, M-013b). Quality scores are [INFERRED] from reading the code at `22ed99e`, with the reason stated.

## Public site
| ID | Module | Paths | Responsibility | Q | Notes |
|---|---|---|---|---|---|
| M-001 | Marketing home | `app/page.tsx`, `app/hero-rotator.tsx`, `app/home.module.css`, `app/marketing-header.tsx`, `app/marketing-footer.tsx` | Landing page, hero rotator, nav | 4 | Hand-built editorial design in CSS Modules (988-line stylesheet); WhatsApp CTA points to a placeholder number `6281234567890` |
| M-002 | Marketing registry pages | `app/marketing-registry.ts`, `app/marketing-copy.ts`, `app/marketing-public-page.tsx`, `app/event-types/**`, `app/features/**`, `app/resources/**` | ~90 programmatic SEO pages (event types, features, resources) | 3 | Content mirrors an RSVPify-style IA (docs/RSVPIFY_FEATURE_MATRIX.md); many feature pages describe capabilities the product does not have yet (risk of over-claiming) |
| M-003 | Pricing page | `app/pricing/page.tsx`, `lib/pricing.ts` | Price display; single price source | 3 | Page copy and `lib/pricing.ts` disagree (AUDIT B8) |
| M-004 | Template catalog | `app/templates/page.tsx`, `app/templates/catalog-client.tsx`, `catalog-ui.module.css`, `templates.module.css` | Filterable catalog (category, style, tier) | 4 | Good filter UX; cards are pure-CSS art + Unsplash photos |
| M-005 | Template preview | `app/templates/[slug]/page.tsx`, `preview-client.tsx` (649 lines), `preview.module.css`, `art.module.css` | Rich per-template preview on the marketing side | 3 | The most "designed" invitation surface in the repo — but it is a marketing mock, not the renderer guests receive (see template-system.md §4) |

## Template & invitation core
| ID | Module | Paths | Responsibility | Q | Notes |
|---|---|---|---|---|---|
| M-006 | Template registry | `lib/invitation/templates.ts` | 64 templates: category (27), style tags (12), motif (12), tier, palette (18), font, preset config | 3 | Clean data contract, but presets embed 3 Qur'an translations of unknown provenance; header comment says 63 |
| M-007 | Theme art pools | `lib/invitation/theme-art.ts` | ~105 Unsplash photo IDs in 22 mood pools, round-robin per template | 2 | Hot-links `unsplash.com/photos/<id>/download?force=true` (download endpoint, not an image CDN URL); blocked by our own CSP `img-src` once enforced |
| M-008 | Template sync & seed | `lib/invitation/template-sync.ts`, `scripts/seed-templates.ts`, `lib/db/seed.ts` | Upserts registry rows into `templates` by name; writes `thumbnail` + `defaultConfig.art` | 2 | Writes `art` into `defaultConfig`, which the strict schema rejects → P0 (quality-audit.md QA-001) |
| M-009 | Detail config schema | `lib/invitation/detail-config.ts` | Zod contract for the invitation `config` JSON (30+ optional sections) | 4 | Strong validation; `.strict()` turns any extra key into a silent full-config loss at read sites that use `safeParse → {}` |
| M-010 | Invitation service | `lib/invitation/service.ts`, `lib/invitation/create.ts` | Ownership checks, config merge+validate, version rows, media ordering | 4 | Ownership enforced per query; versions are append-only and never pruned |
| M-011 | Publish pipeline | `lib/invitation/publish.ts`, `lib/invitation/publish-rules.ts` | Publish gate (name + dated event + paid order), 12-month active period | 4 | Pure rules unit-tested |
| M-012 | Public page & loader | `app/i/[slug]/page.tsx`, `app/i/[slug]/[guestSlug]/page.tsx`, `lib/invitation/public.ts`, `lib/invitation/public-url.ts` | Loads invitation + guest + media + wishes; view tracking via `after()` | 3 | `force-dynamic`; loader runs twice per request (metadata + page, no `cache()`); metadata is title-only |
| M-013 | Public renderer | `components/invitation/public-renderer.tsx` | Deterministic config → HTML for every template | 2 | One layout for all 64 templates; only 4 palette colours vary; no music, countdown, cover gate, couple profiles, calendar, copy button, motion; times in server TZ + hard-coded "WIB" |
| M-014 | Guest interactions | `app/i/[slug]/actions.ts` | RSVP + wish server actions (PRG redirect) | 3 | Guest slug is the only credential; no rate limit; RSVP overwrites the pax allowance |
| M-015 | Slug rules | `lib/invitation/slug.ts` (+ a second `slugify` in `app/(customer)/dashboard/guests/actions.ts`) | Name → slug, collision suffix | 2 | Guest slugs are guessable; two divergent implementations (one strips diacritics, one does not) |

## Customer dashboard
| ID | Module | Paths | Responsibility | Q | Notes |
|---|---|---|---|---|---|
| M-016 | Dashboard shell | `app/(customer)/dashboard/customer-shell.tsx`, `layout.tsx`, `page.tsx` | Navigation, overview | 3 | — |
| M-017 | Invitations list & create | `app/(customer)/dashboard/invitations/page.tsx`, `actions.ts` | List, create from template, publish | 3 | — |
| M-018 | Invitation editor | `app/(customer)/dashboard/invitations/[id]/edit/editor.tsx`, `page.tsx` | Form-based module editor (16 modules) | 2 | No live preview, manual save, `any`-typed state; "Pratinjau" links to `/${slug}` (404 — public route is `/i/…`); theme tab gated on `config.addons.theme`, a key the strict schema forbids → unreachable |
| M-019 | Guest management | `app/(customer)/dashboard/guests/**`, `app/(customer)/dashboard/invitations/[id]/guests/**` | Add guest, mark sent, RSVP override, manual check-in, wa.me links | 2 | One-by-one add (no bulk import); one wa.me link variant skips 08→62 normalisation |
| M-020 | Guest CSV export | `app/(customer)/dashboard/invitations/[id]/analytics/route.ts` | CSV of guests (named "analytics") | 2 | No spreadsheet-formula neutralisation (CSV injection via guest names) |
| M-021 | Manage center | `app/(customer)/dashboard/invitations/[id]/manage/**` | Operational module config panel | 2 | Config-only modules (registration, meals, seating, ticketing) with no guest-facing UI |
| M-022 | Event planner | `app/(customer)/dashboard/planner/**`, `invitations/[id]/planner/**`, `event-blueprint/**` | Internal checklist/notes | 3 | Not guest-facing |
| M-023 | Customer templates | `app/(customer)/dashboard/templates/**` | Pick/use a template | 3 | Feeds M-017 → affected by QA-001 |
| M-024 | Checkout | `app/(customer)/dashboard/invitations/[id]/checkout/**` | QRIS / Stripe payment for activation | 3 | QR rendered from server SVG |

## Commerce, media, platform
| ID | Module | Paths | Responsibility | Q | Notes |
|---|---|---|---|---|---|
| M-025 | Payment core | `lib/payment/*` | Money (minor units), QRIS EMVCo payload + CRC, provider adapters, settlement, entitlement per (invitation, template) | 4 | Best-engineered area: idempotent settlement, official test vectors; acquirer not chosen (AUDIT B5) |
| M-026 | Payment webhook | `app/api/payments/[rail]/webhook/route.ts` | Signature check, idempotent event log | 4 | `payment_events` UNIQUE(rail, event_id) |
| M-027 | Media API | `app/api/invitations/[id]/media/**`, `upload/route.ts`, `app/media/[...path]/route.ts` | Upload (5 MB, image types), ordered gallery, sandboxed serving | 3 | No image resizing/WebP/AVIF; no `next/image`; originals served to guests |
| M-028 | Storage drivers | `lib/storage/*` | Local disk or S3-compatible (own SigV4) | 4 | Unit-tested signer; not tested against a real bucket (AUDIT B2) |
| M-029 | Detail API | `app/api/invitations/[id]/detail/route.ts`, `lib/api/respond.ts` | PATCH config | 4 | Validates merged config |
| M-030 | Auth bridge | `lib/auth/clerk-user.ts`, `lib/auth/clerk-appearance.ts`, `app/(login)/**`, `app/api/user/route.ts`, `lib/db/queries.ts` | Clerk session → local `users` row, roles in DB | 4 | Clean separation of identity and authorisation |
| M-031 | Admin panel | `app/(admin)/admin/[entry]/**`, `lib/auth/admin-access.ts` | Private-entry admin: orders (manual confirm), customers, templates, activity | 3 | Several pages are stubs (8–17 lines) |
| M-032 | Middleware | `middleware.ts` | Clerk session, protected-route redirect, locale, per-request CSP nonce (report-only) | 3 | Runs on every request incl. guest pages; sets `locale` cookie on every response → public pages uncacheable |
| M-033 | Config & env | `lib/env.ts`, `next.config.ts` | Env validation, security headers, PPR | 4 | Build fails when `POSTGRES_URL` is absent (DB evaluated at build) |
| M-034 | i18n | `lib/i18n.ts`, `lib/locale-server.ts` | id/en resolution, a few labels | 2 | Guest renderer is Indonesian-only hard-coded strings; `settings.language` ignored |
| M-035 | Data layer | `lib/db/schema.ts`, `lib/db/drizzle.ts`, `lib/db/migrations/` | 18 tables, 9 migrations, pool max 10 | 3 | Missing indexes on hot tables (data-model.md §5) |
| M-036 | Design system | `app/globals.css` (hex tokens: `--primary` `#e80053`, `brand-50…950` scale, light-only `color-scheme`), `components/ui/*`, `components/brand/wordmark.tsx`; retired `archive/tokens-old-brand.css` (old root `tokens.css`, oklch tokens of the earlier "Vienne" brand, never imported, archived 2026-10-29) | Tokens, shadcn primitives | 3 | (s10 correction: the oklch/spacing/easing tokens described here earlier exist only in the archived file.) Dashboard uses slate/brand Tailwind, marketing uses CSS Modules |
| M-037 | Tests | `tests/*.test.ts` | 49 node:test cases: publish rules, payment, SigV4 | 3 | Nothing covers renderer, guest actions, editor, template sync (QA-001 would have been caught) |
| M-038 | Verification scripts | `scripts/verify-payment.ts`, `scripts/verify-detail-backend.ts` | DB-backed smoke checks | 3 | Manual |
| M-039 | Agent process docs | `AGENTS.md`, `AGENT_WORKFLOW.md`, `docs/**` (incl. `docs/specs/REBUILD-HANDOFF-A-Z.md`, moved from the root 2026-10-29) | Router, specs, worklogs, prior audit | 4 | Rich and mostly accurate; some docs describe planned systems (WA blast, AI agents) as if designed in detail |
| M-040 | AI / messaging schema | `conversations`, `messages`, `intake_session`, `agent_tasks`, `wa_log`, `customer_memory`, `customer_session_summary` tables | Planned WhatsApp + AI agent ecosystem | 1 | Tables only, no code (AGENTS.md "Direncanakan") |
