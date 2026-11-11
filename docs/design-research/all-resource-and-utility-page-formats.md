<!-- SUMMARY (7 baris — greppable)
WHAT: Audit lengkap format halaman untuk seluruh destination Resource dan utility marketing header.
STATUS: RESEARCH COMPLETE — coverage expected 21/21, gap 0.
SOURCE OF TRUTH: app/marketing-header.tsx + app/marketing-registry.ts.
SCOPE: 14 Resource, 3 index, Harga, Masuk, Coba gratis, Beranda.
RESEARCH: 4 web_search (batas terpenuhi); direct extraction dicoba dan gagal karena backend search-only.
OUTPUT: Format IA/UX berbasis pola referensi; bukan desain final atau copy.
-->

# Format Seluruh Halaman Resource & Utility

Tanggal audit: 18 Juli 2026  
Bahasa/market: Indonesia; platform undangan/acara; pembayaran satu kali (bukan subscription).  
Dokumen ini menentukan **format**, bukan visual final, wireframe final, atau copy pemasaran.

## 1. Metode, sumber otoritatif, dan batas riset

- Source authoritative diaudit: `app/marketing-header.tsx` (menu, top-level, CTA, callout, utility) dan `app/marketing-registry.ts` (slug serta destination aktual).
- Registry menang atas `_legacyHref`: helper `link()` membuang legacy href dan menghasilkan destination dari `marketingHref()`. Karena itu `Contact` aktual adalah `mailto:hello@vienne.id`, sedangkan item Resource lain menjadi `/resources/<slug>`.
- Empat pencarian web dijalankan (batas maksimum terpenuhi): pola resource SaaS; platform event/case study/ROI; support/company; pricing/auth/trust. Referensi di bawah hanya memakai URL yang ditemukan oleh hasil pencarian tersebut atau URL produk yang muncul sebagai destination/canonical example dalam hasilnya.
- Ekstraksi URL langsung dicoba, tetapi backend yang tersedia adalah DuckDuckGo **search-only** dan menolak ekstraksi. Tidak dilakukan retry berulang di luar diagnosis tersebut. Maka observasi spesifik dibatasi pada judul/deskripsi hasil pencarian: misalnya resource hub mengelompokkan artikel/guides/case studies/webinars/reports/templates; Help Center mengutamakan self-service; contact hub memisahkan support/sales/help; Cvent menonjolkan case study dan event/attendee insight; TrustRadius menampilkan review terverifikasi, rating, pro/kontra; Paddle menghubungkan security portal, privacy, status, dan pricing; Notion pricing menampilkan kapabilitas per paket.
- **Aturan adaptasi global:** gunakan sistem visual Vienne dan konteks acara Indonesia; jangan menyalin struktur pixel, klaim, angka, badge, testimoni, sertifikasi, uptime, lowongan, atau logo partner tanpa data nyata.

## 2. Inventaris dan coverage

### Destination expected dari source (unik)

| # | Label/sumber klik | Destination aktual | Kategori |
|---:|---|---|---|
| 1 | Logo `vienne.` | `/` | company/home |
| 2 | Lihat semua jenis acara | `/event-types` | index |
| 3 | Lihat semua fitur + semua callout event/feature | `/features` | index |
| 4 | Buka pusat resource + semua callout Resource | `/resources` | editorial index |
| 5 | Case studies | `/resources/case-studies` | editorial/proof |
| 6 | Event spotlights | `/resources/event-spotlights` | editorial |
| 7 | Reviews | `/resources/reviews` | trust/proof |
| 8 | Privacy & security | `/resources/privacy-and-security` | trust/legal |
| 9 | Event ROI calculator | `/resources/event-roi-calculator` | calculator |
| 10 | Sales | `/resources/sales` | sales/form |
| 11 | Help Center | `/resources/help-center` | support |
| 12 | Community forum | `/resources/community-forum` | community |
| 13 | Press & Blog | `/resources/press-and-blog` | editorial/press |
| 14 | FAQ | `/resources/faq` | support |
| 15 | Contact | `mailto:hello@vienne.id` | company/contact action |
| 16 | App status | `/resources/app-status` | trust/operations |
| 17 | Careers | `/resources/careers` | company |
| 18 | Affiliates | `/resources/affiliates` | company/partner |
| 19 | Harga | `/pricing` | pricing |
| 20 | Masuk | `/sign-in` | auth |
| 21 | Coba gratis / Buat event / feature personal | `/sign-up` | auth |

