<!-- SUMMARY (7 baris; greppable)
WHAT: Inventaris dan format halaman untuk seluruh destination menu Jenis Acara.
STATUS: Research complete; bukan desain final.
SOURCE OF TRUTH: app/marketing-header.tsx + app/marketing-registry.ts.
COVERAGE: 50/50 item, 3/3 panel, 12/12 group; gap 0.
GROUNDING: Eventbrite, Partiful, Cvent Visual Showcase, Swoogo/Growform.
BRAND GUARDRAIL: Vienne light-only, pink, Manrope, editorial modern, radius 8–11px.
UPDATED: 2026-07-18
-->

# Format Halaman Semua Menu Jenis Acara

## Metode dan batasan
Audit statis dilakukan pada `app/marketing-header.tsx` dan dicocokkan dengan `eventTypesTitles` serta fungsi `slugifyMarketingTitle()` di `app/marketing-registry.ts`. Semua link menu memakai `/event-types/{slug}`; argumen legacy pada beberapa item tidak mengubah URL. Riset dibatasi empat query. `web_extract` dicoba dua kali tetapi backend sesi hanya mendukung pencarian; karena itu temuan di bawah hanya memakai fakta/pola yang dapat di-grounding dari hasil pencarian dan halaman produk yang ditemukan, tanpa mengarang observasi visual rinci. Dokumen ini **format/brief**, bukan desain final, dan tidak boleh dipakai untuk menyalin copy, merek, tata letak khas, atau aset kompetitor.

## Checklist coverage
| Panel | Group | Expected | Researched |
|---|---|---:|---:|
| By Event Type | VIP & Brand | 5 | 5 |
| By Event Type | Corporate & Conferences | 5 | 5 |
| By Event Type | Marketing & Internal | 6 | 6 |
| By Event Type | Fundraising & Ticketed | 4 | 4 |
| By Industry | Business & Finance | 4 | 4 |
| By Industry | Mission-Driven | 4 | 4 |
| By Industry | Education & Faith | 4 | 4 |
| By Industry | Venues & Media | 4 | 4 |
| Personal Events | Weddings | 3 | 3 |
| Personal Events | Milestones | 4 | 4 |
| Personal Events | Faith & Cultural | 4 | 4 |
| Personal Events | Celebrations | 3 | 3 |
| **TOTAL** | **12 group / 3 panel** | **50** | **50** |

**Gap:** nihil (0 item). Callout dan utility link bukan destination item Jenis Acara, sehingga tidak dihitung.

## Pustaka sumber nyata
- **E1** Eventbrite, jenis acara: https://www.eventbrite.com/blog/types-of-events/ — konferensi, workshop, trade show, seminar; pembelajaran dan networking.
- **E2** Eventbrite Organizer: https://www.eventbrite.com/organizer/overview/ — ticketing, payment, promotion, management, community growth.
- **E3** Eventbrite nonprofit: https://www.eventbrite.com/blog/nonprofit-event-planning/ — awareness, fundraising, strategi nonprofit.
- **P1** Partiful wedding: https://partiful.com/wedding-invitations — kirim via text/email/link, RSVP real-time.
- **P2** Partiful invitations: https://partiful.com/invitations/free-invite-website — birthday, dinner, graduation, holiday; template lintas occasion.
- **P3** Partiful maker: https://partiful.com/free-invitation-maker — wedding, baby shower, reunion, gathering, berbagai celebration.
- **C1** Cvent Visual Showcase: https://visualshowcase.cvent.com/ — solusi event, vertical hospitality, finance, healthcare, association/nonprofit.
- **C2** Cvent hospitality: https://visualshowcase.cvent.com/hospitality.html — pola solusi vertikal hospitality dan custom theme.
- **C3** Cvent onsite: https://visualshowcase.cvent.com/on-site-solutions.html — solusi onsite dan vertical enterprise.
- **S1** Swoogo examples: https://swoogo.events/blog/event-landing-page-examples/ — kumpulan landing page event nyata.
- **G1** Growform examples: https://www.growform.co/landing-page-examples/event/ — satu goal registrasi, minim distraksi; conference/workshop/launch/networking/summit.

> Kode referensi pada tiap item menunjuk URL lengkap di atas. Masing-masing item memiliki 2–3 sumber.

## By Event Type

### VIP & BRAND

#### 1. Client & VIP events
- **URL:** `/event-types/client-and-vip-events`
- **Tujuan:** meyakinkan host bahwa undangan eksklusif, approval, dan layanan tamu penting dapat dikelola privat.
- **Archetype:** solution landing page premium berbasis guest journey.
- **Urutan section:** hero + CTA demo → trust/logo strip → problem VIP → journey invite–RSVP–arrival → fitur personalisasi/approval → concierge & privacy → contoh experience → testimonial → FAQ → footer CTA.
- **Komponen:** mockup undangan personal, status RSVP, access tier, host dashboard, testimonial; **data/aset:** foto hospitality berizin, contoh itinerary, role/permission, bukti keamanan.
- **Mobile:** CTA sticky, journey jadi kartu swipe, tabel tier menjadi accordion, foto crop portrait.
- **Referensi:** C1, C2, E2.
- **Boleh diadaptasi:** fokus journey dan operational proof. **Hindari:** estetika “black-gold luxury”, klaim keamanan tanpa bukti, logo/foto kompetitor.

#### 2. Customer appreciation
- **URL:** `/event-types/customer-appreciation`
- **Tujuan:** membantu brand mengubah apresiasi menjadi retensi dan hubungan terukur.
- **Archetype:** campaign/use-case page.
- **Urutan:** hero outcome → tipe experience → segmentasi undangan → alur registrasi → engagement/reminder → galeri ide → metrik follow-up → story → FAQ → footer CTA.
- **Komponen:** segment cards, invitation preview, reminder timeline, feedback/NPS card; **data/aset:** persona customer, event photos, sample survey, metric definitions.
- **Mobile:** segment chips scroll, timeline vertikal, metrik 2 kolom.
- **Referensi:** E2, G1, S1.
- **Boleh:** single-goal conversion dan community follow-up. **Hindari:** janji ROI absolut, testimonial rekaan, pola promo diskon agresif.

