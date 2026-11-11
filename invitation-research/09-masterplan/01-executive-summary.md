<!-- SUMMARY (first 7 lines — greppable) -->
# 01-executive-summary.md — Invitesion masterplan in two pages (English + Bahasa Indonesia)
> WHAT: Thesis, evidence confidence, key findings, decisions, P0, 90-day sequence and owner dependencies; the same content in English and Bahasa Indonesia.
> STATUS: **s26 (2026-11-06): target architecture (ADR-A2 / ADR-F1) and the research rows updated in both languages; the plan is FINAL after ADR-O12 (≈ 16:50Z; research gate passed as qualified).** **s25 (2026-11-06): brought to current code and evidence in both languages** (own-build comparison, owner decisions ADR-O08–O10, defects fixed since the audit, the architecture outcome D-039, P0 status, progress against the 90 days, DA-01); **completion open** (`../_handoff/acceptance-matrix.md` §9; not FINAL). Earlier: verified s10 against `7a00a6d`; v1 s09 (baseline `64678cf`). Implementation progress: `../_handoff/IMPLEMENTATION-LOG.md`.
> OWNER: Research agent (Architect role)
> DEPS: 02–13 in this folder; ../07-ideation/README.md (thesis); ../08-backend-rust-plan/README.md (verdict)
> GREP: executive summary, ringkasan eksekutif, thesis, P0, 90 days, decisions, dependencies, status s25, progress
> UPDATED: 2026-11-06

## English

