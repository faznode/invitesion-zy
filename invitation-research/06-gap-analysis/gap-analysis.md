<!-- SUMMARY (first 7 lines — greppable) -->
# gap-analysis.md — what we lack, what is broken, what we lead, and what to do first
> WHAT: Reading of the feature matrix (`../05-feature-matrix/`) and the code audit (`../01-codebase-audit/`) into 68 upgrade-map rows (G-001…G-068), the top-10 product gaps, the leads to protect, and the P0 shortlist.
> STATUS: DONE s08 (2026-11-03). Evidence cutoff `../_evidence-index.md` s08; planning gate met through ADR-W1 (IDI, PLO, SMO guest pages unmeasured → low confidence on their guest-page rows).
> OWNER: Research agent (autonomous, brief 05 §16)
> DEPS: ../05-feature-matrix/feature-matrix.csv, ../01-codebase-audit/{module-map.md,quality-audit.md,feature-inventory.csv}, ../09-masterplan/12-decision-log.md (ADR-O01…O07)
> GREP: gap, upgrade map, G-0, lead, defect, P0, quick win, table stakes
> UPDATED: 2026-11-03

## 1. Files
| File | Content |
|---|---|
| `upgrade-map.csv` | 68 rows: gap ID, FM rows, F-/QA-IDs, module IDs and repository paths, current behaviour, competitor evidence, gap type (missing / partial / parity / lead), proposed improvement, impact 1–5, effort S/M/L, risk L/M/H, dependencies, priority, quick-win note |
| `where-we-lead.md` | Measured and designed advantages, with what could erode them |
| `pricing-packaging.md` | Every public price in the Tier-A set against `lib/pricing.ts`, and packaging options for the owner |
| `template-catalog-roadmap.md` | From one renderer for 64 templates to a tiered, budgeted catalog |
| `must-have-p0.md` | The 12 P0 items in dependency order (feeds `../09-masterplan/06-backlog.md`) |

Scales used in `upgrade-map.csv`: **impact** 1 (cosmetic) … 5 (blocks a core job or misleads buyers); **effort** S ≤ 2 developer-days, M ≤ 2 weeks, L > 2 weeks; **risk** L / M / H = chance of breaking published invitations, payments or authorization, or of an irreversible data change. **Quick win** = S effort, L risk, no external dependency.

## 2. How the gaps were found
1. **Matrix signal:** rows where our cell is None or Partial while ≥ 3 competitors are Full (58 rows), weighted by how many of the 9 Indonesian vendors with evidence are Full (`../05-feature-matrix/coverage-summary.md`, signal script output in the s08 session log).
2. **Defects** from `quality-audit.md` (QA-001…027, audited at `22ed99e`). Every P0 defect is **revalidated against `2c94140` before implementation** (brief 03 §20.1); QA-001 was already re-verified in ADR-O01.
3. **Leads** = rows where we are Full while most known competitor cells are not (12 rows), plus privacy and pricing-transparency rows.
4. Every row cites module IDs and paths from `module-map.md`, so each gap maps to code.