**Expected 21; researched 21; gap 0.** Duplikasi klik tidak menambah destination: enam callout Fitur dan dua callout Jenis Acara menuju `/features`; empat callout Resource menuju `/resources`; utility CTA dan personal-event feature menuju `/sign-up`. Tombol tab, menu, backdrop, dan mobile toggle bukan destination halaman.

## 3. Format per destination

### 1 — Beranda (`/`)
- **Tujuan:** orientasi brand, menjelaskan nilai end-to-end, mengarahkan ke sign-up atau eksplorasi use case.
- **Archetype:** company/product marketing home.
- **Section order:** hero + CTA → trust signal terverifikasi → problem/value → ringkasan workflow → use-case entry → feature proof → pricing teaser → FAQ ringkas → CTA/footer.
- **Komponen:** nav, hero demo invitation, cards, workflow visual, testimonial/logo hanya bila tersedia, CTA.
- **States:** tanpa form; fallback visual jika demo asset gagal; jangan tampilkan logo/testimoni kosong.
- **Asset/data:** screenshot produk nyata, event-type taxonomy, capability status, harga aktual.
- **Mobile:** satu kolom, CTA sticky opsional, demo dipotong aman, cards horizontal snap hanya jika affordance jelas.
- **Referensi:** https://www.cvent.com/ · https://www.bizzabo.com/event-management-software · https://www.sitebuilderreport.com/inspiration/saas-websites
- **Adapt / avoid:** adapt narasi workflow dan entry berbasis kebutuhan; hindari enterprise jargon serta statistik pelanggan rekaan.

### 2 — Index Jenis Acara (`/event-types`)
- **Tujuan:** membantu user menemukan format acara paling relevan dari 51 child page registry.
- **Archetype:** solution/use-case directory.
- **Section order:** intro → search/filter → kategori Event Type/Industry/Personal → featured/common types → guidance memilih → CTA.
- **Komponen:** filter chips, search, cards dengan ringkasan hasil/fitur relevan, breadcrumb.
- **States:** no-result dengan reset filter dan saran; loading skeleton bila data dinamis.
- **Asset/data:** 51 title/slug authoritative, group mega-menu, thumbnail yang representatif dan berizin.
- **Mobile:** search sticky, filter bottom sheet, satu kolom, jumlah hasil diumumkan untuk aksesibilitas.
- **Referensi:** https://www.cvent.com/ · https://www.bizzabo.com/event-management-software · https://www.vfairs.com/blog/best-event-registration-platforms/
- **Adapt / avoid:** adapt pengelompokan berbasis intent; hindari 51 card tanpa navigasi atau klaim fitur yang belum tersedia.

### 3 — Index Fitur (`/features`)
- **Tujuan:** menjadi peta 28 fitur/integrasi dan menghubungkan capability ke outcome acara.
- **Archetype:** product capability index.
- **Section order:** overview → category jump-nav → enam kelompok fitur → integrasi → workflow lintas fitur → availability legend → CTA.
- **Komponen:** anchor nav, feature cards, status badge (tersedia/beta/rencana), diagram data flow, comparison ringan.
- **States:** integrasi unavailable/waitlist harus eksplisit; empty filter dan fallback asset.
- **Asset/data:** 28 registry entries, status implementasi nyata, screenshot per capability, integration marks dengan izin.
- **Mobile:** accordion per kategori, anchor dropdown, screenshot swipe dengan label.
- **Referensi:** https://www.bizzabo.com/event-management-software · https://www.cvent.com/ · https://www.notion.com/pricing
- **Adapt / avoid:** adapt grouping capability dan keterkaitan workflow; hindari menyamakan roadmap dengan fitur live.

