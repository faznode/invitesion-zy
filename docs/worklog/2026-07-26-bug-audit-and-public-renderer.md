<!-- SUMMARY (first 7 lines — greppable) -->
# 2026-07-26 — Bug audit, invitation creation, public renderer
> WHAT: Audit bug admin+customer, bikin jalur create invitation, bangun renderer publik /i/.
> STATUS: DONE (2 keputusan produk masih terbuka)
> OWNER: Operator
> DEPS: docs/specs/REBUILD-HANDOFF-A-Z.md, docs/PROJECT_OVERVIEW.md, docs/systems/guest-management.md
> GREP: bug, audit, renderer, /i/, guest slug, metrics, upload, locale, pricing
> UPDATED: 2026-07-26

## Kenapa sesi ini ada

Permintaan: perbaiki semua bug di panel admin dan customer, plus audit UI/UX. Semua perubahan
diverifikasi dengan menjalankan app-nya (hard rule #1 di `AGENTS.md`), bukan hanya typecheck.

## Temuan paling penting

**Tidak ada jalur pembuatan undangan sama sekali.** `insert(invitations)` tidak ada di seluruh
codebase. Katalog tema kosong, tombolnya tanpa handler, dan `/dashboard/event-blueprint` hanya
menulis ke `localStorage`. Akibatnya database selamanya kosong dan seluruh fitur turunan
(tamu, RSVP, planner, analytics) tidak pernah punya data.

**Renderer publik `/i/` belum pernah dibuat**, sehingga setiap tautan WhatsApp menuju 404.

**URL unik per tamu putus di last mile.** Backend sudah membuat `guests.slug` dengan
anti-collision yang benar, tetapi `waUrl()` membangun `/i/${slug}` tanpa guest slug. Semua tamu
menerima tautan identik — pembeda utama produk hilang.

## Yang diperbaiki

| Area | Masalah | Perbaikan |
|---|---|---|
| Create invitation | Tidak ada sama sekali | `lib/invitation/create.ts` + action katalog tema + `pnpm db:seed:templates` |
| Public renderer | Route tidak ada | `app/i/[slug]/` + `app/i/[slug]/[guestSlug]/` + `components/invitation/public-renderer.tsx` |
| Guest URL | Guest slug hilang, domain produksi di-hardcode | `lib/invitation/public-url.ts` |
| Dashboard admin | Growth `12.5/8.2/4.1/2.4%` dan komposisi `35/27/38%` di-hardcode | Query month-over-month nyata; tampilkan "belum ada pembanding" bila tak ada baseline |
| Pesanan menunggu | Memakai `.length` dari query ber-`limit(4)` | Query `count(*)` terpisah |
| Upload avatar | Menulis ke `public/`, 404 di produksi setelah `next start` | `saveAvatar()` → `UPLOAD_ROOT` + route `/media` |
| `UPLOAD_ROOT` | Nilai relatif membuat semua media 400 | Di-resolve absolut |
| Open tracking | Tiap re-render dihitung; 5 kunjungan → 7 open | Dedupe 30 menit |
| Admin customers | Menampilkan akun ADMIN juga | Filter `role = 'CUSTOMER'` |
| Katalog tema | Tombol mati, empty state salah | Form server action; bedakan katalog kosong vs semua terpakai |
| Locale | Marketing hardcode ID, app auto-detect | `app/marketing-copy.ts`; landing + pricing ikut locale |
| Lain-lain | `encType` pada form server action, ternary mati di admin layout, class `bold` invalid, guard `assertAuthorizedAdmin` hilang di 2 halaman, `void` statements | Dibersihkan |

## Aturan akses renderer (terverifikasi)

- `DRAFT` → 404, tidak publik.
- Guest slug tidak dikenal → 404.
- Lewat `expiresAt` → read-only: konten tetap tampil, RSVP dan buku tamu ditutup, data tamu disimpan.
- `/i/:slug` tanpa guest slug → tampil penuh tetapi tanpa form RSVP; identitas RSVP hanya berasal
  dari tautan personal.
- Nama tamu di-inject dari tabel `guests`, tidak pernah masuk config.

## OPEN ITEMS — jangan ditebak

1. **Harga bertabrakan.** `/pricing` mengiklankan "Rp0 / GRATIS", katalog tema menagih
   Rp149.000 / Rp299.000, sementara keputusan terkunci menyebut one-time payment per undangan.
   Literalnya sudah dipusatkan di `lib/pricing.ts` — ubah di satu tempat itu, jangan disebar lagi
   ke komponen.
2. **`/dashboard/event-blueprint` masih buntu.** Sekarang ada dua jalur membuat event: katalog tema
   (berfungsi) dan blueprint (localStorage saja). Sambungkan ke `createInvitation` atau hapus;
   membiarkan keduanya akan divergen.

Masih terbuka dari sebelumnya: keputusan nomor pengirim WhatsApp (nomor platform tunggal vs
customer connect sendiri), yang memblokir tabel `wa_devices`.

## Catatan UI/UX

- Empty state harus membedakan "belum ada" dan "sudah habis" — pola ini sempat salah di katalog.
- Sign-up hanya meminta email + password, tetapi form profil mewajibkan nama, sehingga user baru
  langsung menemui error validasi.
- Beberapa page menaruh seluruh JSX dalam satu baris 400+ karakter. Ini yang menyembunyikan bug
  `encType`; halaman yang disentuh sesi ini sudah dirapikan.
- Dua sistem warna berjalan bersamaan: `orange-600` di sebagian besar panel, `#e80053` di halaman
  undangan dan blueprint. Perlu diputuskan satu.
- Header mega-menu (~240 string) belum dilokalisasi; isinya sebagian besar taksonomi produk
  berbahasa Inggris yang memang disengaja.

## Menjalankan setelah pindah mesin

```bash
pnpm install
pnpm db:migrate
pnpm db:seed:templates   # WAJIB — katalog kosong = tidak ada undangan yang bisa dibuat
pnpm dev
```

Buat `.env` dari `.env.example`. Yang wajib diisi: `POSTGRES_URL`, `AUTH_SECRET`,
`ADMIN_ENTRY_PATH`, `NEXT_PUBLIC_APP_URL`. Abaikan instruksi Stripe di `README.md` — tidak ada
satu pun `STRIPE_*` yang dibaca kode lagi, dan `pnpm db:setup` akan memaksa meminta Stripe CLI
serta Docker yang tidak dibutuhkan.

Admin dibuat lewat `pnpm db:seed` dengan `ADMIN_SEED_EMAIL` dan `ADMIN_SEED_PASSWORD` dari
environment; jangan menuliskan kredensial ke repo.