## 3. Top-10 product gaps (impact × breadth of competitor evidence)
| # | Gap | Evidence of demand | Ours today | Upgrade |
|---|---|---|---|---|
| 1 | **Templates lose their preset on creation** (defect) | — | every catalog invitation starts `{}` (QA-001, ADR-O01) | G-001, P0 |
| 2 | **Event times wrong on UTC servers; WITA/WIT mislabelled** (defect) | IVT, INV label zones correctly | 08:00 WIB → "01.00 WIB" (QA-002) | G-002, P0 |
| 3 | **No cover gate, no music, no pause control** | 8–9 / 9 Indonesian vendors (FM-003, FM-004) | config only | G-024, P0 |
| 4 | **No countdown, no add-to-calendar** | 8 / 9 (FM-008, FM-021) | missing | G-025, P0 |
| 5 | **Marketing says "Rp0 GRATIS", checkout charges Rp 149k** (honesty) | IDI publishes plain prices | contradiction (ADR-O02) | G-003, P0 |
| 6 | **No share-card image** for WhatsApp previews | og:image on 6 vendors (FM-047) | title only (QA-009) | G-011, P0 |
| 7 | **Guessable guest links are the only credential** (security / PDP) | IVT opaque codes | slug from the name (QA-003) | G-005, P0 (flagged) |
| 8 | **No QR pass, no scanner, no greeting screen** | QR pass 6 / 9, scanner 7 / 9, greeting screen 4 (FM-042, FM-079, FM-081) | manual check-in only | G-027, P1 (L effort) |
| 9 | **One layout and no motion for 64 templates** | art-directed families (ENV), motion libraries on 5 vendors | palette is the only variable (F-036, F-037) | G-034, P1 via the harness |
| 10 | **Business model: no reseller, affiliate, local payment breadth; entry price above the market band** | reseller 4, affiliate 5, VA / e-wallet 3+ vendors; every one-time entry tier observed is below Rp 149k | none; QRIS manual | G-049…G-053, P1–P2 (owner decisions) |

Also important but not top-10: RSVP allowance overwritten (G-006, P0 because it corrupts host data cheaply fixable), editor preview 404 and unreachable theme tab (G-013, P0), CSV formula injection (G-014, P0 quick win), RSVP depth (G-031), bulk import (G-037), live preview + autosave (G-040), free theme switching (G-042), memorial template on a celebration form (G-060, sensitivity).

## 4. Where we already lead (detail: `where-we-lead.md`)
Measured in the lab with the same protocol (C-INV-005 limits): **performance 94** vs competitor medians 28–55, **TBT 184 ms** vs 416–4,192 ms (BRN 0 ms is the exception; lower bound VID over six themes after the s10 rebuild, was 594 ms over three), **311 KiB** vs 3,084–7,192 KiB, **accessibility 96** vs 77–86, **zero third-party entities** vs 2–9 (unconditional population, s13; with the provisional Enviory themes, D-031: 2,404–7,192 KiB, accessibility up to ENV's 100, third parties 1–9). By design: unlimited self-editing, 12 months on the entry tier, free drafting, programmatic SEO + filterable catalog with 27 categories, fictional template previews where IDI, SMO and IVT expose real customers' events, noindex guest pages, IDR + USD pricing. **Every P0 that adds guest-page features (music, cover, countdown, OG) is gated by budgets so these leads survive** (G-065).

## 5. Gaps we deliberately do not chase now
- **Native apps** (IDI, PLO, WEV): a host PWA covers the scanner and guest list first (G-064).
- **Vendor-fulfilled gift commerce and paid stickers** (IDI, BRN): two-sided revenue with ethics and custody questions (ADR-O03); ideation only.
- **Hotel blocks, public-event discovery** (JOY, PTF): no Indonesian analogue in the evidence.
- **Canvas editor** (VID Studio): a different product model; section reorder + font/colour choice (G-041) covers the evidenced need.
- **Platform-processed cash gifts** (BRN per-side payouts): needs a PJP and legal review of fund custody before any money is held (ADR-O03); the host's own static QRIS image is the safe first step (G-030).

## 6. Confidence and limits
- **High:** our column (code-verified), measured rows for WEV, VID, ENV, IVT, INV, KAT, BRN (eligible captures only), prices on public pages.
- **Medium:** keyword-detected guest features (Indonesian/English detector), vendor claims about host tools.
- **Low:** anything about IDI, PLO and SMO guest pages (ADR-W1), PPO / JOY / RSV / PTF beyond their marketing, Sitemu beyond its level-C marketing dossier (v1 s12; not yet in the matrix), and Enviory guest-page numbers (provisional, D-031).
- Lab TBT is not INP; user-agent emulation is not an in-app-browser test (brief 03 §13). Our numbers omit `middleware.ts` and clerk-js (QA-007 adds ≈ 70.7 KB brotli in production until G-009 lands).
