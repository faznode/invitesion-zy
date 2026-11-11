<!-- SUMMARY (7 baris — greppable)
WHAT: Product-risk audit IP, merek, competitive similarity, dan claim readiness untuk seluruh marketing navigation Vienne.
STATUS: Audit 2026-07-18; bukan pendapat hukum.
SCOPE: 50 event types, 28 features, 14 resources, 13 tabs, groups, notes, callouts, utility CTA, dan IA.
HIGH: Struktur/urutan/label mega-menu sangat dekat dengan RSVPify; lima integrasi bermerek tampil sebagai fitur tanpa bukti live.
MEDIUM: Banyak destination fitur/resource dan trust/commercial claims belum dibuktikan implementasinya.
ACTION: Restrukturisasi IA secara independen; remove-until-live integrasi/fitur/resource yang belum nyata; gunakan nominative trademark disclosure.
SOURCES: Source code Vienne, situs resmi kompetitor, Copyright Office AS, WIPO Lex; keterbatasan ekstraksi dicatat.
-->

# Audit IP & competitive similarity — marketing menu Vienne

**Tanggal audit:** 18 Juli 2026  
**Sifat dokumen:** **product-risk audit, bukan legal opinion**. Penilaian LOW/MEDIUM/HIGH adalah prioritas mitigasi produk, bukan kesimpulan pelanggaran atau kepastian hukum. Nasihat counsel Indonesia tetap diperlukan sebelum peluncuran.

## 1. Ringkasan eksekutif

| Risiko | Status | Temuan | Tindakan utama |
|---|---:|---|---|
| Copyright / substantial copying | **HIGH** | Label pendek umumnya generik dan lemah sebagai karya tersendiri, tetapi **selection–arrangement** menu Vienne sangat menyerupai navigasi RSVPify: tiga tab event `By Event Type → By Industry → Personal Events`; enam tab feature dimulai `Forms & Registration → Ticketing...` dan berakhir `Integrations`; kelompok serta urutan integrasi `Salesforce, HubSpot, Stripe, Google Analytics, Zapier, API` juga berimpit. Ini lebih berisiko daripada satu label generik. | **RESTRUCTURE** berdasarkan job pengguna Indonesia, ubah tab/order/grouping secara material, kurangi daftar yang belum relevan, tulis ulang notes/callouts dari product truth. |
| Trademark / confusion | **HIGH** untuk menu integrasi; **MEDIUM** untuk clearance Vienne | Salesforce, HubSpot, Stripe, Google Analytics, dan Zapier adalah merek pihak ketiga dan saat ini disajikan sebagai destination fitur tanpa qualifier. Penggunaan nominatif tidak otomatis berarti partnership/certification. Nama **Vienne** sendiri belum dibuktikan clearance/registrasinya dalam audit ini. | **REMOVE-UNTIL-LIVE**; bila live gunakan `Integrasi dengan …`, approved word mark/logo dan disclaimer no endorsement. Lakukan pencarian DJKI/WIPO untuk VIENNE pada kelas relevan. |
| Misleading commercial claims | **HIGH** | Source menu membuat 28 halaman generik dari registry; repo search menemukan bukti Stripe lama sudah dicabut dan payment direncanakan memakai Midtrans, bukan bukti integrasi live. Tidak ditemukan bukti implementasi lima integrasi enterprise. Banyak fitur/resource/trust endpoint tampak sebagai catalog destination, bukan capability terverifikasi. | Gate publikasi dengan evidence matrix. **REMOVE-UNTIL-LIVE** untuk integration dan claim transaksional/onsite/trust yang belum lulus acceptance test; gunakan waitlist/roadmap yang jelas bila perlu. |

**Jawaban singkat pertanyaan produk:** mayoritas nama seperti “Conferences”, “Online RSVPs”, “Help Center”, atau “Weddings” adalah istilah jasa/kategori pendek dan bukan ekspresi copyright yang kuat. Namun **keseluruhan pilihan, pengelompokan, urutan tab, dan rangkaian integrasi** tampak terlalu dekat dengan RSVPify untuk disebut aman sebagai penamaan generik yang berkembang independen. Hak cipta dan merek harus dibedakan: frasa pendek bisa tidak dilindungi copyright tetapi tetap bermasalah sebagai trademark atau klaim afiliasi.

