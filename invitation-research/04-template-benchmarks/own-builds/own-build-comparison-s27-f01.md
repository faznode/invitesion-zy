<!-- SUMMARY (first 7 lines — greppable) -->
# own-build-comparison-s27-f01.md — F-01: the guest page on Next.js 15.6.0-canary.59 vs 16.4.5, one host, interleaved (session 27)
> WHAT: The F-01 adoption bench (06-backlog F-01 "CI plus the same-host interleaved bench"): the checkpoint `87e14dc` against the same tree upgraded to Next.js 16.4.5 / React 19.3.1, measured with the RQ-OWN-02 method, 12 Lighthouse runs per build.
> STATUS: Measured 2026-11-06 18:26:48–18:32:34Z, 24 / 24 runs OK. Established: the upgraded page transfers 3,768 B less (document 12.4 → 9.2 KB, one request fewer). No metric regresses beyond run variation (FCP, LCP, SI, TBT, TTI, CLS, score: exact p 0.29–1.0). Not established: any timing improvement.
> OWNER: Oracle (research) for the method; Operator role for the F-01 decision (`../../_handoff/IMPLEMENTATION-LOG.md` E-056)
> DEPS: ../../_tools/capture/own-build-bench.mjs, ../../_tools/ops/local-stack.sh, own-build-runs-s27-f01.csv, own-build-comparison-s27-f01.json, own-build-comparison-s23r.md (method), ../protocol.md (D-033)
> GREP: f-01, next 16, 16.4.5, 15.6.0-canary.59, proxy, own build, interleaved, same host, 87e14dc, s27, mann-whitney
> UPDATED: 2026-11-06

## Arms
| Arm | Product code | Next.js / React | D-012 build | Port |
|---|---|---|---|---|
| `87e14dc` | the checkpoint, synced from the anonymous clone (`local-stack.sh sync`) | 15.6.0-canary.59 / 19.1.4 | `gUwcbkGX6YyQQd7JgjScc` | 3111 |
| `f01-next16` | the same tree with the F-01 change set (E-056) from the isolated copy `/vercel/share/work/f01` | 16.4.5 / 19.3.1 | `YyH-a0y70V06z5wVgLX9j` | 3112 |

Common to both: one database (`own_f01`, migrations 0000–0015, 64 themes, the `seed-local-demo.ts` fixture: `budi-sari` with five guests, no image), page `/i/budi-sari/budi-hartono`, built the same way in this session (`local-stack.sh build`: placeholder Clerk keys, the request-interception file set aside, D-012 / P-INV-010; for the upgraded arm that file is `proxy.ts`). Server HTML for the measured guest: 34,679 B (`87e14dc`) and 34,004 B (`f01-next16`). Before measuring: both answer 200 on the guest page and on `/templates` and 404 on a wrong guest and a wrong invitation; server TTFB over 10 alternating requests 23.3 ms vs 25.1 ms (a curl spot check, not a benchmark).

## Method
`own-build-bench.mjs` with Lighthouse 12.8.2, profile `v1-412` (412 × 915 @ 2.625, simulated Slow 4G and 4× CPU, Android user agent), Chrome for Testing 158.0.8127.18 headless, one sandbox host. Two invocations of six rounds; each round runs the arms rotated (A B, B A), so each arm took each position six times; one warm-up GET per server before each invocation (all 200). Nothing else ran meanwhile: the F-01 product gates had finished at 18:26Z and the platform's dev server on :3000 was idle. Comparison over the merged 12 + 12 runs: medians and ranges per arm; exact two-sided Mann-Whitney U per metric over all C(24, 12) = 2,704,156 assignments, counted per rank sum (s27 change to the tool, which enumerated and stopped at 20 pooled values; cross-checked against full enumeration in `own-build-bench.test.mjs`). Each invocation alone gives the same reading.

## Results (12 runs per arm, 0 failed; median [min–max])
| Metric | `87e14dc` | `f01-next16` | Median difference, exact p |
|---|---|---|---|
| Performance score | 0.915 [0.82–0.95] | 0.90 [0.86–0.95] | −0.015, p 0.72 |
| FCP | 942 ms [931–989] | 945 ms [930–975] | +2 ms, p 0.71 |
| LCP | 2,171 ms [2,071–2,971] | 2,397 ms [2,070–2,965] | +225 ms, p 0.89 |
| Speed Index | 969 ms | 945 ms | −24 ms, p 0.32 |
| TBT | 329 ms [223–521] | 344 ms [216–435] | +14 ms, p 0.67 |
| TTI | 3,090 ms | 3,042 ms | −47 ms, p 0.29 |
| CLS | 0 | 0 | 0, p 1 |
| Transfer (total) | 261,953 B | **258,185 B** | **−3,768 B, p 7.4 × 10⁻⁷** (complete separation) |
| Document / script transfer | 12,360 / 147,604 B | **9,156 / 147,028 B** | — |
| Requests | 17 | **16** | — |
| benchmarkIndex | 960 [741–1,317] | 1,105 [733–1,277] | — |

## Reading
- **Established:** the upgraded guest page transfers 3.7 KB less in every run: a 3.2 KB smaller document, 0.6 KB less script and one request fewer.
- **No regression beyond run variation** (the F-01 acceptance criterion): no timing metric separates the builds.
- **LCP is not established either way.** The arms' values fall in different clusters: `87e14dc` 8 × 2.07–2.20 s and 4 × 2.86–2.97 s; `f01-next16` 4 × 2.07–2.09 s, 7 × 2.29–2.44 s and 1 × 2.97 s. The medians differ by 225 ms while the means are 2.39 s against 2.34 s and the ranges coincide (p 0.89). Simulated LCP on this page depends on which resource closes the critical path; 12 runs per arm cannot attribute the clusters [INFERRED].
- **Host:** the slow-CPU warning fired on 12 of 24 runs (8 for `87e14dc`, 4 for `f01-next16`); interleaving spread the slow moments across both arms, and the benchmarkIndex ranges overlap. Absolute values belong to this host and are not comparable with other sessions' captures.

## Limits
- Lighthouse only: no REA scenario, structure pass or screenshot; simulated throttling on one sandbox; not field data, a real device or an in-app browser; INP not measured.
- Builds without the request-interception file (D-012): no CSP header, `locale` cookie or Clerk headers on either arm; the page payload is unchanged by that.
- A separate population: no capture rows, no queue entries, no change to `../captures-summary.csv` or any aggregate.
- The 24 Lighthouse reports stayed in scratch (`/vercel/share/work/own-f01`, lost on a recycle); each report's sha256 is in `own-build-runs-s27-f01.csv`.

## Reproduce
1. Arm A: `PROJECT=<checkpoint clone> APP=<dir-a> POSTGRES_URL=<db> local-stack.sh sync && deps && db && build`; arm B the same from the F-01 tree with `APP=<dir-b>` and without `db` (same database).
2. `APP_PORT=3111 … local-stack.sh start` and `APP_PORT=3112 … local-stack.sh start` in the background.
3. With nothing else running: `node invitation-research/_tools/capture/own-build-bench.mjs --out <dir>/run-N --rounds 6 --arm 87e14dc=http://127.0.0.1:3111/i/budi-sari/budi-hartono --arm f01-next16=http://127.0.0.1:3112/i/budi-sari/budi-hartono`, twice; then `--merge merged.json run-1/runs.json run-2/runs.json`.
