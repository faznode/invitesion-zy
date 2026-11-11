# Knowledge Taxonomy & Classifier — BUSINESS/COMMUNITY dan INDUSTRY/USE-CASE

> **Status:** grounding untuk hardcoded registry/classifier; belum implementasi kode. **Bahasa:** Indonesia dengan sinyal bilingual. **Canonical rule:** `event_type` menjawab *acara apa/hasil apa*; `industry_context` menjawab *siapa yang menjalankan/lingkungannya*. Industry tidak pernah mengganti event utama.

## Audit dan hitungan coverage

| Sumber | Expected | Ditemukan | Status |
|---|---:|---:|---|
| `app/marketing-header.tsx`, tab By Event Type (BUSINESS/COMMUNITY) | 20 | 20 | exact |
| `app/marketing-header.tsx`, tab By Industry (INDUSTRY/USE-CASE) | 16 | 16 | exact |
| `app/marketing-registry.ts`, seluruh `event-types` | 50 | 50 | 20 business/community + 16 industry + 14 personal | exact |
| Existing design research | 7 dokumen | 7 | inventoried; existing corpus mostly format/design, bukan classifier rules |

Catatan: registry memang mencampur 36 destination pada satu array dan mempertahankan URL `/event-types/<slug>`. Jangan mengubah slug/link hidup saat memisahkan dimensi secara internal. `Enterprise`, `Businesses`, dst. adalah industry/context, bukan event type. “Client & VIP events” adalah canonical event type (bukan industri).

## 1. Kontrak output classifier

```ts
{
  event_type: CanonicalEventType | null,
  industry_context: IndustryContext[],
  confidence: number,
  evidence: string[],
  mixed_intents: string[],
  clarification_questions: string[],
  redirect: { target: string, confirmed: boolean } | null,
  transferable_fields: Record<string, unknown>
}
```

**Prioritas:** (1) tujuan/outcome eksplisit, (2) audiens dan hubungan penyelenggara–tamu, (3) format/program, (4) industri. Sponsor, speaker, RSVP, venue, tiket, dan fundraising adalah fitur/field—tidak otomatis menentukan tipe. Mixed intent boleh: `conference + fundraising`, `product_launch + brand_activation`; pilih satu primary berdasarkan outcome dan simpan secondary. Redirect hanya setelah customer mengonfirmasi, dengan link kategori hidup; jangan over-redirect.

### Lima kelas utterance (wajib untuk setiap tipe)
1. **Direct positive:** “Kami mengadakan [tipe] untuk [outcome].”
2. **Indirect positive:** menyebut tujuan/program yang khas tanpa nama tipe.
3. **Negative/contrast:** “bukan [nearest alternative], kami ingin [outcome].”
4. **Mixed/ambiguous:** dua tujuan atau sinyal yang sama kuat; tanyakan outcome utama.
5. **Industry-only:** hanya menyebut organisasi/sektor; simpan industry, minta format acara.

### Intake universal
`event_name`, `date/time/timezone`, `location/online`, `organizer`, `event_owner`, `audience`, `guest_count`, `public_or_private`, `primary_outcome`, `program/run_of_show`, `registration/rsvp`, `ticket_price/donation`, `speakers/performers`, `branding`, `language`, `accessibility`, `privacy/consent`, `check-in`, `follow_up`, `venue_contact`. `event_owner` = pihak yang memiliki tujuan/keputusan acara; `organizer` = pihak yang mengeksekusi; `venue` hanya lokasi. Bila agency/venue mengerjakan acara klien, owner tetap klien.

## 2. Canonical event taxonomy

**Default modules:** `website/invitation`, `registration/rsvp`, `guest-list`, `email/WA`, `check-in`, `analytics`. “Required” di bawah berarti classifier menandai kebutuhan; “allowed” opsional; “forbidden” jangan dipaksakan/ditampilkan sebagai default. Section order adalah urutan landing/invitation.