## 2. Metode, source of truth, dan skala

Source authoritative lokal:

- [`app/marketing-header.tsx`](../../app/marketing-header.tsx), khususnya lines 15–65 dan rendering lines 77–93.
- [`app/marketing-registry.ts`](../../app/marketing-registry.ts), khususnya daftar lines 10–109 dan generator page lines 111–127.

Hitungan source: **50 event types + 28 features + 14 resources = 92 destination unik**, **13 tabs** (3 event + 6 feature + 4 resource), berikut heading groups, 28 feature notes, 14 resource notes, 3 event callouts, 6 feature callouts, 1 resource callout berulang, utility strapline/links, serta header CTA.

Metode pembanding: maksimal enam pencarian web, dibatasi ke domain resmi. Hasil exact yang dapat dipertanggungjawabkan berasal dari source Vienne dan kutipan/snippet halaman resmi di hasil pencarian. `web_extract` dicoba tetapi backend sesi hanya mendukung search dan menolak ekstraksi; karena itu audit **tidak mengarang** isi halaman yang tak dapat diakses dan menandai bukti snippet atau URL-only.

## 3. Kerangka risiko

- **Copyright:** Copyright Office AS menyatakan nama, judul, slogan, dan frasa pendek tidak dilindungi copyright; namun Circular 33 juga membedakan karya kompilasi/creative expression dari daftar mekanis. UU Hak Cipta Indonesia No. 28/2014 adalah kerangka lokal yang berlaku; status protectability dan substantial similarity tetap fact-specific.
- **Merek:** tidak adanya copyright pada kata pendek **bukan** izin merek. UU No. 20/2016 adalah kerangka Indonesia untuk merek/indikasi geografis. Penggunaan nama integrasi perlu benar secara referensial, proporsional, dan tidak menyiratkan sponsorship.
- **Claims:** menu produk adalah representasi komersial. Destination bernama “Payment processing”, “Privacy & security”, “App status”, atau sebuah integrasi lazimnya dipahami sebagai capability tersedia, kecuali dilabel jelas sebagai roadmap/beta.

Status: **LOW** = istilah generik/overlap fungsional biasa; **MEDIUM** = kombinasi, wording, atau claim perlu bukti/perubahan sebelum scale; **HIGH** = kemiripan struktural khas, merek tanpa qualifier, atau capability material tanpa bukti live.

## 4. Audit structural overlap / information architecture

### 4.1 Cluster paling dekat: RSVPify — **HIGH / RESTRUCTURE**

| Elemen Vienne (exact) | Bukti overlap resmi | Analisis | Rekomendasi |
|---|---|---|---|
| `By Event Type`, `By Industry`, `Personal Events` dalam urutan itu | Halaman resmi RSVPify muncul dengan taxonomy event/industry dan menu feature; contoh hasil resmi: Enterprise, Financial Services, Summits & Forums. URL di bawah. | Bukan sekadar satu istilah; kombinasi tiga mode klasifikasi dan order meningkatkan risiko selection–arrangement. | **RESTRUCTURE** menjadi misalnya `Kebutuhan Bisnis`, `Perayaan Personal`, `Organisasi & Komunitas`; mulai dari market Indonesia, bukan tiga sumbu yang sama. |
| `Forms, Registration & AI` → `Ticketing & Payments` → `Guest Management` → `Websites & Invitations` → `Check-in & Insights` → `Integrations` | Snippet resmi RSVPify Enterprise: exact `Forms & Registration; Ticketing ... Native integrations with Salesforce, HubSpot, Zapier...`; Financial Services: `Integrations & API Salesforce, HubSpot, Zapier, API. CRM & Sales. Salesforce`. | “& AI” dan “Insights” adalah variasi kecil atas skeleton yang sama; order lifecycle dan final integrations berimpit. | **RESTRUCTURE**: `Undangan & desain`, `Tamu & RSVP`, `Komunikasi`, `Operasional hari-H`, `Pembayaran Indonesia`, `Data & koneksi`; tampilkan hanya kemampuan nyata. |
| Integrations groups: `CRM & SALES` (Salesforce, HubSpot), `PAYMENTS & ANALYTICS` (Stripe, Google Analytics), `AUTOMATION & CUSTOM` (Zapier, API & export) | Snippet RSVPify resmi mengandung exact `Integrations & API Salesforce, HubSpot, Zapier, API. CRM & Sales. Salesforce`; urutan Vienne sangat spesifik. | Ini bukti terkuat derivasi struktural; pilihan+group+order jauh lebih khas daripada nama produk secara individual. | **RESTRUCTURE** dan **REMOVE-UNTIL-LIVE**. Jangan mempertahankan urutan/group ini hanya dengan mengganti kapitalisasi. |
| Banyak event exact: `Enterprise`, `Financial services`, `Summits & forums`, `Galas...`, dst. | RSVPify official pages `/enterprise/`, `/financial-services/`, `/summits-forums/`, `/gala-guest-management/`. | Masing-masing mostly descriptive (LOW), tetapi kumpulan panjang dan parallel page generation menaikkan aggregate risk. | **KEEP** hanya kategori prioritas berbukti demand; **RENAME/RESTRUCTURE** taxonomy secara independen. |

