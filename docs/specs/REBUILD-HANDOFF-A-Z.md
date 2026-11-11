# Invitesion Invitation Platform — Rebuild Handoff A–Z

> **Tujuan dokumen:** source-of-truth untuk agent lain yang akan rebuild project ini dari nol atau memindahkan implementasinya ke codebase baru.
>
> **Baca seluruh dokumen sebelum coding.** Jangan mengubah keputusan terkunci tanpa menandainya sebagai perubahan arsitektur.
>
> **Status:** product/architecture spec + handoff implementasi. Beberapa komponen sudah ada di codebase saat ini, tetapi **public invitation renderer `/[slug]` belum dianggap selesai** sampai benar-benar dirender dan diverifikasi live.
>
> **Bahasa produk:** Bahasa Indonesia sebagai default; English dapat disediakan melalui locale switch.
>
> **Produk:** SaaS undangan digital Indonesia, one-time payment, multi-event, customer self-service, AI Design Agent + AI Revisi Agent via WhatsApp.

---

## 0. Ringkasan Eksekutif

Invitesion adalah platform untuk membuat, mengedit, menerbitkan, dan mengoperasikan undangan digital Indonesia.

Customer dapat:

1. memilih jenis acara;
2. memilih template, gaya, dan palette sendiri;
3. mengisi data acara melalui form dan/atau chat intake;
4. mengunggah foto, QRIS, dan media melalui file upload nyata;
5. melihat preview;
6. menyimpan draft;
7. membayar sekali untuk mengaktifkan undangan;
8. menerbitkan URL publik;
9. mengimpor daftar tamu;
10. mengirim link unik per tamu melalui WhatsApp;
11. menerima RSVP, ucapan, tracking kunjungan, dan check-in;
12. meminta revisi melalui WhatsApp dengan kuota maksimal 3 revisi;
13. memakai dashboard customer untuk mengelola seluruh undangan miliknya.

Ada empat surface yang harus dipisahkan:

| Surface | URL | Audience | Auth |
|---|---|---|---|
| Marketing landing | `/` | Publik/calon customer | Tidak |
| Customer dashboard | `/dashboard/*` | Customer | Session server-side |
| Admin | `/admin/<entry>/*` | Tim internal | Private entry + role ADMIN |
| Public invitation | `/i/:invitationSlug/:guestSlug` | Tamu | Tidak |

**Penting:** customer route canonical adalah `/dashboard`, bukan `/customer`. Ownership selalu berdasarkan session server-side, bukan prefix URL.

---

## 1. Keputusan Produk yang Tidak Boleh Diubah Diam-Diam

### 1.1 Model bisnis

- One-time payment, **bukan subscription**.
- Customer membeli satu undangan/event.
- Satu email = satu account customer.
- Satu customer dapat mempunyai banyak undangan.
- Setiap undangan baru mempunyai order/payment baru.
- Masa aktif undangan: 12 bulan.
- Setelah expired:
  - public invitation masih bisa dilihat;
  - status menjadi `READ-ONLY`;
  - RSVP ditutup;
  - guestbook ditutup;
  - data tamu tetap tersimpan;
  - tampilkan hook untuk memperpanjang.

### 1.2 Pembayaran

- Provider MVP: Midtrans Snap.
- Webhook/server notification adalah source of truth.
- Redirect browser tidak boleh membuat akun atau menganggap payment sukses.
- Webhook harus idempotent.
- `orders.midtrans_order_id` unique.
- `users.email` unique.
- Signature Midtrans diverifikasi SHA512.
- Status Midtrans harus di-requery via Get Status API sebelum menandai order paid.
- Buat/update order dan auto-create account dalam transaksi database.
- Abstraksikan payment provider agar dapat diganti ke Xendit/Tripay tanpa mengubah domain logic.

### 1.3 AI

MVP hanya mempunyai dua agent:

1. **Design Agent** — intake + assembler config.
2. **Revisi Agent** — perubahan config melalui WhatsApp.

Jangan membuat AI Sales, Promo, After-Sales, atau Analytics di MVP.

AI **tidak pernah menghasilkan HTML**. AI hanya menghasilkan structured data atau memanggil tool sempit. Renderer deterministik mengubah config menjadi HTML.

### 1.4 Customer memilih desain

Customer memilih sendiri:

- template;
- vibe/style;
- warna/palette;
- data dan copy final.

Agent tidak boleh merekomendasikan atau mengganti template, vibe, atau palette atas inisiatif sendiri. Agent adalah intake + assembler, bukan creative decision maker.

### 1.5 URL tamu

Format canonical:

```text
/i/:invitationSlug/:guestSlug
```

Contoh:

```text
/i/wedding-andi/budi-santoso
```

Aturan:

- guest slug berasal dari nama tamu melalui `slugify`;
- tidak memakai token rahasia untuk MVP;
- collision diselesaikan dengan suffix `-2`, `-3`, dst.;
- unique hanya dalam satu invitation: `UNIQUE(invitation_id, slug)`;
- `guest_name` bukan bagian config invitation; di-inject saat render dari tabel guests;
- link tamu menampilkan personalisasi dan dapat mengisi nama RSVP secara pre-filled serta disabled.

### 1.6 WhatsApp

