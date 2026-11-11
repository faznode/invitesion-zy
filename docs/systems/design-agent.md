<!-- SUMMARY (first 7 lines — greppable) -->
# design-agent.md — Spec Design Agent (intake + assembler)
> WHAT: Spec lengkap Design Agent. Alur 5 tahap, arsitektur extractor+assembler, anti-halusinasi, schema config per acara.
> STATUS: LIVE (spec final MVP). Field per-acara: TERVALIDASI vs contoh nyata ID (Oracle cross-check 2026-07-15).
> OWNER: Operator
> DEPS: ai-agents.md, DATABASE_SCHEMA.md (invitations.config, invitation_versions, agent_tasks), PROJECT_OVERVIEW.md
> GREP: design agent, intake, assembler, slot filling, extractor, config, schema, template, copywriting, guardrail, enum, state
> UPDATED: 2026-07-15 (post-review: +state mgmt, +enum field, +contoh config, +fakta-vs-copy)

## Prinsip inti (dari keputusan whyme)
**Kita penyedia jasa. Design Agent = INTAKE + ASSEMBLER. NURUT customer, TIDAK ngarang.**
- Template / vibe / warna = **PILIHAN CUSTOMER**. Agent NOL peran di estetika — tidak merekomendasi, tidak mengganti.
- **Garis tegas FAKTA vs COPY (fix B2):**
  - **FAKTA** (nama, tanggal, jam, venue, rekening, marga) = dari customer. Agent **HARAM mengarang**. Field kosong → TANYA, bukan diisi model.
  - **COPYWRITING** (opening, quote, love story narasi) = agent **BOLEH DRAFT** (ini bukan fakta), tapi customer **WAJIB approve/edit** sebelum masuk config. Output draft = **teks plain, BUKAN HTML** (fix S4).
  - Aturan: kalau ragu sesuatu itu fakta atau copy → perlakukan sebagai FAKTA (haram karang).

## Alur 5 tahap
> **`event_type` ditentukan di tahap 1 (fix S5):** dari `template.occasion` template yg dipilih customer. Disimpan di `intake_session.event_type`. Ini yang nge-resolve enum field mana yg dipakai `set_fact` (lihat enum per acara di bawah). Tahap 2 dst gak jalan sebelum event_type kepilih.

```
1. PILIH TEMPLATE   Customer buka galeri → filter (Occasion→Style→Color swatch) → pilih.
                    Agent: NOL peran. Murni UI katalog (lihat template-catalog.md).
                    → set event_type = template.occasion (kunci enum field tahap 2).

2. INTAKE FAKTA     Agent kumpulin data via HYBRID: form terpandu (fakta keras) +
                    chat (slot-filling utk yang kurang). Nanya field KOSONG,
                    TIDAK ngisi sendiri.

3. VALIDASI         Tiap fakta divalidasi (tanggal real, jam format HH:MM, url, dst).
                    Ragu/ambigu → tanya balik. HARAM nebak.

4. BANTU COPY       (opsional, customer boleh skip) Agent draftin opening/quote/
                    love story. Customer WAJIB approve/edit sebelum masuk config.

5. RAKIT CONFIG     Assembler (kode deterministik) rakit slot+pilihan → config JSON →
                    create DRAFT (invitation_versions, is_live=false) → customer review.
```

## Arsitektur teknis — pisah 2 peran (JANGAN dicampur)
Sumber: riset slot-filling (function-calling + structured output + validasi server).

### A. Extractor (LLM, function-calling)
- Ekstrak fakta dari teks customer ke slot terstruktur. Strict mode / structured output ON.
- Status slot: `filled` (fakta, ada sumber utterance) | `empty` | `needs_confirmation` | **`ai_drafted_pending_approval`** (khusus output `draft_copy`, fix S1).
- LLM TIDAK PERNAH jadi otoritas final — cuma pengisi kandidat.
- **Jalur copy terpisah dari fakta (fix S1):** output `draft_copy` MASUK slot status `ai_drafted_pending_approval`, BUKAN `filled`. Assembler TOLAK slot ini kecuali customer approve eksplisit (→ jadi `filled`). Ini yg bikin lapis anti-halusinasi #2 (sumber=utterance) gak bentrok sama copywriting: copy bukan fakta, jalurnya beda.

