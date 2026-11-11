<!-- SUMMARY (first 7 lines — greppable) -->
# 2026-07-27 (4) — Auth pindah ke Clerk, identitas tetap lokal
> WHAT: Clerk pegang kredensial/sesi; users lokal tetap identitas domain lewat clerk_user_id.
> STATUS: DONE (belum diuji terhadap instance Clerk sungguhan — butuh key)
> OWNER: Operator + Architect
> DEPS: docs/systems/auth.md, DATABASE_SCHEMA.md, AGENTS.md
> GREP: clerk, auth, signin, signup, reset password, jit, provisioning, role, admin
> UPDATED: 2026-07-27

## Kenapa sesi ini ada

Permintaan: pakai Clerk untuk login/signup supaya menunya tidak terlihat basic.

Keluhannya soal tampilan. Yang ditemukan saat memeriksa auth lama jauh lebih serius, dan itu yang
akhirnya membenarkan pindah:

- **tidak ada jalur reset password sama sekali** — customer yang lupa password terkunci permanen;
- tidak ada verifikasi email, tidak ada login sosial, tidak ada MFA;
- **tidak ada infrastruktur email apa pun**, jadi reset tidak bisa dibangun tanpa menambah
  provider email lebih dulu.

Membangun sendiri berarti provider email + dua flow token berjangka + MFA, dengan hasil lebih
sedikit. Disampaikan sebagai tiga opsi; whyme memilih Clerk + users lokal.

## Keputusan arsitektur yang menentukan ukuran kerjaan

**Clerk tidak memiliki identitas, hanya kredensial.**

`invitations`, `orders`, `guests` dan lainnya menunjuk `users.id` sebagai integer — lima foreign
key. Menulis ulang semuanya supaya membawa string `user_xxx` adalah migrasi besar tanpa imbalan.

Jadi akun Clerk dipetakan ke baris lokal lewat satu kolom `clerk_user_id`, dan **`getUser()`
tanda tangannya tidak berubah**. Hasilnya: migrasi menyentuh 5 file, bukan 39 file yang memanggil
`getUser()`. Itu satu keputusan yang menentukan apakah ini kerjaan setengah hari atau seminggu.

**Role tetap lokal.** Admin diberikan dengan `role = 'ADMIN'` pada baris database, bukan di
dashboard Clerk — jadi instance Clerk yang salah konfigurasi atau dikompromikan tidak bisa
mencetak administrator, dan entry path privat tetap berlaku di atasnya.

**JIT provisioning, bukan webhook `user.created`.** Webhook bisa tiba setelah request pertama
user, yang berarti ada jendela di mana customer sudah login tetapi belum punya baris lokal dan
setiap pemeriksaan ownership gagal. Melakukannya pada request yang membutuhkannya membuat race itu
mustahil.

**Adopsi akun lama lewat email.** `provision()` mengklaim baris yang sudah ada dan menuliskan
`clerk_user_id` padanya. Tanpa ini setiap customer era-password akan login sukses lalu menemukan
dashboard kosong — undangan mereka menempel di baris orphan.

## Yang dihapus, dan kenapa penting

`lib/auth/session.ts`, `lib/auth/middleware.ts`, `app/(login)/actions.ts`, `login.tsx`,
`lib/auth/rate-limit*.ts` + testnya, dan `lib/db/setup.ts`.

**Rate limiter buatan sendiri dihapus** beserta 7 testnya. Sign-in bukan milik kita lagi dan Clerk
punya rate limiting + bot protection sendiri. Menyimpan kode mati beserta testnya akan menyiratkan
proteksi yang tidak terpasang — lebih buruk daripada tidak punya.

**`AUTH_SECRET` obsolete.** Accessor-nya dibuang, bukan dibiarkan: secret yang divalidasi tetapi
tidak melindungi apa pun menyiratkan proteksi yang tidak ada.

## Regresi yang gw temukan dan cegah sendiri

Root layout punya `SWRConfig fallback: { '/api/user': getUser() }` — sisa template saas-starter
yang **nol konsumen**. Tidak berbahaya selagi sesi hanyalah baca cookie lokal. Menjadi berbahaya
begitu resolusi identitas berarti lookup sesi Clerk **plus** query database, pada setiap render
halaman termasuk `/i/:slug/:guestSlug` — halaman publik yang menerima blast WhatsApp ke ratusan
tamu sekaligus.

Dihapus seluruhnya, bukan dioptimalkan. `swr` juga dilepas karena tidak ada pemakai lain.

## Hal lain yang ikut terungkap

- **Peer React.** Clerk minta React ≥19.1.4, project di 19.1.0. Dinaikkan patch (19.1.4) dan build
  diverifikasi ulang, bukan diabaikan sebagai warning.
- **`pnpm db:seed` berubah arti** dari "buat admin dengan password" menjadi "promosikan akun yang
  sudah ada", karena akun sekarang lahir di Clerk.
