<!-- SUMMARY (first 7 lines — greppable) -->
# Corporate Invitation Directions & Reusable Template Taxonomy
> WHAT: 10 archetype corporate + taksonomi kombinatorial lintas invitation untuk renderer Vienne.
> STATUS: RESEARCH / INPUT ARSITEKTUR, bukan desain final dan bukan salinan situs rujukan.
> OWNER: Oracle
> DEPS: app/.../edit/editor.tsx, lib/invitation/detail-config.ts, app/marketing-registry.ts, template-catalog.md
> GREP: corporate, archetype, taxonomy, renderer, modules, visual-system, accessibility
> UPDATED: 2026-07-18

## 0. Cara membaca dan batas riset
Dokumen ini memecah **struktur pengalaman**, bukan meniru komposisi, copy, ilustrasi, atau identitas rujukan. URL adalah situs nyata yang dapat dipakai tim untuk observasi mandiri; keadaan visualnya dapat berubah. Empat pencarian web dilakukan, sedangkan ekstraksi halaman tidak tersedia pada backend aktif. Karena itu, detail di bawah adalah rekomendasi orisinal yang diinformasikan oleh hasil pencarian dan audit kode—bukan klaim pixel-audit atas setiap URL.

**Prinsip:** template bukan satu skin dengan warna berbeda. Sebuah template adalah resep `archetype + axes + module composition + content rules + tokens + motion policy`. Identitas event terutama lahir dari urutan informasi, jenis hero, density, dan modul utama; palet berada setelahnya.

---

## 1. Sepuluh direction corporate

### C01 — Signal Grid / Conference & Summit
- **Audience / outcome:** peserta profesional, media, sponsor; cepat memahami tema, tanggal, pembicara, track, lalu registrasi.
- **Visual DNA:** editorial-tech, grid 12 kolom, angka/tanggal oversized, rule line, label track; rasio informasi tinggi tanpa terasa dashboard.
- **Palette roles:** `canvas` off-white; `ink` hampir hitam; `brand-primary`; `track-accent` 3–5 warna terkontrol; `surface`; `status`; `focus`. Aksen track hanya untuk metadata, bukan body text.
- **Tipografi gratis/legal:** **Inter** (UI/body, SIL OFL 1.1) + **IBM Plex Sans Condensed** (display/data, OFL). Self-host dan simpan LICENSE.
- **Layout signature:** hero split 7/5; sticky register rail; agenda sebagai timetable horizontal desktop dan cards mobile.
- **Section structure:** hero → credibility strip → themes/tracks → featured speakers → agenda → venue/stream → sponsors → FAQ → sticky CTA.
- **Hero/demo treatment:** kinetic event mark atau live “program snapshot”; jangan autoplay video bersuara.
- **Media:** speaker portrait konsisten 4:5, venue wide 16:9, diagram track; hindari stok handshake.
- **Motion:** line-reveal dan track-filter 150–240 ms; penghitung tidak wajib; `prefers-reduced-motion` menjadi dissolve/no transform.
- **Mobile:** tanggal + CTA sebelum fold; agenda per hari dengan accordion; filter track horizontal scroll berlabel.
- **Accessibility:** agenda tetap tabel semantik/heading yang dapat dibaca; warna track punya label teks; kontras WCAG AA; target ≥44 px.
- **Asset checklist:** logo/event mark SVG, 1 key visual, speaker headshots+alt, agenda terstruktur, sponsor SVG, venue/map, timezone, CTA states, OG 1200×630.
- **Rujukan nyata:** https://websummit.com/ · https://config.figma.com/ · https://conferences.ted.com/

