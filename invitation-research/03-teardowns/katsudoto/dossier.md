# Katsudoto (KAT): Tier A teardown dossier

> **Status: v1, session 06 (2026-10-30 WIB).** Evidence level **B** (`../../09-masterplan/02-evidence-coverage.md` §2; line added s10). All 12 sections have evidence; §4 rests on six vendor-placeholder demos (C-KAT-101…106, threshold-grade). Not done yet: the creator flow (no signup, R1), the Buku Tamu Digital and Wedding Planner prices, Play Store metadata (§7) and user complaints (§10).
>
> Evidence used: **S-KAT-001** (`/desain` + one linked sample, 2026-10-29 10:40 WIB), **S-KAT-002** (one robots-checked fetch per queued demo, 11:23 WIB), **D-KAT** (discovery, 10:31 WIB), **C-KAT-101…106** (batch captures, 2026-10-29 10:2x–11:39 WIB, protocol v1.1), **S-KAT-003** (homepage `https://katsudoto.id/` read as a visitor + `robots.txt` = allow all, 2026-10-30 05:11 WIB), **S-KAT-004** (`/v2/package` and `/undangan-lite` read as a visitor, 05:12 WIB), plus the Phase 2 longlist row. All prices are IDR as displayed on those dates. Demo pages are vendor placeholders (S-KAT-001/002), not customer invitations; their per-couple subdomains are pseudonymized (D-015).

