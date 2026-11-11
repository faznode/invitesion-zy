<!-- SUMMARY (first 7 lines — greppable) -->
# guest-management.md — Guest, Slug, RSVP, Import
> WHAT: Manage tamu, slug anti-collision, URL unik per-tamu, RSVP, import CSV.
> STATUS: LIVE (design)
> OWNER: Operator
> DEPS: DATABASE_SCHEMA.md (guests, guest_messages, analytics_events, guest_registrations, guest_registration_links), services/api/README.md (jobs runner)
> GREP: guest, tamu, slug, url, rsvp, csv, import, impor, pendaftaran, daftar, self-registration, BACKEND_ROSTER, roster, tracking, collision, token, link_token, attending_count, calendar, og, analitik, tindak lanjut, follow-up, insights, digest, guest pass, QR pass, check-in, pemindai, scanner, GUEST_PASS, pass_id, tim, team, co-host, usher, penerima tamu, invitation_members, FLAG_TEAM_ACCESS, pihak keluarga, family_side, buku ucapan, wishes book, PDF, FLAG_WISHES_BOOK, hapus undangan, pulihkan, retensi, deleted_at, purge, FLAG_INVITATION_DELETION, workspace, ruang kerja, reseller, client invitation, workspace_members, manager, desk, credit ledger, FLAG_WORKSPACES, kode akses, passcode, G-047, FLAG_GUEST_PASSCODE, inv_unlock, guest_passcode_hash, kenangan, foto tamu, guest-photo, I-21, FLAG_POST_EVENT_MEMORY, postEvent
> UPDATED: 2026-11-11 (s52: kode akses tamu G-047 / D-069 / E-096 dengan migrasi 0031 dan perilaku rollback `FLAG_GUEST_PASSCODE=off`; kenangan setelah acara I-21 / D-070 / E-097, foto tamu sebagai media terlindungi `guest-photo`, `FLAG_POST_EVENT_MEMORY` default off; purge mengosongkan kode akses dan menghapus foto tamu; s42: reseller workspaces, client invitations, manager and desk staff links, the credit ledger's mechanics, G-052 / D-067 / E-085; s38: hapus & retensi undangan, pulihkan, sapuan setelah kedaluwarsa, B-031 / D-063 / E-081; s36: pihak keluarga kado khusus pernikahan, I-04 / D-059 / E-077; buku ucapan PDF khusus pemilik, I-22 / D-060 / E-078; s35: meja, suvenir & kado khusus pemilik + ekspor, G-045 / D-058 / E-076; tim undangan, co-host & penerima tamu, G-044 / D-057 / E-075; s34: QR pass tamu + meja check-in + antrean tanpa sinyal, B-024 / D-056 / ADR-A3 / E-074; koreksi: kedua penulis menulis RSVP / GUESTBOOK / CHECKIN ke analytics_events; s31: impor tamu + pendaftaran mandiri + penulis roster `BACKEND_ROSTER` Next.js / API Rust, B-033 / D-052 / E-070; analitik & tindak lanjut host, daftar belum membuka / belum menjawab, ringkasan harian, B-034 / E-069; hanya VIEW yang ditulis ke analytics_events; s29: detail hadiah hanya di link pribadi, QRIS statis host, tombol salin, B-026 / D-047 / E-063; s28: musik latar + sampul "Buka Undangan", B-009 / D-045 / E-061; moderasi / balasan / visibilitas buku tamu dan penulis ucapan `BACKEND_WISHES`, R-04 / D-044 / E-060; penulis RSVP `BACKEND_RSVP` Next.js / API Rust, kunci idempotensi, batas per link / alamat, kontrak proxy tepercaya, R-03 / D-043 / E-059; s23r: akses file foto anak D-040 / E-047; s20, dicatat s21: acara khusus undangan + override RSVP host D-037, foto mempelai / anak D-038; s19: id acara tetap, konfirmasi per acara, ringkasan jawaban host, D-036; s18: pertanyaan custom host + editor, D-034/D-035, ringkasan RSVP dashboard E-033; s17: B-027 MAYBE status, headcount hint; s09: B-007 attending_count, B-011 opt-in token + 404, B-008/B-010 side routes)

## URL unik per-tamu (differentiator utama)
Format: `/i/:invitationSlug/:guestSlug` → `invitation.com/i/wedding-andi/budi-santoso`
- guestSlug = slugify(nama) → "Budi Santoso" jadi "budi-santoso".
- **Slug polos, TANPA token.** Scope tamu = orang terdekat, risiko share/tebak kecil (keputusan whyme). **Tetap default.**
- **Opsional (B-011, 2026-11-03):** `FLAG_OPAQUE_GUEST_LINKS=on` → tamu BARU dapat `guests.link_token` (22 karakter base64url, 128 bit) dan link-nya `/i/:invitationSlug/:token`. Default `off` karena keputusan di atas; menyalakannya = keputusan owner. Aturan resolusi segmen terakhir (`lib/invitation/guest-link.ts`, dipakai halaman DAN server action): token cocok → tamu itu; kalau tidak, slug milik tamu yang **tidak punya token** (link lama tetap jalan); selain itu → **404**. Tamu bertoken tidak bisa dibuka lewat slug-nya.
- Link salah (tamu/undangan tidak ada, draft) menjawab **HTTP 404** (sebelumnya 200 + teks "tidak ditemukan"): halaman `/i/**` keluar dari partial prerendering (`experimental_ppr = false`, `next.config` `ppr: 'incremental'`).
- **Anti-collision:** kalau slug sudah ada di undangan yang sama → auto-append `-2`, `-3`. Contoh dua "Budi Santoso" → `budi-santoso` & `budi-santoso-2`.
- `UNIQUE(invitation_id, slug)`. Slug unik PER-UNDANGAN, bukan global. `UNIQUE(link_token)` global (null boleh banyak).
- Route samping per undangan (bukan per tamu, tanpa data tamu): `/i/:slug/calendar.ics` (B-008), `/i/:slug/og.png` (B-010, gambar pratinjau WhatsApp) dan `/i/:slug/gift-qris.img` (B-026, QRIS host selama detail hadiah tidak dibatasi ke link pribadi). Segmennya mengandung titik, yang tidak pernah ada di slug tamu, jadi tidak bisa menutupi halaman tamu.

## Personalisasi & tracking
- Tamu buka link → nama auto-fill di undangan, RSVP form pre-filled (nama disabled).
- Log `opened_at` + increment `opened_count` (tracking per-tamu — kompetitor gak punya).
- **VIEW** di `analytics_events`: paling banyak satu baris dan satu kenaikan `opened_count` per link per 30 menit (B-017a),
  sama untuk penulis TypeScript dan Rust. Kedua penulis juga menulis **RSVP** (bersama jawaban), **GUESTBOOK** (bersama
  ucapan) dan **CHECKIN** (hanya kedatangan pertama; `meta.source = 'pass'` untuk pindaian QR, D-056). Dicek s34 di kode
  kedua penulis; catatan s31 "tidak ada kode yang menulisnya" keliru.

## Analitik & tindak lanjut host (B-034, I-06, I-29; s31)
Halaman pemilik `/dashboard/invitations/<id>/insights` (tautan dari daftar tamu dan kartu "Analytics & Export" di control
center). Hanya baca; kode `lib/invitation/host-analytics.ts` (aturan murni) dan `host-analytics-query.ts` (loader).
- **Lingkup pemilik:** loader mencari undangan dengan `id` **dan** `user_id` sesi; undangan orang lain = null → 404
  privat. Semua query berikutnya memakai id undangan itu saja.
- **Angka:** tamu, sudah membuka (`opened_count > 0`), sudah menjawab (hadir / mungkin / tidak hadir), hadir dalam orang
  (`rsvpSummary`, jawaban hadir tanpa jumlah disebut terpisah), per kelompok (kategori di-trim, kosong = satu kelompok),
  per acara (`eventRsvpSummary`, D-036 / D-037), kunjungan 14 hari terakhir per hari lokal (`hostTimeZone`: zona
  `eventOperations.timezone`, lalu offset acara pertama, lalu WIB; timestamp disimpan sebagai jam dinding UTC).
- **Daftar tindak lanjut:** hanya tamu `PENDING`. **Belum membuka** = `opened_count = 0` (urut: paling lama ditandai
  dikirim dulu, belum ditandai paling akhir); **belum menjawab** = sudah membuka (urut: dibuka paling lama dulu). Tombol
  "Ingatkan" memakai `guestWhatsApp` (B-018) dengan template host dan link personal (token bila ada, B-011).
- **Ekspor:** `/dashboard/invitations/<id>/analytics?list=unopened|unanswered` (CSV, sel dinetralkan B-006, kolom
  `personal_link`); tanpa `list` tetap ekspor tamu lengkap seperti sebelumnya.
- **Ringkasan harian (I-29):** teks angka saja (tanpa nama / nomor / link tamu) yang dibagikan lewat `whatsAppShareLink`
  (tanpa penerima; WhatsApp menanyakan tujuan).
- **Bukti:** `tests/b034-host-analytics.test.ts`, `scripts/verify-host-analytics.ts` (job database). Halaman di browser
  dengan sesi asli = DA-01 (NOT RUN).

## RSVP
- Status: PENDING|CONFIRMED|DECLINED|MAYBE. MAYBE (B-027, s17) di belakang flag `RSVP_MAYBE` (default on; `FLAG_RSVP_MAYBE=off` menyembunyikan pilihan "Mungkin hadir" dan action menolaknya, jawaban MAYBE yang tersimpan tetap terbaca); dihitung terpisah di dashboard tamu dan diekspor dengan status sendiri. `guest_count` = jatah kursi dari host (RSVP **tidak pernah** mengubahnya); `attending_count` = jumlah yang hadir menurut tamu (0 kalau menolak, null = belum menjawab / jawaban sebelum B-007 / MAYBE, jadi "mungkin" tidak pernah masuk hitungan kursi). Jawaban di-clamp ke 1…`guest_count`.
- Form RSVP menjelaskan bahwa jumlah tamu hanya dicatat untuk jawaban hadir ("Jumlah ini dicatat untuk jawaban hadir", s17 temuan R2): MAYBE menyimpan `attending_count` kosong, DECLINED menyimpan 0.
- **Ringkasan RSVP di dashboard** (E-033, s18; `rsvpSummary()` di `lib/invitation/rsvp-rules.ts`): beranda dashboard dan halaman tamu memakai satu ringkasan yang sama. Isinya total tamu, hadir beserta jumlah orang (jumlah `attending_count` dari jawaban hadir), mungkin, tidak hadir, dan belum menjawab. Jawaban hadir dari sebelum B-007 yang tidak punya jumlah ditampilkan sebagai "tanpa jumlah", tidak ditebak dari jatah kursi. "Mungkin" dan "tidak hadir" tidak pernah menambah jumlah orang.
- Real-time muncul di customer panel. Export CSV (kolom `attending_count` di akhir; sel yang diawali `= + - @`, tab, CR dinetralkan dengan `'`, B-006).
- **Pertanyaan custom host** (B-027 slice 2b; kode s17, diterima end-to-end s18; D-034, D-035): diajukan di form RSVP bila `registrationForm.enabled`, ada minimal satu pertanyaan, RSVP masih terbuka, dan flag `RSVP_QUESTIONS` on (`FLAG_RSVP_QUESTIONS=off` = rollback; jawaban tersimpan tetap ada). Jawaban disimpan di `guests.rsvp_answers` dalam UPDATE yang sama dengan status dan jumlah hadir. "Wajib" hanya untuk jawaban hadir; pertanyaan bersyarat hanya dihitung bila syaratnya terpenuhi pada jawaban yang dikirim (jawabannya dibuang bila tidak); pertanyaan yang tidak mungkin berlaku (siklus, sumber hilang, syarat tanpa pilihan yang cocok) tidak ditampilkan. Menolak menghapus semua jawaban; jawaban tidak pernah masuk analytics. Batas jawaban: teks 500, teks panjang 2.000 (baris baru dihitung satu karakter, disimpan sebagai LF), angka bulat 0–100.000, pilihan hanya dari opsi host. Export CSV: satu kolom per pertanyaan saat ini, dinetralkan (B-006), juga saat form dimatikan. Config tersimpan yang tidak lolos aturan sekarang (D-035): pertanyaan yang tidak terbaca atau id-nya ganda hanya menghilangkan dirinya sendiri, bukan seluruh form. Pertanyaan yang syaratnya merujuk pertanyaan yang sudah dihapus tetap tersimpan, tidak ditanyakan ke tamu (termasuk turunannya), tetap punya kolom dan jawaban di export, dan ditandai di editor sampai host memilih sumber lagi. Kondisi itu tidak memblokir penyimpanan bagian lain maupun penerbitan.
- **Konfirmasi per acara** (B-027 slice 2c, s19, D-036): host menyalakan "Konfirmasi per acara" (`rsvp.perEvent`) dan undangan punya minimal dua acara, flag `RSVP_PER_EVENT` on (`off` = form tunggal seperti sebelumnya, kolom tidak disentuh). Tamu memilih hadir / tidak hadir / mungkin (mungkin hanya bila flag-nya on) dan jumlah orang untuk tiap acara, lalu satu tombol "Kirim konfirmasi". Setiap acara wajib dijawab; form lama (dibuka sebelum acara ditambah atau sebelum fitur dinyalakan) ditolak dengan menyebut acaranya. Status keseluruhan: hadir bila ada acara yang hadir, kalau tidak mungkin bila ada yang mungkin, kalau tidak tidak hadir; jumlah hadir keseluruhan = jumlah terbesar di satu acara. Jawaban disimpan per id acara di `guests.rsvp_event_answers` dalam UPDATE yang sama; urutan atau nama acara yang diubah tidak memindahkan jawaban. Jawaban untuk acara yang dihapus tetap tersimpan tetapi tidak dihitung atau diekspor. Jawaban tunggal (saat fitur mati) mengganti jawaban per acara. Export: dua kolom per acara (status, jumlah hadir).
- **Id acara tetap** (s19, D-036): setiap acara punya `id` yang ikut saat diedit atau diurutkan ulang (tombol naik / turun di editor); acara baru mendapat id acak baru, tidak pernah id acara yang sudah dihapus. Config lama mendapat `ev-<urutan>` sekali (migrasi data 0013 dan pembacaan memakai aturan yang sama).
- **Ringkasan jawaban untuk host** (E-036, s19): halaman tamu per undangan menampilkan kehadiran per acara, ringkasan tiap pertanyaan (jumlah per pilihan termasuk nol, pilihan lama yang masih punya jawaban, dijawab / belum dijawab, total angka) dan "Jawaban tamu" per baris tamu. Yang belum menjawab tidak pernah dihitung sebagai pilihan apa pun; pertanyaan dengan sumber syarat yang terhapus ditandai tidak ditanyakan, jawabannya tetap tampil.
- **Editor pertanyaan** (panel kelola → modul registrasi, E-031): kata-kata pertanyaan, jenis jawaban, wajib untuk yang hadir, pilihan jawaban, syarat pada pertanyaan pilihan **di atasnya** (jadi siklus tidak bisa dibuat), urutan, hapus. Menghapus atau mengganti jenis sumber, atau menghapus pilihan yang dipakai syarat, ikut menghapus syarat turunannya dan memberi tahu host. Daftar dicek dengan schema API sebelum dikirim. Batas registrasi, kapasitas, pendamping dan pesan konfirmasi masih tersimpan saja (belum tampil atau berlaku di undangan); batas waktu yang berlaku untuk tamu adalah batas RSVP. Per-event answers belum ada (butuh id acara yang stabil, slice 2c).
- **Acara khusus undangan** (s20, D-037): host menandai acara "Khusus tamu tertentu" (`events[].inviteOnly`) lalu mengundang tamu per orang atau per kategori (`guests.invited_event_ids`, migrasi 0015). Link pribadi melihat acara terbuka + acara yang diundang; halaman tanpa link tamu, file kalender undangan dan pratinjau link hanya acara terbuka; pratinjau host melihat semua. Fakta acara, hitung mundur, kalender dan form per acara mengikuti daftar itu, action RSVP juga. Ekspor menambah kolom `<judul> - invited` hanya bila ada acara khusus. Flag `INVITE_ONLY_EVENTS` (default on; `off` = semua acara terbuka, kolom tidak disentuh).
- **Override RSVP oleh host** (s20, `hostRsvpUpdate`): status, jumlah orang dan jawaban per acara ditulis satu UPDATE dengan aturan yang sama seperti tamu (dulu hanya status).
- **Penulis RSVP: Next.js atau API Rust** (R-03, D-043; kode s27, selesai s28): `BACKEND_RSVP=next|rust` (default `next`) memilih tepat satu penulis per panggilan untuk RSVP tamu dan override host; tidak pernah ada fallback ke penulis lain. Aturannya satu keputusan murni (`lib/invitation/rsvp-decision.ts`) yang dijalankan kedua bahasa lewat `contracts/vectors/rsvp-*.json`; bentuk data tersimpan sama. Dengan `rust`: setiap tulisan membawa `Idempotency-Key` (kunci form per render halaman pribadi, atau dibuat penulis); hasil yang tidak pasti (API tak terjangkau, timeout, 5xx) dikirim sekali lagi dengan kunci yang sama, jadi tidak pernah tercatat dua kali; bila tetap tak pasti, tamu melihat "belum bisa dipastikan tersimpan" (`?rsvp=retry`) dan form berikutnya membawa kunci yang sama, host melihat `?error=unconfirmed`. Batas tulis per link tamu dan per alamat (B-013; IPv6 per /64) dijawab "terlalu banyak percobaan … coba lagi dalam N menit" (`?rsvp=busy&rsvpr=`). Alamat diambil dari `X-Forwarded-For` menurut kontrak proxy tepercaya (`TRUSTED_PROXY_HOPS`, default 1 untuk Vercel), dikirim ke API saja dan disimpan hanya sebagai HMAC. Penolakan memakai notifikasi yang sama dengan penulis TypeScript; 403 dari cek pemilik mengarahkan host ke halaman masuk. Bukti: `scripts/verify-rsvp-api.ts` (kedua call site, kedua penulis, binary yang berjalan) di job CI `rust`.
- **Foto orang** (s20, D-038): foto mempelai dan yang bertasyakuran tampil bila diunggah; foto anak (aqiqah, khitanan, yang berulang tahun) hanya bila host menyalakan `showPhoto` **dan** dibuka lewat link pribadi atau pratinjau host.
- **Akses file foto anak** (s23r, D-040, E-047): unggahan foto anak disimpan di `protected/<undangan>/…`. `/media/protected/*` hanya untuk pemilik undangan yang login (`private, no-store`; gagal cek apa pun = 404 privat tanpa membaca file). Tamu menerima foto lewat `/i/<slug>/<tamu>/photo/<celebrant|honouree>`, yang di setiap request mengecek: undangan bukan draft, link tamu valid (aturan B-011: token dulu, lalu slug tamu tanpa token), slot sesuai jenis acara, saklar host menyala, dan file milik undangan ini sendiri. Hapus tamu, rotasi link, atau matikan saklar = akses berhenti di request berikutnya. Halaman tamu tidak pernah memuat path penyimpanan (HTML dan RSC); pratinjau host memuat path terlindung (sesi pemilik). URL eksternal yang diketik host tampil apa adanya dan tidak pernah di-proxy. Batas: byte yang sudah pernah tersaji publik tidak bisa ditarik kembali, dan link pribadi yang diteruskan tetap berfungsi bagi pemegangnya. Foto anak lama di namespace publik dipindah dengan `scripts/migrate-child-photos.ts` (urutan deploy dan rollback: IMPLEMENTATION-LOG E-047).
- **Detail hadiah hanya di link pribadi, QRIS statis host, tombol salin** (s29, B-026 / G-021, D-047, E-063): `gift.personalOnly: true` = nomor rekening / e-wallet, nama pemilik, catatan, dan QRIS hanya untuk link pribadi (aturan B-011) dan pratinjau host. Loader (`configForAudience`, `lib/invitation/gift-privacy.ts`) membuangnya dari config untuk link undangan **sebelum** render, jadi tidak ada di HTML, payload RSC, props klien, metadata, file kalender, gambar pratinjau, maupun route QRIS; halaman menulis bahwa detailnya ada di link pribadi. Audiens hanya ditentukan segmen route; parameter query tidak pernah mengubahnya. Undangan **baru** menyala sejak dibuat (`createInvitation`); undangan lama (tanpa kunci itu) tetap seperti sebelumnya sampai host mengubahnya di tab Kado. QRIS = gambar statis milik host, hanya unggahan terlindung (`purpose=gift-qris`: PNG / JPG / WEBP menurut tipe dan byte, maks 1 MB, `protected/<undangan>/`, harus milik undangan ini); tamu menerimanya lewat `/i/<slug>/<tamu>/gift/qris` atau, selama setelan mati, `/i/<slug>/gift-qris.img`, yang di setiap request mengecek undangan bukan draft, link tamu, saklar kado, dan kepemilikan file (`private, no-store`, `nosniff`, CSP sandbox, `noindex`). Tidak ada kustodi, checkout, atau pemrosesan pembayaran. Tombol "Salin" (hanya di keluarga desain; muncul setelah hidrasi) menyalin nomor persis seperti disimpan, dan bila Clipboard API tidak ada, memilih nomornya lalu memberi tahu tamu. Legacy tetap byte-identik (D-041) kecuali yang dipilih host (QRIS, catatan). Bukti layanan: `scripts/verify-gift-privacy.ts` (langkah "gift privacy" di job `product-gates`).
- Halaman tamu: hitung mundur + "Simpan ke Google Calendar" / file `.ics` untuk acara pertama yang belum lewat (B-008, `FLAG_GUEST_CALENDAR`, default on).

## Daftar tamu: impor, pendaftaran mandiri, penulis roster (B-033, D-052, E-070; s31)
- **Satu pintu untuk semua tulisan roster** (`lib/invitation/roster.ts`): tambah tamu di kedua daftar, tandai terkirim, check-in / batal check-in (dengan baris CHECKIN), acara khusus per tamu dan per kategori, impor dan pembatalannya, link pendaftaran, pendaftaran dari form publik, dan keputusan host. `BACKEND_ROSTER=next|rust` (default `next`) memilih tepat satu penulis per panggilan, tanpa fallback. Aturannya satu modul per bahasa (`lib/invitation/roster-rules.ts`, `services/api/src/roster/rules.rs`) yang dijalankan terhadap `contracts/vectors/roster-rules.json`; kedua penulis mengambil advisory lock yang sama per undangan, jadi slug tidak pernah bentrok dan dua penulis tidak pernah berselang-seling pada satu daftar. Kolom RSVP tetap milik penulis RSVP (R-03).
- **Aturan baris:** nama wajib (trim, ≤ 150 karakter), nomor WhatsApp opsional mengikuti B-018 (`08…`, `62…`, `+62…`; nomor luar negeri disimpan seperti ditulis bila 8–15 digit), kategori ≤ 50 karakter, jumlah tamu 1–50 (kosong = 1). Duplikat = nomor yang sama (setelah dinormalkan) atau, tanpa nomor, nama yang sama. Slug = slugify nama, lalu `-2`, `-3`, … pertama yang kosong. Batas teknis sampai ada batas paket (U6 / B-040): 3.000 tamu per undangan, 1.000 baris per impor, 300 pendaftaran menunggu.
- **Impor** (`/dashboard/invitations/<id>/guests/import`, flag `GUEST_IMPORT`, default on): tempel dari spreadsheet (tab), CSV `;` (Excel Indonesia) atau `,`, dengan atau tanpa header (alias Indonesia / Inggris); BOM, tanda kutip RFC 4180 dan baris baru di dalam sel ditangani (`lib/invitation/guest-import-parse.ts`). **Pratinjau** = keputusan penulis yang aktif tanpa menulis apa pun: per baris ok / tidak valid (alasan) / duplikat (dengan daftar atau baris di atasnya). **Impor** memutuskan ulang di bawah lock lalu menulis semua baris yang diterima dalam satu INSERT dengan satu `import_batch_id`, atau tidak sama sekali (`too_many_rows`, `roster_full`, `nothing_to_import`). **Batalkan impor** menghapus tamu batch itu yang belum disentuh; tamu yang sudah dibuka, dikirimi, menjawab, check-in, menulis ucapan atau punya log WhatsApp tetap ada dan dihitung.
- **Pendaftaran mandiri** (flag `SELF_REGISTRATION`, **default off** sampai teks pemberitahuan privasi B-021 disetujui pemilik): host membuka link `/daftar/<token>` (token 22 karakter; buka, ganti = link lama langsung mati, tutup) di panel "Pendaftaran tamu" (`#pendaftaran`). Form publik (nama, WhatsApp opsional, 1–5 orang; `noindex`) masuk antrean `guest_registrations`, tidak langsung menjadi tamu. Duplikat dijawab sama seperti pendaftaran baru dan tidak disimpan (daftar tamu tidak bisa diintip). Batas: 20 per link dan 5 per alamat per 10 menit (`RATE_LIMIT_REGISTRATION_*`, IPv6 per /64, alamat hanya sebagai HMAC, kontrak proxy tepercaya), dihitung di tabel yang sama oleh kedua penulis. Host menyetujui (menjadi tamu tanpa kategori, keluar dari antrean, satu transaksi) atau menolak (dihapus); persetujuan atas orang yang sudah menjadi tamu ditolak sebagai duplikat dan permintaannya tetap untuk ditolak host. Link berlaku selama undangan terbit dan belum kedaluwarsa.
- **Dengan `rust`:** setiap tulisan host membawa `Idempotency-Key`, form publik membawa kunci per render; hasil yang tidak pasti dikirim sekali lagi dengan kunci yang sama lalu "belum bisa dipastikan" (`?error=unconfirmed`, form publik `?daftar=retry`). Rollback: `BACKEND_ROSTER=next`, flag off; impor dibatalkan per batch; tabel baru aditif (migrasi 0019).
- **Bukti:** `tests/b033-roster-rules.test.ts` dan `services/api/tests/roster_vectors.rs` (vektor bersama), `tests/b033-roster-writer.test.ts` (pemetaan API, satu penulis, penjaga sumber), `services/api/tests/roster_database.rs`, dan `scripts/verify-roster-api.ts` (semua call site, kedua penulis, binary yang berjalan; job CI `rust`).

## QR pass tamu & meja check-in (B-024, I-01 / I-27, D-056, ADR-A3, E-074; kode s33, selesai s34)
- **Pass:** QR berisi token bertanda tangan, bukan id tamu: `IVP1.` + base64url(id pass 16 byte ‖ kedaluwarsa u32 ‖ 16
  byte pertama HMAC-SHA256), 53 karakter. Id pass = `guests.pass_id` (migrasi 0022, diisi database untuk setiap tamu).
  `GUEST_PASS_SECRET` (≥ 32 byte) menandatangani; `GUEST_PASS_SECRET_PREVIOUS` ikut diterima saat rotasi. Kedaluwarsa:
  dua hari setelah waktu acara terakhir, atau 30 hari tanpa tanggal acara. Aturan yang sama di `lib/invitation/guest-pass.ts`
  dan `services/api/src/roster/pass.rs`, dikunci `contracts/vectors/guest-pass.json`.
- **Hanya di link pribadi:** `/i/<slug>/<tamu>/pass`, bila flag `GUEST_PASS` on, undangan ikut serta
  (`checkInSettings.enabled`) dan rahasia diatur. Halaman undangan umum tidak pernah menampilkan pass. Halaman pass hanya
  memuat nama tampilan dan acara (`noindex`, tanpa referrer).
- **Meja check-in** `/dashboard/invitations/<id>/checkin`: kamera (BarcodeDetector, cadangan jsQR), pemindai genggam
  (mengetik kode lalu Enter) atau cari nama (cadangan manual; dimatikan host lewat `allowManual: false` atau
  `requireQr: true`). Hanya halaman ini yang boleh memakai kamera (`Permissions-Policy: camera=(self)`; situs lain
  `camera=()`), dan semua tautan ke sana memuat halaman penuh, karena navigasi sisi klien mempertahankan kebijakan halaman
  sebelumnya. Layar sapaan penuh: hijau "Selamat datang", kuning "Sudah check-in" dengan jam pertama, merah untuk
  penolakan; hanya nama tampilan, diumumkan ke pembaca layar.
- **Tanpa sinyal:** pindaian masuk antrean di perangkat (`lib/invitation/checkin-queue.ts`, local storage per undangan,
  maks. 2.000; token dan jam saja, tanpa nama). Batch ≤ 50 dikirim dengan kuncinya dan dikirim ulang persis sama dengan
  kunci yang sama sampai terjawab, juga setelah muat ulang. Pindaian menyimpan jamnya sendiri bila dalam sehari terakhir
  (lebih lama: sehari sebelum sekarang; di masa depan: sekarang). Nama saat offline berasal dari halaman (kunci satu arah
  dari id pass, bukan id pass).
- **Satu kedatangan per tamu:** pindaian, cadangan manual dan check-in di daftar tamu hanya menyimpan jam pertama dan satu
  baris CHECKIN; check-in berikutnya tidak menulis apa pun ("Sudah check-in"). Batal check-in mengosongkan jam.
- **Penulis:** satu pintu roster (`checkInWithPasses`, `BACKEND_ROSTER`). Kedua penulis mencatat kunci batch bersama
  jawabannya di `api_idempotency_keys` (scope `roster:pass-checkins:<pemilik>:<undangan>:0`), jadi kiriman ulang memutar
  jawaban pertama lewat penulis mana pun; kunci yang dipakai untuk batch lain ditolak (422). Browser hanya menulis lewat
  rute same-origin `/api/invitations/<id>/checkins` (ADR-A3: `Sec-Fetch-Site` / `Origin`, JSON saja, sesi pemilik, flag,
  batas 120 batch per 60 detik per host dan undangan, `RATE_LIMIT_CHECKIN`); API Rust tetap privat.
- **Flag off:** pass dan pemindai tersembunyi, setiap pass tak berlaku (rute 404), check-in yang tersimpan tetap.
- **Bukti:** `tests/b024-*.test.ts`, `scripts/verify-guest-pass-api.ts` (job `rust`, kedua penulis terhadap binary),
  `services/api/tests/guest_pass_*.rs`; browser tanpa kamera di salinan scratch (E-074). Perangkat fisik = EXT; sesi Clerk
  asli = DA-01 butir 7 (NOT RUN).

## Tim undangan: co-host & penerima tamu (G-044, D-057, E-075; kode di ekspor s34, selesai s35)
- **Siapa membuka apa.** Co-host: meja check-in, daftar tamu (tambah, impor + batal impor, acara khusus undangan,
  override RSVP, link dan keputusan pendaftaran), ucapan, statistik dan ekspor. Penerima tamu: meja check-in saja. Isi, tema,
  pengaturan, tim, checkout dan publikasi tetap milik pemilik. Detail peran: `docs/systems/auth.md`.
- **Pemilik:** halaman `/dashboard/invitations/<id>/team` (kartu "Team" di control center saat flag on): buat tautan per
  peran dan catatan "untuk siapa" (1–60 karakter), tautan ditampilkan sekali (salin / WhatsApp), berlaku 7 hari, maks. 20
  baris hidup; cabut anggota atau batalkan tautan kapan saja.
- **Anggota:** tautan `/gabung/<rahasia>` (noindex, no-referrer) diterima lewat POST; bila belum login, lewat sign-in /
  sign-up lalu `/gabung/terima`. Undangan muncul di dasbor anggota ("Dibagikan dengan Anda") dengan tombol sesuai peran dan
  "Keluar dari tim". Meja check-in dibuka dengan muat halaman penuh (kebijakan kamera D-056).
- **Data penerima tamu:** meja hanya membawa nama tampilan, kunci satu arah pass dan waktu datang; tidak ada nomor HP,
  RSVP, id pass, ucapan, statistik atau ekspor. Pencarian nama hanya di undangan itu.
- **Dicabut saat meja terbuka:** batch tersimpan dijawab 404, keluar dari antrean, dan meja menulis "akses Anda ke undangan
  ini sudah berakhir, atau QR pass sedang dinonaktifkan" (tidak menyebut yang mana). Muat ulang = 404.
- **Penulis:** setiap penulis host (roster, override RSVP, moderasi / balasan ucapan) memeriksa hak akses di transaksinya
  dan baru membaca jawaban kunci idempotensi sesudahnya; scope kunci memakai id akun yang bertindak.
- **Flag off (`FLAG_TEAM_ACCESS`):** hanya pemilik di semua pintu (termasuk formulir yang dirender saat flag masih on),
  halaman tim dan halaman bergabung 404, hak akses tersimpan tetap dan berlaku lagi saat flag on.
- **Bukti:** `tests/g044-team-access.test.ts`, `contracts/vectors/member-roles.json` (+ `services/api/tests/member_roles_vectors.rs`),
  `scripts/verify-team-access-api.ts` (job `rust`, kedua penulis terhadap binary), browser 43 / 43 di salinan scratch
  dengan Clerk tiruan (E-075). Sesi Clerk asli = DA-01 butir 8 (NOT RUN).

## Reseller workspaces: client invitations and workspace staff (G-052 / I-25, D-067, E-085; code s41, closed s42)
- **Who:** a customer account owns at most one workspace (`/dashboard/workspace`), names it and makes its own live
  invitations client invitations (`invitations.workspace_id`, `client_label`); "Jadikan pribadi" takes one back. The
  owner stays the invitation's owner: content, theme, payment, publishing, the team page and the workspace's staff are
  theirs alone. Administrators can neither own nor join a workspace.
- **Staff roles** reuse the team's capabilities (`contracts/vectors/member-roles.json`): `manager` = the co-host's
  (guests with phones, RSVPs and imports, the desk, wish moderation and replies, insights and exports), `desk` = the
  usher's (the check-in desk only: display name, pass key and arrival; no phone, RSVP or wish). A grant covers every live
  client invitation of its workspace and nothing else; staff land on `/dashboard/workspace`, which lists each client
  invitation with the link its role allows (the desk by a full page load, D-056).
- **Staff links:** one-time, shown once to the owner with a WhatsApp share, stored as SHA-256, 7 days, one account, at
  most 50 live rows per workspace. `/gabung/ruang/<secret>` shows the workspace and role (Indonesian frame, `lang="id"`,
  no referrer, noindex) and accepts only on a POST; signed out, the secret waits in the `inv_ws_join` cookie (HttpOnly,
  SameSite=Lax, Secure over HTTPS, `Path=/gabung/ruang`, one hour) through sign-in to `/gabung/ruang/terima`, and is
  cleared on acceptance. Used, expired, revoked, unknown and malformed links all read "invalid".
- **Checks on every request:** `invitationAccess` and both writers' membership clause (`lib/invitation/roster-next.ts`,
  `services/api/src/members.rs`, including `accessible_guest` and `lock_owned_wish`) join the workspace on the
  invitation's owner and require a live grant, a workspace that is not disabled and a live invitation, under the row lock
  the write takes. A revoked grant, a disabled workspace, an unassigned or deleted invitation and a forged
  `workspace_id` or row id give nothing at the next request. With G-044 (`FLAG_TEAM_ACCESS`) also on, an account holding
  both kinds of grant on one invitation gets the broader role.
