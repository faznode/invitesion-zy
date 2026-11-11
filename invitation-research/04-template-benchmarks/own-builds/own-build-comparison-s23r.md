<!-- SUMMARY (first 7 lines — greppable) -->
# own-build-comparison-s23r.md — RQ-OWN-02: three own builds on one host, interleaved (session 23r)
> WHAT: The own guest page as built from `22ed99e` (the baseline every own-vs-competitor number describes), `9bbd813` (= `0b5eb1b`, measured alone in s13) and the s23r tree, measured on ONE host in ONE session with interleaved Lighthouse runs, 6 per build.
> STATUS: Measured 2026-11-06 13:16:20–13:20:56Z, 18 / 18 runs OK. Established: the s23r build paints ≈ 0.67 s (vs 22ed99e) and ≈ 0.82 s (vs 9bbd813) earlier and transfers ≈ 67–69 KB less. Not established: LCP, TBT, score. A separate population: no capture rows, aggregates unchanged.
> OWNER: Oracle (research)
> DEPS: ../../_tools/capture/own-build-bench.mjs, ../../_tools/capture/capture-profile.mjs, ../../_tools/ops/local-stack.sh, own-build-runs-s23r.csv, own-build-comparison-s23r.json, ../protocol.md (D-033)
> GREP: rq-own-02, own build, interleaved, same host, 22ed99e, 9bbd813, 0b5eb1b, s23r, benchmarkIndex, mann-whitney
> UPDATED: 2026-11-06

## Why
Every own-vs-competitor figure describes `22ed99e` (C-INV-001…005). s13 measured `0b5eb1b` (C-INV-006…015) on a slower, variable host (benchmarkIndex 820–1,251.5 against 1,415.5–1,470), so D-033 keeps the two builds apart and no output compares them (`../_handoff/acceptance-matrix.md` RQ-OWN-02). A build comparison needs the builds on one host in one session, interleaved, with benchmarkIndex per run. This file is that comparison, plus the current tree.

## Arms
| Arm | Product code | Demo fixture | Database | D-012 build | Port |
|---|---|---|---|---|---|
| `22ed99e` | archived from `a5e119c`, whose product tree (`app`, `lib`, `components`, `public`, `middleware.ts`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `drizzle.config.ts`) is identical to `22ed99e` | `seed-local-demo.ts` at `a5e119c`, the earliest stored version (C-INV-001…005 era) | `own02_a`, migrations 0000–0008 | `GAgLXikf3yiUfUicDNQNg` | 3111 |
| `9bbd813` | `9bbd813`; product tree identical to `0b5eb1b` (C-INV-006…015) | its own `seed-local-demo.ts` | `own02_b`, 0000–0011 | `yT-tpJheft5xb6Rr35gKv` | 3112 |
| `s23r` | the s23r working tree (`05235da` + s23r); product paths identical to the source of `q_svsXRXWL-6QLaPaA_ja` (cover fold, census) apart from `middleware.ts`, which D-012 sets aside in both | current `seed-local-demo.ts` | `own02_c`, 0000–0015 | `P6zbMTCihqWi3AeOnRDN-` | 3113 |

Common to all three: the same `pnpm-lock.yaml` (sha256 prefix `44b8b346c354`), Next 15.6.0-canary.59, React 19.1.4; built the same way (`local-stack.sh build`: placeholder Clerk keys, `middleware.ts` set aside, D-012 / P-INV-010) in this session; 64 templates; one demo invitation `budi-sari` with five guests; page `/i/budi-sari/budi-hartono`; no image in any arm's demo (the only URL in the configs is a maps link). Arms `9bbd813` and `s23r` serve a **byte-identical demo config** (md5 `057c85db…`), so their difference is code only. Arm `22ed99e`'s era fixture adds a quote section (1,616 against 1,456 characters of config). Server HTML for the measured guest: 112.6–113.9 KB (`22ed99e`, varies per request), 116.8 KB (`9bbd813`), 34.7 KB (`s23r`).

## Method
`../../_tools/capture/own-build-bench.mjs` with Lighthouse 12.8.2 and the arguments `capture.mjs` uses for profile `v1-412` (412 × 915 @ 2.625, simulated throttling: Slow 4G and 4× CPU, Android user agent, categories performance / accessibility / best practices / SEO), Chrome for Testing 158.0.8127.18 headless, one 2-vCPU sandbox. Two invocations of three rounds; each round runs the arms rotated (A B C, B C A, C A B), so every arm took every position twice; one warm-up GET per server before each invocation (all 200). Nothing else ran meanwhile: the builds, contrast runs 11a / 11b and the Sonett read had finished, and the other servers (:3000 dev, :3100, :3104) were idle. Comparison: medians and ranges per arm; exact two-sided Mann-Whitney U per metric (6 against 6 = 924 rank assignments; p = 0.0022, the smallest possible, means all six runs of one arm beat all six of the other).