## 1. Snapshot
| Item | Finding | Tag |
|---|---|---|
| Positioning | "Partner Digital untuk Hari Spesial Kamu": one platform for **Undangan Website, Buku Tamu Digital and Wedding Planner**, sold on modern convenience for couples *and* guests; the hero also pitches event-registration management | [OBSERVED S-KAT-003] |
| Segment | Weddings first (every product page and the planner are wedding-specific); an `/events` registration product exists | [OBSERVED S-KAT-003] |
| Languages | Indonesian marketing copy; the demo guest pages use English UI labels ("Open Invitation", "Holy Matrimony", "Our Story") and declare `<html lang="en">` | [OBSERVED S-KAT-001, C-KAT-101…106] |
| Company signals | "Berdiri sejak 8 tahun lalu" (≈ 2018); "di dalam maupun luar negeri"; a customer counter rendered as **0** in a static read (client-side counter) | [CLAIMED S-KAT-003] / counter [UNKNOWN] |
| Size | Counters: **10,517** website invitations, **1,527** digital guestbooks, **5,742** wedding-planner users | [CLAIMED S-KAT-003] |
| Traffic / installs | Tranco rank 798,240 | [ESTIMATE Tranco, longlist probe 2026-10-29] |
| Plans (Undangan Website) | Three one-off tiers, each "Full Service / Self Service": **Rp 300.000** (tier 1, "Lamar" by inference from the next tier's "semua fitur lamar"): all designs, unlimited edits and guests, RSVP, wishes, digital envelope, custom song, love story, 25 photos, video gallery, live streaming, event icons, **active 1 year**. **Rp 500.000** ("Mantu"): + guest lock, colour & font change, 35 photos, gift sending, event sessions, dress code, custom WhatsApp text, co-inviters list ("turut mengundang"), falling-leaves effect, **active forever**. **Rp 700.000** (name not rendered): + unlimited photos, custom loading logo, song crop, rundown, RSVP+, section ordering, **table + souvenir management**, **100 Smart WhatsApp messages**, active forever | [OBSERVED S-KAT-004] / tier names [INFERRED, medium] |
| À-la-carte menu | 24 priced add-ons, e.g. RSVP+ Rp 150k, table & souvenir management Rp 200k, unlimited active period Rp 100k, colour & font Rp 80k, guest lock Rp 75k, section ordering / custom song / dress code / gift sending / rundown / custom WA text Rp 50k each, live streaming / video gallery / Instagram filter / personalized invitation Rp 10k each; **Smart WhatsApp and WhatsApp Reminder Rp 1.000 per message** | [OBSERVED S-KAT-004] |
| Lite | **Katsudoto Lite: flat Rp 100.000**, self-service, limited templates, basic features (event info, gallery, RSVP), upgrade to Premium any time ("udah cukup") | [OBSERVED S-KAT-004] |
| Other products | Buku Tamu Digital (QR check-in, **selfie check-in**, **auto thank-you message**, guest categories, real-time data); Wedding Planner (budget planner, to-do list, rundown, seserahan list, uniform list, shared savings target, vendor shortlist). Prices not read | [CLAIMED S-KAT-003] / prices [UNKNOWN] |
| Affiliate | "Mitra": **15 %** commission, up to Rp 600k per successful transaction, no follower minimum, withdrawal from the dashboard | [OBSERVED S-KAT-003] |
| Watermark | A "powered by / made with"-type credit was detected on all six demos | [OBSERVED C-KAT-101…106 feature pass] |
| Catalog | Template filters: Populer, Adat, Floral, Fairytale, Minimalis, Nature, Vintage; 61 demo-like links on `/desain`, 49 of them on the `<couple>.katsudoto.id/<id>` pattern; "all designs" included in every tier | [OBSERVED S-KAT-004, D-KAT, S-KAT-001] |

## 2. Funnel and flows
```mermaid
flowchart LR
  L[Landing / desain catalog with style filters] --> P["/v2/package: pick tier + design, toggle priced add-ons"]
  P --> S{"Full Service or Self Service"}
  S -->|self| D[Dashboard: edit data, guests, groups, sessions, pax limits]
  S -->|full| T[Team builds it]
  D --> Pub[Publish on a per-couple subdomain]
  T --> Pub
  Pub --> W["Share: manual WhatsApp (unlimited) or Smart WhatsApp blast (Rp 1.000 / message)"]
  W --> R[Real-time RSVP tracking, reminders (Rp 1.000 / message)]
  R --> G["Day-of: Buku Tamu Digital QR + selfie check-in, auto thank-you"]
  L --> Lite["Lite Rp 100k: pick template, fill data, done"] --> Pub
```
- Steps to a shareable link: pick design → package → (self) fill the dashboard → publish; Lite promises "pilih template, isi data, langsung jadi". [CLAIMED S-KAT-004]
- Payment comes before publishing (package checkout under `/v2/`); gateway not observed. [INFERRED, medium] / gateway [UNKNOWN]
- Friction we can infer: a 24-item add-on menu on top of three tiers makes the final price hard to predict; WhatsApp blast and reminders are metered per message. [INFERRED, high]
- Time to publish and the creator UI itself: not observed (no signup, R1). [UNKNOWN]

## 3. Builder / editor
| Aspect | Finding | Tag |
|---|---|---|
| Model | Dashboard-based (self service) or done-for-you (full service) at the same tier price | [CLAIMED S-KAT-004] |
| Design freedom | "Pilih template dan ubah warna atau font tanpa batasan" on the homepage, but colour & font change is a Rp 500k-tier feature or a Rp 80k add-on | [CLAIMED S-KAT-003] vs [OBSERVED S-KAT-004]: inconsistent |
| Structure control | Section ordering ("Atur Section"), custom loading logo, song crop (top tier or add-on) | [OBSERVED S-KAT-004] |
| Guests | Guest groups, event sessions, RSVP pax limit per invitation, guest lock, table + souvenir management | [CLAIMED S-KAT-003, S-KAT-004] |
| Media | 25 / 35 / unlimited photos by tier; video gallery; custom song | [OBSERVED S-KAT-004] |
| Live preview, autosave, validation, AI helpers | Not observed | [UNKNOWN] |

## 4. Guest-facing invitation deep dive (6 vendor-placeholder demos)
All six are guest pages, not wrappers (711–1,435 DOM nodes, no same-origin content iframe). The capture found and clicked the cover control ("Open Invitation") on all six, but with the pre-s06 synthetic click, and the document stays one viewport tall afterwards, so whether the gate really opened is unverified; the content features below are present in the DOM either way. Re-capture with the D-016 click before using structure beyond feature presence. [OBSERVED C-KAT-101…106] / gate state [UNKNOWN]

### 4.1 Measurements (Lighthouse 12 mobile, simulate Slow 4G / 4× CPU, 412×915; CDP bytes = unthrottled cold-cache session)
| Capture | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | CDP KB | JS KB | Img KB | Font KB | Req | DOM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-KAT-101 | 26 | 82 | 79 | 100 | 13.66 | 4,042 | 0.070 | 10,041 | 886 | 8,330 | 539 | 165 | 1,426 |
| C-KAT-102 | 28 | 77 | 79 | 100 | 30.22 | 3,177 | 0.000 | 6,525 | 904 | 4,802 | 529 | 178 | 1,336 |
| C-KAT-103 | 27 | 74 | 79 | 92 | 47.31 | 10,780 | 0.000 | 12,000 | 769 | 10,418 | 544 | 143 | 1,435 |
| C-KAT-104 | 28 | 77 | 79 | 92 | 11.10 | 3,590 | 0.007 | 4,938 | 768 | 3,479 | 422 | 99 | 1,214 |
| C-KAT-105 | 6 | 82 | 75 | 100 | 17.03 | 4,342 | 0.571 | 4,928 | 769 | 3,460 | 432 | 113 | 1,271 |
| C-KAT-106 | 30 | 75 | 79 | 100 | 13.05 | 6,947 | 0.001 | 4,280 | 769 | 2,880 | 376 | 92 | 711 |
| **Median** | **28** | **77** | **79** | **100** | **15.35** | **4,192** | **0.004** | **5,732** | **769** | **4,140** | **480** | **128** | **1,304** |

[OBSERVED C-KAT-101…106; table generated by `_tools/capture/dossier-digest.py`]. Caveats: captured before REA drove visits (driver `pre-s06`, CDP); the platform dev server shared the CPU, so treat TBT as directional (protocol §6).
- **Images dominate**: 2.9–10.4 MB of images per demo (median 4.1 MB) with **0–1 lazy images out of 38–175**. [OBSERVED]
- **JS ≈ 770–900 KB** with 273–418 KB unused; JSDelivr-served libraries block the main thread 250–1,478 ms; GTM adds 2.6 s on C-KAT-106. [OBSERVED LH]
- **Video stack on every page**: Video.js (icon font + ≈ 203 KB from the Video.js CDN, which Lighthouse attributes to Brightcove) on all six, plus YouTube embeds on five costing 1.1–1.7 MB on cold load. [OBSERVED]
- C-KAT-105 has CLS 0.57; the rest ≤ 0.07. [OBSERVED]
- After the click the document stays one viewport tall (`docHeight` 915) with 1 top-level section: either the invitation scrolls inside an inner container or the gate never opened (synthetic click, see above). Section counts are not comparable with other vendors until a D-016 re-capture settles it. [OBSERVED] / mechanism [UNKNOWN]
- Our guest page under the same protocol, by measurement source (s08 correction, brief 05 Task C; the v1 sentence put Lighthouse scores beside CDP bytes without saying so): **Lighthouse cold load** C-INV-005 Perf 93, LCP 2.62 s, 321 KiB / 26 requests vs the KAT median of six (Perf 27.5, LCP 15.35 s, TBT 4,192 ms, 5,984 KiB) → **≈ 18.6× less transfer at load**; **CDP whole visit** (pre-s06 driver on both sides) C-INV-001 323 KiB / 19 requests vs the KAT median 5,732 KiB → ≈ 17.8×. Lab only: INP was not measured, and C-INV-005 is a local production build without `middleware.ts` (placeholder Clerk keys, D-012, P-INV-010). [OBSERVED]

### 4.2 Structure and interactions
- Section sequence (vendor placeholder, structure only): cover + guest greeting → countdown → couple + parents + social handles → quote → portrait gallery → events (holy matrimony, reception, venue, dress code) → live streaming → rundown → our story (3 chapters) → Instagram filter → wedding gift (bank accounts + **transfer-proof upload**) → video footage → thank-you. [OBSERVED S-KAT-001]
- Detected on all six: cover gate, countdown, calendar, dress code, gallery, gift, live streaming, love story, music control, watermark. Instagram filter on 4/6, RSVP form on 4/6, wishes on 2/6, verse block on 2/6. Two forms per page (12 and 6 fields: RSVP + wishes or gift proof; three on C-KAT-102). [OBSERVED feature pass]
- Audio: no `<audio>` element; music runs through the Video.js / YouTube player stack. [OBSERVED media pass] / [INFERRED, medium]
- Motion: jQuery + AOS + Slick on all six; C-KAT-101/102 add GSAP + ScrollTrigger + Swiper, C-KAT-102 anime.js. **No `prefers-reduced-motion` CSS** on any page. [OBSERVED]
- Fonts: Font Awesome 5 (Free + Brands), the Video.js icon font, Roboto, Montserrat, plus one display face per theme (Lancelot, Fredoka, Bellefair, Fustat, Cormorant Upright; Phosphor icons on C-KAT-106); 2 `font-display` issues per page. Licenses: the text/display faces are Google Fonts families (OFL/Apache) [INFERRED, high]; Font Awesome Free (OFL fonts, CC BY icons) and Phosphor (MIT) [INFERRED, high].
- i18n / a11y: `lang="en"` on Indonesian pages; **zoom blocked** (`meta-viewport` fails on all six); `button-name`, `label`, `link-name`, `heading-order` fail on all six; A11y 74–82. No WIB/WITA/WIT label detected. [OBSERVED LH + structure]
- OG image/title/description present; SEO 92–100 on the demos. [OBSERVED]
- Edge cases (long names, RTL, in-app browsers) are protocol v2 checks, not yet run. [UNKNOWN]

## 5. Tech fingerprint
| Layer | Finding | Confidence |
|---|---|---|
| Front end | Server-rendered pages with jQuery + AOS + Slick (+ GSAP/ScrollTrigger/Swiper/anime.js on some themes), Video.js, Font Awesome 5 | high [OBSERVED C-KAT-101…106] |
| App | Separate `/v2/` app for login, start and package selection | high [OBSERVED S-KAT-003 links] |
| Hosting / edge | HTTP/3 + Cloudflare CDN entity on every capture; per-couple subdomains `<couple>.katsudoto.id/<numeric id>` | high [OBSERVED] / Cloudflare as edge: high [longlist stack hint] |
| Third parties | JSDelivr, cdnjs (Cloudflare CDN), Google Fonts, YouTube, Video.js CDN, unpkg; GTM on 1/6 demos | high [OBSERVED LH] |
| Payments | Not observed | [UNKNOWN] |
| WhatsApp | "Smart WhatsApp" bulk sending from the dashboard + reminders, metered per message (gateway vs official API not stated) | [CLAIMED S-KAT-003, S-KAT-004] |
| Bot protection | No challenge on six robots-checked fetches | [OBSERVED S-KAT-002] |
| Crawl policy | `robots.txt`: allow all, sitemap listed | [OBSERVED S-KAT-003] |

## 6. Public API surface
No endpoints were recorded from normal page use; RSVP, wishes and gift-proof forms were not submitted (R1). No `api-observed.md` yet.

## 7. Mobile app
"Rencanakan pernikahan dalam genggaman" suggests a mobile planner, but no store link was seen on the pages read; Play Store metadata not checked. [UNKNOWN] → next session (store-listing metadata only, D-013).

## 8. Growth and SEO
- Every invitation lives on its own `<couple>.katsudoto.id` subdomain, and every demo carries a credit line, so each shared link advertises the brand. [OBSERVED] / effect [INFERRED, high]
- Keyword landing pages per product (`/undangan-lite` titled "Undangan Digital Rp100 Ribu untuk Pernikahan", `/buku-tamu-digital`, `/wedding-planner`), a portfolio page, a sitemap. [OBSERVED S-KAT-003/004]
- Free utility lock-in: the Wedding Planner (budget, to-do, savings, vendor list) brings couples in months before they need an invitation. [CLAIMED S-KAT-003] / funnel role [INFERRED, medium]
- Affiliate "Mitra" at 15 % with no follower minimum. [OBSERVED]

## 9. Monetization and pricing psychology
- **Feature-and-permanence ladder**: Rp 300k (1 year) → Rp 500k (forever + design control) → Rp 700k (ops: tables, souvenirs, 100 WhatsApp messages). [OBSERVED S-KAT-004]
- **Unbundling**: 24 priced add-ons let a Rp 300k buyer climb feature by feature; "unlimited active period" alone is Rp 100k. [OBSERVED] / upsell intent [INFERRED, high]
- **Metered messaging**: Smart WhatsApp and reminders at Rp 1.000 per message turn guest volume into revenue (a 300-guest blast + one reminder ≈ Rp 600k). [OBSERVED price] / example computed
- **Fighter tier**: Lite at Rp 100k answers the budget players (ENV Rp 75k, INVI) without discounting the premium line, with an explicit upgrade path. [OBSERVED S-KAT-004] / [INFERRED, high]
- **Service choice at the same price**: full service vs self service on every tier. [CLAIMED S-KAT-004]

## 10. Strengths, weaknesses, complaints
- Strengths: the broadest wedding-ops suite in Tier A (invitation + metered WhatsApp blast + QR/selfie check-in + auto thank-you + planner); table and souvenir management; guest sessions and pax limits; long track record (claimed 8 years); rich motion themes. [CLAIMED/OBSERVED as tagged above]
- Weaknesses: the heaviest guest pages measured so far (median 5,732 KiB over the CDP visit / 5,984 KiB at Lighthouse cold load, LCP 15.4 s, TBT 4.2 s, Perf 28); zoom blocked and `lang="en"` on Indonesian pages; no reduced-motion CSS; A11y 74–82; Video.js on every page and YouTube on most; Rp 300–700k is 2.4–9× Enviory, with many features sold separately. [OBSERVED]
- User complaints: s14: the homepage links no store listing (S-KAT-005), and no independent review source was read. [UNKNOWN]

## 11. Patterns to learn from (principle level, R2: no visual cloning)
| Steal-worthy principle | Avoid | Our counter-move |
|---|---|---|
| The invitation as the front door to day-of operations: check-in QR, selfie check-in, auto thank-you, tables, souvenirs | Blocking pinch-zoom and mismatched `lang` | Guest-page a11y gates in the harness (zoom allowed, correct `lang`, named controls) |
| Guest sessions + per-invitation pax limits as first-class data | Multi-MB images with almost no lazy loading | Image budget + lazy-by-default media in every template |
| A Lite fighter tier with a visible upgrade path | Autoloading YouTube/Video.js on every guest page | Click-to-load video facades; audio via a single `<audio>` with gesture unlock |
| Planner tools that start the relationship months before the invitation | 24-item add-on menus that make the price unpredictable | Few tiers with the ops features included; transparent totals |
| Done-for-you at the same price as self-service | Metered WhatsApp as the only bulk channel | Bulk WhatsApp included up to a fair limit (Fonnte plan, F-051) |

## 12. Mapping to our codebase (F-IDs from `01-codebase-audit/feature-inventory.csv`, M-IDs from `module-map.md`)
| Katsudoto capability | Our feature (status today) | Modules | Gap type |
|---|---|---|---|
| Personal guest link + greeting on cover | F-001 full, F-002 full | M-012, M-014, M-013 | parity |
| Cover gate + music | F-003 missing, F-004 config-only | M-013, M-005, M-009 | missing |
| Countdown, calendar | F-005 missing | M-013 | missing |
| Love story, wishes | F-007 full, F-019 full | M-013, M-014 | parity |
| Gallery 25 / 35 / unlimited + video gallery | F-008 partial, F-009 missing | M-013, M-027 | partial |
| Events, sessions, rundown, dress code | F-010 partial, F-025 config-only | M-013, M-009 | partial |
| RSVP + pax limits, RSVP+ | F-013 full, F-015 partial, F-014 missing | M-014, M-035 | partial |
| Digital envelope + gift sending + transfer-proof upload | F-021 partial, F-023 partial, F-022 missing | M-013, M-009, M-025 | partial |
| Live streaming | F-024 full | M-013 | parity |
| Instagram filter | F-028 config-only | M-009 | partial |
| Guest groups, guest lock | F-048 partial; guest lock: no F-ID yet → Phase 5 matrix | M-019 | partial / missing (new) |
| Smart WhatsApp blast + reminders | F-051 missing, F-052 config-only, F-050 partial | M-040, M-009, M-019 | missing |
| QR check-in + selfie check-in + auto thank-you | F-026 missing, F-055 missing, F-056 full, F-057 missing | M-013, M-035, M-019 | missing |
| Table + souvenir management | F-058 missing; tables: no F-ID yet → Phase 5 matrix | — | missing (new) |
| Wedding planner (budget, to-do, savings, vendors) | F-073 full (internal checklist only) | M-022 | partial |
| Colour & font change, section ordering, custom loading logo | F-074 partial; per-invitation styling and ordering: no F-ID yet | M-018, M-025 | partial / missing (new) |
| Custom song, song crop | F-072 missing | M-027 | missing |
| Watermark / credit line | F-068 missing (we have no watermark logic) | M-013 | design choice for Phase 5 |
| Affiliate 15 % | F-080 missing | — | missing |
| Lite tier Rp 100k; tiers Rp 300k–700k | F-085 full (ours Rp 149k / Rp 299k) | M-003 | packaging question for Phase 5 |
| Guest-page weight / a11y | C-INV-005 / C-INV-001 | M-012, M-013 | **we lead** |
| Multi-niche configs (aqiqah, khitanan, corporate) | F-039 / F-040 config-only | M-009 | we lead (KAT shows weddings only) |

Changes since the previous version: first version.
