<!-- SUMMARY (first 7 lines — greppable) -->
# customer-memory.md — Memori Per-Customer (after-sales engine)
> WHAT: Bikin agent "inget" tiap customer lintas sesi/hari. REUSE tabel DB existing (conversations/messages/users). Inject RINGKASAN ke LLM, bukan transkrip. Fondasi after-sales.
> STATUS: LIVE (spec MVP, revisi pasca-review Guardian + align DATABASE_SCHEMA)
> OWNER: Operator
> DEPS: DATABASE_SCHEMA.md (users, conversations, messages, invitations, invitation_versions), design-agent.md (intake_session — OTORITAS fakta), ai-agents.md (Revisi Agent WA)
> GREP: customer memory, after-sales, rolling summary, konteks, ingatan, recall, personalisasi, retensi, PII
> UPDATED: 2026-07-15

## Kenapa ada (goal bisnis)
Customer balik beberapa hari kemudian → agent LANGSUNG nyambung konteks ("Halo Kak Rizki, jam akad udah fix dari keluarga?"). Efek: pelayanan personal & responsif → happy → word-of-mouth. Fondasi After-Sales Agent (fase lanjut).

## Prinsip biaya (INTI — jalan tengah)
- **Postgres = murah.** Simpan semua (fakta + ringkasan + transkrip).
- **LLM = mahal per-token dibaca.** Yang di-inject balik tiap chat = **RINGKASAN + profil**, BUKAN full transkrip.
- Ongkos LLM per chat **flat & bounded** (cap N=3 ringkasan × 300 char). LLM stateless — kita yang persist & inject.

## ⚠️ Align ke DB existing (JANGAN bikin tabel dobel)
Review nemu: DB udah punya yg gue kira perlu bikin baru. **REUSE, jangan duplikat:**
| Kebutuhan | Pakai tabel EXISTING | Jangan bikin |
|---|---|---|
| Transkrip chat mentah | `conversations` + `messages` (sudah ada, channel[wa]) | ~~chat_transcript~~ |
| Identitas customer | `users` (role CUSTOMER) + `conversations.customer_phone` | ~~customer_profile berdiri sendiri~~ |
| Fakta acara (otoritas) | `intake_session` (design-agent) + `invitations.config` | jangan dobel simpan fakta |

Yang **beneran perlu ditambah** ke DATABASE_SCHEMA.md cuma 2 tabel di bawah.

## Tabel BARU (tambah ke DATABASE_SCHEMA.md)
```
customer_memory                       -- profil ingatan, 1 baris per user
  id, user_id→users (UNIQUE, 1:1),    -- identitas = users, BUKAN entitas baru
  preferensi jsonb,                    -- {"catatan":"jam akad nunggu mertua"} — CATATAN LUNAK, bukan fakta keras
  last_interaction_at, updated_at
  -- fakta keras (nama/tanggal/event_type) TIDAK di sini → baca dari users + intake_session/config (hindari drift, fix S3)

customer_session_summary              -- 1 baris per sesi chat selesai
  id, user_id→users, conversation_id→conversations,  -- link ke transkrip asal (fix N1)
  invitation_id→invitations (nullable),  -- acara MANA (dukung 1 customer : N acara, fix B4)
  summary text,                        -- ≤300 char, turunan slot tervalidasi (lihat anti-halusinasi)
  next_action text (nullable), status[draft|confirmed],  -- next_action WAJIB dikonfirmasi customer sblm dipakai proaktif
  created_at
```
> 1 customer : N acara (fix B4) — relasi acara lewat `invitation_id` di summary, BUKAN field singular di profil. `customer_memory` cuma catatan lunak lintas-acara.

## Identity resolution (fix B2)
- Sumber identitas TUNGGAL = `users.id`. Semua memori nempel ke sana.
- **Web:** dari auth session → `users.id` langsung.
- **WA (Revisi/After-Sales Agent):** `conversations.customer_phone` → lookup `users.phone` → `users.id`. Kalau no HP belum kedaftar → belum ada memori (customer baru), jangan ngarang.
- ⚠️ butuh `users.phone` (UNIQUE, nullable) — **tambahkan ke DATABASE_SCHEMA.md** (sekarang users cuma punya email).

## Kapan "sesi selesai" (fix B1 — trigger write-path)
Sesi chat gak punya tombol logout. Trigger bikin ringkasan (pilih yg mana duluan kena):
1. **Idle timeout** — gak ada pesan 30 menit → sesi ditutup, generate ringkasan.
2. **Event eksplisit** — draft di-publish / order paid / customer bilang selesai.
3. **Cap harian** — kalau sesi jalan sangat panjang, ringkas per batas (hindari transkrip numpuk).
> Sesi yg gak pernah "selesai" formal → idle timeout yg nutup. Ringkasan tetap kebuat.

## Alur