### B. Assembler (kode deterministik, BUKAN LLM)
- Rakit slot (status `filled`) + pilihan customer (template_id, palette) → config JSON valid sesuai schema acara.
- Validasi ulang semua (tanggal, jam, enum, url) sebelum simpan.

## Anti-halusinasi fakta (3 lapis — WAJIB)
1. **Slot status eksplisit.** Field `empty` → agent WAJIB tanya, gak boleh diisi model. Cuma slot `filled` yang masuk assembler.
2. **Setiap fakta wajib "sumber" = utterance customer.** Kalau LLM ngisi tanpa referensi ucapan customer → tolak, set `needs_confirmation`.
3. **Validasi server ulang** setelah LLM (tanggal real, jam HH:MM, enum whitelist). LLM bukan otoritas final.

## Slot-filling loop
"Slot wajib" = field bertanda R di enum per acara (bawah) — machine-readable, bukan prosa.
```
while ada slot WAJIB (R) berstatus empty:
    pilih 1 slot kosong prioritas tertinggi
    generate 1 pertanyaan follow-up (natural, 1 hal saja)
    terima jawaban customer → extractor update slot
    ESCAPE HATCH: kalau customer belum tau (mis. "jam akad belum fix") →
      set slot 'pending_customer', TAWARIN simpan draft & lanjut nanti. JANGAN loop maksa.
    BATAS RETRY: 1 slot ambigu max 2x tanya. Masih ambigu → 'pending_customer', lanjut slot lain.
ambigu (mis. "jam 10" — akad/resepsi?) → set needs_confirmation → klarifikasi, JANGAN asumsi
```
> Slot `pending_customer` gak blok `assemble_config()` KALAU opsional. Kalau WAJIB & pending → draft tetap bisa disimpan (is_live=false), tapi gak bisa publish sampai keisi.

## State management sesi intake (fix B1 — WAJIB, tadinya kelewat)
Slot-filling itu multi-turn & bisa keputus (customer tutup browser / chat WA mati). Slot HARUS di-persist biar bisa resume.
- Tabel **`intake_session`**: `id`, `invitation_id`, `event_type`, `slots` (jsonb: {field: {value, status, source_utterance}}), `template_id`, `palette_id`, `updated_at`, `status` (in_progress|ready|assembled).
- Tiap `set_fact` / `mark_missing` → update baris `slots`. Bukan simpan di memory sesi LLM.
- Resume: customer balik → load `intake_session` → lanjut dari slot `empty` pertama.
- `assemble_config()` cuma boleh jalan kalau semua slot WAJIB berstatus `filled` (status → assembled).