### Ringkas registry seluruh 20 tipe
| ID / destination hidup | Definisi & outcome | Positive signals (EN / ID) | Negative/boundary & nearest alternative |
|---|---|---|---|
| `client-vip-events` | jamuan klien/VIP; outcome retention, relationship | “VIP hospitality”, “client dinner” / “menjamu klien penting” | bukan sekadar appreciation; nearest `customer-appreciation`, `networking` |
| `customer-appreciation` | berterima kasih kepada pelanggan; loyalty | “thank customers”, “customer thank-you” / “apresiasi pelanggan” | bila employee → employee; bila demo produk → launch |
| `employee-appreciation` | penghargaan karyawan; morale/retention | “recognize employees” / “apresiasi pegawai” | bukan training; nearest `holiday-parties`, internal meeting |
| `brand-activations` | pengalaman publik untuk memperkuat awareness/interaction | “brand experience”, “activation” / “aktivasi merek” | bukan peluncuran satu produk; nearest launch, field marketing |
| `product-launches` | memperkenalkan produk/fitur baru; awareness/adoption | “launch”, “unveil”, “demo new product” / “peluncuran produk” | bila produk hanya backdrop dan tujuan reach → activation |
| `conferences` | agenda multi-sesi berbagi pengetahuan untuk audiens luas; authority/leads | “annual conference”, “multiple sessions” / “konferensi, sesi paralel” | bukan satu kelas (`workshop`), bukan pertemuan santai (`networking`) |
| `summits-forums` | forum tingkat tinggi, isu/strategi, peserta terkurasi; alignment/positioning | “executive summit”, “policy forum” / “forum pimpinan” | bukan conference massal; nearest investor/shareholder |
| `tradeshows-expos` | pameran multi-exhibitor; discovery/leads | “booths, exhibitors, expo” / “booth, pameran” | single-brand activation/launch berbeda |
| `sales-kickoffs` | kickoff tahunan penjualan; alignment, motivation, targets | “SKO”, “sales kickoff” / “kickoff sales” | bukan general conference atau offsite |
| `workshops-classes` | pembelajaran hands-on terstruktur; skill/output | “hands-on class”, “training workshop” / “kelas praktik” | bukan conference talk; internal-only training tetap tipe ini bila outcome skill |
| `field-marketing` | acara marketing regional/channel; pipeline/leads | “roadshow”, “regional demand gen” / “roadshow, pemasaran lapangan” | activation bila experiential; conference bila content-led |
| `networking-events` | interaksi dan koneksi antar peserta sebagai outcome utama | “meet and connect”, “mixer” / “berjejaring” | speaker bukan bukti conference; bila agenda ilmu utama → conference |
| `internal-meetings-trainings` | rapat/training internal; keputusan atau kapabilitas | “all-hands, onboarding, internal training” / “rapat/training internal” | skill event dapat `workshop`; lokasi luar kantor tidak otomatis offsite |
| `team-building-offsites` | kegiatan tim di luar rutinitas/lokasi; cohesion/alignment | “team retreat”, “offsite” / “retret/team building” | bila agenda kerja/skill dominan → internal meeting/training |
| `investor-shareholder` | briefing/meeting pemilik modal; governance/transparency | “AGM, investor day” / “RUPS, hari investor” | bukan conference publik; fundraising nonprofit berbeda |
| `holiday-parties` | perayaan hari raya/liburan organisasi; morale/celebration | “holiday party”, “year-end party” / “pesta akhir tahun” | employee appreciation bila penghargaan inti |
| `galas-benefit-dinners` | acara formal premium dengan dinner/program; prestige + stewardship | “black tie gala”, “benefit dinner” / “gala makan malam” | gala tidak selalu fundraising; jika donasi/campaign inti → fundraising (canonical extension) |
| `donor-stewardship` | merawat relasi donor dan menunjukkan dampak; retention | “donor thank-you”, “impact briefing” / “apresiasi donor, laporan dampak” | bukan otomatis fundraiser; nearest customer/employee appreciation |
| `shows-performances` | pertunjukan terjadwal; attendance/ticket revenue | “concert, theater, live show” / “konser, pentas” | speaker-led conference bukan performance |
| `community-events` | gathering komunitas berbasis rasa memiliki/partisipasi; belonging/engagement | “community gathering”, “open to our community” / “kumpul komunitas” | networking jika connection profesional; workshop jika skill outcome |