### 4.2 Cvent, Eventbrite, Swoogo, Bizzabo — **LOW individual / MEDIUM aggregate**

- Cvent official feature snippet memakai lifecycle `registration, marketing, onsite, and analytics`; Vienne memakai registration, ticketing, guest management, invitations, check-in, insights. Ini **functional convergence** industri, bukan exact expressive copy yang ditemukan. **KEEP** konsep; **RESTRUCTURE** urutan bila meniru lifecycle competitor lain.
- Eventbrite sangat lekat dengan ticketing, secure payments, seating, organizer check-in, dan attendance. Label Vienne terkait adalah deskriptif (**LOW copyright**), tetapi availability claims **MEDIUM/HIGH** bila belum live.
- Swoogo/Bizzabo official search results membahas registration, integrations, event types, dan event-management features. Tidak ditemukan exact mega-menu overlap dari source yang dapat diakses; **LOW** berdasarkan bukti terbatas, bukan clearance.

### 4.3 Partiful, Paperless Post, Greenvelope — **LOW copyright / MEDIUM positioning**

Exact official snippets:

- Partiful: `Free Online Invitations with RSVP Tracking`; “Invite guests… Text Blasts and automatic reminders.”
- Paperless Post: `Online Invitations With RSVP Tracking`; “Share via email, text, or link, and track RSVPs.”
- Greenvelope: `premium digital invitations ... built-in RSVP tracking ... weddings, parties, and corporate events`.

Vienne’s `Online invitations`, `Online RSVPs`, `Email communications`, weddings/birthdays/baby showers adalah istilah kategori umum. Tidak ada exact expressive sentence Vienne yang ditemukan sama. **KEEP** labels; pertahankan callout Indonesia yang original. Hindari claims/adjectives khas competitor seperti “stationery-inspired”, “animated envelopes”, “actually fun”, atau “ad-free” kecuali benar dan ditulis independen.

## 5. Coverage seluruh inventory

### 5.1 Semua 50 event types

**Cluster A — profesional/event format (20): MEDIUM aggregate; individual LOW copyright; RESTRUCTURE taxonomy.**  
`Client & VIP events`; `Customer appreciation`; `Employee appreciation`; `Brand activations`; `Product launches`; `Conferences`; `Summits & forums`; `Tradeshows & expos`; `Sales kickoffs`; `Workshops & classes`; `Field marketing`; `Networking events`; `Internal meetings & trainings`; `Team building & offsites`; `Investor & shareholder`; `Holiday parties`; `Galas & benefit dinners`; `Donor stewardship`; `Shows & performances`; `Community events`.

- Exact/structural evidence: RSVPify official pages confirm exact/near exact `Summits & Forums` and gala taxonomy; overall “By Event Type” selection parallels RSVPify.
- Recommendation: **KEEP** generic labels needed by actual customers, but **RESTRUCTURE** groups/order; fix awkward `Investor & shareholder` to **RENAME** `Investor & shareholder events`; validate localized terms (`Pameran & expo`, `Peluncuran produk`).

**Cluster B — industries (16): HIGH structural with RSVPify; individual LOW copyright; RESTRUCTURE.**  
`Enterprise`; `Businesses`; `Financial services`; `Agencies`; `Nonprofits & foundations`; `Healthcare`; `Associations & membership`; `Government & NGO`; `Higher education`; `K–12 schools`; `Independent schools`; `Religious organizations`; `Hospitality & venues`; `Bars & restaurants`; `Real estate`; `Media & publishing`.

