<!-- SUMMARY (first 7 lines — greppable) -->
# 05-feature-matrix — evidence-linked feature matrix (brief 03 §15, brief 05 §15)
> WHAT: 187 stable feature rows (FM-001…FM-187) × Invitesion today + the 15 Tier-A competitors; every known cell cites evidence; measured rows come from eligible captures only.
> STATUS: **s26 (2026-11-06): the curated Invitesion column describes `2a6015f`** (20 cells re-assessed from code with `REPO@2a6015f` and E- entries; 59 Full / 24 Partial / 104 None, was 42 / 29 / 116); the pre-switch files are frozen in `baseline/` (`feature-matrix-s25.csv`, `coverage-summary-s25.md`, `invitesion-assessment-s25.csv`); derived own cells stay on the pre-P0 build `22ed99e` and say so; competitor cells unchanged; `build-matrix.py --check` exit 0. Verified s10 (2026-11-04; curated cells s08). Measured cells rebuilt s10 with C-VID-107…109 (Viding now six themes; totals unchanged). Evidence cutoff = `../_evidence-index.md` session 08 for curated cells, session 10 for measured cells. The "Invitesion today" column is the **pre-P0 baseline** (`22ed99e`); the P0 delta is in `../01-codebase-audit/revalidation-s10.md` §3. Planning gate met through ADR-W1 (reduced confidence for IDI, PLO, SMO guest pages); Sitemu BLOCKED (D-026).
> OWNER: Research agent (autonomous, brief 05 §16)
> DEPS: ../01-codebase-audit/{feature-inventory.csv,module-map.md,quality-audit.md,revalidation-s10.md}, ../03-teardowns/*/dossier.md, ../raw/*/C-*.json, ../_tools/capture/eligibility.py, ../04-template-benchmarks/benchmark-exclusions.csv
> GREP: feature matrix, FM-, Full, Partial, None, Unknown, coverage, niche, baseline, own column
> UPDATED: 2026-11-06

## Files
| File | What | Edited by |
|---|---|---|
| `features.csv` | Row definitions: family (guest 66 / host 57 / business 35 / platform 29), area, feature, **criteria for Full / Partial / None**, our F-IDs, our M-IDs | hand |
| `assessments/<column>.csv` | Curated cells per column (`invitesion`, `IDI` … `PTF`): status, basis (`CODE`, `OBSERVED`, `CLAIMED`, `INFERRED`), evidence IDs, note | hand |
| `build-matrix.py` | Validates every cell and evidence ID, derives measured cells from eligible captures, writes the outputs; `--check` for the guard | code |
| `feature-matrix.csv` | **The matrix**: one row per feature, one status column per competitor + Invitesion today, compact evidence | generated |
| `feature-matrix-long.csv` | Every known cell with basis, source (curated / derived), all evidence IDs and the note | generated |
| `coverage-summary.md` | Known-cell counts per column and family; curated-vs-derived disagreements | generated |
| `niche-coverage.md` | Religious, regional and life-event niches: ours vs competitors (brief 03 §15 "Niche coverage") | hand |

Rebuild after any edit: `python3 -B invitation-research/05-feature-matrix/build-matrix.py` (errors exit 1 and write nothing).

