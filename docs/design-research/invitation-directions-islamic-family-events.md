<!-- SUMMARY (first 7 lines — greppable) -->
# invitation-directions-islamic-family-events.md — Art direction acara keluarga Islam
> WHAT: 18 arah visual mobile-first untuk aqiqah, tasyakuran, dan khitanan
> STATUS: RESEARCH / CATALOG INPUT
> OWNER: Oracle
> DEPS: detail-config.ts, editor.tsx, design-agent.md, template-catalog.md
> GREP: aqiqah, tasyakuran, khitanan, archetype, visual, MVP, font
> UPDATED: 2026-07-18

## Ringkasan keputusan
Dokumen ini adalah **peta inspirasi, bukan kumpulan template untuk disalin**. Setiap arah menggabungkan prinsip tipografi, warna, tekstil/alam/ilustrasi, dan pola layout menjadi komposisi orisinal. Islam hadir melalui adab, doa, rasa syukur, dan ketenangan—bukan kewajiban memakai hijau-emas, kubah, bulan sabit, atau lentera.

**Legenda media:** `[TF]` tanpa foto · `[FP]` dengan foto · `[IC]` ilustrasi custom. Semua arah tetap harus berfungsi bila galeri, RSVP, hadiah, musik, streaming, atau buku tamu dimatikan.

### Aturan bersama
- Mobile-first 360–430 px; hero memberi nama/tujuan acara, tanggal, dan CTA “Buka undangan”/“Lihat lokasi” tanpa mengandalkan hover. Isi utama satu kolom; target sentuh ≥44×44 px.
- Body minimum 16 px, line-height 1,5; teks normal menargetkan kontras WCAG AA 4,5:1, teks besar 3:1. Ornamen tidak boleh menurunkan keterbacaan. Jangan menaruh detail acara sebagai teks di dalam gambar.
- Motion 150–500 ms, transform/opacity saja; tanpa parallax agresif, autoplay audio, confetti tak berakhir, atau kilatan. Hormati `prefers-reduced-motion`; kontrol musik selalu terlihat.
- Kutipan Arab hanya bila teks dan sumber diverifikasi keluarga/ahli; set `lang="ar" dir="rtl"`, jangan line-break manual, jangan jadikan kaligrafi dekoratif tanpa makna. Terjemahan Indonesia berdampingan. **Amiri/Amiri Quran** (OFL, Arabic) hanya untuk teks Arab; font Latin tetap terpisah.
- Foto anak bersifat opsional: persetujuan orang tua, jangan meminta pose rentan/medis, sediakan crop aman, alt deskriptif singkat, dan fallback ilustrasi/monogram. Hindari stereotip warna gender sebagai satu-satunya pembeda.
- Motif daerah dipakai sebagai inspirasi beratribusi, bukan klaim “motif autentik” tanpa riset/perizinan. Jangan mencampur simbol adat lintas daerah secara acak.

## Audit kompatibilitas produk (repo, 2026-07-18)
Path yang diminta, `app/editor.tsx`, **tidak ada**. Implementasi aktual ada di `app/(customer)/dashboard/invitations/[id]/edit/editor.tsx`; kontrak validasi ada di `lib/invitation/detail-config.ts`.

| Area | Dukungan aktual | Implikasi desain |
|---|---|---|
| Enum tipe | `aqiqah`, `tasyakuran`, `khitanan` sudah dikenali | Direction dapat ditag `occasion` sesuai katalog. |
| Profil bersama | `ceremonyProfile` superset | Renderer harus memilih subset berdasarkan `eventType`, jangan membocorkan field tipe lain. |
| Aqiqah | `honoureeName`, `nameMeaning`, `gender`, `childOrder`, ayah/ibu, lahir (tanggal/tempat/berat/panjang), `photoUrl`, `prayer` | Semua 6 struktur di bawah dapat dirender; `birthTime` ada di schema tetapi belum ada kontrol editor. |
| Tasyakuran | kategori rumah baru/promosi/wisuda/usaha baru/haji-umrah/lainnya, judul, tuan rumah, achievement, foto, `ceremonyNote` | Hero/label perlu bercabang per kategori; jangan selalu memvisualkan bayi. |
| Khitanan | nama/panggilan/usia/sekolah, ayah/ibu, tanggal khitan, foto, doa, catatan pemulihan | Hindari visual medis; `circumcisionDate` berbeda dari jadwal resepsi di `events[]`. |
| Acara | `events[]`: title, start/end ISO, venue, address, map URL, note; editor baru mengekspos title/start/venue/maps | Signature layout dapat memakai multi-event, tetapi alamat/end/note perlu editor tambahan agar terisi. |
| Modul publik | quote, music, greetings, gift, RSVP, gallery, guestbook, streaming, WhatsApp | Aqiqah/khitanan menyembunyikan story & Instagram Story; tasyakuran juga menyembunyikan gift. Theme hanya editable dengan add-on. |
| Gap terminologi | Editor kartu acara masih berdeskripsi “Tambah akad, resepsi…” untuk semua tipe | Ganti helper copy per tipe sebelum produksi tema. |
| Gap spesifikasi lama | `design-agent.md` menggabungkan AQIQAH/TASYAKURAN dan enum intake eksplisit belum memuat TASYAKURAN/KHITANAN | Sinkronkan intake enum dengan schema/editor aktual. |
| Gap renderer | Riset tidak menemukan kontrak renderer visual/section order yang kanonik | Buat registry template yang memetakan field yang sudah ada; jangan menambah field desain ke config konten. |

