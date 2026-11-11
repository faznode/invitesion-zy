# Reseller operations flow

> v1, session 10 (2026-11-03). Legend and rules: `README.md`. All competitor steps are CLAIMED (partner and pricing pages); no partner account was opened.

## Invitesion today (`7a00a6d`)
Not supported: every invitation belongs to one end-customer account; no tenant model, sub-users, white-label domain, credits or wholesale prices (F-079 missing, `../../01-codebase-audit/data-model.md` §3). Unchanged by P0.

## Competitors
| Vendor | Model | Unit economics (public) | Branding | Client access | Evidence |
|---|---|---|---|---|---|
| Satu Momen | credit packages: Lite 250k (100 credits, 20 / invitation), Pro 1M (300, 15), Enterprise 2.8M (600, 10) | ≈ 46.7–50k per invitation before top-ups (top-up price [UNKNOWN]) | branded site, landing page, domain | customers can edit | S-SMO-005/006 |
| INVI.ID | packs 13–45k per invitation | published per pack | logo, copyright, custom domain, landing page | create for clients or give clients accounts | S-INV-002 |
| Wevitation | Mitra Bronze / Silver / Gold, Enterprise; authorized reception partners | not published | partner branding | — | S-WEV-001 |
| Enviory | reseller quota + 35 % referral | quota prices partly public | — | — | S-ENV-001 |
| Viding | commission agents, one partner per city, monthly cashback | commission tiers not published | none (no white label) | — | S-VID-006 |
| sangmempelai.id (B) | positions itself as a partner brand | retail 49k with heavy anchors | — | — | S-SMP-001 |
| Undangan Virtual (B) | reseller programme with a reseller dashboard (robots-disallowed path) | not published | — | — | S-UVR-001 |
| Evite (B, US) | subscription for frequent hosts ($249.99 / year Pro) | public | — | — | S-EVT-002 |

## Best-of patterns
1. **Credits with published unit prices** (SMO, INV) make the reseller margin computable.
2. **Client edit access** under the reseller's brand (SMO, INV).
3. **Avoid:** unpublished top-up prices (SMO), exclusivity rules that block coverage (VID one partner per city).

## Proposed Invitesion target (later; P2)
| Target | Backlog | Dependencies |
|---|---|---|
| Reseller workspace: credits with published prices, client invitations, optional client edit access, own branding on the share page | G-052 (P2) | tenant IDs on invitations (`../../09-masterplan/10-data-privacy-security-payments.md` §3), automated payments (B-039, owner PJP contract) |
| Affiliate / coupon codes | G-053 (P2) | consumer-protection review of discount claims (§7 of chapter 10) |
No reseller work starts before the tenant model and automated payments exist.