- Exact evidence: RSVPify has official `/enterprise/` and `/financial-services/`; “By Industry” and this broad B2B selection are structurally close.
- Recommendation: **RESTRUCTURE** to fewer Indonesian verticals supported by product; **RENAME** `Businesses` (overbroad), `Associations & membership` → `Asosiasi & komunitas anggota`, and avoid duplicate school segments unless distinct product proof exists.

**Cluster C — personal (14): LOW individual, MEDIUM aggregate; KEEP + localize.**  
`Weddings`; `Wedding anniversaries`; `Bridal showers`; `Birthdays`; `Anniversary parties`; `Reunions`; `Graduations`; `Aqiqah & Khitanan`; `Syukuran`; `Baby showers`; `Gender reveals`; `Holiday gatherings`; `Retirement parties`; `Celebrations of life`.

- Evidence: Paperless Post official snippet lists birthday, wedding, baby shower, bridal shower; Greenvelope lists weddings/parties/corporate. These are ordinary event categories. `Aqiqah & Khitanan` dan `Syukuran` are differentiating Indonesian choices.
- Recommendation: **KEEP**, but separate `Aqiqah` and `Khitanan` if journeys differ; consider Indonesian labels throughout. Avoid reproducing a competitor’s category order.

### 5.2 Semua 28 features

| Cluster/items (exact) | Copyright | Trademark | Claim readiness | Action |
|---|---:|---:|---:|---|
| Form: `Event registration`, `Online RSVPs`, `Form builder`, `Embeddable forms` | LOW labels / **HIGH aggregate IA** vs RSVPify | LOW | **MEDIUM**—notes promise custom flows and embedding | **KEEP** only if acceptance-tested; otherwise **REMOVE-UNTIL-LIVE**. Restructure tab. |
| Commerce: `Event ticketing`, `Donations`, `Appointment scheduling`, `Payment processing` | LOW | MEDIUM if payment provider implied | **HIGH**—money, checkout, slot booking are material | **REMOVE-UNTIL-LIVE** unless end-to-end production test, refund/fee/provider disclosure exist. Repo says Stripe was removed and Midtrans planned. |
| Guests: `Guest list management`, `Seating charts`, `Menu & dietary`, `Contact tagging`, `Email communications` | LOW | LOW | **MEDIUM/HIGH**; notes promise plus-one, seating, allergy, segmentation, broadcast | **KEEP** verified core; otherwise **REMOVE-UNTIL-LIVE** per item. Add consent/deliverability language for email. |
| Invitation: `Event website builder`, `Online invitations`, `QR code RSVPs`, `Guest list app`, `Multi-language` | LOW | LOW | **MEDIUM**; “app”, real-time and localization are objective claims | **RENAME** `Guest list app` to `Daftar tamu` unless actual app exists; **REMOVE-UNTIL-LIVE** QR/multilanguage if untested. |
| Onsite/data: `Event check-in app`, `Badge printing`, `Live attendance`, `Analytics & reporting` | LOW | LOW | **HIGH** for app/printing/live analytics | **REMOVE-UNTIL-LIVE** absent devices, print compatibility, telemetry and export evidence. |
| Integrations: `Salesforce`, `HubSpot`, `Stripe`, `Google Analytics`, `Zapier`, `API & export` | LOW copyright | **HIGH** | **HIGH**, no implementation proof found | **REMOVE-UNTIL-LIVE**. If live, **RENAME** `Integrasi dengan [Mark]`, publish supported objects/events/scopes, and add disclaimer. |

**Notes coverage (28):** seluruh notes lines 37–42 ikut status item induknya. Claims paling sensitif: `Pembayaran aman`, `Tamu, plus-one, dan seating`, `Daftar tamu real-time`, `Cetak saat kedatangan`, `Siapa hadir dan kapan`, `Sync leads & ROI`, `Nurture dan segmentasi`, `Tiket dan donasi`, `Traffic dan conversion`, dan `Workflow lintas aplikasi`. **HIGH / REMOVE-UNTIL-LIVE atau DISCLAIMER** karena keamanan, real-time, ROI/conversion, sync, dan interoperability harus dibuktikan. Notes lain tetap **MEDIUM** hingga demo/test fixture tersedia.

### 5.3 Semua 14 resources