- MVP memakai Fonnte karena murah dan praktis.
- Semua kirim pesan wajib melalui interface `WhatsAppProvider`.
- Jangan hardcode Fonnte ke domain logic.
- Risiko banned ditangani dengan nomor khusus, rate limit, jeda pesan, warm-up, dan tidak spam.
- Open decision: nomor platform tunggal atau customer connect nomor sendiri. Jangan finalisasi `wa_devices` sebelum keputusan ini dibuat.

---

## 2. Tech Stack Canonical

### Frontend/backend application

- Next.js 14 App Router
- TypeScript
- React
- Tailwind CSS + shadcn/ui untuk primitives
- Auth session server-side
- Zod untuk validation
- Drizzle ORM
- PostgreSQL
- pnpm

### Async/AI/integrations

- Redis + BullMQ untuk queue/job jika dibutuhkan
- LangGraph untuk orchestration agent
- Midtrans untuk payment
- Fonnte untuk WhatsApp MVP

### Recommended supporting libraries

- `lucide-react` untuk icon
- `jose` atau auth library yang dipilih untuk signed session/magic link
- CSV parser untuk guest import
- image/media metadata parser dan MIME validation
- QR code generator

### Engineering rules

- Semua data request divalidasi server-side.
- Semua resource query scoped by current authenticated customer.
- Tidak boleh commit secret, token, password, private key, atau raw credential.
- Jangan menyimpan upload customer di `public/` sebagai storage runtime.
- Jangan mengandalkan build saja sebagai bukti feature selesai.

---

## 3. Struktur Repository yang Direkomendasikan

```text
vienne-invitation-platform/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   ├── pricing/page.tsx
│   │   └── ...
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   ├── sign-up/page.tsx
│   │   └── ...
│   ├── (customer)/dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── invitations/page.tsx
│   │   ├── invitations/[id]/page.tsx
│   │   ├── invitations/[id]/edit/page.tsx
│   │   ├── invitations/[id]/guests/page.tsx
│   │   ├── invitations/[id]/planner/page.tsx
│   │   ├── planner/page.tsx
│   │   ├── templates/page.tsx
│   │   └── profile/page.tsx
│   ├── (public-invitation)/i/[invitationSlug]/[guestSlug]/page.tsx
│   ├── admin/[entry]/...
│   ├── api/
│   │   ├── auth/...
│   │   ├── invitations/[id]/...
│   │   ├── guests/...
│   │   ├── media/[...path]/route.ts
│   │   ├── payments/...
│   │   ├── webhooks/midtrans/route.ts
│   │   └── webhooks/fonnte/route.ts
│   └── media/[...path]/route.ts
├── components/
│   ├── marketing/
│   ├── dashboard/
│   ├── invitation-editor/
│   ├── invitation-renderer/
│   ├── guests/
│   └── ui/
├── lib/
│   ├── auth/
│   ├── db/schema.ts
│   ├── invitation/
│   │   ├── config-schema.ts
│   │   ├── service.ts
│   │   ├── renderer.ts
│   │   ├── module-visibility.ts
│   │   └── detail-config.ts
│   ├── agents/
│   ├── payments/
│   ├── whatsapp/
│   ├── storage/
│   └── validation/
├── drizzle/
├── public/
│   ├── fonts/
│   └── static-assets/
├── storage/uploads/                 # runtime, di luar public/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── scripts/
├── .env.example
├── AGENTS.md
├── package.json
└── README.md
```

---

## 4. Environment Variables

Gunakan `.env.example`, jangan commit `.env`.

```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgres://...
REDIS_URL=redis://...
AUTH_SECRET=generate-a-random-secret
ADMIN_ENTRY_PATH=private-admin-entry
ADMIN_ALLOWED_EMAILS=

MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_WEBHOOK_SECRET=

FONNTE_TOKEN=
FONNTE_BASE_URL=https://api.fonnte.com

UPLOAD_ROOT=./storage/uploads
MAX_UPLOAD_BYTES=5242880
```

Aturan:

- secret diisi oleh environment/deployment, bukan markdown source;
- jangan menaruh credential di URL;
- auth/payment/WA secrets wajib server-only;
- preview bypass hanya boleh aktif di controlled staging dan tidak boleh terikut production.

---

## 5. Domain Model dan Database

### 5.1 Prinsip data

- `invitations.config` adalah source of truth isi undangan.
- Renderer deterministik membaca config.
- Setiap revisi AI membuat row `invitation_versions` baru.
- Operational settings boleh berada sebagai additive section di config.
- Live guest submissions, RSVP state, check-in, delivery status, payment, dan analytics tetap DB-owned; config tidak boleh memalsukan status provider atau live records.

### 5.2 Tabel canonical