#### 3. Employee appreciation
- **URL:** `/event-types/employee-appreciation`
- **Tujuan:** menunjukkan alur inklusif untuk penghargaan karyawan lintas lokasi.
- **Archetype:** internal-experience solution page.
- **Urutan:** hero → outcomes culture → format onsite/hybrid → nomination/RSVP journey → dietary/accessibility → recognition moments → admin/reporting → case proof → FAQ → footer CTA.
- **Komponen:** nomination form, RSVP household, award agenda, accessibility controls; **data/aset:** policy internal, award categories, venue/access needs, consented team imagery.
- **Mobile:** agenda accordion, form one-field-per-row, no hover dependencies.
- **Referensi:** E1, E2, C3.
- **Boleh:** format fleksibel dan attendee care. **Hindari:** stock photo tokenistik, leaderboard memalukan, ekspos data HR.

#### 4. Brand activations
- **URL:** `/event-types/brand-activations`
- **Tujuan:** menjual kemampuan capture lead dan pengalaman on-brand dari pre-event sampai follow-up.
- **Archetype:** visual campaign landing page.
- **Urutan:** hero immersive → activation formats → branded registration → QR/on-site journey → engagement modules → lead consent/sync → analytics → activation examples → FAQ → footer CTA.
- **Komponen:** theme preview, QR pass, lead form, live metrics, integration logos; **data/aset:** campaign KV original, consent copy, KPI taxonomy, device mockups.
- **Mobile:** motion reduced, QR tetap besar, galleries swipe, form singkat.
- **Referensi:** E2, C3, S1.
- **Boleh:** visual storytelling + measurable funnel. **Hindari:** meniru campaign terkenal, autoplay berat, dark-only neon yang melanggar brand.

#### 5. Product launches
- **URL:** `/event-types/product-launches`
- **Tujuan:** mengubah curiosity menjadi registrasi, attendance, dan product interest.
- **Archetype:** launch/event conversion page.
- **Urutan:** hero reveal + date → value/teaser → speaker/demo lineup → agenda → attendance modes → registration → reminder/content follow-up → social proof → FAQ → footer CTA.
- **Komponen:** countdown opsional, speaker cards, agenda, stream/venue info, waitlist; **data/aset:** product teaser legal-approved, bios, schedule, capacity.
- **Mobile:** countdown compact, speaker carousel accessible, agenda accordion, CTA sticky.
- **Referensi:** G1, S1, E2.
- **Boleh:** satu conversion goal dan progressive reveal. **Hindari:** fake scarcity/countdown, klaim produk tanpa substansi, copy launch kompetitor.

### CORPORATE & CONFERENCES

#### 6. Conferences
- **URL:** `/event-types/conferences`
- **Tujuan:** membuktikan Vienne menangani agenda kompleks dan banyak tipe peserta.
- **Archetype:** flagship conference solution.
- **Urutan:** hero register/demo → proof scale → attendee journey → agenda/multi-track → speakers → ticket/tier → sponsors/exhibitors → app/check-in → analytics → case study → FAQ → footer CTA.
- **Komponen:** track filter, speaker grid, ticket comparison, sponsor slots, badge/check-in; **data/aset:** agenda terstruktur, bios/headshots, venue map, tiers, sponsor assets.
- **Mobile:** agenda by day, filter drawer, tier cards, speaker grid 2 kolom.
- **Referensi:** E1, E2, G1.
- **Boleh:** hierarchy informasi dan registration-first. **Hindari:** agenda desktop miniatur, logo wall tanpa konteks, overload animasi.

#### 7. Summits & forums
- **URL:** `/event-types/summits-and-forums`
- **Tujuan:** memosisikan forum sebagai dialog otoritatif dengan networking terkurasi.
- **Archetype:** thought-leadership event page.
- **Urutan:** hero thesis → themes → conveners/speakers → discussion formats → agenda → audience/profile → networking → registration/application → past insights → FAQ → footer CTA.
- **Komponen:** theme cards, moderator bios, roundtable capacity, application form; **data/aset:** thesis editorial, credentials, Chatham House/privacy rules, agenda.
- **Mobile:** long-form thesis ringkas, bio accordion, application save-progress.
- **Referensi:** E1, G1, S1.
- **Boleh:** editorial authority dan theme-led navigation. **Hindari:** jargon kosong, speaker tanpa credentials, menyamakan forum tertutup dengan tiket publik.

#### 8. Tradeshows & expos
- **URL:** `/event-types/tradeshows-and-expos`
- **Tujuan:** melayani pengunjung, exhibitor, dan sponsor dalam satu discovery funnel.
- **Archetype:** marketplace/expo hub.
- **Urutan:** hero → audience paths → categories → exhibitor directory → floor plan → program/demos → ticket/register → exhibitor lead capture → sponsor proof → logistics → FAQ → footer CTA.
- **Komponen:** searchable directory, floor map, booth profile, meeting booking, QR scan; **data/aset:** exhibitor records, categories, booth coordinates, sponsor tiers.
- **Mobile:** search sticky, map fullscreen/pinch, filters bottom sheet, saved booths.
- **Referensi:** E1, E2, C3.
- **Boleh:** audience branching dan directory UX. **Hindari:** floorplan berupa gambar tak aksesibel, pay-to-rank tersamar, scan tanpa consent.

#### 9. Sales kickoffs
- **URL:** `/event-types/sales-kickoffs`
- **Tujuan:** menyatukan kickoff, enablement, motivasi, dan measurement internal.
- **Archetype:** internal program solution.
- **Urutan:** hero outcomes → program pillars → personalized tracks → agenda → speakers/leaders → travel & RSVP → training resources → engagement → attendance/feedback → proof → FAQ → footer CTA.
- **Komponen:** role-based agenda, travel form, resource gate, poll, leaderboard opsional; **data/aset:** territories/roles, targets non-sensitive, logistics, leader media.
- **Mobile:** “my agenda” first, offline-ready essentials, push/reminder cards.
- **Referensi:** E1, E2, C3.
- **Boleh:** personalization by role. **Hindari:** membuka angka rahasia, gamification manipulatif, dashboard terlalu publik.