- **Credits:** `lib/workspace/credits.ts` keeps an append-only ledger with the balance under the workspace's row lock,
  an operation key per workspace (a retry replays, another payload conflicts) and `debitWith` for a debit inside its
  operation's transaction. No product path calls it until credit prices and packs exist (B-040, EXT).
- **Flag off (`FLAG_WORKSPACES`, default):** the workspace and join pages answer 404, staff hold nothing at any entry
  and the dashboard drops the entry; workspaces, memberships, assignments and ledger entries are kept and work again
  when it is switched on.
- **Evidence:** `tests/g052-workspaces.test.ts`, `scripts/verify-workspaces.ts` (database job, and the rust job with
  both writers against the binary), `services/api/tests/workspace_access_database.rs`, browser 34 / 34 on a scratch copy
  with a Clerk stub (E-085). A real Clerk session = DA-01 item 13 (NOT RUN).

## Meja, suvenir & kado: catatan hari acara pemilik (G-045, D-058, E-076; s35)
- **Hanya pemilik.** Halaman `/dashboard/invitations/<id>/logs` (kartu "Seating, souvenirs & gifts" di control center saat
  `FLAG_HOST_LOGS` on), sembilan aksinya dan ekspor CSV meminta `accessFor(…, 'manage')`; co-host dan penerima tamu tidak
  memegangnya, administrator diarahkan masuk. Tidak ada delegasi sampai ada keputusan peran sendiri.
