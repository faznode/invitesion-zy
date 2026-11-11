<!-- SUMMARY (first 7 lines — greppable) -->
# research-closure-s26.md — Phase A closure checklist and research-gate evaluation (session 26)
> WHAT: One finite checklist of every required research row (acceptance matrix §1–§8 and the original mission mapping in `prompt-map.md`): completion criterion, evidence and verification, missing work, next action, external limit and the authority that governs it. Ends with the gate verdict and the precise remaining conditions.
> STATUS: s26 (2026-11-06): research gate **PASSED, qualified (≈ 16:50Z)**. The owner chose option (a) of §8 (ADR-O12): RQ-COMP-04 and RQ-COMP-05 are qualified by availability, with the strict counts (13 / 21, 4 / 15) kept and §7 still unsupported. Closed in s26: RQ-BENCH-05 (explicit limits, its own criterion), RQ-ANL-01's open action (own column switched to `2a6015f`), dispositions for all 68 gaps, B-041 and 32 ideas. Until ADR-O12 the gate was NOT PASSED on those two rows.
> OWNER: Oracle (research); self-review under ADR-O09, never an independent review
> DEPS: acceptance-matrix.md, prompt-map.md, ../03-teardowns/tier-b-profiles.md, ../05-feature-matrix/, ../06-gap-analysis/dispositions-s26.csv, ../_evidence-index.md, ../04-template-benchmarks/queues/queue-v2-s13.tsv
> GREP: closure, research gate, checklist, RQ-COMP-04, RQ-COMP-05, RQ-BENCH-05, availability, disposition, RSVPify
> UPDATED: 2026-11-06

## 1. Method
- Rows come from `acceptance-matrix.md` §1–§8 (every PLAN row, plus the IMPL / EXT rows the gate reads) and from the Phase 3–5 deliverables in `prompt-map.md`. Nothing was added or dropped; masterplan rows (RQ-MP-*) are evaluated in Phase B.
- A row is closed only when its own criterion is met and the named check passes. A file existing, or a label, is not evidence.
- Availability limits are accepted only inside existing owner authority: ADR-O10 (demo availability, strict counts) and ADR-O09 (self-review). ADR-W1 remains the historical authorization to plan with reduced confidence; ADR-O08 is superseded for sequencing by ADR-O11 (s26).

## 2. Checklist: rows closed before s26 and not re-opened
Each row was verified in the session named in the matrix; s26 re-read each row against the files it cites. Only checks affected by s26 changes were re-run (§5).

| Row | Criterion (short) | Verified by | s26 |
|---|---|---|---|
| RQ-COMP-01 | ≥ 12 ID and ≥ 10 international substantive profiles | s14 recount: 17 and 11 (16 without Enviory) | unchanged |
| RQ-COMP-02 / 03 | 10 ID and 5 international Tier-A dossiers, 12 sections | s14 heading scan, 15 / 15 | unchanged |
| RQ-COMP-06 | Evidence levels and tags; claims never turned into observations | s10 tag scan | unchanged |
| RQ-TOOL-01 | Robots-correct discovery tooling with offline tests | s11–s14 suites and mutations | tool unchanged; used in pass D |
| RQ-DEMO-01 | Strict Wave 1 | **Qualified by availability (ADR-O10)**: 4 / 8 strict, 5 / 8 with provisional ENV | unchanged; never reported as met |
| RQ-DEMO-02 / 03 | ≥ 6 demos where safe; samples vs attempts | `benchmark-pack.py --check` (s11) | unchanged |
| RQ-FLOW-01 | Flow library, observed / claimed / proposed apart | s10 | unchanged |
| RQ-OWN-01 / 02 | Own revalidation; current page measured after P0 | s10; s23r same-host interleaved comparison | unchanged; not rerun (no new question) |
| RQ-BENCH-01…04, 06, 07 | Blueprints, tiers, aggregates, method, no parity thresholds, no invalid evidence | s10–s16 checks | unchanged |
| RQ-ANL-02…10 | Upgrade map, leads, pricing, niches, ideas, workload, spike, ADR, operations | s10–s14 checks | unchanged; dispositions added (§4.4) |
| RQ-REPO-01 / 02, RQ-README-01, RQ-VER-02 | Archive, structure, README, moves | s10–s11 | unchanged |
| RQ-REC-01 | Records current at boundaries | s25; s26 record defects repaired in Phase B | open action, Phase B |
| RQ-VER-01 | Verification passes | transfer operator on `2a6015f` (reported) and s26 runs | re-run where affected |
| RQ-VER-03 | Independent review | **Self-review under ADR-O09** | unchanged; never presented as Guardian approval |
| RQ-ORIG-01…04 | Outside the gate (custom skills, harness on product pages, mobile REA, ZIPs) | matrix §8 | reported, not counted |

