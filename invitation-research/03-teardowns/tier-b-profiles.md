<!-- SUMMARY (first 7 lines — greppable) -->
# tier-b-profiles.md — one-page profiles of the 21 Tier-B competitors (shortlist §4)
> WHAT: Positioning, pricing, product, technology, strengths, weaknesses and lessons per Tier-B vendor from public pages read on 2026-11-03, plus the vendors that could not be profiled and why.
> STATUS: v2, session 12 (2026-11-04); s23r (2026-11-06): Sonett profiled from a rendered read (`../_tools/discovery/rendered-read.py`, S-SNT-003; facts `../raw/_discovery/rendered-reads-2026-11-06-s23r.jsonl`), thin → partial (no public prices); counts unchanged. **13 substantive** (7 Indonesian, 6 international), 4 thin or partial, 4 blocked. s12 changes, after the robots applicability audit (D-030): Harikita read and substantive; Eqxiu re-requested once with content negotiation and substantive; Bridestory gained two pages (still no prices); WebNikah re-read (no further pages reachable); Sonett readable but its static HTML is an empty client-rendered shell; WedMeGood answered HTTP 403 (blocked, no fallback); Canva stays restricted (legacy group of uncertain purpose). Facts: `../raw/_discovery/profile-reads-2026-11-03.jsonl`, `../raw/_discovery/profile-reads-2026-11-04.jsonl`; targets: `../raw/_discovery/profile-targets-2026-11-0{3,4}*.tsv`.
> OWNER: Oracle (research)
> DEPS: ../02-competitor-discovery/{shortlist.md,competitor-longlist.csv}, ../_tools/discovery/profile-reads.py, ../_evidence-index.md (session 10), ../01-codebase-audit/feature-inventory.csv
> GREP: tier b, profile, harikita, undangan virtual, janiva, sannubari, sangmempelai, punyaacara, wedew, zola, the knot, evite, invitee, biihappy, sonett, rendered read
> UPDATED: 2026-11-06

**Method.** `_tools/discovery/profile-reads.py`: Android UA, plain GET, robots.txt first (RFC 9309 + D-022; AI-agent applicability D-030 since s12, D-026 before; `../02-competitor-discovery/robots-applicability-s12.md`), ≥ 3 s between requests to one origin, homepage plus at most two linked pricing / features / catalog pages, never demo, preview or customer pages, no forms, no login. A 401/403/429/503 or a challenge stops the origin with no fallback. Page text stayed private; only facts are committed. Evidence level of every profile below: **C** (public marketing and pricing pages; no guest-page measurement). Prices are IDR unless marked and were read once (permanence of discounts [UNKNOWN]).

**Privacy.** No customer, testimonial or demo-couple name is recorded. WebNikah's homepage lists customers' couple names with event dates; that page text was deleted after the non-identifying facts below were taken.