- **Meja:** nama 1–60 karakter (unik per undangan), kapasitas kosong atau 1–100, maks. 200. Meja dari rencana tempat duduk
  di control center (`config.seatingPlan`, sebelumnya hanya konfigurasi) bisa disalin sekali; nama yang sudah ada dilewati.
  Hapus meja = tamunya belum bermeja dan label kursinya dikosongkan. Lebih dari kapasitas ditandai, tidak ditolak.
- **Tamu:** pilih meja + label kursi (≤ 20) per tamu; tandai suvenir diberikan (waktu pertama dipertahankan) atau batalkan.
  Filter nama di tempat (tanpa JavaScript semua baris tetap tampil).
- **Kado:** dari tamu di daftar (nama tamu jadi pemberi bila tidak diketik) atau nama yang diketik; jenis amplop / kado /
  transfer / lainnya; nominal rupiah utuh opsional ("1.500.000", "Rp 1.500.000"); catatan ≤ 300; ubah dan hapus. Kunci sekali
  pakai per formulir: kirim ganda = satu catatan, kunci sama dengan isi lain ditolak. Maks. 5.000 per undangan.
- **Ekspor:** `?kind=seating` (nama, kategori, meja, kursi, suvenir, waktu suvenir dan check-in WIB) dan `?kind=gifts`;
  tanpa nomor HP; sel rumus dinetralkan (B-006); `private, no-store`.
