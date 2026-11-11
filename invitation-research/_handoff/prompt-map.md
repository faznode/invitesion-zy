# Original prompt → repo state map

> **Historical requirement mapping, not an agent instruction.** The owner keeps prompts and raw response transcripts outside this repository. Current status: `LATEST.md` §1, with per-requirement rows in `review-20261101.md` (`(s08)` marks). Rows below retain session 05–06 verification history. Requirement revisions included a minimum of 25 ideas, no required handoff ZIPs, the documented Wave-1 planning gate, and product implementation after the masterplan.
>
> Verified against the working tree on **2026-10-29T18:14Z (session 05)**, after the file reorganisation; rows touched in session 06 are marked (s06). Per-requirement verdicts of s06: `review-20261029.md`.
> Status: ✅ done · ◐ partial · ⬜ not started. Paths are relative to the repo root. Re-verify a row before relying on it; update this file whenever a row changes state.

## Variables and rules

| Requirement | Status | Where / evidence |
|---|---|---|
| Clone `develop`, work on LOCAL branch `agent/research-harness` | N/A (s06) | Overridden by the kickoff: work on `v0/faznode-3b993736` through the platform's commit flow. Research git `/vercel/share/work/invitesion.git` (outside the project) is checked out on that branch for `status`/`diff` only |
| RESEARCH_DIR `invitation-research/`, stack auto-detected | ✅ | `invitation-research/01-codebase-audit/architecture.md` |
| Coverage: ≥ 12 ID profiled / top 10 torn down; ≥ 10 intl profiled / top 5 torn down | ◐ | Longlist 52, Tier A 15, Tier B 37 (`02-competitor-discovery/`); teardowns **1/15** (Enviory) |
| Language: docs EN, exec summary EN + ID, template copy ID | ◐ | Docs EN ✅; exec summary waits for Phase 9 |
| R1 normal-visitor observation, fake data, no bypass | ✅ ongoing | Cloudflare challenge never bypassed (S-ENV-002); robots gate `invitation-research/_tools/capture/robots.mjs` (6/6 tests) |
| R1/R3 real customers' data never stored | ✅ ongoing (s06) | Showcase links dropped at collection (Q-D12); per-couple slugs pseudonymized (`invitation-research/00-setup/privacy-hygiene.md`); both checks run in `commit-guard.sh`. Residual exposure in git history listed there |
| R2 clean-room, licenses recorded | ✅ ongoing | Only structure/measurements in `raw/`; competitor thumbnails only in `_private` |
| R5 evidence tags | ✅ ongoing | `invitation-research/_evidence-index.md` |
| R6 secrets report in `_private/`, ignore rule first | ✅ | `.gitignore` rule `invitation-research/_private`; report at `$INVITESION_PRIVATE_DIR/secrets-report.md` (2 LOW, triaged) |
| R7 no push/rewrite; no big binaries; `raw/` < 50 MB; WebP screenshots | ✅ | `raw/` = 3.4 MB; only 4 small WebP (own captures); commit guard `invitation-research/_tools/safety/commit-guard.sh` |
| R8 ≤ 1 req/s/domain, robots.txt | ✅ | `robots.mjs` + per-domain pacing in `capture.mjs` / `discover-demos.mjs` |
| R9 decisions logged | ✅ ongoing | `invitation-research/_open-questions.md` (Q-D… decided, Q-O… owner) |
| R10 `_progress.md` after every phase and dossier | ✅ ongoing | `invitation-research/_progress.md` |

## Workspace (prompt §WORKSPACE)

