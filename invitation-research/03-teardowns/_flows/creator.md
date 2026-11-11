# Creator flow: onboarding → publish → share

> v1, session 10 (2026-11-03). Legend and rules: `README.md`.

## Invitesion today (`7a00a6d`)
| # | Step | Baseline `22ed99e` (audit, `../../01-codebase-audit/flows.md` §1) | After s09 P0 (code-verified) |
|---|---|---|---|
| 1 | Catalog → template preview | OBSERVED (code) | unchanged |
| 2 | Clerk sign-up | OBSERVED (code; not clicked through, no real keys) | unchanged |
| 3 | Create from template | **preset lost** (QA-001) | preset kept for all 64 templates (B-001, E-001) |
| 4 | Editor (16 modules, manual save) | preview link 404 (QA-011), theme tab unreachable | owner preview `/preview/<id>` (drafts included, no tracking); theme tab visible (B-005, E-005) |
| 5 | Pay (QRIS manual confirmation / Stripe) | marketing showed "Rp0" | prices on marketing pages from `lib/pricing.ts` (B-002, E-002) |
| 6 | Publish gate (names + dated event + paid) | OBSERVED (code) | unchanged |
| 7 | Add guests one by one, copy `wa.me` links | slug from the name | unchanged by default; opaque tokens behind `FLAG_OPAQUE_GUEST_LINKS` (off; B-011) |
Estimate: ≈ 25–35 interactions to a shareable link [ESTIMATE from code paths]; time to publish [UNKNOWN] (no signed-in session in any session so far).

## Competitors
| Vendor | Steps to a shareable link | Class | Evidence | Notable step |
|---|---|---|---|---|
| Enviory | 4 (theme → type names → details → publish), no payment before publish, 5-day trial | CLAIMED; demo-page "Ganti Data" entry OBSERVED | S-ENV-001; C-ENV-122/123 | try-with-your-names on the demo itself |
| PALEO | 5 (quote → bride → groom → events → theme), "under 5 minutes", app only | CLAIMED | S-PLO-003 | guided wizard |
| Indoinvite | catalog → register → admin builds (every tier) → pay → share; self-service panel from Pro | catalog OBSERVED, rest CLAIMED | S-IDI-002, S-IDI-006 | production is a service |
| Satu Momen | catalog → `create-card` → free registration → Basic self-edit or admin-built tiers | links OBSERVED, rest CLAIMED | S-SMO-003, S-SMO-005 | page-based editor |
| Wevitation | register → theme → guests → share → monitor (5) | CLAIMED | S-WEV-001 | free 14-day plan |
| Viding | package or free trial → register → dashboard (template or Studio canvas) → split invitations → send | entry OBSERVED, rest CLAIMED | S-VID-001/002 | split invitations per guest category |
| Invitato | WhatsApp consultation → quote → design → vendor builds → publish | CLAIMED | S-IVT-001…005 | done-for-you only |
| INVI.ID | checkout (2-day trial or paid) → virtual account → dashboard → share | CLAIMED | S-INV-002 | pay-first |
| Katsudoto | design → package + add-ons → self or full service → publish on a subdomain | CLAIMED | S-KAT-004 | 24 priced add-ons |
| Undangan Virtual (B) | theme → quota package → pay → **6-character token creates the account** → fill from phone | CLAIMED | S-UVR-001 | no signup before payment |
| Janiva (B) | theme → fill → see result → pay when satisfied (7-day trial, no card); themes switch without re-entering data | CLAIMED | S-JNV-001 | fill once, switch themes |
| Wedew (B) | register → instant creation, free forever | CLAIMED | S-WDW-001 | free publish |
| Paperless Post / Joy / Partiful | design → event page → guest list → send (PPO); free website (JOY); event page in ~30 s (PTF) | CLAIMED | S-PPO-001/002, S-JOY-001, S-PTF-001 | channel-aware sends; one-link events |

## Best-of patterns (principle level)
1. **Show the result before the account** (ENV, JNV): the guest page with the couple's own names is the strongest conversion moment.
2. **Fill once, switch freely** (JNV, ENV, IDI): template choice should not cost re-entry.
3. **Wizard for the first five fields** (PLO): names, parents, events, then the template.
4. **Avoid:** production queues for paid tiers (IDI, IVT), add-on menus that hide the final price (KAT), trial clocks that punish early sharing (ENV, SMO).

## Proposed Invitesion target (design target, not measured)
| Target | Backlog | Acceptance (from `../../09-masterplan/06-backlog.md`) |
|---|---|---|
| ≤ 6 steps to a shareable link for a basic template | B-037 (wizard + try-with-your-names), B-035 (live preview + autosave) | measured in a usability test once built; no claim before |
| Names typed on a template render instantly, account created at save with the draft kept | B-037 | draft survives sign-up; no data loss |
| Theme switch within the paid tier without re-entry; server-side entitlement check | B-036, B-041 | Standard cannot take a Premium look via the API |
| Publish → share screen with per-guest WhatsApp links and the OG card | B-018, B-010 (done) | every guest reachable in one tap |
| Prices always from `lib/pricing.ts` | B-002 (done) | no page claims a free plan |
