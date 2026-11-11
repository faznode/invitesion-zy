<!-- SUMMARY (first 7 lines — greppable) -->
# 00-README.md — Invitesion masterplan: index, reading order, status, evidence rules
> WHAT: Entry point to the 14 masterplan chapters (00–13): what each answers, how confident it is, where its evidence lives, and whether the plan is complete.
> STATUS: **s26 (2026-11-06): FINAL as one implementation specification (≈ 16:50Z)**. The research gate passed as qualified after the owner's ADR-O12 (RQ-COMP-04 / -05 qualified by availability, strict 13 / 21 and 4 / 15 kept); before that the plan was reconciled but not FINAL (ADR-O11). FINAL covers the plan only, not any implementation or deployment acceptance. Contents: target architecture ADR-A2 / ADR-F1 (09 §8), the executable upgrade order U1–U7 with chains (06), the template / content contract and taste process (08 §8–§9), D-041, the own column switched to `2a6015f` (05), RQ-BENCH-05 closed; `../_handoff/masterplan-gate-s26.md` has the gate evaluation. **s25 (2026-11-06): chapter bodies 01–13 brought from `7a00a6d` to the current code and evidence**, one unit at a time with a checkpoint each (session 25 file, Task 4); this index, the completion list and the implementation map refreshed with them. **Completion OPEN, not FINAL:** criterion 1 is open on RQ-COMP-04, RQ-COMP-05 and RQ-BENCH-05, and the legacy contrast INCOMPLETE pages stay explicit (`../_handoff/acceptance-matrix.md` §9). Earlier: verified s10 against `7a00a6d`; v1 s09 (baseline `64678cf`).
> OWNER: Research agent (Architect role)
> DEPS: every file in this folder; ../_evidence-index.md; ../_handoff/acceptance-matrix.md; ../_handoff/LATEST.md
> GREP: masterplan, index, reading order, chapters, confidence, evidence classes, completion, s25
> UPDATED: 2026-11-06

## Completion status
The masterplan is **verified but not complete**. Open required criteria, each with its unblock path in the acceptance matrix:
- **RQ-COMP-02 VERIFIED:** Sitemu (Tier A rank 10) has a v1 dossier since s12 (level C), read after the robots applicability audit replaced D-026 with D-030 (verified s13). Q-O08 keeps only a residual (Canva, undocumented legacy-name mapping).
- **RQ-DEMO-01 QUALIFIED BY AVAILABILITY** (owner, ADR-O10, s14):
  - Strict Wave 1 (≥ 3 valid demos for each of the top-8 Indonesian competitors) is **4 / 8 unconditional** (5 / 8 if the provisional Enviory captures are admitted, D-031 / Q-O09).
  - Indoinvite, PALEO and Satu Momen have no safely usable public demo.
  - The strict counts and the lower confidence stay reported. ADR-W1 let planning proceed; it is not that evidence.
- **RQ-COMP-04 / RQ-COMP-05 PARTIAL:**
  - **Tier B:** 13 of 21 one-pagers are substantive (s12). Sonett has been partial since s23r's rendered read (S-SNT-003), which found no prices on the page. The rest are exhausted or blocked by access controls.
  - **Public reviews:** every Tier-A dossier's §10 names its source (s14):
    - Wevitation, Indoinvite, PALEO and Partiful: paraphrased themes from the reviews each store listing shows first (not a representative sample).
    - The other 11: the checked sources were unreadable or absent.
  - **Forum and blog sources are blocked on tooling.** The search tool returns synthesized summaries without source URLs (one pilot each in s23r, s24 and s25, recorded in the acceptance-matrix row). The way forward is a search client that returns URLs, or owner-supplied threads.
- **RQ-OWN-02 VERIFIED (s23r):**
  - `22ed99e`, `9bbd813` (= `0b5eb1b`) and the s23r tree on one host, interleaved, 6 Lighthouse runs each.
  - The s23r page paints ≈ 0.67–0.82 s earlier and transfers ≈ 67–69 KB less than both older builds. LCP, TBT and score are not established (`../04-template-benchmarks/own-builds/own-build-comparison-s23r.md`).
  - Since s25, chapters 01, 02, 04 and 09 cite it **beside** the competitor comparison, which still uses `22ed99e` (C-INV-005): separate populations, never pooled.
- **Legacy contrast findings stay explicit:** 2 pages INCOMPLETE on the s23r / s24 fixture (3 on the s21 fixture). Both are the legacy headline over a cover photo. **Decided in s26 (D-041):**
  - they stay INCOMPLETE in every report, never PASS;
  - legacy is frozen as a compatibility layout;
  - new invitations will default to a family that passes the gate (F-02, U3).
- **s26 research attempts (RQ-COMP-04 / -05):**
  - one more URL-less search pilot;
  - Apple's review feeds are robots-disallowed;
  - G2 and Product Hunt refuse our reader (403);
  - Wikipedia gives company facts only for Canva and Minted.
  Both rows stayed PARTIAL until the owner qualified them by availability (ADR-O12, ≈ 16:50Z). The strict counts stay at 13 / 21 and 4 / 15, and the conclusions in `../_handoff/research-closure-s26.md` §7 remain unsupported. The **research gate passed as qualified** (§8.1 there).
