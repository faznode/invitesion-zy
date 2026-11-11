<!-- SUMMARY (first 7 lines — greppable) -->
# worklog — 2026-07-18 — public navigation
> WHAT: Melengkapi seluruh route mega-menu dengan halaman publik khusus berbasis registry.
> STATUS: DONE
> OWNER: Operator
> DEPS: app/marketing-header.tsx, app/marketing-registry.ts
> GREP: worklog, navigation, registry, public routes, 404
> UPDATED: 2026-07-18

## Goal sesi
Setiap item mega-menu menuju URL khusus yang bermakna; slug tak terdaftar tetap 404.

## Fase / task
Perbaikan kelengkapan navigasi marketing setelah commit b96e22c.

## Rencana
1. Pusatkan metadata dan href item di registry.
2. Buat index/detail route dinamis ketat, build, audit HTTP, dan screenshot.

## Progress log
- [x] Orientasi workflow dan audit header lama.
- [x] Registry 92 detail publik: 50 jenis acara, 28 fitur, 14 resource/company.
- [x] Index aksesibel untuk `/event-types`, `/features`, dan `/resources`.
- [x] Dynamic params dibatasi ke registry; slug acak dan root acak 404.
- [x] Build produksi, live HTTP audit, dan screenshot desktop/mobile/detail.

## File diubah
- `app/marketing-registry.ts` — sumber metadata, slug, dan href terpusat.
- `app/marketing-header.tsx` — semua item memakai href registry; Contact tetap mailto.
- `app/marketing-public-page.tsx` — presentasi detail bersama.
- `app/{event-types,features,resources}/...` — index dan detail publik.
- `docs/navigation-route-audit.json` — hasil audit HTTP.
- `docs/worklog/assets/2026-07-18-public-navigation/*.png` — bukti visual.

## Test dijalanin
- `npm run build` — lulus, 128 static pages generated.
- Live app `next start` port 3319 — ready.
- Audit curl terprogram — 99/99 internal route unik HTTP 200.
- Negative curl — `/features/random-never-registered` dan `/random-root-never-registered` HTTP 404.
- Chromium screenshots — homepage desktop 1440px, mobile 390px, detail feature 1440px.

## Blocker / catatan
- Browser tool Obscura tidak mendukung screenshot; bukti dibuat dengan Chromium Playwright lokal.
- Warning baseline-browser-mapping lama dan middleware deprecated sudah ada, tidak memblokir build.

## Next action (buat penerus)
- Tidak ada; siap review Guardian.
