<!-- SUMMARY (first 7 lines — greppable) -->
# 2026-07-27 (2) — Driver storage, test pertama, unifikasi UI panel
> WHAT: B7 storage pluggable, 30 test pertama, tutup B1–B6, dan bereskan palet + dark mode.
> STATUS: DONE (4 item terbuka di AUDIT-2026-07-27.md bagian B)
> OWNER: Operator + Guardian
> DEPS: docs/AUDIT-2026-07-27.md, docs/worklog/2026-07-27-audit-build-repair-and-publish-path.md
> GREP: storage, s3, sigv4, driver, test, rate limit, brand, dark mode, palette, guestbook
> UPDATED: 2026-07-27

## Kenapa sesi ini ada

Lanjutan langsung dari worklog pertama hari ini. Permintaan: selesaikan B7 lebih dulu, lalu audit
dan perbaiki seluruh codebase, plus perbaiki UI/UX panel customer dan admin.

## B7 — storage tidak lagi terikat disk instance

`lib/storage/` sekarang berlapis:

| File | Tanggung jawab |
|---|---|
| `driver.ts` | Interface + aturan keamanan key. **Bukan** `server-only` — murni, jadi bisa diuji |
| `local-driver.ts` | Disk lokal, streaming, root selalu absolut |
| `s3-driver.ts` | S3-compatible: AWS, R2, MinIO, B2 |
| `sigv4.ts` | Penandatanganan SigV4, generik dan bebas detail S3 |
| `index.ts` | Pemilihan driver + helper gambar level aplikasi |

Tiga keputusan yang perlu dicatat:

- **Konfigurasi S3 setengah jadi adalah hard error.** Fallback diam-diam ke disk lokal akan
  "berfungsi" tepat sampai deploy berikutnya menghapus semua foto customer. Itu mode kegagalan
  terburuk yang tersedia, jadi lebih baik menolak boot.
- **SigV4 ditulis sendiri, bukan menarik AWS SDK.** Yang dibutuhkan produk ini hanya PUT/GET/DELETE
  satu objek; SDK terlalu besar untuk tiga verb. Biayanya seratus baris, dan biaya itu dibayar
  dengan **vektor uji resmi AWS** — `get-vanilla` direproduksi persis.
- **Header `x-amz-content-sha256` pindah ke driver S3.** Versi pertama menambahkannya di dalam
  signer, yang membuat signer mustahil dibandingkan dengan vektor generik AWS. Signer sekarang
  hanya menambahkan apa yang SigV4 sendiri wajibkan.

## Test pertama (B8)

`node --test` + `tsx`. Tanpa dependency runtime baru; `tsx` masuk sebagai devDependency.

30 test: vektor SigV4, jendela aktif 12 bulan termasuk clamping akhir bulan dan tahun kabisat,
gerbang publish per tipe acara, anti-collision slug, penolakan traversal storage key, dan
perilaku rate limiter.

Dua modul dipecah agar bisa diuji, dan pemecahannya memperbaiki arsitekturnya juga:
`publish-rules.ts` (murni) di bawah `publish.ts` (akses data), dan `rate-limiter.ts` (murni) di
bawah `rate-limit.ts` (butuh request). `server-only` juga dilepas dari `slug.ts` dan `driver.ts`
— keduanya tidak menyentuh secret, filesystem, maupun environment, jadi guard-nya hanya
menghalangi pengujian.

Test menemukan satu bug di test-nya sendiri saat ditulis: boundary block diukur dari percobaan
yang melanggar limit, bukan dari t=0.

## Ditutup dari daftar terbuka

B1 rate limit, B2 buku tamu tanpa batas, B3 tracking memblokir render, B4 keunikan email,
B5 akun soft-deleted, B6 security header, B9 dokumen basi. Detail per item di bagian A
`docs/AUDIT-2026-07-27.md`.

Satu temuan baru muncul sambil mengerjakannya: **`updatePassword` mengembalikan ketiga password
plaintext** di setiap state error-nya. Nilai kembalian server action diserialisasi ke respons dan
diserahkan ke client, jadi password masuk ke payload halaman. Tidak ada yang perlu dipulihkan —
password masih tertulis di form pengguna.