## Results (6 runs per arm, 0 failed; median [min–max])
| Metric | `22ed99e` | `9bbd813` | `s23r` |
|---|---|---|---|
| Performance score | 0.87 [0.82–0.90] | 0.86 [0.84–0.88] | 0.915 [0.83–0.95] |
| FCP | 1,624 ms [1,602–1,653] | 1,772 ms [1,655–1,935] | **950 ms [939–974]** |
| LCP | 2,646 ms [2,480–2,663] | 2,754 ms [2,487–2,779] | 2,131 ms [2,031–2,975] |
| Speed Index | 1,624 ms | 1,772 ms | **996 ms** |
| TBT | 379 ms [292–549] | 397 ms [320–472] | 335 ms [226–473] |
| TTI | 3,798 ms | 3,839 ms | **3,055 ms** |
| CLS | 0 | 0 | 0 |
| Transfer (total) | 328,822 B | 330,415 B | **261,866 B** |
| Document / script transfer | 28,640 / 199,725 B | 28,899 / 200,964 B | **12,356 / 147,604 B** |
| Requests | 25 | 26 | **17** |
| benchmarkIndex | 873 [780.5–1,142.5] | 983 [869–1,253.5] | 939 [801.5–1,187] |

## Differences (median difference, exact p)
| Metric | `s23r` − `22ed99e` | `s23r` − `9bbd813` | `9bbd813` − `22ed99e` |
|---|---|---|---|
| FCP | **−674 ms, p 0.0022** | **−822 ms, p 0.0022** | +148 ms, p 0.0022 |
| Speed Index | **−628 ms, p 0.0022** | **−776 ms, p 0.0022** | +148 ms, p 0.0022 |
| TTI | **−743 ms, p 0.0022** | **−784 ms, p 0.0022** | +40 ms, p 0.31 |
| Transfer | **−66,956 B, p 0.0022** | **−68,549 B, p 0.0022** | +1,593 B, p 0.0022 |
| LCP | −514 ms, p 0.065 | −623 ms, p 0.065 | +108 ms, p 0.24 |
| TBT | −43 ms, p 0.39 | −62 ms, p 0.39 | +19 ms, p 0.82 |
| Performance score | +0.045, p 0.071 | +0.055, p 0.058 | −0.01, p 0.45 |

## Reading
- **Established** (complete separation against both older builds): the s23r guest page paints first ≈ 0.67 s earlier than `22ed99e` and ≈ 0.82 s earlier than `9bbd813`, reaches TTI ≈ 0.74–0.78 s earlier, and transfers ≈ 67–69 KB less: a 12.4 KB document instead of 28.6–28.9 KB, 147.6 KB of script instead of 199.7–201.0 KB, 17 requests instead of 25–26. That is the shape of what E-042 (B-015: no Clerk on guest pages) and E-043 changed [INFERRED from the byte split; this run does not attribute by change]. Against `9bbd813` the demo content is identical, so that difference is the code.
- **Not established:** LCP (medians 2,131 against 2,646 / 2,754 ms, but one s23r run reached 2,975 ms, so p = 0.065), TBT and the performance score. Six runs per arm on this host cannot settle them; they are not reported as improvements.
- **`9bbd813` against `22ed99e`:** FCP and Speed Index +148 ms and +1.6 KB (p = 0.0022), nothing else different; the era fixtures differ slightly (above). Both sit at 2.5–2.8 s LCP here; s13's split of the same build into ≈ 2.75 s and ≈ 4.2 s did not recur in six runs on one host, which fits host variance [INFERRED].
- **Host:** Lighthouse's slow-CPU warning fired on 12 of 18 runs, **4 of 6 in every arm** (warned runs had benchmarkIndex ≤ 983, unwarned ≥ 1,004); interleaving spread the slow moments evenly, and the benchmarkIndex ranges of the arms overlap. Absolute values belong to this host and are not comparable with the C-INV captures' hosts.

## Limits
- Lighthouse only: no REA scenario, structure pass, cover click or screenshot (the capture method's other parts); simulated throttling on one 2-vCPU sandbox; not field data, a real device or an in-app browser; INP not measured.
- Builds without middleware (D-012): no CSP header, `locale` cookie or Clerk headers; payload unchanged (`local-stack.sh`).
- A separate population: no capture rows, no queue entries, no change to `../captures-summary.csv`, the eligibility outputs or any aggregate. Own-vs-competitor tables keep describing `22ed99e`; the competitors were captured on other hosts and days.
- The 18 Lighthouse reports stayed in scratch (`/vercel/share/work/own02`, lost on a recycle); each report's sha256 is in `own-build-runs-s23r.csv`.

## Reproduce
1. Snapshots: `git archive a5e119c` and `git archive 9bbd813` into scratch directories; `APP=<dir> local-stack.sh sync` for the current tree. `CI=true pnpm install --frozen-lockfile --prefer-offline` in each.
2. One database per arm: `createdb own02_<arm>`; in each snapshot with `POSTGRES_URL` pointing at it: `pnpm db:migrate && pnpm db:seed:templates && npx tsx invitation-research/_tools/setup/seed-local-demo.ts`.
3. `APP=<dir> APP_PORT=<port> local-stack.sh build`, one at a time; then `local-stack.sh start` per arm with its `POSTGRES_URL`, in the background.
4. With nothing else running: `node invitation-research/_tools/capture/own-build-bench.mjs --out <dir>/run-N --rounds 3 --arm 22ed99e=… --arm 9bbd813=… --arm s23r=…`, twice; then `--merge merged.json run-1/runs.json run-2/runs.json`.
