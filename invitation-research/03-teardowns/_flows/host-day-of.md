# Host day-of flow: check-in at the venue

> v1, session 10 (2026-11-03). Legend and rules: `README.md`. **Every competitor step below is CLAIMED**: no check-in tool was used (no accounts, R1).

## Invitesion today (`7a00a6d`)
Manual check-in per guest row in `/dashboard/invitations/[id]/guests` (Hadir / Tidak hadir / Check-in) by the single owner account; no QR scan, no kiosk or greeting screen, no usher roles, no live counter. `guests.qr_code` exists but is unused; `checkInSettings` is config-only. Unchanged by the s09 P0 work. [OBSERVED code, `../../01-codebase-audit/flows.md` §3]

## Competitors
| Vendor | Mechanism | Staff / devices | Validation | Extras | Price position | Evidence |
|---|---|---|---|---|---|---|
| Invitato | usher scans the guest's **one-time QR**, or searches / types the name | usher + printer | **strict** (QR or listed name + quota) or **flexi** | prints envelope + souvenir / table labels, optional selfie, greeting screen, doorprize, attendance report | service from 1–2M | S-IVT-001…005 |
| Viding | tablets + crew scan the QR sent after RSVP | 2 tablets, modem, crew, 4 h | invited / RSVP'd only | greeting screen, table management | E-Guest Book 2.1M+ | S-VID-004 |
| Satu Momen | committee scans each guest's QR | host's devices | registered guests only | **Layar Sapa** greeting screen, live head count | "Check In System" product | S-SMO-006 |
| Katsudoto | Buku Tamu Digital QR + **selfie** check-in | — | — | auto thank-you message | add-on | S-KAT-004 |
| Wevitation | QR pass on the guest page + Android scanner app | reception service optional | — | — | reception service 1.69–4.99M | S-WEV-001 |
| Enviory | QR check-in at `/checkin` with a dashboard code | host's phones | — | manual fallback | included | S-ENV-001 |
| Wedew (B) | "App Penerima Tamu" per device, check-in **and check-out** | 1–4 apps by package, +100k each | — | custom Layar Sapa | metered | S-WDW-001 |
| Invitee (B) | scan, verify and seat guests | — | — | seating | Plus / Pro | S-INE-001 |
| sangmempelai.id (B) | QR check-in bundled at 49k | — | — | digital guest book | bundled | S-SMP-001 |
| RSVPify | QR check-in app + **badge printing** | — | — | dashboards | paid plans [UNKNOWN] | S-RSV-001 |

## Best-of patterns
1. **Three ways in** (scan / search / type) with a **strict or flexi** mode chosen per event (IVT).
2. **A greeting screen** at the entrance showing the guest's name (IVT, VID, SMO, WDW).
3. **Devices as the metered unit** (WDW), not guests.
4. Unproven anywhere: offline operation with a weak signal → keep as our design target, not a parity claim.

## Proposed Invitesion target (design target)
| Target | Backlog | Acceptance |
|---|---|---|
| QR pass on the personal guest page + browser scanner (no app install) + manual search fallback | B-024 (depends on B-011's link decision) | ≤ 3 s per guest at the desk in a test; manual path always available |
| Greeting-screen view for a venue display | B-024 | shows name only, no phone or RSVP data |
| Usher role with check-in permission only | G-044 (P2) | least privilege; owner keeps admin |
| Live attendance count by group and event | B-034 | counts match `checked_in_at` |
| Works with a weak signal | idea I-27 (later) | not claimed until measured |