### C02 — Product Stage / Launch & Reveal
- **Audience / outcome:** pelanggan, pers, partner; membangun antisipasi, mendemokan manfaat, mendorong RSVP/watch/remind-me.
- **Visual DNA:** cinematic restraint, satu produk sebagai focal object, ruang negatif besar, chapter storytelling.
- **Palette roles:** `void/canvas`, `product-neutral`, `brand-glow`, `spec-muted`, `success`, `focus`; maksimal satu glow dominan per viewport.
- **Tipografi:** **Manrope** display + **Inter** body (keduanya open-source/OFL; verifikasi file lisensi saat vendoring).
- **Layout signature:** hero full-bleed; chapter bergantian object/detail; spec band modular; CTA dock minimal.
- **Section structure:** reveal hero → promise → demo chapters → proof/spec → host/presenter → date/platform → FAQ → RSVP/watch CTA.
- **Hero/demo:** still produk resolusi tinggi atau video poster + play eksplisit; fallback image wajib; countdown hanya bila tanggal pasti.
- **Media:** render transparan, macro crop, demo video captioned, UI capture tanpa data personal.
- **Motion:** parallax ringan atau crossfade chapter; tidak lebih dari satu motion focal; scrub hanya enhancement.
- **Mobile:** gunakan still/crop khusus portrait; buang parallax berat; CTA dan tanggal selalu terlihat sebelum demo panjang.
- **Accessibility:** kontrol play/pause, captions/transcript, tidak mengandalkan glow; copy manfaat mendahului spesifikasi.
- **Asset checklist:** product cutout WebP/AVIF, poster, demo MP4/WebM, captions VTT, presenter, logo SVG, date/timezone, fallback, OG.
- **Rujukan:** https://www.apple.com/apple-events/ · https://max.adobe.com/ · https://www.samsung.com/global/galaxy/events/

### C03 — Black-Tie Ledger / Gala & Awards
- **Audience / outcome:** VIP, nominee, sponsor; menyampaikan prestise, protokol, dress code, meja/RSVP.
- **Visual DNA:** editorial luxury, serif kontras, fine rules, foil sebagai efek digital hemat, ritme vertikal formal.
- **Palette roles:** `night`, `ivory`, `metal-accent` (bukan teks kecil), `ruby/status`, `surface-raised`, `focus` terang.
- **Tipografi:** **Cormorant Garamond** display + **Source Sans 3** body (Google Fonts/OFL).
- **Layout signature:** centered invitation panel; monogram/seal; nominee grid; programme seperti menu cetak.
- **Section structure:** formal salutation → honoree/cause → date & venue → programme → awards/hosts → dress code → table/meal → partners → RSVP.
- **Hero/demo:** typographic ceremony card, foto venue low-key opsional; nama tamu dapat dipersonalisasi tanpa menggeser hierarchy.
- **Media:** portrait formal, detail venue/table setting, monochrome sponsor marks; jangan memakai glitter loop.
- **Motion:** curtain fade 300 ms, rule draw; reduced-motion langsung statis.
- **Mobile:** centered card menjadi edge-to-edge; dress code/venue/RSVP diringkas dalam info slab.
- **Accessibility:** emas tidak dipakai untuk body; serif minimum nyaman; formulir meal/diet berlabel; bahasa protokol jelas.
- **Asset checklist:** crest SVG, venue 3:2, honoree/host, award categories, programme, dress code, menu/diet, sponsor variants, RSVP deadline.
- **Rujukan:** https://www.metmuseum.org/press-releases/the-met-gala · https://www.oscars.org/oscars · https://www.canneslions.com/

### C04 — Inside Brief / Internal Town Hall & Offsite
- **Audience / outcome:** karyawan lintas fungsi; mengetahui tujuan, agenda, persiapan, kebijakan akses, dan mengonfirmasi hadir.
- **Visual DNA:** warm utility, memo modern, modular cards, foto tim autentik, bahasa langsung.
- **Palette roles:** `company-primary`, `canvas-warm`, `ink`, `team-accent`, `notice`, `confidential`, `focus`.
- **Tipografi:** **Atkinson Hyperlegible Next** atau **Inter** body + **IBM Plex Sans** display (gunakan distribusi berlisensi dan arsipkan license).
- **Layout signature:** “brief at a glance” di hero; checklist persiapan; agenda dan logistics dua kolom.
- **Section structure:** purpose → at-a-glance → agenda → speakers/leads → travel/logistics → what-to-bring → policy/contact → RSVP.
- **Hero/demo:** collage tim atau abstract company pattern; badge `Internal`/access state, bukan visual pemasaran eksternal.
- **Media:** candid team photography dengan consent, floorplan, packing icons; tidak perlu galeri dekoratif.
- **Motion:** hampir none; expand/collapse 120–180 ms; status RSVP feedback jelas.
- **Mobile:** logistics, QR/check-in, emergency contact dapat diakses offline/screenshot-friendly.
- **Accessibility:** plain language; jangan menyampaikan rahasia di alt/OG; authentication/noindex bila internal; timezone dan lokasi tekstual.
- **Asset checklist:** logo, team photo, agenda, owner/PIC, venue/map, travel policy, checklist, access note, emergency contact, calendar file.
- **Rujukan pola informasi:** https://www.atlassian.com/company/events · https://events.microsoft.com/ · https://www.salesforce.com/events/