## 3. Checklist: rows that were open at the start of s26

### 3.1 RQ-ANL-01 — the feature matrix's Invitesion column (open action) → **DONE in s26**
- **Criterion:** ≥ 150 evidence-linked rows (met since s10) and "switch the ours column to the current build after RQ-OWN-02" (precondition met s23r).
- **Done:** 20 curated own-column cells re-assessed against code at `2a6015f`, each citing `REPO@2a6015f` and its implementation entry (E-002…E-039); baseline status kept in each note. The pre-switch wide matrix, coverage summary and curated column are frozen in `05-feature-matrix/baseline/` (`*-s25.*`). `build-matrix.py` now accepts `REPO@2a6015f` and `E-` IDs for our column only, and labels every derived own-column measurement as the pre-P0 build `22ed99e` (v1.2 population): measured rows keep their population boundary.
- **Verification:** `build-matrix.py --check` exit 0: 187 rows × 16 columns, competitor cells 633 / 2,805 (unchanged), derived 69, disagreements 3, errors 0. Own column 42 Full / 29 Partial / 116 None → **59 / 24 / 104**. The one own-column disagreement left (FM-047: curated Full, derived Partial from the pre-P0 captures) is the labelled population boundary.

### 3.2 RQ-BENCH-05 — viewport and behaviour coverage → **VERIFIED in s26 (explicit limits, the row's own criterion)**
- **Criterion:** "required viewport and behaviour coverage, **or explicit unresolved limits**".
- **Evidence:** protocol v2 at `v2-412`, `v2-360`, `v2-390`, `v2-412-rm` for 21 competitor themes (WEV 6, VID 6, INV 6, BRN 3) and our build, all stored (94 / 94, 4 / 4); outputs and `benchmark-pack.py --check` as in s16.
- **Reconciliation:** the matrix called Invitato and Katsudoto "feasible", but the queue's own header (`queue-v2-s13.tsv`) records why they were never queued: tokenized URLs whose redaction map was lost with the s11 / s12 sandbox, and Invitato templates carrying client names (D-019). Re-capturing Katsudoto means rediscovering per-couple demo subdomains (D-008) for one vendor's viewport figures, which no masterplan decision depends on (our own pages carry their own 360 × 800 gates: cover-fold, design acceptance). Not justified; recorded as a limit.
- **Explicit limits:** Invitato (D-019) and Katsudoto (tokenized URLs) not at v2; Enviory provisional (Q-O09, D-031); Indoinvite, PALEO, Satu Momen without safe demos (ADR-O10); physical in-app browsers, real audio playback and field INP are EXT. The 360-px overflow and reduced-motion findings cover the 21 themes from four vendors only.

