<!-- SUMMARY (first 7 lines — greppable) -->
# template-catalog.md — Katalog & Filter Template (customer-driven)
> WHAT: Cara sajiin & filter katalog template biar CUSTOMER milih sendiri. Grid + filter chip.
> STATUS: LIVE (design, tervalidasi riset)
> OWNER: Operator
> DEPS: design-agent.md, DATABASE_SCHEMA.md (templates)
> GREP: template, katalog, filter, tag, galeri, occasion, style, color, swatch, pakai tema, wizard, buat, pratinjau, manifest, admin, G-062, memorial, tahlilan, countdown, corpus, B-032, I-11, language, bahasa, G-018, english, lang
> UPDATED: 2026-11-11 (s49: guest page language ID / EN on the design families, the classic layout Indonesian, G-018; s48: memorial themes as an occasion with sober defaults, the countdown switch and corpus references, B-032 / I-11; s45: catalog manifests and the read-only admin console, G-062; s33: "Pakai tema" → wizard B-037 di balik `FLAG_CREATION_WIZARD`; sebelumnya 2026-07-15)

## Prinsip
CUSTOMER yang milih template/vibe/warna. Sistem cuma nyajiin katalog + filter jelas. AI NOL peran di sini.

## Verdict (katalog 10-20 template)
**JANGAN pakai search/semantic/embedding.** Cukup **grid galeri + filter tag (chip/swatch)**. Katalog sekecil ini di-scan mata; filter fungsinya nyempitin, bukan nyari. Skip embedding sampai >500 item + query natural-language.

## 3-4 dimensi filter
> **Enum `occasion` = SATU sumber kebenaran (fix S3):** `wedding | birthday | aqiqah | tasyakuran | khitanan | corporate`. HARUS identik dengan jenis acara di design-agent.md schema. Tiap occasion di katalog WAJIB punya schema acara. (aqiqah & tasyakuran dipisah; khitanan pakai schema mirip aqiqah.)

| Dimensi | Peran | UI |
|---|---|---|
| **Occasion** | entry point (wedding/birthday/aqiqah/tasyakuran/khitanan/corporate) | chip/tab atas |
| **Style/Vibe** | diferensiator (elegan/minimalis/rustic/floral/modern/islami/playful) | chip multi-select |
| **Color** | filter visual | **swatch warna** (bukan teks) |
| **Format** (opsional) | portrait/landscape | chip |

Aturan skala kecil: opsi filter langsung terlihat (jangan disembunyiin); multi-select dlm 1 dimensi = OR, antar-dimensi = AND; jangan pernah "0 hasil mati" → greyed-out / "longgarkan filter"; mobile pakai bottom-sheet tray; preview BESAR sebelum pilih.

## Metadata tag template (enum terkontrol)
```json
{
  "id": "tpl-012", "name": "Rustic Garden",
  "thumbnail_url": "...", "preview_url": "...",
  "occasion": ["wedding"],
  "style": ["rustic","floral"],
  "color_palette": ["green","cream"],
  "color_hex": ["#6B8E5A","#F5F0E1"],
  "format": "portrait", "is_premium": false, "sort_order": 12
}
```
- Enum terkontrol per dimensi (~5-8 nilai), JANGAN free-tag. Batasi: 1-2 occasion, 1-3 style, 1-3 color per template.
- `color_hex` dipisah utk render swatch. `sort_order` utk kurasi manual.
- Simpan di Postgres jsonb/array. TIDAK butuh Algolia/Elastic/vector DB.

## Dari kartu ke draf: "Pakai tema" (B-037, D-055; s33)
- Tautan kartu dan halaman tema dibangun `templateUseHref(slug, flag)` (`lib/invitation/template-use-href.ts`).
- `FLAG_CREATION_WIZARD` **mati** (default): `/dashboard/templates/use?slug=<tema>`, jalur lama persis: masuk dulu, lalu draf kosong dari tema dibuat.
- **Menyala:** wizard `/buat/<tema>`: nama sesuai jenis acara, tanggal + jam + zona, dan tema-tema katalog jenis acara itu. Pratinjau (`/buat/pratinjau`) memakai renderer tamu yang asli dari config yang persis akan disimpan, tanpa menyimpan apa pun. Isian hanya ada di cookie HttpOnly milik pengunjung (path `/buat`, 6 jam). Simpan butuh login; tanpa sesi, pengunjung diarahkan masuk/daftar lalu kembali ke `/buat/simpan` dengan isiannya utuh.
- Tautan lama ke `/dashboard/templates/use` dan pemilih tema di dashboard diteruskan ke wizard saat flag menyala.
- Semua pembuatan draf lewat fasad `lib/invitation/creation.ts` (`BACKEND_CONTENT`), dengan kunci pembuatan per pemilik: retry atau ketuk dua kali tetap satu draf.
- Detail dan bukti: `invitation-research/09-masterplan/12-decision-log.md` D-055, `invitation-research/_handoff/IMPLEMENTATION-LOG.md` E-073.