#### 10. Workshops & classes
- **URL:** `/event-types/workshops-and-classes`
- **Tujuan:** mempercepat pemilihan sesi dan booking kapasitas terbatas.
- **Archetype:** class catalog + conversion page.
- **Urutan:** hero/search → learning outcomes → class catalog → instructor → schedule/capacity → prerequisites/materials → pricing/register → reminder/resources → reviews → FAQ → footer CTA.
- **Komponen:** date/level filter, seat count, instructor card, materials checklist; **data/aset:** syllabus, levels, duration, capacity, cancellation policy.
- **Mobile:** filter drawer, class cards, calendar add, short checkout.
- **Referensi:** E1, E2, G1.
- **Boleh:** clear outcomes/prerequisites. **Hindari:** urgency palsu, hidden fees, level ambiguity.

### MARKETING & INTERNAL

#### 11. Field marketing
- **URL:** `/event-types/field-marketing`
- **Tujuan:** menunjukkan repeatable local campaigns dengan attribution pusat.
- **Archetype:** distributed campaign solution.
- **Urutan:** hero → campaign model → local page templating → lead routing → event journey → integrations → portfolio dashboard → ROI/reporting → story → FAQ → footer CTA.
- **Komponen:** multi-event map, locked brand blocks, UTM/source, CRM sync; **data/aset:** regions, campaign taxonomy, consent, attribution rules.
- **Mobile:** map/list toggle, local CTA prominent, compact forms.
- **Referensi:** E2, C1, G1.
- **Boleh:** centralized governance/local flexibility. **Hindari:** attribution claims tanpa metodologi, peta berat, form lead berlebihan.

#### 12. Networking events
- **URL:** `/event-types/networking-events`
- **Tujuan:** membuat nilai koneksi jelas sebelum registrasi.
- **Archetype:** community/network event page.
- **Urutan:** hero audience/value → who-you’ll-meet → format → agenda → host/facilitator → matching/preferences → RSVP → safety/code of conduct → past community proof → FAQ → footer CTA.
- **Komponen:** attendee archetypes, topic tags, matching form, code of conduct; **data/aset:** audience composition agregat, hosts, rules, venue.
- **Mobile:** preference chips, QR contact opt-in, agenda concise.
- **Referensi:** E1, G1, P2.
- **Boleh:** community framing dan explicit format. **Hindari:** menampilkan attendee tanpa izin, vanity counts, forced contact sharing.

#### 13. Internal meetings & trainings
- **URL:** `/event-types/internal-meetings-and-trainings`
- **Tujuan:** memberi staf satu sumber kebenaran untuk hadir dan belajar.
- **Archetype:** authenticated/internal event hub.
- **Urutan:** hero/context → objectives → personalized agenda → facilitator/materials → RSVP/attendance mode → prework → day-of access → assessment/resources → reporting → support → footer CTA.
- **Komponen:** SSO/access, prework checklist, attendance, quiz/certificate; **data/aset:** employee segments, curriculum, permissions, retention policy.
- **Mobile:** authenticated quick access, offline agenda, large check-in button.
- **Referensi:** E1, E2, C3.
- **Boleh:** task-oriented hub. **Hindari:** indexing public, collecting excess employee data, decorative marketing clutter.

#### 14. Team building & offsites
- **URL:** `/event-types/team-building-and-offsites`
- **Tujuan:** menyederhanakan pilihan aktivitas, perjalanan, dan kebutuhan peserta.
- **Archetype:** itinerary + participant logistics page.
- **Urutan:** hero → goals/theme → itinerary → activity choices → venue/travel → RSVP/preferences → accessibility/safety → facilitator → gallery/proof → FAQ → footer CTA.
- **Komponen:** itinerary, travel form, activity opt-in, emergency contact privacy; **data/aset:** timings, transport, risk notes, dietary/accessibility.
- **Mobile:** day tabs, map deep links, emergency info pinned.
- **Referensi:** E1, P2, C2.
- **Boleh:** itinerary clarity. **Hindari:** forced participation, public medical data, idyllic imagery yang menyesatkan.

#### 15. Investor & shareholder
- **URL:** `/event-types/investor-and-shareholder`
- **Tujuan:** mendukung registrasi terverifikasi, dokumen, voting/proxy, dan auditability.
- **Archetype:** secure stakeholder meeting portal.
- **Urutan:** hero formal → meeting notice → eligibility/access → agenda/resolutions → documents → registration/proxy → attendance instructions → governance/security → support → footer CTA.
- **Komponen:** identity verification, document versions, deadline, voting status; **data/aset:** legal notice, record date, resolutions, privacy/security evidence.
- **Mobile:** secure session, documents readable/downloadable, deadlines prominent.
- **Referensi:** C1, C3, E2.
- **Boleh:** clarity, traceability, role-based access. **Hindari:** legal guarantees, financial hype, sensitive docs public.

#### 16. Holiday parties
- **URL:** `/event-types/holiday-parties`
- **Tujuan:** mengelola perayaan organisasi dengan RSVP, plus-one, menu, dan transport.
- **Archetype:** branded internal invitation.
- **Urutan:** festive hero → essentials → theme/experience → RSVP + plus-one → food/access needs → schedule → venue/transport → policy/safety → gallery → FAQ → footer CTA.
- **Komponen:** guest rules, menu selector, shuttle slots, dress guidance; **data/aset:** original festive art, capacity, policies, venue map.
- **Mobile:** RSVP above fold, add-to-calendar/map, minimal animation.
- **Referensi:** P2, P3, E2.
- **Boleh:** playful templates dan reminders. **Hindari:** simbol agama sebagai default, inaccessible motion, ambiguous plus-one.

### FUNDRAISING & TICKETED