## Coverage
| Code | Vendor | Country | Status | Evidence |
|---|---|---|---|---|
| UVR | Undangan Virtual | ID | substantive | S-UVR-001 |
| JNV | Janiva | ID | substantive | S-JNV-001 |
| SAN | Sannubari | ID | substantive | S-SAN-001 |
| SMP | sangmempelai.id | ID | substantive | S-SMP-001 |
| PAC | PunyaAcara | ID | substantive | S-PAC-001 |
| WDW | Wedew | ID | substantive | S-WDW-001 |
| WNK | WebNikah | ID | thin (homepage only; re-read s12, no further page reachable from static HTML) | S-WNK-001, S-WNK-002 |
| BRS | Bridestory | ID | partial (s12: SayYes RSVP product page + about page; no prices in static HTML) | S-BRS-001, S-BRS-002 |
| MMO | MEMO Wedding | ID | thin (site "Coming Soon" with no links: nothing further exists to read; app id only) | S-MMO-001 |
| HRK | Harikita | ID | **substantive (s12)**; blocked s10–s11 under D-026, readable under D-030 | S-HRK-001…003 |
| INE | Invitee | MY | substantive | S-INE-001 |
| ZOL | Zola | US | substantive | S-ZOL-001, S-ZOL-002 |
| TKN | The Knot | US | substantive | S-TKN-001, S-TKN-002 |
| EVT | Evite | US | substantive | S-EVT-001, S-EVT-002 |
| BHP | Biihappy | VN | substantive | S-BHP-001, S-BHP-002 |
| SNT | Sonett | KR | **partial (s23r)**: rendered read of the homepage (2,065 characters; the static HTML had 25); product and positioning, no public prices | S-SNT-001…003 |
| WMG | WedMeGood | IN | **blocked** (HTTP 403 to the first s12 request; robots no longer the reason. s26: no Wikipedia article; G2 and Product Hunt refuse our reader) | S-WMG-001, S-WMG-002, S-WMG-003 |
| GRV | Greenvelope | US | **blocked** (HTTP 403 on robots.txt and homepage. s26: no Wikipedia article; G2 refused our reader before its page was requested) | S-GRV-001, S-GRV-002 |
| MTD | Minted | US | **blocked** (HTTP 403). s26 third-party facts only: Wikipedia describes a premium design brand selling independent artists' stationery through crowdsourced challenges; nothing on digital invitations, prices or RSVP, so still counted as blocked | S-MTD-001, S-MTD-002 |
| CNV | Canva invitations | AU | **blocked** (D-030: site-written legacy-token group of undocumented purpose, restriction kept; HTTP 403 earlier). s26 third-party facts only: Wikipedia reports a freemium design platform with print services and ≈ 31 M paid users at end-2025; nothing on invitation features or prices, so still counted as blocked | S-CNV-001, S-CNV-002, S-CNV-004 |
| EQX | Eqxiu 易企秀 | CN | **substantive (s12)**; one re-request with `Accept-Encoding: gzip, deflate` decoded the page | S-EQX-001, S-EQX-002 |

**Counts toward RQ-COMP-01 (`../_handoff/acceptance-matrix.md`):** Indonesian substantive profiles = 10 Tier-A dossiers (Sitemu v1 written s12) + 7 here = **17**; **16** without the provisional Enviory evidence (D-031; the Enviory dossier itself rests mostly on marketing reads, but it is counted out to stay conservative). International = 5 Tier-A dossiers + 6 here = **11**. Both minimums (≥ 12, ≥ 10) are met either way. Required Tier-B one-pagers: **13 / 21 substantive** (RQ-COMP-04 PARTIAL). Of the other eight:
- 4 are blocked by access controls (WMG, GRV, MTD HTTP 403) or by a restriction of uncertain applicability (CNV).
- 2 have nothing further to read (MMO placeholder, WNK without reachable pages).
- 2 have no visible prices (BRS; SNT, partial since its s23r rendered read).

---

## Indonesia

### UVR — Undangan Virtual (undanganvirtual.com)
- **Positioning:** syar'i and modern invitations "untuk semua acara", filled in by the customer from a phone. [OBSERVED S-UVR-001]
- **Pricing:** the package sets the **guest-link quota**, never the features: 500 guests **79,000**, 1,000 guests **99,000** ("Terlaris"), up to 100,000 guests **149,000**; all themes on every package, no monthly fee. [OBSERVED]
- **Funnel:** pick theme → choose a quota package and pay (QRIS, virtual account, e-wallet) → a **6-character token** appears after payment and creates the account → fill in from the phone → send personal links. Pay-first, account-second. [OBSERVED]
- **Catalog:** 56 themes (wedding & engagement 39, aqiqah & tasyakuran 3, khitanan 2, birthday 4, office & business 3, general 5); wedding styles syar'i, minimalist, floral, modern, elegant & luxury, rustic, adat; theme codes such as `RST-…`, `LUX-…`. Events include school and campus activities and an optional **donation section** with a target amount, QRIS and account. [OBSERVED]
- **Features:** music, RSVP, guest book of wishes, countdown, calendar, gallery, gifts, maps; reseller programme. [OBSERVED keywords + nav]
- **Tech:** Nuxt, GA4/GTM, WhatsApp CTA. [OBSERVED]
- **Lesson:** quota-based pricing with identical features is the clearest packaging in the set; the token step removes signup before payment. **Counter:** our per-invitation price already includes unlimited guests (F-085); publish the "no guest limit" fact next to the price (B-002 copy).