### C05 — Connection Map / Networking & Matchmaking
- **Audience / outcome:** founders, buyers, members; memahami siapa yang hadir dan memesan/memulai koneksi berkualitas.
- **Visual DNA:** node/connector motif, profile chips, conversational cards; energik tetapi bukan social-media clone.
- **Palette roles:** `canvas`, `ink`, `network-primary`, `role-colors` terbatas, `match-highlight`, `privacy-muted`, `focus`.
- **Tipografi:** **Space Grotesk** display + **Inter** UI/body (OFL).
- **Layout signature:** hero “who you’ll meet”; cluster role/industry; format rounds; CTA RSVP/profile.
- **Section structure:** value proposition → attendee segments → format/how it works → hosts → schedule → venue → code of conduct/privacy → RSVP.
- **Hero/demo:** generative-but-deterministic node map atau portrait mosaic berizin; demo kartu koneksi dengan data fiktif jelas.
- **Media:** portrait natural, venue social zones, icon role; hindari mempublikasikan attendee tanpa consent.
- **Motion:** nodes connect once; hover/focus equivalent; no endless floating avatars.
- **Mobile:** role filters chips, schedule cards; attendee directory optional dan privacy-first.
- **Accessibility:** koneksi tidak dibedakan warna saja; keyboard focus; code of conduct mudah ditemukan; opsi pronoun/name pronunciation.
- **Asset checklist:** host/attendee-consent portraits, role taxonomy, format/rules, schedule, venue zones, privacy statement, conduct policy, CTA.
- **Rujukan:** https://websummit.com/what-to-expect/ · https://www.sxsw.com/ · https://www.meetup.com/

### C06 — Working Canvas / Workshop & Training
- **Audience / outcome:** learner/practitioner; menilai level dan hasil belajar, menyiapkan alat, lalu mendaftar.
- **Visual DNA:** annotation, grid paper, sticky-note shapes yang disiplin, artifact-first.
- **Palette roles:** `paper`, `ink`, `marker-primary`, `marker-secondary`, `exercise-surface`, `prerequisite-warning`, `focus`.
- **Tipografi:** **IBM Plex Mono** untuk label/artifact + **Source Sans 3** body (OFL).
- **Layout signature:** learning outcomes sebagai checklist besar; curriculum stepper; instructor proof card.
- **Section structure:** outcome → audience/level → artifacts you’ll make → curriculum → instructor → requirements → time/venue → capacity → register.
- **Hero/demo:** preview worksheet/template atau before-after artifact, bukan foto kelas generik.
- **Media:** annotated screenshots, instructor portrait, downloadable sample, equipment icons.
- **Motion:** annotation stroke singkat; curriculum accordion; no scroll hijack.
- **Mobile:** outcome dan requirement mendahului bio; download size/format disebut; form singkat.
- **Accessibility:** artifact punya deskripsi tekstual; level/prerequisite eksplisit; worksheet PDF accessible; kode tidak hanya gambar.
- **Asset checklist:** artifact sample, curriculum data, instructor bio/photo, prerequisite/tools, capacity, certificate info, venue/stream, downloadable file.
- **Rujukan:** https://www.eventbrite.com/d/online/workshops/ · https://generalassemb.ly/education · https://www.interaction-design.org/master-classes

