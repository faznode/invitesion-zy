<!-- SUMMARY (first 7 lines — greppable) -->
# review-request-s14.md — scope and checks for the independent research / masterplan review (RQ-VER-03)
> WHAT: What a separate Guardian session should review before the research / masterplan milestone can close, which checks to re-run, and which owner decisions the review may settle. Written by the authoring session; it reviews nothing and approves nothing.
> STATUS: open, 2026-11-04 (s14). No independent review has taken place yet: `review-20261029.md` and `review-20261101.md` were reconciliation passes by authoring sessions.
> OWNER: Guardian (reviewer session ≠ any authoring session s01–s14)
> DEPS: ../../AGENTS.md, ../../AGENT_WORKFLOW.md, ../../docs/review/review-personas.md, acceptance-matrix.md, LATEST.md, ../09-masterplan/, ../04-template-benchmarks/benchmark-pack.md
> GREP: review, guardian, RQ-VER-03, independent, milestone, gate, checklist

## 1. Why a separate session
`AGENTS.md` hard rule 3 and `AGENT_WORKFLOW.md` require a Guardian review at the research → plan milestone, with the reviewer session different from the author. Every artifact under `invitation-research/` was written by sessions s01–s14, so none of them can review it. The reviewer reads, re-runs checks and writes findings; fixes go back to an authoring session.

## 2. Scope (diff since `e873680`, the last state LATEST described before s11)
1. **Acceptance matrix** (`acceptance-matrix.md`): re-derive each status from its named check. Pay attention to the s14 promotions (RQ-COMP-02, RQ-MP-06, RQ-MP-15) and the PARTIAL rows (RQ-COMP-04, RQ-COMP-05, RQ-OWN-02).
2. **Robots applicability** (`../02-competitor-discovery/robots-applicability-s12.md`, D-030 / D-031): is the identity and purpose analysis sound, is the conservative class applied consistently, and is the Trustpilot case in Q-O08 (S-JOY-003) a reason to refine the rule? The reviewer may rule on **Q-O09** (whether the capture browser after a plain-fetch challenge was a fallback client), which decides whether C-ENV-111…123 rejoin the unconditional population.
3. **Measurement populations** (`../_tools/capture/eligibility.py` rules 7–8, `benchmark-pack.py`, `dossier-digest.py`, `../05-feature-matrix/build-matrix.py`): no output may pool profiles, own builds, provisional and unconditional evidence, or Lighthouse and CDP sources.
4. **Benchmark pack and protocol** (`../04-template-benchmarks/benchmark-pack.md`, `protocol.md` §2.3, D-032): are the viewport conclusions limited to what paired, verified captures show, and are host-speed limits stated?
5. **Masterplan chapters 00–13**: consistency with the matrix, the benchmark pack, the backlog chains (26 P1 + 26 P2 + rollout) and the ADRs; ADR-A1 (keep Next.js, Rust only behind its triggers) against the s09 spike results.
6. **Privacy and provenance**: no names, page copy, competitor assets or private evidence in tracked files (`../_tools/safety/commit-guard.sh`); every S- / C- ID resolves.

## 3. Checks to re-run (all offline unless marked)
```bash
python3 -B invitation-research/_tools/safety/check-references.py
python3 -B invitation-research/_tools/capture/test_eligibility.py
python3 -B invitation-research/_tools/capture/test_benchmark_pack.py
python3 -B invitation-research/_tools/capture/summarize-captures.py --strict --out /tmp/summary.csv   # compare with the committed file
python3 -B invitation-research/_tools/capture/benchmark-pack.py --check
python3 -B invitation-research/05-feature-matrix/build-matrix.py --check
python3 -B invitation-research/_tools/discovery/test_profile_reads.py
node --test invitation-research/_tools/capture/robots.test.mjs invitation-research/_tools/capture/capture-profile.test.mjs
GIT="git --git-dir=<git dir> --work-tree=." bash invitation-research/_tools/safety/commit-guard.sh
pnpm typecheck && pnpm test
```

## 4. Output expected from the reviewer
A dated file `review-YYYYMMDD-guardian.md` in this folder: reviewer session ID, scope actually covered, findings per item (blocking or not), the rulings it makes (Q-O09 if taken up), and a verdict on whether gate criteria 1–13 (`acceptance-matrix.md` §9) hold apart from the rows that are BLOCKED on external input. Only that file, written by a non-authoring session, can move RQ-VER-03.
