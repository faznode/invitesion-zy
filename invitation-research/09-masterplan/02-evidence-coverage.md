<!-- SUMMARY (first 7 lines — greppable) -->
# 02-evidence-coverage.md — evidence quality, confidence, gaps, assumptions, exclusions, addenda
> WHAT: How much each conclusion of this masterplan can be trusted, per competitor and per conclusion type.
> STATUS: **s26 (2026-11-06): gate row (ADR-O11, criterion 1 open on RQ-COMP-04 / -05), the protocol-v2 row (done; RQ-BENCH-05 closed) and the s26 review-source attempts (pass D: G2 / Product Hunt 403, Apple feeds disallowed).** **s25 (2026-11-06): states brought to the current evidence** (gates with ADR-O08 / ADR-O10; Sitemu v1, Tier-B 13 / 21, Enviory provisional; own product re-read at s25 and RQ-OWN-02 verified; §6 research items with their s25 state, RQ-COMP-05 still blocked on tooling, its s25 pilot recorded once) · earlier: verified s10 (v2 s09, v1 s08), evidence cutoff s10 + s09 spike · planning gate met through ADR-W1 (not literally) · open items in §6 and `../_handoff/acceptance-matrix.md`
> OWNER: Research agent
> DEPS: ../_evidence-index.md, ../04-template-benchmarks/{captures-summary.csv,benchmark-exclusions.csv,protocol.md,benchmark-pack.md}, ../03-teardowns/*/dossier.md, ../03-teardowns/tier-b-profiles.md, 12-decision-log.md (ADR-W1)
> GREP: evidence, confidence, coverage, ADR-W1, ADR-O10, exclusions, addenda, assumptions, RQ-COMP-05, tooling
> UPDATED: 2026-11-06

## 1. Gates (reported separately, never merged)
| Gate | Status | Basis |
|---|---|---|
| Strict Wave 1 (dossier + ≥ 3 valid demos for each top-8 Indonesian vendor; 5 international dossiers) | **NOT MET** | IDI, PLO, SMO have 0 valid demos (ADR-W1) |
| Revised demo obligation (≥ 6 valid demos for the top-6 Indonesian vendors where safely available) | **met where available; strict 2 / 6 unconditional** (3 / 6 with provisional evidence) | WEV 6, VID 6 (s10); ENV 6 only in the sensitivity population (provisional, D-031, Q-O09); IDI, PLO, SMO unavailable (`../04-template-benchmarks/benchmark-pack.md` §6) |
| Profile coverage (≥ 12 Indonesian, ≥ 10 international substantive profiles) | **MET** (17 / 11; most conservative 16 / 11) | 10 Tier-A dossiers (Sitemu v1 since s12) + 7 substantive Indonesian Tier-B one-pagers; 5 + 6 international (`../03-teardowns/tier-b-profiles.md`). The most conservative count leaves out Enviory, whose guest-page section rests on provisional captures (D-031); its marketing sections rest on S-ENV-001, which G2 does not touch |
| Tier-A dossiers (10 Indonesian + 5 international) | **15 / 15** (s12) | Sitemu v1 written after the D-030 applicability audit (level C: marketing, pricing, catalog; no guest-page measurement). Enviory §4 is provisional (D-031) |
| Planning gate | **MET through ADR-W1** (2026-11-03T16:54Z) — reduced-confidence exception, not evidence | all seven fallback items met (12-decision-log.md) |
| Strict demo coverage, owner qualification (s14) | **QUALIFIED BY AVAILABILITY** (ADR-O10): strict counts and lower confidence are kept and reported (RQ-DEMO-01: 5 / 8; 4 / 8 without the provisional Enviory evidence) | `12-decision-log.md` ADR-O10; acceptance matrix §2 |
| Masterplan completion gate | **PASSED, qualified** (s26, ≈ 16:50Z). Criterion 1 holds after the owner qualified RQ-COMP-04 and RQ-COMP-05 by availability (ADR-O12; strict 13 / 21 and 4 / 15 kept; the unsupported conclusions are listed in `../_handoff/research-closure-s26.md` §7). Earlier in s26 it was NOT PASSED on those two rows. RQ-BENCH-05 closed in s26 (explicit limits). Under ADR-O11 (s26) the research and final-masterplan gates precede any new feature or migration; ADR-O08's earlier permission is historical. Self-review under owner authority (ADR-O09); `../_handoff/research-closure-s26.md`, `../_handoff/masterplan-gate-s26.md` | `../_handoff/acceptance-matrix.md` §9 |

## 2. Evidence per competitor
| Code | Dossier level | Valid guest-page captures (cold-load / structure, unique themes) | Other evidence | Confidence for guest-page conclusions |
|---|---|---|---|---|
| WEV Wevitation | A/B (v1 s07) | 6 / 6 | S-WEV-001…005 | medium-high |
| ENV Enviory | A (v2 s07) | 13 captures, 6 themes / 6, **provisional since s13** (D-031, Q-O09); used only in the sensitivity population | S-ENV-001/002, B-ENV-001/002 | high if admitted; excluded from the unconditional aggregates until Q-O09 is answered |
| INV INVI.ID | B (v1 s06) | 6 / 6 | S-INV-001…003 | medium-high (pre-D-016 click) |
| KAT Katsudoto | B (v1 s06) | 6 / 6 | S-KAT-001…004 | medium (opening unverified) |
| IVT Invitato | B (v1 s07) | 4 / 2 | S-IVT-001…005 | medium |
| VID Viding | B (v1.1 s10) | 6 / 6 (C-VID-101…103, 107…109) | S-VID-001…006 | medium-high (opening verified on 2 of 6; C-VID-104…106 excluded, D-022) |
| BRN Barunson | B (v1 s08) | 3 / 3 | S-BRN-001…005 | medium (Korean read by hand) |
| IDI Indoinvite | C (v1 s08) | 0 (catalog captures excluded, D-020) | S-IDI-001…006, D-IDI, Play | **low** |
| SMO Satu Momen | C (v1 s08) | 0 (previews carry personal data, D-008) | S-SMO-001…006 | **low** |
| PLO PALEO | C (v1 s08) | 0 (app-only) | S-PLO-001…003 | **low** |
| PPO / RSV / JOY / PTF | C (v1 s08) | 0 | one or two reads each; RSV pricing behind bot protection, never bypassed | **low** (claims) |
| STM Sitemu | C (v1 s12, after the D-030 robots applicability audit replaced D-026) | 0 | marketing, pricing, catalog reads | low (claims; no guest-page measurement) |
| Tier-B (21 vendors) | C (s10 one-pagers, s12 re-reads) | 0 | S-UVR-001 … S-BHP-002 (homepage + ≤ 2 pricing / feature pages each) | low (claims). **13 substantive** (s12). Sonett has been partial since s23r's rendered read found no prices (S-SNT-003). The rest are thin, blocked or unreadable. RSVPify has no rendered finding: its origin denied our reader, and no other client is used after a denial |

## 3. Confidence per conclusion type
| Conclusion | Confidence | Why |
|---|---|---|
| Our own product (features, defects, architecture) | high | code read at `2c94140`, identical product code at `64678cf`; runtime checks for QA-001, QA-005 (s08 + s09) and QA-003's 200 (s09); revalidated at `7a00a6d` with the shipped P0 separated (`../01-codebase-audit/revalidation-s10.md`). Re-read against the s25 code for chapters 04 and 06 ("State at s25"); every implementation since s11 is in IMPLEMENTATION-LOG E-012…E-053 with its own tests |
| Guest-page performance comparison | medium (lab only) | Eligible captures, Lighthouse 12.8.2 mobile; TBT ≠ INP. C-INV-005 omits middleware and clerk-js and predates the s09 P0 changes. Our current page has been measured against our own older builds since s23r (RQ-OWN-02: one host, FCP / TTI / transfer, LCP not established). That is a separate population, so the competitor comparison still uses C-INV-005 |
| "Typical Indonesian premium / DIY guest page" | medium | 4 of the top 8 measured unconditionally, 5 with the provisional Enviory themes (ADR-W1, D-031); unconditional tier aggregates: premium 20 themes / 4 vendors (high), signature 8 / 2 (medium), basic 3 / 1 (low); sensitivity premium 26 / 5 (high) |
| Mass-market DIY leaders (IDI, PLO) guest pages | low | unmeasured |
| Feature presence for level-C vendors | low-medium | vendor claims and structure-only observations |
| Prices and packaging | high | public pages read on dated visits |
| Market size, traffic, conversion | not established | no analytics access (ADR-O06); Tranco and install bands are coarse estimates |
| Backend capacity (spike) | medium for relative comparison, low for absolute capacity | s09 matched rerun of three arms in two rounds with validity rules (`../08-backend-rust-plan/spike/`); 2-vCPU sandbox, load generator and Postgres on the same host, platform dev server measured idle; fake data; no middleware; s08 Next-only files are historical and not compared; see 09 and ADR-A1 |

## 4. Exclusions honoured (`04-template-benchmarks/benchmark-exclusions.csv`, 26 rows)
Wrappers (C-ENV-101…106, C-INV-101), closed-cover structure rows (incl. C-IVT-102/103), Indoinvite catalog pages (C-IDI-101…107), Viding Studio captures (C-VID-104…106: robots.txt answered 500 → disallow, D-022). `eligibility.py` enforces them for every aggregate; the feature-matrix builder and dossier digests use it.

## 5. Assumptions (each with a revisit trigger)
- Hosting is Vercel functions in `sin1` near the database (ADR-O06) → revisit when the owner states regions.
- Prices observed on one date are current → revisit before any pricing decision (re-read the price pages).
- Keyword-detected features are present when detected; absence is Unknown → per-vendor reading for new rows.
- Vendor demos are placeholders only where verified (D-008, D-019, D-021).

## 6. Research items: done in s10 and still open
These were "addenda that do not block planning" until s10. They are required deliverables, so the open ones keep the masterplan's completion status open (`../_handoff/acceptance-matrix.md`).

| Item | State | Where / what would close it |
|---|---|---|
| `_flows/` normalized competitor flows | **done s10** | `../03-teardowns/_flows/` (observed / claimed / proposed) |
| Tier-B one-pagers (21 vendors) | **partial**: 13 substantive since s12; Sonett partial since s23r (S-SNT-003); the rest exhausted or blocked by access controls | `../03-teardowns/tier-b-profiles.md` (RQ-COMP-04) |
| Sample blueprints, tier classification, per-tier aggregates | **done s10** | `../04-template-benchmarks/benchmark-pack.md` |
| Viding to six valid demos | **done s10** (C-VID-107…109) | Viding dossier §4 |
| Sitemu dossier (rank 10) | **done s12** (v1, level C), after D-030 replaced D-026; Q-O08 keeps only a residual | Sitemu dossier (RQ-COMP-02 VERIFIED) |
| Public complaints per dossier (§10) | **partial** (s14): themes for WEV, IDI, PLO, PTF from store listings (first-shown reviews only, low confidence); the other 11 dossiers name the source checked and why it was unreadable. **Blocked on tooling:** the search tool in s23r, s24 and s25 (one pilot each, recorded in the acceptance-matrix row) returns synthesized summaries with citation markers and no source URL, so nothing is citable | A search client that returns source URLs under an owner-approved identity, or owner-supplied thread URLs; then robots-checked reads through `profile-reads.py`. Trustpilot after Q-O08 (RQ-COMP-05) |
| Protocol-v2 captures (360×800, 390×844, reduced motion) | **done** (s13–s15) for 21 competitor themes and our build; RQ-BENCH-05 VERIFIED in s26 with explicit limits (Invitato / Katsudoto not re-capturable, Enviory provisional, IDI / PLO / SMO without demos; in-app browsers, audio and field INP EXT). This row said "open" until s26 | `../04-template-benchmarks/benchmark-pack.md` §7; `../_handoff/research-closure-s26.md` §3.2 |
| In-app browsers, audio playback, INP | **open** (external) | device lab or field data |
| Our current guest page after P0 | **done s23r** (RQ-OWN-02 VERIFIED): three builds on one host, interleaved, 6 runs each; FCP, TTI and transfer established; LCP, TBT and score not | `../04-template-benchmarks/own-builds/own-build-comparison-s23r.md`; a new run only for a new question |
| Placeholder demos for IDI / SMO / PLO / PPO / JOY | **external** | only if a vendor publishes one (ADR-W1 revisit trigger) |
| Viding Studio generation | **external** | once `studio.viding.co` serves robots.txt with 2xx / 4xx |