### C07 — Broadcast Control / Webinar & Hybrid
- **Audience / outcome:** remote + onsite; memahami timezone, format akses, session value, lalu register/watch.
- **Visual DNA:** broadcast frame, lower-third labels, live/status language, modular episode cards.
- **Palette roles:** `studio-dark/light`, `broadcast-primary`, `live-red` hanya status, `platform-surface`, `caption-bg`, `focus`.
- **Tipografi:** **Roboto Flex** atau **Inter** + **IBM Plex Mono** untuk waktu/status (open-source; simpan lisensi distribusi).
- **Layout signature:** player/poster 16:9 + info rail; mode switch `Online / Onsite`; timezone chip dekat semua waktu.
- **Section structure:** hero/player → what you learn → speakers → run of show → mode/access instructions → tech check → FAQ → registration.
- **Hero/demo:** poster dengan tombol play; sebelum acara = countdown/reminder, saat live = status, setelah = recording/transcript; state machine, bukan template terpisah.
- **Media:** presenter crop aman, slide preview, captioned recording; bitrate variants.
- **Motion:** live pulse maksimal halus; state transitions 150 ms; player obey user control.
- **Mobile:** player tidak sticky berlebihan; CTA di bawah ringkasan; waktu dilokalkan namun timezone sumber tetap terlihat.
- **Accessibility:** captions, transcript, audio description bila relevan, keyboard player, dial-in alternatif, status live via `aria-live` yang tidak bising.
- **Asset checklist:** poster, stream/meeting URL, scheduledAt/timezone, speakers, VTT/transcript, dial-in, tech requirements, platform fallback, recording policy.
- **Rujukan:** https://max.adobe.com/max-online/ · https://events.microsoft.com/ · https://www.apple.com/apple-events/event-stream/index.html

### C08 — Brand Playground / Activation & Pop-up
- **Audience / outcome:** consumer, creator, media; memicu rasa ingin datang, memahami aktivitas/slot, menyimpan lokasi dan berbagi.
- **Visual DNA:** expressive brand world, bold crop, modular “zones”, collectible stamp motif; tetap satu sistem visual.
- **Palette roles:** `brand-field`, `contrast-ink`, `campaign-accent`, `zone-colors` maksimal 3, `utility-surface`, `focus` kontras.
- **Tipografi:** **Archivo Black** display + **Archivo** body (OFL); custom brand font hanya jika bukti lisensi web/embed ada.
- **Layout signature:** poster hero → activation map/zones → timed drops/slots → social proof → location CTA.
- **Section structure:** campaign hook → experiences → schedule/booking → creators/partners → map/access → UGC rules → RSVP/share.
- **Hero/demo:** art-directed campaign still atau short muted loop dengan poster fallback; interactive sticker hanya enhancement.
- **Media:** campaign photography, zone map, creator portraits, vertical social crops; rights/usage metadata wajib.
- **Motion:** punchy 180–260 ms, sticker snap; maksimal 2 families (scale + slide); reduced-motion static poster.
- **Mobile:** thumb-first booking, map external link, vertical assets; dekorasi tidak menutup copy.
- **Accessibility:** pola ekstrem tidak menurunkan contrast; flashing <3/second; UGC consent; lokasi dan slot tersedia sebagai teks.
- **Asset checklist:** campaign KV multi-crop, logo lockup, zone map, slot inventory, creator/partner assets, terms/age rule, UGC consent, directions.
- **Rujukan:** https://www.sxsw.com/ · https://www.canneslions.com/ · https://www.nike.com/experiences

### C09 — Impact Table / Fundraiser & Business Dinner
- **Audience / outcome:** donor, executive, client; memahami cause/business purpose, impact, host, giving/ticket/table options.
- **Visual DNA:** human editorial + quantified proof; formal tetapi hangat; “impact receipt” sebagai signature.
- **Palette roles:** `paper`, `ink`, `cause-primary`, `impact-accent`, `donation-surface`, `trust/status`, `focus`; jangan membuat nominal kecil tampak disabled.
- **Tipografi:** **Newsreader** display + **Source Sans 3** body (OFL).
- **Layout signature:** story/impact split; metric ribbon; table/ticket tiers komparatif; host note.
- **Section structure:** cause/purpose → impact proof → host/honoree → evening programme → venue/menu → ticket/table/donation → transparency → FAQ/CTA.
- **Hero/demo:** portrait dokumenter berizin atau still cause; satu angka dampak terverifikasi, tidak mengeksploitasi subjek.
- **Media:** documentary images with consent/context, impact chart, host portrait, venue; alt factual, bukan sentimental berlebihan.
- **Motion:** count-up hanya jika angka juga langsung tersedia; subtle reveal; pembayaran bebas animasi distraktif.
- **Mobile:** tier cards mudah dibandingkan; fee/benefit jelas; donation CTA tidak mengunci viewport.
- **Accessibility:** nominal dan benefit terbaca; payment errors spesifik; dietary/access needs; transparency link; hindari dark pattern default donation.
- **Asset checklist:** cause statement, verified metrics/source, beneficiary consent, hosts, programme, venue/menu, tiers/tables, tax/receipt text, payment state, sponsor logos.
- **Rujukan:** https://www.unicefusa.org/events · https://www.redcross.org/donations/ways-to-donate/fundraising-ideas-and-resources.html · https://www.onecause.com/blog/fundraising-gala/