**Canonical extension yang harus tersedia di classifier walau belum menjadi destination header terpisah:** `fundraising` (donasi/campaign adalah outcome utama), `appreciation` (umbrella; turunkan ke customer/employee/donor), `performance`, `internal_meeting_training`, `offsite`, `gala`, `brand_activation`, `product_launch`, `community_event`, `conference`, `workshop`, `networking`. Map ke destination hidup terdekat saat redirect; jangan mengarang URL baru.

### Profile rules per tipe (intake, modul, desain)
Gunakan aturan berikut untuk semua row di atas; ini melengkapi definisi/sinyal/batas row.

| Tipe | Pertanyaan klarifikasi utama | Field khusus | Required / allowed / forbidden | Section order & design direction |
|---|---|---|---|---|
| Client/VIP | siapa VIP, relationship goal? | VIP tier, host, seating | required RSVP + guest tags; allowed seating/dietary; forbidden public ticket default | hero → host note → agenda → RSVP → hospitality; editorial, premium |
| Customer appreciation | customer segment, reward? | loyalty tier, gift, redemption | RSVP/guest tags required; allowed coupon; forbidden donation | gratitude hero → benefit → details → RSVP → follow-up; warm branded |
| Employee appreciation | who recognized, awards? | award categories, manager | RSVP + private access; allowed seating; forbidden public indexing | recognition → program → RSVP → logistics; celebratory |
| Activation | interaction/KPI? | activation mechanic, booth, consent | registration/check-in/analytics; allowed QR lead capture; forbidden donation default | promise → experience → schedule → RSVP/location → consent; bold visual |
| Product launch | produk/CTA/adoption target? | demo, embargo, CTA | website + RSVP + analytics; allowed ticket; forbidden gala/donation | reveal → value → demo → speakers → RSVP → CTA; product-led |
| Conference | tracks/sessions, capacity? | tracks, speakers, deadlines | registration, agenda, check-in required; allowed badge/ticket; forbidden seating-first | hero → value → speakers → agenda → tickets → FAQ → RSVP; information architecture |
| Summit/forum | decision/theme, invite-only? | policy theme, VIP, protocol | RSVP + privacy; allowed livestream; forbidden casual mixer default | thesis → principals → agenda → RSVP → protocol; authoritative |
| Expo | exhibitors/booths? | booth map, exhibitor, lead consent | registration/check-in/badge required; allowed ticket; forbidden single-speaker hierarchy | exhibitors → floor plan → agenda → tickets → logistics; modular |
| Sales kickoff | target/quarter, internal? | goals, teams, recognition | private registration + agenda; allowed travel; forbidden public SEO | rally → targets → agenda → logistics → private RSVP; energetic |
| Workshop/class | learning objective, level? | capacity, materials, instructor | registration + capacity required; allowed payment/certificate; forbidden unstructured mixer | outcome → instructor → what bring → schedule → RSVP; instructional |
| Field marketing | region/channel, pipeline KPI? | territory, campaign, lead source | registration + analytics; allowed demo/ticket; forbidden internal-only default | local promise → content → host → RSVP → follow-up; localized |
| Networking | who should meet whom? | interests, matchmaking, format | RSVP + tags/check-in; allowed ticket; forbidden long agenda-first | people → why connect → format → RSVP → venue; social density |
| Internal meeting/training | decision atau skill? | access group, prework, outcomes | private RSVP/attendance; allowed recording; forbidden public sharing | objective → agenda → prep → RSVP → resources; functional |
| Offsite | cohesion atau kerja? | travel, rooms, emergency contact | private RSVP + logistics; allowed seating/dietary; forbidden public ticket | purpose → itinerary → travel → RSVP → safety; experiential |
| Investor/shareholder | governance, disclosure? | shareholder verification, proxy | private RSVP + consent; allowed livestream; forbidden open registration | notice → agenda → documents → attendance → contact; formal |
| Holiday party | celebration & inclusivity? | dietary, plus-one, dress code | RSVP + dietary required; allowed seating; forbidden work agenda | invitation → celebration → details → RSVP; festive |
| Gala/benefit dinner | formal dinner atau fundraising? | table, attire, donation goal | RSVP/seating/dietary; allowed ticket/donation; forbidden workshop UX | cause/host → program → tables/tickets → donation → logistics; elegant |
| Donor stewardship | impact update atau ask? | donor tier, impact, giving CTA | private RSVP + tags; allowed donation; forbidden pressure if thank-you-only | gratitude → impact → program → RSVP → next step; trust-led |
| Performance | show type, ticketing? | lineup, runtime, seat map | ticketing/check-in required; allowed seating; forbidden long speaker bios | artwork → lineup → schedule → tickets → venue/FAQ; visual |
| Community | siapa komunitas, belonging goal? | membership, access, moderation | RSVP + tags/check-in; allowed donation/ticket; forbidden corporate lead default | welcome → community purpose → program → RSVP → guidelines; inclusive |

