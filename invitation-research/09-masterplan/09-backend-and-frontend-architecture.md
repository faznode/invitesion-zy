<!-- SUMMARY (first 7 lines — greppable) -->
# 09-backend-and-frontend-architecture.md — target architecture, measured Rust verdict, data changes, deployment, operations, rollback
> WHAT: The architecture we keep and evolve: guest page, editor and marketing frontends; server actions, data layer and schema changes; the measured Next.js vs Rust decision (ADR-A1); deployment, observability and rollback.
> STATUS: **s26 (2026-11-06): §8 target architecture added** (ADR-A2: Rust as the authoritative backend, domain by domain, with drizzle-kit as the single migration owner; ADR-F1: Next.js stays; feasibility experiment 17 / 17 with TypeScript parity); not FINAL while the research gate is open. **s25 (2026-11-06): body brought to current code.** §1 adds the outcome since s09 (B-014 step 1, D-039, E-042 / E-043: 22.2 ms per view; ADR-A1 unchanged); the §2 "today" column and the §3 data model describe the s25 code (migrations 0000–0015); §4 adds the s21 single-host measurements; §7 records DA-01. The s09 spike sets (`../08-backend-rust-plan/spike/results/s09-20261103-r{1,2}/`, `…-cache{,-r2}/`) are unchanged and not re-run. Earlier: verified s10 (v1 s09).
> OWNER: Research agent (Architect role)
> DEPS: ../08-backend-rust-plan/README.md, 04-current-state.md, 06-backlog.md, 08-template-system-and-harness.md, 10-data-privacy-security-payments.md, 12-decision-log.md (ADR-A1, ADR-O01, ADR-O06), ../01-codebase-audit/revalidation-s10.md
> GREP: architecture, frontend, backend, rsc, server action, cache, rust, axum, sqlx, verdict, schema, migration, deployment, observability, rollback, D-039, use cache, ADR-A2, ADR-F1, data ownership, strangler
> UPDATED: 2026-11-07 (s34: §8 service boundary, ADR-A3 for browser writes)

## 1. Decision in one paragraph
Invitesion stays a single Next.js App Router application on Postgres (Drizzle) with Clerk for identity (ADR-A1). The s09 spike shows the guest page's cost is our own render path rather than the runtime: the product page needs ≈ 27–30 ms server CPU per page in the lab, the same server doing one load and minimal HTML ≈ 4 ms, and Rust doing identical work ≈ 0.3 ms but then waits on Postgres. A fourth measurement (loader in React `cache()`, two rounds) isolates the duplicate loader call: it costs about a third of the database CPU per page and nothing measurable on the server, so ≈ 85–90 % of the server CPU is rendering the full template. The plan therefore fixes correctness first (allowance and unknown guests shipped in s09 as B-007 and B-011; view dedupe next as B-017a), then caches the invitation-level render inside Next.js (B-014), adds telemetry, and keeps a documented trigger for an incremental Rust service on a future non-React hot path.

**What happened since (s11–s21; ADR-A1 unchanged):**
- **Correctness shipped:** B-007 and B-011 (s09), then B-017a (s11; a per-guest advisory lock, because a 30-minute window is not a unique key).
- **The duplicate loader is gone** (B-014 step 1, E-013).
- **The invitation-level cache was built and measured, then not shipped (D-039).** On Next.js `15.6.0-canary.59`, `'use cache'` reuses rendered work in the guest route (45 / 45 hits). But caching the whole page saved ≈ 1 ms of ≈ 29.6 ms, because Next still replays the cached Flight stream and SSR still parses it.
- **The profile's levers shipped instead:** no Clerk on guest pages (B-015, E-042) and shared date formatters (E-043). Server CPU went from 28.5 to **22.2 ms per view** on one host.
- **Still open:** the ≤ 2 × `next-min` target is not met, and no telemetry exists yet (G-020).
- **What is left:** React's HTML render and Flight work in proportion to the page. A shell cache is revisited only with a new measured mechanism or framework capability (D-039).