---

# AQIQAH — 6 arah
Struktur terminologi dasar: pembuka/basmalah → profil bayi → arti nama & doa → detail **acara aqiqah** → lokasi → RSVP/ucapan → galeri opsional → penutup keluarga. Hadiah opsional dan tidak dipromosikan sebagai “amplop”.

## A1. Embun Nama `[TF][IC]` — **MVP**
- **Mood/audience:** teduh, intim, keluarga muda yang menjaga privasi foto. **DNA:** editorial putih-lapang, tetes embun, daun muda line-art, kartu data kelahiran.
- **Palette roles:** kertas `#FAF8F2`; tinta `#25332D`; sage sekunder `#9AAA91`; aprikot CTA `#C96F4A`; biru kabut dekor `#DDE8E8`.
- **Font:** Lora 600 + Nunito Sans 400/700 (Google Fonts, SIL OFL; Latin Indonesia). Amiri opsional untuk Arab (OFL; Arabic).
- **Signature/layout:** garis “batang” vertikal menghubungkan nama, arti, doa, lalu waktu. **Hero:** nama besar + arti nama pada label botani; tanpa foto.
- **Section:** pembuka → nama/arti → fakta lahir ringkas → orang tua → doa → jadwal/lokasi → RSVP & ucapan → penutup.
- **Motif/media:** 4–6 ilustrasi daun/tetes custom SVG, tanpa simbol gender. **Motion:** embun fade 300 ms, progress-line tumbuh; reduced-motion statis.
- **Mobile:** fakta lahir 2×2, arti nama tidak dipotong; CTA Maps sticky hanya setelah hero. **A11y/pitfall:** garis bukan satu-satunya penanda urutan; jangan mengklaim tanaman tertentu sunnah.
- **Asset:** hero SVG, 2 divider, 6 icon fakta, texture paper AVIF, fallback monogram, OG 1200×630.
- **Referensi prinsip:** [Lora](https://fonts.google.com/specimen/Lora) · [Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## A2. Album Pagi `[FP]` — **MVP**
- **Mood/audience:** hangat, dokumenter, orang tua yang ingin satu foto utama. **DNA:** album keluarga modern, frame Polaroid subtil, cap tanggal, tekstur linen.
- **Palette:** oat `#F3EBDD` latar; espresso `#3A2E29` teks; terracotta `#B85C44` CTA; sky `#B9D5DF` info; putih frame.
- **Font:** Fraunces + Atkinson Hyperlegible (OFL; Latin; font kedua mengutamakan keterbacaan). Amiri untuk Arab.
- **Layout/hero:** foto rasio 4:5 dengan safe crop, nama menumpang pada kartu bawah (bukan di foto). Section: pembuka → foto/nama → arti & lahir → doa orang tua → event/map → galeri → RSVP/ucapan → penutup.
- **Art/motion:** cap tanggal dan pita kertas ilustratif; foto asli satu hero + galeri. Frame masuk bergantian 200 ms, tanpa rotasi ekstrem.
- **Mobile:** foto tidak full-bleed agar wajah aman; `object-position` dapat diatur. **A11y/pitfall:** alt bukan “image”; jangan tampilkan berat/panjang bila keluarga tak nyaman; jangan paksa galeri.
- **Asset:** hero WebP/AVIF 2 ukuran, crop focal point, linen tile, tape SVG, photo placeholders, OG.
- **Referensi:** [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible) · [Amiri](https://fonts.google.com/specimen/Amiri) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

## A3. Langit Seusai Hujan `[TF][IC]`
- **Mood/audience:** puitis, netral gender, ceria lembut. **DNA:** awan berlapis ala cut-paper, pelangi sangat abstrak, bintang titik—tanpa masjid generik.
- **Palette:** cloud `#F7F5EF`; dusk `#39445A`; cornflower `#718DB7`; coral `#D98573`; mustard `#C49A4A` aksen terbatas.
- **Font:** DM Serif Display + DM Sans (OFL; Latin); Noto Naskh Arabic (OFL; Arabic) bila diperlukan.
- **Layout/hero:** nama berada di “celah awan”; kartu event seperti horizon. Struktur: salam → hero → makna nama → doa → fakta lahir → orang tua → event/map → RSVP → ucapan.
- **Art/motion:** ilustrasi cut-paper custom, awan bergeser 6 px saat load; no infinite drift. **Mobile:** maksimal 3 layer awan agar ringan; nama panjang auto-scale sampai minimum 36 px.
- **A11y/pitfall:** jangan gunakan biru/merah muda untuk menandai gender; bintang tak boleh menyerupai teks. **Asset:** 5 layer SVG, 4 ikon, poster reduced-motion, OG.
- **Referensi:** [Noto Naskh Arabic](https://fonts.google.com/specimen/Noto+Naskh+Arabic) · [WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) · [Amiri Quran](https://fonts.google.com/specimen/Amiri+Quran)

## A4. Cap Kecil Nusantara `[TF][IC]`
- **Mood/audience:** craft, lokal, keluarga lintas generasi. **DNA:** blok cap geometris terinspirasi ritme tekstil Indonesia—bukan reproduksi batik sakral; tepi tinta imperfect.
- **Palette:** kapas `#F5EBD8`; indigo `#243B53`; bata `#A64B3C`; kunyit `#C79A35`; hitam lunak `#252525`.
- **Font:** Noto Serif + Noto Sans (OFL; Latin luas); Noto Sans Arabic bila Arab.
- **Layout/hero:** nama di tengah kisi cap asimetris; data lahir berupa label katalog. Section: salam → nama/arti → keluarga → doa → event → peta → RSVP/ucapan → footer kredit motif.
- **Art/motion:** 8 cap custom yang dapat diacak deterministik; “stamp-in” sekali. **Mobile:** motif hanya margin 24 px, konten tidak terkurung border rumit.
- **A11y/pitfall:** beri label dekoratif `aria-hidden`; jangan menyebut “batik X autentik” tanpa asal/izin; hindari motif duka/keraton khusus. **Asset:** cap SVG, noise mask, pattern tile, icon set, provenance note.
- **Referensi:** [Google Arts & Culture—Batik](https://artsandculture.google.com/entity/indonesian-batik/m0h4j8) · [UNESCO Indonesian Batik](https://ich.unesco.org/en/RL/indonesian-batik-00170) · [Noto Serif](https://fonts.google.com/specimen/Noto+Serif)

## A5. Surat untuk Ananda `[TF]`
- **Mood/audience:** emosional namun sopan, copy-led. **DNA:** surat editorial, margin notes, garis lipatan, tanda tangan orang tua (teks, bukan scan wajib).
- **Palette:** ivory `#FFFDF7`; ink `#252A34`; plum `#68445F`; blush `#E8C9C3`; brass matte `#9A7A42`.
- **Font:** Cormorant Garamond + Source Sans 3 (OFL; Latin); Amiri hanya untuk kutipan Arab.
- **Layout/hero:** sapaan “Untuk [nama]” dan kutipan doa pendek; fakta acara menjadi postscript card. Struktur: basmalah → surat/doa → nama & arti → data lahir → orang tua → undangan acara → maps/RSVP → ucapan.
- **Art/motion:** tanpa foto; garis pena custom, fold shadow CSS; teks muncul per blok, tidak typewriter. **Mobile:** surat satu kolom, margin 20 px, kutipan Arab tidak justified.
- **A11y/pitfall:** jangan membuat doa karangan seolah ayat/hadis; sumber eksplisit atau label “doa keluarga”. **Asset:** paper texture, pen flourish SVG, divider, Arabic QA copy, OG.
- **Referensi:** [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) · [Amiri](https://fonts.google.com/specimen/Amiri) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## A6. Orbit Tujuh Hari `[IC]`
- **Mood/audience:** modern-geometrik, keluarga urban. **DNA:** tujuh titik/orbit sebagai ritme visual (bukan klaim jadwal wajib), lingkaran data, tipografi grotesk.
- **Palette:** midnight `#172A3A`; pearl `#F5F1E8`; aqua `#4FA9A1`; persimmon `#E07A5F`; lemon `#E5C95A` fokus.
- **Font:** Space Grotesk + Noto Sans (OFL; Latin); Noto Sans Arabic untuk bilingual.
- **Layout/hero:** nama di pusat orbit; event dan maps muncul sebagai panel bawah. Struktur: hero → makna nama → lahir/orang tua → doa → jadwal → RSVP → ucapan/gallery opsional.
- **Art/motion:** orbital SVG custom; titik menyusun sekali ≤450 ms, tidak berputar terus. **Mobile:** orbit dipotong aman di sisi, konten tetap DOM text.
- **A11y/pitfall:** “tujuh” hanya metafora desain; jangan menyatakan aqiqah selalu tepat hari ketujuh; fokus keyboard jelas di latar gelap. **Asset:** orbit SVG, icon circles, dark/light OG, poster.
- **Referensi:** [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) · [Noto Sans Arabic](https://fonts.google.com/specimen/Noto+Sans+Arabic) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

---

# TASYAKURAN — 6 arah
“Tasyakuran” adalah payung; struktur wajib bercabang menurut `thanksgivingCategory`: rumah baru, promosi, kelulusan, usaha baru, haji/umrah, atau lain. Dasar: pembuka → alasan syukur/pencapaian → tuan rumah → rangkaian syukuran → lokasi → RSVP/ucapan → penutup. Jangan otomatis memakai profil bayi atau amplop digital.

## T1. Ruang yang Bertumbuh `[FP]` — **MVP**
- **Mood/audience:** homewarming hangat, arsitektural. **DNA:** denah abstrak, jendela cahaya, foto rumah/keluarga opsional.
- **Palette:** plaster `#EEE9DF`; charcoal `#303536`; olive `#69745C`; clay `#B76E52`; daylight `#F5C86A`.
- **Font:** Manrope + Lora (OFL; Latin); Amiri opsional Arabic.
- **Layout/hero:** frame “jendela” menampung foto atau blok warna; alamat baru dan tanggal menjadi threshold card. Section: salam → judul rumah baru → tuan rumah → pesan syukur → event → alamat/maps → RSVP/ucapan → galeri ruang → penutup.
- **Art/motion:** garis denah custom, light sweep sekali. **Mobile:** alamat dapat disalin; maps CTA tidak menutupi isi. **A11y/pitfall:** jangan publikasikan alamat tanpa persetujuan; jangan menyiratkan kemewahan/status.
- **Asset:** foto/fallback window SVG, floor-line pattern, 5 icon fasilitas netral, map card, OG.
- **Referensi:** [Manrope](https://fonts.google.com/specimen/Manrope) · [Lora](https://fonts.google.com/specimen/Lora) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## T2. Pita Pencapaian `[TF][IC]` — **MVP**
- **Mood/audience:** wisuda/promosi, optimistis dan rapi. **DNA:** pita kertas modular, baseline editorial, seal abstrak—tanpa toga bila bukan wisuda.
- **Palette:** paper `#FAF7F0`; navy `#24324A`; raspberry `#A8485D`; amber `#D6A23C`; mint `#B8D8C0`.
- **Font:** Fraunces + IBM Plex Sans (OFL; Latin luas); Noto Naskh Arabic opsional.
- **Layout/hero:** pita diagonal membawa achievement; kategori mengubah ikon dan copy. Section: pembuka → pencapaian → tuan rumah → pesan syukur → rangkaian → lokasi → RSVP/ucapan → penutup.
- **Art/motion:** ribbon SVG custom unfold 350 ms. **Mobile:** diagonal tak memotong nama panjang; fallback horizontal. **A11y/pitfall:** jangan mengecilkan tamu yang belum punya pencapaian serupa; ikon kategori dilabeli teks.
- **Asset:** 6 category icons, ribbon variants, seal, paper texture, OG.
- **Referensi:** [Fraunces](https://fonts.google.com/specimen/Fraunces) · [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) · [WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## T3. Jejak Pulang `[TF][IC]` — **MVP**
- **Mood/audience:** tasyakuran haji/umrah, reflektif, dewasa. **DNA:** garis perjalanan, horizon gurun abstrak, cap rute; tidak memakai foto Ka'bah sebagai wallpaper.
- **Palette:** sand `#E9DDC8`; date `#49382F`; indigo night `#283652`; copper `#A86E46`; oasis `#547B73`.
- **Font:** Noto Serif + Noto Sans (OFL); Amiri Quran khusus kutipan Arab terverifikasi.
- **Layout/hero:** garis rute dari “perjalanan” ke “pulang & bersyukur”; jadwal syukuran sebagai destination card. Section: basmalah → kepulangan/tuan rumah → pesan syukur → event → maps → RSVP/ucapan → penutup.
- **Art/motion:** line route custom ditarik sekali; reduced-motion garis utuh. **Mobile:** hero ≤75svh, Arab minimal 24 px. **A11y/pitfall:** jangan memakai potongan ayat sebagai ornamen; hindari klaim gelar/ibadah; pastikan keluarga memang memilih kategori haji/umrah.
- **Asset:** route SVG, horizon layers, verified Arabic copy, icons, OG.
- **Referensi:** [Amiri Quran](https://fonts.google.com/specimen/Amiri+Quran) · [Noto Serif](https://fonts.google.com/specimen/Noto+Serif) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

## T4. Pasar Pertama `[FP][IC]`
- **Mood/audience:** pembukaan usaha baru/UMKM, bersahabat dan lokal. **DNA:** label kemasan, stempel harga tanpa angka, awning geometris, foto produk opsional.
- **Palette:** cream `#FFF3D6`; ink `#253238`; tomato `#D6533C`; teal `#2F7B77`; sunflower `#E5B83B`.
- **Font:** Archivo + Merriweather (OFL; Latin); Noto Sans Arabic opsional.
- **Layout/hero:** nama usaha seperti label; “tasyakuran pembukaan” jelas, bukan iklan diskon. Section: salam → usaha/pendiri → pesan syukur → jadwal pembukaan → lokasi/map → RSVP → galeri produk → ucapan.
- **Art/motion:** stempel, awning, ikon kategori custom; awning reveal sekali. **Mobile:** CTA primer ke lokasi/RSVP, bukan belanja. **A11y/pitfall:** pisahkan ajakan syukur dari promosi; jangan buat logo palsu bila brand sudah ada.
- **Asset:** logo customer/fallback wordmark, product photo crops, label kit, category icons, OG.
- **Referensi:** [Archivo](https://fonts.google.com/specimen/Archivo) · [Merriweather](https://fonts.google.com/specimen/Merriweather) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## T5. Syukur Sehari-hari `[TF]`
- **Mood/audience:** syukuran umum kecil, lintas usia, minimal. **DNA:** kalender meja, catatan tangan digital, rule lines, banyak whitespace.
- **Palette:** warm white `#FCFAF5`; graphite `#2D3033`; denim `#4E6680`; peach `#D88C72`; moss `#6C795E`.
- **Font:** Newsreader + Inter (OFL; Latin); Amiri opsional.
- **Layout/hero:** tanggal besar seperti lembar kalender, alasan syukur sebagai headline. Section: pembuka → judul/alasan → tuan rumah → pesan → jadwal → venue/maps → RSVP/ucapan → penutup.
- **Art/motion:** tanpa foto, garis kalender CSS; page flip 250 ms opsional. **Mobile:** tanggal semantik `<time>`, hari/tanggal tidak image-only. **A11y/pitfall:** kategori “other” harus menerima copy netral; jangan mengarang alasan syukur.
- **Asset:** calendar SVG, dividers, 6 category marks, locale date rules, OG.
- **Referensi:** [Newsreader](https://fonts.google.com/specimen/Newsreader) · [Inter](https://fonts.google.com/specimen/Inter) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

## T6. Anyaman Cahaya `[TF][IC]`
- **Mood/audience:** formal-kultural tanpa mewah berlebihan. **DNA:** kisi anyaman custom, bidang cahaya, komposisi simetris kontemporer.
- **Palette:** pandan `#D9D2B6`; deep aubergine `#3C2A3A`; rattan `#B68B55`; coral dark `#9C514B`; cream `#F7F1E4`.
- **Font:** Libre Baskerville + Work Sans (OFL; Latin); Noto Sans Arabic bila perlu.
- **Layout/hero:** aperture anyaman membingkai judul (bukan border penuh). Section: salam → judul/kategori → tuan rumah/pencapaian → pesan syukur → events → map → RSVP & ucapan → penutup.
- **Art/motion:** pattern anyaman orisinal, cahaya opacity shift 400 ms. **Mobile:** pattern disederhanakan menjadi 2 strip. **A11y/pitfall:** jangan menamai asal anyaman tertentu tanpa riset; teks tak boleh berada di pola kontras tinggi.
- **Asset:** pattern SVG 2 density, aperture mask, icon category set, texture, OG.
- **Referensi:** [Libre Baskerville](https://fonts.google.com/specimen/Libre+Baskerville) · [Work Sans](https://fonts.google.com/specimen/Work+Sans) · [UNESCO Indonesian Batik](https://ich.unesco.org/en/RL/indonesian-batik-00170)

---

# KHITANAN — 6 arah
Struktur dasar: pembuka → profil **anak yang dikhitan** → doa kesehatan/pemulihan → **acara khitanan** (bisa berbeda dari tanggal tindakan) → lokasi → RSVP/ucapan → galeri opsional → penutup. Fokus pada keberanian, dukungan keluarga, dan perayaan; **tidak menampilkan anatomi, alat medis, darah, atau lelucon mempermalukan anak**.

## K1. Lencana Berani `[FP][IC]` — **MVP**
- **Mood/audience:** anak usia sekolah, suportif bukan macho. **DNA:** badge koleksi, patch kain, bintang abstrak; foto opsional.
- **Palette:** cream `#FFF4DD`; navy `#203451`; orange `#E4773B`; aqua `#4FA9A5`; plum `#6A4868`.
- **Font:** Bricolage Grotesque + Nunito Sans (OFL; Latin); Noto Sans Arabic opsional.
- **Layout/hero:** portrait dalam badge tidak menghakimi; nama/panggilan + “Tasyakuran Khitan” jelas. Section: salam → anak/keluarga → doa → tanggal khitan opsional → event → lokasi → RSVP/ucapan → gallery → penutup.
- **Art/motion:** badge custom “doa”, “sehat”, “ceria”; pop-in sekali tanpa confetti tak berakhir. **Mobile:** badges horizontal-scroll dengan label; foto fallback inisial.
- **A11y/pitfall:** jangan pakai “jagoan sejati”/mengejek takut; jangan tampilkan sekolah bila privasi. **Asset:** 8 badge SVG, hero/fallback, patch texture, icons, OG.
- **Referensi:** [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) · [Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## K2. Komik Hari Baik `[IC]` — **MVP**
- **Mood/audience:** playful untuk keluarga muda, narasi ringan. **DNA:** panel komik editorial, speech bubble berisi doa keluarga, halftone lembut.
- **Palette:** paper `#FAF6E8`; black-blue `#24303D`; red-orange `#D95D45`; sky `#6DA7C5`; yellow `#E8C34F`.
- **Font:** Atkinson Hyperlegible + Lilita One (keduanya OFL; Latin; Lilita hanya display); Noto Sans Arabic bila ada Arab.
- **Layout/hero:** 3 panel: nama → doa → waktu/tempat; bukan cerita prosedur. Section: cover panel → profil → doa → event/map → RSVP → ucapan → galeri.
- **Art/motion:** karakter custom non-realistis dengan persetujuan keluarga; panel reveal saat scroll. **Mobile:** satu panel per layar, urutan DOM sama dengan visual.
- **A11y/pitfall:** speech bubble tetap teks HTML; jangan menggambar pisau/dokter/prosedur atau menjadikan anak bahan komedi. **Asset:** character sheet, 6 expressions sopan, bubbles SVG, halftone tile, OG.
- **Referensi:** [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible) · [Lilita One](https://fonts.google.com/specimen/Lilita+One) · [WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## K3. Ekspedisi Kebaikan `[TF][IC]` — **MVP**
- **Mood/audience:** petualangan tenang, anak yang menyukai eksplorasi. **DNA:** peta khayal, waypoint doa-keluarga-acara, kompas abstrak (bukan simbol agama palsu).
- **Palette:** parchment `#F1E2C2`; forest `#315A4A`; ocean `#356C85`; rust `#B85F42`; ink `#2B2E2C`.
- **Font:** Alegreya + Figtree (OFL; Latin); Amiri opsional.
- **Layout/hero:** peta orisinal dengan nama sebagai destinasi; waypoint memandu section. Section: pembuka → profil → doa/pemulihan → jadwal → venue/maps nyata → RSVP → ucapan.
- **Art/motion:** route draw sekali; tidak gamify tindakan medis. **Mobile:** mini-map dekoratif, Maps nyata CTA terpisah. **A11y/pitfall:** istilah “ekspedisi” metaforis; jangan memberi skor keberanian; route dekor `aria-hidden`.
- **Asset:** map SVG, 7 waypoint icons, compass, texture, reduced poster, OG.
- **Referensi:** [Alegreya](https://fonts.google.com/specimen/Alegreya) · [Figtree](https://fonts.google.com/specimen/Figtree) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

## K4. Arena Piksel Santun `[TF][IC]`
- **Mood/audience:** anak gamer, modern tanpa agresi. **DNA:** pixel grid, level card, avatar custom; tanpa senjata/monster menyeramkan.
- **Palette:** midnight `#1F2440`; off-white `#F3F2EA`; electric cyan `#46B7C4`; mango `#F3AE45`; magenta muted `#B35C86`.
- **Font:** Pixelify Sans (display) + IBM Plex Sans (body), OFL Latin; Noto Sans Arabic bila perlu.
- **Layout/hero:** “undangan terbuka” seperti start screen; nama dan tanggal sebagai DOM text. Section: hero → player profile (nama/usia) → power-up doa → quest acara → map → RSVP → messages.
- **Art/motion:** avatar pixel custom, 4-frame idle maksimal 2 detik lalu berhenti. **Mobile:** tombol bukan ukuran pixel kecil; body tetap antialias sans.
- **A11y/pitfall:** jangan sebut prosedur sebagai battle; no flashing; audio default off. **Asset:** sprite sheet, avatar variants, tile set, icons 2×, static poster, OG.
- **Referensi:** [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) · [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## K5. Kertas Layang `[FP][IC]`
- **Mood/audience:** cerah, nostalgia permainan luar ruang. **DNA:** bentuk layang-layang, tali sebagai divider, kolase langit; foto anak opsional.
- **Palette:** sky `#DCECF2`; cloud `#FFFDF4`; cobalt `#315D91`; coral `#D66B5D`; grass `#71915B`.
- **Font:** Baloo 2 (display terbatas) + Source Sans 3 (body), OFL Latin; Amiri opsional.
- **Layout/hero:** layang berisi foto/fallback pola; tali turun ke timeline acara. Section: salam → hero profil → orang tua/doa → event → map → RSVP/ucapan → gallery.
- **Art/motion:** kite sway 2° sekali, bukan loop; awan statis reduced. **Mobile:** tali tidak menentukan urutan sendirian; safe crop wajah. **A11y/pitfall:** hindari menganggap permainan tertentu milik semua daerah; jangan terlalu kekanak-kanakan untuk remaja—sediakan mode tanpa karakter.
- **Asset:** kite SVG variants, tail dividers, hero crop, cloud set, OG.
- **Referensi:** [Baloo 2](https://fonts.google.com/specimen/Baloo+2) · [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) · [WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## K6. Monogram Muda `[FP]`
- **Mood/audience:** remaja/keluarga formal yang menolak tema childish. **DNA:** monogram inisial, editorial sportswear bersih, garis nomor/usia tanpa aura kompetisi.
- **Palette:** bone `#F3F0E8`; black `#20242A`; cobalt `#2E5D9F`; burgundy `#7D3945`; silver `#AEB4BA`.
- **Font:** Urbanist + Libre Baskerville (OFL; Latin); Noto Naskh Arabic opsional.
- **Layout/hero:** split monogram–portrait; nama lengkap dan “Tasyakuran Khitan” dominan. Section: pembuka → profil → doa keluarga → event → venue/maps → RSVP → ucapan/gallery → penutup.
- **Art/motion:** foto hitam-putih opsional dengan persetujuan, rule lines; monogram mask reveal 250 ms. **Mobile:** split menjadi stack, monogram tidak mengganti nama tekstual.
- **A11y/pitfall:** jangan menonjolkan usia/sekolah jika anak menolak; hindari bahasa maskulinitas toksik; foto bukan kewajiban. **Asset:** monogram generator, portrait crop/fallback, line kit, OG.
- **Referensi:** [Urbanist](https://fonts.google.com/specimen/Urbanist) · [Libre Baskerville](https://fonts.google.com/specimen/Libre+Baskerville) · [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)

---

# Matriks pembeda
| ID | Occasion | Nada utama | Mesin visual | Media | Warna dominan non-generik | Kompleksitas aset | Kekuatan katalog |
|---|---|---|---|---|---|---|---|
| A1 | Aqiqah | teduh | botani editorial | TF+IC | sage/aprikot | rendah | privasi + cepat |
| A2 | Aqiqah | dokumenter | album/linen | FP | oat/terracotta | sedang | foto premium |
| A3 | Aqiqah | puitis | cut-paper langit | TF+IC | dusk/coral | tinggi | netral gender |
| A4 | Aqiqah | craft lokal | cap geometris | TF+IC | indigo/bata | sedang | Nusantara abstrak |
| A5 | Aqiqah | intim | surat editorial | TF | ivory/plum | rendah | copy-led |
| A6 | Aqiqah | urban | orbit data | IC | midnight/aqua | sedang | modern gelap |
| T1 | Tasyakuran | hangat | ruang/denah | FP | plaster/clay | sedang | housewarming |
| T2 | Tasyakuran | optimistis | pita modular | TF+IC | navy/raspberry | sedang | wisuda/promosi |
| T3 | Tasyakuran | reflektif | rute/horizon | TF+IC | sand/indigo | sedang | haji/umrah |
| T4 | Tasyakuran | ramah | label pasar | FP+IC | cream/tomato | tinggi | usaha baru |
| T5 | Tasyakuran | minimal | kalender | TF | white/denim | rendah | kategori umum |
| T6 | Tasyakuran | formal-kultural | anyaman abstrak | TF+IC | pandan/aubergine | sedang | acara keluarga besar |
| K1 | Khitanan | suportif | badge/patch | FP+IC | navy/orange | sedang | anak sekolah |
| K2 | Khitanan | playful | panel komik | IC | paper/red/sky | tinggi | karakter kuat |
| K3 | Khitanan | petualangan | peta/waypoint | TF+IC | forest/ocean | sedang | tanpa foto |
| K4 | Khitanan | digital | pixel UI | TF+IC | midnight/cyan | tinggi | gamer niche |
| K5 | Khitanan | nostalgia | layang/sky | FP+IC | sky/cobalt | sedang | outdoor cerah |
| K6 | Khitanan | dewasa muda | monogram editorial | FP | bone/cobalt | rendah | remaja/formal |

## Shortlist 3 MVP per tipe
| Tipe | Shortlist | Alasan MVP | Risiko yang dikendalikan |
|---|---|---|---|
| Aqiqah | **A1 Embun Nama** | SVG ringan, tanpa ketergantungan foto, cocok field arti nama/doa | QA Arab dan kontras sage |
|  | **A2 Album Pagi** | Memanfaatkan `photoUrl`/gallery, daya tarik emosional tinggi | consent & focal crop |
|  | **A4 Cap Kecil Nusantara** | diferensiasi lokal tanpa masjid generik | provenance motif |
| Tasyakuran | **T1 Ruang yang Bertumbuh** | kategori housewarming punya struktur sangat jelas | privasi alamat |
|  | **T2 Pita Pencapaian** | satu sistem modular untuk promosi + wisuda | ikon/copy harus bercabang |
|  | **T3 Jejak Pulang** | melayani kategori haji/umrah dengan adab visual | verifikasi kutipan Arab |
| Khitanan | **K1 Lencana Berani** | ramah anak, foto opsional, aset modular | hindari macho/shaming |
|  | **K2 Komik Hari Baik** | tampilan katalog paling berbeda | ilustrasi lebih mahal |
|  | **K3 Ekspedisi Kebaikan** | tanpa foto, narasi waypoint cocok mobile | jangan gamify tindakan |

## Rekomendasi implementasi kompatibel
1. Registry template cukup menyimpan `occasion`, `style`, `color_palette`, `color_hex`, thumbnail/preview, dan token visual; konten tetap dari `ceremonyProfile`, `events`, dan modul opsional.
2. Buat `sectionOrder` di definisi template/renderer, **bukan** field bebas yang diedit customer. Tiap section melakukan graceful omission bila data kosong.
3. Tambahkan preset hero `photo | illustration | typographic`; semuanya membaca `ceremonyProfile.photoUrl` secara opsional dan `theme.cover.imageUrl` hanya bila ada.
4. Tambahkan kontrol editor untuk `birthTime`, alamat/end/note acara; ubah helper “akad, resepsi” menjadi label per eventType. Pertimbangkan focal-point/crop metadata sebelum tema foto masuk MVP.
5. Sinkronkan enum intake `design-agent.md`: tasyakuran dan khitanan harus punya field eksplisit sendiri; jangan menganggap schema lama AQIQAH/TASYAKURAN sama.
6. Font self-host dari berkas resmi/OFL, subset yang benar; jangan mengandalkan nama font saja. Simpan lisensi/attribution bersama aset build.

# Sumber dan batas bukti
## Sumber primer/berguna yang benar-benar ditemukan
- W3C, **WCAG 2.2**: https://www.w3.org/TR/WCAG22/
- W3C, **How to Meet WCAG 2.2**: https://www.w3.org/WAI/WCAG22/quickref/
- W3C, **Animation from Interactions**: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Google Fonts specimen (contoh hasil pencarian): Amiri, Amiri Quran, Lora, Nunito/Nunito Sans; URL specimen font lain dicantumkan per direction. Halaman specimen menyediakan jalur ke metadata/lisensi; lisensi final tetap harus disalin dari paket font saat implementasi.
- UNESCO, **Indonesian Batik**: https://ich.unesco.org/en/RL/indonesian-batik-00170
- Google Arts & Culture, entitas **Indonesian Batik**: https://artsandculture.google.com/entity/indonesian-batik/m0h4j8

## Batas bukti / gap riset
- Maksimum **5 `web_search`** dipatuhi. Search aqiqah menghasilkan banyak agregator/Pinterest/TikTok dan contoh “golden mosque”; itu dipakai hanya sebagai sinyal kejenuhan trope, **bukan** sumber desain untuk ditiru. Search khitanan dan motif lokal buruk/noisy (bahkan mengacaukan “Khitan” etnis Asia), sehingga tidak layak dijadikan bukti budaya.
- Tidak ada survei pengguna, analytics pilihan template, wawancara keluarga/ustaz, atau usability test. Shortlist adalah hipotesis desain/implementasi, bukan bukti demand.
- Dukungan aksara dinyatakan pada level keluarga font (Latin/Arabic) berdasarkan deskripsi specimen; belum diuji terhadap seluruh harakat, ligatur, nama daerah, Arab Pegon, atau aksara Jawa/Sunda. Pegon/aksara daerah **tidak dijanjikan**.
- Referensi nyata di tiap direction terutama mendasari font, aksesibilitas, dan kehati-hatian warisan; bukan bukti bahwa komposisi visual tersebut lazim secara nasional. Validasi budaya lokal dan hak aset tetap dibutuhkan.
- “Tasyakuran” sangat kontekstual. Kategori schema saat ini cukup untuk MVP tetapi belum mencakup kelahiran, sembuh, nazar, ulang tahun perkawinan, renovasi, panen, dan istilah daerah; `other` menjadi fallback.
- Audit bersifat statis terhadap file repo yang tersedia; belum ada preview renderer yang dapat diuji dalam task riset ini.

## Checklist validasi sebelum produksi
- Review terminologi dan doa oleh keluarga target + reviewer agama/bahasa; review motif oleh praktisi/rujukan daerah bila mengklaim asal.
- Uji 360/390/430 px, zoom 200%, keyboard, screen reader dasar, high contrast, reduced motion, jaringan lambat, nama 40 karakter, alamat 200 karakter, Arab berharakat.
- Uji dengan/ tanpa foto, quote, gallery, gift, RSVP, greetings, guestbook, music, streaming, dan satu/lebih `events[]`.
- Dokumentasikan lisensi font/ilustrasi/foto, consent anak, focal crop, alt text, serta fallback asset sebelum publish.

**Hitungan akhir:** 18 direction (6 aqiqah + 6 tasyakuran + 6 khitanan), 9 shortlist MVP (3 per tipe), 18 baris matriks pembeda.