### C10 — Chapter Commons / Community & Professional Association
- **Audience / outcome:** anggota/calon anggota; menemukan relevansi lokal/profesi, agenda, benefit komunitas, lalu hadir atau bergabung.
- **Visual DNA:** civic editorial, member voices, badge/chapter motif, inclusive photography, density sedang.
- **Palette roles:** `community-canvas`, `institution-ink`, `chapter-primary`, `discipline-accent`, `member-surface`, `notice`, `focus`.
- **Tipografi:** **Public Sans** body/display + **Merriweather** quote/editorial (OFL).
- **Layout signature:** local chapter masthead; event facts card; member quote braid; related events.
- **Section structure:** local relevance → event facts → topic/outcome → speakers/committee → agenda → venue/access → member/nonmember rules → code of conduct → RSVP/join.
- **Hero/demo:** community group/venue image atau typographic chapter seal; jangan memakai token portrait yang homogen.
- **Media:** representasi demografis nyata dengan consent, committee portrait, venue accessibility photos, partner marks.
- **Motion:** restrained fades; related-event carousel harus punya controls atau lebih baik grid.
- **Mobile:** facts card pertama; maps + transit + accessibility; member pricing/rules eksplisit.
- **Accessibility:** code of conduct, pronoun, access accommodation contact, bahasa inklusif, alt yang tidak mengasumsikan identitas.
- **Asset checklist:** chapter lockup, event image, topic, committee/speakers, agenda, membership rule, venue/access/transit, conduct policy, related events.
- **Rujukan:** https://www.meetup.com/ · https://www.acm.org/events · https://www.ieee.org/conferences/index.html

---

## 2. Taksonomi kombinatorial lintas semua invitation

### 2.1 Axes (enum terkontrol)
| Axis | Nilai reusable | Dampak renderer |
|---|---|---|
| **Tone** | `ceremonial`, `intimate`, `joyful`, `playful`, `editorial`, `professional`, `bold-campaign`, `spiritual`, `civic` | voice, radius, whitespace, contrast, image treatment |
| **Density** | `airy`, `balanced`, `informational`, `program-heavy` | max-width, spacing scale, jumlah kolom, disclosure agenda |
| **Media mode** | `typographic`, `single-portrait`, `dual-portrait`, `documentary`, `product-object`, `campaign-kv`, `video-broadcast`, `gallery-led`, `artifact-led` | hero primitive, crop contracts, preload budget |
| **Motif family** | `botanical`, `geometry-grid`, `line-ornament`, `paper-annotation`, `seal-crest`, `nodes`, `broadcast-frame`, `collage`, `gradient-field`, `none` | dekorasi sebagai SVG/CSS layer terpisah dari content |
| **Typography class** | `humanist-sans`, `grotesk-sans`, `geometric-sans`, `editorial-serif`, `high-contrast-serif`, `mono-accent`, `display-poster` | font pair, scale, tracking; bukan nama font langsung |
| **Navigation mode** | `linear-scroll`, `sticky-anchor`, `chapter-snap`, `tabbed-program`, `cover-gate` | shell dan IA; cover-gate cocok undangan personal, bukan default corporate |
| **Transition level** | `none`, `functional`, `expressive`, `cinematic` | motion tokens dan performance budget; selalu reduced-motion fallback |
| **Event-module compatibility** | `required`, `recommended`, `optional`, `forbidden`, plus `variant` | komposer module dan validasi recipe |

