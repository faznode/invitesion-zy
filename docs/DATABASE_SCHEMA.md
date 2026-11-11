<!-- SUMMARY (first 7 lines — greppable) -->
# DATABASE_SCHEMA.md — Skema Database
> WHAT: Skema DB lengkap (Drizzle/Postgres) untuk MVP. Source of truth data model.
> STATUS: LIVE (MVP scope)
> OWNER: Architect
> DEPS: PROJECT_OVERVIEW.md
> GREP: schema, drizzle, tabel, users, invitations, guests, orders, versions, version_no, guest_registrations, guest_registration_links, import_batch_id, template_id, templateId, creation_key, invitation_members, co-host, usher, team, seating_tables, guest_logs, gift_logs, host logs, meja, suvenir, kado, family_side, pihak keluarga, deleted_at, purge_after, purged_at, hapus, retensi, tombstone, invitation_purge, checkout_key, checkout_intent, payment_settled, outbox, BACKEND_PAYMENT, coupons, order_coupons, list_amount, kupon, G-053, workspaces, workspace_members, workspace_credit_entries, workspace_id, client_label, credit ledger, G-052, guest_passcode_hash, guest_passcode_set_at, passcode, kode akses, G-047, guest-photo, foto tamu, kenangan, postEvent, I-21
> UPDATED: 2026-11-11 (s52: migration 0031 (invitations.guest_passcode_hash / guest_passcode_set_at) G-047 / D-069, cleared by the purge (R-X10), drift none, upgrade rehearsed 0030 → 0031 on rows written by the 0030 application (35 tables, 718 rows identical; schema equal to a fresh 0031); media_assets type `guest-photo` I-21 / D-070, no migration; s42: migration 0030 (workspaces, workspace_members, workspace_credit_entries, invitations.workspace_id / client_label) G-052 / D-067, drift none, rehearsed 0029 → 0030 with stored rows and a G-053 code rollback; s40: migrasi 0029 (coupons, order_coupons, orders.list_amount) G-053 / D-066, drift none, diuji 0028 → 0029 dengan baris dan rollback kode G-050; migrasi 0028 (receipts, receipt_counters) dibuat dengan drizzle-kit, drift none, diuji 0027 → 0028 dengan baris; s39: orders.checkout_key / checkout_intent + index unik parsial (user_id, invitation_id, checkout_key) migrasi 0027, kunci checkout B-039 / D-064, diuji 0026 → 0027 dengan baris; jobs `payment_settled` = outbox entitlement setelah settlement, kedua penulis `BACKEND_PAYMENT`; s38: invitations.deleted_at / purge_after / purged_at migrasi 0026, hapus + retensi B-031 / D-063, diuji 0025 → 0026 dengan baris; s36: gift_logs.family_side migrasi 0025, pihak keluarga kado I-04 / D-059; buku ucapan membaca guest_messages VISIBLE, I-22 / D-060; s35: seating_tables + guest_logs + gift_logs migrasi 0024, catatan hari acara pemilik G-045 / D-058; invitation_members migrasi 0023, tim undangan G-044 / D-057; s33: invitations.creation_key + index unik parsial (user_id, creation_key) migrasi 0021, pembuatan draf lewat fasad `BACKEND_CONTENT`, B-037 / D-055; s32 turn 3: dua ruang id template_id vs config.theme.templateId, ganti tema B-036 / D-054; s32: index invitation_versions (invitation_id, version_no) migrasi 0020, cek versi simpan editor `BACKEND_CONTENT`, B-035 / D-053; s31: guests import_batch_id + guest_registration_links + guest_registrations migrasi 0019, penulis roster `BACKEND_ROSTER`, B-033 / D-052; s28: guest_messages reviewed_at / host_reply / replied_at + index ucapan VISIBLE migrasi 0017, R-04 / D-044; api_rate_limits + api_idempotency_keys migrasi 0016, ditulis hanya oleh services/api, R-03 / D-043; s20/s21: guests invited_event_ids migrasi 0015, events[].inviteOnly, D-037; showPhoto foto anak, D-038; s19: guests rsvp_event_answers migrasi 0014; id acara tetap di invitations.config.events migrasi data 0013, D-036; guests rsvp_answers, migrasi 0012; earlier: analytics_events view-dedupe index, guests attending_count, link_token)
> ORM DECISION (whyme 2026-07-15): pakai **Drizzle** (bukan Prisma) — ikut fondasi nextjs/saas-starter biar backend cepat jalan. Schema di bawah = kanonik, diimplementasi sbg Drizzle schema (lib/db/schema.ts).

