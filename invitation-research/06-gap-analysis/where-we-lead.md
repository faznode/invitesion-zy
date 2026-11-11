<!-- SUMMARY (first 7 lines — greppable) -->
# where-we-lead.md — advantages to protect, with their evidence and their threats
> WHAT: The strengths the masterplan must preserve (brief 03 §15 "Protect existing advantages rather than replacing them indiscriminately").
> STATUS: Verified s10 (2026-11-04; v1 s08). §1 competitor medians follow the s10 matrix rebuild (Viding six themes: performance 53, LCP 12.58 s, TBT 416 ms). Our column is the **pre-P0** build (`22ed99e`) and has not been re-measured (RQ-OWN-02).
> OWNER: Research agent
> DEPS: ../05-feature-matrix/feature-matrix-long.csv (derived rows), ../_tools/capture/dossier-digest.py outputs, ../01-codebase-audit/quality-audit.md
> GREP: lead, strength, protect, performance, accessibility, privacy, budget
> UPDATED: 2026-11-04

## 1. Measured leads (Lighthouse 12.8.2 mobile, simulated Slow 4G + 4× CPU, 412×915, cold cache; eligible captures, median per theme)
| Metric | Invitesion (C-INV-001/002/005) | Competitor medians | Best competitor | Matrix row |
|---|---|---|---|---|
| Performance score | **94** | KAT 28, INV 30, IVT 38, WEV 40, VID 53, BRN 55 | BRN 55 | FM-156 |
| LCP | **2.53 s** (Partial: just above the 2.5 s control point) | VID 12.58 s … BRN 23.15 s | VID 12.58 s | FM-157 |
| TBT (not INP) | **184 ms** | VID 416 … KAT 4,192 ms; **BRN 0 ms** | BRN | FM-158 |
| Transfer at cold load | **311 KiB** | VID 3,084 … IVT 7,192 KiB | VID | FM-160 |
| Accessibility score | **96** | KAT 77 … WEV 86 | WEV 86 | FM-163 |
| Third-party entities | **0** | IVT 2, VID 5, BRN 5, KAT 8, WEV 9, INV 9 | IVT | FM-179 |

*s13 (D-031): unconditional population. Enviory's provisional medians (sensitivity only, never unconditional): Perf 42, LCP 13.87 s, TBT 920 ms, 2,404 KiB (would be the lightest), accessibility 100 (would be the best), 1 third-party entity (would be the fewest). None of our leads changes direction either way.*
| Pinch-zoom | allowed | VID and KAT block zoom on every theme | — | FM-164 |

**Limits that travel with every sentence above:** C-INV-005 is a local production build with `middleware.ts` omitted (placeholder Clerk keys, D-012, P-INV-010), so CSP, locale cookie and clerk-js (+70.7 KB brotli, QA-007) are not in the numbers; our pages have **no music, cover, motion or images yet**, so part of the lead is the absence of features competitors ship. Lab TBT is not INP.

## 2. Leads by design
| Lead | Evidence | Competitor contrast |
|---|---|---|
| Unlimited self-editing after publishing | F-061, revision cap never enforced (F-063) | IDI revisions 2×/3× below Pro; SMO 2× on Premium (S-IDI-006, S-SMO-005) |
| 12-month active period on the entry tier | F-064, `publish-rules.ts` | SMO Basic 7 days from purchase; BRN event + 90 days (S-SMO-005, S-BRN-002) |
| Free drafting, pay to publish | F-075 | IVT no trial; SMO 12-hour trial; WEV 14 days; INV 2 days |
| Programmatic SEO (~90 pages), filterable catalog, 27 categories | F-092, F-093 | PLO no web catalog; most vendors show categories without recorded filters |
| Fictional template previews | M-005 | IDI, SMO, IVT public samples render real customers' events (S-IDI-003, S-SMO-004, S-IVT-004) |
| Guest pages `noindex` | `app/i/**` robots metadata | only ENV also (C-ENV-111); KAT and VID guest pages score SEO 100, so they are indexable |
| Payment engineering | idempotent webhooks, minor units, EMVCo test vectors (M-025, M-026) | not observable on competitors |
| IDR + USD pricing by locale | `lib/pricing.ts` | Indonesian vendors show IDR only |

## 3. Threats to these leads and the guardrails
| Threat | Guardrail (masterplan item) |
|---|---|
| Music, cover art, galleries and motion added naively push weight and LCP to competitor levels | Per-tier budgets in the template harness (`bench`, `check`), music never preloaded before the cover tap, poster-first covers, lazy islands for motion and 3D (G-065) |
| clerk-js and the locale cookie on guest pages in production | Scope `ClerkProvider` to authenticated route groups; skip the cookie on `/i/*` (G-009, G-008) |
| Contrast regressions from new palettes | Contrast gate per palette pair (G-010, G-066) |
| Pressure to show real customer invitations as samples | Harness originality/privacy check: previews use fictional data only (G-067) |
| Pricing changes that add revision caps or short expiry | Keep unlimited editing and ≥ 12 months as positioning (G-068) |