## 2. Frontend
| Surface | Today (s25; `7a00a6d` state in parentheses where it changed) | Target |
|---|---|---|
| Guest page `/i/[slug]/[guestSlug]` | Dynamic RSC render with PPR opted out, and **one loader call** (E-013; was two). **No Clerk provider or chunk** (E-042). **Five layouts** over one data path (classic default, four families, B-030). Countdown island, `calendar.ics` and `og.png` side routes, and a real 404 for unknown guests (s09). RSVP depth (B-027); a child's photo through `…/photo/<slot>` with per-request checks (D-040). Census (s24, decoded): documents 38.6–72.2 KiB per family on the review fixture, of which the inline RSC payload is 30–44 KiB. Server CPU 22.2 ms per view. No cover or audio yet (B-009) | Per-guest personalization inside a cheaper render: a smaller payload, fewer client boundaries (LATEST §4; whole-page cache only per D-039). Template sections from manifests (B-030). Client islands only for cover and audio (B-009), countdown and optional lazy 3D. Budgets: harness gates exist and run by hand (B-012); CI (B-020) |
| Editor / dashboard | Client-heavy editor with five `any` types left. Preview opens the owner route `/preview/[id]` (s09). **Since s17:** the question editor (E-031), RSVP counts (E-033), answers on the host's guest page (E-036), the invite-only panel and host override (E-038), person and child photo uploads (E-039, E-047). **Theme entitlement checked on save since s26 (B-041, E-054).** **Since s32 (in the sandbox):** version-checked saves with autosave and the side-by-side preview behind a flag (B-035, E-071) and free switching within the paid tier (B-036, E-072), through either content writer | Signed-in acceptance (DA-01) before the autosave flag; the upgrade to a higher tier (U6); typed editor state as debt work |
| Marketing / catalog | Static pages; prices rendered from `lib/pricing.ts` (s09). The roadmap section lists unbuilt features as roadmap items (s25 spot check) | Template previews from manifests; claims audited against shipped features (B-022) |
| Styling | Tailwind 4 and shadcn; brand tokens in `app/globals.css`. Template palettes in `lib/invitation/palettes.ts` are **contrast-safe token pairs with a photo bound** (B-016, E-015). Family layouts use the shared tokens and fonts | Template tokens from manifests |

Rules carried into the custom skills: no client JavaScript on the guest page unless the island is declared in the manifest; images through a resize pipeline (B-019); fonts self-hosted, two families maximum; `prefers-reduced-motion` honoured wherever motion exists.