```text
users
  id
  email UNIQUE
  phone UNIQUE nullable
  password_hash
  role: CUSTOMER | ADMIN
  created_at

templates
  id
  name
  category: wedding | birthday | aqiqah | tasyakuran | khitanan | corporate
  default_config jsonb
  thumbnail
  is_premium
  created_at

invitations
  id
  user_id -> users
  template_id -> templates
  slug UNIQUE
  event_type
  config jsonb
  status: DRAFT | PUBLISHED | EXPIRED
  revision_count default 0
  published_at
  expires_at
  created_at

invitation_versions
  id
  invitation_id -> invitations
  version_no
  config jsonb
  created_by: customer | ai-agent
  is_live
  created_at

media_assets
  id
  invitation_id -> invitations
  type: photo | video | music
  asset_id/path
  url-or-serving-reference
  meta jsonb
  created_at

guests
  id
  invitation_id -> invitations
  name
  slug
  phone
  category
  qr_code
  sent_at
  opened_at
  opened_count
  rsvp_status: PENDING | CONFIRMED | DECLINED
  guest_count
  checked_in_at
  UNIQUE(invitation_id, slug)

guest_messages
  id
  invitation_id -> invitations
  guest_id nullable -> guests
  name
  message
  is_hidden
  created_at

orders
  id
  user_id -> users
  invitation_id nullable -> invitations
  tier
  amount
  status: PENDING | PAID | FAILED
  midtrans_order_id UNIQUE
  created_at

payments
  id
  order_id -> orders
  provider
  transaction_id
  status
  raw_payload jsonb
  created_at

conversations
  id
  customer_phone
  invitation_id nullable -> invitations
  channel: wa
  state
  created_at

messages
  id
  conversation_id -> conversations
  sender_type: customer | agent
  content
  created_at

agent_tasks
  id
  invitation_id -> invitations
  type: DESIGN | REVISION
  status
  input jsonb
  output jsonb
  version_id nullable -> invitation_versions
  created_at

wa_log
  id
  invitation_id -> invitations
  guest_id nullable -> guests
  direction: out | in
  status
  payload jsonb
  created_at

customer_memory
  id
  user_id UNIQUE -> users
  preferensi jsonb
  last_interaction_at
  updated_at

customer_session_summary
  id
  user_id -> users
  conversation_id -> conversations
  invitation_id nullable -> invitations
  summary <= 300 chars
  next_action nullable
  status: draft | confirmed
  created_at

analytics_events
  id
  invitation_id -> invitations
  guest_id nullable -> guests
  event_type: VIEW | RSVP | GUESTBOOK | CHECKIN
  meta jsonb
  created_at

intake_session
  id
  invitation_id -> invitations
  event_type
  slots jsonb
  template_id -> templates
  palette_id
  status: in_progress | ready | assembled
  updated_at
```

### 5.3 Index/constraint wajib

- unique email user;
- unique phone bila tersedia;
- unique invitation slug;
- unique `(invitation_id, guest_slug)`;
- unique Midtrans order id;
- index invitation by owner/user;
- index guests by invitation and RSVP status;
- index analytics by invitation + created_at;
- index messages/conversations by customer phone and invitation.

---

## 6. Event Types dan Field Contract

Jangan memakai satu form universal yang hanya mengganti label. Setiap jenis acara punya field set dan module allowlist berbeda.

### 6.1 Wedding

Required:

- groom name, parents;
- bride name, parents;
- event type;
- event date, time, venue, address.

Optional:

- nicknames;
- child order (`anak ke-N`);
- social media;
- multiple events;
- love story;
- gallery;
- turut mengundang;
- RSVP/wedding wishes;
- guestbook;
- gift/bank/e-wallet/QRIS;
- quote/faith-aware content;
- countdown;
- livestream;
- dress code;
- marga;
- health protocol.

Supported event types include `akad`, `resepsi`, `pemberkatan`, `ngunduh_mantu`, `lamaran`, `midodareni`, `siraman`, `panggih`, `martumpol`, `pawiwahan`, `mepandes`.

### 6.2 Aqiqah

Required:

- child name;
- gender;
- birth date;
- father and mother names;
- event date, time, venue, address.

Optional:

- meaning of child name;
- prayer;
- maps;
- gallery;
- RSVP;
- gift only if customer chooses;
- family/invited names.

### 6.3 Tasyakuran

Use its own terminology and UI, not a hidden wedding clone. Required event basics; optional child/family/profile details based on the selected template and actual event subtype.

### 6.4 Khitanan

Use ceremony/child/family terminology appropriate for khitanan. Do not blindly expose wedding couple/love-story fields.

### 6.5 Birthday

Required:

- celebrant name;
- event date, time, venue, address.

Optional:

- age;
- maps;
- timeline/milestones;
- gallery;
- RSVP;
- countdown;
- wishlist instead of wedding gift/bank transfer.

### 6.6 Corporate/event

Required:

- event name;
- date;
- time;
- location.

Optional:

- description;
- maps;
- agenda;
- speakers;
- contact person;
- sponsors;
- dress code;
- registration/RSVP and quota;
- e-ticket/QR check-in.

Corporate normally does not expose background music, wedding wishes, couple, or gift modules.

### 6.7 Shared canonical RSVP object

Semua variasi RSVP/registration memakai struktur yang sama:

```ts
{
  aktif: boolean,
  batas_tanggal?: string,
  tanya_jumlah_tamu: boolean,
  kolom_ucapan: boolean
}
```

Label boleh berubah per event type, data contract jangan diduplikasi.

### 6.8 Faith-aware content

- Jangan menyimpulkan agama dari nama.
- Customer memilih/menyatakan belief context.
- Islam: Bismillah/Assalamualaikum, ayat yang relevan.
- Kristen/Katolik: ayat Alkitab.
- Hindu/Bali: Om Swastiastu dan konteks pawiwahan.
- Bila keyakinan berbeda: gunakan konten universal atau konten yang dipilih customer.
- Quote/doa harus inclusive dan tidak boleh di-generate sebagai fakta.

