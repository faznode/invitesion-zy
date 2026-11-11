<!-- SUMMARY (first 7 lines — greppable) -->
# 2026-07-27 — Audit lintas-disiplin, perbaikan build, jalur publish
> WHAT: Perbaiki compile blocker, kunci sesi, XSS upload, dan implementasi publish/unpublish.
> STATUS: DONE (9 diperbaiki, 11 terbuka di AUDIT-2026-07-27.md)
> OWNER: Guardian + Operator
> DEPS: docs/AUDIT-2026-07-27.md, PROJECT_OVERVIEW.md, docs/specs/REBUILD-HANDOFF-A-Z.md
> GREP: audit, build, compile, publish, expires, auth secret, svg, xss, pool, media
> UPDATED: 2026-07-27

## Kenapa sesi ini ada

Permintaan: audit codebase seperti senior engineer lintas disiplin — arsitektur, kualitas kode,
debugging, performa, keamanan, dan deployment — lalu implementasikan perbaikannya.

## Temuan paling penting

**Project tidak bisa di-compile.** `lib/storage/uploads.ts` diimpor oleh empat file dan tidak
ada di repository. Tidak ada worklog sebelumnya yang menyebutnya, yang berarti hard rule #1 di
`AGENTS.md` ("selalu jalanin app-nya") tidak dijalankan pada snapshot ini — `next build` gagal
sejak langkah resolusi modul.

**Tidak ada jalur publish sama sekali.** Pencarian `update(invitations)` di seluruh codebase
menghasilkan satu hasil, dan hasil itu hanya menulis `config`. Tidak ada yang pernah menulis
`PUBLISHED`, `publishedAt`, atau `expiresAt`, sedangkan `loadPublicInvitation` menolak `DRAFT`.
Setiap undangan yang pernah dibuat secara struktural tidak mungkin tayang.

**Kunci penanda-tangan sesi tidak divalidasi.** `process.env.AUTH_SECRET` diumpankan langsung
ke `TextEncoder`. Variabel yang hilang tidak menghasilkan error — hanya sembilan byte dari
string `"undefined"` yang dipakai HS256 sebagai kunci, dan sesi jadi bisa ditempa.

## Yang diperbaiki

| Area | Masalah | Perbaikan |
|---|---|---|
| Build | `lib/storage/uploads` hilang, 4 call site | Modul ditulis ulang; satu-satunya tempat yang tahu lokasi fisik byte |
| Auth | `AUTH_SECRET` tanpa validasi | `lib/env.ts` — lazy, memoised, minimum 32 karakter |
| Upload | SVG diizinkan + disajikan same-origin | SVG dibuang; ekstensi ditentukan dari magic bytes, bukan `Content-Type` |
| `/media` | Tanpa `nosniff`/CSP, ekstensi tak dikenal disajikan | Hanya ekstensi terdaftar + `nosniff` + `default-src 'none'; sandbox` |
| `/media` | Seluruh file dimuat ke memori | Streaming `createReadStream` → `Readable.toWeb` |
| Admin | Entry path dibanding `===`, bocor lewat timing | `timingSafeEqual` |
| Session | Cookie rusak melempar → 500 di `/api` | `verifyTokenSafe()`; error konfigurasi tetap dilempar |
| Database | Client baru tiap HMR, tanpa plafon pool | Cache `globalThis` + `max`/`idle_timeout`/`connect_timeout` |
| Produk | Tidak ada publish | `lib/invitation/publish.ts` + server action + kontrol di daftar undangan |

## Keputusan desain pada publish

- **Idempoten.** Publish yang ter-submit dua kali tidak menggeser maju kedaluwarsa 12 bulan.
  Kalau tidak, klik ganda diam-diam menjual masa aktif lebih pendek daripada yang dibayar.
- **Unpublish tidak mereset dan tidak menghanguskan masa aktif.** Masa aktif itu barang yang
  sudah dibeli; menurunkan halaman sementara adalah operasi wajar.
- **Gate publish dangkal, disengaja.** Hanya memblokir undangan yang akan tampil sebagai
  cangkang kosong — tidak ada nama, atau tidak ada jadwal acara. Kelengkapan per-tipe-acara
  adalah tugas panduan editor, bukan gerbang keras; keputusan produk menyatakan customer yang
  memiliki kontennya.
- **Alasan blokir dihitung sebelum render**, jadi tombol yang non-aktif selalu menjelaskan
  dirinya sendiri, bukan gagal saat submit.

