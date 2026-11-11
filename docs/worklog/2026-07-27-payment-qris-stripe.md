<!-- SUMMARY (first 7 lines — greppable) -->
# 2026-07-27 (3) — Pembayaran: QRIS lokal + Stripe internasional
> WHAT: Ganti keputusan Midtrans, implementasi dua rail, settlement idempotent, gate bayar.
> STATUS: DONE (8 item terbuka di AUDIT-2026-07-27.md bagian B)
> OWNER: Operator + Architect
> DEPS: docs/systems/payment.md, PROJECT_OVERVIEW.md #1, DATABASE_SCHEMA.md
> GREP: payment, qris, stripe, webhook, idempotent, currency, migration, csp, entitlement
> UPDATED: 2026-07-27

## Kenapa sesi ini ada

Keputusan produk berubah: **Midtrans dibatalkan**. Pembayaran lokal lewat QRIS, internasional
lewat Stripe. Plus permintaan menyelesaikan semua yang belum.

Ini mengubah keputusan terkunci #1 dan bentuk tabel `orders`, jadi `PROJECT_OVERVIEW.md`,
`DATABASE_SCHEMA.md`, `docs/systems/payment.md`, dan `AGENTS.md` diperbarui di sesi yang sama.

## Hal teknis yang harus disampaikan lebih dulu

**QRIS adalah standar, bukan penyedia pembayaran.** Menerbitkan QR cukup butuh string merchant
sendiri; menerima callback settlement otomatis butuh **acquirer** (Xendit, DOKU, Flip, Midtrans,
bank). Tidak ada webhook "dari QRIS".

Karena memilih acquirer adalah keputusan komersial, rail-nya ditulis terhadap interface
`QrisAcquirer` dengan satu driver yang jalan hari ini: ambil QRIS statis merchant, suntikkan
nominal persis, hitung ulang CRC. Hasilnya QR dinamis yang sah — customer tidak bisa salah ketik
nominal — dan settlement dikonfirmasi admin di panel Pesanan.

Batasannya ditulis di kode, bukan disembunyikan: konfirmasi manual berarti aktivasi berjalan
secepat operator, dan tidak ada bukti kriptografis pembayaran.

## Yang dibangun

| Bagian | Isi |
|---|---|
| `lib/payment/money.ts` | Minor units, eksponen per-mata-uang, konversi Stripe. Murni |
| `lib/payment/types.ts` | Interface provider + pemilihan rail dari mata uang |
| `lib/payment/qris-payload.ts` | EMVCo TLV, CRC-16/CCITT-FALSE, injeksi nominal. Murni |
| `lib/payment/qris-provider.ts` | Rail QRIS + `QrisAcquirer` + driver manual |
| `lib/payment/stripe-signature.ts` | Verifikasi webhook Stripe. Murni |
| `lib/payment/stripe-provider.ts` | Checkout Session via REST, tanpa SDK |
| `lib/payment/service.ts` | Order, settlement idempotent, aktivasi undangan |
| `lib/payment/registry.ts` | Wiring; salah konfigurasi gagal keras dengan nama variabelnya |
| `app/api/payments/[rail]/webhook` | Satu handler, dua rail |
| `checkout/` + `orders/` | Halaman bayar customer + konfirmasi manual admin |

Migrasi 0004 (hapus `midtrans_order_id`) dan 0005 (tambah `rail`, `currency`, `reference`,
`provider_payment_id`, `paid_at`, `expires_at`, dan tabel `payment_events`).

## Keputusan yang perlu dicatat

- **Dua SDK tidak dipakai.** Stripe dan SigV4 sama-sama disign sendiri. Alasannya sama: yang
  dibutuhkan hanya satu-dua endpoint, dan imbalannya jalur signature jadi fungsi murni yang
  **diuji terhadap vektor referensi**, bukan kotak hitam. CRC QRIS dicocokkan dengan vektor
  standar `29B1`.
- **Rail ditentukan mata uang, bukan geolokasi IP.** Dengan begitu harga yang ditampilkan dan
  cara menagihnya mustahil berbeda — satu sinyal (locale) menggerakkan keduanya.