**Model data yang disarankan:**
```ts
type TemplateRecipe = {
  id: string; occasion: Occasion[]; archetype: string;
  axes: { tone: Tone; density: Density; mediaMode: MediaMode;
    motif: Motif; typography: TypeClass; navigation: NavMode; transition: MotionLevel };
  modules: Record<ModuleId, { compatibility: 'required'|'recommended'|'optional'|'forbidden'; variant?: string }>;
  tokens: { palette: PaletteRoles; typeScale: string; spacing: string; radius: string; motion: string };
  hero: { variant: string; requiredAssets: string[]; fallback: string };
  sectionOrder: ModuleId[]; constraints: string[]; schemaVersion: number;
};
```
Renderer sebaiknya punya `InvitationShell`, `HeroRenderer`, registry modul independen, dan recipe tervalidasi. Content schema tidak menentukan visual; recipe tidak menyimpan konten event.

### 2.2 Event-module compatibility matrix
`R` required, `A` recommended, `O` optional, `F` forbidden/default hidden.

| Module canonical | Wedding | Birthday | Aqiqah/Khitanan | Tasyakuran | Corporate conf | Launch | Gala/dinner | Webinar | Workshop | Networking/community |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| identity/profile | R | R | R | R | R | R | R | R | R | R |
| event facts/location/timezone | R | R | R | R | R | R | R | R | R | R |
| RSVP/registration | A | A | A | A | R | A | R | R | R | R |
| agenda/sessions | O | O | A | A | R | A | R | R | R | A |
| speakers/hosts/honoree | O | F | F | O | R | R | R | R | R | A |
| gallery | A | A | A | O | O | O | O | F | O | O |
| story/testimony | R | O | O | A | O | O | A | O | O | A |
| streaming | O | O | O | O | A | A | O | R | A | O |
| ticket/donation/table | O | O | O | O | O | O | R | O | O | O |
| sponsor/partner | O | F | F | F | A | A | A | O | O | O |
| meal/diet/seating | A | O | A | O | O | O | R | F | O | O |
| access/logistics | A | A | A | A | R | A | R | R | R | R |
| gift | A | O | O | O | F | F | F* | F | F | F |
| guestbook/wishes | O | A | A | A | F | F | F | F | F | O |

`F*`: gala fundraiser memakai donation/ticketing, bukan modul “gift” personal.

### 2.3 Guardrail koherensi (validator, bukan saran samar)
1. **Satu dominant mode:** hanya satu `mediaMode` menguasai hero. Gallery/video lain menjadi section pendukung.
2. **Tone–type lock:** `spiritual` hanya untuk event relevan; `playful` dilarang untuk fundraiser serius/internal policy; `ceremonial` + `display-poster` perlu body netral.
3. **Density–navigation:** `program-heavy` wajib `sticky-anchor` atau `tabbed-program`; dilarang `cover-gate` tanpa skip langsung.
4. **Motif budget:** satu motif primer + maksimal satu tekstur sekunder; `botanical + nodes + seal` invalid.
5. **Type budget:** maksimal dua family dan tiga peran; `high-contrast-serif` tidak boleh body kecil; `mono-accent` maksimal metadata.
6. **Color semantics:** 1 primary, 1 accent, neutral scale, semantic states. Track/role colors maksimal lima dan selalu punya label/shape.
7. **Motion compatibility:** `cinematic` hanya dengan `single/product/campaign/video`; dilarang pada `program-heavy`; no autoplay audio; reduced-motion wajib.
8. **Module-first identity:** bila agenda required, recipe wajib punya agenda variant khusus; jangan render semua sebagai card identik. Galeri wedding ≠ product demo ≠ speaker roster.
9. **Hero truthfulness:** countdown butuh datetime+timezone; live badge butuh state; personalization tidak boleh bocor ke OG/cache publik.
10. **Asset completeness:** recipe tidak publish jika required asset tak ada; fallback eksplisit, tidak pakai placeholder acak.
11. **A11y gate:** AA text, 200% zoom, keyboard, visible focus, headings linear, target 44 px, captions/transcript, reduced motion.
12. **Performance gate:** hero image responsive; poster sebelum video; font subset/self-host; decorative SVG lazy; target awal ≤2 font families dan ≤1 hero video.
13. **Cultural guardrail:** motif agama/adat hanya atas pilihan event/user dan tidak dicampur sebagai dekor generik.
14. **Forbidden-module hard stop:** recipe invalid bila module `forbidden` aktif, bukan sekadar disembunyikan CSS.

