<!-- SUMMARY (first 7 lines — greppable) -->
# 08-backend-rust-plan/README.md — backend plan: traffic model, measured spike, verdict on Rust, deployment, operations, cost/observability limits, rollback
> WHAT: Whether any part of Invitesion should move to Rust, decided from a matched local load spike (Next.js product page, Next.js minimal route, Rust Axum) and an evidence-only traffic model; plus the deployment and operations plan for the stack we keep.
> STATUS: Verified s10 (2026-11-04; v1 s09): the four s09 result sets re-checked with `summarize-spike.py --check` (exit 0), not re-run; matched workloads, reversed order and contention notes confirmed. Verdict recorded as ADR-A1 in `../09-masterplan/12-decision-log.md`; architecture chapter `../09-masterplan/09-backend-and-frontend-architecture.md`. Defects the spike found: the allowance overwrite was fixed in s09 (B-007); the view-dedupe race is open (B-017a).
> OWNER: Research agent (Architect role)
> DEPS: spike/README.md (method), spike/results/s09-20261103-r{1,2}/summary.md, spike/results/s09-20261103-cache{,-r2}/summary.md, ../09-masterplan/12-decision-log.md (ADR-O06), ../01-codebase-audit/{architecture,quality-audit}.md, lib/invitation/public.ts, app/i/[slug]/actions.ts
> GREP: rust, axum, next.js, spike, k6, traffic model, capacity, cache, view dedupe, allowance, deployment, observability, rollback
> UPDATED: 2026-11-03

## 1. Verdict (ADR-A1)
**Keep the Next.js stack; no Rust service now.** The measured cost of the guest page is in our own rendering path, which the current stack can remove, not in the runtime:
- Same server, same data: replacing the full React render with minimal HTML (`next` → `next-min`) cuts server CPU per page from ≈ 27–30 ms to ≈ 4 ms and raises read throughput ≈ 6.7–7.0× (36–39 → 242–271 req/s over two rounds) [OBSERVED, lab].
- The duplicate loader call is **not** the server-side cost: with the loader in React `cache()` (one call per request, §3.4) server CPU per page and throughput stay within the round-to-round spread (25–31 ms, 34–38 req/s), while Postgres CPU per page drops ≈ 30–39 % (≈ 3.1–3.2 → ≈ 2.0–2.2 ms) [OBSERVED, lab, two rounds]. So ≈ 85–90 % of the page's server CPU is rendering and serialising the full template, and the lever is caching that render per invitation.
- For identical minimal work Rust is another ≈ 11–12× cheaper in server CPU (≈ 4 ms → ≈ 0.33 ms) and ≈ 4.4–4.8× faster in this lab, but at that point **Postgres becomes the bottleneck** (≈ 112 % of a core while Rust uses ≈ 39 %) and the host is saturated; and a Rust page would not be the product page (no React templates).
- Correctness issues found are stack-independent: the view dedupe races on every arm and the allowance overwrite is a rule (both are schema/logic fixes, B-007 and B-017a).
Revisit triggers are in §8.