### 3.3 RQ-COMP-04 — one-page profiles for the 21 Tier-B vendors → **still PARTIAL**, then **QUALIFIED BY AVAILABILITY (owner, ADR-O12, ≈ 16:50Z; strict 13 / 21)**
- **Criterion:** a substantive profile per vendor (positioning, product, pricing, evidence level).
- **State:** 13 substantive; 4 thin or partial (WNK homepage only; BRS and SNT publish no prices; MMO is pre-launch); 4 blocked (WMG, GRV, MTD HTTP 403; CNV under the D-030 restriction).
- **s26 attempts:** Wikipedia (allowed): Canva and Minted company facts only (S-CNV-004, S-MTD-002), nothing on their invitation products or prices; no article for WedMeGood or Greenvelope (S-WMG-003, S-GRV-002). G2 and Product Hunt refuse our reader (S-RSV-005, S-RSV-006). Nothing was read from a denied origin, cache or archive.
- **Missing:** a substantive profile for those 8 vendors. **No permitted route remains in this sandbox.**
- **Authority:** none covers it. ADR-O10 qualifies demo availability only.

### 3.4 RQ-COMP-05 — every Tier-A dossier's §10 (template: "Play Store reviews, X, forums: summarize, no personal data") → **still PARTIAL**, then **QUALIFIED BY AVAILABILITY (owner, ADR-O12, ≈ 16:50Z; strict 4 / 15)**
- **State:** themes for 4 / 15 (WEV, IDI, PLO, PTF); for ENV, IVT, INV, VID, SMO, KAT, STM, BRN, PPO, JOY and RSV the dossier records the checked sources only.
- **Routes tried (all sessions):**
  - homepage store links (s13 / s14 pass A);
  - Play listings (pass B);
  - Trustpilot (pass C, D-030 restriction);
  - the platform search tool (s14, s23r × 7, s24, s25, s26: every answer URL-less);
  - Apple search, lookup and review feeds: robots-disallowed (s26);
  - G2 and Product Hunt: 403 (s26).
  X needs a login (no signup allowed); search-engine result pages are robots-disallowed; Reddit disallows generic agents.
- **Missing:** attributable complaint sources for 11 dossiers. **No permitted route remains in this sandbox.**
- **Authority:** none covers it.

## 4. Other Phase A deliverables (s26)
1. **RSVPify.** The owner prefers its modern, elegant direction. No verified rendered finding exists:
   - its origin answered 403 and a challenge (S-RSV-002, S-RSV-003);
   - G2 and Product Hunt answered 403 (S-RSV-005, S-RSV-006);
   - Trustpilot is restricted (S-RSV-004).
   The masterplan's taste process uses the preference as an **owner-supplied reference direction**, never as an observation of RSVPify.
2. **REA.** Installed and pinned: REA 6.8.0 on Node 24.22.2 (playbook pin), Lighthouse 12.8.2, Chrome for Testing 158.0.8127.18, all outside the product's dependencies (`/vercel/share/work/tools`). D-030 and D-031 applied unchanged: Enviory's provisional evidence stays outside unconditional results.
3. **RQ-OWN-02.** Not rerun (no new question) and never pooled with competitor captures.
4. **Synthesis and dispositions** (`../06-gap-analysis/dispositions-s26.csv`): every one of the 68 gaps, backlog-only B-041 and the 32 ideas has exactly one disposition with its evidence and reason, plus an upgrade phase (U1…U7, specified in Phase B).
   - Gaps: **31 adopt now** (15 already shipped, 16 in U1–U3 or continuous guardrails), **29 adopt later**, **6 investigate further**, **2 reject** (video invitation product, native host app).
   - Ideas: 5 adopt now, 18 later, 7 investigate, 2 reject (generated video, AI wishes digest).
   - The 187-row matrix, 68-row map, 32 ideas with their top ten, the design principles (T1, T3 promoted), flows and the niche roadmap are the inputs.
   - Competitors contribute principles and parity targets only, never copied assets or copy.

