<!-- SUMMARY (first 7 lines — greppable) -->
# must-have-p0.md — the 12 P0 items, in dependency order, with the reason each is P0
> WHAT: The justified P0 list (brief 05 §15 "Justified P0 list"); full specifications live in `../09-masterplan/06-backlog.md` (B-001…B-012).
> STATUS: DONE s08 (2026-11-03)
> OWNER: Research agent
> DEPS: upgrade-map.csv, ../09-masterplan/12-decision-log.md
> GREP: P0, must have, B-0, dependency order, defect, table stakes
> UPDATED: 2026-11-03

**P0 criteria (all must hold):** (1) a live defect that corrupts data, misleads buyers or violates a hard rule, **or** a table-stakes guest feature present at ≥ 6 of the 9 Indonesian vendors with evidence; (2) implementable without owner credentials or contracts; (3) reversible (flag, additive migration or plain revert).

| Order | Backlog | Gap | Why P0 | Effort | Depends on |
|---|---|---|---|---|---|
| 1 | B-001 | G-001 template preset lost on create | live defect on every catalog invitation (ADR-O01) | S | — |
| 2 | B-002 | G-003 price copy from `lib/pricing.ts` | misleads buyers (ADR-O02) | S | — |
| 3 | B-003 | G-004 no unverified religious text in presets + corpus | hard rule (ADR-O04, brief 03 §21.6) | S | — |
| 4 | B-004 | G-002 event times in the event's own zone | wrong times on every UTC server (QA-002) | S | — |
| 5 | B-005 | G-013 editor preview link + theme tab | creators cannot preview; theme tab unreachable (QA-011) | S | B-001 |
| 6 | B-006 | G-014 CSV formula injection | security quick win (QA-012) | S | — |
| 7 | B-007 | G-006 RSVP keeps the allowance | corrupts host data (QA-005) | S | — |
| 8 | B-008 | G-025 countdown + add to calendar | table stakes 8 / 9 | S | B-004 |
| 9 | B-009 | G-024 cover gate + music + pause | table stakes 8–9 / 9 | M | B-012 budgets |
| 10 | B-010 | G-011 per-invitation OG image | table stakes 6 / 9; WhatsApp is the channel | M | — |
| 11 | B-011 | G-005 opaque guest links (flagged, old links keep working) | security / PDP (QA-003) | M | tests |
| 12 | B-012 | G-065 guest-page budgets enforced by the harness | protects the measured lead while 8–10 add weight | M | harness |

**Not P0 (and why):** QR check-in (G-027: L effort, depends on B-011 tokens); automated QRIS / VA (G-049: needs a PJP contract, ADR-O03); WhatsApp blast (G-038: provider and policy decision); reseller (G-052: tenant model); entry tier / reverse trial (G-051: owner pricing decision); rate limiting (G-007: P1, first after P0 because B-011 changes the guest credential).