## 3. Industry/context taxonomy (16 exact destinations)

| Destination hidup | Context signals / pertanyaan tambahan | Compatible event types |
|---|---|---|
| `enterprise` | “company-wide, procurement, departments”; siapa approval/data policy? | semua business; prioritaskan conference, internal, launch, investor |
| `businesses` | SME/company/customer sales; B2B/B2C, team size? | appreciation, networking, launch, workshop, party |
| `financial-services` | bank/fintech/investment, regulated data; compliance/disclosure? | investor, conference, workshop, client/VIP, launch |
| `agencies` | agency mengelola klien; siapa event owner, brand guideline klien? | semua; field marketing, activation, launch, conference |
| `nonprofits-foundations` | mission, beneficiaries, donor; restricted funds/impact reporting? | fundraising, gala, donor stewardship, community, conference |
| `healthcare` | clinic/hospital/provider; patient privacy, accessibility, credentialing? | workshop, conference, community, appreciation, internal training |
| `associations-membership` | member-only, dues, voting; membership verification/quorum? | conference, summit, AGM/investor-like, networking, workshop |
| `government-ngo` | public agency/NGO, protocol, procurement; public notice/language/accessibility? | forum, conference, community, workshop, fundraising |
| `higher-education` | university/alumni/faculty; student vs public, graduation? | conference, workshop, performance, networking, community |
| `k-12-schools` | school, parents/minors; consent, safeguarding, pickup? | community, workshop, performance, appreciation |
| `independent-schools` | private school, admissions/alumni; brand, child safety? | same K–12 + launch/open house |
| `religious-organizations` | mosque/church/temple/etc.; ritual, gender/access norms, donations? | community, fundraising, performance, workshop, appreciation |
| `hospitality-venues` | venue/hotel as host or service provider; capacity, floor plan, booking CTA? | gala, performance, conference, networking, activation |
| `bars-restaurants` | F&B venue; menu, alcohol, age restriction, seating? | networking, gala, performance, appreciation, launch |
| `real-estate` | developer/agent/property; site visit, leads, safety? | launch, activation, networking, workshop, investor |
| `media-publishing` | publisher/newsroom; press access, embargo, accreditation? | launch, conference, performance, forum, networking |

**Rule:** context signal alone (“kami bank”, “kami sekolah”, “agency kami”) menghasilkan `event_type: null` + industry confidence dan satu pertanyaan format/outcome. Industry dapat memberi defaults (privacy, minors, compliance, seating), bukan mengganti tipe. Satu event dapat memiliki banyak industry context.

## 4. Confusion/decision matrix

| Jika sinyal | Pilih | Bukan otomatis karena | Pertanyaan pemutus |
|---|---|---|---|
| Community vs networking | community bila belonging/identity/participation; networking bila professional connections | ada RSVP atau speaker | “Outcome utama rasa memiliki atau koneksi bisnis?” |
| Conference vs workshop | conference bila banyak sesi/insight; workshop bila hands-on skill/output | ada pembicara | “Peserta terutama mendengar banyak topik atau menghasilkan/mempraktikkan sesuatu?” |
| Launch vs activation | launch bila reveal/adoption produk tertentu; activation bila interaction/awareness brand | ada demo/booth | “Yang harus diingat/dilakukan tamu: produk baru atau pengalaman merek?” |
| Gala vs fundraising | gala = format formal dinner; fundraising = outcome donasi | dress code/makan malam | “Jika donasi dihapus, apakah acara tetap ada sebagai gala?” |
| Internal training vs offsite | training = skill; offsite = cohesion/strategic retreat | lokasi di luar kantor | “Keberhasilan diukur dari skill/assessment atau alignment/kebersamaan?” |
| Venue/organizer vs event owner | owner = tujuan dan keputusan; organizer = eksekusi; venue = tempat | domain email/yang mengisi form | “Siapa yang menetapkan outcome, brand, dan budget?” |
| Appreciation vs holiday party | appreciation bila recognition/thanks; holiday bila seasonal celebration | hadiah/makan | “Apakah inti penghargaan orang tertentu atau perayaan musim?” |
| Donor stewardship vs fundraising | stewardship = trust/impact; fundraising = ask/conversion | organisasi nonprofit | “Ada target donasi/ask sebagai CTA utama?” |
| Field marketing vs conference | field = regional pipeline; conference = knowledge agenda | roadshow/speaker | “KPI utama leads lokal atau transfer pengetahuan?” |

