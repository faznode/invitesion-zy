<!-- SUMMARY (first 7 lines — greppable) -->
# payment.md — Sistem Pembayaran (QRIS lokal + Stripe internasional)
> WHAT: Dua rail pembayaran, webhook idempotent, dan aktivasi undangan setelah bayar.
> STATUS: LIVE (implemented; acquirer QRIS belum dipilih). s26: entitlement tema di sisi server (B-041); s32: ganti tema dalam tier tanpa checkout (B-036); s38: settlement setelah undangan dihapus tidak mengaktifkannya (B-031, D-063); s39: B-039 netral-provider (D-064): penulis settlement Rust di balik `BACKEND_PAYMENT` (default `next`), outbox entitlement `payment_settled`, kunci idempotensi checkout (migrasi 0027); adapter PJP dan uang sungguhan EXT; s40: kuitansi G-050 selesai di sandbox (E-083, D-065): migrasi 0028, penerbitan oleh runner untuk kedua penulis, upgrade 0027 → 0028 berisi data, halaman pemilik diuji di browser, skema sebelum worker; s40: kupon G-053 selesai di sandbox (E-084, D-066): migrasi 0029, diskon dihitung server di bawah kunci baris kupon, kedua penulis tanpa perubahan, tutup order QRIS manual tanpa bayar, atribusi mitra (komisi EXT)
> OWNER: Operator
> DEPS: DATABASE_SCHEMA.md (orders, payments, payment_events, jobs), lib/payment/*, lib/invitation/theme-entitlement.ts, services/api/src/payment/, contracts/vectors/payment-settlement.json
> GREP: payment, qris, stripe, webhook, idempotent, signature, order, rail, currency, entitlement, palette, B-041, B-036, template_id, B-039, BACKEND_PAYMENT, settle, outbox, payment_settled, checkout_key, checkout_intent, idempotency key, D-064, receipts, kuitansi, receipt_counters, FLAG_RECEIPTS, G-050, D-065, coupons, kupon, order_coupons, list_amount, FLAG_COUPONS, closeUnpaid, afiliasi, G-053, D-066
> UPDATED: 2026-11-10

> **Perubahan keputusan (2026-07-27, whyme):** Midtrans **tidak dipakai**. Pembayaran lokal
> lewat **QRIS**, internasional lewat **Stripe**. Dokumen ini menggantikan seluruh rancangan
> Midtrans Snap sebelumnya. Kolom `orders.midtrans_order_id` sudah dihapus (migrasi 0004/0005).

## Prinsip inti

**Webhook = SOURCE OF TRUTH. BUKAN redirect browser.** Customer yang bayar lalu langsung menutup
tab tetap harus punya order lunas; customer yang cuma membuka URL sukses tidak boleh punya.
Halaman `?paid=1` tidak pernah dipakai sebagai bukti — status dibaca dari tabel `orders` kita
sendiri.

## Dua rail, dipilih oleh mata uang

| Rail | Untuk | Mata uang | Settlement |
|---|---|---|---|
| **QRIS** | Customer Indonesia | IDR | Tergantung acquirer (lihat di bawah) |
| **Stripe** | Internasional | USD | Webhook `checkout.session.*` |

Rail ditentukan dari **mata uang order**, bukan dari geolokasi IP. Alasannya: harga yang
ditampilkan dan cara menagihnya jadi mustahil berbeda. Mata uang ditentukan dari locale yang
sudah di-resolve, dan locale itu juga yang merender harga.

## QRIS bukan penyedia pembayaran

Ini bagian yang paling sering disalahpahami dan menentukan arsitektur file ini.

QRIS adalah **standar interoperabilitas**, bukan perusahaan pembayaran. Dua kemampuan yang
berbeda:

1. **Menerbitkan QR** — cukup butuh string QRIS merchant sendiri.
2. **Menerima callback settlement otomatis** — butuh **acquirer** (Xendit, DOKU, Flip, Midtrans,
   atau bank). Tidak ada webhook "dari QRIS".

Karena memilih acquirer adalah keputusan komersial, rail-nya ditulis terhadap interface
`QrisAcquirer`. Yang tersedia hari ini:

**`ManualQrisAcquirer`** — mengambil QRIS statis merchant, menyuntikkan nominal persis, dan
menghitung ulang CRC. Hasilnya QR dinamis yang sah: customer tidak bisa salah ketik nominal.
Settlement dikonfirmasi admin di panel Pesanan.

Batasannya dinyatakan di kode, bukan disembunyikan:
- konfirmasi manual → aktivasi berjalan secepat operator;
- tidak ada bukti kriptografis pembayaran, hanya penilaian operator terhadap mutasi rekening.

Keduanya bisa diterima pada volume kecil dan tidak bisa diterima pada skala. Begitu acquirer
dipilih: implementasikan adapternya, set `QRIS_ACQUIRER`, selesai — tidak ada bagian lain sistem
yang berubah.

## Idempotency — dua lapis, keduanya perlu

Provider melakukan retry pada setiap non-2xx, pada timeout, dan kadang tanpa alasan.

1. **`payment_events` UNIQUE(rail, event_id)** — *delivery* yang sama di-retry akan konflik dan
   dilewati. Ini yang menahan badai retry.
2. **Status order, dibaca ulang `FOR UPDATE` di dalam transaksi** — ini yang menahan dua event
   *berbeda* (misalnya webhook dan konfirmasi operator) berlomba melunasi order yang sama.

Semuanya dalam satu transaksi: mencatat event, memindahkan order, menulis baris payment, dan
mengaktifkan undangan. Aplikasi separuh jalan adalah satu-satunya hasil yang tidak punya
pemulihan aman — customer tertagih tanpa dapat apa pun.

## Nominal selalu diverifikasi

Webhook yang terautentikasi hanya membuktikan **siapa pengirimnya**, bukan bahwa isinya sesuai
dengan yang kita minta. `applySettlement` membandingkan nominal yang dilaporkan dengan nominal
order dan melempar `AmountMismatchError` kalau berbeda — order tetap `PENDING` dan butuh manusia.

## Status code menentukan retry

| Situasi | Kode | Alasan |
|---|---|---|
| Signature/timestamp gagal | **400** | Tidak akan pernah jadi valid; suruh berhenti |
| Referensi tidak dikenal | **400** | Retry tidak akan memunculkan order-nya |
| Nominal tidak cocok | **409** | Butuh manusia, jangan di-retry membabi buta |
| Duplikat / sudah final | **200** | Sudah beres |
| Event otentik yang tidak kita proses | **200** | Jangan di-retry selamanya |
| Rail salah konfigurasi / fault | **500** | Silakan retry setelah kita perbaiki |

## Verifikasi signature Stripe

Header `Stripe-Signature: t=<unix>,v1=<hex>`. Payload yang ditandatangani adalah
`${t}.${rawBody}`, HMAC-SHA256 dengan signing secret endpoint.

**Body mentah wajib.** Membaca `.json()` lalu men-serialize ulang mengubah whitespace dan urutan
key sehingga signature gagal — route handler membaca `await request.text()` dan baru mem-parse
setelah verifikasi.

Toleransi timestamp 300 detik menahan replay: tanpa itu, satu signature yang tertangkap tetap
sah selamanya.

Beberapa `v1` sekaligus didukung agar rotasi secret tidak memutus layanan.

## Aktivasi = yang dibeli customer

Publish adalah barangnya. `publishInvitation` menolak undangan tanpa order `PAID`
(`NotPaidError`), dan pengecekan itu ada di **domain**, bukan hanya di tombol — server action
adalah entry point tersendiri, mencapainya tidak butuh merender halaman yang menautkannya.

Publish ulang setelah unpublish tetap gratis: masa aktif sudah dibayar.

**Undangan yang dihapus (B-031, D-063, s38):** settlement yang tiba setelah pemilik menghapus undangan (konfirmasi
manual admin atau webhook yang terlambat, jalurnya sama: `applySettlement`) tetap mencatat uangnya (order `PAID`,
baris `payments`, event), tetapi `activateInvitation` hanya membaca baris yang `deleted_at IS NULL` di bawah kunci baris
yang juga diambil penghapusan, jadi draft yang dihapus (atau tombstone yang sudah di-purge) tidak pernah di-publish.
Setelah dipulihkan, draft kembali persis seperti semula dan `publishInvitation` menemukan order `PAID`-nya. Bukti:
`scripts/verify-retention.ts` bagian 4b, `tests/b031-retention.test.ts`.

## Entitlement tema saat menyimpan (B-041, s26; ganti tema B-036, s32)

Checkout menagih sesuai tier **tema yang dibeli** (`invitations.template_id`, id baris `templates` →
`templates.is_premium`), sedangkan tamu melihat `config.theme.paletteId`. Sejak B-035 (D-053) setiap penulisan
`config` setelah undangan dibuat lewat satu facade (`lib/invitation/content.ts`) ke salah satu penulis konten
(`content-next.ts` atau endpoint Rust), dan keduanya memeriksa setiap perubahan tema di bawah row lock dengan aturan
yang sama (`lib/invitation/theme-entitlement.ts`, vektor `contracts/vectors/content-rules.json`; D-042, D-054):

- **Tier undangan** = Premium jika tema yang dibeli Premium, atau sudah ada order `PAID` ber-tier Premium untuk
  undangan itu; selain itu Standard.
- **Palet Premium** = palet yang tidak dipakai satu pun tema katalog gratis. Palet fallback (`ivory`) selalu Standard,
  karena halaman tanpa palet pun merendernya. Saat ini: `blossom`, `gold-noir`, `midnight`, `orchid`. Palet Premium
  hanya untuk undangan bertier Premium; palet yang tidak terdaftar ditolak.
- **Ganti tema (B-036, D-054):** `theme.templateId` berisi **id katalog** (`templates.ts`, mis. 103), bukan id baris
  `templates`. Host boleh pindah ke tema katalog mana pun dalam tiernya tanpa bayar lagi: tema gratis selalu boleh,
  tema premium/signature hanya untuk tier Premium (`premium-template`); id yang tidak dikenal katalog ditolak
  (`unknown-template`). Ganti tema hanya mengubah config (id katalog dan paletnya); `invitations.template_id` **tidak
  pernah ditulis**, jadi checkout, publish (`hasPaidOrder(id, template_id)`) dan settlement tetap memakai tema yang
  dibeli, dan undangan yang sudah dibayar tetap terbayar. Naik tier menunggu upgrade di U6.
- Yang diperiksa hanya field yang **berubah**. Menyimpan bagian lain dari config lama tidak pernah gagal, dan
  menghapus palet atau tema tidak butuh entitlement.

PATCH `/api/invitations/{id}/detail` menjawab `403 THEME_NOT_ENTITLED` berisi path dan alasan saja, tanpa nilai yang
tersimpan. Penolakan tidak menulis apa pun: config dan riwayat versi tetap.

## Environment

```
QRIS_ACQUIRER=manual
QRIS_STATIC_PAYLOAD=<teks EMVCo mentah di balik QR merchant>
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BACKEND_PAYMENT=next     # B-039: next (default) | rust; rust butuh API_BASE_URL + INTERNAL_API_SECRET
```

Stripe menolak start tanpa `STRIPE_WEBHOOK_SECRET`: kita bisa menerima uang dan tidak pernah tahu.

Endpoint webhook: `POST /api/payments/{stripe|qris}/webhook`

## Verifikasi

- `tests/payment.test.ts` — nominal & pembulatan, TLV/CRC QRIS (dicocokkan dengan vektor standar
  `29B1`), signature Stripe termasuk replay dan rotasi secret.
- `npx tsx scripts/verify-payment.ts` — terhadap database sungguhan: aktivasi, retry no-op,
  double-settlement ditolak, underpayment ditolak.
- `tests/b041-theme-entitlement.test.ts`, `tests/b036-theme-switch.test.ts` dan
  `npx tsx scripts/verify-theme-entitlement.ts` (database sungguhan): undangan Standard yang sudah publish tidak bisa
  memakai palet atau tema Premium tanpa order; setelah order Premium `PAID` boleh; pindah ke tema Standard lain
  menyimpan id katalog dan paletnya, isi tetap, `template_id` tetap, tanpa order baru, dan `hasPaidOrder` tetap benar.
  Skrip database ini dijalankan di job database (`scripts/ci/database.sh`); kedua penulis diuji
  `scripts/verify-content-api.ts` di job rust.
- B-039 (s39): `tests/payment-settlement.test.ts` menjalankan 31 kasus `contracts/vectors/payment-settlement.json`
  (Rust: `services/api/tests/payment_vectors.rs`); `tests/b039-payment-writer.test.ts` mengunci fasad, urutan tulis
  dan kunci checkout; `services/api/tests/payment_database.rs` (database sungguhan).
  `npx tsx scripts/verify-checkout-key.ts` (job database): satu order per kunci, lima tap bersamaan, konflik intent,
  attempt tertutup, cakupan per customer. `npx tsx scripts/verify-payment-api.ts` (job rust, binary sungguhan): setiap
  skenario lewat kedua penulis dengan baris yang dibandingkan, replay kunci, jawaban hilang setelah commit, rollback
  antar-penulis, dan outbox lewat `invitesion-jobs`.

## Inventaris penulis domain pembayaran (U6 / B-039: inventaris s38, implementasi s39, D-064)

09 §8: webhook penulis otoritatif, id event unik, transisi bersyarat, entitlement lewat outbox di transaksi yang sama,
kunci idempotensi checkout, signature diverifikasi atas body asli.

| Yang ditulis | Penulis | Pemanggil |
|---|---|---|
| `orders` INSERT `PENDING` dengan `checkout_key` + `checkout_intent` (0027), lalu `provider_payment_id` / `expires_at` hanya selama masih `PENDING` | `createOrder` (`lib/payment/service.ts`): idempoten per (customer, undangan, kunci) lewat index unik parsial; rail dipanggil di luar transaksi | checkout action (pemilik, lewat `requireOwnedInvitation`, termasuk penjaga B-031); kunci dari form halaman |
| Settlement: `payment_events` INSERT (UNIQUE `rail, event_id`) + `order_id`; `orders` transisi `where status = 'PENDING'`; `payments` INSERT; aktivasi `invitations` (baris hidup saja, dikunci); baris outbox `payment_settled` di `jobs` | **Satu penulis per panggilan** lewat `settle` (`BACKEND_PAYMENT`, tanpa fallback): `applySettlement` (Next.js, default) atau `POST /v1/payments/settlements` (`services/api/src/payment/`); keputusan bersama `contracts/vectors/payment-settlement.json` | webhook `app/api/payments/[rail]/webhook/route.ts` (adapter rail memverifikasi signature atas body asli sebelum `settle`) dan `confirmManually` admin (event sintetis `manual:<ref>`, otorisasi admin tetap di action) |
| `jobs` `payment_settled`: selesai | `invitesion-jobs` (`services/api/src/payment/outbox.rs`): order harus `PAID` dengan pembayaran yang disebut payload; tidak menulis order, pembayaran atau undangan | cron / `--watch` |
| `invitations` `PUBLISHED` / `DRAFT` | `publishInvitation` / `unpublishInvitation` (`lib/invitation/publish.ts`), entitlement lewat `hasPaidOrder` | action dashboard |
| Entitlement (dibaca, tidak disimpan) | `hasPaidOrder`, `paidInvitationIds`, `lib/invitation/theme-entitlement.ts`; penulis konten Rust membaca order `PAID` | publish, daftar pemilik, kedua penulis konten |
| Disimpan saat purge (B-031) | `orders`, `payments`, `payment_events` dan baris `payment_settled` tetap menunjuk tombstone | `services/api/src/retention.rs` |

### Settlement (D-064)
- **Dua lapis idempotensi, keduanya di transaksi yang sama:** (1) `payment_events` UNIQUE `(rail, event_id)`: delivery
  ulang konflik dan selesai sebagai `duplicate`; (2) order dikunci `FOR UPDATE` dan dipindah hanya oleh
  `update … where status = 'PENDING'`: dua event berbeda (webhook dan konfirmasi admin) membayar sekali.
- **Keputusan** (sama di kedua bahasa, 31 kasus vektor): `duplicate`; `unknown_order` (webhook 400); `rail_mismatch`,
  `amount_unverifiable`, `amount_mismatch` (409, semuanya di-rollback termasuk baris event, jadi retry dinilai ulang);
  `already_final` (event disimpan, order tidak berubah); `closed` (FAILED / EXPIRED: transisi bersyarat, tanpa
  pembayaran, tanpa outbox); `paid` dengan aktivasi `activated`, `already_published` (jendela berjalan tetap),
  `theme_mismatch` (tema berubah selama charge: tidak dipublikasikan), `not_live` (dihapus atau purge: uang dicatat,
  undangan dan tombstone tidak disentuh) atau `no_invitation`.
- **Nominal otoritatif di server:** jumlah dan mata uang event harus sama dengan order; rail event harus rail order.
- **Rust (`BACKEND_PAYMENT=rust`):** Next.js memanggil dengan tanda tangan layanan dan `Idempotency-Key` per
  settlement (scope `payment:settlement`, dicatat bersama jawaban di transaksi settlement). Hasil tak diketahui
  (tak terjangkau, timeout, 5xx) dikirim ulang **sekali** dengan kunci yang sama (jawaban yang sudah commit di-replay);
  bila tetap tak diketahui: `SettlementUnconfirmedError`, webhook menjawab 500 agar provider retry (aman karena id
  event unik), tanpa fallback ke penulis Next.js.

### Outbox entitlement (D-064)
Setiap settlement `paid` menulis satu baris `jobs` `payment_settled` (dedupe `order:<id>`, 20 percobaan, payload
`{ orderId, paymentId, invitationId, templateId, activation }`) di transaksinya. Aktivasi tetap di transaksi itu,
di bawah kunci baris B-031, jadi outbox tidak pernah mempublikasikan apa pun: ia titik fan-out yang tahan-ulang untuk
efek setelah pembayaran (G-050 kuitansi berikutnya). Delivery ulang (lease habis, runner kedua): bacaan sama, tanpa
tulis. Undangan dihapus atau purge: delivery tetap selesai (order dan pembayaran disimpan). Worker gagal di tengah:
lease habis lalu diambil lagi; error database di-retry dengan backoff.

### Kunci checkout (D-064)
Halaman checkout merender UUID baru di form; `createOrder` mengikatnya ke intent yang dihitung server (SHA-256 dari
undangan, tema, tier, nominal, mata uang, rail). Submit dengan kunci yang sudah ada: intent lain → **conflict**
(`?error=changed`, tidak ada yang ditulis); `PAID` → `?paid=1`; `PENDING` → **resume** order dan referensi yang sama
(charge yang sama diminta lagi: Stripe dedup lewat `checkout:<reference>`, QRIS diturunkan dari order); FAILED /
EXPIRED → **closed** (`?error=closed`). Form tanpa kunci valid (halaman lama) mendapat kunci baru: diterima tanpa
perlindungan submit ganda. Stripe kini mengarahkan customer ke halaman Checkout-nya (https saja); QRIS tetap di halaman
checkout.

### Rollout dan rollback
- **Rollout (owner):** migrasi 0027 (aditif) → `invitesion-jobs` versi B-039 terjadwal → `BACKEND_PAYMENT=rust` di
  preview dengan beban, lalu produksi, 7 hari dalam SLO, baru penulis TypeScript dihapus (ADR-A2). Belum di-deploy.
- **Rollback:** `BACKEND_PAYMENT=next` kapan saja (kedua penulis menulis baris yang sama; diuji silang). Rollback
  kode ke rilis U5 aman di atas 0027 (diuji s39: kode U5 membaca pembayaran kedua penulis, membayar order berkunci dan
  tetap menulis order tanpa kunci). Dua langkah roll-forward setelah rollback kode: (1) runner lama menandai
  `payment_settled` sebagai "unknown job kind": `update jobs set attempts = 0, run_at = now() at time zone 'utc',
  last_error = null where kind = 'payment_settled' and done_at is null and last_error = 'unknown job kind'`; (2) order
  yang dibayar penulis U5 selama rollback tidak punya baris outbox: masukkan dengan `insert … select` dari `orders` +
  `payments` sejak waktu rollback, `on conflict (kind, dedupe_key) do nothing` (idempoten; teks lengkap di
  `services/api/README.md`).

**Masih EXT / belum:** adapter PJP sandbox (setelah pemilik memilih acquirer, kontrak EXT), Checkout Session Stripe
sungguhan, uang sungguhan, rollout `BACKEND_PAYMENT=rust`, uji checkout ber-Clerk sungguhan (DA-01 item 12).
Kupon G-053 dan kredit G-052 di bagian masing-masing.

## Kuitansi (G-050, s39, D-065)

- **Penulis tunggal:** `invitesion-jobs` saat mengantar baris outbox `payment_settled` sebuah order lunas
  (`services/api/src/payment/receipt.rs`). Next.js hanya membaca. Satu kuitansi per order (UNIQUE `order_id`,
  `payment_id`, `number`; migrasi 0028, aditif).
- **Isi = catatan pembayaran saja:** nomor, order, pembayaran, pemilik (`user_id` order), referensi, tier, nominal,
  mata uang, rail, id transaksi provider, waktu bayar (`orders.paid_at`, atau waktu baris pembayaran untuk baris lama)
  dan waktu terbit, disalin di transaksi penerbitan sehingga tidak berubah lagi. Tanpa nama, e-mail, judul undangan
  atau data tamu. Halaman kuitansi menyebut "Bukan faktur pajak": penerbitan keuangan sungguhan (faktur, identitas
  penjual resmi) EXT.
- **Penomoran monoton tanpa celah:** nomor = increment baris `receipt_counters` (`scope = 'receipt'`) yang terkunci
  sampai transaksi selesai, jadi urut commit. Delivery ulang (lease habis, runner kedua, permintaan pemilik) menemukan
  kuitansinya dulu dan tidak mengambil nomor; delivery bersamaan untuk order yang sama: insert kedua mengalah
  (`on conflict (order_id) do nothing`) dan seluruh transaksinya, termasuk increment, di-rollback. Dicetak `KW-000123`.
- **Pembayaran sebelumnya atas permintaan** (aturan backlog): order lunas tanpa baris outbox (sebelum B-039 atau
  dibayar penulis lama saat rollback) atau dengan baris yang sudah selesai sebelum kuitansi ada tampil "Minta
  kuitansi"; `requestReceipt` (`lib/payment/receipts.ts`) mengunci order milik pemilik itu sendiri yang `PAID` dengan
  pembayaran `PAID`, lalu menulis atau meng-arm ulang baris `payment_settled`-nya; runner menerbitkan pada pass
  berikutnya. Baris yang masih menunggu dibiarkan. Order pelanggan lain atau yang belum lunas: `not_found`.
- **Baca hanya pemilik:** `/dashboard/receipts` (daftar order lunas: terbit, sedang disiapkan, atau atas permintaan)
  dan `/dashboard/receipts/<nomor>` (bisa dicetak / disimpan PDF lewat dialog cetak). Akun lain, nomor yang tidak ada
  dan flag mati: 404 yang sama. Checkout yang lunas menautkan kuitansinya.
- **Flag `FLAG_RECEIPTS` (default off):** off menyembunyikan halaman, permintaan dan tautan (404); runner tetap
  menerbitkan kuitansi untuk setiap pembayaran baru, dan kuitansi yang terbit disimpan. Rollback = flag off.
- **Urutan rollout (s40, D-065 (7)): skema sebelum worker.** Migrasi 0028 dulu, baru `invitesion-jobs` versi G-050.
  Flag tidak melindungi runner yang jalan lebih dulu (flag hanya menutup halaman pemilik): runner seperti itu gagal
  karena relasi `receipts` belum ada, tidak menulis apa pun selain status job, dan mencoba lagi nanti; baris yang sudah
  menyerah tidak diambil. Setelah 0028 baris yang sama terbit dengan nomor berikutnya. Baris yang menyerah selama itu
  di-arm ulang lewat permintaan pemilik atau pernyataan roll-forward di `services/api/README.md`.
- **Rollback kode ke rilis B-039** di atas skema 0028 (aditif): runner B-039 menyelesaikan baris tanpa kuitansi
  (ordernya tampil "atas permintaan"). Roll-forward meng-arm ulang tepat baris yang selesai sejak rollback dan belum
  punya kuitansi (diuji s40 dengan data: dua baris, kuitansi 9 dan 10, penomoran 1–10 tanpa celah).
- **Verifikasi:** `tests/g050-receipts.test.ts`; `services/api/tests/payment_database.rs` (salinan catatan, sekali,
  delapan order masing-masing diantar tiga kali bersamaan: nomor berikutnya tanpa celah); `scripts/verify-receipts.ts`
  di job rust (kedua penulis, dua runner bersamaan, delivery ulang, cakupan pemilik, permintaan pembayaran lama).
  Bukti s40 (E-083): `verify-receipts` 26 / 26 dengan flag off; mutasi yang memindahkan increment keluar dari transaksi
  tertangkap; upgrade 0027 → 0028 berisi data 19 / 19 (runner sebelum migrasi, jendela rollback, roll-forward); halaman
  pemilik 32 / 32 di build produksi dengan Clerk di-stub (uji ber-Clerk sungguhan: DA-01 item 12).
- **Belum:** kuitansi lewat e-mail atau WA (belum ada kanal), PDF dari server (dialog cetak dipakai), identitas
  penjual resmi dan faktur pajak (EXT).

## Kupon (G-053, s40, D-066)

- **Dibuat admin, selalu belum aktif:** konsol `/admin/<entry>/coupons` (menu "Kupon"; otorisasi dicek ulang di tiap
  action): persentase 1–99 atau nominal tetap IDR / USD, opsional untuk satu paket, periode (WIB), kuota, batas
  per customer (default 1 = satu pemakaian per aturan), boleh digabung atau tidak, label mitra afiliasi. Aktifkan / jeda
  terpisah; nonaktifkan permanen = kode tetap tercatat dan tidak bisa dipakai ulang. Migrasi 0029 (aditif).
- **Diskon dihitung server:** form hanya mengirim kode (maks. tiga). `createOrder` mengunci baris kupon (`FOR UPDATE`,
  urut id), mencari order milik kunci checkout lagi di bawah kunci itu, menghitung pemakaian yang masih berlaku, lalu
  `decideCoupons` (`lib/payment/coupons.ts`): urutan aturan too_many → unknown / malformed → inactive / not_started /
  expired / wrong_tier / wrong_currency → not_stackable → already_used / exhausted → persentase dulu lalu nominal
  (masing-masing dibulatkan ke bawah) → minimal Rp 1.000 / US$ 0,50 (`below_minimum`, ditolak, bukan dipotong). Order
  ditulis dengan `amount` setelah diskon, `list_amount` dan satu baris `order_coupons` per kupon di transaksi yang sama.
  Penolakan tidak menulis apa pun. Kode yang tidak ada, belum aktif atau rusak mendapat jawaban yang sama.
- **Settlement tidak berubah:** kedua penulis memeriksa nominal terhadap `orders.amount`; order berkupon lunas dengan
  nominal diskonnya dan harga penuh ditolak. Tidak ada perubahan Rust. Kuitansi menyalin nominal yang dibayar.
- **Kapan pemakaian dihitung:** selama order `PAID`, atau `PENDING` tanpa jendela bayar / sebelum jendela habis. Order
  `FAILED` / `EXPIRED` atau yang lewat jendela mengembalikan kuotanya tanpa penulisan apa pun. QRIS manual tidak punya
  jendela: ordernya memegang kuota sampai ditandai lunas atau **ditutup tanpa bayar** di konsol Pesanan
  (`closeUnpaid`: event `EXPIRED` `manual-close:<referensi>` lewat `settle`, hanya QRIS, tekan dua kali = duplikat).
  Pembayaran yang dikonfirmasi setelah ditutup disimpan tanpa efek (aturan 4 keputusan settlement), jadi operator
  memeriksa mutasi rekening dulu.
- **Intent & resume:** kode (terurut) masuk intent checkout hanya bila ada, jadi hash setiap intent tanpa kupon tetap
  sama (order PENDING lama tetap bisa dilanjutkan). Order yang dilanjutkan ditagih nominal yang tersimpan.
- **Flag `FLAG_COUPONS` (default off):** on menampilkan kolom kupon. Off: kode yang diketik ditolak `unavailable`
  (tidak pernah ditagih penuh diam-diam), tetapi order yang sudah dibuat kunci itu dengan kodenya tetap bisa dilanjutkan
  (form lanjut Stripe mengirim kodenya kembali). Konsol tetap bisa dipakai menyiapkan kupon. Rollback = flag off.
- **Afiliasi = atribusi saja:** label mitra di kupon, konsol menampilkan jumlah lunas dan total yang dibayar lewat
  kode itu per mata uang. Tarif komisi, perjanjian mitra dan pembayaran komisi = keputusan pemilik dan aktivitas
  keuangan (EXT); self-service mitra menunggu tenancy G-052.
- **Urutan rollout: skema sebelum kode.** Migrasi 0029 dulu (checkout dan konsol membaca `orders.list_amount` dan tabel
  baru), baru rilis G-053; worker tidak berubah. Rollback kode ke rilis G-050 di atas 0029: penulisnya melunasi order
  berkupon dengan nominal diskon dan menolak harga penuh; roll-forward tanpa langkah tambahan (diuji s40 dengan data).
- **Verifikasi:** `tests/g053-coupons.test.ts` (aturan, intent, parser konsol, notice, pin sisi server);
  `scripts/verify-coupons.ts` di job database (penulis Next.js) dan job rust (kedua penulis). Bukti s40 (E-084):
  `verify-coupons` 31 / 31 lewat kedua penulis (28 tanpa API); mutasi yang membuang kunci baris kupon tertangkap
  (8 dari 8 customer diterima pada kuota 3); upgrade 0028 → 0029 berisi data 11 / 11 langkah; halaman di build
  produksi dengan Clerk di-stub 33 / 33 (uji ber-Clerk sungguhan: DA-01 item 12).
- **Belum:** pratinjau diskon sebelum order dibuat (diskon tampil di halaman order), mengganti kode order yang masih
  PENDING, baris diskon di kuitansi, komisi afiliasi (EXT), harga entry tier B-040 (EXT).

## Belum dikerjakan

- Acquirer QRIS sungguhan (blokir: keputusan komersial).
- Stripe belum pernah diuji terhadap akun sungguhan; signature terverifikasi secara unit, tetapi
  belum ada Checkout Session nyata yang dibuat.
- Auto-create akun dari pembayaran (untuk pembeli yang belum punya akun). Saat ini order selalu
  dimiliki user yang sudah login.
