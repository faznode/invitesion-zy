<!-- SUMMARY (first 7 lines — greppable) -->
# template-catalog-roadmap.md — from one renderer for 64 templates to a tiered, budgeted catalog
> WHAT: Catalog strategy grounded in the niche evidence and our template architecture: fix, contract, tiers, niches, cadence, quality gates.
> STATUS: DONE s08 (2026-11-03)
> OWNER: Research agent
> DEPS: ../05-feature-matrix/niche-coverage.md, ../01-codebase-audit/{template-system.md,niche-coverage.md}, upgrade-map G-001/G-004/G-016/G-034/G-060/G-065, brief 03 §21
> GREP: catalog, template, tier, basic, premium, signature, niche, manifest, harness, cadence
> UPDATED: 2026-11-03

## 1. Where we are (code at `2c94140`)
64 templates in `lib/invitation/templates.ts` (27 categories, 12 motifs, 18 palettes, standard / premium tier flags) → **one renderer** (`components/invitation/public-renderer.tsx`) where the palette is the only variable (F-036). The richest design work lives in the marketing preview mock (`app/templates/[slug]/preview-client.tsx`, M-005), not in what guests receive. Catalog creation is broken by QA-001 (G-001). Theme art hot-links Unsplash (G-016).

## 2. What the market shows
- **Catalog size is not quality:** IDI lists 493 themes on one 2.36 MB page from a shared catalog (S-IDI-002); ENV sells 18 art-directed themes in two layout families at a premium (S-ENV-001); IVT 34 in-house story designs (S-IVT-004).
- **Niche depth beats breadth:** INVI.ID has real khitan / aqiqah / walimatussafar themes (S-INV-002); SMO groups 96 themes into five event families with Adat / Syari filters (S-SMO-003); nobody in the reads shows named Sundanese, Batak, Minang, Bugis or Betawi themes.
- **Guest-page quality is weak everywhere** (perf medians 28–55): a catalog that keeps our budgets is a differentiator in itself.

## 3. Roadmap (each step gated by the harness, brief 03 §21)
| Step | Deliverable | Gate to pass | Upgrade rows |
|---|---|---|---|
| 0 | Fix preset loss; remove unverified religious text; memorial preset with sober defaults | regression tests; corpus check | G-001, G-004, G-060 |
| 1 | `template.manifest.json` schema derived from `templates.ts` + `detail-config.ts`; harness CLI (`new`, `check`, `bench`, `preview`, `snapshot`, `report`) | harness self-tests incl. deliberate failures | G-034, G-065 |
| 2 | **Three tiers with budgets**: basic (static, no motion beyond CSS fades), premium (subtle motion, music, gallery lightbox), signature (cinematic cover, optional lazy 3D with static fallback) | per-tier weight / LCP / TBT / a11y / reduced-motion gates | G-034, G-065, G-066 |
| 3 | Section contract + per-template layout islands (cover, couple, events, gallery, gifts, RSVP, wishes) so templates differ in layout and ornament, not only colour | snapshot at 360×800, 390×844, 412×915; contrast | G-034, G-041 |
| 4 | Self-hosted, licensed art with provenance in each manifest; no hot-links | asset licence + external-host allowlist gates | G-016 |
| 5 | Niche playbooks in this order: Islamic wedding (no scripture until the corpus exists), Islamic family events (khitanan, aqiqah, walimatussafar), Javanese adat wedding (only verified structure), birthday / kids, corporate / seminar (render agenda and speakers), memorial (sober) | playbook checklist per niche; owner or community review for cultural sections | G-033, G-060 |
| 6 | Cadence: a small number of templates per month that pass every gate, rather than catalog volume; retire the 13 single-template business categories into 3–4 families | catalog report from the harness | — |

## 4. Rules
- No template ships without passing `check` (budgets, a11y, reduced motion, licences, originality, i18n keys, placeholder-only content).
- Templates never modify product core opportunistically; core changes are backlog items (brief 03 §21.5).
- Religious quotations only from `content/verified-religious-texts/` (ADR-O04).
- Cultural sections (adat sequences, terms) need owner or community verification; this research does not invent them.