### 4 — Index Resource (`/resources`)
- **Tujuan:** satu hub untuk belajar, bukti, dukungan, trust, dan company.
- **Archetype:** editorial/resource directory.
- **Section order:** hero + search → featured guide → empat kelompok registry → latest/featured content → support shortcuts → trust/company links → CTA.
- **Komponen:** global resource search, type/topic filter, featured card, card metadata, popular links.
- **States:** zero-result dengan spelling/reset; empty category disembunyikan; skeleton; error retry.
- **Asset/data:** taxonomy, author/date/read time, thumbnails, 14 destination registry.
- **Mobile:** search di atas, filter sheet, cards satu kolom, kategori sebagai accordion.
- **Referensi:** https://www.poweredbysearch.com/learn/best-saas-resource-pages/ · https://www.webstacks.com/blog/resource-page · https://razegrowth.com/blog/build-saas-resource-center
- **Adapt / avoid:** adapt hub yang mengelompokkan format dan kebutuhan; hindari grid homogen tanpa search/metadata atau gated content berlebihan.

### 5 — Case studies (`/resources/case-studies`)
- **Tujuan:** membuktikan outcome penggunaan Vienne melalui kisah pelanggan yang dapat diverifikasi.
- **Archetype:** editorial proof library.
- **Section order:** hero → featured case → filter event/industry/outcome → case grid → aggregate proof (jika valid) → CTA.
- **Komponen:** cards dengan customer, challenge, solution, outcome; detail-link; quote attribution.
- **States:** tanpa case: honest coming-soon + ajakan menjadi pilot, bukan dummy logo; no-result reset.
- **Asset/data:** izin customer, logo, foto, baseline/metrik/metode, quote approval.
- **Mobile:** filter sheet; metrik ringkas; cards satu kolom.
- **Referensi:** https://www.cvent.com/en/success-stories · https://www.bizzabo.com/event-management-software · https://devsquad.com/blog/saas-case-studies
- **Adapt / avoid:** adapt challenge→intervention→hasil; hindari angka tanpa baseline, quote anonim, atau “customer” sintetis.

### 6 — Event spotlights (`/resources/event-spotlights`)
- **Tujuan:** inspirasi editorial lewat breakdown acara nyata, bukan semata testimonial produk.
- **Archetype:** editorial showcase.
- **Section order:** featured story → latest spotlights → filter jenis/gaya/skala → gallery/story cards → submission CTA.
- **Komponen:** visual-led cards, event facts, timeline, “yang bisa dipelajari”, credits.
- **States:** empty dengan editorial calendar/submission; image fallback + credit.
- **Asset/data:** foto berizin, tanggal/lokasi yang disetujui, vendor credits, accessibility alt.
- **Mobile:** rasio gambar konsisten, facts jadi chips, gallery swipe dengan counter.
- **Referensi:** https://www.cvent.com/en/success-stories · https://www.eventbrite.com/blog/ · https://www.poweredbysearch.com/learn/best-saas-resource-pages/
- **Adapt / avoid:** adapt storytelling dan takeaways; hindari mengekspos data tamu/pribadi atau foto tanpa consent.

