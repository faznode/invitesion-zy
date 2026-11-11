<!-- SUMMARY (first 7 lines — greppable) -->
# auth.md — Autentikasi (Clerk) & identitas lokal
> WHAT: Clerk pegang kredensial/sesi; tabel users lokal tetap identitas domain.
> STATUS: LIVE (implemented; butuh key Clerk untuk jalan)
> OWNER: Operator
> DEPS: lib/auth/clerk-user.ts, lib/auth/admin-access.ts, DATABASE_SCHEMA.md
> GREP: auth, clerk, session, login, signup, admin, role, jit, provisioning, team, co-host, usher, penerima tamu, invitation_members, FLAG_TEAM_ACCESS, inv_join
> UPDATED: 2026-11-09 (s36: pihak keluarga kado I-04 / D-059 dan buku ucapan PDF I-22 / D-060, keduanya khusus pemilik; s35: catatan meja / suvenir / kado khusus pemilik, G-045 / D-058; tim undangan per undangan, co-host & penerima tamu, G-044 / D-057; s21: B-015, ClerkProvider hanya di grup rute yang login)

> **Keputusan 2026-07-27 (whyme):** auth password buatan sendiri diganti **Clerk**.
> Dokumen ini menggantikan status "nyusul" di `AGENTS.md`.

## Kenapa pindah

Bukan karena tampilan — walaupun itu yang memulai diskusinya. Yang ditemukan saat mengaudit auth
lama jauh lebih serius:

- **tidak ada jalur reset password sama sekali** → customer yang lupa password terkunci permanen;
- tidak ada verifikasi email;
- tidak ada login sosial;
- **tidak ada infrastruktur email apa pun**, jadi reset tidak bisa dibangun tanpa menambah
  provider email lebih dulu.

Membangun sendiri berarti: provider email + dua flow token berjangka + MFA, dengan hasil lebih
sedikit. Clerk menutup semuanya sekaligus.

## Pembagian tanggung jawab

| Milik Clerk | Milik kita |
|---|---|
| Kredensial, sesi, cookie | Identitas domain (`users.id` integer) |
| Reset password, verifikasi email | **Role / hak akses** |
| Login sosial, MFA, bot protection | Entry path admin privat + email allowlist |
| Daftar sesi aktif & revoke | Semua relasi: invitations, orders, guests |

**Role sengaja tetap lokal.** Admin diberikan dengan `role = 'ADMIN'` pada baris database, bukan
di dashboard Clerk. Artinya instance Clerk yang salah konfigurasi atau dikompromikan **tidak bisa
mencetak administrator**, dan entry path privat tetap berlaku di atasnya.

## Satu jembatan, bukan tersebar

`lib/auth/clerk-user.ts` adalah **satu-satunya** file yang tahu Clerk ada.

`invitations`, `orders`, `guests`, dan lainnya menunjuk `users.id` sebagai integer. Menulis ulang
lima foreign key supaya membawa string `user_xxx` adalah migrasi besar yang dibeli tanpa imbalan.
Jadi akun Clerk dipetakan ke baris lokal lewat satu kolom `clerk_user_id`, dan `getUser()`
**tanda tangannya tidak berubah** — itu sebabnya migrasi ini menyentuh 5 file, bukan 39 file yang
memanggilnya.

## JIT provisioning, bukan webhook

Baris lokal dibuat pada request pertama yang membutuhkannya, bukan lewat webhook `user.created`.

Alasannya: webhook bisa tiba **setelah** request pertama user. Itu berarti ada jendela di mana
customer sudah login tetapi belum punya baris lokal, dan setiap pemeriksaan ownership gagal.
Melakukannya pada request yang membutuhkannya membuat race itu mustahil.

## Adopsi akun lama (penting saat migrasi)

`provision()` menangani dua kasus, dan yang kedua yang krusial:

1. customer betulan baru → insert;
2. akun yang sudah ada dari era password, **dicocokkan lewat email** → diadopsi dengan menuliskan
   `clerk_user_id` ke baris yang sudah ada.

Tanpa nomor 2, setiap customer lama akan berhasil login lalu menemukan dashboard kosong —
undangan mereka masih menempel di baris yang jadi orphan.

Konsekuensinya untuk akun lama: **daftar ulang di Clerk dengan email yang sama**, lalu baris
lokalnya otomatis diadopsi beserta seluruh undangan dan ordernya.

## Yang dihapus

`lib/auth/session.ts`, `lib/auth/middleware.ts`, `app/(login)/actions.ts`,
`app/(login)/login.tsx`, `lib/auth/rate-limit*.ts` beserta testnya, dan `lib/db/setup.ts`.

`AUTH_SECRET` juga obsolete — dulu menandatangani session JWT lokal. Accessor-nya dibuang, bukan
dibiarkan: secret yang divalidasi tetapi tidak melindungi apa pun menyiratkan proteksi yang tidak
ada, dan pembaca berikutnya akan wajar mengira merotasinya berarti sesuatu.

**Rate limiter buatan sendiri dihapus** karena sign-in bukan milik kita lagi; Clerk punya rate
limiting dan bot protection sendiri di endpoint auth-nya. Menyimpan kode mati beserta testnya akan
menyiratkan proteksi yang tidak terpasang.

## `pnpm db:seed` berubah arti

Dulu membuat user dengan password hash. Sekarang **menyiapkan baris identitas lokal** beserta
role-nya — tanpa kredensial apa pun, karena kredensial milik Clerk.

```bash
ADMIN_SEED_EMAIL=admin@invitesion.com \
CUSTOMER_SEED_EMAIL=user@invitesion.com \
pnpm db:seed
```