- **Idempotency dua lapis.** `payment_events` UNIQUE(rail, event_id) menahan retry *delivery*
  yang sama; status order `FOR UPDATE` di dalam transaksi menahan dua event *berbeda* berlomba.
  Satu lapis saja tidak cukup, dan keduanya diverifikasi terhadap database sungguhan.
- **Nominal selalu diperiksa.** Webhook terautentikasi hanya membuktikan siapa pengirimnya.
- **CSP dikirim report-only dulu.** Policy enforcing yang salah memblokir skrip sah akan merusak
  checkout untuk customer nyata; checkout rusak lebih buruk daripada header yang belum teruji.

## Bug yang ditemukan saat menulisnya

**Stripe menghitung IDR dalam perseratus.** Kita memegang rupiah utuh. Mengirim `149000` sebagai
IDR ke Stripe akan menagih **Rp1.490** — kurang seratus kali. Dipusatkan di `money.ts` dan diuji
dua arah, termasuk penolakan nominal yang bukan rupiah utuh (dibulatkan = menerima kekurangan
bayar diam-diam).

**Publish gratis padahal modelnya bayar-dulu.** Inkonsistensi yang gw perkenalkan sendiri di
putaran pertama. Gate `NotPaidError` ditambahkan di **domain**, bukan hanya di tombol — server
action adalah entry point tersendiri. Diverifikasi dengan memanggil `publishInvitation` langsung
pada undangan yang belum dibayar: ditolak, status tetap DRAFT.

**Harga USD diformat sebagai IDR.** Katalog memakai `Intl.NumberFormat('en-US', {currency:'IDR'})`,
jadi pengunjung berbahasa Inggris melihat angka rupiah dengan format Amerika. Sekarang mengikuti
`currencyForLocale`.

## Verifikasi

```
pnpm typecheck   → exit 0
pnpm test        → 56 pass, 0 fail
pnpm build       → Compiled successfully, 131/131 static pages
pnpm verify:payment → 10/10 pass terhadap PostgreSQL sungguhan
```

`verify:payment` membuktikan yang tidak bisa dibuktikan unit test:

| Cek | Hasil |
|---|---|
| Settlement mengaktifkan undangan | PASS, PUBLISHED, jendela 12 bulan |
| Delivery yang sama di-retry | PASS, no-op, satu baris event |
| Event berbeda pada order lunas | PASS, `already-final` |
| Underpayment Rp1.000 untuk order Rp149.000 | PASS, ditolak, order tetap PENDING |
| Publish langsung tanpa bayar | PASS, `NotPaidError`, tetap DRAFT |

Runtime lewat browser: header CSP nonce per-request terpasang, webhook rail tak dikenal 404,
webhook Stripe tanpa signature tidak pernah 200, katalog menampilkan USD pada locale English,
dan kartu undangan berubah dari "Publish" (dengan alasan) → "Activate & publish" begitu kontennya
lengkap.

## Yang tidak bisa diverifikasi di sesi ini

- **`.env` diproteksi deny rule**, jadi `QRIS_STATIC_PAYLOAD` tidak bisa gw tulis. Render QR
  sungguhan belum pernah tampil. Dua baris yang perlu ditambahkan ada di `.env.example`.
- **Stripe belum diuji terhadap akun sungguhan** — signature terbukti secara unit, tetapi belum
  ada Checkout Session nyata.
- **Acquirer QRIS belum dipilih** (blokir komersial).
- **Auto-create akun dari pembayaran belum ada**; order selalu milik user yang sudah login.

## Temuan baru yang dicatat, bukan diperbaiki

`TimeoutNegativeWarning` — sempat gw simpulkan "tidak tereproduksi" setelah dev server bersih
dengan `--trace-warnings` dan 13 request tidak memunculkannya. **Itu salah**: set route-nya
terlalu sempit. Warning-nya memang muncul pada server yang berjalan lama dengan trafik
dashboard/admin terautentikasi, dan sudah dikoreksi di B3. Tetap tidak di-root-cause; pengejaran
dihentikan karena dev-only dan biayanya melebihi nilainya sekarang.

Run yang sama memunculkan: **konvensi `middleware` sudah deprecated di Next 15.6** — pindah ke
`proxy.ts` sebelum menaikkan versi Next lagi, bukan sesudahnya.
