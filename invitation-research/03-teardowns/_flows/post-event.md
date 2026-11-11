# Post-event flow

> v1, session 10 (2026-11-03). Legend and rules: `README.md`. All competitor steps are CLAIMED (FAQ, pricing and policy pages).

## Invitesion today (`7a00a6d`)
The invitation stays readable and turns read-only when its 12-month window ends (RSVP and wishes closed). No thank-you message, guest-photo collection, wishes keepsake export or deletion flow. The owner's CSV export now neutralises spreadsheet formulas and adds `attending_count` (B-006, B-007). [OBSERVED code]

## Competitors
| Vendor | After the event | Evidence |
|---|---|---|
| Barunson | page online until event + 90 days; gift money paid out within 14 days | S-BRN-004 |
| Enviory | Silver stays live 1 year after the event, Gold forever; unpaid trials archived with data kept, reactivated by paying | S-ENV-001 |
| Satu Momen | access ends 7 days to 1 year **after purchase** (not after the event) | S-SMO-005 |
| Katsudoto | automatic thank-you message after check-in | S-KAT-004 |
| Invitato | attendance report: attended / absent, arrival order, gifts and envelopes, selfies | S-IVT-001…005 |
| INVI.ID | wishes and RSVP export (PDF, Excel, CSV, print) | S-INV-002 |
| Viding | livestream recording file | S-VID-005 |
| Janiva (B) | 6 months active, lifetime for +100k | S-JNV-001 |
| sangmempelai.id (B) | "active forever (as long as our site runs)" | S-SMP-001 |
| Wedew (B) | free tier active forever | S-WDW-001 |

## Best-of patterns
1. **Expiry counted from the event, not the purchase** (BRN, ENV) — ours (12 months from publish) is generous but not event-anchored.
2. **A keepsake** (exports at INV; reports at IVT) — nobody shows a designed wishes book.
3. **A thank-you touchpoint** (KAT auto message).
4. **Avoid:** purchase-anchored clocks (SMO) and "forever" promises that depend on the vendor surviving (SMP).

## Proposed Invitesion target (design target)
| Target | Backlog | Acceptance |
|---|---|---|
| Thank-you message and guest photo collection | idea I-21 (later) | opt-in per host |
| Wishes book export (designed PDF) | idea I-22, built in the sandbox s36 (D-060, E-078; `FLAG_WISHES_BOOK` off) | no guest phone numbers in the export (verified in E-078) |
| Deletion on request and at expiry, with a reviewed retention policy | B-031 (legal review dependency) | data removed within the stated SLA |
| Guest privacy notice for open tracking | B-021 | notice visible on the guest page |