#### 17. Galas & benefit dinners
- **URL:** `/event-types/galas-and-benefit-dinners`
- **Tujuan:** menghubungkan mission story dengan tiket/meja dan donasi.
- **Archetype:** fundraising conversion page.
- **Urutan:** hero mission + donate/ticket → impact proof → evening program → honorees → ticket/table tiers → auction/donation → venue/menu → sponsors → transparency → FAQ → footer CTA.
- **Komponen:** impact metrics, table selector, donation amounts, sponsor wall; **data/aset:** audited impact facts, beneficiary consent, tiers, tax wording.
- **Mobile:** dual CTA jelas, tier cards, donation express checkout.
- **Referensi:** E3, E2, C1.
- **Boleh:** mission-before-mechanics dan choice architecture. **Hindari:** exploitative imagery, dark patterns donasi, impact palsu.

#### 18. Donor stewardship
- **URL:** `/event-types/donor-stewardship`
- **Tujuan:** memperdalam hubungan donor melalui pengalaman personal dan pelaporan dampak.
- **Archetype:** invitation-only impact briefing.
- **Urutan:** hero thank-you → impact update → event purpose → program/speakers → personalized RSVP → access/preferences → host note → follow-up resources → privacy → footer CTA.
- **Komponen:** personalized salutation, impact cards, donor segment access, follow-up pack; **data/aset:** verified outcomes, permissions, host message, segmentation rules.
- **Mobile:** personal RSVP immediate, impact cards concise, privacy visible.
- **Referensi:** E3, C1, E2.
- **Boleh:** gratitude and evidence. **Hindari:** publikasi donor tanpa izin, upsell terlalu cepat, guilt framing.

#### 19. Shows & performances
- **URL:** `/event-types/shows-and-performances`
- **Tujuan:** menjual tiket berdasarkan program, performer, waktu, dan seat choice.
- **Archetype:** performance ticketing page.
- **Urutan:** poster hero → synopsis → dates/showtimes → cast/artist → media teaser → tickets/seating → venue/accessibility → policies → reviews → FAQ → footer CTA.
- **Komponen:** showtime selector, seating map, trailer, age/access labels; **data/aset:** licensed key art/media, cast credits, inventory, venue rules.
- **Mobile:** showtime sticky, seat map zoom/list alternative, wallet ticket.
- **Referensi:** E1, E2, S1.
- **Boleh:** program-led storytelling. **Hindari:** unlicensed media, hidden fees, inaccessible seat map.

#### 20. Community events
- **URL:** `/event-types/community-events`
- **Tujuan:** membuat acara lokal mudah ditemukan, dipercaya, dan diakses semua warga.
- **Archetype:** civic/community information page.
- **Urutan:** hero essentials → why join → activities → schedule → community partners → RSVP/free ticket → location/transit → accessibility/language/safety → updates → FAQ → footer CTA.
- **Komponen:** map, multilingual info, accessibility icons, partner cards, volunteer CTA; **data/aset:** local photos with consent, transit, weather plan, contact.
- **Mobile:** essentials first, low-bandwidth images, tap-to-map/call, language switch.
- **Referensi:** E1, E2, P2.
- **Boleh:** inclusive practical info. **Hindari:** app-only access, insider jargon, missing contingency plan.

## By Industry

### BUSINESS & FINANCE

#### 21. Enterprise
- **URL:** `/event-types/enterprise`
- **Tujuan:** meyakinkan buyer tentang governance, scale, integrasi, dan service.
- **Archetype:** enterprise solution page.
- **Urutan:** hero demo → customer proof → use cases → platform workflow → governance/security → integrations → scale/reporting → services → case study → FAQ/procurement → footer CTA.
- **Komponen:** architecture diagram, roles, SSO, integrations, SLA evidence; **data/aset:** verified scale metrics, compliance docs, enterprise stories.
- **Mobile:** diagrams stacked, proof cards, demo form short.
- **Referensi:** C1, C3, E2.
- **Boleh:** layered proof and buyer objections. **Hindari:** logo tanpa izin, “enterprise-grade” tanpa evidence, feature dump.

#### 22. Businesses
- **URL:** `/event-types/businesses`
- **Tujuan:** menunjukkan satu alat untuk event customer, team, dan partner.
- **Archetype:** SMB/mid-market solution overview.
- **Urutan:** hero → jobs-to-be-done → use-case cards → setup workflow → core tools → templates → reporting → pricing path → story → FAQ → footer CTA.
- **Komponen:** use-case switcher, setup steps, template preview, dashboard; **data/aset:** company-size scenarios, time-saving evidence, template assets.
- **Mobile:** use-case cards swipe, CTA persistent, comparison simplified.
- **Referensi:** E2, G1, S1.
- **Boleh:** plain-language speed/value. **Hindari:** one-size-fits-all claim, pricing bait, fake productivity numbers.

#### 23. Financial services
- **URL:** `/event-types/financial-services`
- **Tujuan:** menggabungkan client experience dengan compliance dan audit trail.
- **Archetype:** regulated-industry solution.
- **Urutan:** hero → event use cases → client journey → approvals/permissions → data/security → communications archive → analytics/integrations → proof → FAQ → footer CTA.
- **Komponen:** approval flow, role matrix, consent logs, audit/export; **data/aset:** compliance mapping reviewed legal, security docs, use cases.
- **Mobile:** secure authentication, redacted previews, accessible documents.
- **Referensi:** C1, C3, E2.
- **Boleh:** risk-first evidence. **Hindari:** sertifikasi tak dimiliki, investment advice, decorative padlock theater.

#### 24. Agencies
- **URL:** `/event-types/agencies`
- **Tujuan:** menjual multi-client workflow, reusable systems, dan branded delivery.
- **Archetype:** agency operations solution.
- **Urutan:** hero → client challenges → workspace model → templates/brand control → approvals → campaign portfolio → reporting/export → collaboration → case proof → FAQ → footer CTA.
- **Komponen:** account switcher, client permissions, template library, report export; **data/aset:** permission model, sample anonymized portfolio, workflow timings.
- **Mobile:** approvals/actions first, portfolio list, no dense dashboard.
- **Referensi:** E2, C1, S1.
- **Boleh:** workflow visualization. **Hindari:** white-label promise yang tak tersedia, client work tanpa izin, dashboard vanity.