## Prinsip
- `config(json)` = source of truth isi undangan. Renderer deterministik config→HTML.
- Setiap revisi AI = insert `invitation_versions` baru (rollback-able).
- Operational modules (registration form, meal preferences, communications settings, check-in settings, seating plan, secondary events, ticketing configuration, and event operations) live as optional additive sections inside `invitations.config`; they do not require DB migrations.
- These sections contain setup/presentation rules only. Live guest submissions, RSVP status/counts, check-in timestamps, message delivery/provider status, payment transactions, and analytics remain DB-owned in the tables below; config must never claim a provider is active or replace those records.
- Webhook idempotent: `orders.midtrans_order_id` UNIQUE + `users.email` UNIQUE.
- Guest slug: `UNIQUE(invitation_id, slug)` — anti-collision per undangan.

## Tabel

### AUTH
```
users
  id, email(UNIQUE), phone(UNIQUE, nullable), password_hash,   ← phone: resolver identity WA↔web (customer-memory.md)
  role[CUSTOMER|ADMIN], created_at
```

### CONTENT
```
templates
  id, name, category[wedding|birthday|aqiqah|tasyakuran|khitanan|corporate],  ← enum SATU sumber (samain design-agent + catalog)
  default_config(json), thumbnail, is_premium, created_at

invitations
  id, user_id→users, template_id→templates,
  slug(UNIQUE), event_type, config(json),
  status[DRAFT|PUBLISHED|EXPIRED],
  revision_count(default 0, max 3),
  published_at, expires_at (published_at + 12 bulan), created_at
  ← B-036 (D-054): dua ruang id. `template_id` = tema yang DIBELI (id baris `templates`, serial, dicocokkan ke katalog
    lewat nama); hanya pembuatan yang menulisnya (sejak B-037 fasad `creation.ts`, sebelumnya `create.ts`), dan
    checkout / publish / settlement memakainya. `config.theme.templateId`
    = id KATALOG (`templates.ts`, mis. 107; ada di `default_config.theme.templateId`), host-only, tidak dirender. Ganti
    tema dalam tier hanya mengubah config lewat penulis konten; `template_id` tidak pernah ikut berubah.
  creation_key(varchar 255, nullable)
  ← B-037 (migrasi 0021, D-055): kunci pembuatan draf. Index unik parsial invitations_user_creation_key_idx
    (user_id, creation_key) WHERE creation_key IS NOT NULL: pembuatan ulang dengan kunci yang sama oleh pemilik yang sama
    (retry, ketuk dua kali, kirim ulang) mendapat draf yang sama. Ditulis hanya saat pembuatan, oleh fasad pembuatan
    (`lib/invitation/creation.ts`, `BACKEND_CONTENT`: `create-next.ts` atau `POST /v1/invitations`). Baris lama: NULL.
    `template_id` dan versi 1 ditulis di transaksi yang sama; sejak B-037 `create.ts` hanya pembungkus untuk skrip.
  workspace_id→workspaces (nullable), client_label (varchar 80, nullable)
  ← G-052 (migration 0030, D-067): set only by the owner of both the invitation and the workspace ("client invitation");
    NULL = personal (every row that existed before 0030). Partial index invitations_workspace_idx (workspace_id) WHERE
    workspace_id IS NOT NULL. Ownership never moves: `user_id` stays the owner. The purge clears `client_label`.
  deleted_at, purge_after, purged_at (timestamp, nullable)
  ← B-031 (migrasi 0026, D-063): hapus oleh pemilik + retensi. `deleted_at` dan `purge_after` selalu terisi bersama,
    `purge_after >= deleted_at` (CHECK invitations_deletion_window_check); `purged_at` hanya setelah `deleted_at`
    (CHECK invitations_purged_check). Index parsial invitations_purge_due_idx (purge_after) WHERE deleted_at IS NOT NULL
    AND purged_at IS NULL. `deleted_at` terisi = hilang bagi tamu dan SEMUA penulis di kedua bahasa (404 / not_found,
    sama seperti tidak ada); pemilik bisa memulihkan sampai purge berjalan (kunci baris yang sama). Purge (job Rust
    `invitation_purge`) mengosongkan 15 tabel anak (`PURGED_TABLES`), catatan replay idempotensi dan job varian, mengosongkan
    `config` + `creation_key` + `client_label` (G-052) + `guest_passcode_hash` / `guest_passcode_set_at` (G-047, R-X10),
    mengisi `purged_at`; baris tombstone tetap (slug tidak pernah dipakai ulang) bersama
    orders / payments / payment_events dan conversations / messages / customer_session_summary (`RETAINED_TABLES`).
    Ditulis: Next.js (hapus / pulihkan, `lib/invitation/deletion-db.ts`) dan `invitesion-jobs` (sapuan retensi, purge).
    Baris lama: NULL (aditif; diuji 0025 → 0026 dengan baris, s38).
  guest_passcode_hash (varchar 200, nullable), guest_passcode_set_at (timestamp, nullable)
  ← G-047 (migration 0031, D-069): the host's optional guest passcode, stored only as a salted scrypt hash
    (`scrypt$N$r$p$<salt>$<hash>`, base64url), never the code and never in `config`, so it is never versioned, restored by
    G-046, sent to the editor or written by either content writer. NULL = no passcode (every row from before 0031).
    One writer, `lib/invitation/guest-passcode-db.ts` (the owner's live rows), behind `PUT` / `DELETE
    /api/invitations/<id>/passcode`; the guest gate (`lib/invitation/guest-gate.ts`) reads it before any content query.
    B-031's purge clears both columns on the tombstone (R-X10). `FLAG_GUEST_PASSCODE=off` (the rollback) ignores the hash
    and keeps it. Additive: rehearsed 0030 → 0031 on rows written by the 0030 application (s52), the upgraded schema equal
    to a fresh one; reverting the code leaves both columns unread.

invitation_versions               ← rollback revisi AI
  id, invitation_id→invitations, version_no,
  config(json), created_by[customer|ai-agent],
  is_live, created_at
  ← B-035 (migrasi 0020, D-053): versi undangan = max(version_no), 0 bila belum ada baris. Pembuatan menulis 1; setiap
    simpan editor menulis versi berikutnya di transaksi yang mengunci baris undangan, setelah mencocokkan versi yang
    dimuat editor (beda → 409, tidak menulis apa pun). Satu baris is_live. Index invitation_versions_invitation_version_idx
    (invitation_id, version_no), tidak unik (baris lama boleh berulang nomor).

media_assets
  id, invitation_id→invitations,
  type[photo|video|music|guest-photo], url, sort_order, upload_sequence, source[web|chat|import|guest], meta(json), created_at
  ← I-21 (D-070, no migration): `type = 'guest-photo'` is a photo a guest shared after the event from their personal link:
    its file under the invitation's protected prefix (`/media/protected/<invitation>/<random>.<ext>`, D-040), `source`
    `guest`, `meta` {guestId, review pending|visible|hidden, reviewedAt}. One writer, `lib/invitation/guest-photos-db.ts`
    (every statement scoped to one invitation and the type). Never listed by the gallery, the editor or the media library
    (their queries exclude the type; `config.gallery.assetIds` is host-only and unread, and the photo's URL is refused in
    any content field by D-040); delivered only through `/i/<slug>[/<guest>]/kenangan/<id>` (`private, no-store`) and to
    the owner through `/media` while the invitation is live. B-031's purge removes the rows and their files with the invitation's other media.
    `FLAG_POST_EVENT_MEMORY` (default off) hides every surface and keeps the rows.
```

