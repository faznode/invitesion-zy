# invitation-research/

Competitor research, benchmarks, analysis and the masterplan for Invitesion, plus the tooling that produced them.
**Resume from `_handoff/LATEST.md`.** Per-requirement verification: `_handoff/acceptance-matrix.md`. Masterplan entry point: `09-masterplan/00-README.md`. The owner supplies agent instructions and raw response transcripts outside this repository; they are never stored here.

## Layout (grouped by responsibility)

| Path | Responsibility | Contents |
|---|---|---|
| `_handoff/` | Technical progress records | `LATEST.md` (current checkpoint) · `acceptance-matrix.md` (requirement verification) · `IMPLEMENTATION-LOG.md` (product increments) · `sessions/` (one record per session) · `review-*.md` (dated reviews) · `prompt-map.md` (historical requirement mapping) |
| `_progress.md` · `_evidence-index.md` · `_open-questions.md` · `_rea-playbook.md` | Mission control | phase board + decisions D-NNN · evidence IDs · owner questions · REA and visitor-read rules |
| `00-setup/` … `08-backend-rust-plan/` | Research evidence and analysis | `00` setup and skill vetting · `01` own-codebase audit (+ `revalidation-s10.md`) · `02` longlist + shortlist · `03` Tier-A dossiers, `tier-b-profiles.md`, `_flows/` · `04` protocol, captures summary, benchmark pack, exclusions, `queues/` · `05` feature matrix · `06` gap analysis · `07` ideation · `08` Rust plan + load spike |
| `09-masterplan/` | The plan | chapters 00–13 (reading order and completion status in `00-README.md`) |
| `raw/` | Collected machine evidence (cap 50 MB; 4.6 MB on 2026-11-04) | `<competitor>/` capture and discovery JSON · `invitesion/` our own captures · `_discovery/` cross-competitor probes and Tier-B reads · `_setup/` skill-catalog snapshot · `_captures.csv` capture log |
| `_tools/` | Research tooling (executable only) | `ops/` sandbox bootstrap, local stack, handoff patch · `safety/` commit guard, secrets scan, redaction, pseudonymisation, reference checker · `discovery/` homepage probe, demo discovery and selection, Tier-B profile reads · `capture/` capture pipeline, robots gate, batch runner, summarizer, eligibility, benchmark pack, dossier digest · `setup/` skill vetting, local demo seed |
| `_private/` | Git-ignored, never committed | secrets report, competitor thumbnails, Lighthouse JSON. In the sandbox it lives at `$INVITESION_PRIVATE_DIR` |

Filing rules: documents go in a phase folder, scripts in `_tools/<group>/`, machine-collected data in `raw/`, generated queues in `04-template-benchmarks/queues/`. Scripts resolve the research root as two levels above their own folder, so keep them exactly two levels deep. Run Python tools with `python3 -B` (no bytecode in the tree).

## Evidence pipeline (which tool writes what)

| Step | Tool | Reads | Writes |
|---|---|---|---|
| Visitor reads (robots first, paced) | `_tools/discovery/probe-homepages.py`, `discover-demos.mjs`, `profile-reads.py` | public pages | `raw/_discovery/`, `raw/<competitor>/discovery-*.json` |
| Rendered read (one client-rendered page, s23r) | `_tools/discovery/rendered-read.py` (robots and stop rules from `profile-reads.py`) + `rendered-read.mjs` (one navigation in the capture browser) | one public page | `raw/_discovery/rendered-reads-*.jsonl` (facts only; DOM and text private) |
| Own builds on one host (RQ-OWN-02, s23r) | `_tools/capture/own-build-bench.mjs` (`lighthouseArgs` of `capture-profile.mjs`; rotated rounds; `--merge`) | local builds of the own guest page | `04-template-benchmarks/own-builds/` (no capture rows) |
| Capture | `_tools/capture/capture.mjs` via `run-batch.sh` (robots gate `robots.mjs`) | a queue in `04-template-benchmarks/queues/` | `raw/<competitor>/C-*.json`, `raw/_captures.csv` |
| Profile check (before v2 captures) | `_tools/capture/verify-profiles.mjs` | a local 127.0.0.1 probe page | `raw/_setup/profile-verification-*.json` |
| Summary + eligibility | `_tools/capture/summarize-captures.py`, `eligibility.py` (rules 1–8: exclusions, provisional evidence, measurement populations = profile + own build) | raw captures, `04-template-benchmarks/{benchmark-exclusions,benchmark-provisional}.csv` | `04-template-benchmarks/captures-summary.csv` |
| Benchmark pack | `_tools/capture/benchmark-pack.py` | captures summary, raw captures | `04-template-benchmarks/{blueprints,tiers,tier-aggregates}.csv`, `sensitivity/`, `viewport/`, `benchmark-pack.md` tables (`--markdown`, `--compare`, `--viewport-markdown`) |
| Lighthouse host speed | `_tools/capture/lighthouse-environment.py` | full Lighthouse reports (own: committed; competitors: private, sandbox-only) | `04-template-benchmarks/viewport/lighthouse-environment.csv` (merged; never erases values) |
| Dossier tables | `_tools/capture/dossier-digest.py` | raw captures of one measurement population (exit 2 on a mixed population) | Markdown on stdout |
| Feature matrix | `05-feature-matrix/build-matrix.py` | `features.csv`, `assessments/*.csv`, raw captures, evidence index | `feature-matrix.csv`, `feature-matrix-long.csv`, `coverage-summary.md` |
| Ideas | `07-ideation/score-ideas.py` | `07-ideation/ideas.csv` | ranking (stdout), `--check` |
| Load spike | `08-backend-rust-plan/spike/run-spike.sh`, `summarize-spike.py` | local stack | `spike/results/<set>/` + `summary.md` |
| Reference integrity | `_tools/safety/check-references.py` | living documents | report (exit 1 on any unresolved ID, link or path) |