### MISSION-DRIVEN

#### 25. Nonprofits & foundations
- **URL:** `/event-types/nonprofits-and-foundations`
- **Tujuan:** menghubungkan awareness, community, ticket, donor, dan impact.
- **Archetype:** mission-sector solution page.
- **Urutan:** hero → mission use cases → supporter journey → registration/donation → volunteer/communications → impact reporting → affordability/trust → story → FAQ → footer CTA.
- **Komponen:** donation/ticket flow, volunteer form, impact dashboard; **data/aset:** verified impact, tax wording, donor consent, accessibility.
- **Mobile:** donate/register split CTA, lightweight story media.
- **Referensi:** E3, C1, E2.
- **Boleh:** mission-centered conversion. **Hindari:** poverty porn, inflated impact, recurring donation preselected.

#### 26. Healthcare
- **URL:** `/event-types/healthcare`
- **Tujuan:** mendukung conference, education, community outreach dengan privasi kuat.
- **Archetype:** regulated healthcare event solution.
- **Urutan:** hero → event scenarios → audience journeys → registration credentials → agenda/CME → accessibility → privacy/security → integrations/reporting → evidence → FAQ → footer CTA.
- **Komponen:** credential fields, session credits, consent, accessible format; **data/aset:** accreditation facts, privacy review, speaker disclosures.
- **Mobile:** credentials resumable, agenda personal, never expose health data.
- **Referensi:** C1, C3, E1.
- **Boleh:** audience-specific pathways. **Hindari:** medical claims, patient imagery without consent, collecting diagnosis unnecessarily.

#### 27. Associations & membership
- **URL:** `/event-types/associations-and-membership`
- **Tujuan:** meningkatkan member participation, renewal value, dan education.
- **Archetype:** membership event ecosystem page.
- **Urutan:** hero → member value → event portfolio → member/nonmember registration → education/credits → networking → chapters → integrations/reporting → story → FAQ → footer CTA.
- **Komponen:** member lookup, pricing state, chapter filter, CE credits; **data/aset:** member rules, chapter data, accreditation, CRM mapping.
- **Mobile:** member sign-in simple, chapter/location filter, wallet credentials.
- **Referensi:** C1, E1, E2.
- **Boleh:** lifecycle and segmentation. **Hindari:** confusing price eligibility, public member directory, renewal dark patterns.

#### 28. Government & NGO
- **URL:** `/event-types/government-and-ngo`
- **Tujuan:** mendukung konsultasi, forum, training, dan multistakeholder event yang inklusif.
- **Archetype:** public-sector solution page.
- **Urutan:** hero → scenarios → stakeholder journeys → multilingual registration → accessibility → communications → privacy/governance → reporting/export → deployment/support → FAQ → footer CTA.
- **Komponen:** language selector, public/private access, accessibility statement, audit export; **data/aset:** procurement/security facts, locales, data residency facts if true.
- **Mobile:** low bandwidth, WCAG-first, printable/offline alternative.
- **Referensi:** C1, C3, E1.
- **Boleh:** inclusion and transparency. **Hindari:** political endorsement, unsupported compliance, app-only participation.

### EDUCATION & FAITH

#### 29. Higher education
- **URL:** `/event-types/higher-education`
- **Tujuan:** mengelola recruitment, alumni, academic, dan campus events.
- **Archetype:** multi-audience education solution.
- **Urutan:** hero → audience/use-case selector → event portfolio → registration → campus logistics → communications → alumni/student data integration → analytics → campus story → FAQ → footer CTA.
- **Komponen:** audience paths, campus map, session booking, guardian/alumni fields; **data/aset:** campus imagery, calendars, accessibility, FERPA/local privacy review.
- **Mobile:** audience chooser first, map deep links, schedule by day.
- **Referensi:** E1, C1, E2.
- **Boleh:** audience branching. **Hindari:** mixing prospect/student data, inaccessible campus maps, generic graduation-only framing.

#### 30. K–12 schools
- **URL:** `/event-types/k-12-schools`
- **Tujuan:** membuat school events aman dan jelas bagi guardian, siswa, dan staf.
- **Archetype:** family-facing school event solution.
- **Urutan:** hero → event examples → guardian journey → household RSVP → permissions/payment → schedule/location → safety/accessibility → reminders → admin reporting → FAQ → footer CTA.
- **Komponen:** household form, guardian consent, pickup rules, payment/waiver; **data/aset:** safeguarding policy, age rules, emergency contacts, translations.
- **Mobile:** guardian-first form, large tap targets, SMS-friendly links.
- **Referensi:** E2, P2, C3.
- **Boleh:** household model and practical clarity. **Hindari:** child photos/data without consent, public class lists, complex account creation.

#### 31. Independent schools
- **URL:** `/event-types/independent-schools`
- **Tujuan:** mendukung admissions, fundraising, alumni, dan community calendar dengan brand sekolah.
- **Archetype:** school advancement solution.
- **Urutan:** hero → admissions/advancement use cases → branded journey → event portfolio → RSVP/ticket/donation → household/alumni data → communications → reporting → story → FAQ → footer CTA.
- **Komponen:** use-case tabs, family RSVP, giving option, CRM export; **data/aset:** school brand assets, privacy/consent, alumni segmentation.
- **Mobile:** use-case tabs dropdown, fast RSVP, payment wallet.
- **Referensi:** C1, E3, E2.
- **Boleh:** coherent branded ecosystem. **Hindari:** elitist visual clichés, child data exposure, donation pressure during required events.

