<!-- SUMMARY (first 7 lines — greppable) -->
# worklog — 2026-07-17 — RSVPify feature expansion
> WHAT: Audit public RSVPify menus and implement Invitesion event-platform slices
> STATUS: IN PROGRESS
> OWNER: Architect
> DEPS: PROJECT_OVERVIEW.md, DATABASE_SCHEMA.md, detail-config.ts
> GREP: rsvpify, feature expansion, invitation-scoped
> UPDATED: 2026-07-17

## Goal sesi
Membaca inventaris fitur publik RSVPify secara legal, memetakan ke arsitektur Invitesion, dan membangun fitur yang dapat dipakai tanpa mengklaim fitur/integrasi yang belum tersedia.

## Fase / task
Inventory → architecture → control center → core operations → advanced operations → review.

## Rencana
1. Normalisasi menu publik RSVPify dan sumber URL.
2. Jaga semua operasi customer scoped ke invitation ID; jangan gunakan undangan terbaru secara implisit.
3. Implement control center per undangan sebagai vertical slice pertama.
4. Tambahkan operasi inti dengan schema/endpoint/UI nyata, satu slice per increment.
5. Build, test, live QA, lalu Guardian review.

## Progress log
- [x] Audit baseline project, schema, existing invitation editor/planner/guests.
- [x] Temukan bug scope global pada dashboard/guests (memakai invitation pertama/terbaru).
- [ ] Finalisasi feature matrix dan arsitektur.
- [ ] Implement control center.
- [ ] Implement core operations.
- [ ] Implement advanced operations.
- [ ] Build/deploy/live QA/review.

## File diubah
- `docs/worklog/2026-07-17-rsvpify-platform-expansion.md` — worklog sesi.

## Test dijalanin
- Public RSVPify search/index crawl — completed.
- Project schema/editor/dashboard audit — completed.

## Blocker / catatan
- RSVPify main domain can challenge public access; no bypass and no authentication material used.
- Project decision is one-time payment, not subscription; ticketing/payment must respect this.
- Existing global `/dashboard/guests` is not safe for multi-invitation scope and needs migration/redirect design.

## Next action (buat penerus)
- Write feature matrix/plan, then implement invitation-scoped control center.
- Await public research subagent report before closing inventory.
- Do not read or use uploaded cookie/session material.
i
