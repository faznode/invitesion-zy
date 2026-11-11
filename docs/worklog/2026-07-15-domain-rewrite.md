# Worklog — 2026-07-15 — Domain Rewrite (starter → B2C)

## Ringkasan
Rombak domain layer dari `nextjs/saas-starter` (teams + Stripe subscription) ke model bisnis kita (B2C undangan digital, one-time payment). Fondasi + auth sekarang boot bersih tanpa sisa konsep team/Stripe.

## Yang dikerjain
1. **Schema Drizzle** — `lib/db/schema.ts` full replace ke domain B2C. Generate migration `0000_*.sql`, apply ke DB kosong (schema `public` di-reset dulu). **17 tabel** kebikin: users, templates, invitations, invitation_versions, guests, guest_messages, orders, payments, conversations, messages, customer_memory, customer_session_summary, intake_session, agent_tasks, wa_log, media_assets, analytics_events.
2. **Auth dirombak** — buang teams/team_members/subscription. `actions.ts`, `middleware.ts`, `queries.ts` ditulis ulang: sign-in/up, updatePassword, deleteAccount (soft-delete), updateAccount. Role `CUSTOMER`/`ADMIN`. Copy UI di-Indonesia-in.
3. **File Stripe/team dihapus** — `app/api/stripe`, `app/api/team`, `app/(dashboard)/pricing`, `lib/payments`. Payment nanti diganti Midtrans.
4. **Dashboard di-stub** — `dashboard/page.tsx` + `activity/page.tsx` jadi placeholder customer (buang Team Settings/Subscription/Members). Nav diganti: Undangan/Umum/Aktivitas/Keamanan.
5. **Seed** — historical default credential removed on 2026-07-16; use explicit environment credentials only.

## Security fix
- `/api/user` bawaan starter **membocorkan `passwordHash`** ke client (dipake SWR di browser). Ditambal: route buang `passwordHash` sebelum `Response.json`. Diverifikasi — hash gak lagi muncul di response.

## Verifikasi (real)
- `pnpm db:migrate` sukses, `\dt` = 17 tabel domain.
- `pnpm db:seed` sukses, admin masuk DB.
- Dev server Ready in 579ms (Next 15.6 canary + Turbopack).
- Route: `/` 200, `/sign-in` 200, `/sign-up` 200, `/dashboard` 307 (redirect ke sign-in, bener), `/api/user` 200 (null tanpa session).
- Session valid (JWT manual id=1) → `/api/user` 200 load user, `passwordHash` NOT leaked ✅.

## Sisa / next
- Cabut sisa dep Stripe di `package.json` (paket masih keinstall, tinggal buang).
- Bangun Midtrans one-time payment (ganti `/pricing`).
- Fitur inti: AI agent chat, template renderer (config→HTML), Fonnte WA, guest/RSVP/slug publik, customer-memory 3 lapis.
- `.env` Stripe/auth masih dummy — auth secret real perlu di-set sebelum prod.
