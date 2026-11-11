<!-- SUMMARY (first 7 lines — greppable) -->
# 11-pricing-growth-roadmap.md — packaging, growth / SEO, ideation highlights, sprint roadmap, 90-day sequence, KPIs, risks
> WHAT: How the backlog turns into releases over 90 days, with entry / exit criteria, the pricing stance, growth levers and KPIs (definitions only; no invented baselines, ADR-O06).
> STATUS: **s26 (2026-11-06): the s25 order in §4 is superseded by the upgrade order U1–U7 in `06-backlog.md` ("Upgrade order (s26)": guardrails → Rust foundation and guest interactions → guest experience → host operations → trust → commerce → template system v2), which starts only after both gates pass (ADR-O11); prices unchanged.** **s25 (2026-11-06): §4 brought to current code** (sprint states at s25 from the 06-backlog reconciliation; the s10 next-phase list is resolved item by item and replaced with the s25 order); §2 and §6 updated where B-012, B-015 and DA-01 moved; prices re-checked (`lib/pricing.ts` unchanged since `7a00a6d`: IDR 149,000 / 299,000). KPIs stay definitions only (ADR-O06). Earlier: verified s10 (v2 s09, v1 s08).
> OWNER: Research agent
> DEPS: 06-backlog.md, ../06-gap-analysis/pricing-packaging.md, ../07-ideation/{README.md,top-10.md}, 12-decision-log.md, ../_handoff/IMPLEMENTATION-LOG.md
> GREP: roadmap, 90-day, sprint, pricing, growth, seo, kpi, risk, next phase, status s25
> UPDATED: 2026-11-06

## 1. Pricing and packaging stance (detail: `../06-gap-analysis/pricing-packaging.md`)
- **Now:** prices stay Rp 149k / 299k one-time, 12 months (owner decision, ADR-O02); marketing shows them honestly (B-002, shipped s09); free = drafting and preview only.
- **Next (after P0):** free theme switching within the tier (B-036); test an entry tier inside the Rp 69–100k band **or** a reverse trial behind a flag (B-040), never both at once, measured by publish conversion and refund rate.
- **Never:** permanent strikethrough anchors, revision caps, expiry counted from purchase.

## 2. Growth levers grounded in evidence
| Lever | Evidence | Plan |
|---|---|---|
| WhatsApp is the distribution channel | every Indonesian vendor shares via WhatsApp; OG images on 6 vendors | OG card (B-010, shipped s09), editable per-guest messages (B-018), follow-up lists (I-06) |
| Speed and accessibility as the promise | FM-156…163; own builds (RQ-OWN-02, s23r) | Publish budgets per template (I-02). B-012 now holds as manual gates (product byte budgets, rendered contrast), so I-02 can start once CI runs the gates (B-020) |
| Programmatic SEO | ours ~90 pages; IDI 50 event pages; INV utility tools | keep; remove over-claims (B-022); add niche pages only with real templates |
| Try-before-signup | ENV name-first preview | B-037 |
| Partners | reseller credits at SMO / WEV / ENV / INV; affiliates 15–40 % | P2 after automated payments (B-039) and tenancy |
| Trust | real-customer samples at IDI / SMO / IVT | fictional previews, privacy controls (I-18), verified religious text (I-11) |

## 3. Ideation highlights in the roadmap
Top-10 ideas mapped: I-06 → B-034 (sprint 4); I-02 → after B-012 (sprint 3); I-18 → B-026 + B-031 (sprints 3–5); I-03 → B-026 (sprint 3); I-11 → B-003 corpus scaffold (shipped s09, empty) + entries when the owner supplies them; I-13 → B-032 (sprint 3); I-16 → B-010 (shipped s09); I-15 → B-030 signature tier (sprint 5–6); I-05, I-28 → P2 after B-030 tokens.