## Rules (enforced by the builder)
1. **Four statuses only:** Full, Partial, None, Unknown. A missing cell is **Unknown**; Unknown is never converted to None. "Not seen on three pages" stays Unknown unless the page itself shows the absence (e.g. two RSVP buttons only → `FM-023` None for IVT).
2. **Evidence on every known cell**, resolved against `../_evidence-index.md` (ranges such as `S-IVT-001…005` are expanded), `../04-template-benchmarks/captures-summary.csv`, the longlist (`LONGLIST:<CODE>`), and, for our own column only, the codebase audit (`F-`, `M-`, `QA-`) or `REPO@2c94140` for verified absences.
3. **Measured rows** (FM-156…160, 162…164, 179 and the page-level FM-047, FM-055) come from **eligible captures only** (`eligibility.py`: cold-load for Lighthouse rows, structure for page rows; median per theme first). Bands use Lighthouse 12.8.2's own mobile control points (score ≥ 90 / ≥ 50; LCP 2.5 / 4.0 s; TBT 200 / 600 ms; CLS 0.10 / 0.25; total bytes 2,667 / 4,000 KiB), read from the installed package (`core/audits/**`).
4. **Keyword-detected features** only ever derive **Full** (seen in ≥ 1 eligible theme). The detector reads Indonesian/English text, so Korean pages (BRN) are read by hand (S-BRN-005) and English-heading themes may be under-detected (VID dossier §4.4).
5. **Curated beats derived.** The disagreements are intentional and listed in `coverage-summary.md`: galleries with a photo cap stay Partial (INV; ENV only when the provisional captures are admitted), and zone labels that are present but known to be wrong stay Partial (ours: QA-002; WEV: correctness not verifiable). Three in the unconditional population, four with provisional evidence (s16 re-read of `build-matrix.py --check`).
6. **Our own column is never Unknown** (we can read our code); our measured rows use C-INV-001/002/005 with C-INV-005's limits (local production build, `middleware.ts` omitted because of placeholder Clerk keys, no CSP / locale cookie / real auth: D-012, P-INV-010).

## Coverage at the cutoff (from `coverage-summary.md`)
- Competitor cells known: **633 / 2,805** (23 %; s13, unconditional population). Highest: ENV 73, IVT 69, WEV 68, KAT 66, INV 62, IDI 61, SMO 58, VID 57. International: BRN 40, RSV 20, PPO 16, JOY 9, PTF 8 (level-C dossiers: claims only). ENV lost its 10 measured cells (FM-055, FM-156…160, FM-162…164, FM-179) because they rest on the provisional captures C-ENV-111…123 (D-031, Q-O09); `coverage-summary.md` § Sensitivity lists what they would be (643 known cells with them, the s10 figure). **Sitemu 0**: its v1 dossier exists since s12 (D-030, level C), but no curated cells have been written for it yet.
- Confidence follows the dossier evidence level: **A/B** (ENV, WEV, VID, IVT, INV, KAT, BRN: measured guest pages) > **C** (IDI, SMO, PLO, PPO, RSV, JOY, PTF: marketing, pricing, store listings, claims). ADR-W1 limits for IDI, SMO, PLO apply to every guest-page row.

## Headline readings (detail and module mapping: `../06-gap-analysis/`)
- **Table-stakes gaps** (we are None/Partial while ≥ 6 of the 9 measured-or-read Indonesian vendors are Full): background music (FM-004, 9/9), cover gate (FM-003, 8), countdown (FM-008, 8), add to calendar (FM-021, 8), photo gallery depth (FM-014, 7), QR check-in scanner (FM-079, 7), video (FM-016, 6), QR pass (FM-042, 6), OG image (FM-047, 6), RSVP party size kept correctly (FM-024, 6), custom music (FM-007, 6).
- **Where we lead, measured (lab, C-INV-005 limits, pre-P0 build):** Lighthouse performance 94 vs medians 28–55 (FM-156), TBT 184 ms vs 416–4,192 ms except BRN 0 ms (FM-158), 311 KiB vs 3,084–7,192 KiB (FM-160), accessibility 96 vs 77–86 (FM-163), 0 third-party entities vs 2–9 (FM-179). Unconditional population (s13, D-031); with the provisional Enviory themes the ranges would read 2,404–7,192 KiB, accessibility up to 100 and third parties 1–9. Our lab LCP of 2.53 s is just over the 2.5 s "good" control point (FM-157 Partial); every competitor median is above 12.5 s (lowest: VID 12.6 s over six themes).
- **Where we lead, by design:** unlimited self-editing (FM-090), 12-month active period on the entry tier (FM-091), free drafting (FM-118), programmatic SEO + filterable catalog + 27 categories (FM-152…154), placeholder-only public samples (FM-172; IDI, SMO and IVT expose real customers' events), noindex guest pages (FM-173; ENV also), IDR + USD pricing (FM-131).
- **Business-model gaps:** reseller programmes (FM-135…137: SMO, WEV, ENV, INV), affiliate (FM-133: 5 vendors), done-for-you production (FM-105: 5 vendors), local payment breadth (FM-124…128), entry price (every Indonesian one-time entry tier observed is below our Rp 149k; see `../06-gap-analysis/pricing-packaging.md`).
