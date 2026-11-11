<!-- SUMMARY (first 7 lines — greppable) -->
# wa-delivery.md — Pengiriman WhatsApp (Fonnte)
> WHAT: Blast undangan + terima chat revisi via Fonnte. Provider abstraction.
> STATUS: LIVE (design). BLOCKED sebagian oleh OPEN ITEM #1.
> OWNER: Operator
> DEPS: DATABASE_SCHEMA.md (wa_log, guests, conversations)
> GREP: whatsapp, wa, fonnte, blast, provider, webhook, revisi, banned, wa.me, template, nomor, pengingat, ringkasan, digest
> UPDATED: 2026-11-07 (s31: pengingat tindak lanjut dan ringkasan harian lewat builder yang sama, B-034 / I-29; s29: B-018 kirim manual wa.me, D-050)

## Pilihan channel (grounded)
- **Fonnte** (unofficial lokal): Rp0 (1rb pesan/bln) → Rp25rb (10rb pesan/bln). Blast bebas, no approval template. Risiko: nomor bisa banned kalau spam agresif.
- **Official (Meta/360Dialog)**: per Juli 2025 skema per-message; blast cold ke tamu = kategori marketing → approval ketat + mahal. DITOLAK buat MVP.
- **Keputusan: Fonnte buat MVP.** Migrasi ke official pas volume gede.

## WAJIB: abstraksi provider
```
interface WhatsAppProvider {
  sendMessage(to, body): Promise<Result>
  sendBulk(recipients[]): Promise<Result[]>
}
class FonnteProvider implements WhatsAppProvider {}
```
Semua kode kirim WA lewat interface ini. Jangan hardcode Fonnte.

## Kirim manual per tamu (wa.me) — TERPASANG (B-018, D-050)
Satu-satunya pembuat link: `lib/invitation/whatsapp.ts` (`guestWhatsApp`), dipakai kedua daftar tamu
(`/dashboard/guests` dan `/dashboard/invitations/<id>/guests`) lewat `components/dashboard/guest-whatsapp-action.tsx`.
- **Nomor:** `08…`, `+62…`, `62…`, `0062…`, `8…` (juga `+62 (0)8…`) jadi digit yang sama (`628…`). Nomor Indonesia harus
  nomor HP: `8` + 8–11 digit setelah 62. Nomor berkode negara lain (`+<kode>…` / `00<kode>…`) dipakai apa adanya bila
  8–15 digit. Spasi, titik, strip, kurung diabaikan; huruf atau `+` ganda = tidak valid.
- **Nomor tidak valid:** tidak ada link; baris tamu menampilkan "Nomor WhatsApp tidak valid". Nomor kosong: tidak ada aksi
  (baris sudah menulis "Belum ada nomor WhatsApp").
- **Pesan:** template host (`whatsappTemplate`, tab WhatsApp di editor). `{nama}` → nama tamu, `{link}` → link personal
  (token bila ada, B-011). Tanpa `{link}`, link ditambahkan di akhir pesan. Template kosong → pesan bawaan (ID / EN).
- Bukan blast: host menekan sendiri per tamu. Blast lewat provider (di bawah) tetap menunggu OPEN ITEM #1.
- **Pengingat (B-034, s31):** daftar "belum membuka" / "belum menjawab" di `/dashboard/invitations/<id>/insights` memakai
  builder yang sama (tombol "Ingatkan"), jadi aturan nomor, hint dan pesan di atas berlaku persis.
- **Ringkasan harian (I-29, s31):** `whatsAppShareLink(text)` = `wa.me/?text=…` tanpa nomor (WhatsApp menanyakan tujuan),
  berisi angka saja. Tetap di modul ini, sehingga tidak ada pembuat link `wa.me` lain di `app/`, `components/`, `lib/`.

## Blast undangan
- Kirim ke guest.phone, body berisi nama tamu + link `/i/:slug/:guestSlug`.
- Rate-limit blast (jeda antar pesan) biar nomor gak kena flag banned.
- Catat tiap kirim ke `wa_log` (direction=out, status).

## Chat masuk (revisi)
- Webhook Fonnte → simpan ke `conversations`+`messages` → route ke Revisi Agent (lihat ai-agents.md).
- 24-jam window relevan di official API; di Fonnte lebih longgar tapi tetap desain aman.

## Mitigasi banned
- Nomor khusus (bukan nomor pribadi), rate-limit, jangan spam, warm-up bertahap.

## ⚠️ OPEN ITEM #1 (nunggu whyme)
Nomor pengirim: A) satu nomor platform vs B) customer connect nomor sendiri. Kalau B → butuh tabel `wa_devices`. JANGAN impl blast final sebelum ini diputuskan.

## Sumber
- fonnte.com (pricing)