---

## 7. Template Catalog

Catalog kecil 10–20 template tidak membutuhkan search engine, embedding, Elasticsearch, atau semantic search.

UI:

- gallery grid;
- occasion chips: wedding, birthday, aqiqah, tasyakuran, khitanan, corporate;
- style chips: elegan, minimalis, rustic, floral, modern, islami, playful;
- color swatches, bukan teks saja;
- format optional: portrait/landscape;
- multi-select dalam satu dimensi = OR;
- antar dimensi = AND;
- filter yang menghasilkan 0 item harus memberi affordance untuk melonggarkan filter;
- mobile menggunakan bottom-sheet filter tray;
- preview besar sebelum memilih.

Template metadata:

```json
{
  "id": "tpl-012",
  "name": "Rustic Garden",
  "thumbnail_url": "asset-reference",
  "preview_url": "asset-reference",
  "occasion": ["wedding"],
  "style": ["rustic", "floral"],
  "color_palette": ["green", "cream"],
  "color_hex": ["#6B8E5A", "#F5F0E1"],
  "format": "portrait",
  "is_premium": false,
  "sort_order": 12
}
```

Template choice is customer-owned. Agent hanya menerapkan pilihan.

---

## 8. Customer UX / Frontend

### 8.1 Marketing landing `/`

Wajib:

- jelaskan value undangan digital;
- event categories;
- feature catalog;
- template preview;
- pricing one-time;
- FAQ;
- CTA buat event / pilih template;
- login/signup.

Mega-menu yang diinginkan:

- Jenis Acara: wedding, birthday, aqiqah, tasyakuran, khitanan, corporate;
- Fitur: undangan/website, RSVP/form, tamu, komunikasi, check-in/analytics, integrasi;
- Resource: panduan acara, template, FAQ, bantuan, kontak;
- Harga;
- Masuk;
- Buat event.

Jangan menyembunyikan feature valid hanya karena backend belum dibuat. Jika deferred, tampilkan kartu non-interaktif yang jelas `Coming soon`, `aria-disabled="true"`, tanpa href/click handler.

### 8.2 Auth

- sign up;
- sign in;
- password reset/magic link bila dipilih;
- session cookie server-side;
- middleware melindungi `/dashboard/*`;
- redirect user authenticated ke `/dashboard`;
- customer tidak boleh melihat admin route;
- admin route salah harus 404, bukan halaman login umum.

### 8.3 Customer dashboard shell

Desktop:

- sidebar tetap/narrow;
- logo/brand satu treatment;
- navigation global: Overview, My Invitations, Guests/operations sesuai IA final, Templates, Profile;
- profile/sign-out di footer sidebar;
- topbar utility quiet.

Mobile:

- compact topbar;
- burger membuka drawer + overlay;
- drawer mulai di bawah topbar;
- body scroll lock saat drawer terbuka;
- tutup dengan X, overlay tap, Esc, route change;
- profile tampil di navbar mobile, jangan duplicate trigger di drawer;
- jangan gunakan horizontal-scroll nav sebagai pengganti drawer.

### 8.4 Invitation list

Customer dapat:

- melihat semua invitation miliknya;
- membuat draft baru;
- melihat event type, status, expiry, completion/progress;
- membuka control center per invitation;
- preview public invitation;
- publish/unpublish sesuai permission/status;
- tidak dapat mengakses invitation customer lain.

### 8.5 Control center

Control center harus menjadi overview yang benar-benar berguna, bukan kumpulan menu duplikat.

Tampilkan:

- progress completion;
- status draft/published/expired;
- public preview;
- next action/blocker;
- guest/RSVP summary bila sudah ada;
- shortcut menuju module yang valid untuk event type.

Jangan menampilkan Overview sebagai tile yang hanya mengulang panel overview.

Pisahkan:

- **public invitation configuration:** content, RSVP settings, guestbook visibility, gift, music, gallery;
- **event operations:** guest responses, delivery, check-in, internal planner.

Planner internal tidak masuk ke editor guest-facing. Ia punya sidebar/overview home sendiri.

### 8.6 Editor

Rules yang sudah disepakati:

- header hanya back-link bersih; jangan expose slug/id mentah sebagai heading dev-tool;
- section title dan description berada di body bersama fields;
- body alignment desktop memakai `max-w-5xl`, bukan form sempit `max-w-3xl`;
- field cards white, border subtle, readable;
- setiap section punya deskripsi singkat;
- setiap text field punya placeholder realistis (`mis. Siti Rahmawati`);
- upload widget punya hint format + ukuran;
- Save + Preview berada di kartu putih tersendiri di bawah field, normal flow;
- jangan floating fixed bar;
- jangan pindahkan Save/Preview ke header;
- setelah save tampilkan status `Tersimpan`;
- mobile field full-width dan tidak terpotong;
- one module menu: jangan sidebar editor dan tile menu yang isinya sama;
- state section + URL query harus dikendalikan satu navigation controller;
- Back wajib diuji dari section non-default kembali ke control center lalu invitation list.