### Sesi selesai (write) — 1x LLM call per sesi
1. Transkrip udah kesimpen incremental di `messages` (gak perlu aksi khusus).
2. **1x LLM** → ringkasan ≤300 char + `next_action` (status=`draft`) → `customer_session_summary`.
3. Update `customer_memory.preferensi` + `last_interaction_at`.
> **Fallback LLM gagal (fix S4):** kalau LLM 502/timeout → masuk **retry queue** (BullMQ), JANGAN blok. Sesi berikutnya tetap jalan pakai profil + ringkasan lama. Transkrip aman di `messages`, ringkasan nyusul pas retry sukses.

### Customer balik (read/inject)
1. Load `customer_memory` + **N=3 ringkasan terakhir** (`customer_session_summary`).
2. Susun blok konteks ringkas, inject ke system prompt:
   ```
   KONTEKS CUSTOMER (memori, bukan fakta final — konfirmasi sebelum dipakai):
   - Rizki (dari users), wedding 17 Agustus (dari config).
   - Sesi terakhir (3 hari lalu): jam akad belum fix, nunggu keluarga.
   ```
3. Agent buka nyambung: "Halo Kak Rizki, jam akadnya udah fix?"
> Detail spesifik → tool `recall_transcript` on-demand (lihat guardrail).

## Anti-halusinasi (fix S1, S2 — konsisten design-agent)
- **Summary WAJIB turunan slot `intake_session`/`config` yg SUDAH tervalidasi + isi `messages` nyata.** BUKAN karangan bebas LLM. Kalau info gak ada → kosong, jangan diisi.
- **`next_action` status `draft` → WAJIB dikonfirmasi customer sebelum dipakai proaktif.** Recall ≠ asumsi final. ("kemarin kakak bilang nunggu keluarga, udah fix?")
- **Preferensi estetika (fix S2):** recall = MENGINGATKAN pilihan yg customer SUDAH buat via katalog ("kemarin pilih rustic, masih?"), BUKAN agent ngerekomendasi. Agent tetap NOL peran estetika.
- Fakta keras (tanggal/jam/venue) OTORITAS = `intake_session`/`config`, bukan memori. Memori = konteks, bukan sumber kebenaran.

## Guardrail recall_transcript (fix B3, S7)
```
recall_transcript(query)   # customer_id di-scope SERVER-SIDE dari sesi aktif, BUKAN param LLM
```
- Server paksa `user_id` = customer yg lagi dilayani. LLM TIDAK bisa minta transkrip customer lain (cegah kebocoran antar-customer).
- **Rate limit:** max 2 recall per sesi. Lebih → tolak (cegah biaya & PII bocor berulang tiap turn).
- MVP: boleh ditunda kalau ringkasan udah cukup (over-engineering minor).

## Privasi & keamanan (fix S5, S6 — WAJIB, bukan best-effort)
- **Enkripsi at-rest WAJIB** untuk no HP & kontak (bukan "kalau memungkinkan").
- **Whitelist field yg boleh di-inject ke LLM vendor (fix S6):** HANYA nama depan + event_type + tanggal + ringkasan. **HARAM inject:** no HP, email, alamat lengkap, no rekening. PII sensitif gak keluar ke Anthropic/OpenAI.
- **Retensi:** transkrip mentah simpan **12 bulan** (samain masa aktif undangan `expires_at`), lalu anonim/hapus. Ringkasan boleh lebih lama (udah minim PII).
- **UU PDP Indonesia:** consent saat onboarding + hak hapus (customer bisa minta data dihapus). Wajib ada endpoint delete.
- **JANGAN simpan memori customer di MCP knowledge vault.** Vault = knowledge tim agent internal. Pemisahan tegas.
- Jangan log isi transkrip/PII ke application log.

## Enum acara — SATU sumber kebenaran (fix lintas-file)
DB `templates.category` sekarang: `[wedding|birthday|corporate|aqiqah]`. Spec design-agent + catalog tambah `tasyakuran`, `khitanan`. **Samakan di 3 tempat** (DB, design-agent, catalog) sebelum implementasi: `wedding | birthday | aqiqah | tasyakuran | khitanan | corporate`.

## Concurrency (fix N4)
2 device paralel (WA + web) nulis profil/summary sama → **last-write-wins** cukup buat MVP. `updated_at` sbagai penanda. Lock optimistik = fase lanjut.

## Hook after-sales (fase lanjut — bukan MVP core)
`next_action` (confirmed) + `last_interaction_at` = bahan After-Sales Agent proaktif (upsell halus "mau sekalian 7 bulanan?", follow-up draft nyangkut). MVP cukup: bangun memori + inject. Agent proaktif nyusul.

## Di luar scope MVP
- After-Sales Agent otomatis (blast proaktif).
- Semantic search transkrip (embedding) — skip sampai volume besar.
- Lock concurrency canggih.