### 7 — Reviews (`/resources/reviews`)
- **Tujuan:** menyajikan social proof transparan dan jalur ke review pihak ketiga.
- **Archetype:** trust/proof.
- **Section order:** rating summary → source/method disclosure → review cards/filter → pros/cons/themes → external profiles → submit-review CTA.
- **Komponen:** rating distribution, verified/source badge hanya bila sah, date, use case, moderation disclosure.
- **States:** belum ada review: nyatakan belum tersedia dan minta feedback; filter no-result; report-review flow.
- **Asset/data:** review consent, source URL, timestamp, verification/moderation policy.
- **Mobile:** distribution ringkas, filter drawer, expandable long reviews.
- **Referensi:** https://www.trustradius.com/compare-products/bizzabo-vs-splash-event-platform · https://www.capterra.com/ · https://www.g2.com/
- **Adapt / avoid:** adapt rating + pro/kontra + provenance; hindari badge “verified”, skor, atau volume palsu.

### 8 — Privacy & security (`/resources/privacy-and-security`)
- **Tujuan:** menjawab bagaimana data acara/tamu diproses dan menyediakan dokumen legal/trust yang dapat diaudit.
- **Archetype:** trust/legal center.
- **Section order:** trust overview → data lifecycle → controls/roles → infrastructure & incident handling → privacy rights → subprocessor/legal docs → security contact → status link.
- **Komponen:** plain-language summary, legal-document links/version dates, data-flow diagram, security FAQ, disclosure channel.
- **States:** dokumen unavailable diberi status/tanggal target; request-data form success/error; incident banner bila relevan.
- **Asset/data:** kebijakan nyata, retention, lokasi pemrosesan, subprocessors, DPO/contact, sertifikasi hanya jika dimiliki.
- **Mobile:** TOC collapsible, tabel subprocessor menjadi cards, legal PDF tetap dapat diunduh.
- **Referensi:** https://www.cloudflare.com/trust-hub/ · https://www.paddle.com/ · https://www.notion.com/security
- **Adapt / avoid:** adapt trust hub + transparent data controls; hindari SOC/ISO/encryption claims yang belum dibuktikan atau legalese sebagai satu-satunya penjelasan.

### 9 — Event ROI calculator (`/resources/event-roi-calculator`)
- **Tujuan:** mengestimasi nilai/biaya acara dengan asumsi transparan, bukan menjanjikan hasil.
- **Archetype:** interactive calculator.
- **Section order:** scope/disclaimer → input bertahap → hasil summary → breakdown & assumptions → sensitivity/scenario → methodology → save/share/contact.
- **Komponen:** currency IDR, input attendance/revenue/cost/time, validation, formula disclosure, chart, reset/export.
- **States:** initial example berlabel; invalid/missing inline; divide-by-zero; zero/negative result netral; loading/error untuk save; privacy consent bila email.
- **Asset/data:** rumus tervalidasi, default benchmark bersumber dan bertanggal, exchange-free IDR assumptions, methodology owner.
- **Mobile:** satu pertanyaan per blok, numeric keyboard, sticky result, chart accessible table fallback.
- **Referensi:** https://www.cvent.com/ · https://www.nxcode.io/de/tools/saas-pricing-calculator · https://invitedesk.com/en-gb/blog/bizzabo-vs-cvent/
- **Adapt / avoid:** adapt input→breakdown→assumption; hindari angka benchmark tak bersumber, lead gate sebelum hasil, presisi semu.

### 10 — Sales (`/resources/sales`)
- **Tujuan:** merutekan kebutuhan komersial kompleks ke manusia dengan konteks cukup.
- **Archetype:** sales lead form.
- **Section order:** expectation/value → fit indicators → form → what happens next/SLA nyata → alternative support → privacy note.
- **Komponen:** name/email/org, event type/date/guest scale, kebutuhan, preferred contact; progressive fields; calendar hanya jika operasional.
- **States:** inline validation, submit loading, success receipt + reference, server error + retry/email fallback, spam protection accessible.
- **Asset/data:** routing rules, owner/SLA, consent text, CRM fields, country/timezone.
- **Mobile:** single column, correct keyboards, no oversized textarea, preserve draft.
- **Referensi:** https://www.cvent.com/en/contact-sales · https://herothemes.com/blog/contact-us-page-examples/ · https://saaslandingpage.com/articles/15-beautiful-examples-of-help-center-support-pages/
- **Adapt / avoid:** adapt support-vs-sales routing dan clear next step; hindari form panjang tanpa alasan atau SLA palsu.

