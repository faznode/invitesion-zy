<!-- SUMMARY (first 7 lines — greppable) -->
# Riset Format Halaman — Seluruh Destination Menu Fitur
> WHAT: Audit 28/28 destination menu Fitur dan format halaman berbasis pola platform event/SaaS nyata.
> STATUS: RESEARCH COMPLETE — coverage 100%, gap 0
> OWNER: Oracle
> DEPS: app/marketing-header.tsx, app/marketing-registry.ts
> GREP: feature menu, page archetype, integrations, references, mobile
> UPDATED: 2026-07-18

## Metode, batas bukti, dan aturan desain

Sumber kebenaran inventaris adalah `marketing-header.tsx` baris 36–42; registry pembanding adalah `marketing-registry.ts` baris 63–92. Keduanya berisi **28 destination unik**, tersebar di 6 tab dan 8 group. Slug dihitung mengikuti `slugifyMarketingTitle()` (huruf kecil, `&` menjadi `and`, pemisah menjadi `-`). Empat query web digunakan—tidak lebih—untuk mencari halaman resmi RSVPify, Eventbrite, Cvent, Stripe, HubSpot, dan Zapier. `web_extract` dicoba pada URL hasil, tetapi backend sesi ini search-only dan menolak ekstraksi; karena itu observasi faktual dibatasi pada title/description hasil pencarian, tanpa mengarang detail halaman yang tidak terlihat. URL tetap disediakan sebagai referensi untuk review visual lanjutan.

Semua rekomendasi adalah **abstraksi pola**, bukan final design atau copy kompetitor. Terapkan sistem Vienne: light-only, aksen pink secukupnya, Manrope, editorial modern, radius 8–11px; screenshot/mockup harus produk Vienne sendiri.

### Pola section bersama

- **A — Capability/product page:** Nav/breadcrumb → hero outcome + UI → trust strip → problem/context → 3–4 capability bands → workflow 3 langkah → scenario/use-case → proof → FAQ → final CTA.
- **B — Transaction page:** Nav → hero + checkout/ticket demo → trust/security → setup flow → controls → buyer experience → settlement/reporting → proof → FAQ → CTA.
- **C — Operational app page:** Nav → hero + device demo → reliability strip → before/during/after flow → core controls → edge/offline states → live insight → proof → FAQ → CTA.
- **D — Integration page:** Nav/breadcrumb → logo-pair hero → value outcomes → “data yang mengalir” diagram → setup steps → recipes/use cases → governance/error states → related integrations → FAQ/docs → CTA.

## Coverage expected vs researched

| Tab | Group | Expected dari source | Researched | Gap |
|---|---|---:|---:|---:|
| Forms, Registration & AI | Form & Registration | 4 | 4 | 0 |
| Ticketing & Payments | Ticketing & Payment | 4 | 4 | 0 |
| Guest Management | Guest Management | 5 | 5 | 0 |
| Websites & Invitations | Website & Invitation | 5 | 5 | 0 |
| Check-in & Insights | Check-in & Insights | 4 | 4 | 0 |
| Integrations | CRM & Sales | 2 | 2 | 0 |
| Integrations | Payments & Analytics | 2 | 2 | 0 |
| Integrations | Automation & Custom | 2 | 2 | 0 |
| **TOTAL** | **8 group** | **28** | **28** | **0** |

---