- **Potentially factual artifacts — HIGH claim risk:** `Case studies`, `Event spotlights`, `Reviews`, `Event ROI calculator`, `Help Center`, `Community forum`, `App status`, `Careers`, `Affiliates`. Bila destination hanya halaman generik hasil registry, label menyiratkan artifact/program yang ada. **REMOVE-UNTIL-LIVE** atau arahkan ke artifact nyata; jangan membuat review/case study sintetis.
- **Trust/legal — HIGH claim sensitivity:** `Privacy & security`. **KEEP** hanya dengan kebijakan nyata, controls akurat, contact/data-retention/subprocessor disclosure; jangan menyiratkan certification. 
- **Operational — MEDIUM:** `Sales`, `Press & Blog`, `FAQ`, `Contact`. **KEEP** bila channel aktif dan isi nyata; `Contact` sudah dipetakan ke mailto oleh registry, tetapi semua item lain perlu route/content validation.
- Copyright labels seluruh 14: **LOW** karena deskriptif. Aggregate resource IA (`Customer Stories`, `Tools & Trust`, `Sales & Support`, `Company`) adalah pola SaaS umum, tetapi kemiripan dengan mega-menu enterprise memberi **MEDIUM selection-arrangement**; **RESTRUCTURE** menjadi `Panduan`, `Dukungan`, `Keamanan`, `Tentang Vienne` dan hapus tab kosong.

## 6. Tabs, groups, callouts, notes, utility CTA

| Elemen | Status | Bukti/analisis | Rekomendasi |
|---|---:|---|---|
| 3 event tabs | **HIGH** | Exact sequence `By Event Type / By Industry / Personal Events` dekat taxonomy RSVPify. | **RESTRUCTURE** dan Indonesian-first. |
| 6 feature tabs + group order | **HIGH** | Official RSVPify snippet exact `Forms & Registration; Ticketing...` dan integrations list/group. | **RESTRUCTURE** secara material, bukan cosmetic rename. |
| 4 resource tabs | MEDIUM | SaaS-standard, sedikit creativity per label, tetapi memperpanjang parallel enterprise mega-menu. | **RESTRUCTURE**/collapse. |
| Group headings (16 event, 8 feature, 4 resource) | MEDIUM/HIGH aggregate | Banyak heading deskriptif, tetapi selection dan alignment dengan tabs memperkuat overlap. | Ganti dengan taxonomy hasil riset pengguna lokal; ubah membership dan order. |
| 28 feature notes + 14 resource notes | LOW copyright / MEDIUM-HIGH claims | Copy Indonesia tampak original; tidak ditemukan exact competitor phrase. Sejumlah notes adalah objective claims. | **KEEP** voice; evidence-gate tiap note; disclaimer tidak menyembuhkan fitur yang tidak ada. |
| Event callouts: `Rancang pengalaman yang terasa utuh`, `Alur acara yang mengikuti kebutuhan Anda`, `Vienne, dibuat personal` | LOW | Expressive Indonesian copy; tidak ditemukan exact overlap. | **KEEP**, arsipkan provenance/draft. |
| Feature callouts: `Tanyakan hanya yang Anda perlukan`, `Kelola akses dan pembayaran lebih rapi`, `Kenali dan layani setiap tamu`, `Satu halaman untuk cerita Anda`, `Sambut tamu dengan informasi yang siap`, `Satu data, satu alur` | LOW copyright / MEDIUM claim | Tidak ditemukan exact overlap; “Satu data” bisa mengklaim integration/data unification. | **KEEP** kecuali `Satu data, satu alur`: **DISCLAIMER/RENAME** sampai integrasi nyata. |
| Resource callout: `Rencanakan acara lebih tenang... checklist, template, dan panduan` | LOW copyright / MEDIUM claim | Original-seeming, tetapi menjanjikan checklist/template. | **KEEP** hanya jika assets tersedia; else **REMOVE-UNTIL-LIVE**. |
| Utility: `Dirancang untuk momen yang penting`; `Lihat semua...`; `Buka pusat resource`; `Buat event`; header `Masuk`, `Coba gratis`, `Harga` | LOW copyright | Generic utility copy; tidak ditemukan exact expressive overlap. | **KEEP**; `Coba gratis` **HIGH claim** bila free trial/tier tidak benar—**RENAME** `Mulai membuat` atau disclose terms. |