**Thesis.** Invitesion should be the invitation every guest can open and every family can trust: light on any phone, honest about prices and religious text, private by default, and complete through the event day. Competitors win on catalog volume, done-for-you service or art direction; none of the measured ones matches our guest-page weight and speed in the lab (311 KiB vs competitor tier medians of 3,407–4,461 KiB at cold load, 37 themes from 7 vendors including Enviory's six provisional themes, D-031; C-INV-005 limits apply: lab only, no middleware, measured before the s09 changes). The current page is lighter still against our own older builds (RQ-OWN-02, s23r, one host): ≈ 67–69 KB less transfer, and first paint ≈ 0.7–0.8 s earlier.

**Confidence.** All 15 Tier-A competitors have dossiers (Sitemu v1 since s12, after the robots applicability audit D-030; level C). Substantive profiles: 17 Indonesian and 11 international (Tier-A dossiers + 13 of 21 Tier-B one-pagers; 16 Indonesian in the most conservative count). Strict Wave 1 is **not met**: Indoinvite, PALEO and Satu Momen have no eligible guest-page captures (no safe public demo); Enviory's six themes are **provisional** while owner question Q-O09 is open (D-031), so the unconditional count is 4 of 8 vendors with ≥ 3 valid demo themes (5 of 8 with Enviory; Viding raised to 6 in s10). Planning proceeds under **ADR-W1**, a reduced-confidence exception that is not itself evidence. Feature conclusions for level-C competitors rest on public claims. No traffic, revenue or production data exists; none is assumed. The masterplan is verified but **not complete**: open items are listed in the acceptance matrix.

Since s14 three owner decisions apply:
- RQ-DEMO-01 is qualified by availability (ADR-O10).
- Implementation proceeds alongside the open research (ADR-O08).
- Review is a self-review under owner authority, not a Guardian review (ADR-O09).

At s26, RQ-COMP-04 and RQ-COMP-05 had no permitted route left. The owner qualified both by availability (ADR-O12): the strict counts stay at 13 / 21 profiles and 4 / 15 complaint sections, and complaint themes or price comparisons for the missing vendors are not claimed. RQ-BENCH-05 closed in s26 on its own criterion (explicit limits). The research gate passed as qualified, so under ADR-O11 this masterplan is **FINAL** and the upgrade starts at U1.

**What we found in our product (code-verified at `64678cf`).** Strong basics (escaped guest data, ownership checks, payment engineering, light guest page), but trust-breaking defects: invitations created from the catalog start empty (strict schema rejects template `art`); marketing shows "Rp0 / GRATIS" while checkout charges Rp 149k / 299k; three presets carry Qur'an translations of unknown provenance; times print in the server's zone with a hard-coded "WIB"; the editor's preview link is a 404; CSV export allows formula injection; an RSVP overwrites the host's seat allowance; unknown guest links answer 200; view counts double under concurrency. **All of these were fixed in s09–s11**, except that the guessable slug stays the default guest credential by the owner's choice (opaque links exist behind a flag). Still open at s25: the theme entitlement on save (B-041), rate limits (B-013), gift accounts on personal links only (G-021), and two legacy pages whose contrast is INCOMPLETE (`04-current-state.md` §3).

**Target architecture (s26, ADR-A2 / ADR-F1).** Rust becomes the authoritative backend for domain rules and writes, one data domain at a time behind flags, with drizzle-kit the single migration owner. Next.js stays the presentation layer. Speed is not the reason: ADR-A1's finding below stands. The reasons are the owner's direction, one writer per domain behind typed contracts, and the planned non-React workloads. An isolated experiment matched the TypeScript writer on our schema (17 / 17; `09-…architecture.md` §8).

**Architecture verdict, s09 history (measured, ADR-A1).** Keep Next.js; no Rust service now. In a matched lab spike (two rounds) the product page costs ≈ 27–30 ms server CPU per view; the same server with one data load and minimal HTML needs ≈ 4 ms (≈ 6.7–7× the throughput). Loading the data once instead of twice cuts database CPU per view by about a third but leaves server CPU unchanged, so ≈ 85–90 % of the cost is rendering the full template. Rust is cheaper still (≈ 0.3 ms) but then Postgres is the bottleneck, and it cannot render our React templates. The fix is caching the invitation-level render inside Next.js plus one data load (B-014), and atomic view tracking (B-017a).

**Outcome since then:**
- One data load and atomic views shipped.
- The whole-page cache was built and measured, then not shipped: it saved ≈ 1 ms of ≈ 29.6 ms (D-039).
- Removing Clerk from guest pages and sharing date formatters cut server CPU from 28.5 to 22.2 ms per view on one host.
- The ≤ 2 × `next-min` target is still unmet. ADR-A1 stands.

**P0 (12 items, dependency order).** B-001 catalog presets survive · B-002 prices from one source · B-003 no unverified religious text + verified corpus scaffold · B-004 event time zones (WIB/WITA/WIT) · B-005 editor preview link · B-006 CSV formula neutralisation · B-007 RSVP keeps the allowance · B-008 countdown + add-to-calendar · B-009 cover + music + pause · B-010 per-invitation OG image · B-011 opaque guest links + 404 for unknown guests · B-012 template harness with tier budgets. **Status at s25:**
- B-001…B-008, B-010 and B-011 shipped in s09 with tests. Opaque guest links stay off by default, per the owner's decision to keep slug links.
- B-012 runs as manual gates on product guest pages (contrast, byte budgets, cover fold, design acceptance); no CI runs them.
- **B-009 is not started: it is the one open P0, now unblocked.**

(At `7a00a6d`: B-009 not started; B-012 partial.)

**90 days (two-week sprints).** 1 trust fixes (B-001…B-007, B-017a) → 2 guest table stakes I (B-008, B-010, B-012, B-014, B-015, B-016) → 3 cover, music, profiles, gift block, memorial preset → 4 host tools (opaque links, rate limits, wa.me, import, follow-up lists) → 5 day-of QR pass and greeting screen, live preview → 6 template system v2 with the three dogfood templates, indexes, image pipeline, CI, payments readiness.

**Progress at s25** (`06-backlog.md`, "State at s25": 15 DONE, 7 PARTIAL, 20 OPEN):
- **Sprints 1–2 are essentially done.** B-014 is partial (step 1 shipped, target unmet).
- **Built ahead of order** under ADR-O08:
  - RSVP depth (B-027).
  - Programme and ceremonies (B-029).
  - Four design families (B-030, partial).
  - The children's-photo access contract (D-040).
- **Not started:** cover and music, the gift increments, the memorial preset, host import, rate limits and follow-up lists, the day-of QR flow, live preview, the image pipeline, and CI.
- **Next:** B-041 → B-009 → B-026 with G-021 → B-020 CI → B-013 / B-028.

**What the owner must supply (never invented here):**
- Hosting and database regions and plans.
- Real Clerk keys: signed-in acceptance is deferred out of this rebuild phase (DA-01).
- Traffic or analytics access.
- Final prices or a free-tier decision.
- A PJP (payment) contract.
- An approved, sourced religious-text corpus.
- Legal review of retention, privacy notice and gift money.
- A decision on the two legacy pages whose contrast is INCOMPLETE.

## Bahasa Indonesia

**Tesis.** Invitesion harus menjadi undangan yang bisa dibuka setiap tamu dan dipercaya setiap keluarga: ringan di ponsel apa pun, jujur soal harga dan teks keagamaan, menjaga privasi sejak awal, dan tuntas sampai hari-H. Kompetitor unggul di jumlah katalog, layanan "dibuatkan admin", atau arah seni; tidak satu pun yang terukur menyamai bobot dan kecepatan halaman tamu kita di lab (311 KiB vs median per tier kompetitor 3.407–4.461 KiB saat muat awal, 37 tema dari 7 vendor termasuk enam tema Enviory yang masih sementara, D-031; batasan C-INV-005 berlaku: hanya lab, tanpa middleware, diukur sebelum perubahan sesi 09). Dibanding build lama kita sendiri, halaman saat ini lebih ringan lagi (RQ-OWN-02, sesi 23r, satu host): transfer ≈ 67–69 KB lebih kecil dan tampilan pertama ≈ 0,7–0,8 detik lebih cepat.

**Tingkat keyakinan.** Ke-15 kompetitor Tier-A sudah punya dosir (dosir Sitemu v1 sejak sesi 12, setelah audit penerapan robots D-030; level C). Profil substantif: 17 Indonesia dan 11 internasional (dosir Tier-A + 13 dari 21 profil satu halaman Tier-B; 16 Indonesia pada hitungan paling konservatif). Wave 1 versi ketat **belum terpenuhi**: Indoinvite, PALEO, dan Satu Momen tidak punya tangkapan halaman tamu yang memenuhi syarat (tidak ada demo publik yang aman); enam tema Enviory berstatus **sementara (provisional)** selama pertanyaan pemilik Q-O09 belum dijawab (D-031), sehingga hitungan tanpa syarat adalah 4 dari 8 vendor dengan ≥ 3 tema demo valid (5 dari 8 jika Enviory disertakan; Viding naik menjadi 6 di sesi 10). Perencanaan berjalan dengan **ADR-W1**, pengecualian dengan keyakinan lebih rendah yang bukan bukti itu sendiri. Kesimpulan fitur untuk kompetitor level C bersandar pada klaim publik. Tidak ada data trafik, pendapatan, atau produksi; tidak ada yang diasumsikan. Masterplan sudah diverifikasi tetapi **belum lengkap**: butir yang masih terbuka tercantum di matriks penerimaan (acceptance matrix).

Sejak sesi 14 berlaku tiga keputusan pemilik:
- RQ-DEMO-01 dinyatakan dibatasi ketersediaan (ADR-O10).
- Implementasi berjalan bersamaan dengan riset yang masih terbuka (ADR-O08).
- Tinjauan adalah tinjauan mandiri atas wewenang pemilik, bukan tinjauan Guardian (ADR-O09).

Per s26, RQ-COMP-04 dan RQ-COMP-05 tidak punya jalur yang diizinkan lagi. Pemilik mengkualifikasi keduanya berdasarkan ketersediaan (ADR-O12): hitungan ketat tetap 13 / 21 profil dan 4 / 15 bagian keluhan, dan tema keluhan atau perbandingan harga untuk vendor yang tidak tersedia tidak diklaim. RQ-BENCH-05 ditutup di s26 sesuai kriterianya sendiri (batasan dinyatakan eksplisit). Gerbang riset lolos dengan kualifikasi, jadi menurut ADR-O11 masterplan ini **FINAL** dan upgrade dimulai dari U1.

**Arsitektur target (s26, ADR-A2 / ADR-F1).** Rust menjadi backend otoritatif untuk aturan domain dan penulisan data, satu domain demi satu domain di balik flag, dengan drizzle-kit tetap satu-satunya pemilik migrasi. Next.js tetap menjadi lapisan presentasi. Alasannya bukan kecepatan: temuan ADR-A1 (biaya utama ada di render React) tetap berlaku. Urutan upgrade U1–U7 ada di `06-backlog.md`.

**Temuan pada produk kita (diverifikasi di kode `64678cf`).** Fondasinya kuat (data tamu di-escape, cek kepemilikan, rekayasa pembayaran, halaman tamu ringan), tetapi ada cacat yang merusak kepercayaan: undangan yang dibuat dari katalog mulai kosong (skema ketat menolak `art` milik template); halaman pemasaran menampilkan "Rp0 / GRATIS" padahal checkout menagih Rp149 rb / 299 rb; tiga preset memuat terjemahan Al-Qur'an tanpa sumber jelas; jam acara dicetak dengan zona waktu server dan label "WIB" yang di-hardcode; tautan pratinjau di editor 404; ekspor CSV membuka celah injeksi rumus; RSVP menimpa jatah kursi yang ditetapkan tuan rumah; tautan tamu yang tidak dikenal tetap menjawab 200; hitungan "dibuka" bisa ganda saat akses bersamaan. **Semuanya sudah diperbaiki di sesi 09–11**, kecuali slug yang mudah ditebak tetap menjadi kredensial tamu bawaan atas pilihan pemilik (tautan acak tersedia di balik flag). Yang masih terbuka di s25: pemeriksaan hak tema saat menyimpan (B-041), batas laju (B-013), rekening hadiah hanya di tautan pribadi (G-021), dan dua halaman legacy yang kontrasnya INCOMPLETE (`04-current-state.md` §3).

**Putusan arsitektur (terukur, ADR-A1).** Tetap di Next.js; belum perlu layanan Rust. Dalam uji beban lab yang setara (dua putaran), halaman produk butuh ≈ 27–30 ms CPU server per kunjungan; server yang sama dengan satu kali muat data dan HTML minimal hanya ≈ 4 ms (throughput ≈ 6,7–7×). Memuat data sekali, bukan dua kali, memangkas CPU database per kunjungan sekitar sepertiga tetapi tidak mengubah CPU server, jadi ≈ 85–90 % biayanya ada pada perenderan template secara penuh. Rust lebih hemat lagi (≈ 0,3 ms), tetapi lalu Postgres yang menjadi leher botol, dan Rust tidak bisa merender template React kita. Solusinya meng-cache hasil render tingkat undangan di dalam Next.js ditambah satu kali muat data (B-014), serta pencatatan kunjungan yang atomik (B-017a).

**Hasil sejak itu:**
- Satu kali muat data dan pencatatan kunjungan yang atomik sudah dikirim.
- Cache seluruh halaman dibangun dan diukur, lalu tidak dikirim: penghematannya hanya ≈ 1 ms dari ≈ 29,6 ms (D-039).
- Mengeluarkan Clerk dari halaman tamu dan memakai formatter tanggal bersama memangkas CPU server dari 28,5 menjadi 22,2 ms per kunjungan di satu host.
- Target ≤ 2 × `next-min` belum tercapai. ADR-A1 tetap berlaku.

**P0 (12 butir, urut dependensi).** B-001 preset katalog tetap terbawa · B-002 harga dari satu sumber · B-003 tanpa teks keagamaan yang belum terverifikasi + kerangka korpus terverifikasi · B-004 zona waktu acara (WIB/WITA/WIT) · B-005 tautan pratinjau editor · B-006 netralisasi rumus di CSV · B-007 RSVP tidak menimpa jatah kursi · B-008 hitung mundur + simpan ke kalender · B-009 sampul + musik + tombol jeda · B-010 gambar OG per undangan · B-011 tautan tamu acak + 404 untuk tamu tak dikenal · B-012 harness template dengan anggaran per tier. **Status di s25:**
- B-001…B-008, B-010, dan B-011 sudah dikirim di sesi 09 lengkap dengan tes. Tautan tamu acak tetap nonaktif secara bawaan, sesuai keputusan pemilik untuk mempertahankan tautan slug.
- B-012 berjalan sebagai gerbang manual pada halaman tamu produk (kontras, anggaran byte, lipatan sampul, penerimaan desain); belum ada CI yang menjalankannya.
- **B-009 belum dimulai: satu-satunya P0 yang masih terbuka, dan kini tidak terblokir lagi.**

(Di `7a00a6d`: B-009 belum dimulai; B-012 baru sebagian.)

**90 hari (sprint dua minggu).** 1 perbaikan kepercayaan (B-001…B-007, B-017a) → 2 kebutuhan dasar tamu I (B-008, B-010, B-012, B-014, B-015, B-016) → 3 sampul, musik, profil, blok hadiah, preset duka → 4 alat tuan rumah (tautan acak, batas laju, wa.me, impor, daftar tindak lanjut) → 5 QR tamu dan layar sapa hari-H, pratinjau langsung → 6 sistem template v2 dengan tiga template dogfood, indeks, pipeline gambar, CI, kesiapan pembayaran.

**Kemajuan di s25** (`06-backlog.md`, "State at s25": 15 selesai, 7 sebagian, 20 terbuka):
- **Sprint 1–2 praktis selesai.** B-014 baru sebagian (langkah 1 sudah dikirim, target belum tercapai).
- **Dibangun lebih awal dari urutan** di bawah ADR-O08:
  - Kedalaman RSVP (B-027).
  - Program dan upacara (B-029).
  - Empat keluarga desain (B-030, sebagian).
  - Kontrak akses foto anak (D-040).
- **Belum dimulai:** sampul dan musik, tambahan blok hadiah, preset duka, impor tamu, batas laju dan daftar tindak lanjut, alur QR hari-H, pratinjau langsung, pipeline gambar, dan CI.
- **Berikutnya:** B-041 → B-009 → B-026 bersama G-021 → CI B-020 → B-013 / B-028.

**Yang harus disediakan pemilik (tidak dikarang di sini):**
- Region dan paket hosting serta database.
- Kunci Clerk asli: penerimaan alur login ditunda dari fase pembangunan ulang ini (DA-01).
- Akses trafik atau analitik.
- Harga final atau keputusan tier gratis.
- Kontrak PJP (pembayaran).
- Korpus teks keagamaan yang disetujui dan bersumber.
- Tinjauan hukum soal retensi data, pemberitahuan privasi, dan dana hadiah.
- Keputusan soal dua halaman legacy yang kontrasnya INCOMPLETE.