### GUESTS
```
guests
  id, invitation_id→invitations, name,
  slug, phone, category, qr_code,
  sent_at, opened_at, opened_count,
  rsvp_status[PENDING|CONFIRMED|DECLINED|MAYBE],
  guest_count, checked_in_at,
  attending_count (nullable)       ← jawaban RSVP; guest_count = jatah host, tidak diubah RSVP (B-007, migrasi 0009)
  link_token varchar(32) nullable  ← token link opsional (B-011, migrasi 0010, FLAG_OPAQUE_GUEST_LINKS)
  rsvp_answers jsonb nullable      ← jawaban pertanyaan custom host (B-027 2b, migrasi 0012, D-034): { [questionId]: string | string[] | number },
                                     ditulis UPDATE yang sama dengan status + attending_count; null = belum menjawab / menolak (dihapus) /
                                     baris sebelum 0012. Dibaca lewat schema yang membuang nilai rusak; tidak pernah masuk analytics_events
  rsvp_event_answers jsonb nullable ← jawaban per acara (B-027 2c, migrasi 0014, D-036): { [eventId]: { status, attending } }, kunci = id acara
                                     yang tetap (bukan urutan); ditulis UPDATE yang sama dengan status + attending_count + rsvp_answers;
                                     jawaban untuk acara yang dihapus tetap tersimpan; jawaban tunggal (flag on) mengosongkannya; flag off = tidak dibaca/ditulis
  invited_event_ids jsonb nullable ← acara khusus undangan yang boleh dilihat tamu ini (D-037, migrasi 0015, s20): array id acara yang tetap;
                                     id acara yang dihapus / dibuka lagi tetap tersimpan dan tidak berpengaruh; acara ditandai `inviteOnly` di
                                     invitations.config.events (bukan id tamu di config); flag INVITE_ONLY_EVENTS off = tidak dibaca/ditulis
  import_batch_id varchar(36) null ← impor tamu (B-033, migrasi 0019, D-052): satu UUID per impor; pembatalan menghapus tamu batch yang
                                     belum disentuh; index parsial guests_import_batch_idx (invitation_id, import_batch_id) where not null
  UNIQUE(invitation_id, slug)      ← anti-collision
  UNIQUE(link_token)               ← null boleh banyak

guest_registration_links           ← B-033, migrasi 0019: satu link pendaftaran mandiri per undangan (`/daftar/<token>`)
  invitation_id→invitations (PK, on delete cascade), token varchar(32) UNIQUE, created_at
                                     ganti = token baru (link lama langsung mati); tutup = baris dihapus

guest_registrations                ← B-033, migrasi 0019: antrean pendaftaran mandiri, menunggu keputusan host (bukan tamu)
  id, invitation_id→invitations (on delete cascade), name varchar(150), phone varchar(30) null, guest_count int default 1, created_at
  index guest_registrations_invitation_idx (invitation_id, created_at)
                                     disetujui = menjadi baris guests + baris ini dihapus (satu transaksi); ditolak = dihapus

> Roster (B-033, D-052): kolom roster `guests` (name, phone, category, guest_count, slug, link_token, invited_event_ids, sent_at,
> checked_in_at + baris CHECKIN, import_batch_id) dan dua tabel di atas ditulis oleh satu penulis per panggilan, `BACKEND_ROSTER=next|rust`
> (`lib/invitation/roster.ts`); kolom RSVP tetap milik penulis RSVP. Migrasi 0019 aditif.

invitation_members                 ← G-044 / D-057, migrasi 0023: tautan bergabung tim, menjadi hak akses saat diterima
  id, invitation_id→invitations (on delete cascade), role varchar(16) CHECK in ('cohost','usher'), label varchar(60)
                                     (catatan pemilik), token_hash varchar(64) UNIQUE (SHA-256 hex; rahasia tautan tidak pernah
                                     disimpan), expires_at (7 hari), user_id→users null (on delete no action: akun dihapus lunak),
                                     accepted_at null, revoked_at null, created_at
  UNIQUE parsial invitation_members_live_grant_unique (invitation_id, user_id) where user_id not null and revoked_at null
                                     ← satu hak akses hidup per undangan dan akun
  index invitation_members_user_idx (user_id) where revoked_at null; invitation_members_invitation_idx (invitation_id, created_at)
                                     menunggu = user_id null + belum kedaluwarsa; aktif = user_id terisi; dicabut / keluar = revoked_at
                                     terisi. Maks. 20 baris hidup per undangan (dihitung di bawah kunci baris undangan). Ditulis hanya
                                     oleh `lib/invitation/members-db.ts`; dibaca juga oleh `services/api/src/members.rs`.

seating_tables                     ← G-045 / D-058, migrasi 0024: meja milik pemilik (catatan hari acara, khusus pemilik)
  id, invitation_id→invitations (on delete cascade), name varchar(60), capacity int null CHECK (null atau 1–100), created_at
  UNIQUE seating_tables_invitation_name_unique (invitation_id, name)      ← maks. 200 meja per undangan (batas teknis)
guest_logs                         ← G-045 / D-058, migrasi 0024: catatan hari acara satu tamu
  guest_id PK→guests (on delete cascade), invitation_id→invitations (on delete cascade),
  table_id→seating_tables null (on delete set null: meja dihapus = tamu belum bermeja; label kursinya ikut dikosongkan oleh penulis),
  seat varchar(20) null, souvenir_at timestamp null (waktu suvenir PERTAMA dipertahankan, seperti kedatangan pertama D-056), updated_at
  index guest_logs_invitation_idx (invitation_id); guest_logs_table_idx (table_id)
gift_logs                          ← G-045 / D-058, migrasi 0024: catatan kado pribadi pemilik
  id, invitation_id→invitations (on delete cascade), guest_id→guests null (on delete set null), giver_name varchar(150)
                                     (nama saat dicatat; tetap bila baris tamu hilang), kind varchar(16) CHECK in
                                     ('envelope','present','transfer','other'), amount bigint null CHECK (null atau 0–10^12; rupiah
                                     utuh, opsional), note varchar(300) null, received_at, request_key varchar(64), created_at, updated_at
  family_side varchar(8) null      ← I-04 / D-059, migrasi 0025: CHECK (null atau 'bride' / 'groom'); hanya pernikahan (penulis
                                     menolak pada jenis acara lain); null = belum ditentukan, termasuk semua catatan sebelum 0025
  UNIQUE gift_logs_request_unique (invitation_id, request_key)  ← kunci sekali pakai formulir: kirim ganda = satu baris
  index gift_logs_invitation_idx (invitation_id, received_at)   ← maks. 5.000 catatan per undangan (batas teknis)
                                     Ketiganya ditulis hanya oleh `lib/invitation/host-logs-db.ts` (kunci baris undangan + cek pemilik
                                     + cek setiap id milik undangan itu) dan dibaca hanya oleh halaman `/dashboard/invitations/<id>/logs`
                                     dan ekspornya; tidak pernah oleh halaman tamu, payload publik, meja check-in atau API Rust.
                                     `FLAG_HOST_LOGS` off: semua pintu 404, baris tetap. Migrasi 0024 aditif.

guest_messages
  id, invitation_id→invitations, guest_id→guests(nullable),
  name, message, is_hidden, created_at
  reviewed_at timestamp null       ← 0017, R-04 / D-044: null + is_hidden = PENDING (buku tamu dimoderasi saat ucapan masuk);
                                     terisi + is_hidden = HIDDEN (disembunyikan tuan rumah); is_hidden false = VISIBLE
  host_reply text null             ← 0017: balasan tuan rumah, tampil di bawah ucapan yang VISIBLE; kosong = dihapus
  replied_at timestamp null        ← 0017
  index guest_messages_invitation_visible_idx (invitation_id, is_hidden, created_at)   ← 0017, B-017: daftar + hitungan
                                     ucapan VISIBLE di halaman tamu (EXPLAIN dibuktikan di verify-wishes-api); juga buku ucapan PDF
                                     (I-22 / D-060: VISIBLE, terlama dulu + id, maks. 5.000, satu snapshot read-only; tanpa tabel baru)
```
> Ucapan (R-04, D-044): penulis tunggal per panggilan, `BACKEND_WISHES=next|rust`. Halaman tamu hanya membaca ucapan VISIBLE; buku tamu `guestbook.visibility = 'host'` tidak menampilkan daftar sama sekali; `guestbook.moderation = true` menyimpan ucapan baru sebagai PENDING. Tuan rumah menampilkan / menyembunyikan / menghapus / membalas di `/dashboard/invitations/<id>/wishes`. Migrasi 0017 aditif (tiga kolom null + satu index); baris lama tetap VISIBLE atau tersembunyi seperti sebelumnya (tersembunyi lama terbaca PENDING sampai ditinjau).

