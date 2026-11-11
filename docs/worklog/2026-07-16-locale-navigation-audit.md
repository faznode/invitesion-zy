<!-- SUMMARY (first 7 lines — greppable) -->
# worklog — 2026-07-16 — locale resolver and navigation audit
> WHAT: Auto-locale resolver, private admin navigation repair, and Guardian route audit.
> STATUS: DONE
> OWNER: Architect
> DEPS: middleware.ts, lib/i18n.ts, dashboard/admin routes
> GREP: locale, navigation, admin-entry, 404
> UPDATED: 2026-07-16

## Goal sesi
Menghilangkan bahasa UI yang berubah tanpa dasar, memperbaiki menu/redirect yang menuju route tidak ada, dan memverifikasi hasil live.

## Progress log
- [x] Locale policy dibuat: trusted country header → `Accept-Language` → Indonesia.
- [x] Middleware meneruskan `x-vienne-locale`; cookie tidak lagi menjadi sumber keputusan yang mengalahkan sinyal request.
- [x] Login customer dan private admin memakai locale resolver yang sama.
- [x] Private admin memiliki shell/sidebar yang hanya menunjuk route nyata; Profile legacy redirect ke Akun.
- [x] Redirect customer→admin memakai `getPrivateAdminPath()`, bukan `/admin` publik yang memang 404.
- [x] Guardian menemukan CTA preview `/i/[slug]` tanpa renderer; CTA dicabut sampai renderer publik riil dibangun.
- [x] Landing `/` ditambahkan supaya fallback 404 tidak berulang ke route tidak ada.

## File diubah
- `middleware.ts`, `lib/i18n.ts`, `lib/locale-server.ts` — resolver locale request-driven.
- `app/(login)/*` — login locale-aware.
- `app/(admin)/admin/[entry]/*` — private sidebar dan redirect compatibility.
- `app/(customer)/dashboard/*` — redirect admin aman; CTA preview palsu dihapus.
- `app/page.tsx`, `app/not-found.tsx` — landing dan fallback valid.

## Test dijalanin
- `pnpm build` — PASS.
- Live: `/` = 200, `/dashboard/customer` = 404, `/admin/nope` = 404.
- Live: `id-ID` menghasilkan `Masuk ke akunmu`; `en-GB` menghasilkan `Sign in to your account`.

## Blocker / catatan
- Nginx production belum menerima header country dari CDN; production otomatis memakai `Accept-Language` sampai geo/CDN disediakan.
- Banyak halaman dashboard admin/customer masih ber-copy Indonesia-only atau campur. Jangan klaim i18n seluruh panel selesai; lanjutkan dictionary/provider per page sebelum membuka locale EN untuk dashboard secara penuh.
- Modul screenshot (acara, musik, galeri, kado, ucapan, streaming) belum punya control-center/data model real; jangan munculkan sebagai menu palsu.

## Next action (buat penerus)
- Implementasi i18n terstruktur untuk customer dashboard + admin routes, termasuk enum status/event type.
- Bangun renderer publik `/i/[slug]` sebelum menambahkan kembali tombol preview.