### 11 — Help Center (`/resources/help-center`)
- **Tujuan:** self-service troubleshooting dan onboarding produk.
- **Archetype:** support knowledge base.
- **Section order:** prominent search → popular tasks → categories → recent/known issues → contact escalation → feedback.
- **Komponen:** autocomplete, breadcrumbs, article metadata/version, related articles, “membantu?” feedback.
- **States:** no-result dengan query suggestions/contact; stale article badge; error/retry; signed-out context-safe.
- **Asset/data:** article corpus, product/version taxonomy, search analytics, ownership/review date.
- **Mobile:** search sticky, categories accordion, readable article TOC, tap-friendly steps.
- **Referensi:** https://userpilot.com/blog/help-center-designs/ · https://help-desk-migration.com/saas-customer-support/ · https://saaslandingpage.com/articles/15-beautiful-examples-of-help-center-support-pages/
- **Adapt / avoid:** adapt self-service search + escalation; hindari dead-end article atau search yang hanya mencocokkan judul.

### 12 — Community forum (`/resources/community-forum`)
- **Tujuan:** Q&A pengguna, berbagi praktik, dan discovery solusi edge-case.
- **Archetype:** support/community.
- **Section order:** search → categories → featured/solved → recent unanswered → guidelines → ask question/join.
- **Komponen:** tags, solved badge, votes, author role, moderation/report, duplicate suggestion composer.
- **States:** empty community dengan seeded official guides (jelas authored); no result; locked/deleted; auth-required composer; moderation pending.
- **Asset/data:** community policy, moderators, taxonomy, profile/privacy controls.
- **Mobile:** feed satu kolom, composer full-screen, filters bottom sheet, compact metadata.
- **Referensi:** https://community.hubspot.com/ · https://bettermode.com/blog/saas-customer-support · https://help-desk-migration.com/saas-customer-support/
- **Adapt / avoid:** adapt solved/unanswered dan staff attribution; hindari forum kosong palsu atau jawaban AI tanpa label.

### 13 — Press & Blog (`/resources/press-and-blog`)
- **Tujuan:** memisahkan berita perusahaan/press assets dari editorial tips acara sambil tetap mudah ditemukan.
- **Archetype:** editorial + newsroom hybrid.
- **Section order:** featured → topic/type filters → latest grid → press releases → media kit/company facts → newsletter.
- **Komponen:** article cards dengan type/date/author, search, RSS, media download, pagination.
- **States:** no-result; empty press section disembunyikan; newsletter validation/success/error; broken image fallback.
- **Asset/data:** CMS, author bios, dates, canonical URLs, OG images, approved boilerplate/logo kit.
- **Mobile:** featured tidak terlalu tinggi, filter sheet, pagination/load-more accessible.
- **Referensi:** https://www.eventbrite.com/blog/ · https://razegrowth.com/blog/build-saas-resource-center · https://www.poweredbysearch.com/learn/best-saas-resource-pages/
- **Adapt / avoid:** adapt metadata dan pemisahan content type; hindari mencampur press release dengan panduan tanpa label atau tanggal tersembunyi.

### 14 — FAQ (`/resources/faq`)
- **Tujuan:** jawaban cepat lintas pre-sales, produk, pembayaran, privasi, dan support.
- **Archetype:** support FAQ.
- **Section order:** search → topic jump → top questions → grouped accordions → unresolved escalation → related resources.
- **Komponen:** accordion deep-linkable, expand/collapse all secukupnya, last-updated, feedback.
- **States:** no-result suggestions; unanswered route to Help/Sales; stale answer flag internal.
- **Asset/data:** approved answers, owner per topic, review cadence, structured FAQ schema hanya bila sesuai kebijakan search engine.
- **Mobile:** single-open accordion opsional, anchor offset, large tap targets.
- **Referensi:** https://www.poweredbysearch.com/learn/best-saas-faq-pages/ · https://help-desk-migration.com/saas-customer-support/ · https://www.zendesk.com/blog/customer-service/support/saas-customer-support/
- **Adapt / avoid:** adapt hub→KB/community/support pathways; hindari ratusan accordion satu halaman atau jawaban legal ambigu.