- **Privasi:** tidak ada halaman tamu, payload publik, meja check-in atau handler Rust yang membaca tabel ini. Konfigurasi
  untuk audiens tamu (`configForAudience`) kini membuang bagian yang seluruhnya khusus tuan rumah (rencana tempat duduk,
  preferensi makanan, komunikasi, acara sekunder, tiket, perencana acara, templat WhatsApp); `checkInSettings` tetap karena
  pass membacanya di server.
- **Flag off (`FLAG_HOST_LOGS`, default off):** halaman, aksi dan ekspor 404, control center kembali ke placeholder meja,
  baris tetap dan kembali saat flag on.
- **Pihak keluarga kado (I-04, D-059, E-077; migrasi 0025):** hanya pada undangan pernikahan, tiap catatan kado boleh
  dikaitkan ke keluarga mempelai wanita atau pria (`gift_logs.family_side` `bride` / `groom`, kosong = belum ditentukan;
  catatan sebelum I-04 tetap kosong). Label memakai nama panggilan atau nama lengkap mempelai ("Keluarga Sari (mempelai
  wanita)") atau perannya saja, urutannya mengikuti `couple.displayOrder` (pria dulu bila `groom-first`). Ringkasan per
  pihak (jumlah catatan dan nominal tercatat) lalu yang belum ditentukan; kolom CSV `Pihak`. Penulis menolak pihak pada
  undangan selain pernikahan (`error=gift-side`). Ubah: formulir tanpa kolom pihak mempertahankan pihak tersimpan, pilihan
  "Belum ditentukan" mengosongkannya; kunci sama dengan pihak lain = kunci terpakai, tidak menambah catatan.
