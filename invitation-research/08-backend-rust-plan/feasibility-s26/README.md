<!-- SUMMARY (first 7 lines — greppable) -->
# feasibility-s26 — isolated Rust feasibility experiment for ADR-A2 (not product code)
> WHAT: The target Rust stack (axum 0.8, sqlx 0.9 on the existing schema, RFC 9457 problems, internal service signature, owner-token verification against a JWKS) exercised on one domain function ported from `lib/invitation/view-tracking.ts` (B-017a), with contract tests against the same Postgres the TypeScript writer is checked on.
> STATUS: s26 (2026-11-06): 17 / 17 tests pass (6 HTTP edge, 9 owner token, 2 database contract incl. a source-parity guard); the TypeScript writer passes `verify-view-dedupe` 6 / 6 on the same database. Not wired to the app, not deployed; allowed before the gates by ADR-O11.
> OWNER: Research agent (Architect role)
> DEPS: ../../09-masterplan/09-backend-and-frontend-architecture.md §8, ../../09-masterplan/12-decision-log.md (ADR-A2), ../../../lib/invitation/view-tracking.ts, ../../../scripts/verify-view-dedupe.ts
> GREP: rust, axum, sqlx, feasibility, contract test, problem+json, service signature, jwks, view dedupe, B-017a, ADR-A2
> UPDATED: 2026-11-06

## Why this experiment
ADR-A2 moves domain writes to a Rust service one domain at a time. Before any migration slice, the stack had to show on our own schema that:
- it reproduces a concurrency-sensitive rule exactly;
- it refuses bad requests before touching the database;
- it verifies owner tokens without trusting the client;
- it builds with current crates and a pinned lock file.
The view dedupe is the smallest self-contained write with an existing contract script.

## What it contains
- `src/views.rs`: `record_invitation_view`, the same transaction as the TypeScript writer (advisory lock namespace `0x56494557`, per-guest key or the negated invitation id, a 30-minute inclusive window, insert plus counter in one transaction). It uses two queries instead of `is not distinct from`, so the dedupe index serves both.
- `src/problem.rs`: RFC 9457 `application/problem+json` with a stable `code`. Internal causes are logged, never returned.
- `src/service_auth.rs`: `x-invitesion-signature: t=…,v1=…`, an HMAC-SHA256 over the timestamp, method, path and body hash, with 60 s skew.
- `src/owner_auth.rs`: RS256-only verification against a JWKS:
  - checks issuer, `exp`, `nbf` and the authorized party (`azp`);
  - refuses unknown `kid`s and algorithm confusion;
  - leaves roles and ownership to the database.
- `src/http.rs`, `src/main.rs`: `POST /v1/views` and `GET /v1/health`.
- `vectors/view-dedupe.json`: language-neutral contract vectors (minute offsets → written or not, final count), for a TypeScript runner too.

## How it was run (s26)
```
export CARGO_TARGET_DIR=/vercel/share/work/rust/target          # build output never inside the project
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/invitesion cargo test
```
Database: local Postgres 16.15, migrated through 0015 with `pnpm db:migrate`. drizzle-kit stays the only migration owner, and the experiment runs no DDL. Toolchain: rustc / cargo 1.99.1 (rustup, outside the project). Exact versions are pinned in `Cargo.lock`.

## Results (s26, 16:37Z)
| Suite | Result | What it shows |
|---|---|---|
| `tests/http_contract.rs` | 6 / 6 | Missing, wrong-secret, stale, other-path, other-body and malformed signatures → 401 problem; malformed JSON, unknown fields and non-positive ids → 400 problem; all before any database work (the pool is lazy and points nowhere) |
| `tests/owner_auth.rs` | 9 / 9 | Valid token accepted. Expired, not-yet-valid, foreign issuer, foreign or missing `azp`, unknown `kid`, HS256 confusion, tampered payload and garbage all refused |
| `tests/views_db.rs` | 2 / 2 | **20 concurrent first opens → exactly one write, one row, `opened_count` 1**. A repeat at +5 min writes nothing; +31 min writes again (2 rows, count 2). 20 concurrent anonymous opens → one row. Another guest is independent. The 8 vectors hold (final count 3). HTTP 200 `{"recorded":true}` then `false`; an unknown guest → 404 `invitation_or_guest.not_found` (foreign key). Fixture removed (0 rows left). A parity guard reads the TypeScript source and fails if the lock namespace, window or key rule drift |
| TypeScript writer, same database | `verify-view-dedupe` 6 / 6 | The same scenarios on the product code; the pre-B-017a sequence still reproduces the race (20 rows) |

One test failed on the first run: my hand-computed decimal for `0x56494557` (1,447,642,455) was wrong. The test now reads the constant from the TypeScript file instead of a typed number.

## Limits (what this does not show)
- No latency, throughput or cold-start figures. Nothing was deployed, and the Vercel Rust runtime is beta. The first migration slice measures p50 / p95 on a preview deployment before any production traffic (ADR-A2 rollout gate).
- No real Clerk token (DA-01): keys are generated per test run, and no Clerk credential was requested or used.
- Queries are runtime-bound (`sqlx::query` with binds). The product crate uses compile-time-checked queries with committed offline metadata (ADR-A2).
- Guest-link resolution (slug or opaque token) stays in Next.js here. Porting it is part of the guest-interaction slice (U2).