### COMMERCE
> REVISI 2026-07-27: Midtrans diganti QRIS (lokal) + Stripe (internasional).
> `midtrans_order_id` DIHAPUS — identitas provider jadi kolom, bukan nama kolom.
> `amount` = integer MINOR UNITS sesuai eksponen `currency` (IDR: rupiah utuh, USD: sen).
> JANGAN pakai float. Detail: `lib/payment/money.ts`.
```
orders
  id, user_id→users, invitation_id→invitations(nullable),
  tier, amount, currency[IDR|USD],
  status[PENDING|PAID|FAILED|EXPIRED],
  rail[qris|stripe],
  reference(UNIQUE),           ← punya kita; anchor idempotency di kedua sisi
  provider_payment_id,         ← punya provider; untuk rekonsiliasi
  paid_at, expires_at,         ← expires_at = jendela pembayaran, BUKAN masa aktif undangan
  created_at,
  template_id→templates(nullable), ← tema yang dibeli (B-041); NULL = order lama, berlaku untuk tema apa pun
  checkout_key varchar(64) NULL,   ← B-039 (0027): kunci form checkout; UNIQUE parsial
  checkout_intent varchar(64) NULL ←   (user_id, invitation_id, checkout_key) WHERE checkout_key IS NOT NULL;
                                   ←   intent = SHA-256 dari intent yang dihitung server (lib/payment/checkout-key.ts)
  list_amount integer NULL         ← G-053 (0029): harga sebelum kupon bila order memakai kupon; `amount` = yang ditagih.
                                   ←   NULL di setiap order tanpa kupon (amount = harga)

coupons                        ← G-053 (0029, D-066): dibuat admin, SELALU belum aktif sampai diaktifkan di konsol
  id, code(UNIQUE, juga setelah dinonaktifkan), kind[percent|fixed], percent_off(1–99), amount_off(minor, ≥1),
  currency[IDR|USD] (untuk fixed), tier(NULL = semua), starts_at, ends_at (UTC; diisi dari WIB),
  max_redemptions(NULL = tanpa batas), per_customer(default 1), stackable, active, partner(label afiliasi, konsol saja),
  created_by→users, created_at, disabled_at(final)
  CHECK kind / nilai / batas / jendela  ← baris rusak ditolak database juga, bukan hanya form

order_coupons                  ← G-053: kupon yang dipakai satu order, ditulis bersama order di satu transaksi di bawah
  order_id→orders, coupon_id→coupons, user_id→users,  ←   kunci baris kupon (FOR UPDATE, urut id)
  discount(minor), position(1–3)
  PK(order_id, coupon_id), INDEX(coupon_id, user_id)  ← hitungan pemakaian: order PAID, atau PENDING yang masih bisa dibayar

payments
  id, order_id→orders, provider, transaction_id,
  status, raw_payload(json), created_at

payment_events                 ← log delivery webhook; ini yang bikin settlement idempotent
  id, rail, event_id, order_id→orders(nullable),
  status, raw_payload(json), created_at
  UNIQUE(rail, event_id)       ← retry provider konflik di sini lalu dilewati

receipts                       ← G-050 (0028): satu per order lunas; ditulis HANYA oleh invitesion-jobs
  id, number(UNIQUE),          ←   nomor dari receipt_counters di bawah kunci barisnya: urut commit, tanpa celah
  order_id→orders(UNIQUE), payment_id→payments(UNIQUE), user_id→users,
  reference, tier, amount, currency, rail, transaction_id,   ← disalin dari order + pembayaran saat terbit
  paid_at, issued_at
  INDEX(user_id, number)       ← daftar kuitansi pemilik

receipt_counters               ← G-050: satu baris scope='receipt', last_number (dibuat oleh increment pertama)
```