- **Bukti:** `tests/g045-host-logs.test.ts`, `tests/i04-gift-sides.test.ts`, `scripts/verify-host-logs.ts` (job `database`,
  97 / 97 di s36), browser 32 / 32 (E-076) dan 11 / 11 untuk I-04 (E-077) di salinan scratch dengan Clerk tiruan. Sesi Clerk
  asli = DA-01 butir 9 (NOT RUN).

## Guest book
- `guest_messages`. **Moderasi, balasan, visibilitas** (R-04, B-028, D-044; s28):
  - Tiga keadaan: **VISIBLE** (`is_hidden` false), **PENDING** (tersembunyi, belum ditinjau: buku tamu sedang dimoderasi saat ucapan masuk) dan **HIDDEN** (disembunyikan tuan rumah, `reviewed_at` terisi). Halaman tamu hanya menampilkan ucapan VISIBLE beserta `host_reply`; hitungan "Menampilkan N dari M" juga hanya menghitung yang VISIBLE.
  - Setelan editor (tab Buku tamu): `guestbook.moderation` (ucapan baru menunggu persetujuan; form memberi tahu tamu) dan `guestbook.visibility` (`public` default, `host` = form tanpa daftar, ucapan hanya dibaca tuan rumah). Bagian yang tidak terbaca = terbuka, tanpa moderasi, publik.
  - Tuan rumah: `/dashboard/invitations/<id>/wishes` (tautan dari pusat kelola) dengan filter semua / menunggu / tampil / tersembunyi; tampilkan (menyetujui atau memulihkan), sembunyikan, hapus, balas (kosong = hapus balasan). Hanya pemilik undangan; admin diarahkan masuk.
  - Aturan satu keputusan murni (`lib/invitation/wish-decision.ts`): sakelar dulu, lalu pesan (trim, 1–1.000 unit UTF-16, tanpa U+0000), moderasi menentukan PENDING. Dijalankan kedua bahasa lewat `contracts/vectors/wish-decisions.json`.
  - **Penulis: Next.js atau API Rust** (`BACKEND_WISHES=next|rust`, default `next`, tanpa fallback). Dengan `rust`: `Idempotency-Key` di setiap tulisan (kunci form per render untuk tamu; satu kunci per aksi tuan rumah), satu kali kirim ulang dengan kunci yang sama untuk hasil yang tidak pasti lalu "belum bisa dipastikan" (`?wish=retry&wishk=`), batas per link (5 / 600 dtk) dan per alamat (60 / 600 dtk, IPv6 per /64) dengan `?wish=busy&wishr=`, alamat hanya dari kontrak proxy tepercaya (`TRUSTED_PROXY_HOPS`). Penulis TypeScript tidak memberi batas (jalur rollback, dihapus setelah rollout).
  - Index `guest_messages_invitation_visible_idx` (migrasi 0017) dipakai daftar dan hitungan halaman tamu.

