<!-- SUMMARY (first 7 lines — greppable) -->
# review-personas.md — Persona Review Guardian
> WHAT: Lensa review Guardian tiap milestone. Penulis ≠ reviewer.
> STATUS: LIVE
> OWNER: Guardian
> DEPS: AGENT_WORKFLOW.md (4 titik review)
> GREP: review, persona, guardian, security, quality, checklist
> UPDATED: 2026-07-14

## Kapan review
4 titik (dari AGENT_WORKFLOW.md): research → plan → implementation → wrap-up.
Guardian (opus-4.8) review, HARUS sesi berbeda dari Operator yang nulis.

## Persona (pandang kode dari tiap lensa)
1. **Maintainability** — struktur jelas? Naming? Ada dead code / over-engineering? Config-driven template kejaga?
2. **Code Quality** — DRY, error handling, edge case, tipe kuat (TS strict).
3. **Security** — input validation, webhook signature (Midtrans), no secret di URL/log, no SQL injection (Prisma param), auth role guard (`/admin` vs `/customer`), moderasi upload foto.
4. **Performance** — N+1 query, index DB (slug, email, order_id), rate-limit WA blast, caching Redis.
5. **AI Smells** — kode yang "kelihatan bener tapi ngasal": fungsi gak kepakai, komentar bohong, test yang gak beneran nge-test, output AI yang gak divalidasi ulang di server.
6. **Domain Expert (undangan/payment ID)** — flow bayar one-time bener? Idempotency webhook? Slug anti-collision jalan? Expired→read-only bener?

## Output review
- PASS / CHANGES NEEDED / BLOCK + daftar temuan per-persona (severity: critical/major/minor).
- Critical/major wajib fix sebelum lanjut fase.
- Guardian update doc sistem yang kesentuh kalau nemu ketidaksesuaian.