### WORKSPACES (migration 0030, G-052, D-067)
```
workspaces                     ← a reseller's workspace; written only by lib/workspace/workspace-db.ts (Next.js)
  id, name(varchar 80), owner_user_id→users (UNIQUE: one workspace per account),
  credit_balance(int, default 0, CHECK >= 0)   ← always equals the ledger below (same transaction, row lock)
  created_at, disabled_at(nullable)            ← disabled: staff hold nothing; no console yet (a database statement)

workspace_members              ← staff links and grants, kept as G-044 keeps invitation_members
  id, workspace_id→workspaces (ON DELETE CASCADE), role('manager' | 'desk', CHECK), label(varchar 60),
  token_hash(varchar 64, UNIQUE)               ← SHA-256 of the one-time secret; the secret itself is never stored
  expires_at, user_id→users(nullable), accepted_at, revoked_at, created_at
  UNIQUE(workspace_id, user_id) WHERE user_id IS NOT NULL AND revoked_at IS NULL   ← one live grant per account
  INDEX(user_id) WHERE revoked_at IS NULL; INDEX(workspace_id, created_at)

workspace_credit_entries       ← append-only credit ledger, mechanics only (lib/workspace/credits.ts; no product caller)
  id, workspace_id→workspaces, operation_key(varchar 80), kind('grant' delta > 0 | 'debit' delta < 0, CHECK),
  delta, balance_after(CHECK >= 0), invitation_id→invitations(nullable), actor_user_id→users(nullable),
  note(varchar 200), created_at
  UNIQUE(workspace_id, operation_key)          ← a retried operation replays its entry; another payload conflicts
                                               ← kept by the purge, pointing at the tombstone (like orders)
```
`FLAG_WORKSPACES` off keeps every row of these tables and the invitations' assignments as they are.