### 15 — Contact (`mailto:hello@vienne.id`)
- **Tujuan:** membuka composer email langsung untuk kontak umum.
- **Archetype:** company/contact action, **bukan halaman web** menurut registry.
- **Section order:** tidak berlaku; pengalaman adalah mail client → recipient terisi → user menulis → kirim.
- **Komponen:** link `mailto`, label alamat yang terlihat, fallback copy-to-clipboard di UI sumber bila memungkinkan.
- **States:** perangkat tanpa mail client harus tetap memperlihatkan `hello@vienne.id`; jangan mengklaim email terkirim; fokus/keyboard state link.
- **Asset/data:** inbox aktif, routing/auto-reply/SLA nyata, anti-spam operational.
- **Mobile:** mail app chooser; target sentuh cukup; alamat mudah disalin.
- **Referensi:** https://herothemes.com/blog/contact-us-page-examples/ · https://saaspo.com/page-types/saas-contact-page-examples · https://www.cvent.com/en/contact-sales
- **Adapt / avoid:** adapt routing jelas (general vs sales/support); hindari mailto tanpa fallback atau menganggap composer-open sebagai conversion sukses.

### 16 — App status (`/resources/app-status`)
- **Tujuan:** transparansi kesehatan layanan dan histori insiden.
- **Archetype:** trust/operations status.
- **Section order:** overall status → komponen layanan → active incident → uptime/history → maintenance → subscribe → incident archive.
- **Komponen:** status legend dengan teks+warna, timestamp/timezone, incident timeline, RSS/email subscription.
- **States:** all operational, degraded, outage, maintenance, unknown/data stale; subscription success/error.
- **Asset/data:** monitoring nyata, component map, incident updates/postmortem, uptime calculation policy.
- **Mobile:** status summary pertama, table jadi stacked rows, incident updates chronological.
- **Referensi:** https://www.githubstatus.com/ · https://www.paddle.com/ · https://www.cloudflarestatus.com/
- **Adapt / avoid:** adapt component transparency + timestamp; hindari hard-coded “operational”, warna tanpa teks, atau uptime rekaan.

### 17 — Careers (`/resources/careers`)
- **Tujuan:** menjelaskan kerja di Vienne dan mengubah kandidat relevan menjadi aplikasi yang informed.
- **Archetype:** company/recruiting.
- **Section order:** mission/work → values dengan evidence → team/ways of working → benefits factual → open roles/filter → hiring process → FAQ/contact.
- **Komponen:** role cards, location/type, job detail, accessible application form atau ATS link.
- **States:** zero openings dengan talent alert jujur; filter no-result; application upload/validation/success/error; closed role.
- **Asset/data:** approved roles, salary/location where policy allows, team imagery consent, hiring timeline/privacy retention.
- **Mobile:** role filters sheet, compact cards, resume upload cloud/file options, preserve application draft.
- **Referensi:** https://www.atlassian.com/company/careers · https://www.notion.com/careers · https://www.paddle.com/careers
- **Adapt / avoid:** adapt transparent process dan no-openings state; hindari stock “culture” tanpa bukti atau lowongan kedaluwarsa.