## 5. Scoring, negative signals, mixed intent

- +5 untuk outcome eksplisit, +3 untuk format eksplisit, +2 untuk audience/relationship, +1 untuk vocabulary; −4 bila utterance eksplisit menyangkal tipe. Industry hanya menambah context score, tidak masuk kompetisi event type.
- Ambang: ≥8 dan margin ≥2 → classify; <8 atau margin <2 → klarifikasi; confidence rendah jangan redirect.
- “Sponsor”, “speaker”, “RSVP”, “ticket”, “donation”, “venue”, “VIP” adalah transferable fields, bukan label tunggal.
- Simpan semua bukti dan secondary intents. Tanyakan maksimal 2 pertanyaan paling informatif; jangan mengulang field yang sudah disebut.

## 6. Redirect dan transferable fields

Redirect ke destination hidup hanya setelah konfirmasi: `Conferences → /event-types/conferences`, `Workshops & classes → /event-types/workshops-and-classes`, `Community events → /event-types/community-events`, `Networking events → /event-types/networking-events`, `Product launches → /event-types/product-launches`, `Brand activations → /event-types/brand-activations`, dst. Slug wajib dihasilkan oleh `slugifyMarketingTitle`, bukan hardcode asumsi. Untuk canonical extension tanpa halaman (`fundraising`, generic appreciation, offsite, performance), tawarkan nearest live page dan nyatakan mapping sebelum redirect.

Transfer lintas redirect: nama, tanggal, lokasi, timezone, owner/organizer, audience, jumlah tamu, RSVP, ticket/donation, agenda, speaker/performer, branding, accessibility, privacy, seating, dietary, check-in, consent, KPI, dan industry context. Field yang tidak kompatibel (mis. seating untuk webinar) tetap disimpan sebagai optional, tidak dipaksa.

## 7. Gap eksplisit dan keputusan implementasi

- **Gap riset:** tidak ditemukan dokumen sumber eksternal yang memvalidasi nomenklatur internal, threshold scoring, atau taxonomy bilingual; riset existing berfokus menu/format/desain. Karena itu rules di sini adalah design specification yang perlu product validation, bukan klaim benchmark.
- **Gap registry:** 20 event destinations dan 16 industry destinations berada dalam satu `event-types`; diperlukan metadata `dimension: event_type|industry_context`, canonical IDs, aliases bilingual, negative aliases, dan `redirectTarget` tanpa memutus URL lama.
- “Fundraising” generic belum ada sebagai destination header; “appreciation”, “performance”, “offsite”, “gala”, dan “internal meeting/training” sebagian hadir sebagai nama majemuk. Pertahankan canonical semantic IDs lalu map ke halaman terdekat.
- Validasi minimum sebelum shipping: fixture bilingual untuk lima kelas per 20 tipe (100 utterances), industry-only fixture untuk 16 industry, confusion pairs di atas, dan human review untuk mixed intents. Jangan publish redirect tanpa customer confirmation.

**Acceptance checklist:** [ ] 20/20 event covered; [ ] 16/16 industry covered; [ ] event/context terpisah; [ ] negative signals dan nearest alternatives; [ ] lima kelas utterance; [ ] intake/modules/order/design; [ ] matrix confusion; [ ] owner/organizer/venue; [ ] live-link confirmation; [ ] gap tercatat.
