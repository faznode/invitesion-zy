<!-- SUMMARY (first 7 lines — greppable) -->
# worklog — 2026-07-18 — marketing light route audit
> WHAT: Remove theme UX, refresh homepage visual, and verify advertised routes.
> STATUS: DONE
> OWNER: Operator
> DEPS: app/layout.tsx, app/page.tsx, app/marketing-header.tsx
> GREP: worklog, theme, homepage, routes, 404
> UPDATED: 2026-07-18

## Goal sesi
Ship one coherent light experience, an original non-dashboard hero visual, and verified internal navigation without masking unknown routes.

## Progress log
- [x] Removed theme provider, startup script, toggles, and user-facing theme components.
- [x] Replaced dashboard/wedding preview with an original editorial event-brief canvas.
- [x] Audited marketing navigation destinations against the App Router manifest.
- [x] Built production app and live-tested public routes plus unknown-route 404.
- [x] Browser-verified desktop and mobile homepage.

## File diubah
- `app/layout.tsx` — force coherent light color scheme; remove theme runtime.
- `app/marketing-header.tsx` — remove theme toggle from public navigation.
- `app/(customer)/dashboard/customer-shell.tsx` — remove theme controls.
- `app/(admin)/admin/[entry]/admin-shell.tsx` — remove theme controls.
- `app/page.tsx`, `app/home.module.css` — original event-brief hero visual.
- `components/theme-{provider,toggle}.tsx` — removed obsolete theme feature.

## Test dijalanin
- `npm run build` — pass.
- Live HTTP audit: `/`, `/pricing`, `/resources`, `/sign-in`, `/sign-up` return 200; unknown route returns 404.
- Browser desktop/mobile screenshot verification — pass.

## Blocker / catatan
- Existing checkout had no `.git`; initialized repository locally to provide requested commit.
- Existing dark utility classes remain inert because no runtime can apply `.dark`; removing all dormant Tailwind variants was outside the UX feature scope.

## Next action
- None.