## Buku ucapan PDF (I-22, D-060, E-078; s36)
- **Hanya pemilik**, di balik `FLAG_WISHES_BOOK` (default off). Kartu "Buku ucapan" di `/dashboard/invitations/<id>/wishes`
  dan rute `/dashboard/invitations/<id>/wishes/book` meminta `accessFor(…, 'manage')`; co-host memoderasi di halaman yang
  sama tanpa kartu dan mendapat 404 di rute. Keluar: 401; administrator 403 sebelum undangan dibaca; lainnya atau flag off
  404. Setiap unduhan memeriksa ulang, jadi tautan lama berhenti bekerja begitu akses berakhir. Dibuat per permintaan,
  tidak disimpan.
- **Isi:** ucapan berstatus **VISIBLE** saja (PENDING, HIDDEN dan yang dihapus tidak ada), apa pun setelan buku tamu saat
  ini (ditutup atau hanya tuan rumah tetap dicetak; teksnya "berstatus Tampil", bukan "tampil di undangan"); yang terlama
  dulu, seri waktu diurutkan id; nama, waktu WIB, pesan dan balasan tuan rumah. Sampul: nama tampilan undangan, tanggal
  acara pertama, jumlah ucapan, waktu dibuat dan catatan tentang yang tidak dimuat. Tidak membaca tautan tamu, HP atau id.
- **Batas:** 5.000 ucapan VISIBLE tertua di query (sampul menyebut "5.000 dari N") dan anggaran 2.000 halaman termasuk
  sampul (ucapan berikutnya tidak dimulai; sampul menyebut jumlah yang dicetak). Font standar PDF (Times, Helvetica,
  WinAnsi): huruf Latin-1 / CP1252 apa adanya, huruf Latin lain dengan huruf dasarnya, tanda transliterasi (ʿ ʾ) jadi
  apostrof, aksara lain (Arab, CJK) ditandai `[…]` dan emoji tidak dicetak; sampul menjelaskannya. Teks tersimpan tidak
  berubah.
