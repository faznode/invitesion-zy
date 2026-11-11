<!-- SUMMARY (first 7 lines — greppable) -->
# spike/README.md — method of the Next.js vs Rust backend spike (guest-page read + RSVP write)
> WHAT: How the local load spike is built, run and judged: arms, workload, fixture, validity rules, environment, outputs, limits.
> STATUS: v2 (session 09, 2026-11-03). v1 (s08) produced Next-only results and an unfinished Rust run; v2 fixed the tooling and reran all arms.
> OWNER: Research agent
> DEPS: ../README.md (plan + verdict), ../../09-masterplan/09-backend-and-frontend-architecture.md, ../../_tools/ops/local-stack.sh
> GREP: spike, k6, rust, axum, next-min, load test, rsvp, consistency, sampler
> UPDATED: 2026-11-03

## 1. Question
Does the public guest page (`/i/[slug]/[guestSlug]`, the WhatsApp-blast hot path) or the RSVP write justify moving any part of Invitesion to a Rust service, or is the cost in something the current Next.js stack can fix? Only a measured hot path may justify Rust (masterplan default: keep the stack).

## 2. Arms (one at a time, same database, same fake data, same pool size 10)
| Arm | What answers | Read path | RSVP path |
|---|---|---|---|
| `next` | the product as shipped (production build of `64678cf`, `next start` on :3100) | full React page; **the loader runs twice per request** (`generateMetadata` + page, no `cache()`), view tracking in `after()` | no-JS server-action form POST to the page URL → 303 (plus `revalidatePath`) |
| `next-min` | same Next server, spike route handlers from `next-min/` copied into the snapshot only | the product's `loadPublicInvitation()` **once** + the same minimal HTML as Rust + `after()` tracking | form route with the action's rules and two writes → 303 (no `revalidatePath`) |
| `rust` | Axum + tokio-postgres + deadpool (`rust-axum/`, release build) on :3200 | the same five queries + a hand-written minimal page + spawned tracking | same rules and writes → 303 |

Response sizes (smoke test, uncompressed): `next` 141,700 B, `next-min` 6,001 B, `rust` 5,991 B. The two minimal pages differ only by the form action prefix. **`rust` and `next-min` are not equivalent to the product page**; they show what the data path costs without React rendering. Reading the three together: `next` → `next-min` = cost of the full render plus the duplicate load; `next-min` → `rust` = runtime/framework cost for identical work. A fourth, snapshot-only variant separates the two parts of the first step: `next` rebuilt with `loadPublicInvitation` wrapped in React `cache()` (one loader call, full render; result sets `s09-20261103-cache` and `-cache-r2`, each with a `variant.json`). Result: server CPU unchanged, Postgres CPU per page ≈ −1/3, so the first step is almost entirely render cost (`../README.md` §3.3–§3.4).

Semantics kept equal: invitation/guest lookup rules (DRAFT/EXPIRED/expiry), 50 latest visible wishes + count, media list, 30-minute VIEW dedupe with `opened_count` update, RSVP status whitelist, the `guest_count` rule (which overwrites the allowance, QA-005: reproduced on purpose in every arm so the writes match), the RSVP analytics event. Unknown guest: `next` answers 200 (product defect, B-011), the other arms 404 (not exercised by the workload).

## 3. Workload (`k6/spike.js`, k6 v0.54.0)
- Warm-up: 30 sequential curl reads of `tamu-001…030` (not measured; also creates their VIEW rows).
- `read-spike`: 0 → 40 VUs in 10 s, 40 VUs for 40 s, → 0 in 10 s; GET a random guest page of 300, no think time (closed model: throughput = what the target sustains).
- `rsvp-burst`: 0 → 20 VUs in 5 s, 20 for 30 s, → 0 in 5 s; POST CONFIRMED (1 person) for a random guest; redirects not followed. Repeats per guest are expected and counted.
- `fixed-read`: 10 requests/s for 30 s (open model); `dropped_iterations` > 0 would mean the target could not sustain it.
- No `Accept-Encoding` header is sent, so sizes are uncompressed; compression is a deployment concern (`../README.md` §4).

## 4. Fixture (fake data only)
`local-stack.sh db` seeds the fixture invitation `budi-sari` (fictional couple). `seed-spike-guests.sql` (idempotent) adds `tamu-001…300` ("Tamu Uji NNN", allowance 2) and 120 visible wishes, after deleting the previous spike rows and their events. `run-spike.sh` refuses to seed unless the database identity is exactly `invitesion|127.0.0.1|5433|/vercel/share/work/pgdata`.

