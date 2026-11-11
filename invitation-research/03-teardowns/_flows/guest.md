# Guest flow: open → RSVP → wish → gift

> v1, session 10 (2026-11-03). Legend and rules: `README.md`. Measurements stay in the dossiers and `../../04-template-benchmarks/`; this file compares steps only.

## Invitesion today (`7a00a6d`)
| # | Step | Baseline `22ed99e` | After s09 P0 (code-verified) |
|---|---|---|---|
| 1 | Tap the WhatsApp link | link preview: title only (QA-009) | per-invitation 1200×630 `og:image` + description (B-010, E-010) |
| 2 | Page renders (no cover gate, no music) | OBSERVED C-INV-001/002 | unchanged (cover + music = B-009, open) |
| 3 | Read events | times wrong on UTC hosts, WIB hard-coded (QA-002) | event zone with WIB / WITA / WIT (B-004, E-004); countdown + Google / ICS save-the-date when published and in the future (B-008, `FLAG_GUEST_CALENDAR` on) |
| 4 | RSVP (attend / decline + party size) | answer overwrote the allowance (QA-005) | allowance kept, `attending_count` stored (B-007, E-007) |
| 5 | Wish | posts visible immediately, no moderation | unchanged (B-028 open) |
| 6 | Gift | read the account, copy by hand | unchanged (B-026 open) |
| — | Unknown guest link | answered 200 | 404 (B-011 PPR opt-out, E-011) |
Interactions to RSVP: **2** (scroll + tap) [OBSERVED C-INV-001; unchanged by P0].

## Competitors (structure; evidence IDs point to captures or reads)
| Vendor | Typical order | Cover / music | RSVP | Gifts | Class | Evidence |
|---|---|---|---|---|---|---|
| Wevitation | cover → couple → events → gallery → RSVP → wishes → gifts; QR pass on the page | cover opened (coverGate), music control | yes | accounts + registry | OBSERVED | C-WEV-101…106 |
| Enviory | long intro → cover → sections; click-to-load map | cover verified D-016 on C-ENV-122/123 | yes | e-gift | OBSERVED | C-ENV-111…123 (eligible subset) |
| INVI.ID | cover with `?to=` name → sections | cover (pre-D-016 click), music | yes | accounts | OBSERVED (opening unverified) | C-INV-111…116 |
| Katsudoto | cover → sections; zoom blocked | cover (opening unverified) | yes | accounts | OBSERVED | C-KAT-101…106 |
| Invitato | closed English cover → video-heavy sections; opaque `?code=` | cover | yes, one-time QR pass | envelope labels | OBSERVED structure | C-IVT-101…104 |
| Viding | cover → RSVP → wishes → E-Angpao → registry → livestream | cover (opening verified on 2 of 6 demos, C-VID-107/109; audio playback not measured) | yes, QR on RSVP (Guest Book tier, claimed) | E-Angpao | OBSERVED / CLAIMED | C-VID-101…103, C-VID-107…109, S-VID-004 |
| Barunson | cover → greeting → contacts → gallery → directions → guestbook → **gift money per side** | cover | — | card gift money with payout | OBSERVED structure / payouts CLAIMED | C-BRN-101…103, S-BRN-004 |
| Satu Momen | salutation → cover → countdown → verses → parents → schedule | cover | custom fields (claimed) | envelope | OBSERVED headings (3 pages, personal data; not captured) | S-SMO-004 |
| Invitee (B) | events per ceremony; RSVP from Plus; DuitNow QR e-gifts | music from Lite | Plus tier | DuitNow QR | CLAIMED | S-INE-001 |
| Biihappy (B) | RSVP, wishes book, **gift by bank QR**, Zalo sharing | — | yes | QR | CLAIMED | S-BHP-002 |
| Partiful / Joy | one link, RSVP without an app; magic-link address collection | — | yes | cash funds (JOY) | CLAIMED | S-PTF-001, S-JOY-001 |

Facts that must stay separate (D-016, protocol v1.2): cover detected ≠ click attempted ≠ opened ≠ audio playing. No capture proves audio playback for any vendor.

## Best-of patterns
1. **The open gesture is a ritual** (cover with the guest's name, then music): 8–9 of 9 Indonesian vendors.
2. **Gifts by national QR** (BRN card payout, INE DuitNow, BHP bank QR) — the low-risk version is the host's own QRIS image (idea I-03).
3. **The guest takes something away** (WEV QR pass, IVT one-time QR) that the host's desk can scan.
4. **Avoid:** weight and long intros (ENV LCP 13.9 s median), blocked zoom (VID, KAT), `lang="en"` on Indonesian pages (WEV, VID, KAT).

## Proposed Invitesion target (design target)
| Target | Backlog | Acceptance |
|---|---|---|
| Labelled "Buka Undangan" cover with the guest name; music starts on that tap, pause control with `aria-pressed`, `preload="none"` | B-009 | tier budgets hold (B-012); playback verified only on devices |
| RSVP in ≤ 2 actions after the cover; works without JavaScript | (kept) B-007 done | form posts without client JS |
| Gift block: copy buttons, host QRIS image, accounts only on personal links | B-026 | no account visible on the invitation-level URL |
| Couple profiles and captured blocks rendered | B-023, B-029 | fields captured in the editor appear on the page |
| Weight within the tier budget | B-012 (harness) | internal budgets, not research parity thresholds (`../../09-masterplan/08-template-system-and-harness.md` §3) |