#### 32. Religious organizations
- **URL:** `/event-types/religious-organizations`
- **Tujuan:** memudahkan worship/community gatherings, classes, volunteer, dan giving secara sensitif.
- **Archetype:** faith-community event solution.
- **Urutan:** hero inclusive → gathering types → community journey → household RSVP → schedule/ritual context → accessibility/childcare → volunteer/giving optional → communications → privacy → FAQ → footer CTA.
- **Komponen:** recurring schedule, household fields, childcare, optional donation; **data/aset:** approved cultural imagery, ritual guidance, safeguarding, language.
- **Mobile:** recurring-date selector, map/contact, low-friction household RSVP.
- **Referensi:** P2, P3, E2.
- **Boleh:** respectful context and community logistics. **Hindari:** generic religious symbols, assumed practices, preselected giving.

### VENUES & MEDIA

#### 33. Hospitality & venues
- **URL:** `/event-types/hospitality-and-venues`
- **Tujuan:** menunjukkan lead-to-event workflow untuk venue dan guest experience.
- **Archetype:** venue/hospitality B2B solution.
- **Urutan:** hero → venue outcomes → inquiry/proposal → event page/RSVP → room/meal needs → onsite → portfolio/calendar → integrations/reporting → proof → FAQ → footer CTA.
- **Komponen:** inquiry form, space cards, proposal preview, occupancy/calendar; **data/aset:** venue photos/floorplans, capacity, packages, accessibility.
- **Mobile:** gallery optimized, compare spaces cards, click-to-contact.
- **Referensi:** C2, C1, E2.
- **Boleh:** visual venue proof + operational flow. **Hindari:** misleading wide-angle photos, capacity ambiguity, unavailable package pricing.

#### 34. Bars & restaurants
- **URL:** `/event-types/bars-and-restaurants`
- **Tujuan:** mengonversi private dining, tasting, dan ticketed experiences.
- **Archetype:** hospitality booking/event page.
- **Urutan:** hero food/space → event formats → menus/packages → dates/capacity → dietary/accessibility → booking/ticket flow → location → social proof → policies → footer CTA.
- **Komponen:** menu cards, space gallery, availability, deposit/ticket; **data/aset:** current menus/prices, allergen process, licensed food photos, cancellation policy.
- **Mobile:** call/book CTA sticky, menus as HTML not PDF-only, map.
- **Referensi:** C2, E2, P2.
- **Boleh:** sensory original imagery and direct booking. **Hindari:** inaccessible PDF menus, hidden minimum spend, unverified allergen guarantees.

#### 35. Real estate
- **URL:** `/event-types/real-estate`
- **Tujuan:** mendukung open house, broker event, launch, dan investor gathering dengan lead routing.
- **Archetype:** property event campaign page.
- **Urutan:** hero property/event → key facts → gallery/tour → date slots → host/agent → RSVP/qualification → map/parking → consent/follow-up → analytics/CRM → FAQ → footer CTA.
- **Komponen:** slot booking, property cards, map, lead consent; **data/aset:** accurate listing facts, licensed photos, disclosures, availability.
- **Mobile:** swipe gallery, slot selection, tap-to-map/contact.
- **Referensi:** E2, G1, C1.
- **Boleh:** media-to-booking funnel. **Hindari:** misleading renders, discriminatory qualification, forced marketing consent.

#### 36. Media & publishing
- **URL:** `/event-types/media-and-publishing`
- **Tujuan:** mengubah editorial audience menjadi attendee/subscriber/community.
- **Archetype:** editorial event portfolio solution.
- **Urutan:** hero → event franchises → topics → upcoming events → speakers/authors → registration/subscriber benefits → content archive → sponsors → audience analytics → FAQ → footer CTA.
- **Komponen:** editorial cards, topic filters, subscriber state, archive media; **data/aset:** original covers/art, rights-cleared author media, subscription rules.
- **Mobile:** feed-like cards, filters, readable long-form, audio/video captions.
- **Referensi:** S1, E2, G1.
- **Boleh:** editorial hierarchy and content flywheel. **Hindari:** copying publication masthead, autoplay, blurred sponsor/editorial boundary.

## Personal Events

### WEDDINGS

#### 37. Weddings
- **URL:** `/event-types/weddings`
- **Tujuan:** membantu pasangan berbagi cerita dan detail, lalu mengelola RSVP household.
- **Archetype:** personal wedding website + RSVP.
- **Urutan:** hero names/date → story → events/timeline → venue/travel → RSVP household → wedding party → gifts optional → gallery → FAQ/dress/code → footer CTA.
- **Komponen:** multi-event RSVP, plus-one, meal, map, add-calendar; **data/aset:** couple-approved photos, names/dates, venue, privacy and gift choices.
- **Mobile:** RSVP prominent, timeline vertical, images responsive, map/calendar actions.
- **Referensi:** P1, P2, P3.
- **Boleh:** instant share, realtime RSVP, personal storytelling. **Hindari:** meniru template/copy Partiful, wedding-only visual defaults, public guest data.

#### 38. Wedding anniversaries
- **URL:** `/event-types/wedding-anniversaries`
- **Tujuan:** merayakan perjalanan pernikahan dan mengatur gathering lintas generasi.
- **Archetype:** commemorative story invitation.
- **Urutan:** hero milestone → then/now story → photo timeline → celebration details → RSVP household → tribute/messages → travel/accessibility → FAQ → footer CTA.
- **Komponen:** timeline, archival gallery, message collection, household RSVP; **data/aset:** digitized photos with consent, dates, family names, venue.
- **Mobile:** timeline single column, photo compression, voice/message simple.
- **Referensi:** P1, P2, P3.
- **Boleh:** memory-led narrative. **Hindari:** fabricated nostalgia, excessive photo effects, assuming gifts.

#### 39. Bridal showers
- **URL:** `/event-types/bridal-showers`
- **Tujuan:** memberi tamu konteks aktivitas, host, registry optional, dan RSVP.
- **Archetype:** themed personal invitation.
- **Urutan:** hero honoree/date → host note → theme/activities → details → RSVP → menu/dietary → registry optional → travel/FAQ → footer CTA.
- **Komponen:** host card, RSVP, dietary, activity preview, optional registry; **data/aset:** honoree-approved photos, host contacts, theme art original.
- **Mobile:** details/RSVP first, registry clearly optional, map action.
- **Referensi:** P3, P2, P1.
- **Boleh:** occasion template breadth. **Hindari:** gender stereotype, gift pressure, copying decorative assets.

