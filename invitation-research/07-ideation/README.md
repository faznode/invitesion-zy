<!-- SUMMARY (first 7 lines — greppable) -->
# 07-ideation — 32 scored ideas, top-10 specifications, differentiation thesis
> WHAT: Brief 03 §16: at least 25 original ideas scored 1–5 on impact, uniqueness, feasibility, effort and risk (direction defined), observed demand kept apart from proposals, top 10 specified, thesis + three pillars.
> STATUS: Verified s10 (2026-11-04; v1 s08): `score-ideas.py --check` exit 0 (32 ideas, top 10 specified); the competitor speed range quoted in `top-10.md` follows the s10 matrix rebuild.
> OWNER: Research agent
> DEPS: ../05-feature-matrix/, ../06-gap-analysis/upgrade-map.csv, ../03-teardowns/*/dossier.md §11
> GREP: ideation, idea, score, thesis, pillar, differentiation
> UPDATED: 2026-11-04

## Files
| File | Content |
|---|---|
| `ideas.csv` | 32 ideas: demand (`observed` with evidence IDs / `proposed`), five scores, related gaps |
| `score-ideas.py` | Validates and ranks (`--check` for the guard); writes `ranking.md` |
| `ranking.md` | Generated ranking |
| `top-10.md` | Specifications of ranks 1–10 |

## Score direction (all 1–5, higher is better)
impact (5 = removes a top problem for many hosts or guests) · uniqueness (5 = not seen at any Tier-A competitor) · feasibility (5 = current stack, no new vendor) · **effort inverted** (5 = smallest) · **risk inverted** (5 = lowest risk to published invitations, money, privacy or policy). **Score = 2 × impact + the other four** (max 30). Ties: impact, then observed before proposed, then uniqueness. 21 ideas have observed demand, 11 are proposals.

## Ranking (top 10; full list in `ranking.md`)
1. I-06 WhatsApp follow-up without an API (27, observed)
2. I-05 Elder-friendly reading mode (26, proposed)
3. I-02 "Ringan" published speed and weight budget (25, proposed)
4. I-18 Visible privacy controls (24, observed problem)
5. I-03 Host QRIS gift block without custody (24, observed)
6. I-11 Verified religious-text blocks with provenance (24, proposed)
7. I-28 Low-data mode (24, proposed)
8. I-13 Sober memorial mode (24, proposed)
9. I-15 Cinematic but accessible motion (23, observed problem)
10. I-16 Generated share card and Status / Story image (23, observed)

Parity features with large impact but low uniqueness (QR guest pass I-01, wizard I-10, reseller I-25) rank lower here by design; they stay in the backlog through the gap analysis (G-027, G-040, G-052).

## Differentiation thesis
**Invitesion is the invitation every guest can open and every family can trust: light on any phone and readable by every generation, honest about prices and religious text, private by default, and complete through the event day.** Competitors win on catalog volume (IDI), services (VID, IVT) or art direction (ENV), and every measured competitor ships guest pages 7.7–23× heavier than ours at cold load (311 KiB vs 2,404–7,192 KiB medians, FM-160), with lower performance scores and, except ENV, lower accessibility (FM-156, FM-163). We turn that measured lead into a promise and add the table stakes and day-of tools that justify our price.

## Three pillars
1. **Ringan & ramah (light and inclusive):** published per-template budgets (I-02), low-data mode (I-28), elder-friendly mode (I-05), motion that is rich but accessible (I-15), enforced by the harness (B-012).
2. **Jujur & aman (honest and safe):** prices from one source (B-002), verified religious text with provenance (I-11, B-003), privacy controls and fictional samples (I-18, FM-172), no custody of guests' money until a licensed partner and legal review exist (I-03, ADR-O03).
3. **Tuntas sampai hari-H (complete through the day):** WhatsApp-native follow-up (I-06), share cards (I-16), QRIS gift block (I-03), QR guest pass and greeting screen (I-01 / G-027), dignified defaults for every niche including memorials (I-13).