- **Berkas:** `application/pdf`, `attachment; filename="buku-ucapan-<slug>.pdf"` (id bila slug tidak polos), `private,
  no-store`. A5, metadata hanya judul / pembuat. `pdf-lib` hanya di server (`lib/invitation/wishes-book-pdf.ts`).
- **Bukti:** `tests/i22-wishes-book.test.ts`, `scripts/verify-wishes-book.ts` (job `database`), browser 11 / 11 (E-078).
  Sesi Clerk asli = DA-01 butir 10 (NOT RUN).

## Musik latar & sampul "Buka Undangan" (B-009, D-045; s28)
- Hanya undangan dengan musik yang **bisa diputar**: `music.enabled` dan `music.assetUrl` berupa URL http(s) (`lib/invitation/audio-url.ts`). Preset yang hanya menyimpan `music: { enabled: true }` tanpa URL tidak menampilkan apa-apa. Unggahan saat ini hanya gambar, jadi musik selalu tautan yang diketik tuan rumah; tuan rumah bertanggung jawab atas hak lagunya (editor mengingatkan).
- `autoplay` kosong atau `true` (default editor "Putar saat undangan dibuka"): halaman dibuka dengan sampul tipografis (jenis acara atau judul sampul tuan rumah, nama, tanggal, "Kepada Yth." + nama tamu bila tautan pribadi) dan tombol **Buka Undangan**; ketukan itu memutar musik (satu-satunya saat peramban mengizinkan suara). "Buka tanpa musik" dan Escape membuka tanpa suara. `autoplay: false`: tanpa sampul, hanya tombol musik.
- Bekerja sejak cat pertama tanpa JavaScript (tautan `#sampul` + CSS `:target`); setelah hidrasi, halaman di belakang sampul `inert` dan tidak menggulir. Keluar sampul 0,7 dtk (I-15: ≤ 1,5 dtk), langsung tanpa animasi bila `prefers-reduced-motion`.
- Satu `<audio preload="none" loop>`: tidak ada byte audio yang diambil sebelum tamu mengetuk (pihak ketiga pemilik URL tidak melihat tamu yang tidak memutar). Tombol musik (`aria-pressed`) muncul setelah halaman siap, tidak muncul bila sumbernya gagal diputar.
- Tamu yang kembali dari kiriman form (`?rsvp=`, `?wish=`) tidak melihat sampul lagi (pemberitahuannya tetap terlihat).
- Flag `FLAG_GUEST_MUSIC` (default on); off = HTML halaman persis seperti sebelumnya, setelan tersimpan tidak dibaca. HTML halaman tanpa musik byte-identik (layout tidak diubah; sampul adalah pulau klien `components/invitation/cover-audio.tsx` di luar `<main>`). Semua halaman tamu tetap mengunduh chunk pulau itu (5,6 KB; Next.js mendaftar chunk rute secara statis), tetapi hanya berjalan di halaman bermusik.

## Kode akses tamu (G-047, D-069, E-096; kode s51, diverifikasi s52)
- **Pilihan pemilik:** kartu "Kode akses tamu" di Tema & Cover editor menyetel, mengganti atau menghapus kode lewat
  `PUT` / `DELETE /api/invitations/<id>/passcode` (urutan: flag, sesi, peran, id; keluar 401, administrator 403,
  pelanggan lain 404, kode tidak sah 422 `INVALID_PASSCODE`). Kode 6–32 huruf atau angka, dibandingkan setelah NFKC, tanpa
  spasi di tepi dan tanpa beda huruf besar / kecil. Jawaban tidak pernah memuat kode atau hash.
- **Penyimpanan:** hanya hash scrypt bergaram di `invitations.guest_passcode_hash` + `guest_passcode_set_at` (migrasi
  0031, aditif; `NULL` = tanpa kode, termasuk semua undangan lama). Tidak pernah di `config`: tidak ikut versi, pemulihan
  G-046, payload editor atau penulis konten mana pun. Satu penulis: `lib/invitation/guest-passcode-db.ts`.
- **Gerbang sebelum query konten:** `loadGuestGate` (`lib/invitation/guest-gate.ts`) berjalan sekali per permintaan
  sebelum query tamu, ucapan, media atau kado di tautan undangan, setiap tautan pribadi, pass dan metadata-nya. Halaman
  terkunci hanya sampul (label dan nama; tidak pernah nama tamu) dengan form biasa ke server action; HTML dan payload RSC
  sama-sama hanya gerbang, `private, no-store`. Segmen tamu yang tidak dikenal mendapat gerbang yang sama.
- **Izin masuk:** cookie `inv_unlock_<id>` (kedaluwarsa + HMAC berkunci hash tersimpan), HttpOnly, SameSite=Lax, path
  `/i/<slug>`, 30 hari. Mengganti atau menghapus kode mengakhiri setiap izin; izin satu undangan tidak membuka yang lain.
- **Percobaan dibatasi, dihitung sebelum kode dicek:** per undangan 50 / 10 menit dari semua alamat
  (`RATE_LIMIT_PASSCODE_LINK`) dan per alamat 5 / 10 menit (`RATE_LIMIT_PASSCODE_IP`), disimpan sebagai hash alamat berkunci
  (butuh `INTERNAL_API_SECRET`; alamat mentah tidak disimpan). Jendela yang habis menolak kode yang benar juga.
- **Permukaan samping (D-069):** kalender, kedua rute QRIS dan foto anak menjawab 404 `private, no-store` selama terkunci
  (kalender setelah masuk: `private, no-store`); gambar Story dan e-card publik 404 untuk undangan berkode (di-cache untuk
  semua orang dan memuat tanggal); kartu tautan dan metadata berbagi = sampul untuk semua penonton (tanpa tanggal, tanpa teks
  pembuka, noindex); RSVP dan ucapan ditolak sebelum penulis mana pun; foto dan unggahan kenangan (I-21) ditolak selama
  terkunci. Halaman kartu pemilik menjelaskan mengapa e-card tidak ada.
- **Default dan rollback:** `FLAG_GUEST_PASSCODE` default **on**. `FLAG_GUEST_PASSCODE=off` adalah rollback dan
  **membuat setiap undangan berkode langsung publik kembali** (konten, Story, kalender, kartu tautan asli), menyembunyikan
  kartu editor dan membuat rute pemilik 404; hash dan waktunya **disimpan**, jadi menyalakannya lagi mengembalikan gerbang
  dan izin yang sama. Beri tahu pemilik yang memasang kode sebelum flag dimatikan; rollback di lingkungan hidup tetap
  langkah operasional pemilik (agen tidak mengubah flag produksi). Membalik kode membiarkan kedua kolom tak terbaca.
- **Retensi:** purge B-031 mengosongkan kedua kolom pada tombstone (R-X10).
- **Batas:** kode melindungi halaman, bukan apa yang sudah disimpan atau diteruskan tamu yang sudah masuk; batas per alamat
  butuh `INTERNAL_API_SECRET`. Bukti: `tests/g047-guest-passcode.test.ts`, `verify-content-api` (pemulihan lewat kedua
  penulis tidak menyentuh kode), `verify-retention`, penerimaan browser s51 dan s52 (E-096). Clerk asli: DA-01 butir 19.