### JNV — Janiva (janiva.id)
- **Positioning:** "build first, pay when you like the result": create and edit yourself, **7-day free trial without a card**, fill once and **switch themes freely**. [OBSERVED S-JNV-001]
- **Pricing (one-time, 6 months active, all features in every theme):** Klasik **79,000** (7 themes), Istimewa **149,000** (4), Sinematik **249,000** (3); lifetime activation **+100,000**. [OBSERVED]
- **Catalog:** 14 themes, story-led regional adat themes (Minangkabau, Javanese) with scene-by-scene cinematic openers, a khitan theme, and one theme labelled "Ala Ghibli". [OBSERVED]
- **Features:** guest name on the opening, photos, countdown with save-to-calendar, maps per event, love story, digital envelope, RSVP, wishes; livestream, QR check-in and custom-domain keywords. [OBSERVED/keywords]
- **Tech:** Next.js, Cloudflare, GTM, Midtrans marker on the theme page. [OBSERVED]
- **Strength / weakness:** the most generous try-before-pay in the set; a theme named after a film studio's style is an IP risk we must not repeat. [OBSERVED] / risk [INFERRED, medium]
- **Lesson:** pricing by art direction (motion depth) instead of features matches our tier model. **Counter:** B-040 (reverse trial) and B-036 (theme switching within a tier); originality gate in the harness (`../09-masterplan/08-template-system-and-harness.md` §4).

### SAN — Sannubari (sannubari.com)
- **Positioning:** done-for-you invitation and greeting-video studio. [OBSERVED S-SAN-001]
- **Pricing (price page dated 2026-10-23):** Reguler **100,000** and Premium **200,000** (RSVP, maps, gallery, up to 2 revisions, ≤ 3×24 h after complete data); Express 1×24 h **+100,000**; wedding + express bundle **300,000**; video greeting **100,000** (≤ 30 s MP4); custom colour and font **+50,000**; custom `.com` domain **+300,000**. [OBSERVED]
- **Product lines:** wedding, aqiqah, baby shower, digital birth card, digital guest book, romantic and birthday video greetings. [OBSERVED nav]
- **Tech:** WordPress + Elementor, jQuery, Lottie, Swiper, Microsoft Clarity, GA4/GTM, Meta Pixel. robots.txt explicitly **allows** AI search and citation crawlers and blocks training-only crawlers. [OBSERVED]
- **Lesson:** turnaround time is the product (3×24 h vs express 1×24 h). **Counter:** our self-serve publish is immediate; assisted setup stays P2 (G-054).