---

## 3. Audit current field/modules dan registry

### 3.1 Yang ada
- `editor.tsx` mendefinisikan 16 tab: settings, couple/profile, theme, events, music, greetings, gift, RSVP, gallery, guestbook, eventPlanner, streaming, story, Instagram Story, quote, WhatsApp. Corporate menyembunyikan `story`, `instagramStory`, `gift`, `music`, `greetings`; theme hanya muncul jika add-on; planner selalu di luar editor.
- Corporate editor saat ini mengekspos `corporateProfile`: organizationName, eventName, category, dressCode, PIC name/phone/email, logo, description. Enum: gathering, product_launch, seminar, conference, webinar, gala_award, RUPS, training, other.
- `detail-config.ts` sudah lebih kaya daripada UI: corporate `agenda[]` dan `speakers[]`; events punya endAt/address/note; streaming punya scheduledAt; gallery punya layout/assetIds.
- Schema juga punya modul operasional: `registrationForm` + custom/conditional questions, meal preferences, communications/reminder, check-in, seating, secondary events, ticketing free/paid/donation, event operations.
- Modul operasional sebagian diedit di `manage/module-config-panel.tsx`, terpisah dari editor undangan. Blueprint corporate sudah merekomendasikan registration, agenda/speakers, check-in, communications, analytics.
- `marketing-registry.ts` bukan template/component registry: ia daftar 52 event-type landing topics, 29 feature topics, 16 resource/company topics. Cakupannya jauh lebih luas daripada enum occasion produk.
- DB `templates` hanya menyimpan `name`, `category`, `defaultConfig`, `thumbnail`, `isPremium`, timestamps. Belum ada recipe axes, module compatibility, preview, version, capability, font/license, atau asset requirements.
- `template-catalog.md` baru mengusulkan filter occasion/style/color/format. Ini berguna untuk discovery tetapi `style` terlalu datar untuk menjaga renderer koheren.

### 3.2 Gap dan risiko nyata
1. **Schema–UI drift:** agenda/speakers corporate ada di Zod tetapi tidak dapat diedit di `editor.tsx`; end time/address/note juga hilang dari event UI.
2. **Dua vocab module:** editor memakai `events/rsvp`; blueprint memakai `agenda/registration`; manage memakai slug lain. Butuh canonical `ModuleId` + adapter alias.
3. **Corporate terlalu generik:** semua subtype masuk profile dan events yang sama; tidak ada sponsor, session track, honoree/impact, product demo, access/logistics, venue modality, mode hybrid, atau CTA intent.
4. **Visibility bukan compatibility:** `HIDDEN_MODULES_BY_TYPE` hanya occasion-level; gala dan webinar sama-sama corporate padahal modulnya berlawanan.
5. **Template record bukan recipe:** renderer tidak dapat memvalidasi kombinasi axes/asset/module maupun melakukan migrasi versi.
6. **Media model minim metadata:** perlu focal point/crop, alt, rights/consent, poster/captions, aspect variants, dominant role.
7. **A11y belum content-gated:** upload preview memakai alt kosong; belum ada field alt/caption/transcript/reduced-motion policy.
8. **Kategori corporate kurang:** networking, brand activation, fundraiser/business dinner, internal/offsite, professional/community belum enum.
9. **Ticket/donation foundation belum payment integration** (UI sendiri menandainya demikian); jangan menjanjikan transaksi live.

### 3.3 Perubahan arsitektur yang disarankan
- Buat registry tunggal `module-registry.ts`: schema key, public renderer, editor panel, manage panel, supported occasions, data requirements, variants.
- Tambah `corporateSubtype` terkontrol: `conference|launch|gala_awards|internal|networking|workshop|webinar_hybrid|brand_activation|fundraiser_dinner|community_professional|other`; migrasikan enum lama dengan mapping.
- Pisahkan modul public (`speakerRoster`, `agenda`, `sponsors`, `impact`, `productDemo`, `accessLogistics`) dari modul operations (`checkIn`, `communications`, `seating`).
- Simpan recipe/version sebagai tabel/JSON tervalidasi; jangan masukkan seluruh visual state ke `defaultConfig` konten.
- Kembangkan catalog tags untuk discovery dari axes, tetapi tampilkan hanya 3–4 filter ramah pengguna; taxonomy penuh internal.

