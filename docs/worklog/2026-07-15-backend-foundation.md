# Worklog — 2026-07-15 — Backend Foundation up

## Keputusan
- ORM: **Drizzle** (bukan Prisma). Ikut fondasi nextjs/saas-starter biar backend cepat jalan (whyme).
- Fondasi: clone `nextjs/saas-starter` (MIT, Next.js 15 + Postgres + Drizzle + shadcn/ui) ke root project, docs dipertahankan.

## Yang udah JALAN (terverifikasi HTTP nyata)
- `pnpm install` OK (Node 22, pnpm 10).
- Postgres via Docker: container `invitation-pg`, port **5433**, db `invitation`, user `dev`/`devpass`.
- `.env` dibuat (POSTGRES_URL asli; Stripe/AUTH_SECRET dummy dev).
- `pnpm db:migrate` sukses → 5 tabel: users, teams, team_members, activity_logs, invitations.
- `pnpm dev` boot (Next 15.6 canary, Turbopack, Ready 576ms).
- Route check:
  - `GET /` → 200 (72KB landing)
  - `GET /sign-in` → 200
  - `GET /api/user` → 200 (null, session handling OK)
  - `GET /pricing` → **500 EXPECTED** = Stripe dummy key (StripeAuthenticationError). Bukan bug fondasi.

## Catatan penting buat fase berikut
- ⚠️ Schema starter BEDA MAKNA: `teams`/`invitations` di starter = team-invite + subscription. Domain kita B2C one-time, `invitations` = produk undangan digital. Domain layer HARUS dirombak.
- Stripe ditanam dalam (checkout/webhook/portal/subscription) → cabut, ganti **Midtrans one-time**.
- Belum ada: AI agent, renderer config→HTML, template undangan, Fonnte WA, guest/RSVP/slug.

## Next step (urut)
1. Rombak schema Drizzle → domain kita (DATABASE_SCHEMA.md kanonik): users(+phone), templates, invitations(config), invitation_versions, guests, orders, conversations/messages, customer_memory, customer_session_summary, intake_session.
2. Cabut Stripe → Midtrans (one-time, bukan subscription). Buang layer teams/subscription.
3. Baru AI agent (design-agent.md) + template catalog + renderer.

## Cara nyalain lagi
```
docker start invitation-pg   # kalau mati
cd <project> && pnpm dev
```