## Catalog manifests and the read-only admin console (G-062; s44–s45)
- **One manifest per catalog template** (`lib/invitation/catalog-manifest.ts`, schema v1): derived from the registry (`templates.ts`), the guest-page palette tokens (`palettes.ts`) and the art register (`theme-art-register.ts`); never hand-edited. It holds identity (id = `config.theme.templateId`, slug = `/templates/<slug>`), tier and the entitlement checkout prices, palette tokens and the card palette, the preset's sections, the G-041 choices within the entitlement, and the G-016 art with each file's SHA-256, size, licence, provenance and review. It is data only: unknown keys, external scripts and remote art are refused, so a manifest can never carry HTML, CSS or a script.
- **Readers:** the admin console and `pnpm harness catalog` only. The public catalog, the guest page and the writers never read a manifest, and an invitation keeps rendering from its stored config (`tests/g062-catalog-manifest.test.ts`, `tests/g062-catalog-admin.test.ts`).
- **Release gate:** `pnpm harness catalog` validates all 64 manifests and hashes every declared art file on disk; a missing or changed file fails with its path. The sandbox app job runs it before the build (`scripts/ci/app.sh`, ADR-O13).
- **Console:** `/admin/<entry>/templates` lists every entry (refused manifests first in an alert, then the table): validation status, tier → entitlement, palette, art pool, review state and the seeded `templates` row (missing, or a premium flag that disagrees with the tier). `/admin/<entry>/templates/<slug>` shows the palette tokens, tier, choices, every art file with its prompt, original digest and crop, the provenance and, for a refused manifest, its problems and the derived candidate. ID / EN follow the console locale.
- **Authorization:** both pages check the private entry and the administrator role on the server before reading anything, in addition to the console layout (a page can be requested on its own). Signed out: the proxy redirects to `/sign-in`; a signed-in non-administrator, a guessed entry and an unknown slug get the private 404. A client-side (flight) request is answered by Next with status 200 and the 404 fallback inside, carrying no catalog data; the page's own check is what protects it, because a soft navigation renders the page without re-running the console layout (s46 browser acceptance).
- **Review state:** the art records carry the agent's self-review (ADR-O09); the owner's review is pending, and the console says so per file. **Publishing from the console does not exist yet:** it needs a recorded owner review, schema and identity checks, asset integrity and a rollback to the prior valid version (backlog G-062, step 2).
- **Rollback:** revert the console pages; the manifests and the gate are additive and change nothing a template renders.

## Memorial (tahlilan) themes: an occasion, not an event type (B-032 / I-13, I-11; s47–s48, D-068)
- **Occasion:** a `tahlilan` theme (today `149 doa-khusyuk`) creates a `tasyakuran` invitation whose config says `settings.occasion = 'memorial'` (`lib/invitation/occasion.ts`). Pricing, publishing, entitlements and both content writers keep reading the event type; the wizard, preview, editor, profile, theme offer and guest page read the occasion for their own words (`MEMORIAL_COPY`: "Undangan Tahlilan & Doa", "Nama almarhum/almarhumah", "Dalam Kenangan"). Absent = the event type's own occasion, so every invitation stored earlier, memorials included, renders as before.
- **Sober start:** music, gift and the countdown off, no preset opening words (the family writes its own), first event "Tahlilan & Doa Bersama", Gapura when F-02 chooses a family, and only memorial themes in the wizard and the theme tab. A celebration theme on `tasyakuran` (for example `syukur-hangat`) is created exactly as before, and typed names never carry between a celebration's and a memorial's wizard.
- **Countdown switch:** `settings.countdown: false` hides only the countdown; the add-to-calendar links stay for a published invitation's future first event. Any host can switch it on any invitation.
- **Religious text (I-11):** only as an owner-approved entry of `content/verified-religious-texts/corpus.json`, referenced by `quote.corpusId` and printed with its provenance on the design families; the corpus is empty, so no theme or page shows one. The frozen legacy layout shows only the host's typed quote (D-041).
- **Rollback:** revert the code; no flag or migration. The previous schema drops the three keys on the next save, so a memorial created meanwhile falls back to the event type's words and countdown; host-written content is kept.

## Guest page language, Indonesian or English (G-018 / I-31; s48–s49, E-092)
- **One resolver:** `guestPageLanguage(config)` in `lib/invitation/guest-copy.ts` decides the language of every guest surface of an invitation: the page, its `<html lang>` (the proxy marks guest routes, the root layout reads the invitation), title, Open Graph locale and text, `og.png`, the `.ics` entry and the QR pass. A design family follows `settings.language` (`id` | `en`, unset = `id`); the classic layout is frozen (D-041) and always Indonesian, whatever is stored. One invitation never mixes languages.
- **Words:** every product word and accessible label comes from the dictionary (`GUEST_COPY.id` / `.en`, islands included through typed label props). Dates use the event's own time zone in the language's locale. Never translated: anything the host writes (names, titles, event names, programme items, wishes, the quote) and approved corpus text.
- **Editor:** Tema & Cover → "Bahasa halaman tamu", saved as an explicit `settings.language` through the normal save on both writers; on the classic layout it says the page stays Indonesian until a family is chosen.
- **404s:** a guest route that finds no invitation, guest or pass answers in the visitor's own locale (heading, title and `lang` once hydrated), because there is no invitation to speak for.
- **Byte-identity:** an Indonesian family page carries no extra `lang` on its layout root (`view.contentLang` is set only for English), so unset, explicit `id` and flag-off pages are byte-identical to before G-018.
- **Rollback:** `FLAG_GUEST_LANGUAGE=off` renders every page Indonesian and hides the editor's choice; the stored preference is neither read nor removed.

## Sumber (tervalidasi)
- NN/G filter categories & mobile faceted tray, Prefixbox faceted filtering, Minted/Greenvelope/Canva taksonomi (occasion+style+color), Redis semantic-vs-keyword.