---

## 4. Shortlist MVP dan urutan produksi

### MVP empat recipe (cakupan maksimum, komponen tidak terasa skin sama)
1. **Signal Grid / Conference** — membangun agenda, speakers, sponsors, tracks, sticky registration; basis paling reusable.
2. **Product Stage / Launch** — memaksa hero object/demo dan chapter layout yang berbeda total.
3. **Broadcast Control / Webinar-Hybrid** — membangun state before/live/after, timezone, captions, poster/player.
4. **Black-Tie Ledger / Gala-Dinner** — membangun ceremonial typography, programme, dress/meal/seating dan ticket/donation variant.

### Urutan produksi
1. **Kontrak:** canonical ModuleId, corporateSubtype, Recipe Zod schema, alias/migration, compatibility validator.
2. **Primitives:** token roles, type loader+license manifest, responsive media/focal point, accessible CTA/facts, motion provider/reduced motion.
3. **Core modules:** identity, event facts/timezone, RSVP/registration, agenda variants, speakers/hosts, venue/access.
4. **Recipe 1 Signal Grid**; uji agenda kosong/padat, 1/50 speaker, mobile dan keyboard.
5. **Recipe 2 Product Stage**; tambah media object, demo chapter, poster/fallback.
6. **Recipe 3 Broadcast Control**; state machine dan captions/transcript.
7. **Recipe 4 Black-Tie Ledger**; programme, dress code, meal/seating, ticket/donation (label beta sampai payment nyata).
8. **Catalog/editor:** preview per recipe, required-asset checklist, subtype-driven panels; expose agenda/speakers yang sudah ada.
9. **QA gates:** visual regression per subtype, content extremes ID/EN, 320 px/200% zoom, keyboard/screen reader, reduced motion, LCP/media budget.
10. **Gelombang 2:** Working Canvas → Connection Map → Impact Table → Inside Brief → Brand Playground → Chapter Commons.

**Definition of done recipe:** bukan sekadar hero bagus; wajib punya empty/error/loading states, mobile-specific composition, all required modules, asset fallback, legal font manifest, a11y/performance checks, dan snapshot dengan konten pendek serta ekstrem.

---

## 5. Sumber dan status verifikasi

### Sumber web yang benar-benar muncul pada pencarian
- Web Summit: https://websummit.com/ dan https://websummit.com/what-to-expect/
- Figma Config: https://config.figma.com/
- Adobe MAX / MAX Online: https://max.adobe.com/ dan https://max.adobe.com/max-online/
- Apple Events: https://www.apple.com/apple-events/ dan event stream terkait
- SXSW: https://www.sxsw.com/
- TED Conferences: https://conferences.ted.com/
- OneCause fundraiser guide: https://www.onecause.com/blog/fundraising-gala/
- SIL Open Font License: https://openfontlicense.org/
- Google Fonts Manrope / IBM Plex Sans: https://fonts.google.com/specimen/Manrope · https://fonts.google.com/specimen/IBM+Plex+Sans
- Inter official/GitHub: https://rsms.me/inter/ · https://github.com/rsms/inter

### Sumber repository yang diaudit
- `app/(customer)/dashboard/invitations/[id]/edit/editor.tsx`
- `lib/invitation/detail-config.ts`
- `app/marketing-registry.ts`
- `app/(customer)/dashboard/event-blueprint/picker.tsx`
- `app/(customer)/dashboard/invitations/[id]/manage/module-config-panel.tsx`
- `lib/db/schema.ts`
- `docs/systems/template-catalog.md`

### Gap verifikasi riset
Backend ekstraksi URL tidak tersedia, sehingga situs rujukan tambahan di tiap direction diperlakukan sebagai **alamat observasi**, bukan bukti bahwa elemen visual tertentu masih tampil hari ini. Sebelum design freeze, lakukan browser/pixel audit bertanggal, cek redirect/geo wall, arsipkan screenshot internal dengan sumber, dan verifikasi lisensi setiap file font aktual (bukan hanya nama family). Tidak ada klaim bahwa Vienne boleh menyalin aset/copy/layout rujukan.