## 2. Traffic model (evidence only, ADR-O06)
No production traffic, analytics or revenue figures exist, and none are assumed. What the evidence supports:
- **Shape** [OBSERVED in code + INFERRED]: distribution is a WhatsApp blast of per-guest links (`/i/<invitation>/<guest>`), so opens arrive in bursts after each send; RSVP and wishes trickle; day-of check-in is a separate burst at the venue (not built yet).
- **Scale signals** [CLAIMED]: Indoinvite "1,4 juta undangan, 4,5 juta tamu" and 500K+ Android installs; PALEO 500K+ installs (dossiers S-IDI, S-PLO-003). The definition of "tamu" is unknown, so no per-invitation guest count is derived from it.
- **Capacity formula** [ESTIMATE method]: peak guest-page rate R = k × b × G × f / W, with k invitations blasting at once, G links per invitation, f the share opened within W seconds, b the burst factor of the busiest minute. Required server cores ≈ R × c, with c = server CPU-seconds per page from §3.
- **Worked illustration (inputs are ASSUMPTIONS, not forecasts):** G = 300 (the spike fixture), f = 0.5, W = 600 s, b = 3 → 0.75 pages/s per blasting invitation. At c ≈ 0.030 s (today's page) one core serves ≈ 44 such invitations blasting at the same moment; at c ≈ 0.004 s (the `next-min` level: the data path without the full React render) ≈ 330. Replace every input with owner data before any capacity or cost decision.

## 3. Measurements (session 09, matched rerun, method in `spike/README.md`)
Lab: 2 vCPU / 4.2 GB VM, Postgres 16.15 on the same host, k6 v0.54.0 on the same host, pool 10 on every arm, fake data (300 guests, 120 wishes), production build of `64678cf` without middleware (P-INV-010), Node 24.16.0, Next.js 15.6.0-canary.59. Every row below passed the validity rules (≥ 99 % checks, < 1 % failures, sampler plausible; `summarize-spike.py <set> --check` exit 0 for r1 and r2). Round 1 order next → next-min → rust; round 2 reversed. Full tables: `spike/results/s09-20261103-r1/summary.md`, `…-r2/summary.md`. Rust binary: SHA-256 prefix `89a53385141fd4ca`, `cargo build --release --locked` with rustc 1.99.1 (`Cargo.lock` unchanged); the `rustc=` line in the r1/r2/cache `rust-env.txt`/`next-env.txt` files holds a rustup error because the runner did not export `RUSTUP_HOME` (fixed after the runs; the hash identifies the binary).

| Scenario (round 1) | Metric | `next` (product page) | `next-min` | `rust` |
|---|---|---|---|---|
| Read spike, 40 VUs | req/s | 36.2 | 241.8 | 1,155.9 |
| | p50 / p95 ms | 1,009 / 1,279 | 147 / 199 | 29 / 49 |
| | server CPU ms per page | 29.8 | 4.1 | 0.34 |
| | Postgres CPU ms per page | 3.2 | 1.4 | 0.97 |
| | server RSS max | 758 MB | 721 MB | 6.4 MB |
| | host busy (of 200 %) | 131 % | 149 % | 192 % (saturated) |
| RSVP burst, 20 VUs | req/s | 260.9 | 359.3 | 1,438.9 |
| | p50 / p95 ms | 68 / 95 | 49 / 72 | 12 / 19 |
| | server CPU ms per write | 3.7 | 2.6 | 0.21 |
| Fixed 10 req/s | p50 / p95 ms | 24.0 / 35.5 | 5.2 / 6.8 | 1.7 / 2.3 |
| | server CPU ms per page | 27.5 | 4.9 | 0.7 |
| Response size | bytes (uncompressed) | 141,700 | 6,001 | 5,991 |

### 3.1 Repeatability (round 1 → round 2, order reversed; every row valid in both)
| Scenario | Arm | req/s r1 → r2 | p95 ms r1 → r2 | server CPU ms per request r1 → r2 | Postgres CPU ms per request r1 → r2 |
|---|---|---|---|---|---|
| read spike | `next` | 36.2 → 38.9 (+7.6 %) | 1,279 → 1,163 | 29.8 → 27.2 | 3.20 → 3.06 |
| | `next-min` | 241.8 → 271.4 (+12.2 %) | 199 → 174 | 4.07 → 3.67 | 1.40 → 1.23 |
| | `rust` | 1,155.9 → 1,184.2 (+2.4 %) | 49 → 43 | 0.34 → 0.33 | 0.97 → 0.96 |
| RSVP burst | `next` | 260.9 → 324.5 (+24.4 %) | 94.5 → 76.4 | 3.74 → 2.93 | 1.12 → 0.98 |
| | `next-min` | 359.3 → 372.2 (+3.6 %) | 71.8 → 70.8 | 2.58 → 2.48 | 1.04 → 0.98 |
| | `rust` | 1,438.9 → 1,501.4 (+4.3 %) | 18.8 → 18.0 | 0.21 → 0.22 | 0.78 → 0.76 |
| fixed 10 req/s | `next` / `next-min` / `rust` | 10.0 each, 0 dropped | 35.5 → 35.3 / 6.8 → 7.5 / 2.3 → 2.2 | 27.5 → 25.5 / 4.9 → 5.1 / 0.70 → 0.70 | 3.19 → 2.90 / 1.90 → 1.69 / 1.50 → 1.50 |

Round-to-round spread is 2–24 % (largest for the Next.js RSVP burst, which ran first in round 1 and last in round 2); the platform dev server averaged ≤ 3.5 % of a core in every run and steal stayed ≤ 0.3 %. The arm-to-arm effects used in §1 are ≈ 6.7–7.0× (`next` → `next-min` read throughput), ≈ 4.4–4.8× (`next-min` → `rust`) and ≈ 11–12× (server CPU per page, `next-min` → `rust`): an order of magnitude above the spread.

### 3.2 Consistency (database snapshots after each scenario)
- **RSVP writes:** RSVP events = accepted writes (k6 `rsvp_saved`) on every arm in both rounds (round 1: 10,458 / 14,373 / 57,558; round 2 `next`: 12,995); all 300 guests confirmed.
- **Allowance overwrite (QA-005):** 300 / 300 allowances 2 → 1 on every arm, because the RSVP rule writes the attending count into the allowance column. Mirrored on purpose; fix is B-007.
- **View dedupe race:** all 300 guests viewed; duplicate VIEW rows (and `opened_count` inflated by the same amount) on every arm: round 1 8 / 1 / 1, round 2 5 / 2 / 5 (`next` / `next-min` / `rust`). The 30-minute dedupe is a read-then-insert without a constraint, so concurrent first views of one guest both insert. The count varies by run and does not track the arm's speed; it is a logic defect, not a stack property. Fix (B-017a): one atomic statement (a uniqueness rule such as a unique partial index on `(invitation_id, guest_id)` for the first VIEW plus `INSERT … ON CONFLICT DO NOTHING`, or a per-guest `first_opened_at` update with `RETURNING`).
- Unknown guest: product page answers 200 (B-011); minimal arms 404.

### 3.3 Where the product page's time goes (read spike, ms of CPU per page, ranges over two rounds)
| Step | Server CPU | Postgres CPU | Evidence |
|---|---|---|---|
| product page as shipped (2 loader calls + full React render) | 27–30 | 3.1–3.2 | `next`, r1/r2 |
| one loader call per request (React `cache()`), same render | 26–31 (no change beyond spread) | 2.0–2.2 | `next` + `cache()`, sets `-cache`, `-cache-r2` (§3.4) |
| one loader call, render reduced to minimal HTML | 3.7–4.1 | 1.2–1.4 | `next-min` |
| same work in Rust | 0.33–0.34 | 0.96–0.97 | `rust` |

### 3.4 Experiment: loader wrapped in `cache()` (two rounds, snapshot-only)
Build `dNnaqKFz2LVNu852ivEIc` = the r1/r2 build with `loadPublicInvitation` wrapped in React `cache()` so `generateMetadata` and the page share one call; product files unchanged (the change lived only in `/vercel/share/work/app`); both rounds against the same server process; every row valid (`summarize-spike.py <set> --targets next --check` exit 0; each set carries a `variant.json`). Round 1's read spike overlapped activity of the platform's own `next dev` (24.6 % of a core mean, p95 132 %), flagged as contention in its summary (marked * below); round 2 was uncontended (≤ 0.1 %).

| Scenario | Metric | without `cache()` r1 / r2 | with `cache()` r1 / r2 |
|---|---|---|---|
| read spike, 40 VUs | req/s | 36.2 / 38.9 | 37.7* / 34.0 |
| | p95 ms | 1,279 / 1,163 | 1,836* / 1,412 |
| | server CPU ms per page | 29.8 / 27.2 | 26.1* / 31.1 |
| | Postgres CPU ms per page | 3.20 / 3.06 | 1.96* / 2.15 |
| | duplicate VIEW rows (300 guests) | 8 / 5 | 7* / 5 |
| fixed 10 req/s | p95 ms | 35.5 / 35.3 | 31.0 / 34.9 |
| | server CPU ms per page | 27.5 / 25.5 | 24.9 / 27.8 |
| RSVP burst (no loader call; control) | req/s | 260.9 / 324.5 | 263.5 / 245.6 |

Reading [OBSERVED, lab]: one loader call instead of two changes neither server CPU per page nor throughput beyond the spread, in either direction; it removes ≈ 30–39 % of Postgres CPU per page under load (the fixed-rate Postgres values sit at the sampler's resolution of 1 % of a core ≈ 1 ms per request at 10 req/s and are not used). Therefore ≈ 85–90 % of the product page's server CPU (≈ 23–27 ms of ≈ 25–31 ms) is rendering and serialising the full template page (≈ 140 KB of HTML including the RSC payload) [INFERRED from the three steps]. The server-side lever is caching that render per invitation; `cache()` stays in B-014 because it lowers database load, the shared limit once function instances multiply (§4). The view-dedupe race is unchanged by `cache()` (still one tracker call per request).

## 4. Deployment assumptions (ADR-O06; the owner decides)
- Vercel functions in `sin1`, database in the same region (provider undecided). Guest pages and server actions run as Node functions; no Edge runtime for database access.
- Database connections: `postgres()` pool `max` 10 per function instance today (`POSTGRES_POOL_MAX`). With many concurrent instances this must sit behind a pooler (provider pooler or PgBouncer in transaction mode) or the instance count × pool size exceeds the database limit long before CPU does. Prepared-statement behaviour must match the pooler mode.
- Compression is done by the platform; the spike measured uncompressed bytes. Guest page HTML of ≈ 140 KB uncompressed contains the RSC payload; shrinking it is part of B-014.
- Middleware (Clerk, CSP, locale cookie) was absent in the spike; production adds its cost and QA-007 (clerk-js on guest pages) remains open.

## 5. Plan for the stack we keep (ordered; each item reversible)
1. **B-007** allowance column (P0) and **B-017a** atomic view dedupe (P1, S): correctness first.
2. **B-014** (P1, measured): `cache()` around `loadPublicInvitation` (database ≈ −1/3 CPU per page, §3.4); cache the **invitation-level render** — the template sections that do not depend on the guest — with a tag per invitation (invalidated on publish, edit, wish post and moderation) and render only the guest-specific parts (name, RSVP state, personal gift accounts) per request; no locale cookie and no Clerk on `/i/*` (B-015). Data caching alone is not enough: the render is ≈ 85–90 % of the server CPU (§3.3). Acceptance: server CPU per page in this spike ≤ 2 × the `next-min` level (≈ 8 ms), product markup unchanged for the same guest, p95 at 40 VUs below 400 ms in this lab, no cross-guest leakage (a guest-specific value never appears in another guest's response; tested).
3. **B-017** indexes for `guest_messages (invitation_id, is_hidden, created_at desc)` and `analytics_events (invitation_id, event_type, guest_id, created_at)`, verified with `EXPLAIN` on the fixture.
4. **B-011** 404 for unknown guests and opaque links (P0).
5. Observability (§6) before any further performance claim.

## 6. Operations, observability and cost limits
- **Signals to add** (none exist today): per-route request count, p50/p95 server time and error rate for `/i/*` and RSVP/wish actions; database time per request; function CPU and memory; RSVP write failures; view-tracking failures (currently swallowed by `trackInvitationView`). Use the platform's observability or OpenTelemetry; never log guest names or phone numbers (UU PDP).
- **SLO proposals** (targets, not baselines): guest page p95 server time and error rate per hour during blasts; RSVP success rate. Numbers are set after a week of telemetry.
- **Cost:** no figures here. Platform pricing is the owner's contract; the model is cost ≈ pages × CPU-seconds per page × price per CPU-second + database plan + egress. The spike's CPU-seconds per page are lab values on one host and only rank the options.
- **Runbook seeds:** blast in progress → watch DB connections and p95; DB saturated → raise pooler limits, not function pool size; view-tracking errors → tracking is best-effort, the page must still render.

## 7. Rollback
Every step above is a code change behind the normal deploy (revert the commit) or additive schema (new column / index / constraint, never dropped in the same release). Caching sits behind a flag with tag invalidation; turning it off returns to today's `force-dynamic` render. No Rust component is deployed, so there is nothing to roll back on that side; the spike stays in `08-backend-rust-plan/spike/` as test equipment and is never shipped.

## 8. Revisit triggers for Rust (ADR-A1)
1. Production telemetry after B-014 shows guest-page function CPU dominating cost or p95 server time above the SLO at blast peaks while the database has headroom.
2. A new hot path outside React rendering appears (venue QR check-in with offline sync, webhook fan-out, bulk WhatsApp sending) that needs high concurrency at low memory.
3. Database load is no longer the limit (managed pooler, read replicas) and the remaining cost is runtime CPU.
Then: an incremental Rust service for that path only (strangler pattern behind the same URL), sharing the schema, with its own contract tests mirroring `app/i/[slug]/actions.ts` rules (the spike's `rust-axum/` is the starting point, not production code).
