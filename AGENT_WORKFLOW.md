<!-- SUMMARY (first 7 lines — greppable) -->
# AGENT_WORKFLOW.md — Alur Kerja Baku
> WHAT: Alur standar tiap sesi kerja agent di project ini. Tag `@AGENT_WORKFLOW.md`.
> STATUS: LOCKED
> OWNER: Architect
> DEPS: AGENTS.md, docs/worklog/_TEMPLATE.md
> GREP: workflow, loop, review, worklog, milestone, checklist
> UPDATED: 2026-07-14

## Loop tiap sesi (wajib urut)
1. **Orient** — baca AGENTS.md router → buka doc sistem yang relevan → cek OPEN ITEMS di PROJECT_OVERVIEW.md.
2. **Worklog** — buka sesi baru di `docs/worklog/` dari `_TEMPLATE.md`. Isi goal + rencana.
3. **Implement** — tulis kode + test targeted barengan. Ikutin doc sistem.
4. **Run the app** — JALANIN beneran. Test manual + otomatis. Fix sampai ijo.
5. **Self-heal docs** — update doc sistem yang kesentuh di sesi ini. Jaga 7-line summary tetap akurat.
6. **Worklog close** — catat hasil, file yang diubah, next action. Commit worklog bareng kode.
7. **Milestone? → Guardian review** — kalau ini akhir fase, minta Guardian review sebelum lanjut.

## 4 titik review (cross-agent, penulis ≠ reviewer)
`research → plan → implementation → wrap-up`
Tiap titik, Guardian review pakai persona di `docs/review/review-personas.md`.

## Prinsip
- Gagal 2x pendekatan sama → STOP, diagnosa root cause, ganti pendekatan. Jangan nambal.
- Keputusan belum final → JANGAN tebak. Angkat ke Architect / cek OPEN ITEMS.
- Semua artifact (kode, doc, worklog) di-commit bareng, satu unit kerja.