## Relasi config ↔ versi + lifecycle draft→live (fix B3 + B2)
- Output assembler = **satu blob `config` (jsonb)** — bukan tabel ternormalisasi. Section (Global/Wedding/events[]/dst) = key di dalam blob.
- `assemble_config()` → insert row `invitation_versions` (config jsonb, is_live=false) = DRAFT. Contoh config wedding utuh: lihat `## Contoh config JSON` di bawah — kontrak Operator, jangan nebak.
- **Lifecycle (fix B2):** MAX 1 draft aktif per undangan (draft baru overwrite draft lama yg belum publish). Publish = customer approve → set `is_live=true` (versi live lama → is_live=false, disimpan buat rollback). Detail promote/rollback: ai-agents.md §Versioning.
- **Revisi (OPEN ITEM #3):** 1 sesi chat = 1 draft baru (bukan edit in-place). Konsisten dgn Revisi Agent propose→confirm→apply.
- **Error handling assemble gagal:** kalau `assemble_config()` gagal di tengah (validasi tolak / DB error) → JANGAN commit parsial. Rollback transaksi, slot di `intake_session` tetap aman, tampilkan error spesifik ke customer (field mana yg invalid). Config korup = haram.

## Schema config — field per jenis acara
> ✅ TERVALIDASI vs contoh nyata ID (Oracle 2026-07-15): ciptagrafika, seremoni.id, sannubari, acaranya.id, indoinvite, undangandigital.io, mendjamoe.
> Catatan: validasi dari deskripsi search 8 provider nyata (URL-fetch gak tersedia). Cukup buat konfirmasi field.

Schema fleksibel: `sections` = ARRAY (bukan hardcode) supaya variasi adat/agama gampang nambah/ubah section.

### Global (semua acara — WAJIB, khas undangan digital ID)
- ⚠️ **guest_name** (fix S1): BUKAN field config. Ini **render-time variable per-tamu**, di-join dari tabel `guests` (lihat guest-management.md) saat render URL "Kepada Yth: [nama]". Config itu 1 utk semua tamu; guest_name beda per-URL. JANGAN masukin ke blob config.
- **salam_pembuka**: bisa disesuaikan per agama — Bismillah/Assalamualaikum (Islam), ayat Alkitab (Kristen), "Om Swastiastu" (Hindu/Bali).
- **salam_penutup**: kalimat terima kasih dari keluarga.
- **background_music**: url + tombol play/pause. (Kecuali corporate — biasanya gak dipakai.)
- **share_wa**: tombol bagikan ke WhatsApp — mekanisme distribusi utama.
- **slug/custom_url**: URL slug (custom domain opsional premium).

### WEDDING
- **cover**: nama panggilan pasangan, tanggal utama, foto cover
- **couple**: pria & wanita → nama lengkap, nama panggilan, **urutan anak ke-N dari Bapak X & Ibu Y** (format resmi ID), foto, sosmed (opsional)
- **events[]**: array acara. Tiap acara: `type`, tanggal, jam mulai-selesai, nama tempat, alamat, maps link
  - `type` enum lengkap: akad | resepsi | pemberkatan | ngunduh_mantu | lamaran | midodareni | siraman | panggih | martumpol | pawiwahan | mepandes
- **love_story[]**: timeline (judul, tanggal, cerita) — opsional
- **gallery[]**: foto (url, caption)
- **turut_mengundang[]**: daftar nama keluarga besar/relasi. Lazim di ID, sering diminta.
- **wedding_wish / rsvp**: kolom ucapan + konfirmasi kehadiran (gabungan)
- **guestbook**: aktif/nonaktif (kalau dipisah dari wedding_wish)
- **gift**: amplop digital → rekening (bank, no rek, atas nama), e-wallet, QRIS image — opsional
- **quotes**: ayat pembuka (Islam: QS Ar-Rum 21; Kristen: ayat Alkitab) — bagian dari salam_pembuka, JANGAN duplikat
- **countdown**: aktif/nonaktif
- **live_stream**: link (YouTube/Zoom) — opsional
- **dress_code**: opsional (bukan field inti mainstream ID)
- **protokol_kesehatan**: opsional (sisa COVID, mulai ditinggalkan)
- **marga**: WAJIB konteks Batak; opsional lainnya
- ❌ BUANG dari inti: `bio` couple (jarang dipakai) → opsional aja

> **Validasi kombinasi events[].type (fix S3):** TIDAK ada validasi keras kombinasi type. Customer bebas pilih event apa aja (template & adat variatif, gak worth di-hardcode aturannya). Server cuma validasi tiap `type` ada di enum + field wajibnya keisi. Kombinasi (mis. akad + mepandes) = tanggung jawab customer.

### AQIQAH / TASYAKURAN
- **child**: nama anak, jenis kelamin, tanggal lahir, **arti/makna nama** (sering ditampilkan)
- **parents**: nama bapak & ibu
- **salam_pembuka** (Bismillah) + **doa untuk anak** (ucapan syukur) — hampir selalu ada
- **event**: tanggal, jam, tempat, alamat, maps
- gallery, rsvp — opsional
- **gift**: JARANG di aqiqah (bukan konteks amplop) → opsional, sering skip
- turut_mengundang (kakek/nenek) — opsional

### BIRTHDAY
- **celebrant**: nama, umur (opsional)
- **salam_pembuka**: kata sambutan singkat
- **event**: tanggal, jam, tempat, alamat, maps
- **timeline[]**: foto milestone per tahun (milad) — opsional
- gallery, rsvp, countdown — opsional
- **gift/wishlist**: link wishlist (bukan amplop) — opsional
- Catatan: `tema` = pilihan desain template, bukan data field wajib

### CORPORATE / EVENT
- **event**: nama acara, deskripsi, tanggal, jam, lokasi, maps
- **guest_name** + **e-ticket / QR check-in**: nama peserta + tiket
- **agenda[]**: rundown (waktu, sesi, deskripsi)
- **speakers[]**: nama, jabatan, foto (opsional)
- **registration / rsvp**: RSVP terstruktur (lebih lazim dari sekadar link) + kuota
- **contact_person**: narahubung
- **sponsors[]**: logo pendukung — opsional
- **dress_code**: relevan di corporate formal — opsional (nama field disamain, fix N1)
- Catatan: background_music biasanya TIDAK dipakai di corporate

> **Field RSVP kanonik (fix N2):** semua penyebutan `rsvp` / `wedding_wish` / `registration` = objek RSVP yang SAMA: `{aktif, batas_tanggal, tanya_jumlah_tamu, kolom_ucapan}`. Variasi label per acara cuma UI; struktur data satu.

## Variasi adat/agama (section tambahan — kunci: events[] fleksibel)
- **Islam** (akad+resepsi): salam Bismillah + QS Ar-Rum 21; event akad + resepsi; mahar opsional.
- **Kristen/Katolik** (pemberkatan): event pemberkatan di gereja + resepsi; ayat Alkitab (bukan Al-Quran); field nama gereja + jam misa. `quotes` harus bisa switch ke ayat Alkitab.
- **Batak**: rangkaian panjang (martumpol, pemberkatan, pesta adat/ulaon unjuk, resepsi) + **`marga` WAJIB**.
- **Jawa**: siraman, midodareni, panggih, ngunduh mantu. Kadang aksara Jawa/gelar.
- **Sunda**: siraman, sungkeman, saweran, ngeuyeuk seureuh.
- **Hindu/Bali** (Pawiwahan): event mepandes (potong gigi) + pawiwahan; salam "Om Swastiastu"; bisa pakai penanggalan Bali. indoinvite punya kategori Mepandes terpisah.

## Enum field per acara (fix S2 — wajib eksplisit buat strict-mode)
`set_fact(field, value)` — `field` HARUS dari enum ini (R=required, O=optional). Server tolak field di luar enum.

**WEDDING (R):** `groom_nama`, `groom_ortu`, `bride_nama`, `bride_ortu`, `event_type`, `event_tanggal`, `event_jam`, `event_tempat`, `event_alamat` · **(O):** `groom_panggilan`, `bride_panggilan`, `groom_anak_ke`, `bride_anak_ke`, `groom_sosmed`, `bride_sosmed`, `event_maps`, `love_story`, `gallery`, `turut_mengundang`, `gift_rekening`, `gift_ewallet`, `gift_qris`, `quotes`, `countdown`, `live_stream`, `dress_code`, `protokol_kesehatan`, `marga`
**AQIQAH (R):** `child_nama`, `child_kelamin`, `child_tgl_lahir`, `parent_bapak`, `parent_ibu`, `event_tanggal`, `event_jam`, `event_tempat`, `event_alamat` · **(O):** `child_arti_nama`, `doa_anak`, `event_maps`, `gallery`, `gift`
**BIRTHDAY (R):** `celebrant_nama`, `event_tanggal`, `event_jam`, `event_tempat`, `event_alamat` · **(O):** `celebrant_umur`, `event_maps`, `timeline`, `gallery`, `gift_wishlist`, `countdown`
**CORPORATE (R):** `event_nama`, `event_tanggal`, `event_jam`, `event_lokasi` · **(O):** `event_deskripsi`, `event_maps`, `agenda`, `speakers`, `contact_person`, `sponsors`, `dress_code`
**Global semua acara (O):** `salam_pembuka`, `salam_penutup`, `background_music`
> Tipe: tanggal=ISO date, jam=HH:MM, maps/url/sosmed=URL valid, array (events/gallery/agenda/speakers/timeline/turut_mengundang)=list objek. Field bertipe array di atas diwakili nama dasarnya.

## Contoh config JSON wedding (fix B3 — kontrak Operator, jangan nebak)
```json
{
  "event_type": "wedding",
  "global": { "salam_pembuka": "Assalamualaikum Wr. Wb.", "salam_penutup": "Terima kasih atas doa restunya", "background_music": "asset://music/xxx.mp3" },
  "couple": {
    "groom": { "nama": "Ahmad Rizki", "panggilan": "Rizki", "anak_ke": 1, "ortu": { "bapak": "H. Sulaiman", "ibu": "Hj. Aminah" }, "foto": "asset://...", "sosmed": null },
    "bride": { "nama": "Siti Nurhaliza", "panggilan": "Siti", "anak_ke": 2, "ortu": { "bapak": "H. Yusuf", "ibu": "Hj. Fatimah" }, "foto": "asset://...", "sosmed": null }
  },
  "events": [
    { "type": "akad", "tanggal": "2026-08-17", "jam_mulai": "08:00", "jam_selesai": "10:00", "tempat": "Masjid Al-Ikhlas", "alamat": "Jl. Merdeka 1", "maps": "https://maps.app.goo.gl/xxx" },
    { "type": "resepsi", "tanggal": "2026-08-17", "jam_mulai": "11:00", "jam_selesai": "14:00", "tempat": "Gedung Serbaguna", "alamat": "Jl. Merdeka 2", "maps": "https://maps.app.goo.gl/yyy" }
  ],
  "love_story": [ { "judul": "Pertama Bertemu", "tanggal": "2020-01-01", "cerita": "..." } ],
  "gallery": [ "asset://foto1.jpg" ],
  "turut_mengundang": ["Keluarga Besar H. Sulaiman"],
  "rsvp": { "aktif": true, "batas_tanggal": "2026-08-10", "tanya_jumlah_tamu": true, "kolom_ucapan": true },
  "gift": { "rekening": [{ "bank": "BCA", "no": "1234567890", "atas_nama": "Ahmad Rizki" }], "ewallet": [], "qris": "asset://qris.png" },
  "quotes": { "sumber": "QS Ar-Rum 21", "teks": "..." },
  "countdown": true,
  "live_stream": null,
  "dress_code": null,
  "marga": null
}
```
> `asset://` = pointer ke asset_id yg lolos pipeline upload (bukan URL mentah). `guest_name` TIDAK ada di config — di-inject render-time dari tabel guests.

> **Sanitasi render / anti-XSS (fix N1):** value bebas-teks (`salam_penutup`, `love_story.cerita`, `quotes.teks`, `guest_name`) di-render ke HTML undangan → WAJIB escape/sanitasi di layer render (bukan layer agent). Enum whitelist udah cegah field arbitrer, tapi ISI teks tetap harus di-escape biar gak stored-XSS.
> **Validasi upload (fix N2):** asset (foto cover, gallery, QRIS, musik) lewat pipeline upload: cek MIME, batas ukuran, moderasi. Cuma `asset_id` yg lolos boleh masuk config. Detail: DATABASE_SCHEMA.md / pipeline upload.

## Tools Design Agent (function-calling, sempit)
```
set_fact(field[enum sesuai acara], value)      # dari utterance customer, wajib ada sumber
mark_missing(field)                             # tandai slot masih kosong
request_clarification(field, question)          # ambigu → tanya, jangan asumsi
draft_copy(section[enum: opening|quote|love_story], context)  # bantu draft, customer approve
apply_template(template_id)                     # terapin pilihan customer (bukan rekomendasi agent)
                                                # SERVER cross-check: template.occasion HARUS == event_type sesi (fix S4). Mismatch → tolak.
apply_palette(palette_id)                       # terapin pilihan customer
assemble_config()                               # panggil assembler → create DRAFT
```
Server TETAP validasi ulang tiap tool call (enum, tipe, range).

> **Fallback LLM down (fix N3):** kalau extractor LLM timeout/error (mis. 502), JANGAN blok customer. Fallback ke **form manual** (customer isi field langsung). Slot yg udah keisi tetap aman di `intake_session`. Chat/slot-filling = jalur nyaman, form = jalur andal.

## DEFAULT keputusan (diambil Architect, "selesain cepet" — koreksi bebas)
- **#2a Intake = HYBRID** (form fakta keras + chat slot-filling). Alasan: anti salah-ketik tanggal + tetap conversational. Bukan full-chat.
- **#2b Copywriting MASUK MVP tapi OPSIONAL.** Customer bisa skip & isi sendiri. Agent cuma bantu draft, customer approve.
- **#3 (dari OPEN ITEM) "1 revisi" = 1 sesi chat selesai** (bukan per-field) — konsisten dgn Revisi Agent. Masih bisa di-override.

## Di luar scope MVP
- Generate desain/gambar dari nol (SD/DALL-E) — mahal, lambat, rawan jelek. Pakai aset template.
- Rekomendasi template/vibe/warna atas inisiatif agent — estetika 100% customer.
- Sales/Promo/After-Sales/Analytics agent — fase lanjut.