## Commands (from the repo root)

```bash
source /vercel/share/work/tools/env.sh                                          # sandbox toolchain (bootstrap-sandbox.sh tools)
"$REA_NODE" --test invitation-research/_tools/capture/robots.test.mjs invitation-research/_tools/capture/capture-profile.test.mjs
python3 -B invitation-research/_tools/discovery/test_profile_reads.py           # robots matcher + D-030 (28 tests)
python3 -B invitation-research/_tools/capture/test_eligibility.py               # 38 tests (s14)
python3 -B invitation-research/_tools/capture/test_benchmark_pack.py            # 22 tests (s14)
python3 -B invitation-research/_tools/capture/benchmark-pack.py --check         # pack files match the captures
python3 -B invitation-research/05-feature-matrix/build-matrix.py --check        # 187 rows, 0 errors
python3 -B invitation-research/07-ideation/score-ideas.py --check               # 32 ideas
python3 -B invitation-research/08-backend-rust-plan/spike/summarize-spike.py s09-20261103-r1 --check
python3 -B invitation-research/_tools/safety/check-references.py                # IDs, links, quoted paths
python3 -B invitation-research/_tools/safety/redact-discovery.py --check        # privacy check after any discovery
GIT="$GIT_RESEARCH" bash invitation-research/_tools/safety/commit-guard.sh      # before every research commit
```

Capture batches run in the background only: `bash invitation-research/_tools/capture/run-batch.sh invitation-research/04-template-benchmarks/queues/<queue>.tsv`.

## ID conventions

- Captures `C-<CODE>-NNN`. Naming hazard: `C-INV-0xx` = **our own Invitesion** (`raw/invitesion/`), `C-INV-1xx` / `2xx` = **INVI.ID** competitor (`raw/invi/`). `C-<CODE>-2xx` are protocol v2 captures.
- Sources `S-<CODE>-NNN` · decisions `D-NNN` · questions `Q-D…` (decided autonomously) and `Q-O…` (owner) · modules `M-NNN` · features `F-NNN` · quality findings `QA-NNN` · matrix rows `FM-NNN` · gaps `G-NNN` · backlog `B-NNN` · ideas `I-NN` · implementation entries `E-NNN` · requirements `RQ-…`.
- Evidence tags: `[OBSERVED]` `[CLAIMED]` `[ESTIMATE]` `[INFERRED]` `[UNKNOWN]`; flow targets are `PROPOSED`.

## Path changes

Session logs are append-only, so older sessions still cite the paths they used. Living documents were rewritten with each move.

### Session 10 (2026-11-04)

| Old path (under `invitation-research/`) | New path | Why |
|---|---|---|
| `_tools/ops/make-handoff-zips.sh` | `archive/make-handoff-zips.sh` (repository root) | retired: ZIP handoffs removed by the owner; replaced by `_tools/ops/make-handoff-patch.sh` |
| `08-backend-rust-plan/spike/results/next-*`, `rust-read-spike-*.txt` (15 files) | `08-backend-rust-plan/spike/results/s08-20261103-historical/` | every result set is now a folder; contents unchanged (sha256 verified) |

### Session 05 (2026-10-29)

| Old path (under `invitation-research/`) | New path |
|---|---|
| `00-setup/scripts/bootstrap-sandbox.sh`, `make-handoff-zips.sh` | `_tools/ops/` |
| `00-setup/scripts/commit-guard.sh`, `secrets-scan.py` · `03-teardowns/scripts/redact-discovery.py` | `_tools/safety/` |
| `02-competitor-discovery/scripts/probe-homepages.py` · `03-teardowns/scripts/discover-demos.mjs`, `select-demos.py` | `_tools/discovery/` |
| `00-setup/scripts/capture.mjs`, `robots.mjs`, `robots.test.mjs` · `04-template-benchmarks/scripts/run-batch.sh`, `summarize-captures.py` | `_tools/capture/` |
| `00-setup/scripts/vet-skills.py` · `01-codebase-audit/scripts/seed-local-demo.ts` | `_tools/setup/` |
| `00-setup/skill-issue-catalog-2026-10-29.json` | `raw/_setup/` |
| `02-competitor-discovery/candidates.txt`, `probe-2026-10-29.jsonl` | `raw/_discovery/` |
| `04-template-benchmarks/queue-tier-a*.tsv` | `04-template-benchmarks/queues/` |

Outside this folder (session 06 redid these moves at the repository root):

| Original path (repository root) | New path |
|---|---|
| `REBUILD-HANDOFF-A-Z.md` | `docs/specs/REBUILD-HANDOFF-A-Z.md` |
| `artifacts/navigation/*.png` | `docs/worklog/assets/2026-07-18-public-navigation/` |
| `README.md` (Next.js starter boilerplate) | `archive/README-nextjs-saas-starter.md` (provenance in `archive/README.md`) |
| `tokens.css` (unused old-brand tokens) | `archive/tokens-old-brand.css` |
