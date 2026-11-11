# Wevitation (WEV): Tier A teardown dossier

> **Status: v1, session 07 (2026-11-01).** Evidence level **A/B** (`../../09-masterplan/02-evidence-coverage.md` §2; line added s10). All 12 sections have evidence. §4 rests on six official demos (C-WEV-101…106, `wevitation.com/demo/<theme>`, linked from the vendor's homepage catalogue of 16). **All six opened** (`features.coverGate` true → false): C-WEV-101 was captured in s04 before the REA driver, C-WEV-102/103 in s06 with the pre-D-016 click, C-WEV-104…106 in s07 with the D-016 trusted tap. The homepage capture C-WEV-001 (s01) is a marketing page and stays out of the guest-page medians.
>
> **Privacy (D-021):** the demo titles name a couple by first names on non-tokenized URLs; the names are redacted in the committed summaries and none appears here. No account, form, checkout or WhatsApp flow was used. Play-review authors, the developer's personal name and contact numbers are not recorded.
>
> Evidence used (times UTC, 2026-11-01): **S-WEV-001** `robots.txt` (allow all) + homepage (WebFetch ≈ 17:38Z, one plain fetch for links/headers), **S-WEV-002** `/paket-harga`, **S-WEV-003** `/guest-reception`, **S-WEV-004** Google Play listing, **S-WEV-005** `wegiftry.com` (≈ 17:39–17:41Z, one request at a time); captures **C-WEV-001**, **C-WEV-101…106**; tables from `_tools/capture/dossier-digest.py --competitor wevitation C-WEV-101 … C-WEV-106`. Rows: `../../_evidence-index.md`.

## 1. Snapshot
| Item | Finding | Tag |
|---|---|---|
| Positioning | Self-service web invitations "siap dibagikan dalam hitungan menit", sold as an ecosystem: invitation + gifts (sister product Wegiftry) + Event Planner + Wevitation AI + a paid day-of Guest Reception service | [OBSERVED S-WEV-001/003/005] |
| Scale | "Ratusan ribu pasangan", 2.5M+ invitations shared; Android 50k+ downloads | [CLAIMED S-WEV-001] / [OBSERVED install band S-WEV-004] |
| Entry price | Rp0 for 14 days, then Rp69K one-time "aktif selamanya" | [OBSERVED S-WEV-002] |
| Base | Day-of service area Kota Bandung + Kota Cimahi → Bandung-based | [INFERRED, medium S-WEV-003] |
| Catalogue | 16 demo themes on the homepage ("Lihat Semua Tema" for more): minimalist, floral, elegant, Nusantara (Wayang, Javanese) | [OBSERVED S-WEV-001, D-WEV] |
| Stack | Laravel Livewire + jQuery/Bootstrap/AOS behind Cloudflare | [OBSERVED captures] / Laravel [INFERRED, high] |
| Apps | Android (Google Play, Huawei AppGallery), installable PWA, no iOS app | [OBSERVED S-WEV-001/004] |

## 2. Funnel and flows
- **Claimed flow (5 steps):** register and fill in data → choose a theme → add guests → share link and QR code → monitor RSVP and gifts. [CLAIMED S-WEV-001]
- **Acquisition:** "Buat Undangan Gratis" (free plan, 14 days), "Lihat Demo" per theme, SEO blog, WhatsApp customer service. Upgrade happens inside the dashboard. [OBSERVED S-WEV-001]
- **Upsell ladder:** Free → Premium ("Paling Favorit") → multi-invitation packs → partner packages with branding → day-of Guest Reception (separate service, booking through a form that only drafts a WhatsApp message). [OBSERVED S-WEV-002/003]
- **Partner channels:** "Paket Kemitraan" (Enterprise, Mitra Silver, Mitra Gold; Mitra Bronze appears on the homepage) for resellers; an "authorized partner" network for reception services outside Bandung/Cimahi, recruited by a WhatsApp interest form (WO/EO, vendors, usher teams, individuals). [OBSERVED S-WEV-002/003]
- Not observed (R1): signup, dashboard, checkout, payment methods. [UNKNOWN]

## 3. Builder / editor
- Claimed: edit text, photos, music and event details "dengan beberapa klik"; switch theme at any time without a new invitation; appearance settings from the dashboard; per-guest names + unique QR codes; WhatsApp sending; RSVP and gift monitoring; Event Planner (budget, to-do, vendor management, timeline); AI assistant, AI generator, AI wishes analysis (sentiment, prayer topics, word cloud) and AI photo-studio prompts. [CLAIMED S-WEV-001]
- Music: a reviewer describes importing songs from YouTube; guest pages load the YouTube host. [CLAIMED S-WEV-004] / [OBSERVED host]
- The Android app is a mobile dashboard plus the reception QR scanner. [CLAIMED S-WEV-004]
- Editor UX, autosave and live preview were not observed (no account). [UNKNOWN]

## 4. Guest-facing invitation deep dive

### 4.1 What was measured (methodology)
- Targets: six official wedding demos, `wevitation.com/demo/{timeless-snapshot, mildness, visual-journey, espresso, photovit, wayang}`.
- States: **all six opened** (`coverGate` true → false). C-WEV-104/106 logged the trusted tap as "unsettled" (the control was still animating) but landed inside. The five content blocks are already in the DOM before the tap (content sits under the cover), so the structure rows are complete for every capture.
- **One skeleton:** every demo has the same five blocks `cover-section`, `detail-section`, `gallery-section`, `gift-section`, `wish-section` (div-based; `sectionCount` 5 everywhere). Themes differ in fonts, art and images, not in structure. [OBSERVED]
- Lighthouse never clicks: all six runs are valid **cold-load** samples. Post-visit bytes (CDP) are reported separately. C-WEV-101 predates the REA driver (s04), so compare its numbers with care.

### 4.2 Cold-load measurements (Lighthouse 12.8.2 mobile, simulate Slow 4G / 4× CPU, 412×915 @2.625)
| Capture | Theme | Perf | A11y | BP | SEO | LCP s | FCP s | TBT ms | CLS | Transfer KiB (LH) |
|---|---|---|---|---|---|---|---|---|---|---|
| C-WEV-101 | timeless-snapshot | 37 | 88 | 96 | 92 | 8.55 | 3.63 | 1,038 | 0.002 | 4,185 |
| C-WEV-102 | mildness | 32 | 82 | 100 | 92 | 20.86 | 4.63 | 1,303 | 0.001 | 4,246 |
| C-WEV-103 | visual-journey | 41 | 87 | 100 | 100 | 17.92 | 3.12 | 1,040 | 0.002 | 2,711 |
| C-WEV-104 | espresso | 42 | 82 | 79 | 92 | 16.89 | 3.50 | 914 | 0.002 | 2,488 |
| C-WEV-105 | photovit | 41 | 87 | 100 | 92 | 16.53 | 3.19 | 911 | 0.001 | 2,265 |
| C-WEV-106 | wayang | 39 | 84 | 100 | 100 | 37.32 | 3.99 | 925 | 0.032 | 9,605 |
| **Median (6)** | | **40** | **86** | 100 | 92 | **17.41** | 3.57 | **982** | 0.002 | **3,448** |

[OBSERVED C-WEV-101…106]. Time to Interactive 16.6–38.5 s (median 18.8 s). TBT sits near 1 s on every theme because the script payload is the same everywhere (§4.3).

### 4.3 After the visit (CDP, unthrottled, cold cache)
| Capture | CDP KiB | Images KiB | JS KiB | CSS KiB | Fonts KiB | Media KiB | Requests | DOM nodes | Lazy images |
|---|---|---|---|---|---|---|---|---|---|
| C-WEV-101 | 3,439 | 1,545 | 1,344 | 251 | 266 | 0 | 76 | 804 | 0 of 18 |
| C-WEV-102 | 4,817 | 2,946 | 1,331 | 219 | 295 | 0 | 64 | 558 | 0 of 19 |
| C-WEV-103 | 3,325 | 1,437 | 1,333 | 249 | 280 | 0 | 62 | 663 | 0 of 12 |
| C-WEV-104 | 3,010 | 1,121 | 1,349 | 248 | 262 | 0 | 68 | 634 | 0 of 18 |
| C-WEV-105 | 2,218 | 358 | 1,321 | 220 | 291 | 0 | 74 | 562 | 0 of 11 |
| C-WEV-106 | **9,583** | **7,671** | 1,333 | 246 | 305 | 0 | 75 | 762 | 0 of 49 |

[OBSERVED]. **JS ≈ 1.33 MB on every theme** (one shared bundle; Lighthouse counts ≈ 842 KB of it as unused, and Google Tag Manager alone is 188 KB). Images vary by theme (0.36–7.7 MB) and are never lazy-loaded. The MP3 is not fetched during a visit (0 KB media): not preloaded, playback not observed.

### 4.4 Guest experience as observed (structure only, no copy)
- **Cover:** one "Buka Undangan" control inside a dialog that has no accessible name (`aria-dialog-name` fails on all six). [OBSERVED]
- **After opening:** map navigation; "Simpan Tanggal" (save the date); livestream link (5/6); RSVP; gift sending + "Lihat Daftar Kado" (the registry list, Wegiftry); wishes; **"Download Template IG Story"** (a downloadable Instagram-story template, 4/6 in the first ten buttons); **"Tampilkan QR Checkin"** (the guest's personal QR pass; `qr` flag on all six); Swiper slide controls (104/105); a "wevitation" credit link (`watermark` flag on all six). [OBSERVED control labels and flags]
- **Forms:** wishes (name + message) and RSVP (a guest-count number, a hidden field and two submit buttons, read as attend / decline [INFERRED]); no "maybe" state seen. [OBSERVED]
- **Feature flags after opening:** calendar, countdown, gallery, rsvp, wishes, qr, watermark on 6/6; gift, livestream, love story on 5/6; WIB time labels on 4/6; health protocol on 2/6. [OBSERVED]
- **Audio / video:** one MP3 `<audio>` with a `#t=` start offset, no autoplay attribute, no loop; a YouTube iframe on C-WEV-101 (≈ 1 MB from YouTube on that load). Playback [UNKNOWN]. [OBSERVED elements]
- **Personalization:** the demos carry no guest parameter; per-guest names and QR codes are claimed for real invitations. [CLAIMED S-WEV-001]

### 4.5 Assets, fonts, third parties, accessibility, localization
- **Fonts:** one display/script face per theme (Mick Caster, Great Vibes, Meow Script, Coffee Town, Dancing Script, Gethuk Jawa) + one text face (Philosopher on three, Montserrat, Amarante, Poppins) + Font Awesome 5 + Bootstrap Icons: 262–305 KB; `font-display` issue on 3/6. Mick Caster, Coffee Town and Gethuk Jawa are not Google Fonts → licence [UNKNOWN]. [OBSERVED]
- **Third parties on the guest page:** Google Tag Manager + GA4 + DoubleClick stats; Cloudflare (Rocket Loader, speculation rules, RUM beacon); cdnjs, jsDelivr (≈ 146 KB), unpkg; first-party `cdn.`, `fonts.`, `app.wevitation.com`; an AWS S3 bucket in ap-southeast-1 **whose name says "dev"** serving demo media (101, 105, 106); a free public image host on C-WEV-101; YouTube. [OBSERVED]
- **Accessibility:** automated 82–88. `aria-dialog-name` and `link-name` fail on all six, `image-alt`, `button-name` and `aria-allowed-role` on four, `color-contrast` on one. A `prefers-reduced-motion` rule exists; zoom is allowed. [OBSERVED]
- **Localization:** `<html lang="en">` on Indonesian content (all six), so screen readers and hyphenation use the wrong language; WIB labels on 4/6; no language switch seen. [OBSERVED]
- **SEO / sharing:** Lighthouse SEO 92–100; `og:image` present but no `og:title` / `og:description` (link previews fall back to the page title). [OBSERVED]

### 4.6 Against our own guest page (same protocol)
| | Wevitation (median of 6 themes) | Invitesion C-INV-005 (one run; local production build, no middleware) |
|---|---|---|
| Perf / LCP / TBT / CLS (Lighthouse lab) | 40 / 17.41 s / 982 ms / 0.002 | 93 / 2.62 s / 209 ms / 0 |
| INP | not measured | not measured |
| Transfer at cold load (Lighthouse) | 3,448 KiB | 321 KiB |
| Accessibility (automated) | 86 | 96 |
| Cover gate, countdown, add to calendar, QR pass, IG-story template, gift registry, WIB labels | present | F-003, F-005, F-012, F-026, F-027 missing; F-023 partial; F-033 broken |

**Scope of this comparison (s08 correction, brief 05 Task C).** Same lab protocol on both sides (Lighthouse 12.8.2 mobile, simulated Slow 4G + 4× CPU, cold load); Wevitation = median of six themes, ours = one run of C-INV-005. On those recorded measurements our page transfers **≈ 10.7× less at load** (321 vs 3,448 KiB) and scores better on Perf (93 vs 40), LCP (2.62 vs 17.41 s) and TBT (209 vs 982 ms); CLS is 0 vs 0.002, both well inside the 0.1 "good" band. **INP was not measured** (Lighthouse navigation mode cannot measure it, and TBT is only a lab proxy), so nothing here supports "faster on every Core Web Vital" or any field-experience claim. C-INV-005 is a local production build measured **without `middleware.ts`**, because placeholder Clerk keys made the middleware hang (D-012, P-INV-010): it does not establish real-key authentication, middleware, CSP, locale-cookie or full production behaviour. Wevitation's lead is guest-side features and day-of operations, not lab page weight. [OBSERVED lab runs] / interpretation [INFERRED, medium]

## 5. Tech fingerprint
| Layer | Finding | Confidence |
|---|---|---|
| Application | Laravel + Livewire on guest pages (`/livewire/livewire.js`) | Livewire [OBSERVED]; Laravel [INFERRED, high] |
| Front end | jQuery, Bootstrap, AOS, animate.css (5/6), Swiper (slide controls on 104/105); Owl Carousel on the homepage (C-WEV-001) | [OBSERVED] |
| Edge | Cloudflare proxy, Rocket Loader, speculation rules, RUM; homepage edge-cached (`s-maxage=900`, `stale-while-revalidate=86400`); HTTP/3 | [OBSERVED S-WEV-001, captures] |
| Assets | `cdn.` / `fonts.` / `app.wevitation.com`; S3 ap-southeast-1 bucket named as a dev bucket for demo media; one free public image host | [OBSERVED] |
| Analytics | GTM + GA4 + DoubleClick on guest pages; Cloudflare RUM | [OBSERVED] |
| Mobile | Android `com.wevitation.mobile` (Play, AppGallery), PWA manifest, no iOS app | [OBSERVED S-WEV-001/004] |
| Structured data | schema.org WebSite + Organization (homepage, pricing), Organization + WebPage + Service with `areaServed` (guest reception) | [OBSERVED S-WEV-001/003] |

## 6. Public API surface
See `api-observed.md`: a read-only visit loads the Livewire runtime but triggers no Livewire round-trip; no JSON API call was observed; every write path (RSVP, wishes, gifts, QR check-in) is [UNKNOWN] under R1.

## 7. Mobile app
- **Android:** 4.4★ from 142 reviews, 50k+ downloads, updated 9 Oct 2025; described as the mobile version plus a QR scanner for guest reception; the developer-declared data-safety section says no data is collected or shared, while the app manages accounts and guest lists (accuracy of the declaration [UNKNOWN]); the developer account is in an individual's name. [OBSERVED S-WEV-004]
- **Huawei AppGallery** listing linked from the homepage; **iPhone** users are sent to the browser; a PWA install is offered. [OBSERVED S-WEV-001]
- No decompilation (D-013: only redistributable APKs).

## 8. Growth and SEO
- Homepage C-WEV-001: Lighthouse Perf 80, SEO 100, 60 requests / 882 KB; schema.org markup; blog with planning content (auspicious 2027 dates, pre-marriage questions, gift etiquette, QR check-in, vendor deposits) and feature articles (AI wishes analysis). [OBSERVED C-WEV-001, S-WEV-001]
- **Sustainability framing:** paper, CO₂ and invitation counters with a methodology modal. [OBSERVED S-WEV-001]
- **Viral surfaces on every invitation:** the "wevitation" credit link, the IG-story template, the QR pass. A 2022 review says Premium cannot remove the credit; branding control is sold only in the Mitra tiers. [OBSERVED S-WEV-002, captures] / [CLAIMED S-WEV-004]
- **Channels:** resellers (Mitra packages), authorized partners for day-of services, events beyond weddings (FAQ: birthdays, reunions, corporate). [OBSERVED / CLAIMED S-WEV-001/002/003]

## 9. Monetization and pricing psychology
- **One-time payment**, "aktif selamanya", no monthly or yearly fee; the free plan is a 14-day trial rather than a lasting freemium tier. [OBSERVED S-WEV-002]
- **Permanent anchors:** every paid tier shows a struck-through list price (31–56 % "OFF"); Premium carries "Paling Favorit". [OBSERVED]
- **Volume ladder:** Rp69K → Rp49.5K → Rp48K → Rp45.5K → ≈ Rp43.5K per invitation (Premium, Business 2, Enterprise 5, Silver 11, Gold 23); text branding from Silver, logo branding + a points programme at Gold. [OBSERVED]
- **Bundling:** Wegiftry Premium included with Wevitation Premium; planner and AI as upgrade justification. [OBSERVED S-WEV-005, CLAIMED S-WEV-001]
- **High-ticket services:** Guest Reception Rp1.69 M / Rp2.99 M / Rp4.99 M per event (≈ 24–72× the Premium price), introductory pricing in Bandung/Cimahi. Day-of operations are plausibly the larger revenue line per customer. [OBSERVED S-WEV-003] / [INFERRED, medium]
- Minor inconsistency: Business shows "50.5 % OFF" with extra rows on the homepage and "50 % OFF" without them on `/paket-harga`. [OBSERVED]

## 10. Strengths, weaknesses, complaints
- **Strengths:** ecosystem breadth (registry, planner, AI, day-of ops) on top of a cheap one-time invitation; one skeleton means every theme ships the full feature set; guest-side QR pass and IG-story template; reception screen and tablets as a service; Android scanner app; reseller tiers. [OBSERVED]
- **Weaknesses (measured):** median Perf 40, LCP 17.4 s, TBT ≈ 1 s; 1.33 MB of JS on every guest page incl. a tag manager; no lazy-loading (up to 49 images / 7.7 MB); `lang="en"` on Indonesian pages; unnamed dialog and links; production media from a dev-named bucket and a free image host; no iOS app. [OBSERVED]
- **Complaints (S-WEV-004, paraphrased, no names):** few themes and songs; YouTube-imported music does not play when the invitation is opened inside Instagram; the "powered by" credit cannot be removed on Premium; wishes cannot be limited to the hosts. [CLAIMED]

## 11. Patterns to learn from (principle level, no visual cloning)
1. **Fixed section contract, many skins:** five blocks with identical features let a catalogue grow quickly. We should keep one section contract per template family, with per-template art (F-036) and a per-template weight budget so a single theme cannot reach 9.6 MB.
2. **Guest-side take-aways:** a QR pass and a share-ready IG-story asset on the guest page turn guests into distribution (F-026, F-027).
3. **Day-of operations built on the guest list:** reception screen, QR and manual check-in, seating, attendance report, with partners for coverage (F-055, F-057, F-042).
4. **Registry with reservation** against duplicate gifts, joined by account rather than a separate signup (F-023).
5. **AI applied to what guests send** (wishes insight) creates value after the event (F-088).
6. **Branding as the reseller lever:** credit removal and logo placement only in partner tiers (F-068, F-079).
- **Avoid:** one global JS bundle plus a tag manager on guest pages; no lazy-loading; a wrong `lang`; music through YouTube embeds (breaks in Instagram's in-app browser per a review); production media in development storage.

## 12. Mapping to our codebase (F-IDs from `01-codebase-audit/feature-inventory.csv`)
| F-ID | Ours | Wevitation evidence | Implication |
|---|---|---|---|
| F-003 Cover gate | missing | single-control gate, unnamed dialog | build it with an accessible name and focus handling |
| F-004 Music + unlock | config-only | MP3 with `#t=` start offset, not preloaded | support a start offset; never preload audio before the tap |
| F-005 Countdown / F-012 Add to calendar | missing / missing | present on 6/6 ("Simpan Tanggal") | table stakes |
| F-019 Wishes / F-020 moderation | full / config-only | wishes on 6/6; reviewers want host-only visibility | expose a visibility setting |
| F-021 Digital gift / F-023 Registry | partial / partial | cashless gifts + Wegiftry registry with reservation | add reservation to the registry |
| F-026 QR pass / F-055 QR scanner / F-057 Kiosk | missing / missing / missing | QR pass on the guest page, Android scanner, reception screen | one guest-pass data model serves all three |
| F-027 Share to IG story | missing | downloadable story template | generate a per-invitation story image |
| F-033 Timezone labels | broken | WIB labels on 4/6 | fix before claiming parity |
| F-034 Guest UI language | missing | `lang="en"` on Indonesian pages | set `lang` correctly even before an ID/EN switch |
| F-042 Seating display | config-only | seating management in the reception packages | candidate for the day-of bundle |
| F-068 Watermark removal / F-079 Reseller workspace | missing / missing | branding only in Mitra tiers | pricing lever for a partner plan |
| F-073 Planner checklist | full | budget, vendors, to-do, timeline | ours is internal; consider host-facing |
| F-085 One-off pricing (Rp149k / Rp299k) | full | Rp69K one-time, ≈ Rp43.5K in volume | we are priced 2–4× higher: the gap must be justified by quality and guest operations |
| F-088 AI assist | missing | assistant, generator, wishes analysis | wishes insight is the most defensible AI feature |
| F-097 Accessibility baseline | partial | 82–88, same failures on every theme | our 96 is a differentiator to keep |
