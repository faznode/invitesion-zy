<!-- SUMMARY (first 7 lines — greppable) -->
# INDEX.md — Peta Semua Docs
> WHAT: Daftar isi semua dokumentasi project. Cari doc dari sini.
> STATUS: LIVE
> OWNER: Architect
> DEPS: semua doc
> GREP: index, toc, daftar, docs, map
> UPDATED: 2026-07-14

## Root
- `README.md` — ringkasan repo: produk, stack, cara menjalankan, peta folder
- `AGENTS.md` — router utama (baca pertama)
- `AGENT_WORKFLOW.md` — alur kerja baku tiap sesi
- `archive/README.md` — file pensiun (README starter template, tokens brand lama); tidak dipakai kode

## Docs inti
- `docs/PROJECT_OVERVIEW.md` — keputusan terkunci + OPEN ITEMS + arsitektur 3 panel
- `docs/DATABASE_SCHEMA.md` — skema DB (Drizzle; ORM decision 2026-07-15)
- `docs/AUDIT-2026-07-27.md` — audit keamanan/performa/deployment, severity + skenario serangan
- `docs/specs/REBUILD-HANDOFF-A-Z.md` — spesifikasi rebuild A–Z (dipindah dari root, 2026-10-29)
- `docs/specs/invitation-detail-backend-v1.md` — spesifikasi backend detail undangan v1

## Sistem (baca sesuai task)
- `docs/systems/payment.md` — **QRIS (lokal) + Stripe (internasional)**, webhook idempotent, gate bayar. Midtrans dibatalkan 2026-07-27
- `docs/systems/wa-delivery.md` — Fonnte, blast, provider abstraction
- `docs/systems/ai-agents.md` — Design Agent + Revisi Agent, tool-calling, versioning
- `docs/systems/design-agent.md` — spec lengkap Design Agent (intake+assembler, slot-filling, schema per acara)
- `docs/systems/template-catalog.md` — katalog & filter template (customer-driven)
- `docs/systems/customer-memory.md` — memori per-customer (rolling summary), fondasi after-sales
- `docs/systems/guest-management.md` — guest, slug anti-collision, RSVP, import CSV
- `docs/systems/auth.md` — **Clerk** + identitas lokal, JIT provisioning, role tetap di database

## Review & proses
- `docs/review/review-personas.md` — persona review Guardian
- `docs/worklog/_TEMPLATE.md` — template worksheet sesi
- `docs/worklog/2026-07-26-bug-audit-and-public-renderer.md` — audit bug admin+customer, jalur create invitation, renderer publik `/i/`, + OPEN ITEMS harga & event-blueprint
- `docs/worklog/2026-07-27-audit-build-repair-and-publish-path.md` — compile blocker (`lib/storage/uploads` hilang), `AUTH_SECRET` tanpa validasi, XSS upload SVG, jalur publish/unpublish
- `docs/worklog/2026-07-27-storage-drivers-tests-and-ui-unification.md` — driver storage lokal+S3 (SigV4 diuji vektor AWS), 30 test pertama, rate limit sign-in, palet `brand-*`, dark mode di-scope
- `docs/worklog/2026-07-27-payment-qris-stripe.md` — Midtrans dibatalkan; QRIS + Stripe, settlement idempotent 2 lapis, gate bayar di domain, CSP nonce
- `docs/worklog/2026-07-27-clerk-auth-migration.md` — auth pindah ke Clerk; identitas tetap lokal via `clerk_user_id`, role tetap di database, JIT provisioning