## 3. Backend
- **Writes from guests** are server actions (`app/i/[slug]/actions.ts`) authorised by the guest link. Rules kept; fixes: attending count stored separately from the allowance (B-007, shipped s09), opaque links (B-011, shipped s09 behind a default-off flag; slug links stay compatible), rate limits and moderation (B-013).
- **Reads** go through `lib/invitation/public.ts`. Changes: React `cache()` per request (database CPU per page ≈ −1/3, measured); the invitation-level render (guest-independent template sections) cached per invitation with tag invalidation on publish / edit / wish / moderation, guest-specific parts rendered per request, tested for cross-guest leakage (B-014); the view tracker becomes one atomic statement (B-017a).
- **Data model changes (all additive, each in its own migration):** No column is dropped or rewritten; old code keeps working against the new schema.

  **Shipped:**
  - 0009 `guests.attending_count` (nullable; null = legacy rows).
  - 0010 `guests.link_token` (nullable; unique when set).
  - 0011 a view-dedupe index. A per-guest advisory lock is used instead of a uniqueness rule (B-017a).
  - 0012 RSVP answers.
  - 0013 durable event ids.
  - 0014 answers per event.
  - 0015 `guests.invited_event_ids` (D-037).
  
  **s28:** the `guest_messages` index exists (migration 0017, `guest_messages_invitation_visible_idx`, used by the guest page's list and count; E-060).
- **s25 state of the read and write fixes above (s28 updates in brackets):**
  - `cache()` shipped (E-013); the invitation-level cache was not shipped (D-039).
  - The view tracker is atomic (E-012).
  - Rate limits and moderation were open (B-013, B-028). [s28: RSVP and wish limits exist on the Rust writers (E-059, E-060); moderation, replies and visibility shipped with R-04 (D-044).]
  - Children's photos follow D-040's access contract: ownership is checked at save, render and delivery, and `/media/protected/*` is owner-only.
- **Template-owned data** (`art`, later section components) stays out of the strict per-invitation `DetailConfig` (ADR-O01).
- **Payments** keep the rail interface and manual confirmation until a PJP contract exists (ADR-O03).
- **Background work** (WhatsApp blasts, OG image generation at scale) is not built; when needed it goes to the platform's queue/workflow primitives before any self-managed Redis.

## 4. Measured comparison (summary; full data in `../08-backend-rust-plan/README.md` §3)
| Lab measure (round 1) | Product page | Next.js minimal route | Rust minimal route |
|---|---|---|---|
| Read spike throughput, 40 VUs | 36 req/s | 242 req/s | 1,156 req/s (Postgres-bound) |
| Server CPU per page | ≈ 30 ms | ≈ 4 ms | ≈ 0.3 ms |
| Postgres CPU per page | ≈ 3.2 ms | ≈ 1.4 ms | ≈ 1.0 ms |
| p95 at 10 req/s | 35.5 ms | 6.8 ms | 2.3 ms |
| RSVP burst throughput | 261 req/s | 359 req/s | 1,439 req/s |
| Server RSS | ≈ 0.7 GB | ≈ 0.7 GB | 6 MB |
Round 2 (reversed order) stayed within 2–24 % of round 1. Product page with the loader in `cache()` (two rounds): server CPU per page 25–31 ms (unchanged), Postgres CPU per page ≈ 2.0–2.2 ms (≈ −1/3). Write consistency held on every arm; the view-dedupe race and the allowance overwrite reproduced on every arm (stack-independent defects; the allowance overwrite was fixed in s09 by B-007, the view-dedupe race is B-017a). A minimal Rust page is not the product page; the product page needs the React template system wherever it runs.

**Since s09** (one host, same data, before vs after interleaved; IMPLEMENTATION-LOG E-042 / E-043, D-039; not the spike harness):
- The guest route's server CPU per view went 28.5 → 24.9 ms with E-042, then → 22.2 ms with E-043.
- A `'use cache'` whole page saved ≈ 1 ms of ≈ 29.6 ms.
- These figures compare our own builds. They do not change the round-1 table above, and they are not a Rust comparison.

## 4a. Client-side measurements of our own builds (s23r, RQ-OWN-02)
Three builds on one host, interleaved, 6 Lighthouse runs each (`../04-template-benchmarks/own-builds/own-build-comparison-s23r.md`):
- The s23r page paints ≈ 0.67–0.82 s earlier than `22ed99e` and `9bbd813`.
- It transfers ≈ 67–69 KB less than either.
- LCP, TBT and score are not established.

This is a separate population from the competitor captures and is never pooled with them.

## 5. Deployment and operations
Vercel functions in `sin1` with the database in the same region (ADR-O06); a connection pooler in front of Postgres before raising concurrency; telemetry for `/i/*`, RSVP and wishes before any further performance claim; no guest personal data in logs. Detail and runbook seeds: `../08-backend-rust-plan/README.md` §4–§6.

## 6. Rollback strategy
Code changes revert with the deploy; schema changes are additive and stay in place when code is reverted; caching and new guest-link tokens sit behind flags; the template system v2 keeps today's renderer as the fallback for templates without section components. No component of this plan requires a one-way migration.

## 7. Open dependencies (not invented here)
Hosting and database regions and plans, real Clerk keys (production middleware behaviour, P-INV-010), traffic history or analytics access, PJP contract, legal review of retention and gift money.

- **Real Clerk keys (s25):** the owner deferred real-Clerk signed-in acceptance out of this rebuild phase (DA-01, `../_handoff/deferred-acceptance.md`). Builds with middleware compile with placeholder keys and are never served; measurement builds omit middleware (D-012).
- **Children's-photo migration:** running it in real environments is a deployment step (DA-02).

## 8. Target architecture (s26: ADR-A2 backend, ADR-F1 frontend)
§1–§7 describe today's system and ADR-A1's measured history, which stand. This section is the target that the upgrade order (`06-backlog.md` "Upgrade order (s26)") implements. **It is not FINAL while the research gate is open** (`../_handoff/research-closure-s26.md`).

**Implementation status (s28):** R-04 completed in the sandbox (E-060, D-044): guest wishes, the host's moderation (show, hide, delete) and replies write through `BACKEND_WISHES` (default `next`, no fallback) with R-03's key, retry, limit and address contract; the guest page lists visible wishes only through migration 0017's index; `scripts/verify-wishes-api.ts` runs in the rust job. R-03 completed in the sandbox (`../_handoff/IMPLEMENTATION-LOG.md` E-059, D-043): both RSVP call sites write through `BACKEND_RSVP` (default `next`, no fallback) with an `Idempotency-Key` on every write and one retry under the same key, shared per-link and per-address limits, and a trusted-proxy client address (`lib/net/client-address.ts`); `scripts/verify-rsvp-api.ts` runs in the rust job. Its rollout is operational, like R-02's. **(s27):** the product service exists in `services/api` with R-01's foundation and R-02's views slice (`../_handoff/IMPLEMENTATION-LOG.md` E-057, E-058; contract in `services/api/openapi.json`, writer selection in `lib/backend.ts`, views live on `next` until the rollout gates pass). F-01 moved the frontend to Next.js 16.4.5 stable with `proxy.ts` (E-056). The s26 experiment stays frozen research. Deployment, trace export and the 7-day observations are open operational steps.

### 8.1 Decision
- **Rust becomes the authoritative backend for domain rules and writes, one data domain at a time (strangler).** Next.js stays the presentation layer (§8.9).
- ADR-A1's measurements remain true: the guest-page cost is the React render (≈ 85–90 %), and Rust does not remove it, so speed is **not** the reason.
- The reasons:
  - the owner's direction;
  - one authoritative writer per domain behind typed contracts;
  - the planned non-React workloads, which are ADR-A1's own revisit triggers: QR check-in with offline sync (B-024), jobs for image derivatives, retention and digests, and provider webhook fan-out;
  - predictable resource use.
- The isolated experiment `../08-backend-rust-plan/feasibility-s26/` passed 17 / 17 tests. Its port of B-017a matches the TypeScript writer on the same database, and its parity guard reads the TypeScript source.

### 8.2 Stack (pinned at s26; exact versions in each crate's `Cargo.lock`)
| Concern | Choice | Why |
|---|---|---|
| HTTP | axum 0.8, tower-http 0.7, tokio 1 | Mature tower ecosystem; one router runs under the Vercel adapter or as a container |
| Database | sqlx 0.9 (Postgres), compile-time-checked queries with committed offline metadata; statement cache off behind a transaction pooler | Typed SQL on the existing schema, no ORM (repository rule), no database needed at build time |
| Migrations | **drizzle-kit stays the single migration owner** (0000–0015 and onward) until a later ADR moves them; Rust runs no DDL | One migration history per database; avoids two tools fighting over one schema |
| Contracts | OpenAPI 3.1 generated from Rust types (utoipa 6), committed; a generated TypeScript client in Next.js; CI fails on drift | Contract tests on both sides |
| Errors | RFC 9457 problem+json with stable `code` (`domain.reason`); `x-request-id` correlation; no internals | Shown in the experiment (`problem.rs`) |
| Tokens and signatures | jsonwebtoken 11 (pure-Rust backend) for owner tokens; hmac 0.13 / sha2 0.11 for service signatures and payment signing | Shown in the experiment; no C toolchain needed for crypto |
| Telemetry | tracing (JSON), OpenTelemetry 0.33 traces and metrics | G-020 promoted; ADR-A1 made telemetry the precondition of performance claims |
| Storage | object_store 0.14 (S3-compatible; local disk in dev, same layout as `lib/storage/`) | One API for both |
| Outbound HTTP | reqwest 0.13 | Payment providers, JWKS |
| Toolchain | stable Rust (1.99 at s26), edition 2024 | Current |

### 8.3 Data domains: one writer and one migration owner each
| Domain | Tables (columns) | Writer today | Target writer and slice |
|---|---|---|---|
| Guest interactions | `analytics_events`; `guest_messages`; the RSVP columns of `guests` (status, attending count, answers, per-event answers, response time, `opened_*`) | `app/i/[slug]/actions.ts`, `lib/invitation/view-tracking.ts`, the host's RSVP override in the dashboard guest actions | **Rust, U2**: views → RSVP (guest form and host override together) → wishes with rate limits and moderation |
| Guest roster | the roster columns of `guests` (name, slug, phone, allowance, invited events, opaque token) | dashboard guest actions | Next.js until **U4** (bulk import, B-033), then Rust |
| Invitations and content | `invitations`, `invitation_versions`, `templates` | `lib/invitation/{create,service,publish}.ts`; payment activation | Next.js (B-041 fixed there in U1, s26 E-054) until **U4** (editor API), then Rust; content contract exported as JSON Schema for both |
| Media | `media_assets`, storage objects | upload route, `lib/storage/` | Rust jobs for derivatives in **U3**; delivery of protected media (D-040) unchanged until then |
| Orders and payments | `orders`, `payments`, `payment_events` | `lib/payment/service.ts`, webhook routes | Rust in **U6** with the PJP (webhooks authoritative) |
| Identity | `users` (Clerk mapping, roles) | Next.js | **Stays Next.js** (Clerk owns sessions); Rust reads it |
| Agent and CRM (planned) | `conversations`, `messages`, `intake_session`, `agent_tasks`, `wa_log`, `customer_memory`, `customer_session_summary` | none today | Rust when built |

Rules:
- **Never two writers for a column group.** A slice moves every writer of its columns at once; the flag selects exactly one implementation.
- **Migration ownership:** drizzle-kit for every domain until a later ADR. Changes are expand → migrate → contract and stay backward-compatible across one release.
- **Readers:** Next.js may read any table read-only during the transition. Guest-page rendering keeps its single direct read (E-013) until a Rust view-model endpoint is measured within budget (U4).
- **Shared rules:** a rule needed for both rendering and validation (event eligibility D-037, child photos D-040, window rules) gets language-neutral contract vectors that both test suites run, as `feasibility-s26/vectors/` does.

### 8.4 API contract
- JSON over HTTPS under `/v1`, resources by domain (`/v1/views`, `/v1/guest-links/{slug}/{guest}/rsvp`, `/v1/invitations/{id}/guests/{guest}/rsvp-override`, …). Validation errors list field paths.
- Unsafe POSTs that can be retried accept `Idempotency-Key` (stored with a response hash for 24 h): RSVP and checkout.
- Storage times are UTC (`timestamp` holding UTC wall time, as today); event-local display stays in Next.js (E-004).

### 8.5 Authentication and authorization
- **Sessions:** Clerk through Next.js, unchanged (DA-01 deferred).
- **Owner calls:** Next.js forwards the owner's session token. Rust verifies it as follows (shown with generated keys in the experiment):
  - RS256 against the issuer's JWKS, cached and refreshed on an unknown `kid`;
  - issuer, `exp` and `nbf` with 5 s leeway;
  - `azp` among the allowed origins;
  - `sub` mapped to `users.clerk_user_id`;
  - roles from the database.
- **Guest calls:** the guest link (slug, or the opaque token under `FLAG_OPAQUE_GUEST_LINKS`) is the credential, checked in Rust by the same rules (B-011, D-037, D-040).
- **Service boundary:** every call carries the internal HMAC signature (two secrets accepted during rotation). The API is not browser-facing in U2–U4 (no CORS). Browser or app access, such as the offline QR scanner, needs its own ADR covering CORS, CSRF and rate limits. **Settled for the scanner by ADR-A3 (s34):** the browser writes only through same-origin Next.js routes (a Fetch Metadata or Origin check before the session is read, JSON only, a limit per host and invitation), which call the roster facade; the API stays private and sends no CORS headers.
- **Authorization** is checked in Rust on every request: owner match for invitation-scoped resources, staff roles for admin endpoints. Each endpoint has a cross-tenant denial test.

### 8.6 Payments, idempotency, background jobs
- **Payments stay in Next.js until U6.** They work today (`verify-payment` 10 / 10 in s26), and no acquirer is chosen (ADR-O03). When they move:
  - webhooks are the authoritative writer of order state;
  - provider event ids are unique in `payment_events`;
  - transitions are conditional updates (`where status = expected`);
  - entitlements are granted through an outbox row in the same transaction;
  - checkout creation takes an idempotency key;
  - signature code is ported with the official test vectors.
- **Jobs:** a Postgres `jobs` table (`run_at`, `attempts`, `last_error`, `locked_until`; `for update skip locked`), processed at least once by idempotent handlers. A cron-invoked Rust function runs them every minute (or a worker container, see §8.8). **No Redis or BullMQ:** the planned line in `AGENTS.md` changes when the first job ships. Uses:
  - image derivatives (U3);
  - follow-up digests (U4);
  - retention deletion (U5);
  - webhook fan-out (U6).

### 8.7 Media
Uploads keep the current route until U3. U3 adds derivative jobs (resize, AVIF / WebP, `srcset` widths, Save-Data variants for I-28). Protected media keep owner-only delivery (D-040). When delivery moves, Rust issues short-lived signed URLs after the ownership check.

### 8.8 Deployment, observability, rollout, rollback
- **Hosting:** the Vercel Rust runtime (public beta on Fluid compute, checked s26) in `sin1`, beside Next.js and the database (ADR-O06), with the axum router behind the runtime adapter.
  - Fallback: the same binary as a container in Singapore or Jakarta, if the beta fails a slice's gate (cold start, pooling, duration).
  - Connections go through the provider's pooler.
- **Observability:** JSON logs with request ids, traces, and RED metrics per endpoint. SLO for guest writes: p95 ≤ 300 ms at the API and errors ≤ 0.5 % per day. Alerts exist before any cutover.
- **Rollout per slice:**
  1. Contract tests green in CI on a migrated Postgres (both implementations on the shared vectors).
  2. Preview deployment under synthetic load within SLO.
  3. `BACKEND_<DOMAIN>=rust` in Next.js, preview then production.
  4. Seven days within the error budget.
  5. Remove the TypeScript writer.
- **Rollback:** flip the flag back (seconds). The schema is unchanged by the slice, and data keeps the same columns and semantics (proven by the shared vectors). Never two writers at once.

### 8.9 Frontend (ADR-F1): keep Next.js
| Criterion | Next.js (current) | Astro | SvelteKit | React Router 7 | Leptos (Rust) |
|---|---|---|---|---|---|
| Marketing and catalog discoverability | SSG / ISR, metadata API (shipped) | excellent static output | good | good SSR | possible, young ecosystem |
| Invitation metadata and share previews | per-invitation OG image route (E-010), `generateMetadata` (shipped) | rebuild | rebuild | rebuild | manual |
| Guest-page performance and caching | **measured**: FCP 950 ms vs 1,624 ms, 262 KB, 22.2 ms server CPU per view (RQ-OWN-02, E-042 / E-043); D-039 rejected a shell cache | islands would still be React islands (families are React); unmeasured | smaller runtime after a rewrite; unmeasured | similar React cost; unmeasured | WASM hydration cost; unmeasured |
| Editor and dashboard | existing React editor and question editor | needs a second island framework | rewrite | high reuse, data layer rewritten | rewrite |
| Rust API integration | server actions and route handlers call the API with a generated client | same over HTTP | same | same | shared Rust types (its one advantage) |
| Hosting and operations | existing Vercel setup | new pipeline | new pipeline | new pipeline | new pipeline |
| Reuse and migration effort | 100 %: five layouts, 311 tests, the harness gates bound to Next builds | rewrite of families, editor and gates | rewrite | routing and data rewrite | rewrite |

**Decision: Next.js stays.** No measurement shows another framework fixes a problem we have. Switching would rebuild the frontend only to change technology.

Next.js responsibilities:
- all HTML: marketing and catalog, guest pages with per-guest parts, editor and dashboard;
- Clerk sessions;
- metadata and OG images;
- validation for presentation only.

Next.js never writes a migrated domain. It reads migrated domains through the API, apart from the measured guest-page read (§8.3).

Follow-ups:
- leave the canary release for a supported stable line (Next 16, the `proxy` convention): investigate in U1 behind the harness gates and the RQ-OWN-02 method; adopt in U2 if they hold;
- the inline RSC payload is the next render lever (B-014's remainder, investigate).