- **Deferred acceptance (owner, s25):** DA-01 (real-Clerk signed-in flows) and DA-02 (the children's-photo migration in real environments). Not gate criteria, NOT RUN, never reported as passed (`../_handoff/deferred-acceptance.md`).
- **RQ-BENCH-05 VERIFIED (s26, explicit limits, the row's own criterion).** Earlier text here said only 412 × 915 was measured, which was wrong:
  - Protocol v2 measured `v2-412`, `v2-360`, `v2-390` and `v2-412-rm` (reduced motion) for 21 competitor themes (WEV 6, VID 6, INV 6, BRN 3) and our build (`queue-v2-s13.tsv` 94 / 94, espresso 4 / 4; `../04-template-benchmarks/benchmark-pack.md` §7).
  - Remaining limits, stated rather than measured:
    - Invitato and Katsudoto not re-capturable (tokenized URLs, D-019);
    - Enviory provisional (Q-O09);
    - Indoinvite, PALEO and Satu Momen without safe demos (ADR-O10);
    - physical in-app browsers, real audio and field INP (EXT).
- **RQ-MP-06 / RQ-MP-15** — no longer partial: s12 wrote acceptance, verification and rollback for the remaining 26 P1 and 26 P2 items, s13 added rollout, and the s14 table scan found every cell filled.
- Independent Guardian review (RQ-VER-03) has not happened; its scope is in `../_handoff/review-request-s14.md`. Owner decision ADR-O09 authorizes self-review, labelled as such; it is not that review.

## Implementation since the plan (refreshed s25)
Implementation proceeds alongside the open research (ADR-O08).

**Current code:** `ce6efd1`, the s23r tree as transferred by the owner (typecheck 0, 301 / 301), plus:
- s24's E-051 (S23r-P1 phone covers) and E-052 (census reporting).
- s25's E-053 (Q-O11 resolved as Q-D17; harness only).

In the exported project folder: typecheck 0, **311 / 311**.

The full reconciliation of all 42 backlog items is in `06-backlog.md` ("State at s25": 15 DONE, 7 PARTIAL, 20 OPEN); per item: `../_handoff/IMPLEMENTATION-LOG.md`.
| Backlog item | State at s25 | Where |
|---|---|---|
| B-001…B-008, B-010, B-017a, content contract | Shipped | IMPLEMENTATION-LOG (s09–s11) |
| B-011 opaque guest links | Shipped behind `FLAG_OPAQUE_GUEST_LINKS`, **off** by default | `lib/flags.ts` |
| B-014 render cost | Step 1 shipped; step 2 (cached shell) evaluated and not shipped; the CPU target is not met | D-039 |
| B-015 no Clerk on guest pages | Shipped (E-042); real-Clerk signed-in acceptance deferred out of the rebuild phase (owner, s25; DA-01, not run) | E-042, `../_handoff/deferred-acceptance.md` |
| B-016 palettes | Tokens and photo bound shipped; rendered sweep INCOMPLETE on the legacy headline over a cover (3 pages on the s21 fixture of 211, 2 on the s23r / s24 fixture of 56; run 12 re-measured E-051's 13 pages) | `../_handoff/contrast-sweep-20261104-s16.md` |
| B-012 × B-030 harness on product pages | Family byte budgets (E-044), programme fixture and relative figure (E-049), family budget on design bytes with host uploads in the page totals (E-052 measured; E-053 decided Q-O11 as Q-D17), cover fold, design acceptance | E-044, E-049, E-052, E-053, family review §13–§15 |
| B-027 RSVP | "Maybe", custom questions, an answer per event, invite-only events (flags on) | D-034–D-037 |
| B-029 corporate and ceremonies | Programme, organiser mark, ceremony profiles; corporate covers (E-048) and their 360 px phone cases (E-051; S23r-P1 closed) | E-048, E-051 |
| B-030 design families | Four families, opt-in per invitation; the classic layout stays the default | family review |
| Person and children's photos | Person photos (D-038); children's photos behind an access contract with a byte-verified migration (D-040); owner read with real keys deferred (DA-01); running the migration in real environments belongs to deployment (DA-02) | E-039, E-047 |
| B-009 cover gate with music | Not started (music is stored, not rendered); **the one open P0, unblocked** now that B-012 runs as manual gates | 06-backlog |
| B-041 theme entitlement | **Open, re-checked s25:** the config PATCH stores any positive `theme.templateId` and palette; only publishing checks orders. First in the reconciled order | 06-backlog ("State at s25") |
| RQ-OWN-02 own build vs baseline | Measured on one host (s23r): FCP 950 vs 1,624 / 1,772 ms, transfer −67 / −69 KB against `22ed99e` / `9bbd813`; LCP not established | `../04-template-benchmarks/own-builds/` |

## Reading order (verified s10)
1. `01-executive-summary.md` — the decision in two pages, in English and Bahasa Indonesia.
2. `02-evidence-coverage.md` — what the evidence can and cannot carry (read before trusting any number).
3. `04-current-state.md` — the product today, baseline vs the P0 already shipped.
4. `06-backlog.md` — what to build next: "State at s25" (every item reconciled against code) first, then the chains.
5. `08-template-system-and-harness.md` and `09-backend-and-frontend-architecture.md` — the template contract and the measured stack verdict.
6. The rest as needed; `../_handoff/acceptance-matrix.md` for the per-requirement verification.

| # | Chapter | Answers | Status (s25; s10 verification kept) | Confidence |
|---|---|---|---|---|
| 00 | this file | where things are, completion status | refreshed s25 | — |
| 01 | `01-executive-summary.md` | thesis, top decisions, 90-day plan with progress (EN + ID) | body updated s25 | medium (planning under ADR-W1 and ADR-O10, not literal Wave 1) |
| 02 | `02-evidence-coverage.md` | what the evidence covers, gates, exclusions, assumptions, gaps | states updated s25 | high on what is missing |
| 03 | `03-market-and-competitors.md` | landscape, 15 Tier-A profiles (Sitemu v1 since s12), Tier-B summary (13 / 21), insights | states updated s25; no new research | medium; level-C competitors rest on public claims; Enviory guest-page numbers provisional (D-031) |
| 04 | `04-current-state.md` | our product today: architecture, strengths, defects at s25, debt, posture | body rewritten s25 | high for code; competitor comparisons use the pre-P0 numbers; the current page appears only in RQ-OWN-02 and the harness census |
| 05 | `05-feature-matrix-and-gaps.md` | 187-row matrix, 68-row upgrade map, delta at s25 | delta updated s25; matrix column still the baseline (open data task) | medium–high |
| 06 | `06-backlog.md` | prioritized backlog B-001… with P0 ≤ 12; "State at s25" | **reconciled s25** (15 / 7 / 20) | high for P0 and next-phase items; P1 / P2 states from code search |
| 07 | `07-canonical-flows.md` | creator, guest, host, reseller, post-event journeys | "today" updated s25 | medium (proposed flows on mostly claimed competitor evidence beyond the guest page) |
| 08 | `08-template-system-and-harness.md` | template manifest v1, budgets, gates, CLI, dogfood; product gates (§4a) | body updated s25 | high for the contract; budgets are internal |
| 09 | `09-backend-and-frontend-architecture.md` | architecture, measured Next.js vs Rust verdict and its outcome, deployment, operations | body updated s25 | medium (lab spike and own-build measurements on one host) |
| 10 | `10-data-privacy-security-payments.md` | data, abuse, tenancy, payments, WhatsApp, religious text | body updated s25 | medium; legal review pending |
| 11 | `11-pricing-growth-roadmap.md` | packaging, growth, 90-day sequence with s25 state, KPIs | §4 updated s25 | medium; no traffic or revenue data |
| 12 | `12-decision-log.md` | ADRs (W1, O01…O10, A1) with revisit triggers; D-034…D-040, Q-D17 | extended s25 | per ADR |
| 13 | `13-appendix.md` | evidence and dossier index, skills, glossary | updated s25 | — |

## Evidence rules used throughout
- Claim classes: **OBSERVED** (we saw it: code, capture, page read), **CLAIMED** (a vendor or source says so), **INFERRED** (reasoned from observed facts), **ESTIMATE** (a computed range with stated inputs), **ASSUMPTION** (a working premise with a revisit trigger), **UNKNOWN**.
- IDs: `S-` sources, `C-` captures (`C-INV-0xx` = our Invitesion, `C-INV-1xx` = INVI.ID), `D-` decisions, `F-` our features, `FM-` matrix rows, `G-` gaps, `QA-` audit findings, `M-` modules, `B-` backlog items, `E-` implementation entries, `ADR-` decisions in chapter 12, `RQ-` requirements in the acceptance matrix.
- Benchmarks honour `../04-template-benchmarks/benchmark-exclusions.csv`; Lighthouse cold-load and post-visit CDP numbers are never mixed; TBT is not INP; a click is not an opening and an opening is not audio playback. Competitor tier aggregates (`../04-template-benchmarks/benchmark-pack.md`) support no parity threshold.
- Strict Wave 1 is **not met** (Indoinvite, PALEO and Satu Momen have no eligible guest-page captures). Planning proceeds under **ADR-W1**, a reduced-confidence exception that is not itself evidence.
- Our own guest-page numbers (C-INV-001…005) describe the `22ed99e` build, before the s09 P0 changes. They remain the population for competitor comparisons. The current page appears only in the own-build comparison (RQ-OWN-02, s23r) and the harness byte census (review fixture). Each is its own population, never pooled with captures.
- No traffic, revenue, latency baseline, price decision or production access is invented (ADR-O06). Unavailable inputs are listed as owner dependencies.
- Reference integrity: `python3 -B invitation-research/_tools/safety/check-references.py` (IDs, links and quoted paths) must exit 0 after any chapter change.