### 8.7 Type-specific allowlist

Simpan sebagai data:

```ts
const HIDDEN_MODULES_BY_TYPE: Record<EventType, ModuleId[]> = {
  wedding: [],
  birthday: ['couple', 'love-story', 'gift-bank'],
  aqiqah: ['couple', 'love-story', 'gift-bank'],
  tasyakuran: ['couple', 'love-story'],
  khitanan: ['couple', 'love-story'],
  corporate: ['couple', 'love-story', 'gift-bank', 'background-music']
};
```

Implementasi nyata harus menyesuaikan schema dan keputusan produk terbaru. Helper yang sama dipakai di sidebar, landing grid, route guard, dan renderer.

### 8.8 Media upload

Customer-facing media **harus file upload**, bukan URL input.

Flow:

1. file picker;
2. MIME validation;
3. size validation;
4. optional moderation/metadata;
5. simpan di `storage/uploads/<invitationId>/...` di luar `public/`;
6. simpan asset reference/media row;
7. serve via `/media/[...path]` dengan traversal guard;
8. config menyimpan asset reference, bukan raw external URL.

Minimal support:

- PNG/JPG/WEBP untuk image;
- ukuran default maksimal 5MB per image;
- urutan gallery eksplisit via `position`/stable order;
- jangan infer order dari filename, URL, atau DB id;
- custom audio hanya ditampilkan jika end-to-end asset flow tersedia; kalau belum, hide atau label pending.

### 8.9 Public renderer

Ini adalah critical product path dan tidak boleh dianggap selesai hanya karena editor jalan.

Route:

```text
/i/[invitationSlug]/[guestSlug]
```

Renderer harus:

- resolve invitation + guest;
- menolak invitation yang tidak public/published sesuai policy;
- inject guest name saat render;
- render template berdasarkan config;
- render couple/child/celebrant/event data sesuai event type;
- render gallery/media dengan serving route;
- render RSVP form;
- render guestbook/message list sesuai visibility;
- render gift/QRIS jika ada;
- render map/live stream/countdown jika configured;
- render faith-aware quote/opening bila approved;
- sanitise/escape semua free text anti-XSS;
- log VIEW analytics dan increment guest opened count;
- untuk expired: tetap tampil, tetapi RSVP/guestbook disabled.

Public URL harus dapat dibuka tanpa authentication.

---

## 9. Backend API Contract

Gunakan route handlers/server actions dengan auth + ownership checks.

### Auth

```text
POST /api/auth/sign-up
POST /api/auth/sign-in
POST /api/auth/sign-out
POST /api/auth/forgot-password
```

### Invitations

```text
GET    /api/invitations
POST   /api/invitations
GET    /api/invitations/:id
PATCH  /api/invitations/:id
DELETE /api/invitations/:id
POST   /api/invitations/:id/publish
POST   /api/invitations/:id/unpublish
GET    /api/invitations/:id/preview
PATCH  /api/invitations/:id/detail
```

Rules:

- every route uses current session user id;
- inaccessible resource returns normal 404, never leaks existence/data;
- validate event type and config schema;
- publish checks mandatory fields, valid template, valid slug, and expiry policy;
- patch config uses typed contract and controlled deep merge.

### Media

```text
POST /api/invitations/:id/upload
GET  /media/:path...
DELETE /api/media/:id
PATCH /api/media/:id/order
```

Expected behavior:

- unauthenticated upload: 401;
- wrong owner: 404/403 according to API policy without data leakage;
- invalid MIME: 415;
- too large: 413;
- traversal attempt: 400;
- successful upload returns stable media reference.

### Guests

```text
GET    /api/invitations/:id/guests
POST   /api/invitations/:id/guests
PATCH  /api/invitations/:id/guests/:guestId
DELETE /api/invitations/:id/guests/:guestId
POST   /api/invitations/:id/guests/import
GET    /api/invitations/:id/guests/export
POST   /api/invitations/:id/guests/blast
POST   /api/public/invitations/:invitationSlug/:guestSlug/rsvp
POST   /api/public/invitations/:invitationSlug/:guestSlug/message
POST   /api/public/invitations/:invitationSlug/:guestSlug/check-in
```

### AI/intake

```text
GET   /api/invitations/:id/intake
PATCH /api/invitations/:id/intake/slots
POST  /api/invitations/:id/intake/assemble
POST  /api/invitations/:id/revisions/propose
POST  /api/invitations/:id/revisions/:draftId/apply
POST  /api/agents/design
POST  /api/webhooks/fonnte
```

### Payment

```text
POST /api/payments/create-order
GET  /api/payments/orders/:id
POST /api/webhooks/midtrans
```

Webhook flow:

1. verify signature;
2. re-query Midtrans status;
3. lock order row;
4. if already paid, return 200 and skip;
5. else mark paid + create/upsert user + attach invitation in one transaction;
6. always return 200 after handled/idempotent skip.

---

## 10. Design Agent Specification

### 10.1 Five-stage flow

1. **Pilih template** — customer browse/filter/select; agent tidak ikut memilih.
2. **Intake fakta** — hybrid form + chat slot filling.
3. **Validasi** — tanggal, jam, URL, enum, required fields.
4. **Bantu copy** — optional draft; customer wajib approve/edit.
5. **Rakit config** — deterministic assembler membuat draft.