### AI / MESSAGING
```
conversations
  id, customer_phone, invitation_id→invitations(nullable),
  channel[wa], state, created_at

messages
  id, conversation_id→conversations,
  sender_type[customer|agent], content, created_at

agent_tasks
  id, invitation_id→invitations, type[DESIGN|REVISION],
  status, input(json), output(json),
  version_id→invitation_versions(nullable), created_at

wa_log
  id, invitation_id→invitations, guest_id→guests(nullable),
  direction[out|in], status, payload(json), created_at
```

### CUSTOMER MEMORY (after-sales — detail: customer-memory.md)
```
customer_memory                       ← profil ingatan, 1:1 users
  id, user_id→users(UNIQUE),
  preferensi(json),                   -- catatan LUNAK, bukan fakta keras
  last_interaction_at, updated_at
  -- fakta keras baca dari users + intake_session/config (hindari drift)

customer_session_summary              ← 1 baris per sesi chat selesai
  id, user_id→users, conversation_id→conversations,
  invitation_id→invitations(nullable),   -- 1 customer : N acara
  summary(≤300char), next_action(nullable),
  status[draft|confirmed], created_at
```
> Transkrip chat REUSE `conversations`+`messages` (jangan bikin tabel baru). Trigger ringkasan: idle 30m / publish / paid. Inject ke LLM = ringkasan+profil, BUKAN transkrip.

