<!-- SUMMARY (first 7 lines — greppable) -->
# review-20261104-self.md — owner-authorized self-review of the research / masterplan milestone (RQ-VER-03)
> WHAT: The authoring session's review of its own research and masterplan work, done under owner authority (ADR-O09) against `review-request-s14.md`. It is not an independent review and not a Guardian approval.
> STATUS: complete, 2026-11-04 (areas 2, 3 code and 5 in s14; areas 1, 3 outputs, 4 and 6 closed in s16 with the §3 checks re-run on the current tree). Verdict in §5.
> OWNER: authoring session s14, reviewing under ADR-O09
> DEPS: review-request-s14.md, acceptance-matrix.md, ../09-masterplan/, ../04-template-benchmarks/benchmark-pack.md, ../02-competitor-discovery/robots-applicability-s12.md, ../_tools/
> GREP: self-review, RQ-VER-03, ADR-O09, finding, re-derived, verified, Q-O09, D-030, population

## 1. Authority and limits
- **Authority.** Owner, s14 ≈ 14:58Z: "I'm giving you the authority to review your own work — do your best." Recorded as ADR-O09 in `../09-masterplan/12-decision-log.md`.
- **What a self-review cannot remove.** The reviewer wrote the work. Shared assumptions, framing choices and the author's own reading of ambiguous rules are reduced by method, not removed. To reduce them, every claim checked here was re-derived with a fresh script or read against its primary record instead of the matrix row that states it, and findings are recorded even when they change no status.
- **Not ruled: Q-O09** (Enviory G2, `../02-competitor-discovery/robots-applicability-s12.md` §7). The request allows the reviewer to rule, but a ruling that admits C-ENV-111…123 would widen the author's own evidence base. The conservative class stays, and Q-O09 remains with the owner or a future independent reviewer.
- **Load disclosure.** The structural checks ran as sub-second Python reads while the v2 batch was capturing; no build, product test or browser job overlapped the batch (session 14 log).

## 2. Method per area (`review-request-s14.md` §2)
| Area | What was re-derived or re-read | Result |
|---|---|---|
| 1 Acceptance matrix | Each status re-derived from its named check after the batch | s16: every check a row names that is in the §3 list was re-run and still supports the row (59 rows: 49 VERIFIED; PARTIAL RQ-COMP-04, RQ-COMP-05, RQ-OWN-02, RQ-BENCH-05; RQ-DEMO-01 qualified, ADR-O10; RQ-VER-03 this review; RQ-ORIG-01…04 specified, limited or removed). Rows resting on document reads (dossiers, discovery, S- reads) were not re-read in s16 and keep their s14 / s15 verification. No status changed |
| 2 Robots applicability (D-030 / D-031) | §1–§7 of the applicability audit read against its sources table; the rule table checked for internal consistency against the per-origin results | Sound and conservative; finding F1 |
| 3 Measurement populations | Code read: `eligibility.py` rules 7–8, `measurement_population`, `v12_population`, `benchmark-pack.py` viewport populations; outputs checked independently after the batch | Code: separation enforced. Outputs (s16): `summarize-captures.py --strict` regenerates 165 captures (unconditional: cold-load eligible 132, structure eligible 126; sensitivity with provisional rows 145 / 132; register 26 rows, 13 provisional) byte-identical to the committed `captures-summary.csv`; the populations stay separate in the outputs |
| 4 Benchmark pack and protocol | Viewport conclusions against paired, verified captures after regeneration | s16: `benchmark-pack.py --check` exit 0 (generated files not stale) and 22 / 22 pack tests. The viewport limits stay as RQ-BENCH-05 states them; Protocol v2 verifies final emulation only |
| 5 Masterplan consistency | Fresh table parser over `06-backlog.md`; reference resolver over every chapter and handoff file; ADR-A1 numbers recomputed from the s09 round-1 summary; RQ-COMP-02 dossier scan | Verified; no finding |
| 6 Privacy and provenance | `commit-guard.sh` and `check-references.py` after the batch | s16: `commit-guard.sh` OK at both s16 commits; `check-references.py` 0 unresolved on the current tree. The host's `.gitignore` rewrite was caught and reverted before any commit (session 16, 18:30Z) |