## 7. Trademark / brand-confusion audit

| Mark | Status | Masalah | Safe product treatment |
|---|---:|---|---|
| Salesforce | **HIGH** | Bare destination + `Sync leads & ROI` menyiratkan working integration dan measurable ROI. | **REMOVE-UNTIL-LIVE**; lalu “Integrasi Vienne dengan Salesforce”; approved marks only; no partner badge absent authorization; supported objects/sync disclosed. |
| HubSpot | **HIGH** | Bare destination + nurture/segmentation claim. | Sama; verify App Marketplace/authorization bila diklaim; no endorsement disclaimer. |
| Stripe | **HIGH** | Bare destination + ticket/donation claim conflicts with repo evidence that Stripe subscription layer was removed and Midtrans planned. | **REMOVE** kecuali product strategy berubah dan live. Jangan gunakan Stripe untuk menggambarkan generic payments. |
| Google Analytics | **HIGH** | Bare destination + traffic/conversion implies telemetry implementation and consent behavior. | **REMOVE-UNTIL-LIVE**; gunakan full product name as nominative reference, disclose events/consent; follow Google brand guidance. |
| Zapier | **HIGH** | Bare destination + cross-app workflow implies published/working triggers/actions. | **REMOVE-UNTIL-LIVE**; disclose dependency and supported triggers/actions; approved Zapier naming/logo only. |
| Vienne / `vienne.` | **MEDIUM pending clearance** | Source establishes house mark but audit tidak menemukan bukti clearance/registration, ownership, class, atau conflict search. “Vienne” juga merupakan nama geografis Prancis dalam beberapa bahasa, sehingga distinctiveness/scope fact-specific. | Search DJKI PDKI dan WIPO Global Brand Database untuk word/device variants di kelas software/SaaS/event services; document owner/domain/social handles; counsel review before spend. **Jangan** menganggap domain `.id` = hak merek. |

Recommended footer near integrations if/when real: **“Salesforce, HubSpot, Stripe, Google Analytics, dan Zapier adalah merek milik pemiliknya masing-masing. Integrasi Vienne tidak menyiratkan sponsor atau dukungan kecuali dinyatakan secara tertulis.”** Ini hanya mitigasi confusion; bukan pengganti izin logo, compatibility testing, atau capability nyata.

Owner guideline URLs untuk verifikasi sebelum design production (halaman tidak dapat diekstrak dalam sesi ini; jangan anggap audit sudah mengonfirmasi setiap detail):

- Salesforce trademark guidelines: https://www.salesforce.com/company/legal/intellectual/trademark-guidelines/
- HubSpot trademarks: https://legal.hubspot.com/trademarks
- Stripe marks: https://stripe.com/legal/marks
- Google Brand Resource Center: https://about.google/brand-resource-center/guidance/
- Zapier brand: https://zapier.com/brand

## 8. Claim-readiness gate yang disarankan

Sebelum label menu berstatus live, pemilik produk harus menyimpan: (1) production URL/screenshot; (2) acceptance test; (3) owner; (4) supported/unsupported matrix; (5) pricing/fee/region caveat; (6) privacy/security basis; (7) trademark/logo approval bila relevan. Tanpa enam bukti pertama:

- **P0 REMOVE-UNTIL-LIVE:** Salesforce, HubSpot, Stripe, Google Analytics, Zapier; payment processing, ticketing/donations, appointment scheduling; badge printing; live attendance; “app” claims; app status; community/affiliates/reviews/case studies bila kosong.
- **P1 VERIFY/RENAME:** seating, dietary, tagging, email broadcast, multi-language, analytics/reporting, API/export, ROI calculator, privacy/security, “Coba gratis”.
- **P2 KEEP:** generic event types dan original callout copy, setelah IA direstrukturisasi dan route mempunyai konten substantif.

## 9. Recommended independent IA (contoh, bukan legal safe harbor)

1. `Solusi` — `Undangan & desain`, `Tamu & RSVP`, `Komunikasi`, `Hari acara`.
2. `Untuk acara` — `Pernikahan`, `Keluarga & tradisi`, `Komunitas`, `Bisnis`.
3. `Panduan` — hanya artikel/template yang sudah ada.
4. `Harga`, `Masuk`, `Mulai membuat`.
5. `Koneksi` hanya muncul bila integration evidence gate lulus; urutkan berdasarkan penggunaan pelanggan Vienne, bukan urutan RSVPify.