### ANALYTICS
```
analytics_events
  id, invitation_id→invitations, guest_id→guests(nullable),
  event_type[VIEW|RSVP|GUESTBOOK|CHECKIN], meta(json), created_at
  index analytics_events_view_dedupe_idx (invitation_id, guest_id, event_type, created_at)   -- 0011, B-017a
```
> VIEW dicatat atomik (B-017a, `lib/invitation/view-tracking.ts`): satu transaksi per guest (atau per undangan untuk buka anonim) dikunci `pg_advisory_xact_lock`, lalu cek window 30 menit �� insert → `guests.opened_count + 1`. Dua buka bersamaan tidak lagi menghasilkan dua baris.

### API OPERATIONAL STATE (migrasi 0016, R-03, D-043)
```
api_rate_limits                       -- ditulis hanya oleh services/api (B-013)
  bucket varchar(120) PK              -- rsvp:link:<guest id> | rsvp:ip:<HMAC 32 hex> | wish:link:<guest id> | wish:ip:<HMAC>;
                                      -- tidak pernah alamat IP
  window_start timestamp, hits int    -- window tetap; baris > 1 hari dipangkas saat window baru dibuka
  index api_rate_limits_window_idx (window_start)
api_idempotency_keys                  -- ditulis hanya oleh services/api
  PK (scope varchar(120), key varchar(255))   -- scope: rsvp:guest:<guest id> | wish:guest:<guest id>
                                              --   | rsvp:host:<owner>:<invitation>:<guest> | wish:host:<owner>:<invitation>:<wish> | wish:reply:<owner>:<invitation>:<wish>
  request_hash varchar(64), response_status int, response_body jsonb, created_at timestamp
  index api_idempotency_keys_created_idx (created_at)   -- disimpan 24 jam
```
> Bukan data domain: penghitung batas tulis dan kunci idempotensi, dicatat di transaksi yang sama dengan tulisan yang dilindunginya (replay jawaban yang sudah commit, 422 untuk kunci yang dipakai ulang dengan isi lain). Migrasi aditif; Next.js tidak membaca atau menulisnya.
> **Scope = siapa yang boleh menerima replay (s29, D-046).** Kunci tamu terikat ke tamu hasil resolusi link. Kunci host terikat ke pemilik (`users.id` dari token yang sudah diverifikasi), undangan dan tamu/ucapan di path: pelanggan lain, undangan lain atau resource lain tidak pernah membaca jawaban tersimpan, permintaannya dinilai ulang dan ditolak oleh cek kepemilikan (404, tanpa perubahan data). Retry sah pemilik yang sama tetap replay, termasuk hapus yang jawabannya hilang.

## Nunggu OPEN ITEMS
- #1 opsi B → tambah tabel `wa_devices(id, user_id, fonnte_token, status)`.
- #3 → `revision_count` naik per sesi chat selesai (logika app, DB siap).

## intake_session (slot-filling Design Agent — detail: design-agent.md)
```
intake_session                        ← state slot-filling, resume kalau chat keputus
  id, invitation_id→invitations, event_type,
  slots(json: {field:{value,status,source_utterance}}),
  template_id→templates, palette_id,
  status[in_progress|ready|assembled], updated_at
```
> OTORITAS fakta intake (nama/tanggal/venue). customer_memory TIDAK dobel simpan fakta ini.