### 10.2 Extractor vs assembler

Extractor:

- LLM structured output/function calling;
- hanya membuat kandidat slot;
- setiap fakta harus punya source utterance;
- status slot: `filled`, `empty`, `needs_confirmation`, `pending_customer`, `ai_drafted_pending_approval`.

Assembler:

- kode deterministic, bukan LLM;
- hanya menerima slot `filled` dan copy yang sudah approved;
- validasi ulang server-side;
- hasilkan satu config JSON;
- buat invitation draft/version dalam transaction.

### 10.3 Anti-halusinasi

1. Empty required slot wajib ditanyakan.
2. Fakta tanpa source utterance ditolak/needs confirmation.
3. Server memvalidasi ulang semua value.
4. Jika customer belum tahu, simpan pending; jangan memaksa.
5. Satu pertanyaan per step/slot.
6. Ambiguity seperti “jam 10” harus diklarifikasi apakah akad/resepsi.

### 10.4 Tools sempit

```text
set_fact(field, value)
mark_missing(field)
request_clarification(field, question)
draft_copy(section, context)
apply_template(template_id)
apply_palette(palette_id)
assemble_config()
```

Server wajib cross-check template occasion == intake event type.

### 10.5 Fallback

Jika LLM timeout/502:

- jangan blok customer;
- tampilkan manual form;
- slot yang sudah tersimpan tetap aman;
- customer dapat lanjut tanpa chat.

---

## 11. Revisi Agent via WhatsApp

Contoh request:

- “ganti jam akad jadi jam 10”;
- “ubah warna jadi biru”;
- “ganti foto cover”.

Pattern:

1. parse via strict tool call;
2. jika ambiguous, tanya dulu;
3. sensitive change (nama/tanggal/jam) wajib explicit confirmation;
4. `propose_change` membuat draft diff;
5. kirim ringkasan + preview;
6. customer menjawab ya;
7. `apply_change(draft_id)` publish draft secara idempotent;
8. insert version baru, versi lama tetap rollback-able;
9. increment revision quota sesuai keputusan final.

Tool enum contoh:

```text
update_event_time(event_id: akad|resepsi, time: HH:MM)
set_theme_color(target: primary|secondary|accent, color)
replace_photo(slot, asset_id)
```

Max 3 revisi. Keputusan definisi 1 revisi yang tersimpan saat ini: rekomendasi satu sesi chat selesai = satu kuota, tetapi tetap tandai sebagai open item sampai disahkan.

---

## 12. Guest Management

### Import

Input CSV/Excel dengan minimal:

```text
name, phone, category
```

Saat import:

- normalise phone;
- slugify name;
- resolve collision suffix;
- generate QR reference;
- report row-level errors;
- jangan gagal total hanya karena satu row invalid bila partial import policy dipilih.

### RSVP

- status `PENDING`, `CONFIRMED`, `DECLINED`;
- guest count;
- owner dashboard read-back real-time/polling;
- export Excel/CSV;
- public RSVP disabled after expiry.

### Guestbook

- guest submits message;
- owner can moderate/hide;
- hidden message tidak tampil public;
- customer editor hanya mengatur visibility/copy/moderation settings, bukan menulis live submissions.

### Analytics

Event minimal:

- VIEW;
- RSVP;
- GUESTBOOK;
- CHECKIN.

Record invitation, guest bila diketahui, metadata, timestamp.

---

## 13. Event Operations / Planner

Planner adalah internal event management, bukan guest-facing invitation editor.

Route contoh:

```text
/dashboard/planner
/dashboard/invitations/:id/planner
```

Fungsi:

- coordinator name/phone;
- internal notes;
- preparation checklist;
- progress summary.

Planner tidak boleh tampil sebagai module tile di editor undangan. Reuse persistence contract bila memungkinkan, tetapi expose melalui top-level sidebar/overview.

---

## 14. UI Design System

### Visual direction

- modern clean card-based;
- putih/abu terang sebagai base;
- teks navy/hitam;
- aksen orange untuk customer dashboard editor;
- marketing dapat memakai palette brand Invitesion secara konsisten;
- radius 8–12px, jangan pill-shaped CTA kecuali status/chip;
- typography readable;
- no giant empty gutters from narrow max width;
- motion minimal dan purposeful.

### Components

- Button: rectangular, 8–11px radius;
- Input: visible label + example placeholder + helper/error;
- Card: white background, subtle border, shadow ringan;
- Upload: file picker, preview, progress/error state;
- Empty state: explanatory copy + one relevant CTA;
- Save card: own enclosed card at body bottom;
- status badges boleh pill kecil, bukan primary CTA.

### Accessibility

- keyboard navigable;
- visible focus state;
- labels associate dengan input;
- icon-only button wajib aria-label;
- drawer has focus/escape behavior;
- sufficient color contrast;
- `aria-disabled=true` untuk deferred card;
- no important information conveyed by color only.

---

## 15. Security

Wajib:

- password hashing modern;
- secure, httpOnly, sameSite cookies;
- CSRF protection untuk mutation bila relevan;
- rate limiting auth, RSVP, upload, blast, AI;
- ownership check server-side pada semua invitation/guest/media endpoint;
- admin path dari env + role/email allowlist;
- sanitize/escape all rendered free text;
- MIME sniffing + extension allowlist + file size limit;
- path traversal guard media route;
- webhook signature verification;
- idempotency payment and revision apply;
- no raw credentials in logs, docs, responses;
- validate uploaded file content, bukan hanya filename;
- redact sensitive payloads from agent logs.

Threats yang harus diuji:

- IDOR invitation;
- guest enumeration policy;
- path traversal;
- stored XSS in quote/story/message/name;
- forged Midtrans/Fonnte webhook;
- duplicate webhook;
- duplicate revision apply;
- brute-force sign-in;
- abusive bulk WhatsApp send;
- oversized/malicious upload.

---

## 16. Testing dan Verification

### Unit

- slugify + collision;
- config schema per event type;
- module visibility;
- expiry/read-only policy;
- Midtrans signature;
- payment idempotency;
- assembler anti-hallucination;
- renderer escaping;
- upload MIME/size/path guard.

### Integration

- sign-up/sign-in/session;
- invitation CRUD ownership;
- publish validation;
- upload → stored media → serve;
- guest import/export;
- RSVP read-back;
- guestbook moderation;
- webhook processing;
- AI propose → confirm → apply;
- expired invitation behavior.

### E2E critical journeys

1. Unauthenticated dashboard redirects to auth.
2. Customer creates draft invitation.
3. Customer selects template/type-specific UI.
4. Customer fills data and reloads; data persists.
5. Customer uploads media; media displays after reload.
6. Customer previews public URL without auth.
7. Customer publishes invitation.
8. Guest opens unique URL; guest name appears.
9. Guest submits RSVP; customer sees it.
10. Guest posts message; owner moderates it.
11. Second customer cannot access first customer’s invitation/API.
12. Payment webhook is idempotent.
13. Expired invitation remains visible but mutations are closed.
14. Mobile drawer/editor works at 390px.
15. Editor navigation back path updates both local state and URL.

### Visual verification

Build/HTTP 200 bukan visual proof. Untuk setiap customer-facing UI change:

- run the actual app/service;
- open actual route in a real browser;
- capture desktop and mobile screenshot;
- inspect pixels;
- verify correct authenticated customer and owned resource;
- verify no stale cache/old service process;
- check browser console/network errors.

### Type divergence verification

Seed/open one invitation per event type and dump:

- visible field labels;
- visible module labels;
- route/module access.

Identical field/menu sets across all types adalah bug.

---

## 17. Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Recommended targeted checks:

```bash
pnpm build
git diff --check
curl -I http://localhost:3000/
curl -I http://localhost:3000/dashboard
node --test
```

Never report completion based only on `pnpm build`.

---

## 18. Deployment

Deployment may use systemd + reverse proxy or chosen platform, tetapi operational checklist sama:

1. migrate DB;
2. deploy app;
3. verify env vars;
4. restart actual process manager;
5. check readiness;
6. curl public route;
7. test authenticated route;
8. test public invitation route;
9. test webhook endpoint signature handling;
10. capture production/staging screenshot;
11. verify logs do not contain secrets.

Jika build menghasilkan route tetapi live service 404, restart process yang sebenarnya listen pada port tersebut sebelum menyimpulkan route rusak.

---

## 19. Seed Fixtures

Buat fixture terisolasi untuk semua event type:

```text
wedding
birthday
aqiqah
tasyakuran
khitanan
corporate
```

Setiap fixture memiliki:

- stable invitation slug;
- realistic Indonesian data;
- minimal one guest;
- optional media fixture;
- status draft dan published variant;
- one expired fixture.

Fixture wajib cukup untuk screenshot dan E2E tanpa memakai credential production.

---

## 20. Implementasi yang Sudah Ada di Codebase Saat Handoff

Codebase existing berada di:

```text
/root/.hermes/profiles/operator/projects/invitation-platform
```

Fakta penting yang sudah diketahui:

- Next.js 14 + TypeScript + Drizzle + PostgreSQL.
- Editor multi-type sudah memiliki basis field/module divergence.
- `ceremonyProfile` digunakan sebagai superset config, dengan subset UI per event type.
- Upload sudah diarahkan ke storage di luar `public/`.
- Media diserve lewat route `/media/[...path]`.
- Upload bukan URL input.
- Editor layout sudah diperbaiki:
  - header bersih;
  - content `max-w-5xl`;
  - Save card di bawah fields, bukan fixed bottom bar;
  - mobile drawer/editor pattern menjadi acuan.
- Planner sudah dipisahkan sebagai internal operations surface.
- Theme/Cover tidak boleh menjadi editor module default jika capability dipilih lewat picker; hanya tampil jika addon entitlement mengizinkan.
- Existing source pernah memakai file editor besar; rebuild boleh memecah komponen agar maintainable.
- Jangan menambahkan file `*-fixes.css` baru untuk menambal cascade; rapikan root cause.

**Critical gap:** public deterministic renderer dan full public guest flow harus diimplementasikan/diverifikasi end-to-end sebelum project dinyatakan production-ready.

---

## 21. Open Items — Jangan Menebak

1. Nomor pengirim WhatsApp:
   - A: satu nomor platform;
   - B: customer connect nomor sendiri;
   - jika B, butuh `wa_devices`.