- **Halaman security admin** dulu hand-roll ganti-password dan hapus-akun. Sekarang `UserProfile`
  Clerk, yang membawa hal yang belum pernah kita punya: verifikasi email sebelum perubahan
  berlaku, enrolmen MFA, dan daftar sesi aktif yang bisa dicabut.

## Tampilan — keluhan aslinya

Sign-in lama adalah form telanjang di halaman kosong. Sekarang `AuthShell`: dua panel, brand di
kiri bersama form, dan panel naratif berisi tiga hal yang produk ini benar-benar lakukan di kanan
(`hidden lg:flex` — di ponsel itu akan mendorong form ke bawah lipatan).

Form Clerk-nya sendiri di-style lewat `clerk-appearance.ts` dan diberikan sekali di
`ClerkProvider`, jadi tidak bisa melenceng. `routing="hash"` menahan setiap langkah — reset
password, kode email, MFA — tetap di halaman kita, tidak memantul ke domain Clerk. Bahasa
Indonesia default via `@clerk/localizations`.

Duplikasi yang disengaja: `variables` Clerk tidak bisa membaca CSS custom property, jadi warna
brand ditulis literal di satu file. Kalau skala `brand-*` berubah, ubah di situ juga.

## Verifikasi

```
npx tsc --noEmit  → exit 0
pnpm test         → 49 pass, 0 fail  (56 − 7 test rate limiter yang dihapus)
pnpm build        → Compiled successfully, 131/131 static pages
```

Migrasi 0006: `clerk_user_id` unik, `password_hash` jadi nullable.

## Diverifikasi terhadap instance Clerk sungguhan

Key dipasang whyme di `.env`. Sengaja **tidak dibaca** — kepasangannya dibuktikan secara
fungsional: halaman sign-in memuat instance `vast-catfish-75.clerk.accounts.dev`, bukan placeholder
build.

| Batas | Hasil |
|---|---|
| `/`, `/pricing`, `/sign-in`, `/sign-up` | 200 |
| **`/i/:slug` dan `/i/:slug/:guestSlug`** | **200 tanpa auth** — tamu tidak pernah ketemu dinding login |
| `/dashboard*` tanpa sesi | 307 → `/sign-in`, **port `:3200` tetap utuh** (fix A10 masih berlaku di bawah middleware Clerk) |
| `/admin` dan entry salah | 404 |
| Webhook pembayaran | tidak kena auth Clerk (500 karena Stripe belum dikonfigurasi, bukan karena auth) |
| Error server | nol, selain Stripe-belum-dikonfigurasi dari tes sendiri |

Form-nya tampil dengan Apple/Facebook/Google + email, warna brand, panel naratif di kanan.

## Yang perlu diubah di dashboard Clerk

1. **Aktifkan "Name"** — sign-up sekarang tidak punya field nama. Login sosial memberi nama secara
   otomatis, email/password tidak, jadi tanpa toggle ini akun email/password lahir tanpa nama.
2. Nama aplikasi di Clerk **sudah benar**: "Invitesion". Sesi ini sempat merekomendasikan
   menggantinya ke "Vienne" — itu keliru, dan justru kebalikannya: brand produk yang diubah menjadi
   Invitesion (lihat worklog rebrand). Judul form ("Sign in to Invitesion") memang diambil dari
   dashboard Clerk, bukan dari kode.

Badge "Secured by Clerk" **tidak dihapus lewat CSS**. Aturan `footer: 'hidden'` sudah dicoba dan
tidak bekerja: penghapusan branding adalah fitur plan, bukan opsi styling, jadi meng-CSS-nya berarti
mengakali ketentuan plan mereka. Strip "Development mode" bukan styling juga — itu penanda instance
development dan hilang sendiri pada instance production.

## Belum diverifikasi — dan ini penting

**Alur sign-up sendiri belum dijalankan.** Membuat akun dan memasukkan password — termasuk password
Google — adalah hal yang tidak gw lakukan, jadi langkah itu milik whyme. Setelah itu gw bisa
memverifikasi sisanya.

Yang harus dijalankan:

1. sign-up → mendarat di `/dashboard`;
2. cek baris `users` punya `clerk_user_id` dan `name` terisi;
3. adopsi: daftar dengan email akun lama (`budi@example.com`) dan pastikan undangan lamanya ikut;
4. promosikan admin lalu buka entry path privat;
5. reset password — fitur yang seluruh migrasi ini dilakukan untuknya.

Akun lama di database lokal (`admin@vienne.local`, `budi@`, `dewi@`) punya `password_hash` tetapi
belum punya `clerk_user_id`. Mereka **tidak bisa login sampai** didaftarkan ulang di Clerk dengan
email yang sama, yang kemudian mengadopsi barisnya.