## 5. Checks run in s26 for this phase
- `build-matrix.py --check` exit 0 (above).
- `score-ideas.py --check`: ranking reproduced (32 ideas).
- The evidence index gained the s26 rows (append-only). `check-references.py` and `commit-guard.sh` are run at the checkpoint (session record).
- Not re-run because their inputs did not change: benchmark pack, eligibility, profile-read and robots suites, spike summaries.

## 6. Gate evaluation (acceptance-matrix §9)
| # | Criterion | s26 |
|---|---|---|
| 1 | All required research artifacts present and substantively complete | **Yes, qualified (after ADR-O12).** At first **No**: RQ-COMP-04 (8 / 21 profiles missing) and RQ-COMP-05 (11 / 15 complaint sections missing) were availability-limited with no qualifying owner authority. The owner then qualified both (ADR-O12). RQ-BENCH-05 closed on its own criterion; RQ-DEMO-01 qualified (ADR-O10) |
| 2 | Nothing unresolved silently counted as done | Yes: this record and the matrix |
| 3 | IDs, links, counts and classifications verified | Yes for the s26 changes (matrix check; reference check at the checkpoint) |
| 4 | Competitor, profile, flow, blueprint and aggregate work complete or explicitly unresolved | Yes, explicitly unresolved (§3.3, §3.4) |
| 5 | Conclusions match evidence quality | Yes (§7) |
| 6 | No invalid measurement used as evidence | Yes (population labels on derived own cells) |
| 7 | Architecture and backlog decisions traceable | Yes (dispositions → backlog → upgrade map) |
| 8–12 | Chapters, implementation vs plan, moves, README, verification | Phase B / checkpoint |
| 13 | Independent review | Self-review under ADR-O09 |

## 7. Conclusions this evidence cannot support
- Any public-complaint theme for ENV, IVT, INV, VID, SMO, KAT, STM, BRN, PPO, JOY or RSV.
- Price comparisons with WNK, BRS, MMO, SNT, WMG, GRV, MTD or CNV.
- Any observation of RSVPify's rendered design.
- Viewport behaviour of Invitato, Katsudoto, Enviory, Indoinvite, PALEO or Satu Momen.
- Field performance, in-app browser behaviour and real audio playback for anyone, ourselves included.

## 8. Verdict and the precise remaining condition
**The research gate has NOT passed.** Everything feasible in this sandbox under the access policy is done. The gate stays open on exactly two rows:
- **RQ-COMP-04:** WNK, BRS, MMO, SNT, WMG, GRV, MTD, CNV.
- **RQ-COMP-05:** §10 complaint themes for ENV, IVT, INV, VID, SMO, KAT, STM, BRN, PPO, JOY, RSV.

Either of these closes them:
- **(a)** an owner decision qualifying both rows by availability, as ADR-O10 did for demos: strict counts kept (13 / 21; 4 / 15), the conclusions in §7 marked unsupported, revisit when a source appears;
- **(b)** owner-supplied review-thread or profile URLs, or a search client that returns source URLs under an approved identity, read through `profile-reads.py` (at most two pages per vendor).

Until then:
- the masterplan is reconciled but **not labelled FINAL**;
- no new product feature and no backend migration starts (ADR-O11);
- research tooling, evidence correction, architecture investigation and isolated feasibility experiments continue.

### 8.1 Owner decision (≈ 16:50Z): option (a), ADR-O12 → research gate PASSED, qualified
The owner answered the gate question in the session with option (a). Recorded as ADR-O12 in `../09-masterplan/12-decision-log.md`.
- The strict counts stay: **13 / 21** substantive profiles, **4 / 15** complaint sections. Neither row is relabelled VERIFIED.
- §7 stays as written. Those conclusions are unsupported and are never stated as findings. Comparisons that touch those vendors are marked as limited by availability.
- The searches already recorded are not repeated without a new capability (revisit triggers in ADR-O12).
- **Research gate: PASSED, qualified.** The final-masterplan gate is then evaluated in `masterplan-gate-s26.md`, and under ADR-O11 the upgrade starts without a further approval.