Perubahan harus menyentuh **sumbu klasifikasi, membership, jumlah tab, grouping, dan order**, bukan sekadar terjemahan label.

## 10. Sumber

### Hukum/IP resmi

1. U.S. Copyright Office, Circular 33, *Works Not Protected by Copyright*: https://www.copyright.gov/circs/circ33.pdf
2. U.S. Copyright Office FAQ, nama/judul/slogan/frasa pendek dan kemungkinan trademark: https://www.copyright.gov/help/faq/faq-protect.html
3. WIPO Lex, Indonesia Law No. 28 of 2014 on Copyright: https://www.wipo.int/wipolex/en/legislation/details/15600
4. WIPO Lex, Indonesia Law No. 20 of 2016 on Trademarks and Geographical Indications: https://www.wipo.int/wipolex/en/legislation/details/16513

### Kompetitor/platform resmi

5. RSVPify Enterprise (snippet exact forms/registration, ticketing, native integrations): https://rsvpify.com/enterprise/
6. RSVPify Financial Services (snippet exact integrations/API, CRM & Sales): https://rsvpify.com/financial-services/
7. RSVPify Summits & Forums: https://rsvpify.com/summits-forums/
8. RSVPify Gala Guest Management: https://rsvpify.com/gala-guest-management/
9. Cvent Features: https://www.cvent.com/en/event-management-software/features
10. Cvent Event Management Software: https://www.cvent.com/en/event-management-software
11. Cvent Resources: https://www.cvent.com/en/resources
12. Eventbrite official: https://www.eventbrite.com/ ; organizer feature references: https://www.eventbrite.com/organizer/overview/
13. Swoogo official: https://swoogo.events/
14. Bizzabo official: https://www.bizzabo.com/
15. Partiful: https://partiful.com/
16. Paperless Post invitations: https://www.paperlesspost.com/cards/section/invitations
17. Greenvelope: https://www.greenvelope.com/

## 11. Keterbatasan

- Ini desk audit product-risk, bukan legal opinion, registrability search, freedom-to-operate opinion, consumer-law opinion, atau adjudication substantial similarity.
- Maksimum **6 web searches** dipakai sesuai instruksi. `web_extract` dicoba terhadap halaman resmi tetapi gagal karena backend sesi bersifat search-only. Karena itu beberapa perbandingan berdasar exact search snippets resmi dan URL, bukan capture penuh menu pada tanggal audit.
- Tidak ada visual screenshot, archived version, source-history/provenance, analytics pengguna, kontrak partner, trademark registrations, atau production credentials yang diperiksa.
- Repo-wide search memberi negative evidence terbatas, bukan bukti absolut bahwa capability tidak ada di service eksternal/private branch. Status integration tetap **unverified** sampai owner memberi evidence.
- Source lokal menunjukkan registry membuat landing page generik untuk semua 92 destination; keberadaan route/page tidak sama dengan fitur/resource operational.
- Status merek Vienne dan permission lima third-party marks harus diverifikasi pada database/owner terkini dan oleh counsel; istilah pendek yang tidak copyrightable tetap dapat dilindungi merek.
- Halaman kompetitor dapat berubah. Simpan screenshot bertanggal dan comparison matrix sebelum keputusan final atau review counsel.

## 12. Keputusan prioritas

1. **HIGH — RESTRUCTURE:** seluruh event/feature mega-menu yang mengikuti taxonomy/order RSVPify.
2. **HIGH — REMOVE-UNTIL-LIVE:** Salesforce, HubSpot, Stripe, Google Analytics, Zapier dan claims terkait.
3. **HIGH — REMOVE-UNTIL-LIVE:** payments/ticketing/donations/scheduling, onsite app/badge/live claims, dan resource programs yang belum nyata.
4. **MEDIUM — VERIFY/RENAME:** notes objective, security/privacy, ROI, analytics, API/export, multilingual, free-trial CTA.
5. **MEDIUM — CLEARANCE:** merek Vienne di DJKI/WIPO dan kelas relevan.
6. **LOW — KEEP:** istilah event/fitur generik secara individual dan callout Indonesia yang tidak menunjukkan exact overlap—setelah struktur dan truthfulness dibenahi.
