<!-- SUMMARY (first 7 lines — greppable) -->
# worklog — 2026-07-18 — production CSS rendering repair
> WHAT: Worksheet sesi kerja untuk memperbaiki token CSS dan override marketing.
> STATUS: DONE
> OWNER: Operator
> DEPS: app/globals.css, app/home.module.css
> GREP: css tokens, dark mode, production QA
> UPDATED: 2026-07-18

## Goal sesi
Memulihkan render production landing dan menghapus kontrak dark mode/override obsolete.

## Rencana
1. Konsolidasi token global ke nilai warna langsung yang valid.
2. Hapus seluruh dark definitions dan mobile selectors untuk mock yang sudah dihapus.
3. Build production dan verifikasi runtime.

## Progress log
- [x] Konsolidasi globals.css: satu token contract, tanpa nested hsl.
- [x] Hapus dark blocks home.css dan override dashboardMock/themingCard obsolete.
- [x] Production build berhasil.

## File diubah
- `app/globals.css` — token warna light-only dan base styles deterministik.
- `app/home.module.css` — hapus dark-mode dan obsolete mobile overrides.

## Test dijalanin
- `npm run build` — berhasil, 128 static pages, routes compiled.
- Search CSS — tidak ada `.dark`; tersisa hanya selector visual mock yang masih dipakai.

## Blocker / catatan
- QA browser screenshot perlu dijalankan dari service production pada environment dengan browser attachment.

## Next action
- Jalankan `npm run start -- -p 3100`, browser hydration QA, screenshot widths 1440/390/320, mega menu dan detail route.