Baris hasil seed **inert**: tanpa `password_hash`, tanpa `clerk_user_id`. Tidak ada yang bisa
mengautentikasi sebagai baris itu karena tidak ada yang bisa diautentikasi.

Begitu seseorang sign-up di Clerk dengan email yang sama, `provision()` mengadopsi barisnya lewat
email — jadi akun admin **sudah** admin sejak login pertama. Ini menghilangkan langkah "promote"
terpisah, dan menghilangkan jendela waktu di mana satu-satunya akun admin masih berstatus customer.

Idempoten: dijalankan dua kali akan mempromosikan, bukan menduplikasi.

> Yang **tidak** dilakukan script ini: membuat login. Sign-up harus lewat `/sign-up` oleh
> manusia, karena Clerk yang memegang password.

## Tampilan

Clerk merender formnya; appearance dan copy diberikan sekali di `ClerkProvider` (`components/auth/auth-provider.tsx`,
isi dari `lib/auth/clerk-appearance.ts`), jadi form hosted tidak bisa melenceng dari sisa produk.

**B-015 (s21):** provider itu hanya membungkus grup rute `(login)`, `(customer)` dan `(admin)` lewat layout grupnya,
bukan root layout. Sebelumnya setiap halaman tamu `/i/*` ikut menyerialkan appearance + kamus lokalisasi (≈ 67 KB
dari ≈ 97 KB payload RSC) yang di-parse ulang SSR di setiap kunjungan. `auth()` / `currentUser()` sisi server
(`@clerk/nextjs/server`, dipakai `/preview` lewat `getUser`) tidak butuh provider ini. Import komponen klien Clerk di
luar tiga grup itu ditolak oleh `tests/b015-clerk-scope.test.ts`. Belum diuji dengan kunci Clerk asli (P-INV-010).

`routing="hash"` menahan setiap langkah — reset password, kode email, MFA — tetap di halaman kita
yang sudah bergaya, bukan memantul ke domain Clerk.

Bahasa mengikuti locale: Indonesia default (`@clerk/localizations` `idID`), English kalau locale
ter-resolve English.

**Catatan duplikasi yang disengaja:** `variables` Clerk tidak bisa membaca CSS custom property,
jadi warna brand ditulis literal di `clerk-appearance.ts`. Kalau skala `brand-*` berubah, ubah di
situ juga. Itu harga dari renderer pihak ketiga, dan lebih baik dinamai daripada disembunyikan.

## Tim undangan: co-host & penerima tamu (G-044, D-057; s35)

Peran akun tetap dua (`CUSTOMER`, `ADMIN`) di tabel `users`. Di atasnya, pemilik undangan bisa memberi **hak akses per
undangan** (`invitation_members`, migrasi 0023) lewat tautan sekali pakai, di balik `FLAG_TEAM_ACCESS` (default off):

| Kemampuan | Pemilik | Co-host | Penerima tamu |
|---|---|---|---|
| Meja check-in (pindai, cari nama) | ya | ya | ya |
| Daftar tamu, impor, override RSVP, pendaftaran | ya | ya | tidak |
| Moderasi & balas ucapan | ya | ya | tidak |
| Statistik & ekspor tamu | ya | ya | tidak |
| Isi, tema, pengaturan, tim, checkout, publikasi | ya | tidak | tidak |
| Meja, suvenir & kado + ekspornya (G-045, D-058; `manage`), termasuk pihak keluarga kado (I-04, D-059) | ya | tidak | tidak |
| Buku ucapan PDF (I-22, D-060; `manage`): co-host memoderasi ucapan tetapi tidak mengekspornya | ya | tidak | tidak |

- **Satu penjaga di setiap pintu.** `accessFor(userId, invitationId, capability)` (`lib/invitation/members-db.ts`) memutuskan
  dari undangan tersimpan dan akun yang login: pemilik, atau hak akses hidup (belum dicabut, dipegang akun pelanggan yang
  masih ada) yang perannya memegang kemampuan itu, dan hanya selama flag on. Setiap halaman, aksi dan rute yang bisa
  melayani anggota memanggilnya lebih dulu dan menolak administrator; kedua penulis memeriksa hak akses lagi di transaksinya.
- **Administrator tidak bisa jadi anggota.** Tautan bergabung menolak administrator, dan hak akses yang dipegang akun yang
  kemudian dijadikan administrator (atau dihapus) tidak berlaku.
- **Bergabung tanpa login.** Rahasia tautan disimpan di cookie `inv_join` (HttpOnly, SameSite=Lax, `Path=/gabung`, satu jam,
  Secure lewat HTTPS); Clerk mengembalikan pengguna ke `/gabung/terima`, yang URL-nya tidak membawa rahasia.
- **Belum diverifikasi dengan Clerk sungguhan:** DA-01 butir 8 (NOT RUN). Bukti s35 memakai sesi tiruan (E-075).

## Risiko yang diterima

- **Vendor di jalur kritis.** Clerk down = customer tidak bisa masuk dashboard. Halaman undangan
  publik `/i/...` tidak terpengaruh karena tidak butuh auth — itu memang pemisahan yang benar.
- **Biaya per-MAU.**
- **UI Clerk default bahasa Inggris**; sudah dilokalkan, tetapi string baru dari Clerk bisa muncul
  dalam bahasa Inggris sampai localization-nya menyusul.

## Belum diverifikasi

Implementasi lengkap dan build hijau dengan key placeholder, tetapi **belum pernah dijalankan
terhadap instance Clerk sungguhan**. Yang harus dijalankan pertama: sign-up → dashboard →
cek baris `users` punya `clerk_user_id`, lalu adopsi akun lama lewat email yang sama.