### MILESTONES

#### 40. Birthdays
- **URL:** `/event-types/birthdays`
- **Tujuan:** membuat undangan cepat, ekspresif, dan mudah dikonfirmasi.
- **Archetype:** playful invitation + RSVP.
- **Urutan:** hero celebrant/date → essential details → theme/activities → RSVP/plus-one → food/access → venue/map → photos/messages → FAQ → footer CTA.
- **Komponen:** age/privacy toggle, RSVP, reminders, playlist/photo prompt; **data/aset:** approved portrait, theme, guardian details if minor.
- **Mobile:** one-screen essentials, large RSVP, share link, reduced motion.
- **Referensi:** P2, P3, P1.
- **Boleh:** fast setup and fun event pages. **Hindari:** public child age/location, visual overload, forced account.

#### 41. Anniversary parties
- **URL:** `/event-types/anniversary-parties`
- **Tujuan:** merayakan milestone relasi/organisasi tanpa asumsi konteks.
- **Archetype:** flexible milestone invitation.
- **Urutan:** hero milestone → story → program → details → RSVP → tributes/gallery → food/access → FAQ → footer CTA.
- **Komponen:** milestone label customizable, story blocks, message wall, RSVP; **data/aset:** participant-approved story/photos, schedule, venue.
- **Mobile:** concise story, vertical gallery, message moderation.
- **Referensi:** P2, P3, S1.
- **Boleh:** modular storytelling. **Hindari:** wedding assumptions, public messages unmoderated, cliché copy.

#### 42. Reunions
- **URL:** `/event-types/reunions`
- **Tujuan:** menemukan kembali komunitas, mengumpulkan household/travel info, dan berbagi update.
- **Archetype:** reunion community hub.
- **Urutan:** hero group/year → why gather → itinerary → who’s attending opt-in → RSVP household → travel/stay → memory archive → updates/contact → FAQ → footer CTA.
- **Komponen:** cohort fields, attendee visibility consent, itinerary, upload moderation; **data/aset:** archival photos, cohort list permission, lodging info.
- **Mobile:** invite-code access, attendee opt-in, easy upload, itinerary tabs.
- **Referensi:** P2, P3, E1.
- **Boleh:** community coordination. **Hindari:** exposing contact lists, facial tagging, unmoderated archives.

#### 43. Graduations
- **URL:** `/event-types/graduations`
- **Tujuan:** merayakan lulusan dan memberi detail ceremony/party yang berbeda.
- **Archetype:** milestone invitation with multi-event schedule.
- **Urutan:** hero graduate → achievement story → ceremony vs party → schedule/tickets → RSVP → venue/parking → gallery/messages → gifts optional → FAQ → footer CTA.
- **Komponen:** multi-event attendance, ticket allocation, message wall, map; **data/aset:** graduate consent, school naming rules, ceremony ticket limits.
- **Mobile:** event switch clear, ticket info pinned, photo consent.
- **Referensi:** P2, P3, P1.
- **Boleh:** multi-occasion invitations. **Hindari:** school trademark misuse, public student details, confusing ceremony admission.

### FAITH & CULTURAL

#### 44. Aqiqah & Khitanan
- **URL:** `/event-types/aqiqah-and-khitanan`
- **Tujuan:** menyampaikan syukuran keluarga secara hormat, personal, dan praktis.
- **Archetype:** culturally specific family invitation.
- **Urutan:** hero nama/tanggal → pengantar keluarga → makna/acara → rangkaian waktu → lokasi → RSVP household → konsumsi/akses → doa/ucapan → FAQ → footer CTA.
- **Komponen:** pilihan jenis acara, nama keluarga, map, RSVP, ucapan termoderasi; **data/aset:** teks keluarga yang ditinjau, foto berizin, detail adat/agama lokal.
- **Mobile:** detail inti dan map dahulu, font Arab jika dipakai harus terbaca, form household ringkas.
- **Referensi:** P2, P3, E2 (pola invite/RSVP; konteks lokal harus divalidasi narasumber Indonesia).
- **Boleh:** mekanik RSVP/reminder lintas occasion. **Hindari:** mencampur aqiqah dan khitanan sebagai ritus identik, ornamen stereotip, foto anak tanpa consent.

#### 45. Syukuran
- **URL:** `/event-types/syukuran`
- **Tujuan:** menyediakan format netral untuk berbagai ungkapan syukur keluarga/komunitas.
- **Archetype:** flexible intimate gathering invitation.
- **Urutan:** hero occasion/date → note from host → reason/context → schedule → location → RSVP → food/access → wishes → FAQ → footer CTA.
- **Komponen:** custom occasion label, host note, RSVP, map, wishes; **data/aset:** host-approved wording, accurate schedule, cultural review.
- **Mobile:** hero pendek, RSVP/map above fold, lightweight sharing.
- **Referensi:** P2, P3, E2.
- **Boleh:** flexible template system. **Hindari:** memaksakan ritual, copy religius generik, animasi dekoratif berat.

#### 46. Baby showers
- **URL:** `/event-types/baby-showers`
- **Tujuan:** mengatur shower dengan aktivitas, dietary, registry optional, dan privasi keluarga.
- **Archetype:** intimate celebration invite.
- **Urutan:** hero parent(s)/date → host note → theme/activities → details → RSVP → dietary/access → registry optional → photo/privacy guidance → FAQ → footer CTA.
- **Komponen:** RSVP, activity poll, dietary, registry link optional; **data/aset:** family-approved details, original theme art, host contact.
- **Mobile:** RSVP immediate, registry secondary, no auto-shared photos.
- **Referensi:** P3, P2, P1.
- **Boleh:** occasion breadth and real-time RSVP. **Hindari:** gender assumptions, gift pressure, pregnancy/health details.