## 5. Validity rules (session 09)
- Every measured request and check carries `op=read|rsvp`; the one setup GET of the `next` RSVP run (to read the action id) is `op=setup` and excluded through k6 sub-metrics.
- k6 thresholds define a valid run: measured checks ≥ 99 % and measured `http_req_failed` < 1 %. Otherwise k6 exits 99.
- `run-spike.sh` marks a scenario valid only if k6 exits 0, the sampler exits 0 (no implausible value) and the sampler saw the server process; any invalid scenario → status `ok: false`, script exit 1. `summarize-spike.py <set> --check` exits 1 if any row is invalid; FAILED rows carry no numbers; `--targets next` restricts tables and check to the arms a single-arm experiment contains.
- Contention: the summary lists every scenario during which the platform's `next dev` averaged more than 5 % of a core; such rows are reported but not used for latency or throughput claims (it happened once, `s09-20261103-cache` read spike, 24.6 %).
- `sample-proc.py` samples once per second from `/proc`: per-PID CPU deltas (CPU % of one core), RSS of the group, host busy and steal % (of all cores), and stops when k6 exits. Groups: `server` (the target), `postgres`, `platform-dev` (the hosting platform's `next dev`, cwd = project), `k6`, and the idle other server.
- `db-snapshot.sql` after each scenario keeps apart: guests with a VIEW, VIEW events and duplicates, `opened_count` sum, RSVP events (one per accepted write), guests with an RSVP event, confirmed guests, allowances still 2 vs overwritten to 1.

## 6. Environment and contention
2 vCPU / ≈ 4.2 GB VM (Amazon Linux 2023), Postgres 16.15 on the same host, the load generator on the same host (k6 ≈ 7 % of a core during reads), the platform dev server idle in the background (measured each run). Per-target versions are written to `results/<set>/<target>-env.txt`. Absolute numbers are therefore **lab numbers for relative comparison only**: production differs in CPU, network, TLS, compression, middleware (omitted here, P-INV-010) and database distance.

## 7. Run
```
bash invitation-research/_tools/ops/local-stack.sh up
cp -r invitation-research/08-backend-rust-plan/spike/next-min/app/spike-min /vercel/share/work/app/app/
bash invitation-research/_tools/ops/local-stack.sh build
bash invitation-research/_tools/ops/local-stack.sh start            # background task
(cd invitation-research/08-backend-rust-plan/spike/rust-axum && CARGO_TARGET_DIR=/vercel/share/work/spike-target cargo build --release --locked)
POOL_SIZE=10 PORT=3200 /vercel/share/work/spike-target/release/invitesion-spike   # background task, cwd /tmp
bash invitation-research/08-backend-rust-plan/spike/run-spike.sh <set> next       # then next-min, then rust; one at a time
python3 -B invitation-research/08-backend-rust-plan/spike/summarize-spike.py <set> --check
```

## 8. Outputs
- `results/s09-20261103-r1/` (order next → next-min → rust) and `results/s09-20261103-r2/` (rust → next-min → next): per target and scenario `-k6.json` (summary export), `-k6.txt`, `-proc.json/.txt`, `-db.json`, `-status.json`, plus `-env.txt`, `-seed.txt`, `-seeded-db.json`; `summary.md` generated.
- `results/s09-20261103-cache/` and `results/s09-20261103-cache-r2/`: `next` only, loader-in-`cache()` build (`variant.json` describes it); summarise with `--targets next`.
- The `rustc=` line of the s09 `*-env.txt` files holds a rustup error (the runner did not export `RUSTUP_HOME`; fixed afterwards). The Rust binary is identified by `binary_sha256_16=89a53385141fd4ca`, built with rustc 1.99.1.
- `results/s08-20261103-historical/` (`next-*` and `rust-read-spike-*.txt`; moved there unchanged from directly under `results/` in s10 so every result set is a folder) holds the **s08 historical files** (Next only; the Rust files are empty because that run never finished). They are not comparable with s09 (older tooling: lax threshold, setup GET counted, sampler artefacts) and are kept unchanged as evidence.

## 9. Limits
Single host, no network latency, no TLS, no compression, no middleware/CSP/Clerk on the measured pages, fake data of one invitation, k6 on the same CPU. A minimal Rust page is not a product; the product page needs React rendering wherever it runs. Write consistency is checked for this workload only (no concurrent writes to the same guest by design of the random choice beyond chance repeats).