## 3. Findings
| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | 2 | D-030 binds a Cloudflare-managed Agent section by category, but has no category rule for a site-written list of other operators' user-directed agents (`ChatGPT-User`, `Perplexity-User`, …), which expresses the same intent. Effect on the record: none. The s12 audit found one origin blocking one such agent and none blocking two, so no read relied on the gap. The tracked audit also does not name that one origin | Latent rule gap | Open. **s15 correction:** the s14 recommendation (a "≥ 2 user-directed agents disallowed ⇒ applicable" rule) was a count threshold with no official source, which the owner excludes (s15 instruction §9). Handling now: such a site-written list keeps the existing conservative uncertain class per origin (no read of the listed paths); a policy extension needs explicit reasoning, cited sources and tests before it is adopted. Name the origin at the next audit run |
| V1 | 5 | RQ-MP-06 / RQ-MP-15 re-derived with a new parser: 26 P1 and 26 P2 chains, five columns filled, 52 rollout rows matching the chains one-to-one, no empty, TBD or duplicate cell | — | Verified |
| V2 | 5 | Every ADR, D-, B- and G- ID cited in `09-masterplan/*.md` and `_handoff/*.md` resolves (12 ADRs including ADR-W1, 33 decisions, 42 backlog IDs, 68 gaps) | — | Verified |
| V3 | 5 | ADR-A1 against `../08-backend-rust-plan/spike/results/s09-20261103-r1/summary.md`: 36.2 / 241.8 / 1,155.9 req/s; server CPU per page recomputed as 29.8 / 4.07 / 0.34 ms; Postgres 112 % of a core at the Rust arm; duplicate VIEW rows 8 / 1 / 1. The decision follows from the data: the template render dominates server cost, so the lever is inside Next.js (B-014) | — | Verified |
| V4 | 1 / 5 | RQ-COMP-02: 15 Tier-A dossiers, each with 12 / 12 numbered sections matching the template, no TODO / TBD marker, 10 Indonesian vendors | — | Verified |

## 4. Checks re-run (`review-request-s14.md` §3)
s16, 18:52Z, on the tree after commit `409fbe1`. Load: contrast run 2 (Lighthouse `color-contrast` only) was running; no performance measurement ran, and these checks are deterministic offline reads.

| Check | Result |
|---|---|
| `check-references.py` | 69 files, 2,738 ID references, 10 relative links, 753 quoted paths, **0 unresolved** |
| `test_eligibility.py` | 38 / 38 OK |
| `test_benchmark_pack.py` | 22 / 22 OK |
| `summarize-captures.py --strict` | 165 captures; output **byte-identical** to the committed `captures-summary.csv` |
| `benchmark-pack.py --check` | exit 0 (not stale) |
| `build-matrix.py --check` | 187 × 16; 633 / 2,805 competitor cells known; 69 derived; 3 disagreements; 10 sensitivity changes; 0 errors |
| `test_profile_reads.py` | 28 / 28 OK |
| `node --test` robots + capture-profile | 21 / 21 (15 + 6) |
| `commit-guard.sh` | OK at `64701bb` and `409fbe1` |
| `pnpm typecheck && pnpm test` | 0; 147 / 147 at `409fbe1`; 153 / 153 with the B-029 logo and category change (E-021) |

## 5. Verdict
Owner-authorized self-review (ADR-O09): not an independent review and not a Guardian approval.
- **Records:** the research and masterplan records that exist agree with their evidence. Every §3 check passes on the current tree, regenerated outputs equal the committed ones, and every ID and quoted path resolves. No acceptance-matrix status had to change.
- **Milestone: not complete.** RQ-COMP-04, RQ-COMP-05, RQ-OWN-02 and RQ-BENCH-05 stay PARTIAL; RQ-DEMO-01 is qualified by availability (ADR-O10); RQ-ORIG-01…03 are specified or environment-limited, not done. Implementation continues alongside them (ADR-O08), and any conclusion that depends on them stays qualified.
- **Open:** F1 (latent robots rule gap; no read relied on it). Q-O09 is not ruled here.
- **Decision:** the records may be relied on for continued implementation within the limits stated above and in the acceptance matrix.