#### 47. Gender reveals
- **URL:** `/event-types/gender-reveals`
- **Tujuan:** mengelola gathering reveal dengan ekspektasi, privasi, dan safety yang jelas.
- **Archetype:** suspense-led personal invitation.
- **Urutan:** hero date/teaser → host note → safe activity plan → schedule → RSVP → location → food/access → privacy/photo rules → FAQ → footer CTA.
- **Komponen:** countdown optional, RSVP, prediction poll optional, safety note; **data/aset:** safe plan, venue permission, family-approved terminology.
- **Mobile:** motion minimal, safety info visible, RSVP simple.
- **Referensi:** P3, P2, E2.
- **Boleh:** anticipation and easy coordination. **Hindari:** pyrotechnic encouragement, binary stereotypes, data anak/pregnancy publik.

### CELEBRATIONS

#### 48. Holiday gatherings
- **URL:** `/event-types/holiday-gatherings`
- **Tujuan:** mengumpulkan keluarga/teman lintas tradisi dengan potluck, travel, dan RSVP.
- **Archetype:** seasonal gathering invite.
- **Urutan:** hero holiday-neutral → host note → details → activities/traditions → RSVP household → potluck/menu → travel/stay → accessibility → FAQ → footer CTA.
- **Komponen:** potluck signup, household RSVP, travel card, tradition customizer; **data/aset:** original seasonal assets, food plan, host rules.
- **Mobile:** potluck list live, map, share link, reduced animation.
- **Referensi:** P2, P3, P1.
- **Boleh:** templates for diverse holidays. **Hindari:** satu agama sebagai default, duplicate potluck items tanpa locking, borrowed artwork.

#### 49. Retirement parties
- **URL:** `/event-types/retirement-parties`
- **Tujuan:** menghormati karier dan mengumpulkan kolega/keluarga secara hangat.
- **Archetype:** tribute event invitation.
- **Urutan:** hero honoree → career story/timeline → host/program → details → RSVP → tribute submissions → venue/access → gift guidance optional → FAQ → footer CTA.
- **Komponen:** career timeline, moderated messages/video, RSVP segments; **data/aset:** employer-approved facts/assets, honoree consent, archive media.
- **Mobile:** timeline single column, upload easy, moderation states.
- **Referensi:** P2, P3, E2.
- **Boleh:** tribute storytelling. **Hindari:** confidential work history, age jokes/defaults, unmoderated public uploads.

#### 50. Celebrations of life
- **URL:** `/event-types/celebrations-of-life`
- **Tujuan:** memberi informasi memorial dengan tenang serta mengumpulkan RSVP dan kenangan secara sensitif.
- **Archetype:** restrained memorial information page.
- **Urutan:** quiet hero nama/tanggal → family note → service/program → location/stream → RSVP optional → obituary/legacy → memory submission → flowers/donation guidance → accessibility/support → footer CTA lembut.
- **Komponen:** privacy controls, stream access, moderated memories, donation preference; **data/aset:** family-approved portrait/text, service facts, consent, support contacts.
- **Mobile:** typography sangat terbaca, no celebratory motion, tap directions/stream, low-friction RSVP.
- **Referensi:** P2, P3, E2 (hanya mekanik invite/RSVP; tone wajib divalidasi keluarga).
- **Boleh:** clear logistics and private sharing. **Hindari:** scarcity/marketing urgency, upbeat gamification, auto-publishing memories, monetisasi menonjol.

## Guardrail lintas halaman untuk fase desain berikutnya
1. Gunakan sistem Vienne: light-only, pink sebagai aksen terukur, Manrope, editorial modern, radius 8–11 px; variasikan imagery dan information architecture, bukan identitas merek.
2. Tiap halaman harus punya satu primary conversion sesuai konteks (buat event, demo, daftar, RSVP, tiket, donasi), tidak semuanya sekaligus.
3. Klaim scale, ROI, security, compliance, impact, accreditation, dan accessibility hanya boleh tampil jika ada bukti internal.
4. Semua foto, logo, testimonial, angka, speaker, dan cerita harus berizin/terverifikasi; gunakan placeholder berlabel sebelum tersedia.
5. Cultural, faith, medical, legal, child-safety, dan memorial content memerlukan review domain/lokal; referensi produk hanya menginformasikan pola, bukan otoritas substansi.
6. Mobile bukan versi diperkecil: prioritaskan essentials, CTA kontekstual, agenda vertikal/accordion, filter bottom-sheet, map/calendar deep-link, form satu kolom, media hemat bandwidth, dan reduced motion.
7. Jangan menyalin copy, komposisi khas, ilustrasi, icon set, nama fitur, atau brand codes kompetitor; adaptasi hanya prinsip generik seperti hierarchy, progressive disclosure, proof, dan friction reduction.

## Catatan validasi registry
- Registry memuat tepat 50 judul dan header mereferensikan tepat 50 item.
- Normalisasi penting: `&` menjadi `and`; en dash menjadi `-`; sehingga contoh valid adalah `summits-and-forums`, `k-12-schools`, dan `aqiqah-and-khitanan`.
- Destination Weddings/Birthdays/Aqiqah/Syukuran tetap URL registry, bukan `_legacyHref`, karena helper `link()` mengabaikan parameter legacy.
- Tidak ada destination duplikat di menu Jenis Acara.

## Keterbatasan sumber
Hasil pencarian memberi URL dan ringkasan yang cukup untuk memvalidasi pola produk: Eventbrite menekankan ticket/payment/promotion/management serta conference–workshop–trade show–networking; Partiful menekankan invite lintas channel dan RSVP real-time untuk occasion personal; Cvent mengelompokkan solusi enterprise/onsite dan vertical; Growform menekankan satu conversion goal dan minim distraksi. Karena extractor tidak tersedia pada backend, dokumen sengaja tidak mengklaim detail visual/section aktual dari halaman sumber. Sebelum desain final, lakukan visual QA manual terhadap URL sumber dan dokumentasikan screenshot bertanggal bila hak penggunaan mengizinkan.
