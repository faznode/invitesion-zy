<!-- SUMMARY (first 7 lines — greppable) -->
# PROJECT_OVERVIEW.md — Keputusan & Arsitektur
> WHAT: Sumber kebenaran semua keputusan produk. Locked decisions + OPEN ITEMS.
> STATUS: LIVE (ada open items)
> OWNER: Architect
> DEPS: DATABASE_SCHEMA.md, docs/systems/*
> GREP: keputusan, panel, revisi, url, harga, open items, expired, competitor
> UPDATED: 2026-07-16

## Konsep
SaaS undangan digital Indonesia (wedding/birthday/corporate/aqiqah) + AI agent. **One-time payment, BUKAN subscription.** Customer beli → dapat undangan + akses panel self-service.

## 3 PANEL TERPISAH (jangan disatuin)
| Panel | URL | User | Auth |
|---|---|---|---|
| Landing | `/` | Publik / calon customer | Tidak |
| Customer | `/dashboard/*` | Customer terdaftar | Session user → langsung `/dashboard`; **NO billing/subscription di sini** |
| Admin | private `/admin/<entry>/*` | Tim internal | Private entry + role=ADMIN + optional email allowlist; entry salah = 404 |
| Undangan (publik) | `/i/:slug/:guestSlug` | Tamu | Tidak |

## KEPUTUSAN TERKUNCI ✅
1. **Bayar one-time.** Webhook = source of truth, BUKAN redirect browser.
   **REVISI 2026-07-27 (whyme): Midtrans TIDAK dipakai.** Pembayaran lokal lewat **QRIS**,
   internasional lewat **Stripe**. Rail dipilih dari mata uang order (IDR→QRIS, lain→Stripe),
   bukan dari geolokasi. Sudah diimplementasi; detail + batasan di `docs/systems/payment.md`.
   Catatan penting: QRIS adalah standar, bukan provider — callback settlement otomatis butuh
   acquirer yang **belum dipilih**, jadi order QRIS saat ini dikonfirmasi admin.
   Auto-create akun dari pembayaran belum dikerjakan; order selalu milik user yang sudah login.
2. **Revisi 3x** via AI Agent WhatsApp. Data pasar: 3x kompetitif (einvite 1x–3x; cuma Invisimple unlimited). "3x + instant AI 24/7" > admin manual.
3. **Guest URL: slug nama polos** `/i/wedding-andi/budi-santoso`. Auto-append angka kalau bentrok (`budi-santoso-2`). Scope tamu = orang terdekat, risiko share/tebak kecil. Token TIDAK dipakai.
4. **Slug unik per-undangan**, bukan global. `/wedding-andi/budi` & `/wedding-sari/budi` tidak bentrok.
5. **Masa aktif 12 bulan.** Setelah expired → undangan **READ-ONLY** (tamu masih bisa lihat, RSVP/guestbook nutup, data tamu disimpan). Bukan mati total. Hook upsell "perpanjang".
6. **WA channel: Fonnte** (unofficial lokal, murah Rp0–25rb/bln). Wajib abstraksi `WhatsAppProvider` biar bisa migrasi ke official pas volume gede.
7. **MVP cuma 2 AI agent: Design + Revisi.** Sales/Promo/After-Sales/Analytics = fase lanjut. Jangan diborong di awal.
8. **Template config-driven:** 1 renderer + N config JSON. BUKAN komponen custom per-template. Ini yang bikin AI revisi feasible + rollback gampang.
9. **Repeat customer:** 1 email = 1 akun, bisa punya banyak undangan. Tiap undangan baru = order/bayar baru.
10. **Customer route canonical:** setelah daftar/login, customer selalu masuk `/dashboard`; identitas dan ownership diambil dari session server-side, tanpa prefix URL `/customer`.
11. **Admin non-discoverable:** admin hanya lewat `ADMIN_ENTRY_PATH` dari environment + authorization server-side. `/admin` atau entry salah memberi 404; `ADMIN_ALLOWED_EMAILS` dapat membatasi trusted admin.

## OPEN ITEMS ⚠️ (JANGAN tebak — nunggu keputusan whyme)
- **#1 Nomor pengirim WA blast:**
  - A. Satu nomor platform (murah/simpel, rawan banned, tamu lihat nomor asing)
  - B. Customer connect nomor sendiri (aman banned, tamu lihat nomor customer, ribet scan QR)
  - → kalau B, butuh tabel `wa_devices`. Belum diputuskan.
- **#2 Scope Design Agent MVP:** ✅ CLARIFIED (2026-07-15)
  - Kita penyedia jasa → agent NURUT keinginan customer, TIDAK ngarang. Template, vibe, warna/palette = PILIHAN CUSTOMER. Agent = intake + assembler config, bukan pengambil keputusan kreatif.
  - Agent BOLEH: kumpulin pilihan+fakta, validasi fakta, rakit config, bantu draft copywriting (customer approve).
  - Agent TIDAK BOLEH: rekomendasi/ganti template-vibe-warna sendiri, generate desain dari nol (SD/DALL-E). Detail: docs/systems/ai-agents.md.
- **#3 Definisi "1 revisi":**
  - Rekomendasi Architect: 1 sesi chat selesai = 1 kuota (boleh banyak perubahan sekaligus). Bukan per-field. Belum di-ACC.

## Competitor snapshot (grounded 2026-07)
| Platform | Harga | Aktif | Revisi | URL per-guest | AI |
|---|---|---|---|---|---|
| Invisimple | Rp79rb+ | 10–12bln | Unlimited (self) | ❌ placeholder | ❌ |
| einvite.id | Rp99–575rb | — | 1x–3x | ❌ slug per-couple | ❌ |
| Kundangi | Rp100rb | 2bln | self-edit | ❌ | ❌ |
| Digimo | Rp89–143rb | — | — | ❌ | ❌ |
| toinvites | — | — | one-click | ❌ slug per-undangan | ❌ |

**Differentiator kita:** (1) URL unik per-tamu + tracking — NOL kompetitor punya. (2) AI Agent revisi via WA — NOL kompetitor punya. (3) Analytics per-guest — pasar lemah di sini.