2. Definisi kuota revisi:
   - rekomendasi: satu sesi chat selesai = satu revisi;
   - belum dianggap final sampai owner mengesahkan.
3. Final auth implementation/library jika rebuild mengganti starter.
4. Final pricing tiers dan entitlement matrix.
5. Production storage provider (local disk vs S3-compatible object storage).
6. Production moderation policy untuk uploaded image/audio.
7. Exact admin feature scope di luar template/profile/security.
8. Apakah custom domain masuk MVP atau premium phase.

Jika menemukan keputusan baru, update bagian ini dan dokumen arsitektur terkait sebelum coding.

---

## 22. Definition of Done

Project rebuild hanya boleh disebut selesai jika:

- [ ] landing, auth, customer dashboard, admin, public invitation terpisah;
- [ ] auth/session/ownership aman;
- [ ] all six event types punya field dan module allowlist yang benar-benar berbeda;
- [ ] template catalog customer-driven bekerja;
- [ ] draft create/edit/reload bekerja;
- [ ] file upload end-to-end bekerja;
- [ ] preview public URL bekerja tanpa auth;
- [ ] publish/unpublish/expiry policy bekerja;
- [ ] guest unique URL + collision bekerja;
- [ ] RSVP + guestbook + moderation bekerja;
- [ ] guest import/export bekerja;
- [ ] analytics VIEW/RSVP/GUESTBOOK/CHECKIN tersimpan;
- [ ] payment webhook idempotent dan auto-create account bekerja;
- [ ] WhatsApp abstraction tersedia dan blast logging bekerja;
- [ ] Design Agent tidak mengarang fakta;
- [ ] Revisi Agent memakai propose-confirm-apply + versioning;
- [ ] rollback version bekerja;
- [ ] expired invitation read-only bekerja;
- [ ] mobile responsive verified by screenshot;
- [ ] unauthorized/cross-owner tests pass;
- [ ] build, lint, unit, integration, dan E2E pass;
- [ ] live service route smoke-tested;
- [ ] docs updated bersama implementasi;
- [ ] tidak ada secret/credential di repository.

---

## 23. Urutan Rebuild yang Direkomendasikan

### Phase 1 — Foundation

- project setup;
- env validation;
- DB schema + migrations;
- auth/session;
- customer/admin middleware;
- seed fixtures.

### Phase 2 — Invitation domain

- event type schemas;
- templates/catalog;
- invitation CRUD;
- config validation;
- module allowlist;
- customer dashboard/list/control center.

### Phase 3 — Editor vertical slice

- type-specific forms;
- save/reload;
- upload/media serving;
- preview target;
- publish validation.

### Phase 4 — Public invitation

- deterministic renderer;
- guest URL resolution;
- public RSVP;
- guestbook;
- expiry read-only;
- analytics.

### Phase 5 — Guest operations

- guest CRUD/import/export;
- QR;
- delivery status;
- check-in;
- overview summary.

### Phase 6 — Commerce

- pricing;
- Midtrans Snap;
- webhook;
- idempotency;
- account/invitation activation.

### Phase 7 — AI/WA

- intake session;
- Design Agent extractor/assembler;
- Fonnte abstraction;
- blast;
- Revisi Agent propose/confirm/apply;
- versioning/rollback.

### Phase 8 — Hardening

- security tests;
- visual QA;
- mobile QA;
- performance;
- observability;
- deployment verification;
- documentation audit.

**Setiap phase harus menghasilkan vertical slice yang bisa dijalankan dan diverifikasi, bukan backend-only stub.**

---

## 24. Agent Handoff Rules

Agent rebuild wajib:

1. membaca dokumen ini penuh;
2. membaca `AGENTS.md` dan docs sistem terkait;
3. membuat todo list berdasarkan phase;
4. tidak mengarang requirement yang tidak tertulis;
5. menandai open item sebelum mengambil keputusan;
6. menjalankan app dan tests;
7. memverifikasi UI lewat browser/screenshot;
8. mengupdate docs saat keputusan/implementasi berubah;
9. menyebut fitur yang belum live secara jujur;
10. menyerahkan kembali artifact, route, test output, dan known gaps.

**Jangan pernah berkata “selesai” hanya karena schema, endpoint, atau build sudah selesai. Feature berarti user dapat mencapai UI, melakukan aksi utama, melihat persistence, dan membuka hasil public bila fiturnya invitation-facing.**

---

## 25. Source Documents yang Menjadi Referensi

- `AGENTS.md`
- `AGENT_WORKFLOW.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/systems/design-agent.md`
- `docs/systems/ai-agents.md`
- `docs/systems/template-catalog.md`
- `docs/systems/guest-management.md`
- `docs/systems/payment.md`
- `docs/systems/wa-delivery.md`
- `docs/systems/customer-memory.md`
- `docs/design-research/*`

Jika dokumen ini berbeda dengan keputusan locked terbaru di `PROJECT_OVERVIEW.md`, jangan menebak: tandai conflict dan minta Architect/owner memutuskan.

---

**END OF REBUILD HANDOFF**

Dokumen ini sengaja memasukkan requirement FE, BE, database, auth, payment, AI, WA, storage, security, QA, deployment, open items, dan urutan rebuild. Credential/secret tidak dimasukkan.
