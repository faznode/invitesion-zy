<!-- SUMMARY (first 7 lines — greppable) -->
# Riset Direction Undangan Digital — Wedding & Birthday
> WHAT: 16 archetype visual mobile-first (8 wedding, 8 birthday), matriks pembeda, kompatibilitas field, dan shortlist MVP.
> STATUS: RESEARCH COMPLETE — perlu validasi visual/prototipe dan lisensi aset per implementasi.
> OWNER: Oracle / Design Research
> DEPS: app/(customer)/dashboard/invitations/[id]/edit/editor.tsx
> UPDATED: 2026-07-18

## 1. Tujuan dan batas riset

Dokumen ini adalah **bahan kreatif untuk dikembangkan**, bukan desain final atau instruksi meniru kompetitor. Nama konsep, sistem komposisi, palette roles, dan kombinasi elemen di bawah merupakan sintesis original. URL dipakai untuk mempelajari kategori, pola interaksi, tipografi, atau bahasa visual—**jangan menyalin layout, copy, ilustrasi, foto, maupun aset**. Brand marketing Vienne boleh light/pink; halaman undangan customer harus bebas memiliki identitas tema sendiri.

Metode: audit editor lokal, maksimal lima `web_search` (tepat 5 dipakai), lalu percobaan `web_extract` atas 5 URL. Ekstraksi gagal karena backend lingkungan hanya mendukung search; temuan web karenanya dibatasi pada metadata/snippet hasil pencarian dan URL nyata, bukan audit halaman penuh. Semua rekomendasi perlu visual QA saat implementasi.

### Legenda kebutuhan aset
- **NF — no-photo feasible:** lengkap tanpa foto; upload foto boleh menjadi enhancement.
- **PF — photo-forward:** kualitas konsep bergantung pada foto customer.
- **CI — custom illustration:** perlu paket ilustrasi original/custom atau aset berlisensi yang cukup fleksibel.

## 2. Audit kompatibilitas struktur Vienne

Sumber kode: `/root/.hermes/profiles/operator/projects/invitation-platform/app/(customer)/dashboard/invitations/[id]/edit/editor.tsx`.

### Field/modul yang tersedia
- **Wedding:** `couple` (bride/groom: fullName, nickName, parents, order, Instagram, photoUrl); `theme` (templateId, paletteId, cover image/headline, hanya editable bila add-on); array `events` (title, venueName, startAt, mapUrl); music; greetings; gift/accounts; RSVP (enabled, deadline, maxGuests); gallery/media; guestbook; streaming; story/items (title/body); Instagram Story (hashtag/filter); quote; WhatsApp template.
- **Birthday:** `birthdayPerson` (fullName, nickName, birthDate, age, parents, Instagram, photoUrl), message; events; quote; music; greetings; gallery; RSVP; guestbook; streaming; WhatsApp. **Story, Instagram Story, dan gift disembunyikan.**
- Galeri mempertahankan urutan upload. Cover mendukung satu `imageUrl` dan headline. Event saat ini belum memiliki alamat panjang, end time, dress code, atau timezone field eksplisit.
- Musik memiliki autoplay, tetapi browser/mobile dapat memblokirnya; desain harus selalu punya kontrol eksplisit dan tetap utuh tanpa audio.

### Konsekuensi desain
1. Semua direction memakai urutan inti yang dapat dipetakan ke field kini: **cover/hero → profil → quote/pesan → event(s) → media opsional → RSVP → ucapan/guestbook → utilitas (map/stream/music) → penutup**.
2. Wedding boleh memakai `story`, gift, dan Instagram Story sebagai section modular. Birthday tidak boleh bergantung pada ketiganya.
3. Dress code, FAQ, menu, registry hadiah birthday, countdown, dan tema pesta belum field native: jadikan copy dalam headline/message/quote sementara, atau backlog schema—jangan hard-code data palsu.
4. Direction NF harus punya fallback saat `photoUrl`, cover, atau gallery kosong. PF harus memvalidasi crop/focal point; editor saat ini belum menyimpan focal point/alt text.
5. Satu renderer sebaiknya memakai tokens/variant schema, bukan 16 halaman terpisah; tetapi struktur birthday wajib terasa event-specific, bukan wedding skin.

---

# 3. WEDDING — 8 direction