### SMP — sangmempelai.id
- **Positioning:** "Partner Undangan Pernikahan Digital"; web, video and Instagram-filter invitations sold with heavy anchors. [OBSERVED S-SMP-001]
- **Pricing:** web invitation **49,000** shown against 350,000 ("Hemat 86 %"); video invitation **75,000** (±60 s) against 100,000; web + video **99,000** against 450,000; two web invitations **77,000**; web + `.id` domain 309,000; Instagram filter 25,000; `.my.id` domain upgrade **30,000**. [OBSERVED]
- **Inclusions:** digital guest book, unlimited guest names, RSVP, **QR check-in**, website active "selamanya (selama website kami aktif)" (forever, as long as the vendor's site runs). [OBSERVED]
- **Catalog:** 51 video themes (art and regional adat series). [OBSERVED]
- **Tech:** jQuery + Bootstrap on a purchased multipurpose HTML template (leftover demo menu items for agencies and SaaS), Tawk chat, GA4/GTM, Meta Pixel; `lang="zxx"` on Indonesian pages. [OBSERVED] / template origin [INFERRED, high]
- **Lesson / avoid:** forever activation and QR check-in at 49k set the floor for "value"; 78–86 % anchors and a wrong `lang` are what we avoid (B-002, B-016 a11y).

### PAC — PunyaAcara (punyaacara.id)
- **Positioning:** self-serve from a phone for weddings, khitanan, aqiqah and birthdays; free start, "revisi sepuasnya". [OBSERVED S-PAC-001]
- **Pricing:** per template, one-time, **from 25,000** (a photo-free Islamic minimal theme); several templates show **50,000** next to **279,000** (direction of the strikethrough not determinable from text); RSVP included. [OBSERVED]
- **Catalog:** 18 wedding templates with regional tags (Aceh, Bali, Batak, Jawa, Sunda), Islam, minimalist, social-media-styled, photo-free. A free "Wedding Planner" was announced as new. [OBSERVED]
- **Tech:** Alpine.js, Midtrans, GA4/GTM, Meta Pixel (Laravel per the 2026-10-29 probe). [OBSERVED]
- **Lesson:** regional and photo-free themes at the lowest price point address modest and conservative families. **Counter:** niche roadmap (`../06-gap-analysis/template-catalog-roadmap.md`) already lists adat and photo-free variants.

### WDW — Wedew (wedew.id)
- **Positioning:** "Platform Pernikahan Digital": e-invitations **sent automatically** (WhatsApp, e-mail) plus a guest-reception app. [OBSERVED S-WDW-001]
- **Pricing:** **Starter free forever** with every core feature (instant creation, unlimited edits, guest management, RSVP and comments, countdown, gallery, love story, maps, digital guest book, autoplay music, active forever); Lite **50k** (premium themes); Premium **125k**; Intimate **250k** (100 guests, 100 WhatsApp sends, 1 reception app); Celebrate **500k** (250 / 500 / 2); Ultimate **1,000k** (500 / 1,000 / 4, `.com` domain). Add-ons: +50 guests 25k, +50 WhatsApp 40k, +50 e-mails 10k, +1 reception app 100k, custom domain 200k; staffed services from 2,000k (assistant, equipment, usher, livestream). [OBSERVED]
- **Premium features:** cashless angpao, gift registry, session scheduling per group, custom music, custom **greeting screen ("Layar Sapa")**, **check-in and check-out**, 100 MB storage, livestream, comment policy. [OBSERVED]
- **Apps:** Android `id.wedew.mobile` and `id.wedew.guestbook`, iOS `id1523036734`. [OBSERVED links]
- **Tech:** Next.js, Sentry, GTM, Meta Pixel. [OBSERVED]
- **Lesson:** metering the costly parts (messages, reception devices) while giving the page away. **Counter:** we never meter guests; WhatsApp stays `wa.me` (B-018) until an official API contract exists (`../09-masterplan/10-data-privacy-security-payments.md` §5).

### WNK — WebNikah (thin)
- Free wedding-website builder. Claims **252,582** couples on 2026-11-03 and **252,589** on 2026-11-04, a live counter. 100+ themes in Basic and Premium, each with a demo. [OBSERVED/CLAIMED S-WNK-001, S-WNK-002]
- A vendor directory across about 23 service categories (catering to honeymoon), "Jadi Reseller" and "Jadi Vendor" entries, FAQ and testimonial pages. jQuery + Bootstrap, GA4 / GTM. [OBSERVED S-WNK-002]
- No prices on the homepage. Its links are not reachable from static HTML, so no further page was read.
- The homepage publicly lists recent customers' couple names, event dates and invitation subdomains. These are not recorded. It is a privacy weakness shared with IDI, SMO and IVT.

### BRS — Bridestory (partial)
- **Vendor marketplace and inspiration directory** ("help wedding vendors connect with engaged couples"). [OBSERVED S-BRS-002 about page]
- Its invitation product, **SayYes RSVP**, is an end-to-end e-invitation service [OBSERVED S-BRS-002]:
  - template invitations you build yourself from a form;
  - custom-design invitations made by its designers (music and video only in custom);
  - a managed **RSVP service** that includes table numbers for seated events;
  - a **QR check-in service** staffed on the day;
  - seating management in the dashboard, with admin help;
  - custom RSVP questions, asked once per invitation for standing events and **once per attending guest for seated events**.
- Next.js, Sentry, GTM; Android app `com.bridestory.user`. [OBSERVED]
- A "Daftar Harga" (price list) section exists but has no prices in static HTML [UNKNOWN].
- **Lesson:** the per-guest versus per-invitation question model fits seated Indonesian receptions. **Counter:** RSVP custom questions (F-017 within G-031) and seating (G-045) stay P2. Staffed check-in is a service, not our product.

### MMO — MEMO Wedding (thin)
`memowedding.com` serves a "Coming Soon" page with no links, so there is nothing more to read on the site. It links the Android app `com.memowedding.undanganpernikahandigital` (100K+ installs per the 2026-10-29 Play read in the longlist). Store listing not re-read. [OBSERVED S-MMO-001] / installs [ESTIMATE longlist]

### HRK — Harikita (harikita.id)
- **Positioning:** "Undangan digital semua acara" (digital invitations for every occasion): weddings, birthdays, khitanan / aqiqah, tasyakuran and general events, under "Dibuat untuk dirayakan bersama" (made to be celebrated together). [OBSERVED S-HRK-002]
- **Pricing** [OBSERVED S-HRK-002, S-HRK-003]:
  - **Basic, free** to make and publish: 10 free designs, up to 30 guests and 5 gallery photos, 50 WhatsApp messages a day, studio, background music, basic RSVP, 5 AI edits, public link carrying the Harikita label.
  - **Premium Rp 155,000 one-time:** every design, unlimited guests and photos, 60 AI edits a day, no label, bulk WhatsApp sending, custom path, music and love story, own domain, budget / vendors / tasks / seating, MP4 video, story and feed exports, WhatsApp stickers, analytics and CSV export.
  - **Single design Rp 60,000**, one-time for one invitation.
  - **Reseller plans:** Starter Rp 199,000 a month or 1,999,000 a year (10 active invitations); Pro Rp 499,000 or 4,999,000 (30, own invitation address, client domain per invitation); Elite Rp 999,000 or 9,999,000 (100, shop-brand domain). Finished invitations can be archived to free slots.
- **Product** [OBSERVED S-HRK-002, S-HRK-003]:
  - **129 designs** (82 wedding), with 3D elements, cartoon couples using the couple's own photo heads, and layered motion.
  - A "Studio" with direct manipulation on six "atur sendiri" themes: click text, buttons, cards or photos to change font, size, colour and position; drag; add text, lines and 3D ornaments; reorder sections.
  - **"Minta AI":** type an instruction such as "make the cover sky light blue" or "write an Islamic opening", and the invitation changes. Nothing is saved until Save, with undo.
  - Guest list, personal WhatsApp links, RSVP and check-in. The link stays the same after edits, and guests need no app.
- **Design pages:** each design has a short premise (for example, a small-cinema premiere with a curtain opening and guest-named tickets), style tags (cartoon, modern, dark) and a per-design FAQ ("too playful for a wedding?"). No personal data. [OBSERVED S-HRK-003]
- **Claims:** 200+ users, 90+ published invitations, 1,000+ guests invited, 11,000+ opens. These are small, early-stage numbers stated plainly. [CLAIMED]
- **Tech:** Next.js, Cloudflare (managed robots.txt). [OBSERVED]
- **Lesson:** the strongest Indonesian example of a design-led product:
  - named, premise-driven designs across occasions;
  - direct manipulation limited to a few "free-style" designs, which shows the same tension between freedom and design integrity that our content contract resolves;
  - an instruction box that edits and writes copy.
  **Counter:** design families named and described by premise, not numbered (harness workstream). Editing stays inside the content contract. AI copy help could be a later P2, with **no generated religious text** (approved corpus only, ADR-O04).

---

## International

### INE — Invitee (Malaysia) — the closest cultural twin
- **Positioning:** digital invitations "built for Malaysian couples" from akad nikah to bersanding, tea ceremony and reception. [OBSERVED S-INE-001]
- **Pricing (one-time per wedding, valid one year):** Free **RM 0** (1 event, EN + BM, QR code and share link, add-to-calendar, Waze / Google Maps, 3 family contacts); Lite **RM 29** (2 events, countdown + music, theme swapping, no branding); Plus **RM 59** (3 events, **4 languages incl. Chinese and Tamil**, RSVP + digital guest book, own music); Pro **RM 99** (5 events, 6-photo gallery + playlist, invitation video and livestream). [OBSERVED]
- **Features:** themes for Malay, Chinese, Indian and Islamic weddings; bulk guest import, grouping by side, personal links via WhatsApp; **QR check-in** with seating; **e-Gifts through DuitNow QR** and a gift registry; multiple events on one invitation; partner programme. Claims: 10,000+ couples, 500k invites sent, 4.9★, 350 themes. [OBSERVED / CLAIMED]
- **Tech:** custom site, TikTok pixel. [OBSERVED]
- **Lesson:** packaging by **number of events and languages** fits multi-ceremony families exactly; a national QR standard for gifts (DuitNow ≈ QRIS). **Counter:** multi-event schedule exists (F-010); gift block with the host's own QRIS image (B-026, idea I-03); guest UI language (G-018) moves up if regional languages matter.

### ZOL — Zola (US)
- **Positioning:** free wedding websites tied to registry, guest list, RSVP tracking, budget, seating chart, vendors and paper. [OBSERVED S-ZOL-001, S-ZOL-002]
- **Website product:** "over 600 templates", custom URLs and **custom domains**, **password protection**, travel and accommodation sections, gallery, RSVPs; the website-designs gallery is disallowed by robots.txt and was not read. [OBSERVED]
- **Paper:** save-the-date cards listed from **$0.59 to $3.09** per card. [OBSERVED]
- **Tech:** Next.js, React, Segment, GA4/GTM, Stripe. [OBSERVED]
- **Lesson:** the free website is the funnel for registry and paper revenue. **Counter:** our money is the invitation itself; password protection (G-047) and custom domains (G-048) stay P2.

### TKN — The Knot (US)
- **Positioning:** free planning platform (checklist, registry with **no-fee cash funds**, free wedding website with RSVPs, invitations and paper with **3 free paper samples**) monetised through a marketplace of ~175,000 vendors; claims 30 million couples and 4 million reviews. [OBSERVED/CLAIMED S-TKN-001, S-TKN-002]
- **Website product:** design families (floral, botanical, rustic, classic, modern, themed), custom RSVP page, FAQ builder with common guest questions, **RSVP reminder message templates**, registry links. [OBSERVED S-TKN-002]
- **App:** Android `com.xogrp.planner`. **Tech:** Next.js / React, Segment, GA4/GTM. [OBSERVED]
- **Lesson:** a guest FAQ (dress code, directions) and reminder templates reduce host messaging. **Counter:** render dress code and agenda (B-029); reminder lists (B-034).

### EVT — Evite (US)
- **Positioning:** online invitations, event pages and greeting cards for every occasion; new "upload your own design". [OBSERVED S-EVT-001]
- **Pricing:** free invitations plus **Evite Pro: unlimited premium invitations and greeting cards for $249.99 per year** ("average savings of $380/yr" claimed). [OBSERVED S-EVT-002 / CLAIMED]
- **Features page:** RSVP tracking, guest messaging, host tools; claims events up to 2,500 guests. [OBSERVED/CLAIMED]
- **Tech:** Webflow marketing pages, jQuery, GSAP, Hotjar, Stripe, PayPal, Cloudflare; Android app `com.evite`. [OBSERVED]
- **Lesson:** a subscription only makes sense for hosts of many events (planners, resellers). **Counter:** keep one-time pricing for families; a reseller credit model (G-052) is the analogue for repeat hosts.

### BHP — Biihappy (Vietnam)
- **Positioning:** a wedding community with tools: **iWedding** (free online wedding cards and a personal wedding website on a subdomain), invitePro (event invitation design), M-Invite (mobile invitations with RSVP and map), a free wedding-logo maker, checklist and budget tools, and community content. [OBSERVED S-BHP-001, S-BHP-002]
- **iWedding features:** RSVP, **wedding gifts by QR**, sharing via Zalo, Messenger and QR code, free theme switching, wishes book, love story, album, events with maps, guest-list management; a pricing page exists but was not read. [OBSERVED]
- **Tech:** Laravel (2026-10-29 probe). [OBSERVED longlist]
- **Lesson:** share channels follow the local messenger (Zalo there, WhatsApp here) and gifts by national QR. **Counter:** WhatsApp-first sharing with OG cards (B-010 done, B-018).

### SNT — Sonett (sonett.kr, Korea; partial since s23r: product and positioning, no public prices)
- **Reads:** the s12 static read returned a client-rendered shell with 25 characters of visible text in 2,915 bytes (Kakao SDK, Cloudflare) [OBSERVED S-SNT-002]. *(s13 correction: this line said "77-character"; the committed record says 25.)* **s23r rendered read** (2026-11-06 13:11Z, `_tools/discovery/rendered-read.py`): robots.txt 200 (171 lines; `anthropic-ai` / `Claude-Web` only inside the Cloudflare-managed training section, recorded and not binding under D-030), then one navigation of the homepage in the capture browser: 200, no redirect, no challenge, a rendered DOM of 38.6 KB with **2,065 characters** of visible text; 13 first-party and 4 third-party requests (Google Fonts, Cloudflare Insights, Kakao CDN). One page, no interaction. No challenge occurred at either read, so the rendered read is not a fallback route. [OBSERVED S-SNT-003]
- **Positioning:** a Korean mobile wedding-invitation builder sold on speed: make it in minutes and share it through KakaoTalk. Weddings only on the homepage. [OBSERVED S-SNT-003]
- **Pricing:** none on the homepage and no pricing page linked from it [UNKNOWN].
- **Product** [CLAIMED S-SNT-003, paraphrased]:
  - Composition instead of fixed templates: 15 main-screen styles × 12 theme colours, with the photo frame shape, a background effect (petals, snow, stars) and an opening animation chosen separately; ready-made templates as a shortcut.
  - Three steps: pick a design; fill in names, date, venue, photos and greeting with a live preview; save to get a unique address and share by KakaoTalk or link. Edits are unlimited and apply on save.
  - **After the wedding the page turns into an anniversary page by itself, and bank accounts and RSVP answers are hidden automatically.**
  - **Personal links whose greeting changes with the guest's name and relationship group** (family, friends, colleagues).
  - A vertical scroll by default, or a horizontal mode read page by page.
  - A live gallery where guests upload their own photos on the day, beside a photo gallery (slides or grid).
  - RSVP with headcount and meal choice in a host dashboard; a password-managed guestbook; a timeline of the day; an "interview" section for the couple; Kakao Map directions; KakaoTalk sharing with QR code and link copy; gift accounts with copy-to-transfer; Korean, English and Japanese; background music.
  - Sections linked from the homepage: templates, events / notices, reviews, guide, contact, a board, management and the editor; support through a KakaoTalk open chat.
- **Technology:** client-rendered (the static HTML carries no content), Cloudflare in front, Kakao JavaScript SDK, Google Fonts; framework [UNKNOWN] (no marker in the rendered DOM). [OBSERVED S-SNT-003]
- **Lessons:** (1) **Withdraw sensitive details after the event.** Our expired state closes responses (`readOnly`, `lib/invitation/public.ts`); whether gift accounts and RSVP answers should also leave the page after the event is a product question this read raises (UU PDP minimisation). (2) **Greeting by relationship group:** Invitesion already stores a guest `category` (`lib/db/schema.ts`) that the guest page does not use. (3) Style × colour composition is the same axis as our design families × palettes (B-030 × B-016). (4) Horizontal page mode and a guest-uploaded live gallery are features we do not have. Evidence level C (marketing page; no guest-page measurement). Korean format lessons are also covered by Barunson (`barunson/dossier.md`).

### WMG — WedMeGood (blocked) · CNV — Canva (blocked)
- **WedMeGood:** readable by robots under D-030, but the first s12 request answered **HTTP 403**. The origin is stopped with no fallback. [OBSERVED S-WMG-002]
- **Canva:** its site-written group (GPTBot, ClaudeBot, CCBot, Applebot-Extended, `anthropic-ai`, `Claude-Web`: `Disallow: /`, `Allow: /create/`) has no documented purpose, so D-030 keeps the restriction and no request was made. Training intent is likely [INFERRED from the grouping]. [OBSERVED S-CNV-002]

### GRV — Greenvelope (blocked) · MTD — Minted (blocked)
HTTP 403 to the first request (Greenvelope also on robots.txt): origin stopped, no fallback route (`_rea-playbook.md` §5). Only the 2026-10-29 longlist rows remain.

### EQX — Eqxiu 易企秀 (China)
- **Access:** s10's body arrived compressed without having been requested. The one planned s12 re-request sent `Accept-Encoding: gzip, deflate` (content negotiation) and the tool decoded it. [OBSERVED S-EQX-002]
- **Positioning:** a mass-market interactive-page platform: "10万+ 免费H5模板" (100k+ free H5 templates), AI online design, forms / votes / surveys, and WeCom private-domain marketing. [OBSERVED]
- **Formats and scenes:** H5, long pages, voting, registration, surveys, quizzes, posters, lottery games, e-brochures, video and AI tools. Scenes include business invitations (商务邀请) and personal invitations (个人请柬) beside HR, education, government media, healthcare and retail promotion. [OBSERVED]
- **Model:** free templates beside member templates ("会员免费用", free for members). Templates are credited to third-party design studios with use counts. A custom design service. A seasonal hot-topic calendar (solar terms, shopping festivals) drives discovery. [OBSERVED]
- **Tech:** Vue, jQuery, Swiper. [OBSERVED]
- **Lesson:** here invitations are one format of a general interactive-page engine, merchandised by season and supplied by a designer marketplace with usage counts. **Counter:** out of scope for an event-first product. A designer marketplace (F-077, missing) stays P2, and templates stay curated and reviewed (no unrestricted HTML or JS).

---

## Cross-profile insights (Tier B)
1. **Free publishing is common at the bottom of the market** (Wedew free forever, WebNikah free, Invitee RM 0, Biihappy free, Zola / The Knot free websites); paid value moves to messaging, check-in devices, events / languages, or services. Our "free drafting, paid publish" stance (ADR-O02) stays a deliberate choice, not a market default.
2. **Packaging axes differ by vendor:** guest quota (UVR), art direction (JNV), turnaround (SAN), events + languages (INE), messages + reception devices (WDW). Among the substantive profiles, only Invitee withholds RSVP below a paid tier (Free and Lite lack it; Plus RM 59 has it).
3. **QR check-in is already a low-price feature** (SMP at 49k, INE Plus, WDW packages) — supports moving B-024 forward once B-011 is decided.
4. **National QR gifts** (DuitNow, Vietnamese bank QR) mirror the QRIS opportunity (I-03, B-026).
5. **Honesty and privacy gaps recur:** 78–86 % anchors (SMP), customers' names on a homepage (WNK), film-studio-styled theme naming (JNV), wrong `lang` (SMP).