## 4. Recommended 90-day sequence (two-week sprints)
| Sprint | Days | Scope | Entry criteria | Exit criteria | Status at s25 (s10 state in parentheses) |
|---|---|---|---|---|---|
| 1 | 1–14 | **Trust fixes:** B-001 presets, B-002 prices, B-003 scripture, B-004 time zones, B-005 preview link, B-006 CSV, B-007 allowance, B-017a atomic view dedupe (s09 spike finding) | baseline tests green | each item's tests pass; typecheck + test + build green; IMPLEMENTATION-LOG updated | **Done.** B-001…B-007 s09; B-017a s11 (E-012). (s10: B-017a open) |
| 2 | 15–28 | **Guest table stakes I:** B-008 countdown + calendar, B-010 OG image, B-012 harness budgets, B-014 cached invitation-level render + one loader call (ADR-A1 lever; render ≈ 85–90 % of server CPU per page), B-015 Clerk off guest pages, B-016 contrast | sprint 1 exit | harness `check` green for the base template; spike rerun shows the product page's server CPU per view within 2× of the `next-min` level; Lighthouse ≥ 90 on the guest fixture with middleware once real keys exist | **Mostly done; two exit criteria unmet.** Done: B-008, B-010 (s09), B-015 (E-042), B-016 (E-015 / E-019; 2 legacy pages INCOMPLETE). B-012 runs as manual gates with no CI. B-014: step 1 done; whole-page cache not shipped (D-039). **Unmet:** the CPU criterion (22.2 ms per view, not ≤ 2 × `next-min`), and Lighthouse with middleware (real keys deferred, DA-01) |
| 3 | 29–42 | **Guest table stakes II:** B-009 cover + music, B-023 profiles, B-026 gift block, B-029 captured blocks, B-032 memorial preset | B-012 live | budgets still met; a11y ≥ 95; reduced-motion run clean | **Partly done.** B-029 done (E-017, E-021, E-026, E-048, E-051). B-023 partial (parents and person photos render; no acceptance record). **B-009, B-026 and B-032 not started.** Chains written in s12 |
| 4 | 43–56 | **Host tools:** B-011 opaque links (flag), B-013 rate limits, B-018 wa.me, B-033 import, B-034 analytics + follow-up lists | B-007 live | flag rollout plan; abuse tests pass | **Partly done.** B-011 done (flag **off**, owner decision). B-034 partial (RSVP counts, E-033). B-013, B-018 and B-033 open |
| 5 | 57–70 | **Day-of + editor:** B-024 QR pass / scanner / greeting screen, B-035 live preview + autosave, B-036 free theme switching | B-011 on for new invitations | desk flow ≤ 3 s per guest in a test; no data loss on autosave | **Open.** The entry criterion still needs the owner to turn opaque links on for new invitations. B-041, which precedes B-036, is done (s26, E-054) |
| 6 | 71–90 | **Catalog v2 + payments readiness:** B-030 template system v2 (three dogfood templates promoted), B-017 indexes, B-019 image pipeline, B-020 CI, B-039 PJP adapter if a contract exists, B-040 pricing experiment | owner decisions recorded | ≥ 3 templates pass every gate; CI green on every change | **Partly done.** B-030 partial (four product families, not manifest templates). B-017 partial (analytics index only). B-020 partial (311 tests, no CI). B-019, B-039 (EXT) and B-040 open |
| — | (s14–s24) | **Out of the original order under ADR-O08:** RSVP depth (B-027), the children's-photo access contract (D-040), the design families' review findings | — | — | **Done** (E-020…E-051) |

s09 implemented items from sprints 1, 2 and 4 out of the original order; the table keeps the plan and shows the state beside it.

**Order at s25** (`06-backlog.md`, "State at s25"; LATEST §4 item 6):
1. **B-041**, the server-side theme entitlement (S; a revenue and authorization defect). **Done s26 (E-054).**
2. **B-009**, cover and music on all five layouts. It needs a licensed audio file, the harness budgets, and playback verified on a device (opening ≠ playback).
3. **B-026 with G-021**: copy buttons, the host's QRIS, and accounts on personal links only (personal data).
4. **B-020**: CI for typecheck, tests and the harness `check`, so the B-012 gates run unattended.
5. **B-013 / B-028**: rate limits and moderation, before any free-publish experiment (B-040).

**s10's next-phase list, resolved:**
1. RQ-OWN-02 verified in s23r.
2. B-012 delivered as manual gates; CI is item 4 above.
3. B-017a done (s11).
4. B-009 is item 2 above.
5. B-015 done; B-014 step 1 done, step 2 not shipped (D-039).
6. B-016 done.

The original list follows, for history.

**Next-phase order (s10 handoff; chains in `06-backlog.md`):**
1. Compare our guest page across builds on one host (RQ-OWN-02): s13 measured the current build `0b5eb1b` (C-INV-006…015), but on a slower, variable host, so B-012's internal budgets move off `22ed99e` only after interleaved same-host runs of both builds (D-033).
2. **B-012** finish: run the product guest page through the harness budgets and gates, and add CI for `check`.
3. **B-017a** atomic view dedupe (small, data integrity of host analytics).
4. **B-009** cover + music (largest remaining table-stakes gap; needs B-012).
5. **B-015** then **B-014** (remove clerk-js from guest pages, then the measured render lever).
6. **B-016** contrast-safe palettes.
Sprint-3 items (B-023, B-026, B-029, B-032) get their acceptance, verification and rollback written before they start (RQ-MP-06).

## 5. KPIs (defined now, measured once analytics exist)
Publish conversion (drafts → published), time to first share, share of guests who open, RSVP answer rate by D-3, wishes per invitation, refund rate, support tickets per 100 invitations, guest-page p75 LCP and weight in the field, accessibility score per template (harness), template gate pass rate.

## 6. Risks
| Risk | Mitigation |
|---|---|
| New guest features erode the speed lead | B-012 budgets block merges; lazy islands; music `preload="none"` |
| Opaque links break published invitations | flag + legacy slugs keep working (B-011) |
| Owner decisions stall payments and pricing | P0 avoids them; B-039 / B-040 wait for decisions |
| WhatsApp policy or ban risk | official API only; wa.me until then |
| Religious or cultural missteps | verified corpus only; reviewed playbooks; sober memorial defaults |
| Production differs from lab (middleware, clerk-js, real keys) | B-015 done (no clerk-js on guest pages); B-014 step 1. Re-measuring with real keys (P-INV-010) is deferred with the signed-in acceptance (DA-01, owner, s25) |