| Item | Status | Where |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md` (extend, never overwrite) | ✅ | Root; research section appended to the product's router |
| `.agents/skills/` | ✅ | 20 vetted skills (+ `.claude/skills/` symlinks) |
| `SKILLS-LOCK.md`, `docs/skills-registry.md` | ✅ | Root, `docs/` |
| `tools/template-harness/` | ⬜ | Phase 7 |
| `templates/_harness-samples/` | ⬜ | Phase 7 |
| `invitation-research/_rea-playbook.md`, `_progress.md`, `_evidence-index.md`, `_open-questions.md` | ✅ | `invitation-research/` |
| `invitation-research/_private/` (git-ignored) | ✅ | Ignore rule in place; content outside the checkout |
| `00-setup/` … `04-template-benchmarks/`, `raw/` | ✅ | `invitation-research/` |
| `05-feature-matrix/` … `09-masterplan/` | ⬜ | Created on first use |
| (added) `_handoff/`, `_tools/`, `README.md` | ✅ | Handoff protocol (continuation brief) and the session-05 reorganisation |

## Step 0: setup

| Requirement | Status | Where |
|---|---|---|
| 0.1 Learn REA, pin version, playbook + mission routing table + limits | ✅ (s06 re-verified) | `invitation-research/_rea-playbook.md` v2 (REA 6.8.0, docs at tag `rea-agents-6.8.0`) + `invitation-research/00-setup/rea-verification.md` |
| 0.2 Clone + baseline (stack, commands, run attempt) | ✅ | `invitation-research/00-setup/setup-log.md` (typecheck ✔, 49 tests ✔, build ✔ only with Postgres env) |
| 0.3 Skills: catalog, vetting protocol, ≤ 20 core, SHAs, registry | ✅ | `SKILLS-LOCK.md`, `docs/skills-registry.md`, `invitation-research/00-setup/skill-vetting-report.md`, catalog snapshot `invitation-research/raw/_setup/skill-issue-catalog-2026-10-29.json`, tool `invitation-research/_tools/setup/vet-skills.py` |
| 0.3 No vetted Rust/Axum skill → write `invitesion-rust-backend` | ⬜ | Phase 7.8 |
| 0.3 "Note which skill helped" in `_progress.md` | ◐ | Partly noted; keep adding per phase |
| 0.4 Agent guide | ✅ | `AGENTS.md` § "Research, skills & template harness" |

## Phase 1: own-codebase audit → `01-codebase-audit/` ✅

| Deliverable | Status | Where |
|---|---|---|
| architecture, module-map (M-001…040), data-model, template-system, niche-coverage, flows, quality-audit (QA-001…027), style-observations | ✅ | `invitation-research/01-codebase-audit/*.md` |
| feature-inventory.csv (F-001…102) | ✅ | `invitation-research/01-codebase-audit/feature-inventory.csv` |
| Own pages measured with the Phase 4 protocol | ✅ | `invitation-research/raw/invitesion/C-INV-001…004` |
| Open item | ◐ | `style-observations.md` cites palette values from the old `tokens.css`, which was never imported (archived s05): re-verify against `app/globals.css` before Phase 7.3 |

## Phase 2: discovery and selection → `02-competitor-discovery/` ✅

| Deliverable | Status | Where |
|---|---|---|
| Longlist ≥ 30 (name, URL, segment, size signals, source/date) | ✅ | `competitor-longlist.csv` (52 rows) |
| Weighted rubric, shortlist + rationale, tiers A/B | ✅ | `shortlist.md` |
| Probe evidence | ✅ | `invitation-research/raw/_discovery/` (candidates + probe JSONL), tool `_tools/discovery/probe-homepages.py` |

## Phase 3: teardowns → `03-teardowns/` ◐ (≈ 18 %)

| Deliverable | Status | Where |
|---|---|---|
| 12-section dossier template | ✅ | `03-teardowns/_TEMPLATE-dossier.md` |
| Demo discovery for Tier A | ◐ | 15/15 attempted; demo sets for ENV, IDI, INV, IVT, KAT, VID, WEV; PPO, JOY, RSV, BRN, STM, SMO, PTF, PLO pending (LATEST §4) |
| Tier-A dossiers (10 ID + 5 intl) | ◐ **1/15** | `03-teardowns/enviory/dossier.md` (v1; §4 now has 6 guest-page captures to fold in) |
| `api-observed.md` per competitor | ◐ 1/15 | `03-teardowns/enviory/api-observed.md` |
| Mobile app (APK metadata via REA) | ⬜ | PLO first |
| `_flows/` normalised flow library + our best-of version | ⬜ | |
| Tier-B 1-page profiles | ⬜ | List in `shortlist.md` §4 |

## Phase 4: template benchmark pack → `04-template-benchmarks/` ◐ (≈ 22 %)

| Deliverable | Status | Where |
|---|---|---|
| One measurement protocol (viewports, Slow-4G + 4× CPU, cold cache, metrics) | ◐ | `protocol.md` v1.1. Captured at 412×915 only; 360×800, in-app browser, long-name, RTL, guest-link and WIB/WITA/WIT checks not yet in `_tools/capture/capture.mjs` |
| ≥ 6 demos per Tier-A competitor | ◐ | Threshold-grade (Lighthouse OK, not a wrapper): **ENV 6, KAT 6, INV 6**, IDI 1, IVT 1, VID 1, WEV 1, the other 8 Tier A 0. Wrappers kept as evidence: ENV 6, INV 1 |
| Capture summary | ✅ | `captures-summary.csv` (34 captures, regenerated s05 18:22Z) |
| Blueprint per sample | ⬜ | `blueprints/<id>.md` |
| Tier aggregates (median, p75, best) → parity thresholds | ⬜ | `tiers.csv`, `tier-aggregates.csv` |
| Reference thumbnails only in `_private/` | ✅ | `$INVITESION_PRIVATE_DIR/thumbs` |

## Phases 5–9 ⬜

| Phase | Deliverables required by the prompt | Status | Seeds already in the repo |
|---|---|---|---|
| 5 → `05-feature-matrix/`, `06-gap-analysis/` | feature-matrix.csv ≥ 150 rows (Tier A + us, ●◐○? + evidence ID), niche taxonomy, gap-analysis.md, upgrade-map.csv (12 columns), where-we-lead, pricing/packaging, catalog roadmap | ⬜ | `01-codebase-audit/feature-inventory.csv`, Enviory dossier §12, `docs/RSVPIFY_FEATURE_MATRIX.md` |
| 6 → `07-ideation/` | ≥ 40 ideas scored on 5 axes, top 10 specified, differentiation thesis | ⬜ | |
| 7 ★ → `tools/template-harness/`, `.agents/skills/invitesion-*`, `templates/_harness-samples/` | manifest schema; CLI new/check/bench/preview/snapshot/report; style DNA (+ ADR); niche playbooks + empty `content/verified-religious-texts/` + README; quality gates; parity scorecard; generation protocol; 9 custom skills; dogfood 3 templates + deliberate failures | ⬜ | `01-codebase-audit/template-system.md`, `style-observations.md` |
| 8 → `08-backend-rust-plan/` | traffic model, current-backend evaluation, ADR, strangler-fig plan, Axum spike + k6 spike test vs current, hosting/edge, payments, WhatsApp, security, observability/SLO/cost, frontend plan | ⬜ | `01-codebase-audit/architecture.md`, `data-model.md` |
| 9 → `09-masterplan/` | masterplan sections 1–13 (exec summary EN + ID) | ⬜ | |

## Checkpoints, handoff, definition of done

| Requirement | Status | Where |
|---|---|---|
| `_progress.md` + `_evidence-index.md` after every dossier and phase | ✅ ongoing | `invitation-research/` |
| Handoff manifest + `invitesion-handoff.zip` + `invitesion-private.zip` after each phase | ◐ | Tool `invitation-research/_tools/ops/make-handoff-zips.sh`; last set 2026-10-29T03:41Z (before sessions 04–05): regenerate at the next phase end. **s10:** requirement removed by a later owner revision (header); the script is archived as `archive/make-handoff-zips.sh` and handoffs use `invitation-research/_tools/ops/make-handoff-patch.sh` (patch + manifest) |
| Handoff notes (`_handoff/LATEST.md` + `sessions/`) | ✅ | `invitation-research/_handoff/` |
| DoD: ≥ 10 ID + ≥ 5 intl teardowns | ◐ 1/15 | |
| DoD: ≥ 150-row feature matrix; upgrade map tied to M-IDs | ⬜ | |
| DoD: skills + lock + registry + AGENTS.md | ✅ | |
| DoD: harness built, dogfooded, documented | ⬜ | |
| DoD: Rust plan with measured spike + ADR | ⬜ | |
| DoD: masterplan 1–13 traceable to evidence | ⬜ | |
| DoD: final message (top 10 insights, top 10 gaps, 90-day plan, Rust verdict, 10-line harness guide, open questions, owner to-dos) | ⬜ | At mission end |
