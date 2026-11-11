<!-- SUMMARY (first 7 lines — greppable) -->
# ai-agents.md — AI Agents (Design + Revisi)
> WHAT: 2 agent MVP. Design Agent (isi config) + Revisi Agent WA (tool-calling).
> STATUS: LIVE (design). BLOCKED sebagian oleh OPEN ITEM #2 & #3.
> OWNER: Operator
> DEPS: DATABASE_SCHEMA.md (agent_tasks, invitation_versions), wa-delivery.md
> GREP: ai, agent, design, revisi, tool-calling, function calling, versioning, guardrail
> UPDATED: 2026-07-14

## Prinsip fundamental
**AI TIDAK PERNAH generate HTML.** Config JSON = source of truth → renderer deterministik → HTML. AI cuma panggil tool yang ubah config. Ini bikin revisi reliable + gak ngerusak layout + rollback gampang.

## Design Agent
**PRINSIP: kita penyedia jasa. Agent NURUT keinginan customer, TIDAK ngarang/mutusin sendiri.**
Template, vibe/gaya, dan warna/palette = **PILIHAN CUSTOMER**. Agent HARAM ngusulin sendiri atau ngganti. Agent = intake + assembler, bukan pengambil keputusan kreatif.

| Bagian | Siapa yang tentuin | Peran agent |
|---|---|---|
| Nama, tanggal, jam, venue (FAKTA) | Customer | Isi apa adanya + validasi. HARAM ngarang |
| Template | Customer pilih dari katalog | Tampilin katalog, terapin pilihan |
| Vibe / gaya | Customer | Ikut. TIDAK ngusulin sendiri |
| Warna / palette | Customer | Ikut pilihan customer |
| Copywriting (opening/quote/intro) | Customer arahkan | Boleh bantu DRAFT, customer final approve/edit |

- Input: pilihan + fakta dari customer (form / chat intake).
- Output: rakit `config(json)` sesuai pilihan customer → create DRAFT → customer review.
- Yang agent lakuin: (1) kumpulin semua pilihan+fakta customer secara lengkap, (2) validasi fakta, (3) rakit config, (4) bantu draft copy kalau diminta.
- ❌ DI LUAR SCOPE: generate desain/gambar dari nol (SD/DALL-E), rekomendasi template/vibe/warna atas inisiatif agent. Semua estetika = customer yang mutusin.

## Revisi Agent (via WhatsApp)
Skenario: customer chat "ganti jam akad jadi jam 10", "ubah warna jadi biru".

### Pola tool-calling (bukan free-form)
Tool sempit + enum whitelist per field. Contoh:
```
update_event_time(event_id[enum: akad|resepsi], time[pattern HH:MM])
set_theme_color(target[enum: primary|secondary|accent], color)
replace_photo(slot[enum], asset_id)
```
Aktifkan strict mode / structured outputs. Server TETAP validasi ulang (whitelist, tipe, range, map warna ke palet template).

### Pola propose → confirm → apply
1. `propose_change(...)` → server hitung diff, buat DRAFT (versi baru, belum live) → balas customer: ringkasan + link preview.
2. Customer balas "ya".
3. `apply_change(draft_id)` → publish draft jadi live. Idempotent (draft_id sekali pakai).

### Versioning / rollback
Tiap apply = insert `invitation_versions` baru, set `is_live`. Undo = set versi lama jadi live. `created_by='ai-agent'` + simpan transkrip buat audit.

### Kuota revisi
Max 3x. ⚠️ OPEN ITEM #3: 1 kuota = 1 sesi chat selesai (rekomendasi), bukan per-field. Belum di-ACC. `revision_count` di tabel invitations.

### Guardrail
- Instruksi ambigu ("jam 10" — akad/resepsi?) → JANGAN panggil tool, tanya klarifikasi dulu.
- Perubahan sensitif (tanggal, nama) → wajib konfirmasi eksplisit.
- Rate-limit perubahan per sesi. Escalate ke manusia kalau di luar scope tool.
- Foto: hanya terima asset_id yang lolos pipeline upload (validasi + moderasi).

## Orchestration
LangGraph. Fase lanjut: Sales/Promo/After-Sales/Analytics agent (JANGAN di MVP).

## Sumber
- platform.openai.com/docs/guides/function-calling + structured-outputs
- docs.anthropic.com tool-use