## Kenangan setelah acara (I-21, D-070, E-097; kode s51, diverifikasi s52)
- **Konten, pilihan pemilik:** `config.postEvent` {`enabled`, `message` ≤ 1.000, `photos`} dari kartu "Kenangan setelah
  acara" di bawah Ucapan & Doa; disimpan, diberi versi dan dipulihkan seperti bagian lain lewat kedua penulis konten.
  Kedua sakelar opsional, kosong = off (R-X7).
- **Kapan dan di mana:** empat keluarga desain menampilkannya di tautan undangan itu sendiri setelah acara terakhir yang
  boleh dilihat audiens halaman selesai (`endAt`, atau mulai + 6 jam; per audiens, D-037). Layout klasik tidak pernah
  (D-041). Sebelum itu pesannya tidak terkirim sama sekali (HTML maupun RSC).
- **Foto tamu = baris media terlindungi:** `media_assets.type = 'guest-photo'` (tanpa migrasi), file di prefiks terlindungi
  undangan (D-040), `meta` {`guestId`, `review` pending / visible / hidden, `reviewedAt`}. Satu penulis:
  `lib/invitation/guest-photos-db.ts`. Tidak pernah tampil di galeri, editor atau pustaka media (query-nya mengecualikan
  tipe ini; `config.gallery.assetIds` khusus pemilik dan tidak dibaca; URL foto ditolak di field konten mana pun, D-040).
- **Siapa berbagi, siapa melihat:** tamu mengunggah dari tautan pribadinya selama kenangan terbuka, foto dinyalakan dan
  undangan masih menerima tulisan; 5 foto per tamu, 10 unggahan per jam (`RATE_LIMIT_GUEST_PHOTO`); JPG, PNG atau WebP
  menurut isi file, ≤ 5 MB (tanpa GIF, tidak pernah SVG). Unggahan lewat rute `POST /i/<slug>/<guest>/kenangan` (bukan
  server action, yang dibatasi 1 MB; R-X8): hanya same-origin, setiap penolakan diputuskan dari tautan sebelum body dibaca,
  jawaban selalu 303 ke tautan pribadi (`?foto=terkirim|ditolak|penuh|tutup|tunggu|dihapus`). Setiap foto menunggu
  pemilik; tamunya melihat dan boleh menghapus fotonya apa pun statusnya; orang lain hanya melihat foto yang ditampilkan.
  Tautan undangan hanya melihat.
- **Pengiriman:** `/i/<slug>[/<guest>]/kenangan/<id>` memeriksa gerbang G-047, undangan terbit dan hidup, tautan tamu,
  kenangan terbuka dengan foto on, lalu foto yang tampil atau milik tamu itu; `private, no-store`, nosniff, CSP sandbox.
  `/media` hanya untuk pemilik, yang meninjau di `/dashboard/invitations/<id>/kenangan` (tampilkan, sembunyikan, hapus;
  co-host dan administrator tidak punya akses).
- **Default dan rollback:** `FLAG_POST_EVENT_MEMORY` default **off** sampai teks pemberitahuan foto tamu (B-021) dan
  tinjauan retensi (B-031, D-063) mencakup foto tamu, dan sampai ada bukti Clerk asli (DA-01 butir 20) dan ponsel asli.
  Mematikannya lagi menyembunyikan kenangan, setiap rute foto, unggahan dan halaman tinjauan sekaligus dan menyimpan
  barisnya (kembali seperti semula saat dinyalakan). Foto off, kenangan off, kode akses dan penghapusan B-031 juga
  menyembunyikan sambil menyimpan baris.
- **Retensi:** purge B-031 menghapus baris dan file foto tamu bersama media undangan lainnya.
- **Batas:** foto tamu tidak punya varian gambar (media terlindungi, D-040); pemilik tidak diberi tahu foto baru. Bukti:
  `tests/i21-post-event.test.ts`, `verify-content-api`, `verify-retention`, penerimaan browser s51 dan s52 (E-097).

## Expired (12 bulan)
- Undangan READ-ONLY: tamu masih bisa lihat, RSVP + guestbook NUTUP. Data tamu disimpan. Kenangan I-21 tetap tampil
  read-only (unggahan `tutup`); undangan kedaluwarsa yang berkode tetap hanya menampilkan gerbang.

## Hapus & retensi undangan (B-031, D-063, E-081; kode s37, integrasi s38)
- **Hapus oleh pemilik** (`FLAG_INVITATION_DELETION`, default **off**, + `INVITATION_DELETION_WINDOW_DAYS`): di kartu
  undangan, di balik disclosure + kotak konfirmasi wajib (dicek ulang oleh action). Hanya pemilik; co-host, usher,
  akun lain dan admin tidak pernah bisa menghapus. Satu transaksi menulis `deleted_at`, `purge_after` dan job
  `invitation_purge` (`lib/invitation/deletion-db.ts`); hapus ulang menjawab tanggal yang sama.
- **Langsung hilang di mana-mana:** halaman tamu, link personal, pass, kalender, gambar pratinjau, pendaftaran mandiri,
  pratinjau pemilik, halaman kelola, akses co-host, semua penulis (konten, roster, RSVP, ucapan, catatan host, tim,
  publish) di Next.js dan API Rust, serta unggahan publik di `/media` (404 `private, no-store`, objek tidak dibaca).
  Jawabannya 404 / `not_found`, sama dengan undangan yang tidak pernah ada (bukan 410), jadi slug yang dihapus tidak bisa
  ditebak. Form lama yang dikirim ulang ditolak tanpa menulis apa pun, dan tidak ada catatan VIEW / tamu baru.
  Pembayaran order PENDING yang selesai setelah penghapusan (konfirmasi admin atau webhook terlambat) tetap dicatat,
  tetapi tidak pernah mem-publish undangan yang dihapus atau tombstone-nya (`docs/systems/payment.md`).
- **Pulihkan** sampai purge berjalan, juga saat flag off; undangan kembali persis (status, tanggal, konten). Purge dan
  pemulihan mengambil kunci baris yang sama: siapa duluan menang, job lama yang tertinggal selesai tanpa mengubah apa pun.
- **Retensi setelah kedaluwarsa** (`INVITATION_RETENTION_DAYS_AFTER_EXPIRY` + window, keduanya wajib): `invitesion-jobs`
  menghapus undangan yang `expires_at`-nya lewat sekian hari persis seperti pemiliknya (window dibuka, job yang sama).
  Selama kedua durasi tetap terisi, undangan kedaluwarsa yang dipulihkan pemilik akan dihapus lagi pada putaran
  berikutnya dengan window baru (pertanyaan terbuka D-063 Q3); tidak ada yang di-purge sebelum satu window penuh.
- **Purge** (Rust, runbook di `services/api/README.md`): baris tamu, ucapan, statistik, catatan, versi, media + objeknya
  di prefiks milik undangan (termasuk foto tamu I-21); tombstone (tanpa `config`, `creation_key`, `client_label` dan kedua
  kolom kode akses G-047), orders / payments / payment_events dan percakapan pelanggan disimpan. Dry run:
  `invitesion-jobs --plan-purge <id>`.
- **Batas:** salinan di luar origin tidak terjangkau (gambar yang sudah disimpan peramban atau cache jaringan; unggahan
  publik `public, max-age=31536000, immutable`), file CSV / PDF yang sudah diunduh, tangkapan layar. Tidak ada purge CDN.
  Durasi, teks pemberitahuan ID/EN dan retensi data keuangan menunggu keputusan pemilik + konsultan hukum (UU PDP, EXT);
  B-021 tetap terblokir sampai itu ada.