### 18 — Affiliates (`/resources/affiliates`)
- **Tujuan:** menjelaskan program referral/partner dan menerima aplikasi berkualitas.
- **Archetype:** company/partner acquisition.
- **Section order:** fit/value → how it works → eligibility → commission/terms (faktual) → assets/support → application → FAQ/legal.
- **Komponen:** stepper, eligibility checklist, disclosure requirements, application form, partner login bila ada.
- **States:** program belum buka/waitlist; validation; application received/pending/approved/rejected; region ineligible.
- **Asset/data:** commission rules, attribution window, prohibited promotion, payout/tax policy Indonesia, brand kit.
- **Mobile:** terms summary + full legal link, one-column form, status readable tanpa table lebar.
- **Referensi:** https://www.hubspot.com/partners/affiliates · https://www.shopify.com/affiliates · https://www.paddle.com/partners
- **Adapt / avoid:** adapt eligibility→terms→apply; hindari menyembunyikan payout/attribution atau menjanjikan pendapatan.

### 19 — Harga (`/pricing`)
- **Tujuan:** menjelaskan model one-time Vienne, apa yang termasuk, biaya tambahan, dan jalur pembelian tanpa ambiguitas.
- **Archetype:** pricing/commerce.
- **Section order:** pricing premise → paket/opsi → inclusions & limits → comparison → add-on/fee/payment → guarantee/refund factual → FAQ → CTA/support.
- **Komponen:** IDR price cards, event/guest limits, feature status, comparison table, cost summary; toggle hanya jika benar-benar ada dimensi harga.
- **States:** package unavailable/sold out; promo expired; loading/error checkout; no hidden fee disclosure; contact sales fallback.
- **Asset/data:** price/version/effective date, tax/fee, Midtrans methods, limits, refund terms, capability availability.
- **Mobile:** cards stack, comparison sebagai row cards/column selector, sticky selected-plan CTA, total selalu terlihat.
- **Referensi:** https://www.notion.com/pricing · https://www.paddle.com/ · https://getperspective.ai/blog/event-registration-platforms-in-2026-12-options-ranked-by-attendee-experience
- **Adapt / avoid:** adapt transparent feature inclusion dan comparison; hindari pola subscription karena produk one-time, harga silang palsu, atau fitur roadmap sebagai included-live.

### 20 — Masuk (`/sign-in`)
- **Tujuan:** mengautentikasi user kembali dengan friksi rendah dan recovery aman.
- **Archetype:** auth/sign-in.
- **Section order:** brand/context → email/password (atau metode yang benar-benar didukung) → submit → forgot-password → sign-up switch → trust/help links.
- **Komponen:** labelled fields, show password, password manager/autocomplete, redirect preservation, error summary.
- **States:** empty/invalid, pending, wrong credential generik, rate limited, locked/unverified, server/network error, success redirect; jangan bocorkan keberadaan akun.
- **Asset/data:** auth methods nyata, support/recovery routes, privacy/terms, redirect allowlist.
- **Mobile:** keyboard types, full-width CTA, no visual yang mendorong form below fold, viewport aman saat keyboard muncul.
- **Referensi:** https://slack.com/signin · https://login1.edupage.org/ · https://make.powerapps.com/
- **Adapt / avoid:** adapt single-task form + recovery; hindari testimonial distraction, password rules tersembunyi, atau redirect terbuka.

### 21 — Coba gratis / Buat event (`/sign-up`)
- **Tujuan:** membuat akun dan membawa user ke activation pertama tanpa kartu kredit bila klaim tersebut benar.
- **Archetype:** auth/sign-up/onboarding entry.
- **Section order:** value/expectation → minimal account form → terms/consent → submit → verification (jika ada) → first-event handoff → sign-in switch.
- **Komponen:** email/password/name hanya bila perlu, password requirements live, show password, progress hanya untuk langkah nyata, preserve `priceId`/`inviteId`/redirect secara aman.
- **States:** duplicate email (arahkan masuk/recovery tanpa bocor berlebihan), invalid/weak password, pending, verification sent/resend cooldown, network/server error, success/redirect.
- **Asset/data:** terms/privacy current, email delivery, onboarding destination, analytics consent, entitlement gratis aktual.
- **Mobile:** satu kolom, requirement dekat field, keyboard-safe, CTA tidak tertutup, resume setelah email verification.
- **Referensi:** https://www.notion.so/signup · https://make.powerapps.com/ · https://www.notion.com/pricing
- **Adapt / avoid:** adapt minimal friction + clear next step; hindari credit-card surprise, form panjang sebelum value, atau klaim “gratis” dengan batas tersembunyi.

