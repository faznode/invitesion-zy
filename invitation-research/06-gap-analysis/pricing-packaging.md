<!-- SUMMARY (first 7 lines — greppable) -->
# pricing-packaging.md — public prices in the Tier-A set vs `lib/pricing.ts`, and options for the owner
> WHAT: Evidence table of every public price read in s03–s08, price bands, packaging patterns, and reversible options. Prices are decided by the owner (ADR-O02); this file only informs that decision.
> STATUS: DONE s08 (2026-11-03). All prices as displayed on the read dates; no purchase, signup or checkout was used.
> OWNER: Research agent
> DEPS: S-IDI-006, S-SMO-005/006, S-WEV-002/003, S-VID-002/004/005, S-ENV-001, S-IVT-003, S-INV-002/003, S-KAT-004, S-BRN-002, S-PPO-001, S-RSV-001, S-JOY-001, S-PTF-001; lib/pricing.ts at 2c94140
> GREP: price, pricing, packaging, tier, reseller, trial, one-time, subscription, anchor
> UPDATED: 2026-11-03

## 1. Ours (code at `2c94140`)
`lib/pricing.ts`: **IDR 149,000 standard / 299,000 premium**, one-time per invitation, 12 months active (F-064); USD 19 / 39 for non-IDR locales. Drafting is free; publishing requires a paid order (F-075). Marketing pages show a single "Rp0 / GRATIS" plan instead (ADR-O02 → P0 G-003).

## 2. Market evidence (IDR unless stated)
| Vendor | Entry paid tier | Ladder | Active period | Trial / free | Partner economics | Evidence |
|---|---|---|---|---|---|---|
| Indoinvite | **39,000** | 59k / 69k / 99k / 119k; subscription 400k per month … 4.6M per year | none ("tanpa masa aktif") | free trial, sharing excluded | subscription for volume | S-IDI-006 |
| Satu Momen | **79,000** (7 days, self-edit) | 129k (30 d) / 199k (90 d) / 235.5k (180 d) / 599k custom / 850k corporate | from purchase, 7 d … 1 y | 12-hour trial (2026-10-29) | reseller 250k / 1M / 2.8M with credits ≈ 46.7–50k per invitation | S-SMO-001/005/006 |
| Wevitation | **69,000** | packs ≈ 43.5–49.5k each (2–23 invitations); Guest Reception 1.69–4.99M | "aktif selamanya" | 14 days free | Mitra tiers with branding | S-WEV-002/003 |
| Enviory | **75,000** (list 99k) | Gold 125k (list 199k) | Silver 1 y after the event; Gold "forever" | publish first, 5 days full access | quota 26–38k each, resale floor 75k; referral 35 % | S-ENV-001 |
| Katsudoto | **100,000** (Lite) | 300k (1 y) / 500k / 700k + 24 add-ons; WhatsApp Rp 1,000 per message | 1 y → forever | — | Mitra 15 % | S-KAT-004 |
| INVI.ID | 198,000 list (**149,000** with the public coupon) | Premium 298k list | 3 m … 1 y; membership separate | 2 days free | packs 13–45k each, floors 39–149k; affiliate up to 40 % | S-INV-002/003 |
| Viding | **300,000** (list 360k) | 670k / 850k; services 2.1–6.25M | [UNKNOWN] | free trial (limits not public) | agents on commission | S-VID-002/004/005 |
| Invitato | **from 400,000** (quote) | RSVP Assistance from 1M; guestbook from 2M | forever | none | — | S-IVT-003 |
| PALEO | [UNKNOWN] | — | — | — | — | S-PLO-003 |
| Barunson (KRW) | free for members (list 50,000); licensed 9,900 | — | event + 90 days | free | gift-side revenue | S-BRN-002/004 |
| Paperless Post (USD) | coins (3 coins = $1.44) | Plus 200 coins; Pro subscription by guest count | — | — | — | S-PPO-001 |
| RSVPify / Joy / Partiful | free tiers (RSV ≤ 100 invitees) | RSV plans [UNKNOWN]; JOY / PTF free core | — | — | RSV ticket fees 1.95 % + $0.90 | S-RSV-001, S-JOY-001, S-PTF-001 |

## 3. Bands and patterns
- **Three clusters:** mass DIY **Rp 39–129k** (IDI, SMO, WEV, ENV, KAT Lite), premium design / done-for-you **Rp 125–300k** (ENV Gold, INV, KAT, VID Basic), service and day-of operations **Rp 300k–6.25M** (VID, IVT, KAT top tier, WEV reception).
- **Our Rp 149k entry sits above every one-time entry tier observed** (IDI 39k, WEV 69k, ENV 75k, SMO 79k, KAT Lite 100k) and equals INVI.ID's effective Premium. Our Rp 299k sits at VID's entry.
- **Patterns:** permanence as the upsell (ENV, KAT, WEV "forever"); sell by removal (IDI); time-boxed access (SMO); volume packs and credits for resellers (SMO, WEV, ENV, INV); metered messaging (KAT); services as the high-ticket line (VID, IVT, WEV); **strikethrough anchors** on most vendors (VID, ENV, WEV, SMO upper tiers, INV coupon) — IDI is the exception.
- **What justifies a higher price in the evidence:** day-of operations (QR, greeting screen, seating) and human service, not the invitation page alone. Our measured guest-page quality lead is real but invisible to buyers until it is marketed and backed by the table-stakes features (music, cover, countdown, QR).

## 4. Options for the owner (all reversible; change `lib/pricing.ts` only, ADR-O02)
| Option | What | Pros | Cons | Evidence |
|---|---|---|---|---|
| A. Keep 149k / 299k, add value | Ship P0 table stakes + QR check-in in premium; market speed / accessibility / privacy | No re-pricing; premium stays distinct | Entry stays above the mass band | §3 |
| B. Add an entry tier | e.g. a self-serve tier inside the Rp 69–100k band with the basic template tier and the same 12-month period; upgrade path | Meets the mass band; keeps 149k / 299k | Margin per invitation; support load | IDI, WEV, ENV, KAT Lite |
| C. Reverse trial | Publish free for a few days, then pay to keep it live (data kept) | Proven conversion pattern (loss aversion) | Abuse risk (spam invitations); needs rate limits (G-007) | ENV (S-ENV-001) |
| D. Free theme switching | Entitlement per invitation and tier, not per template | Removes a known complaint pattern; cheap | Slight revenue loss on re-purchases | IDI, WEV, ENV; ours F-074 |
| E. Reseller packs | Credits at a volume price with a resale floor | Distribution | Needs a tenant model (G-052) | SMO, ENV, INV |

**Default recommendation (pending the owner):** A + D now (no price change, fixes honesty and switching), then test B or C behind a flag after P0 ships, measured by publish conversion and refund rate. **Never** show permanent strikethrough anchors; promotions carry an end date (honesty, and Indonesian consumer-protection exposure is a professional-review question, not answered here).