## 1. Event registration
- **Slug/URL lokal:** `/features/event-registration`
- **Job-to-be-done:** Membuat alur registrasi branded, menangkap data yang tepat, dan mengelola perubahan/kapasitas tanpa spreadsheet.
- **Page archetype:** A — capability flagship.
- **Urutan section lengkap:** hero outcome + builder preview → trust strip → persoalan data terpencar → build/publish/collect → conditional questions & capacity → confirmation/day-of handoff → use cases → testimonial/metric → FAQ → CTA.
- **UI/product-demo blocks:** split-screen editor/preview; field logic; capacity/waitlist state; registrant table; confirmation preview.
- **Proof/trust blocks:** jumlah registrasi/acara, logo pengguna, testimonial operator, privacy/payment assurance; jangan klaim angka sebelum ada data.
- **CTA:** Primer “Buat formulir registrasi”; sekunder “Lihat demo alur”.
- **Data/asset:** screenshot Vienne, sample schema pertanyaan, event funnel anonim, logo berizin, testimonial terverifikasi.
- **Mobile adaptation:** hero preview menjadi swipe cards; editor/preview ditoggle; tabel menjadi guest cards; CTA sticky bawah.
- **Referensi:** [RSVPify Registration](https://rsvpify.com/event-registration/) · [Cvent](https://www.cvent.com/) · [Cvent registration overview](https://www.cvent.com/en/blog/events/top-event-registration-options)
- **Adapt/avoid:** Adaptasi orientasi lifecycle dan hubungan registration→check-in. Hindari menyalin headline, komposisi visual, atau klaim enterprise kompetitor.

## 2. Online RSVPs
- **Slug/URL lokal:** `/features/online-rsvps`
- **Job-to-be-done:** Mengumpulkan hadir/tidak hadir, plus-one, dan respons lanjutan dengan friksi minimum.
- **Page archetype:** A — guest journey.
- **Urutan section lengkap:** hero RSVP tamu → proof strip → respons dalam hitungan detik → invite/search/respond flow → plus-one & household → reminders/change response → dashboard host → social proof → FAQ → CTA.
- **UI/product-demo blocks:** phone RSVP flow, invite lookup, plus-one stepper, confirmation, response dashboard.
- **Proof/trust blocks:** completion rate milik Vienne bila tersedia, testimonial host, privacy note, responsive/device proof.
- **CTA:** “Buat RSVP online” + “Coba sebagai tamu”.
- **Data/asset:** rekaman alur 15 detik, contoh household, empty/error states, data respons anonim.
- **Mobile adaptation:** demo native-width; satu pertanyaan per layar; progress ring; thumb-safe CTA; dashboard cards.
- **Referensi:** [RSVPify](https://rsvpify.com/) · [RSVPify Features](https://rsvpify.com/features/) · [RSVPify Registration](https://rsvpify.com/event-registration/)
- **Adapt/avoid:** Adaptasi demo dari perspektif tamu dan host. Hindari menyamakan RSVP dengan ticket checkout atau menjanjikan conversion tanpa bukti.

## 3. Form builder
- **Slug/URL lokal:** `/features/form-builder`
- **Job-to-be-done:** Menyusun pertanyaan dan logika form sesuai acara tanpa coding.
- **Page archetype:** A — builder/product-led.
- **Urutan section lengkap:** hero editor interaktif → template proof → drag/configure/preview → field types → conditional logic → brand/theme → validation & response management → templates/use cases → proof → FAQ → CTA.
- **UI/product-demo blocks:** canvas editor, property drawer, conditional branch map, live preview, reusable block library.
- **Proof/trust blocks:** accessibility checklist, autosave/version assurance, testimonial, template count yang tervalidasi.
- **CTA:** “Mulai dari template” + “Bangun form kosong”.
- **Data/asset:** UI states, field inventory, template thumbnails Vienne, GIF drag-and-drop, WCAG test result.
- **Mobile adaptation:** tampilkan konsumsi form, bukan editor penuh; editor mobile berupa reorder list + bottom sheet properti.
- **Referensi:** [RSVPify Registration](https://rsvpify.com/event-registration/) · [Cvent](https://www.cvent.com/) · [Cvent Features](https://www.cvent.com/en/event-management-software/features)
- **Adapt/avoid:** Adaptasi live preview dan progresif disclosure. Hindari canvas padat ala desktop di mobile dan template visual kompetitor.

## 4. Embeddable forms
- **Slug/URL lokal:** `/features/embeddable-forms`
- **Job-to-be-done:** Menanam registrasi/RSVP di situs sendiri tanpa memutus brand atau pelacakan.
- **Page archetype:** A — technical capability.
- **Urutan section lengkap:** hero website+embed → compatibility strip → copy/paste flow → inline/modal options → responsive theming → tracking & security → CMS scenarios → proof → developer FAQ → CTA.
- **UI/product-demo blocks:** embed code, live site frame, width/theme controls, success callback, error/fallback preview.
- **Proof/trust blocks:** domain/security note, performance budget terukur, browser/CMS compatibility, support link.
- **CTA:** “Buat form untuk disematkan” + “Lihat panduan embed”.
- **Data/asset:** snippet asli, demo domain, Lighthouse/performance result bila diuji, CMS icons berizin.
- **Mobile adaptation:** code horizontally scrollable + copy button; live embed full-width; modal berubah bottom sheet.
- **Referensi:** [RSVPify Registration](https://rsvpify.com/event-registration/) · [Cvent](https://www.cvent.com/) · [Cvent Features](https://www.cvent.com/en/event-management-software/features)
- **Adapt/avoid:** Adaptasi proof lewat demo hidup dan dokumentasi. Hindari klaim “works everywhere” tanpa matrix pengujian.

## 5. Event ticketing
- **Slug/URL lokal:** `/features/event-ticketing`
- **Job-to-be-done:** Menjual dan mengelola beberapa tipe tiket dari publish hingga scan masuk.
- **Page archetype:** B — transaction lifecycle.
- **Urutan section lengkap:** hero ticket storefront → payment/trust strip → create ticket tiers → checkout → promo/capacity → QR delivery → scan/day-of → sales reporting → organizer proof → fee FAQ → CTA.
- **UI/product-demo blocks:** tier editor, storefront, checkout, QR ticket, sales dashboard, sold-out state.
- **Proof/trust blocks:** transparansi biaya, payment security, payout timing yang benar, testimonial organizer.
- **CTA:** “Buat event bertiket” + “Lihat simulasi pembeli”.
- **Data/asset:** sample ticket taxonomy, checkout recording, fee table lokal, QR demo, dashboard dummy berlabel.
- **Mobile adaptation:** ticket cards stacked; checkout one-column; wallet-friendly pass; sales KPI swipe cards.
- **Referensi:** [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/) · [Eventbrite Pricing](https://www.eventbrite.com/organizer/pricing/) · [RSVPify](https://rsvpify.com/)
- **Adapt/avoid:** Adaptasi cerita end-to-end sell→scan→report dan fee clarity. Hindari copy atau model pricing Eventbrite.

## 6. Donations
- **Slug/URL lokal:** `/features/donations`
- **Job-to-be-done:** Mengizinkan tamu memberi donasi bersamaan dengan pendaftaran secara transparan.
- **Page archetype:** B — conversion/trust.
- **Urutan section lengkap:** hero donation checkout → trust/security → fixed/custom amount → suggested impact → donor fields/anonymity → receipt & confirmation → organizer reconciliation → nonprofit scenario → proof → FAQ → CTA.
- **UI/product-demo blocks:** amount selector, impact labels, anonymous toggle, receipt, donation ledger/export.
- **Proof/trust blocks:** security processor, disclosure fee/refund, consent/privacy, beneficiary identity.
- **CTA:** “Tambahkan donasi” + “Lihat pengalaman donor”.
- **Data/asset:** checkout prototype, receipt sample, legal/tax disclaimer lokal yang ditinjau, impact assets milik pengguna.
- **Mobile adaptation:** amount chips 2 kolom; payment controls native; ringkasan sticky; ledger cards.
- **Referensi:** [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/) · [Eventbrite charity gala](https://www.eventbrite.com/sell-tickets/charity-galas/) · [RSVPify](https://rsvpify.com/)
- **Adapt/avoid:** Adaptasi trust dekat payment dan rekonsiliasi. Hindari implied tax-deductibility atau impact claim tanpa bukti.

## 7. Appointment scheduling
- **Slug/URL lokal:** `/features/appointment-scheduling`
- **Job-to-be-done:** Membiarkan peserta memilih slot yang tersedia tanpa bentrok atau percakapan bolak-balik.
- **Page archetype:** A — workflow scheduler.
- **Urutan section lengkap:** hero slot picker → availability proof → define services/hosts → capacity & buffers → attendee booking → reminders/reschedule → calendar/admin view → scenarios → proof → FAQ → CTA.
- **UI/product-demo blocks:** slot picker, timezone indicator, host assignment, buffer rules, confirmation/reschedule.
- **Proof/trust blocks:** timezone clarity, conflict prevention evidence dari test, calendar privacy, testimonial.
- **CTA:** “Buat jadwal appointment” + “Coba pilih slot”.
- **Data/asset:** realistic calendar dataset, timezone cases, cancellation states, notification preview.
- **Mobile adaptation:** date carousel + slot list; filters bottom sheet; admin calendar agenda view.
- **Referensi:** [Cvent Features](https://www.cvent.com/en/event-management-software/features) · [Cvent Event Management](https://www.cvent.com/en/event-marketing-management) · [RSVPify Features](https://rsvpify.com/features/)
- **Adapt/avoid:** Adaptasi outcome dan edge-state demo. Hindari kalender desktop diperkecil atau klaim sinkronisasi yang belum ada.

## 8. Payment processing
- **Slug/URL lokal:** `/features/payment-processing`
- **Job-to-be-done:** Menerima pembayaran event dengan checkout aman, payout jelas, dan rekonsiliasi mudah.
- **Page archetype:** B — trust-heavy fintech.
- **Urutan section lengkap:** hero checkout+payout → security/payment methods → payment flow → fees/payout/refund → fraud/failure states → reconciliation/report → use cases → compliance proof → FAQ → CTA.
- **UI/product-demo blocks:** checkout, method selector, payment status timeline, refund action, payout ledger.
- **Proof/trust blocks:** processor identity, PCI scope yang akurat, fee table, status uptime/support; tanpa badge palsu.
- **CTA:** “Aktifkan pembayaran” + “Lihat biaya & payout”.
- **Data/asset:** policy/fee matrix lokal, method logos berizin, status samples, security review.
- **Mobile adaptation:** one-column checkout, numeric keyboard, sticky total, ledger compact cards.
- **Referensi:** [Eventbrite Payment](https://www.eventbrite.com/organizer/features/event-payment/) · [Stripe](https://stripe.com/) · [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/)
- **Adapt/avoid:** Adaptasi transparansi payment→payout dan trust hierarchy. Hindari meniru visual Stripe atau mengklaim sertifikasi Vienne yang tidak dimiliki.

## 9. Guest list management
- **Slug/URL lokal:** `/features/guest-list-management`
- **Job-to-be-done:** Menyatukan identitas, household, plus-one, status, dan catatan tamu.
- **Page archetype:** A — data workspace.
- **Urutan section lengkap:** hero guest workspace → scale/trust → import/add/invite → household & plus-one → status/filter/tag → edit/audit → handoff seating/check-in → proof → FAQ → CTA.
- **UI/product-demo blocks:** table, guest drawer, household graph, bulk action, import mapping, duplicate resolution.
- **Proof/trust blocks:** privacy/access roles, import accuracy test, testimonial host, backup/export assurance.
- **CTA:** “Impor daftar tamu” + “Lihat workspace”.
- **Data/asset:** CSV sample, anonymized guest dataset, bulk-state screens, permission matrix.
- **Mobile adaptation:** searchable guest cards; bulk action tray; drawer full-screen; quick add thumb-safe.
- **Referensi:** [RSVPify Guest List](https://rsvpify.com/guest-list-management/) · [RSVPify Registration](https://rsvpify.com/event-registration/) · [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/)
- **Adapt/avoid:** Adaptasi guest list sebagai system of record. Hindari tabel mini tak terbaca dan data tamu nyata.

## 10. Seating charts
- **Slug/URL lokal:** `/features/seating-charts`
- **Job-to-be-done:** Menempatkan tamu ke meja/kelompok dengan cepat sambil melihat konflik dan kapasitas.
- **Page archetype:** A — visual builder.
- **Urutan section lengkap:** hero seating canvas → drag/drop proof → create layout → assign/filter → capacity/conflict → collaborate/change → print/share → scenarios → proof → FAQ → CTA.
- **UI/product-demo blocks:** floor canvas, table objects, guest tray, capacity badge, conflict alert, print preview.
- **Proof/trust blocks:** autosave, export/print fidelity, testimonial planner, realistic scale test.
- **CTA:** “Buat seating chart” + “Coba demo drag-and-drop”.
- **Data/asset:** venue layouts orisinal, sample guests, animation, print PDF sample.
- **Mobile adaptation:** mobile fokus lookup/assignment; canvas memakai pan/zoom + minimap; full editing disarankan tablet/desktop secara jujur.
- **Referensi:** [RSVPify Seating Chart](https://rsvpify.com/seating-chart-maker/) · [RSVPify Guest List](https://rsvpify.com/guest-list-management/) · [RSVPify Features](https://rsvpify.com/features/)
- **Adapt/avoid:** Adaptasi demonstrasi manipulasi langsung. Hindari menyembunyikan batas usability mobile.

## 11. Menu & dietary
- **Slug/URL lokal:** `/features/menu-and-dietary`
- **Job-to-be-done:** Mengumpulkan pilihan makanan/alergi dan memberi ringkasan aman kepada katering.
- **Page archetype:** A — structured collection.
- **Urutan section lengkap:** hero meal choice → privacy note → configure menus → guest/household response → allergy detail → validation/change → caterer summary/export → scenario → proof → FAQ → CTA.
- **UI/product-demo blocks:** meal cards, allergy chips + free text, household matrix, count dashboard, export preview.
- **Proof/trust blocks:** disclaimer bahwa bukan saran medis, privacy/access, count accuracy test, caterer testimonial.
- **CTA:** “Tambahkan pilihan menu” + “Lihat ringkasan katering”.
- **Data/asset:** taxonomy diet lokal, allergen labels yang ditinjau, sample export, consent wording.
- **Mobile adaptation:** selectable cards; household accordion; allergen review screen sebelum submit.
- **Referensi:** [RSVPify Registration](https://rsvpify.com/event-registration/) · [RSVPify Guest List](https://rsvpify.com/guest-list-management/) · [Cvent Features](https://www.cvent.com/en/event-management-software/features)
- **Adapt/avoid:** Adaptasi structured input→operational summary. Hindari klaim keselamatan absolut atau ikon alergi ambigu.

## 12. Contact tagging
- **Slug/URL lokal:** `/features/contact-tagging`
- **Job-to-be-done:** Menyegmentasi tamu agar filter, komunikasi, dan follow-up relevan.
- **Page archetype:** A — CRM micro-feature.
- **Urutan section lengkap:** hero tagged guest list → use-case chips → create/apply tags → bulk/automatic tagging → filter segments → send/export workflow → governance → proof → FAQ → CTA.
- **UI/product-demo blocks:** tag manager, bulk action, rule preview, segmented counts, guest profile timeline.
- **Proof/trust blocks:** role/access, audit trail bila ada, testimonial, duplicate/merge behavior.
- **CTA:** “Rapikan kontak dengan tag” + “Lihat contoh segmentasi”.
- **Data/asset:** taxonomy contoh, before/after list, rules demo, anonymized dataset.
- **Mobile adaptation:** chips horizontal scroll; filter bottom sheet; bulk selection toolbar sticky.
- **Referensi:** [RSVPify Guest List](https://rsvpify.com/guest-list-management/) · [Cvent for Marketers](https://www.cvent.com/en/platform/marketers) · [Cvent Essentials](https://www.cvent.com/en/event-marketing-management/cvent-essentials)
- **Adapt/avoid:** Adaptasi segmentation-to-action. Hindari istilah CRM enterprise yang melebihi kemampuan produk.

## 13. Email communications
- **Slug/URL lokal:** `/features/email-communications`
- **Job-to-be-done:** Mengirim undangan, reminder, dan update ke segmen tepat serta memantau hasil.
- **Page archetype:** A — campaign workflow.
- **Urutan section lengkap:** hero composer+inbox → delivery/trust → compose/brand → segment/personalize → schedule → delivery states → engagement report → lifecycle recipes → proof → FAQ → CTA.
- **UI/product-demo blocks:** composer, token preview, recipient segment, schedule control, delivery/open dashboard, unsubscribe state.
- **Proof/trust blocks:** consent/unsubscribe, sender/authentication transparency, metric definitions, privacy.
- **CTA:** “Kirim update acara” + “Lihat template alur”.
- **Data/asset:** original email templates, inbox previews, deliverability data hanya jika nyata, consent copy.
- **Mobile adaptation:** composer blocks stacked; preview toggle; stats cards; sticky test-send action.
- **Referensi:** [Cvent for Marketers](https://www.cvent.com/en/platform/marketers) · [Cvent Event Marketing Platform](https://www.cvent.com/en/event-marketing-platform) · [RSVPify Features](https://rsvpify.com/features/)
- **Adapt/avoid:** Adaptasi lifecycle narrative dan preview. Hindari menyalin templates atau menjanjikan open rate.

## 14. Event website builder
- **Slug/URL lokal:** `/features/event-website-builder`
- **Job-to-be-done:** Menerbitkan situs acara branded yang informatif dan terhubung ke RSVP.
- **Page archetype:** A — visual builder flagship.
- **Urutan section lengkap:** hero editor+live site → template/device strip → choose/edit/publish → sections/content → brand controls → RSVP/domain/share → responsive/accessibility → gallery/use cases → proof → FAQ → CTA.
- **UI/product-demo blocks:** block editor, live preview, theme tokens, agenda/map/gallery, publish panel.
- **Proof/trust blocks:** responsive/accessibility results, hosting/security, examples berizin, testimonial.
- **CTA:** “Buat website acara” + “Jelajahi template”.
- **Data/asset:** template Vienne orisinal, real-device captures, demo event content, performance report.
- **Mobile adaptation:** showcase published mobile site; editor memakai section list + bottom sheet, bukan canvas mini.
- **Referensi:** [Cvent](https://www.cvent.com/) · [Cvent Features](https://www.cvent.com/en/event-management-software/features) · [RSVPify](https://rsvpify.com/)
- **Adapt/avoid:** Adaptasi editor/preview dan publish story. Hindari template/layout kompetitor dan foto stok generik dominan.

## 15. Online invitations
- **Slug/URL lokal:** `/features/online-invitations`
- **Job-to-be-done:** Mendesain dan mengirim undangan digital yang konsisten dengan identitas acara.
- **Page archetype:** A — inspiration-to-action.
- **Urutan section lengkap:** hero invitation reveal → template/social proof → choose/customize → recipient personalization → send/link share → RSVP connection → reminders → occasion gallery → proof → FAQ → CTA.
- **UI/product-demo blocks:** template carousel, personalization fields, inbox/link preview, send status, RSVP handoff.
- **Proof/trust blocks:** examples berizin, delivery/privacy, testimonial, accessibility/readability.
- **CTA:** “Buat undangan” + “Lihat semua gaya”.
- **Data/asset:** original invitation suite, typography/image licenses, sample personalization, device captures.
- **Mobile adaptation:** edge-to-edge invitation preview; carousel snap; customize via simple controls; native share sheet.
- **Referensi:** [RSVPify](https://rsvpify.com/) · [RSVPify Features](https://rsvpify.com/features/) · [Cvent](https://www.cvent.com/)
- **Adapt/avoid:** Adaptasi visual inspiration plus product proof. Hindari gaya kartu, copy, dan aset competitor.

## 16. QR code RSVPs
- **Slug/URL lokal:** `/features/qr-code-rsvps`
- **Job-to-be-done:** Membawa tamu dari materi fisik ke RSVP digital lewat satu scan.
- **Page archetype:** A — bridge demo.
- **Urutan section lengkap:** hero scan-to-RSVP → compatibility → generate/customize → place on media → scan/landing → attribution/status → print guidance → scenarios → proof → FAQ → CTA.
- **UI/product-demo blocks:** QR generator, phone camera animation, RSVP landing, source tracking, print-safe preview.
- **Proof/trust blocks:** scan testing matrix, contrast/quiet-zone guidance, privacy, fallback short URL.
- **CTA:** “Buat QR RSVP” + “Tes scan demo”.
- **Data/asset:** real scannable test QR, invitation/signage mockups orisinal, size-distance test.
- **Mobile adaptation:** demo scanner full width; download/share controls; print specs accordion.
- **Referensi:** [RSVPify Check-in](https://rsvpify.com/event-check-in-app/) · [RSVPify Registration](https://rsvpify.com/event-registration/) · [Eventbrite Check-in](https://www.eventbrite.com/organizer/features/organizer-check-in-app/)
- **Adapt/avoid:** Adaptasi demonstrasi fisik→digital dan reliability. Hindari QR dekoratif yang gagal dipindai.

## 17. Guest list app
- **Slug/URL lokal:** `/features/guest-list-app`
- **Job-to-be-done:** Mengakses dan memperbarui daftar tamu real-time saat bergerak di venue.
- **Page archetype:** C — mobile operations.
- **Urutan section lengkap:** hero phone guest list → reliability → search/filter → guest profile/update → team sync → notes/issues → check-in handoff → proof → FAQ → CTA.
- **UI/product-demo blocks:** mobile search, guest card, status toggle, note, multi-device activity, empty/offline state.
- **Proof/trust blocks:** sync behavior yang diuji, permissions, privacy, operator testimonial.
- **CTA:** “Buka guest list di perangkat” + “Lihat demo operasional”.
- **Data/asset:** device recording, latency/offline test result, permission matrix, sample list.
- **Mobile adaptation:** ini mobile-first; desktop hanya dashboard/administrasi; tap targets ≥44px dan high-contrast status.
- **Referensi:** [RSVPify Guest List](https://rsvpify.com/guest-list-management/) · [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/) · [RSVPify Check-in](https://rsvpify.com/event-check-in-app/)
- **Adapt/avoid:** Adaptasi mobile operational clarity. Hindari desktop screenshot sebagai hero dan klaim offline jika belum didukung.

## 18. Multi-language
- **Slug/URL lokal:** `/features/multi-language`
- **Job-to-be-done:** Menyajikan website/form dalam bahasa tamu tanpa menggandakan event atau kehilangan data.
- **Page archetype:** A — localization workflow.
- **Urutan section lengkap:** hero language switch → supported-language statement → add/translate → side-by-side review → guest detection/switch → shared responses → fallback/RTL limitations → scenarios → proof → FAQ → CTA.
- **UI/product-demo blocks:** locale switcher, translation matrix, missing-string warning, bilingual preview, shared dashboard.
- **Proof/trust blocks:** human-review disclaimer, locale/date formatting tests, privacy, accessibility.
- **CTA:** “Tambahkan bahasa” + “Lihat demo bilingual”.
- **Data/asset:** professionally reviewed Indonesian/English sample, locale matrix, long-text stress test.
- **Mobile adaptation:** switcher mudah ditemukan; language names bukan flags saja; preview per-locale stacked.
- **Referensi:** [Cvent Features](https://www.cvent.com/en/event-management-software/features) · [Cvent](https://www.cvent.com/) · [RSVPify Registration](https://rsvpify.com/event-registration/)
- **Adapt/avoid:** Adaptasi side-by-side QA dan shared data. Hindari klaim terjemahan sempurna/semua bahasa tanpa coverage nyata.

## 19. Event check-in app
- **Slug/URL lokal:** `/features/event-check-in-app`
- **Job-to-be-done:** Mempercepat kedatangan melalui scan/pencarian dan memberi tim status hadir real-time.
- **Page archetype:** C — onsite flagship.
- **Urutan section lengkap:** hero scan animation → reliability proof → setup staff/devices → QR scan/search → exceptions/walk-ins → multi-device sync → live attendance → post-event export → proof → FAQ → CTA.
- **UI/product-demo blocks:** camera scanner, search fallback, duplicate warning, guest detail, live counter, device status.
- **Proof/trust blocks:** measured scan speed hanya jika diuji, offline/network behavior, role access, operator testimonial.
- **CTA:** “Siapkan check-in” + “Coba mode scan”.
- **Data/asset:** venue/device test, QR samples, exception states, accessibility for staff.
- **Mobile adaptation:** full-screen scanner; torch/haptic; large fallback search; status colors plus icons/text.
- **Referensi:** [RSVPify Check-in](https://rsvpify.com/event-check-in-app/) · [Eventbrite Check-in](https://www.eventbrite.com/organizer/features/organizer-check-in-app/) · [RSVPify Registration](https://rsvpify.com/event-registration/)
- **Adapt/avoid:** Adaptasi day-of narrative scan/search/live. Hindari klaim “tanpa antre” atau offline tanpa field test.

## 20. Badge printing
- **Slug/URL lokal:** `/features/badge-printing`
- **Job-to-be-done:** Mendesain dan mencetak badge saat kedatangan dari data registrasi yang benar.
- **Page archetype:** C — hardware workflow.
- **Urutan section lengkap:** hero check-in→print → hardware/compatibility → design template → map fields → test print → onsite print/reprint → troubleshooting → use cases → proof → FAQ → CTA.
- **UI/product-demo blocks:** badge editor, field mapping, printer setup, print queue, reprint/audit state.
- **Proof/trust blocks:** printer/label compatibility matrix, test protocol, integrated-data assurance, support path.
- **CTA:** “Desain badge” + “Cek perangkat kompatibel”.
- **Data/asset:** physical badge photography Vienne, print templates, tested hardware list, setup video.
- **Mobile adaptation:** onsite control card + queue; design editor tablet/desktop; setup guide collapsible.
- **Referensi:** [RSVPify Badge Printing](https://rsvpify.com/event-management-software/badge-printing/) · [RSVPify Check-in](https://rsvpify.com/event-check-in-app/) · [RSVPify Help](https://help.rsvpify.com/en/collections/2982740-event-check-in-badge-printing)
- **Adapt/avoid:** Adaptasi integrated check-in→print dan compatibility proof. Hindari logo perangkat/compatibility yang belum diuji.

## 21. Live attendance
- **Slug/URL lokal:** `/features/live-attendance`
- **Job-to-be-done:** Melihat siapa hadir, kapan, dan progres kedatangan agar tim dapat bertindak saat acara berjalan.
- **Page archetype:** C — real-time insight.
- **Urutan section lengkap:** hero live counter → data freshness → check-in feed → KPI/trend → segment/session drilldown → operational alerts → share/export → proof → FAQ → CTA.
- **UI/product-demo blocks:** live counter, timeline, arrival feed, segment filter, capacity alert, last-sync indicator.
- **Proof/trust blocks:** definisi “live” dan refresh interval, source-of-truth, access controls, event operator proof.
- **CTA:** “Pantau kehadiran” + “Lihat dashboard demo”.
- **Data/asset:** simulated dataset berlabel demo, latency measurements, chart accessibility specs.
- **Mobile adaptation:** KPI cards first; compact feed; charts simplified; alert actions sticky.
- **Referensi:** [Eventbrite Check-in](https://www.eventbrite.com/organizer/features/organizer-check-in-app/) · [RSVPify Check-in](https://rsvpify.com/event-check-in-app/) · [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/)
- **Adapt/avoid:** Adaptasi actionable real-time view. Hindari dashboard dekoratif, unlabeled demo data, atau klaim instant absolut.

## 22. Analytics & reporting
- **Slug/URL lokal:** `/features/analytics-and-reporting`
- **Job-to-be-done:** Mengubah data registrasi, komunikasi, transaksi, dan kehadiran menjadi keputusan serta laporan.
- **Page archetype:** A — insight narrative.
- **Urutan section lengkap:** hero dashboard → data sources/trust → funnel overview → audience/attendance → revenue/communication → filter/compare → export/share → decision scenarios → proof → FAQ → CTA.
- **UI/product-demo blocks:** funnel, KPI cards, filters, cohort/segment view, report builder, CSV/PDF export.
- **Proof/trust blocks:** metric glossary, timestamp/freshness, privacy, reconciliation note, customer outcome bila terverifikasi.
- **CTA:** “Lihat insight acara” + “Unduh contoh laporan”.
- **Data/asset:** sanitized demo dataset, metric definitions, accessible charts, sample export.
- **Mobile adaptation:** summary first; chart swipe; table→cards; filter bottom sheet; export via share sheet.
- **Referensi:** [Cvent Features](https://www.cvent.com/en/event-management-software/features) · [Cvent Event Marketing Platform](https://www.cvent.com/en/event-marketing-platform) · [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/)
- **Adapt/avoid:** Adaptasi lifecycle metrics dan metric clarity. Hindari vanity charts atau ROI claim tanpa metodologi.

## 23. Salesforce
- **Slug/URL lokal:** `/features/salesforce`
- **Job-to-be-done:** Menyinkronkan event/registrant/attendance ke CRM agar sales melihat engagement dan menindaklanjuti.
- **Page archetype:** D — named CRM integration.
- **Urutan section lengkap:** logo-pair hero → trust/availability → object/data flow → connect/authenticate → field mapping → trigger recipes → sales timeline/ROI → governance/errors → related integrations → FAQ/docs → CTA.
- **UI/product-demo blocks:** object map, connection wizard, field mapper, sync status/log, CRM activity preview.
- **Proof/trust blocks:** direction/frequency sync yang akurat, permissions, encryption/privacy, support/SLA bila ada.
- **CTA:** “Hubungkan Salesforce” + “Baca dokumentasi”.
- **Data/asset:** verified object matrix, OAuth scopes, setup screenshots, error catalog, approved logos.
- **Mobile adaptation:** diagram vertikal; mapping cards; setup diarahkan desktop; docs accordion.
- **Referensi:** [Cvent + Salesforce](https://www.cvent.com/en/event-management-software/cvent-and-salesforce-integration) · [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations) · [Cvent for Marketers](https://www.cvent.com/en/platform/marketers)
- **Adapt/avoid:** Adaptasi data-flow specificity dan recipes. Hindari menyiratkan native/real-time integration sebelum implementasi terverifikasi.

## 24. HubSpot
- **Slug/URL lokal:** `/features/hubspot`
- **Job-to-be-done:** Mengirim engagement acara ke HubSpot untuk segmentasi, nurture, dan handoff yang konsisten.
- **Page archetype:** D — marketing CRM integration.
- **Urutan section lengkap:** logo-pair hero → availability → contacts/events data flow → connect/map → list/workflow recipes → activity timeline → attribution/reporting → governance/errors → related → FAQ/docs → CTA.
- **UI/product-demo blocks:** sync diagram, property mapping, workflow trigger cards, contact activity, sync health.
- **Proof/trust blocks:** supported objects/tier, sync timing, scopes/privacy, verified support route.
- **CTA:** “Hubungkan HubSpot” + “Lihat resep workflow”.
- **Data/asset:** object/property matrix, OAuth scopes, recipe diagrams, approved marks.
- **Mobile adaptation:** vertical flow; recipe cards; mapping summary read-only; desktop deep-link for setup.
- **Referensi:** [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations) · [Cvent for Marketers](https://www.cvent.com/en/platform/marketers) · [HubSpot Salesforce Integration](https://www.hubspot.com/products/salesforce)
- **Adapt/avoid:** Adaptasi workflow outcome dan supported-data clarity. Hindari UI/brand HubSpot tiruan dan “no-code” claim jika tidak benar.

## 25. Stripe
- **Slug/URL lokal:** `/features/stripe`
- **Job-to-be-done:** Menghubungkan akun pembayaran untuk menerima tiket/donasi dan melacak transaksi.
- **Page archetype:** D — financial integration.
- **Urutan section lengkap:** logo-pair hero → security/availability → payment flow diagram → connect account → checkout → status/refund → payout/reconciliation → failure/dispute states → related → FAQ/docs → CTA.
- **UI/product-demo blocks:** connect flow, checkout, transaction status, refund, payout ledger, webhook/error status.
- **Proof/trust blocks:** PCI responsibility wording akurat, OAuth/API scopes, fees/currencies/regions, processor-vs-Vienne responsibility.
- **CTA:** “Hubungkan Stripe” + “Lihat dukungan pembayaran”.
- **Data/asset:** verified country/currency matrix, fee responsibility, webhook states, approved Stripe mark.
- **Mobile adaptation:** payment journey stacked; status cards; setup may hand off to secure external flow; sticky docs CTA.
- **Referensi:** [Stripe](https://stripe.com/) · [Eventbrite Payment](https://www.eventbrite.com/organizer/features/event-payment/) · [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations)
- **Adapt/avoid:** Adaptasi security hierarchy dan lifecycle. Hindari meniru visual Stripe atau mengaburkan merchant/processor responsibility.

## 26. Google Analytics
- **Slug/URL lokal:** `/features/google-analytics`
- **Job-to-be-done:** Mengirim event terstruktur dari website/registrasi agar marketer memahami traffic dan conversion.
- **Page archetype:** D — analytics integration.
- **Urutan section lengkap:** logo-pair hero → outcome/consent → tracked journey → connect measurement ID → event taxonomy → verify/debug → funnel examples → privacy/governance → related → FAQ/docs → CTA.
- **UI/product-demo blocks:** setup field, event stream, taxonomy table, debug/verification state, sample funnel.
- **Proof/trust blocks:** consent behavior, exact events/parameters, data delay caveat, no-guarantee attribution note.
- **CTA:** “Hubungkan Google Analytics” + “Lihat event yang dikirim”.
- **Data/asset:** implementation spec, event dictionary, consent matrix, test screenshots, approved logo.
- **Mobile adaptation:** flow diagram vertical; taxonomy accordion; code/IDs copyable; charts simplified.
- **Referensi:** [Cvent for Marketers](https://www.cvent.com/en/platform/marketers) · [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations) · [Cvent Event Marketing Platform](https://www.cvent.com/en/event-marketing-platform)
- **Adapt/avoid:** Adaptasi explicit event taxonomy dan verification. Hindari menjanjikan ROI/attribution sempurna atau menampilkan data produksi.

## 27. Zapier
- **Slug/URL lokal:** `/features/zapier`
- **Job-to-be-done:** Mengotomasi pekerjaan lintas aplikasi dengan trigger/action event tanpa integrasi kustom.
- **Page archetype:** D — automation recipes.
- **Urutan section lengkap:** logo-pair hero → ecosystem proof → trigger/action diagram → connect account → popular recipes → build/test Zap → monitoring/replay limits → security → related → FAQ/docs → CTA.
- **UI/product-demo blocks:** trigger/action picker, recipe cards, test payload, run log, failure/retry state.
- **Proof/trust blocks:** supported triggers/actions, task/data caveats, permissions, Zapier dependency/status.
- **CTA:** “Gunakan template Zap” + “Lihat semua trigger & action”.
- **Data/asset:** verified trigger/action catalog, sample payload redacted, recipe templates, approved mark.
- **Mobile adaptation:** recipe cards stacked; builder preview illustrative; setup deep-link ke Zapier; payload scroll/copy.
- **Referensi:** [Zapier](https://zapier.com/) · [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations) · [Cvent for Marketers](https://www.cvent.com/en/platform/marketers)
- **Adapt/avoid:** Adaptasi recipe-led discovery dan test/error proof. Hindari mengklaim ribuan app sebagai kemampuan langsung Vienne.

## 28. API & export
- **Slug/URL lokal:** `/features/api-and-export`
- **Job-to-be-done:** Mengambil atau memindahkan data acara secara aman ke sistem sendiri untuk workflow dan analisis khusus.
- **Page archetype:** D — developer/platform capability.
- **Urutan section lengkap:** hero code+export → developer trust → API resources/data model → auth/quickstart → endpoints/webhooks → CSV export flow → pagination/rate/error handling → security/versioning → examples/docs → FAQ → CTA.
- **UI/product-demo blocks:** code sample, API explorer, resource diagram, webhook log, export selector, job status/download.
- **Proof/trust blocks:** version, uptime/status, rate limits, auth scopes, retention/privacy, changelog/support.
- **CTA:** “Buka dokumentasi API” + “Coba export data”.
- **Data/asset:** real OpenAPI/docs, redacted payloads, schema/version policy, CSV sample, error codes.
- **Mobile adaptation:** code horizontal scroll + copy; endpoint accordion; quickstart steps stacked; API explorer desktop-first namun docs tetap terbaca.
- **Referensi:** [Stripe](https://stripe.com/) · [Cvent Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations) · [Cvent Features](https://www.cvent.com/en/event-management-software/features)
- **Adapt/avoid:** Adaptasi docs-first credibility, concrete schemas, dan failure states. Hindari endpoint/payload palsu atau meniru dokumentasi/SDK Stripe.

---

## Audit final dan guardrail implementasi

- **Expected 28 = researched 28; gap 0.** Semua item panel, termasuk enam integration destinations, tercakup tepat sekali.
- Callout panel “Vienne Workspace” dan utility link “Lihat semua fitur” bukan destination item registry; keduanya menuju `/features`, sehingga tidak dihitung sebagai feature detail page.
- Label tab menyebut “AI”, tetapi source saat audit tidak memiliki item AI tersendiri; jangan menambah destination yang tidak ada di registry.
- Sebelum desain final: verifikasi setiap integrasi benar-benar tersedia, cakupan field/object, mode sync, fee, wilayah, hardware, offline behavior, dan klaim security. Jika belum tersedia, ubah page menjadi waitlist/roadmap secara eksplisit—bukan simulasi capability.
- Referensi dipakai untuk pola informasi saja. Semua copy, komponen, screenshot, ilustrasi, data demo, dan motion harus orisinal Vienne serta mengikuti light-only/pink/Manrope/editorial modern/radius 8–11px.

## Daftar sumber resmi yang ditemukan

1. RSVPify: [Registration](https://rsvpify.com/event-registration/), [Check-in](https://rsvpify.com/event-check-in-app/), [Guest List](https://rsvpify.com/guest-list-management/), [Seating](https://rsvpify.com/seating-chart-maker/), [Badge Printing](https://rsvpify.com/event-management-software/badge-printing/), [Features](https://rsvpify.com/features/).
2. Eventbrite: [Organizer](https://www.eventbrite.com/organizer/overview/), [Payment](https://www.eventbrite.com/organizer/features/event-payment/), [Check-in](https://www.eventbrite.com/organizer/features/organizer-check-in-app/), [Pricing](https://www.eventbrite.com/organizer/pricing/).
3. Cvent: [Features](https://www.cvent.com/en/event-management-software/features), [Integrations](https://www.cvent.com/en/event-management-software/cvent-integrations), [Salesforce](https://www.cvent.com/en/event-management-software/cvent-and-salesforce-integration), [For Marketers](https://www.cvent.com/en/platform/marketers), [Event Marketing](https://www.cvent.com/en/event-marketing-platform).
4. Platform integration: [Stripe](https://stripe.com/), [HubSpot Salesforce integration](https://www.hubspot.com/products/salesforce), [Zapier](https://zapier.com/).

**Keterbatasan riset:** hasil pencarian resmi memberi bukti bahwa RSVPify menghubungkan registration dengan QR check-in, badge printing, guest management dan seating; Eventbrite menonjolkan ticketing, secure payment, scan, dan real-time attendance; Cvent menonjolkan lifecycle registration/marketing/onsite/analytics serta Salesforce/HubSpot; halaman platform resmi mendukung pola integration/developer. Ekstraksi isi halaman tidak tersedia pada backend sesi ini, sehingga detail rekomendasi yang melampaui snippet ditandai sebagai format yang perlu dibuktikan dengan aset/data Vienne, bukan fakta kompetitor.