## 4. Matriks pembedaan archetype (guardrail lintas halaman)

| Archetype | Destination | Fokus utama | Guardrail khas |
|---|---|---|---|
| Editorial | Resource index, Case studies, Event spotlights, Press & Blog | discoverability, provenance, freshness | author/date/source/consent; empty state jujur |
| Trust/legal | Reviews, Privacy & security, App status | verifiability, transparency | tidak ada badge, rating, sertifikasi, uptime rekaan |
| Calculator | Event ROI calculator | input, formula, assumption, sensitivity | disclaimer dan methodology sebelum lead capture |
| Support/community | Help Center, Community forum, FAQ | self-service lalu escalation | no-result tidak boleh dead end; moderation/versioning |
| Company | Beranda, Contact action, Careers, Affiliates | identity, relationship, recruitment/partner | data operasional nyata dan consent |
| Directory/index | Jenis Acara, Fitur | wayfinding menuju child pages | search/filter/no-result; status capability |
| Pricing | Harga | total cost dan inclusion | one-time model, tax/fee/limit jelas |
| Auth | Masuk, Coba gratis | task completion dan account safety | recovery, validation, redirect safety, minimal distraction |
| Sales/form | Sales | qualified routing | SLA nyata, success receipt, fallback |

## 5. Checklist handoff desain (bukan desain final)

1. Pakai destination aktual di tabel coverage; jangan memakai `_legacyHref` yang sudah diabaikan helper.
2. Sebelum wireframe, product owner harus menyediakan data wajib yang disebut per halaman; jika belum ada, gunakan empty state yang eksplisit—bukan placeholder seolah nyata.
3. Seluruh form wajib punya label, inline + summary error, pending, success, server failure, retry/fallback, consent, dan draft preservation sesuai risiko.
4. Semua statistik, testimoni, rating, review, customer logo, sertifikasi, uptime, benchmark ROI, harga, SLA, dan lowongan memerlukan provenance serta tanggal berlaku.
5. Mobile bukan desktop yang diperkecil: ubah table menjadi cards/selector, filter menjadi sheet, jaga keyboard dan CTA, dan pertahankan aksesibilitas teks selain warna.
6. Child pages Jenis Acara dan Fitur tidak termasuk permintaan format **setiap child**; semuanya tetap terinventaris melalui index dan registry (51 event types, 28 features). Scope detail per-destination dalam audit ini mencakup seluruh 14 Resource dan seluruh destination top-level/action/utility unik.

## 6. Rekap akhir

- Resource menu item: **14/14**.
- Resource index/callout: **1/1**.
- Index Jenis Acara + Fitur: **2/2**.
- Harga, Masuk, Coba gratis: **3/3**.
- Destination utility/callout unik tambahan: **Beranda 1/1**; destination callout lain sudah terdeduplikasi ke Fitur, Resource, atau Sign-up.
- **Total unique expected: 21. Total researched/formatted: 21. Gap: 0.**
- Setiap destination memiliki tujuan, archetype, urutan section, komponen, states yang relevan, asset/data, mobile adaptation, 2–3 URL referensi, serta adapt/avoid.
- Keterbatasan: direct web extraction tidak tersedia pada backend sesi; URL dan insight tidak diperlakukan sebagai hasil inspeksi halaman penuh, hanya sebagai referensi riset yang ditemukan lewat empat hasil pencarian web.