## Keputusan yang direvisi di tengah jalan

Versi pertama `getAdminEntryPath()` melempar exception kalau entry path terlalu pendek. Itu
salah: fungsi ini dibaca middleware pada **setiap** request, jadi salah-konfigurasi khusus
admin akan berubah menjadi outage total untuk customer dan tamu. Diubah menjadi gagal-tertutup
pada batas admin saja (admin tidak terjangkau, error dicatat), sementara `assertServerEnv()`
tetap melaporkannya keras saat boot check.

## Verifikasi

Statis:

```
npx tsc --noEmit      → exit 0
npx next build        → Compiled successfully, 130/130 static pages
```

Runtime, terhadap PostgreSQL 16 lokal (dipasang di sesi ini lewat Homebrew), seluruh alur
dijalankan lewat browser:

| Langkah | Hasil |
|---|---|
| Sign-up customer | 303 → `/dashboard` |
| Katalog tema | 6 template hasil seed tampil |
| Buat undangan dari tema | `invitations` id=1, slug `klasik-putih`, status DRAFT |
| Publish saat data kurang | Tombol non-aktif + 2 alasan tampil, tidak bisa disubmit |
| Simpan mempelai + jadwal acara | `PATCH /api/invitations/1/detail` 200, config tersimpan |
| Publish | status PUBLISHED, `age(expires_at, published_at)` = **1 year** |
| `/i/klasik-putih` | Render penuh (sebelumnya selalu 404) |
| Tambah tamu | `guests.slug` = `budi-santoso` |
| `/i/klasik-putih/budi-santoso` | Nama tamu ter-inject, batas kehadiran ikut `guest_count` |
| RSVP hadir | `rsvp_status` = CONFIRMED, `analytics_events` RSVP=1 VIEW=2 |
| `/admin/tebakan-ngawur` dan `/admin` | 404 keduanya |
| Entry benar tanpa sesi | 307 → `/sign-in` |
| Cookie sesi palsu ke `/api/user` | **200** (sebelum perbaikan: 500) |

## Bug yang hanya muncul saat app dijalankan

`publicUrlFrom()` di `middleware.ts` mengosongkan port setiap kali `x-forwarded-host` hadir —
dan Next dev server memang mengirimnya berisi hostname telanjang. Akibatnya setiap pengunjung
anonim yang membuka route terlindungi dialihkan ke `http://localhost/sign-in`, port 80, yang
mati. Pintu masuk aplikasi tidak berfungsi sama sekali di lokal.

Tidak terlihat dari membaca kode, dan tidak akan pernah terlihat oleh siapa pun yang menguji
sambil sudah login. Ini contoh persis kenapa hard rule #1 ada. Detail dan perbaikannya: A10 di
`docs/AUDIT-2026-07-27.md`.

## Yang masih belum diverifikasi

Upload media dan avatar belum diuji end-to-end — `saveAvatar()` dan route `/media` sudah
compile dan sudah dibaca ulang, tetapi belum pernah dilewati file sungguhan di sesi ini.

## OPEN ITEMS — jangan ditebak

Sebelas temuan yang belum diperbaiki ada di `docs/AUDIT-2026-07-27.md` bagian B, dengan
severity dan skenario serangannya. Yang paling mendesak:

1. **B7 — storage lokal tidak akan bertahan di produksi.** Ini memblokir deployment ke platform
   serverless manapun dan harus diputuskan sebelum memilih hosting, bukan sesudah.
2. **B1 — tidak ada rate limit di sign-in.** Satu-satunya lubang yang bisa dieksploitasi jarak
   jauh yang tersisa.
3. **B3/B2 — hot path publik.** `await trackInvitationView()` memblokir render dan buku tamu
   di-query tanpa batas, tepat di halaman yang menerima spike ratusan tamu sekaligus.

Masih terbuka dari sebelumnya: nomor pengirim WhatsApp, definisi kuota revisi, konflik harga
Rp0 vs Rp149rb/Rp299rb, dan `/dashboard/event-blueprint` yang masih buntu di `localStorage`.

## Menjalankan

```bash
pnpm install
cp .env.example .env      # isi AUTH_SECRET, POSTGRES_URL, ADMIN_ENTRY_PATH
pnpm db:migrate
pnpm db:seed:templates    # WAJIB — katalog kosong = tidak ada undangan yang bisa dibuat
pnpm dev
```