## UI/UX — dua temuan yang hanya terlihat saat app dijalankan

**Palet `orange-*` berbohong.** `globals.css` mendefinisikan ulang `orange-*` Tailwind menjadi
rose, sehingga kelas bernama `orange-600` merender pink. 165 kelas `orange-*` + 53 literal hex
merujuk warna brand yang sama lewat dua mekanisme. Lebih buruk: `orange-800` dan `orange-950`
**tidak** ikut didefinisikan ulang, jadi item navigasi aktif merender oranye Tailwind asli —
coklat-taupe di sebelah rose brand, terlihat jelas di screenshot dashboard.

Semua dimigrasikan ke skala `brand-*`. Alias `orange-*` ditinggalkan sebagai deprecated agar
tidak ada yang rusak di tengah migrasi; hapus setelah tidak ada `orange-*` yang tersisa.

**Dark mode setengah jadi.** 65 varian `dark:` di shell panel dan primitif shadcn, tanpa satu pun
tema dark: tanpa blok `prefers-color-scheme`, tanpa token dark, tanpa toggle. Dengan strategi
media default Tailwind, varian itu aktif untuk **setiap** pengunjung yang OS-nya dark mode →
sidebar dan input gelap di atas halaman terang. Varian di-scope ke ancestor `.dark`, jadi
pekerjaan yang sudah ada menjadi inert alih-alih dibuang, plus `color-scheme: light`.

**Donut admin membohongi legend-nya.** Segmen PUBLISHED `#f97316` (oranye asli) sementara swatch
legend-nya rose. Sekarang keduanya dari satu konstanta.

**Sign-up tidak meminta nama** padahal form profil mewajibkannya, jadi setiap akun baru langsung
menemui error validasi. Action-nya sudah menerima `name` sejak awal; hanya input-nya yang hilang.

## Verifikasi

```
npx tsc --noEmit                → exit 0
npx tsx --test tests/*.test.ts  → 30 pass, 0 fail
npx next build                  → Compiled successfully, 130/130 static pages
```

Runtime, terhadap PostgreSQL lokal:

| Langkah | Hasil |
|---|---|
| Upload PNG asli | 201, `/media/1/<random>.png` |
| Teks yang mengaku `image/png` | 415 — ditolak dari bytes, bukan dari tipe |
| SVG dideklarasikan `image/svg+xml` | 415 |
| **Payload `<script>` SVG dideklarasikan `image/png`** | **415** — percobaan stored-XSS gagal |
| Serve file tersimpan | `image/png`, `nosniff`, `sandbox`, `content-length` benar |
| Traversal `/media/../../etc/passwd` | 404 |
| Sign-in gagal 1–5× | Error kredensial biasa |
| Sign-in gagal ke-6 dan ke-7 | Diblokir, "coba lagi dalam 15 menit" |
| Sign-up baru | `users.name` = "Dewi Lestari" tersimpan |
| Item nav aktif | `rgb(255,240,245)` / `rgb(190,0,69)` = brand-50 / brand-700 |
| Donut admin | rose, cocok dengan swatch legend-nya |

Satu kejutan yang terungkap saat pengujian: file upload mendarat di **root workspace**, bukan di
folder project, karena `UPLOAD_ROOT` default mengikuti `process.cwd()`. Sekarang di-log pada
penggunaan pertama, didokumentasikan di `.env.example`, dan `launch.json` diperbaiki agar
menjalankan dev server dengan cwd project.

## Yang belum diverifikasi

**Driver S3 belum pernah menyentuh bucket sungguhan.** Penandatanganan terverifikasi terhadap
vektor AWS dan pembentukan URL sudah di-review, tetapi belum ada objek yang benar-benar di-PUT.
Sebelum bergantung padanya di produksi: jalankan satu siklus upload → serve → delete terhadap
bucket asli, lalu catat hasilnya di `docs/AUDIT-2026-07-27.md` B2.

Server dev juga memancarkan `TimeoutNegativeWarning` dari sebuah dependency. Tidak ada
`setTimeout` maupun `setInterval` di seluruh kode aplikasi dan satuan pool `postgres.js` sudah
benar, jadi asalnya bukan dari sini — tetapi belum di-root-cause. Lihat B3.