## W1 — **Arsip Senja** `[PF]`
- **Mood/target:** intim, dokumenter, dewasa; pasangan urban yang punya foto candid/prewedding sinematik.
- **Visual DNA:** photobook analog, caption editorial, grain halus, nomor frame, whitespace; bukan scrapbook ramai.
- **Palette roles:** paper hangat (canvas), charcoal (teks), umber (aksi), muted amber (highlight), fog gray (divider).
- **Tipografi:** **Fraunces** (display) + **Manrope** (UI/body), keduanya Google Fonts/OFL; sediakan system fallback.
- **Composition signature:** alur seperti contact sheet; foto full-bleed diselingi spread teks sempit, metadata kecil sejajar grid.
- **Struktur:** cover → profil pasangan → quote → event cards → story sebagai chapter → gallery contact sheet → RSVP → gift/stream → guestbook → closing frame.
- **Hero:** satu foto landscape/portrait dengan crop adaptif, nama besar di safe area, tanggal sebagai timestamp; tanpa intro gate.
- **Motif/media:** candid, motion blur terkontrol, grain CSS/overlay sangat ringan; hindari preset film berhak cipta.
- **Motion:** crossfade saat elemen masuk, scrub-free; grain statis; tombol musik opt-in. Hormati `prefers-reduced-motion`.
- **Mobile:** hero 75–90svh; `object-position` per breakpoint (sementara center); contact sheet menjadi 2 kolom; CTA RSVP sticky hanya setelah event.
- **Pitfall aksesibilitas:** teks di foto, grain menurunkan kontras, caption terlalu kecil, crop wajah. Gunakan scrim, min 16px body, alt text/fallback nama.
- **Checklist aset:** 1 hero 4:5 + 16:9; 8–16 foto konsisten; thumbnail WebP/AVIF; logo/monogram opsional SVG; izin model/fotografer; focal-point QA; fallback gradient.
- **Referensi:** [contoh wedding digital editorial](https://www.thedigitalyes.com/blog/ejemplos-invitaciones-boda-digitales) · [Bliss & Bone example](https://maggieanddanny.net/) · [Awwwards](https://www.awwwards.com/).

## W2 — **Janji Beraksara** `[NF]`
- **Mood/target:** literer, tenang, sophisticated; pasangan yang minim foto dan menonjolkan kata-kata.
- **Visual DNA:** buku puisi kontemporer, folio number, marginalia, drop cap, garis hairline.
- **Palette roles:** ivory canvas, ink navy, vermilion accent, parchment panel, graphite muted text.
- **Tipografi:** **Cormorant Garamond** + **Source Sans 3** (Google Fonts/OFL).
- **Composition signature:** kolom baca sempit dengan running header; nama menjadi tipografi display, bukan kaligrafi dekoratif.
- **Struktur:** title page → profil → quote → event as table of contents → story chapters → RSVP “reply card” → gift → guestbook/colophon.
- **Hero:** halaman judul tanpa foto; headline, nama, tanggal, rule line, monogram teks.
- **Motif:** tanda baca, nomor bab, ligature; tidak perlu ilustrasi.
- **Motion:** page markers muncul sederhana; progress reading; tanpa page-flip gimmick.
- **Mobile:** satu kolom 38–65 karakter/baris; marginalia pindah inline; event TOC jadi cards bertumpuk.
- **Pitfall:** display serif terlalu tipis, italic panjang, justified text membentuk rivers. Batasi italic, font weight ≥400, align-left body.
- **Checklist:** subset font legal; type scale; rules SVG/CSS; 3 fallback cover states; copy-length stress test; glyph bahasa Indonesia/Arab bila diperlukan.
- **Referensi:** [Cormorant—Google Fonts](https://fonts.google.com/specimen/Cormorant) · [Typewolf Google Fonts](https://www.typewolf.com/google-fonts) · [Paperless Post](https://www.paperlesspost.com/).

## W3 — **Paviliun Tropika** `[CI]`
- **Mood/target:** hangat, lokal-modern, destination/garden wedding; pasangan yang ingin botanical tanpa “floral watercolor template” generik.
- **Visual DNA:** arsitektur paviliun, bayangan kisi, flora tropis geometris, negative space.
- **Palette roles:** limestone base, leaf deep, terracotta action, sunlight yellow accent, pool blue micro-accent.
- **Tipografi:** **Newsreader** + **DM Sans** (Google Fonts/OFL).
- **Composition signature:** section dibingkai portal/arch abstrak; bayangan daun melintas area kosong, event cards seperti signage venue.
- **Struktur:** portal hero → couple → quote → schedule/venue → story path → illustrated gallery frames → RSVP → gift/stream → wishes.
- **Hero:** siluet paviliun custom dan nama di tengah; foto opsional dalam arch, bukan wajib.
- **Motif:** 6–10 botanical vector original (pisang, palem, heliconia) + pattern kisi; hindari meniru flora suite tertentu.
- **Motion:** parallax maksimal 4–8px, leaf shadow drift lambat; reduced-motion menjadi statis.
- **Mobile:** portal disederhanakan; dekorasi tidak menutupi copy; map CTA full-width; illustration lazy-load.
- **Pitfall:** hijau/merah sebagai satu-satunya status, detail daun mengganggu teks, SVG berat. Status RSVP wajib ikon+label.
- **Checklist:** master SVG ber-layer; 3 density crop; poster fallback; contrast map; kompresi; lisensi/kontrak ilustrator; photo mask opsional.
- **Referensi:** [Greenvelope](https://www.greenvelope.com/) · [Greetings Island wedding](https://www.greetingsisland.com/invitations/wedding) · [Paperless Post](https://www.paperlesspost.com/).

## W4 — **Sumbu Upacara** `[NF]`
- **Mood/target:** formal, sakral, lintas budaya; keluarga besar dan rangkaian akad/resepsi.
- **Visual DNA:** simetri arsitektural, grid aksial, seal abstrak, ruang napas; mewah lewat proporsi, bukan efek emas palsu.
- **Palette roles:** bone, ceremonial black, oxblood action, antique-gold accent (flat color), stone separators.
- **Tipografi:** **Bodoni Moda** + **Noto Sans** (Google Fonts/OFL; Noto kuat untuk glyph luas).
- **Composition signature:** center axis konsisten; dua event tampil sebagai panel ritual berpasangan; ornaments tipis di empat sudut.
- **Struktur:** formal cover → couple/family → quote/prayer → paired ceremonies → protocol/maps → story opsional → RSVP → gift → guestbook.
- **Hero:** crest generatif dari inisial (bukan lambang adat/agama tanpa izin), nama dan tanggal centered.
- **Motif:** garis ukir geometris original; motif budaya hanya setelah review makna dan hak penggunaan.
- **Motion:** line draw 400–600ms, reveal simetris; tidak ada confetti.
- **Mobile:** axis tetap; paired event menjadi sequence dengan label jelas; ornamen dikurangi 60%.
- **Pitfall:** teks uppercase panjang, simbol budaya keliru, gold contrast rendah. Gunakan label normal case dan gold hanya dekoratif.
- **Checklist:** monogram generator; corner SVG; glyph tests; contoh 1/2/3 event; prayer long-copy test; checklist cultural review.
- **Referensi:** [Greenvelope](https://www.greenvelope.com/) · [Greetings Island wedding](https://www.greetingsisland.com/invitations/wedding) · [Paperless Post](https://www.paperlesspost.com/).

## W5 — **Kota Setelah Hujan** `[PF]`
- **Mood/target:** cinematic malam, modern, non-tradisional; pasangan kota, venue rooftop/industrial.
- **Visual DNA:** wet asphalt reflection, panoramic crop, condensed labels, itinerary wayfinding.
- **Palette roles:** near-black canvas, cloud white text, electric cobalt action, sodium amber accent, steel gray surfaces.
- **Tipografi:** **Oswald** + **Inter** (Google Fonts/OFL).
- **Composition signature:** horizontal bands dan koordinat visual; event sebagai transit stops; foto wide dengan hard crop.
- **Struktur:** night hero → couple credits → quote → itinerary → venue/maps → story “scenes” → gallery → RSVP → stream/gift → closing credits.
- **Hero:** foto kota/venue malam; headline condensed besar, overlay dengan scrim solid.
- **Motif:** garis rute dan titik koordinat dekoratif (jangan tampilkan koordinat palsu sebagai informasi).
- **Motion:** light sweep subtle, itinerary line progress; no flashing/neon pulse.
- **Mobile:** panorama memakai art-directed portrait; route vertikal; dark theme tetap contrast tinggi dan form field terang.
- **Pitfall:** halo neon, teks tipis di hitam, motion memicu vestibular, foto malam noisy. Batasi glow dan sediakan reduced-motion.
- **Checklist:** hero night 4:5; noise cleanup; route SVG; dark form states; image scrim presets; favicon/OG crop.
- **Referensi:** [contoh digital wedding](https://www.thedigitalyes.com/blog/ejemplos-invitaciones-boda-digitales) · [Awwwards](https://www.awwwards.com/) · [Bliss & Bone example](https://maggieanddanny.net/).

## W6 — **Bauhaus Berdua** `[NF]`
- **Mood/target:** playful-intellectual, art/design crowd, micro wedding.
- **Visual DNA:** primary geometry, modular grid, giant initials, asymmetric blocks; tegas dan anti-romantic cliché.
- **Palette roles:** warm white, black text, primary red action, cobalt panel, butter yellow accent.
- **Tipografi:** **Space Grotesk** + **IBM Plex Mono** (Google Fonts/OFL).
- **Composition signature:** tiap section menjadi komposisi shape berbeda dalam grid 12; informasi tetap linear secara DOM.
- **Struktur:** typographic hero → couple cards → event grid → quote poster → story timeline → RSVP form → gift/utilities → guestbook.
- **Hero:** inisial sebagai circles/rectangles CSS; tanggal menjadi elemen skala besar.
- **Motif:** bentuk geometri CSS/SVG original, panah, angka; foto opsional duotone dalam kotak.
- **Motion:** shape snap/translate singkat; jangan drag interaction untuk informasi utama.
- **Mobile:** grid menjadi 4 kolom; overlap dihapus; shapes `aria-hidden`; CTA tetap berlabel.
- **Pitfall:** urutan visual beda dari DOM, kombinasi primer menyilaukan, mono untuk body. Audit keyboard/screen-reader; mono hanya metadata.
- **Checklist:** token grid; shape library; contrast combinations; DOM-order test; long-name stress; reduced-motion states.
- **Referensi:** [Awwwards](https://www.awwwards.com/) · [Space Grotesk files/info](https://gwfh.mranftl.com/fonts/space-grotesk?subsets=latin) · [Typewolf Google Fonts](https://www.typewolf.com/google-fonts).

## W7 — **Embun Herbarium** `[CI]`
- **Mood/target:** natural, delicate, daytime garden; pasangan romantis yang tidak ingin foto dominan.
- **Visual DNA:** specimen botanical, label museum, pressed leaf silhouette, paper texture rendah.
- **Palette roles:** mist cream, botanical ink, sage panel, berry action, clay accent.
- **Tipografi:** **Lora** + **Work Sans** (Google Fonts/OFL).
- **Composition signature:** tanaman “dikoleksi” per chapter; label Latin-style hanya dekoratif dan harus benar bila menyebut spesies.
- **Struktur:** herbarium cover → couple → blessing → event specimens → story leaves → gallery opsional → RSVP label → gift → guestbook.
- **Hero:** komposisi satu tangkai custom mengitari nama, banyak negative space.
- **Motif:** scans tanaman sendiri atau ilustrasi vector original; hindari mengunduh scan museum tanpa cek lisensi.
- **Motion:** dew drop opacity dan specimen reveal; tidak ada falling leaves terus-menerus.
- **Mobile:** satu specimen per viewport chunk; tekstur diturunkan; konten tak pernah berada di balik daun.
- **Pitfall:** teks sage rendah kontras, decorative labels dibaca screen reader, spesies/simbol bermakna salah. Set dekorasi `aria-hidden`.
- **Checklist:** 8 botanical assets; rights log; texture tile; edge crops; alt-text policy; print/OG adaptation.
- **Referensi:** [Greenvelope](https://www.greenvelope.com/) · [Greetings Island wedding](https://www.greetingsisland.com/invitations/wedding) · [Canva invitation maker](https://www.canva.com/create/email-invitations/).

## W8 — **Gelombang Nazar** `[NF]`
- **Mood/target:** coastal minimal, spiritual tetapi universal; beach/destination wedding.
- **Visual DNA:** contour lines, tide chart abstraction, horizon bands, airy typography; bukan seashell cliché.
- **Palette roles:** salt white, deep ocean text, sea-glass panel, coral action, sand neutral.
- **Tipografi:** **DM Serif Display** + **Atkinson Hyperlegible** (free/OFL; Atkinson fokus keterbacaan).
- **Composition signature:** garis horizon menghubungkan section; jadwal berupa tide-like stepped timeline.
- **Struktur:** horizon hero → pair profile → quote → event tide chart → travel/map → story → RSVP → streaming/gift → wishes.
- **Hero:** animated gradient sangat lambat + contour SVG; tanpa foto.
- **Motif:** peta kontur abstrak original, bukan data navigasi; foto venue opsional.
- **Motion:** gradient shift dan line drift kecil; statis pada reduced motion/data saver.
- **Mobile:** horizon horizontal menjadi vertical guide; event timezone harus tertulis dalam `startAt` display; map link eksplisit.
- **Pitfall:** pastel contrast, gradient banding, timeline ambigu. Tambahkan tanggal/waktu dalam teks biasa dan fallback solid.
- **Checklist:** contour SVG; gradient fallbacks; 1–3 event states; timezone formatting QA; low-end device test.
- **Referensi:** [Paperless Post](https://www.paperlesspost.com/) · [Greenvelope](https://www.greenvelope.com/) · [digital wedding examples](https://www.thedigitalyes.com/blog/ejemplos-invitaciones-boda-digitales).

### Matriks pembeda Wedding

| ID | Aset | Metafora | Grid | Hero | Dominan | Energi | Risiko produksi |
|---|---|---|---|---|---|---|---|
| W1 | PF | photobook | editorial mixed | candid photo | imagery | intim | medium |
| W2 | NF | poetry book | narrow column | typography | copy | hening | low |
| W3 | CI | tropical pavilion | framed portal | illustration/photo | botanical | hangat | high |
| W4 | NF | ceremony axis | strict symmetric | crest/type | ritual structure | formal | low-medium |
| W5 | PF | night itinerary | horizontal bands | city photo | cinematic | intens | medium-high |
| W6 | NF | Bauhaus poster | asymmetric modular | geometry | type/shape | playful | medium |
| W7 | CI | herbarium | specimen chapters | botanical | illustration | lembut | high |
| W8 | NF | tide/horizon | flowing guide | abstract SVG | atmosphere | lapang | medium |

---

# 4. BIRTHDAY — 8 direction

## B1 — **Orbit Satu Tahun Lagi** `[CI]`
- **Mood/target:** curious, science-play; anak 5–12 atau adult space fan tanpa karakter franchise.
- **Visual DNA:** mission patch original, orbit diagram, star coordinates abstrak, age as “mission number”.
- **Palette roles:** midnight canvas, off-white text, ultraviolet panel, comet orange action, cyan accent.
- **Tipografi:** **Space Grotesk** + **Atkinson Hyperlegible** (free/OFL).
- **Composition signature:** section mengorbit satu spine; event card seperti mission control panel.
- **Struktur:** launch hero → celebrant profile/message → event mission → map/stream → gallery log → RSVP crew manifest → wishes → landing.
- **Hero:** ilustrasi planet custom + usia besar; foto opsional dalam astronaut viewport, tanpa meniru IP.
- **Motif:** planets, trajectory, badges custom; no NASA marks/film characters tanpa lisensi.
- **Motion:** orbit lambat satu putaran >20 detik, star twinkle terbatas; reduced-motion statis.
- **Mobile:** orbit dekoratif disederhanakan; informasi tetap satu kolom; tombol 44px+.
- **Pitfall:** stars berkedip, panel sci-fi sulit dibaca, anak sebagai subjek foto. No flash >3/sec; privacy/parent consent.
- **Checklist:** planet SVG kit; badge generator age/name; dark contrast states; portrait fallback; parental rights check; OG art.
- **Referensi:** [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Evite](https://www.evite.com/) · [Paperless Post](https://www.paperlesspost.com/).

## B2 — **Klub Konfeti Modular** `[NF]`
- **Mood/target:** all-ages, ceria, cepat dipersonalisasi; MVP mass-market.
- **Visual DNA:** chunky modules, confetti punctuation, sticker-like labels tetapi tanpa scrapbook wedding.
- **Palette roles:** clean cream, dark plum text, raspberry action, tangerine highlight, mint/sky supporting blocks.
- **Tipografi:** **Fredoka** + **Nunito Sans** (Google Fonts/OFL).
- **Composition signature:** bento stack, blok warna berbeda per fungsi; age menjadi anchor, bukan foto.
- **Struktur:** age/name hero → message → when/where blocks → RSVP → gallery optional → music/stream → wishes.
- **Hero:** angka usia super-scale, confetti CSS/SVG, headline pendek.
- **Motif:** 12 bentuk confetti original yang dapat recolor.
- **Motion:** burst satu kali setelah load/interaction, bukan loop; tombol punya press feedback.
- **Mobile:** semua bento menjadi stack dengan variasi edge-to-edge/inset; RSVP muncul segera setelah detail.
- **Pitfall:** terlalu banyak warna, confetti sebagai button cue, animation distraction. Satu action color konsisten dan dekorasi `aria-hidden`.
- **Checklist:** confetti SVG; 6 palette preset; long-age/name tests; empty-photo state; reduced motion; color-blind QA.
- **Referensi:** [Evite](https://www.evite.com/) · [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Paperless Post](https://www.paperlesspost.com/).

## B3 — **Album Kilas Balik** `[PF]`
- **Mood/target:** nostalgic milestone 18/30/40/50/60; keluarga/teman yang punya arsip foto.
- **Visual DNA:** decade timeline, date stamps, photo captions, era accents tanpa meniru brand/majalah tertentu.
- **Palette roles:** photo-paper base, espresso text, decade-specific accent, red date stamp action, faded gray.
- **Tipografi:** **Libre Baskerville** + **Libre Franklin** (Google Fonts/OFL).
- **Composition signature:** timeline vertikal kronologis dari birthDate hingga event; gallery upload-order menjadi alur cerita visual.
- **Struktur:** current portrait hero → profile/message → milestones gallery → party details → map → RSVP → wishes.
- **Hero:** before/now split atau current portrait; jangan memalsukan foto lama.
- **Motif:** date stamps dan photo corners CSS; no fake aging yang merusak wajah.
- **Motion:** photo reveal/caption; optional before-now slider hanya jika accessible, bukan kebutuhan inti.
- **Mobile:** timeline single spine; photo aspect ratio stabil; captions selalu terlihat tanpa hover.
- **Pitfall:** privacy foto anak/keluarga, urutan galeri bukan tanggal aktual, teks pada foto. Minta persetujuan dan label urutan manual sebagai backlog.
- **Checklist:** 1 current portrait; 8–20 archive photos; rights/consent; scans cleaned; caption/alt backlog; crop QA; compression.
- **Referensi:** [Paperless Post](https://www.paperlesspost.com/) · [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Evite](https://www.evite.com/).

## B4 — **Piksel Naik Level** `[CI]`
- **Mood/target:** gamer kids/teens/adults; energetic tetapi tidak memakai game franchise.
- **Visual DNA:** original pixel icons, level map, stat cards, 8-bit borders dengan body tetap modern.
- **Palette roles:** deep navy, near-white text, lime action, magenta accent, cyan panels.
- **Tipografi:** **Pixelify Sans** (display) + **Inter** (body/UI), Google Fonts/OFL.
- **Composition signature:** event sebagai next-level card, RSVP sebagai party roster; progress bar dekoratif.
- **Struktur:** “Level [age]” hero → player profile/message → quest details → map → RSVP roster → gallery achievements → guestbook high scores.
- **Hero:** pixel avatar custom atau monogram sprite; foto opsional pixel-frame, bukan filter wajah wajib.
- **Motif:** cake/controller/star icons original; no trademarked sprites/UI sound.
- **Motion:** sprite 4–6 frames saat CTA; audio selalu opt-in; reduced motion frame pertama.
- **Mobile:** pixel edges tetap tajam; body non-pixel; roster/form native and readable.
- **Pitfall:** pixel font unreadable, seizure-like animation, copyright game assets. Pixel font hanya heading; no rapid flash.
- **Checklist:** sprite sheet custom; icon rights; nearest-neighbor export; sound license optional; form contrast; low-end FPS test.
- **Referensi:** [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Evite](https://www.evite.com/) · [Awwwards](https://www.awwwards.com/).

## B5 — **Jamuan Monokrom** `[NF]`
- **Mood/target:** adult milestone, dinner/cocktail, refined dan anti-kekanak-kanakan.
- **Visual DNA:** menu card, reservation ledger, oversized numeral, thin rules; bukan wedding serif/floral.
- **Palette roles:** warm white, carbon text, burgundy action, champagne beige panel, olive micro-accent.
- **Tipografi:** **Instrument Serif** + **Instrument Sans** (OFL/free; verifikasi file distribusi saat bundling).
- **Composition signature:** layout seperti menu prix fixe; details sebagai “reservation”; umur sebagai numeral crop.
- **Struktur:** numeral hero → host message → dinner details/dress note (message fallback) → map → RSVP reservation → music → gallery optional → guestbook toast.
- **Hero:** angka usia + nama, tanpa foto dan tanpa pasangan/couple framing.
- **Motif:** rule, table number, small star; no floral crest.
- **Motion:** underline draw dan number count sekali (jangan membuat pembaca menunggu).
- **Mobile:** menu satu kolom, RSVP dekat detail; action buttons high contrast.
- **Pitfall:** serif tipis, dress code belum field, wording ambigu siapa host. Gunakan message/quote sementara; backlog dedicated field.
- **Checklist:** numeral range 1–100; menu rule kit; long venue test; formal palette contrast; no-photo OG cover.
- **Referensi:** [Paperless Post](https://www.paperlesspost.com/) · [Greenvelope](https://www.greenvelope.com/) · [Typewolf Google Fonts](https://www.typewolf.com/google-fonts).

## B6 — **Kebun Makhluk Mini** `[CI]`
- **Mood/target:** toddler/anak 1–7; whimsical, gender-neutral, parent-led.
- **Visual DNA:** miniature garden world, friendly non-franchise creatures, cut-paper depth, rounded labels.
- **Palette roles:** oat base, forest text, tomato action, marigold highlight, pond blue/lilac supports.
- **Tipografi:** **Baloo 2** + **Noto Sans** (Google Fonts/OFL).
- **Composition signature:** perjalanan melalui garden zones; section sebagai clearing, bukan wedding scroll dengan bunga.
- **Struktur:** illustrated welcome → child profile/parents/message → party clearing → map → RSVP → gallery optional → wishes.
- **Hero:** nama/usia dan 3–5 karakter custom; foto anak opsional dalam flower frame.
- **Motif:** snails, beetles, mushrooms, leaves custom; hindari stereotip gender dan karakter IP.
- **Motion:** creature peek saat scroll, maksimal satu per section; no autoplay sound.
- **Mobile:** decorative layers dipangkas; tap targets besar; section pendek untuk orang tua yang membaca cepat.
- **Pitfall:** decorative overload, child privacy, teks mirip tulisan anak sulit dibaca. Body Noto Sans; consent/fallback illustration.
- **Checklist:** character bible; 10 poses; layered SVG/WebP; responsive crop; parental consent; alt policy; asset budget.
- **Referensi:** [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Greetings Island wedding/template ecosystem](https://www.greetingsisland.com/invitations/wedding) · [Paperless Post](https://www.paperlesspost.com/).

## B7 — **Poster Tur Berumur** `[PF]`
- **Mood/target:** music lovers teens–40s, house party/live band; bold dan sosial.
- **Visual DNA:** gig poster, halftone photo, lineup typography, ticket stub modules; artwork original.
- **Palette roles:** ink black, paper white, acid yellow action, hot red accent, violet secondary.
- **Tipografi:** **Archivo Black** + **Archivo** (Google Fonts/OFL).
- **Composition signature:** date/venue sebagai billing utama, celebrant seperti headliner; guest actions seperti ticket booth.
- **Struktur:** tour-poster hero → message → date/venue “show info” → map/stream → RSVP guest list → gallery backstage → music control → wishes.
- **Hero:** high-contrast portrait cutout/duotone + name; photo wajib kualitas cukup.
- **Motif:** halftone, torn-edge mask original, ticket numbers; jangan pakai logo venue/band tanpa izin.
- **Motion:** marquee pendek yang bisa pause; poster layers settle; no continuous aggressive jitter.
- **Mobile:** billing hierarchy disusun ulang; marquee punya pause; portrait crop aman; CTA “RSVP” eksplisit, bukan hanya “tickets”.
- **Pitfall:** flashing/jitter, distressed text, istilah ticket membingungkan bila gratis. Body bersih dan label semantik.
- **Checklist:** portrait cutout; duotone presets; halftone export; venue/logo permissions; motion pause; long-lineup test.
- **Referensi:** [Awwwards](https://www.awwwards.com/) · [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Paperless Post](https://www.paperlesspost.com/).

## B8 — **Piknik Riso** `[NF]`
- **Mood/target:** casual outdoor, Gen Z/young families, handmade tetapi modern.
- **Visual DNA:** risograph misregistration, picnic map doodles, paper-cut blocks, two/three-ink aesthetic.
- **Palette roles:** recycled cream, navy text, tomato action, grass green, fluorescent peach accent.
- **Tipografi:** **Bricolage Grotesque** + **Source Sans 3** (Google Fonts/OFL).
- **Composition signature:** asymmetric printed panels; event/map menjadi fold-out-style panel tetapi DOM tetap linear.
- **Struktur:** riso poster hero → birthday message → picnic details → illustrated location cues + Maps CTA → RSVP → gallery optional → wishes.
- **Hero:** type + simple picnic objects, tanpa foto; usia sebagai stamped circle.
- **Motif:** blanket grid, fruit, cup, kite doodles custom; tidak memakai clipart marketplace tanpa lisensi.
- **Motion:** registration layers align once; doodle wiggle on button hover/focus only.
- **Mobile:** faux-fold tidak menyembunyikan konten; map cue hanya dekoratif, Maps link tetap teks; texture ringan.
- **Pitfall:** misregistration mengurangi keterbacaan, map doodle dianggap peta akurat, fluorescent contrast. Efek hanya dekorasi; teks memakai solid ink.
- **Checklist:** 10 doodle SVG; 3 ink separations; seamless texture; no-photo fallback; print-like QA; map disclaimer; compression.
- **Referensi:** [Canva party invitations](https://www.canva.com/create/cards/party-invitations/) · [Evite](https://www.evite.com/) · [Typewolf Google Fonts](https://www.typewolf.com/google-fonts).

### Matriks pembeda Birthday

| ID | Aset | Audience | Metafora | Grid | Hero | Energi | Risiko produksi |
|---|---|---|---|---|---|---|---|
| B1 | CI | kids/adult fan | space mission | orbital spine | illustrated planet | curious | high |
| B2 | NF | all ages | modular party kit | bento | giant age | cheerful | low |
| B3 | PF | milestones | life archive | timeline | current/archive photo | nostalgic | medium |
| B4 | CI | gamers | level/quest | game panels | sprite/avatar | kinetic | high |
| B5 | NF | adult dinner | menu/reservation | strict menu | numeral/type | refined | low |
| B6 | CI | toddler/kids | miniature garden | scenic zones | characters | whimsical | high |
| B7 | PF | teens/adults | concert tour | poster billing | portrait | loud | medium-high |
| B8 | NF | casual outdoor | riso picnic print | asymmetric print | type/doodles | handmade | medium |

## 5. Kelompok produksi lintas tipe

| Kelompok | Direction | Catatan |
|---|---|---|
| **Tanpa foto feasible (NF)** | W2, W4, W6, W8, B2, B5, B8 | Paling aman untuk onboarding dan data kosong; buat OG image generatif dari nama/tanggal/usia. |
| **Memakai foto / photo-forward (PF)** | W1, W5, B3, B7 | Perlu focal point, crop per rasio, izin foto, alt text, kompresi, dan fallback saat kosong. |
| **Butuh ilustrasi custom (CI)** | W3, W7, B1, B4, B6 | Diferensiasi tinggi tetapi butuh art direction, kontrak lisensi, responsive asset kit, dan budget lebih besar. |

## 6. Rekomendasi 3 direction terbaik untuk MVP Vienne

### 1) **B2 Klub Konfeti Modular** — prioritas birthday
Alasan: benar-benar birthday-native; NF; mudah membuat banyak palette tanpa mengubah archetype; memetakan langsung ke `birthdayPerson`, events, RSVP, gallery, music, guestbook; kuat dalam keadaan data minimal. Produksi rendah dan cocok mobile-first. **MVP scope:** 6 palette, giant-age hero, bento event, RSVP, wishes; confetti one-shot/reduced-motion.

### 2) **W2 Janji Beraksara** — prioritas wedding no-photo
Alasan: mengurangi ketergantungan pada kualitas foto customer, terlihat premium lewat typography, dan semua wedding module panjang (story, dua event, gift) dapat ditampung. Tidak bergantung pada pink Vienne. **MVP scope:** title hero, event TOC, chapter story, reply-card RSVP, gift/guestbook; type scale/glyph QA ketat.

### 3) **W1 Arsip Senja** — prioritas wedding photo
Alasan: memberi opsi emosional/photo-forward yang kontras dengan W2; memanfaatkan gallery upload order dan story; pola editorial terbukti umum pada wedding digital menurut snippet sumber, tetapi sintesis layout harus original. **MVP scope:** satu hero, contact sheet, chapter story, event cards, RSVP; jangan membangun parallax/cinematic intro dahulu.

**Mengapa bukan tiga wedding:** MVP perlu membuktikan bahwa birthday bukan skin wedding. B2 harus hadir pada gelombang pertama. Kombinasi W2/W1 menguji dua jalur aset utama (no-photo vs photo) sebelum investasi CI.

## 7. Guardrails sistem desain dan aksesibilitas

- Target WCAG AA: rasio minimal **4.5:1 untuk teks normal**, 3:1 untuk teks besar/komponen grafis penting; selalu uji kombinasi token aktual.
- Struktur DOM mengikuti urutan baca, meski layout desktop asimetris. Satu `h1`; heading berjenjang; skip link; landmark `main/nav/footer`.
- Semua CTA memakai kata kerja dan label (“Konfirmasi kehadiran”, “Buka Google Maps”), bukan ikon saja.
- Target sentuh minimal 44×44 CSS px; focus visible; form labels persisten; error tidak hanya warna; deadline RSVP tampil sebagai teks.
- Semua motion punya `prefers-reduced-motion`; hindari flash, scroll-jacking, intro gate, dan autoplay audio. Musik harus opt-in meski field `autoplay` ada.
- Gambar dekoratif `alt=""`; foto bermakna perlu alt yang dapat diedit (gap schema). Jangan mengarang deskripsi orang.
- Gunakan `svh/dvh` dengan fallback, safe-area padding, ukuran body ≥16px, dan hindari text overlay foto tanpa scrim.
- Lazy-load media di bawah fold; preload hanya hero; responsive `srcset`; target budget awal ~1–1.5 MB first load pada jaringan seluler.
- RSVP harus tetap bisa dipakai keyboard/screen reader; jangan menyembunyikan detail penting di hover, carousel, drag, atau animasi.

## 8. Gap produk/schema sebelum produksi skala penuh

1. **Alt text dan focal point gambar belum ada** untuk cover/profile/gallery; PF belum dapat aman sepenuhnya tanpa ini.
2. **Birthday menyembunyikan story/gift/Instagram Story**; direction sudah mematuhinya, tetapi birthday milestone timeline B3 hanya bisa memanfaatkan urutan gallery, belum caption/tahun per foto.
3. **Gallery tidak punya caption, crop, focal point, tanggal, atau reorder manual** selain upload order.
4. **Event minim:** belum ada `endAt`, alamat lengkap, timezone, dress code, note, virtual/hybrid flag, atau calendar download. `startAt` diminta sebagai ISO manual—raw input rawan error.
5. **RSVP minim:** belum terlihat field diet, aksesibilitas, nama per anggota, pilihan sesi/menu, custom question, dan attendance status pada editor.
6. **Theme tokens terbatas** pada templateId/paletteId + satu cover image/headline; belum ada variant density, font selection, texture/illustration pack, image focal point.
7. **Age vs birthDate** bisa tidak konsisten; perlu derivation/validation dan opsi menyembunyikan usia.
8. **Music autoplay** tidak reliabel dan berisiko aksesibilitas; renderer perlu explicit play state dan kebijakan browser-safe.
9. **Localization:** locale ada, tetapi belum tampak field copy per bahasa/timezone; typeface perlu glyph test untuk Arabic/Javanese bila kelak didukung.
10. **Privacy/right management** belum tampak: consent foto anak, photographer credit/license, moderation/retention.
11. **No-photo OG generator** belum terkonfirmasi; NF membutuhkan share preview berbasis nama/tanggal/usia.
12. **Template capability metadata** perlu menyatakan `assetMode`, supported modules, ideal photo count/aspect ratios, illustration pack, motion level, and fallback quality agar katalog tidak menjanjikan layout yang field-nya tak ada.

## 9. Sumber dan batasan

### URL referensi unik (15)
1. https://www.paperlesspost.com/
2. https://www.greenvelope.com/
3. https://www.evite.com/
4. https://www.canva.com/create/email-invitations/
5. https://www.canva.com/create/cards/party-invitations/
6. https://www.greetingsisland.com/invitations/wedding
7. https://www.thedigitalyes.com/blog/ejemplos-invitaciones-boda-digitales
8. https://www.awwwards.com/
9. https://maggieanddanny.net/
10. https://www.typewolf.com/google-fonts
11. https://fonts.google.com/specimen/Cormorant
12. https://gwfh.mranftl.com/fonts/space-grotesk?subsets=latin
13. https://www.invitedrop.com/blog/digital-invitation-design-tips
14. https://www.utterlyprintable.com/help-and-support/uncategorised/rsvp-options-engagement-party-invitations-email-qr-code-or-website/
15. https://www.surveymonkey.com/learn/forms/rsvp-forms/

### Catatan evidensi
- Lima pencarian web dilakukan: wedding platform/template; birthday platform/template; wedding editorial/Awwwards; free font references; accessibility/RSVP.
- Snippet pencarian mendukung keberadaan kategori/template editor, contoh gaya editorial/cinematic, ketersediaan beberapa Google Fonts, prinsip contrast 4.5:1, dan kebutuhan RSVP terkait attendance/accessibility/diet. Snippet bukan pengganti audit UI lengkap.
- `web_extract` dicoba pada Paperless Post, Greenvelope, The Digital Yes, Greetings Island, dan Canva, tetapi gagal dengan pesan bahwa backend yang aktif **search-only (DuckDuckGo/ddgs)**. Karena itu dokumen tidak mengklaim inspeksi detail halaman tersebut.
- Lisensi font/aset harus diverifikasi lagi dari repository/upstream saat bundling; label free/OFL di atas adalah rekomendasi kerja, bukan legal opinion.

## 10. Definition of done tahap berikutnya

Sebelum direction menjadi template produksi: buat wireframe 390px untuk semua; prototype MVP W2/W1/B2 dengan data kosong, pendek, dan ekstrem; audit contrast/keyboard/reduced motion; uji 360/390/430px serta desktop; lakukan 5-user comprehension test (tanggal, lokasi, RSVP ditemukan <10 detik); baru finalisasi art kit dan tokens. Jangan mengambil aset atau copy dari URL referensi.
