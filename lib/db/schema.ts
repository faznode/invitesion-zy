import {
  pgTable,
  bigint,
  bigserial,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
/**
 * Local identity.
 *
 * Clerk owns credentials, sessions, password reset, email verification, and
 * social sign-in. This table stays the identity every domain table points at:
 * `invitations`, `orders`, and the rest reference `users.id` as an integer, and
 * five foreign keys is precisely the amount of schema churn worth avoiding.
 *
 * So the mapping is one column. A Clerk account is resolved to a local row on
 * first sight (`lib/auth/clerk-user.ts`), and nothing downstream of `getUser()`
 * knows Clerk exists.
 *
 * `passwordHash` is nullable because Clerk holds the credential now. Rows
 * created before the migration keep their hash — dead weight, but dropping the
 * column would destroy the only fallback if Clerk is ever removed.
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkUserId: varchar('clerk_user_id', { length: 120 }).unique(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 30 }).unique(), // resolver identity WA↔web (customer-memory.md)
  avatarUrl: text('avatar_url'),
  whatsapp: varchar('whatsapp', { length: 30 }),
  instagram: varchar('instagram', { length: 100 }),
  xHandle: varchar('x_handle', { length: 100 }),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  passwordHash: text('password_hash'),
  role: varchar('role', { length: 20 }).notNull().default('CUSTOMER'), // CUSTOMER | ADMIN
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// ─────────────────────────────────────────────
// CONTENT
// ─────────────────────────────────────────────
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  // Kategori katalog (lib/invitation/templates.ts TemplateCategory, 27 nilai
  // seperti 'employee-appreciation' @ 21 char) — BUKAN lagi cuma 6 event type
  // inti lawas (wedding|birthday|aqiqah|tasyakuran|khitanan|corporate).
  // Lebar 30 dipilih dengan longgar di atas kategori terpanjang saat ini.
  category: varchar('category', { length: 30 }).notNull(),
  defaultConfig: jsonb('default_config'),
  thumbnail: text('thumbnail'),
  isPremium: boolean('is_premium').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    templateId: integer('template_id').references(() => templates.id),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    eventType: varchar('event_type', { length: 20 }).notNull(),
    config: jsonb('config'), // source of truth isi undangan; renderer deterministik config→HTML
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT|PUBLISHED|EXPIRED
    revisionCount: integer('revision_count').notNull().default(0), // max 3
    publishedAt: timestamp('published_at'),
    expiresAt: timestamp('expires_at'), // published_at + 12 bulan
    createdAt: timestamp('created_at').notNull().defaultNow(),
    // B-037 (D-055): the key a creation carried (the wizard's draft key). A retry of the same creation by the same owner
    // finds its row instead of making a second draft, through either content writer. Null for rows made without one.
    creationKey: varchar('creation_key', { length: 255 }),
    // B-031 (D-063): the owner's deletion. `deleted_at` opens the soft-delete window: every guest surface and every writer
    // treats the invitation as gone and only its owner may restore it. The purge job (`services/api/src/retention.rs`)
    // runs from `purge_after`, removes the guests, wishes, analytics, versions and media, clears the content and sets
    // `purged_at`; the row stays as a tombstone so orders keep their reference and the slug is never handed out again.
    deletedAt: timestamp('deleted_at'),
    purgeAfter: timestamp('purge_after'),
    purgedAt: timestamp('purged_at'),
    // G-052 (D-067): the reseller workspace this is a client invitation of, and the client's name as the workspace lists
    // it. Null for a personal invitation. `user_id` stays the owner of record (content, checkout, publishing, the team,
    // deletion); the workspace's staff get the co-host's or the desk's capabilities through their membership.
    workspaceId: integer('workspace_id').references(() => workspaces.id),
    clientLabel: varchar('client_label', { length: 80 }),
    // G-047 (D-069): the host's optional guest passcode, as a salted scrypt hash only (never the code; never in `config`,
    // so never in a version, the editor's payload or a restore). Null = no passcode. Written only by `guest-passcode-db.ts`.
    guestPasscodeHash: varchar('guest_passcode_hash', { length: 200 }),
    guestPasscodeSetAt: timestamp('guest_passcode_set_at'),
  },
  // Unique per owner, and only where a key exists: rows created before B-037 (all null) never collide.
  (t) => ({
    creationKeyIdx: uniqueIndex('invitations_user_creation_key_idx').on(t.userId, t.creationKey).where(sql`${t.creationKey} is not null`),
    workspaceIdx: index('invitations_workspace_idx').on(t.workspaceId).where(sql`${t.workspaceId} is not null`),
    purgeDueIdx: index('invitations_purge_due_idx').on(t.purgeAfter).where(sql`${t.deletedAt} is not null and ${t.purgedAt} is null`),
    deletionWindowCheck: check(
      'invitations_deletion_window_check',
      sql`(${t.deletedAt} is null) = (${t.purgeAfter} is null) and (${t.purgeAfter} is null or ${t.purgeAfter} >= ${t.deletedAt})`,
    ),
    purgedCheck: check('invitations_purged_check', sql`${t.purgedAt} is null or ${t.deletedAt} is not null`),
  }),
);

export const invitationVersions = pgTable(
  'invitation_versions',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id),
    versionNo: integer('version_no').notNull(),
    config: jsonb('config'),
    createdBy: varchar('created_by', { length: 20 }).notNull(), // customer | ai-agent
    isLive: boolean('is_live').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  // B-035: every save reads `max(version_no)` for its invitation under the row lock (an index-only lookup with this).
  // Not unique: rows written before the lock existed may repeat a number, and an additive migration must not fail on them.
  (t) => ({ invitationVersionIdx: index('invitation_versions_invitation_version_idx').on(t.invitationId, t.versionNo) }),
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id),
    type: varchar('type', { length: 20 }).notNull(), // photo|video|music
    url: text('url').notNull(),
    // Canonical display order. Set from the caller's explicit upload sequence
    // (e.g. the order images were sent in chat), NEVER derived from filename,
    // attachment id, path, or url — those are random identifiers.
    sortOrder: integer('sort_order').notNull().default(0),
    // The raw sequence the uploader reported (1-based order of arrival). Kept
    // distinct from sortOrder so reorders don't lose the original intake order.
    uploadSequence: integer('upload_sequence'),
    source: varchar('source', { length: 20 }).notNull().default('web'), // web | chat | import
    meta: jsonb('meta'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    sequenceUnique: uniqueIndex('media_assets_invitation_sequence_unique').on(
      t.invitationId,
      t.uploadSequence,
    ),
  }),
);

// ─────────────────────────────────────────────
// GUESTS
// ─────────────────────────────────────────────
export const guests = pgTable(
  'guests',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id),
    name: varchar('name', { length: 150 }).notNull(),
    slug: varchar('slug', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    category: varchar('category', { length: 50 }),
    qrCode: text('qr_code'),
    sentAt: timestamp('sent_at'),
    openedAt: timestamp('opened_at'),
    openedCount: integer('opened_count').notNull().default(0),
    rsvpStatus: varchar('rsvp_status', { length: 20 }).notNull().default('PENDING'), // PENDING|CONFIRMED|DECLINED|MAYBE (B-027)
    // Seats the host allows for this link; an RSVP never changes it (B-007).
    guestCount: integer('guest_count').notNull().default(1),
    // People the guest said will come (0 on decline). Null = no answer yet or a row answered before B-007.
    attendingCount: integer('attending_count'),
    // Answers to the host's custom questions, { [questionId]: string | string[] | number } (B-027, D-034); written with
    // the RSVP, cleared on a decline, read only through `readStoredAnswers`. Null = none.
    rsvpAnswers: jsonb('rsvp_answers'),
    // Answers per event, { [eventId]: { status, attending } } (B-027 slice 2c, D-036), keyed by the durable event id and
    // written by the same UPDATE as the RSVP; read only through `readEventAnswers`. Null = none.
    rsvpEventAnswers: jsonb('rsvp_event_answers'),
    // Invite-only events this guest is invited to, [eventId, ...] (D-037); read only through `readInvitedEventIds`.
    // Null = none. Open events are never listed: every guest sees them.
    invitedEventIds: jsonb('invited_event_ids'),
    checkedInAt: timestamp('checked_in_at'),
    // Opaque link credential (B-011). Null = legacy guest reachable by slug; set = reachable by this token only.
    linkToken: varchar('link_token', { length: 32 }),
    // B-033: the import that created this guest (a UUID), so one import can be undone; null = added one by one.
    importBatchId: varchar('import_batch_id', { length: 36 }),
    // B-024 (D-056): the guest pass's lookup id, 122 random bits as 32 hex characters, set by the database for every
    // row (existing rows got one when the column was added), so no writer generates it. The QR carries it only inside
    // an HMAC-signed token (`lib/invitation/guest-pass.ts`), never the guest id. `qr_code` above is a baseline column
    // nothing reads or writes.
    passId: varchar('pass_id', { length: 32 }).notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
  },
  (t) => ({
    slugUnique: uniqueIndex('guests_invitation_slug_unique').on(t.invitationId, t.slug),
    linkTokenUnique: uniqueIndex('guests_link_token_unique').on(t.linkToken),
    passIdUnique: uniqueIndex('guests_pass_id_unique').on(t.passId),
    importBatchIdx: index('guests_import_batch_idx').on(t.invitationId, t.importBatchId).where(sql`${t.importBatchId} is not null`),
  }),
);

/**
 * B-033: self-registrations waiting for the host. Only pending requests live here: approving one moves it into `guests`
 * (the roster writer, one transaction) and rejecting one deletes it, so a refused registrant's data is not kept.
 */
export const guestRegistrations = pgTable(
  'guest_registrations',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    // Seats the registrant asked for (1–5); the host sees it before approving.
    guestCount: integer('guest_count').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ invitationIdx: index('guest_registrations_invitation_idx').on(t.invitationId, t.createdAt) }),
);

/** B-033: an invitation's open self-registration link (`/daftar/<token>`); no row = registration closed. */
export const guestRegistrationLinks = pgTable(
  'guest_registration_links',
  {
    invitationId: integer('invitation_id')
      .primaryKey()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 32 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ tokenUnique: uniqueIndex('guest_registration_links_token_unique').on(t.token) }),
);

/**
 * G-044 (D-057): who else works on an invitation. A row starts as a join link the owner made for one role (`cohost` or
 * `usher`), stored only as the SHA-256 of its secret, and becomes a grant when a signed-in customer accepts it
 * (`user_id`, `accepted_at`). Revoking sets `revoked_at`; rows are never deleted, so the owner's team page and every
 * access check read this one table, live: a revoked grant stops working at the next request.
 */
export const invitationMembers = pgTable(
  'invitation_members',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // cohost | usher
    // The owner's note for whom the link is ("Rina, penerima tamu"); shown to the owner only.
    label: varchar('label', { length: 60 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    // The join link's expiry; an accepted grant does not expire.
    expiresAt: timestamp('expires_at').notNull(),
    userId: integer('user_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('invitation_members_token_unique').on(t.tokenHash),
    // One live grant per account and invitation, whatever the number of links it was sent.
    liveGrantUnique: uniqueIndex('invitation_members_live_grant_unique')
      .on(t.invitationId, t.userId)
      .where(sql`${t.userId} is not null and ${t.revokedAt} is null`),
    userIdx: index('invitation_members_user_idx').on(t.userId).where(sql`${t.revokedAt} is null`),
    invitationIdx: index('invitation_members_invitation_idx').on(t.invitationId, t.createdAt),
    roleCheck: check('invitation_members_role_check', sql`${t.role} in ('cohost', 'usher')`),
  }),
);

/**
 * G-052 (D-067): a reseller's workspace, one per customer account (its owner), who assigns their own invitations to it
 * as client invitations. `credit_balance` is the running total of `workspace_credit_entries`, changed only in the same
 * transaction as an entry and under this row's lock. A workspace is never deleted: `disabled_at` stops every membership
 * at the next request.
 */
export const workspaces = pgTable(
  'workspaces',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    ownerUserId: integer('owner_user_id')
      .notNull()
      .references(() => users.id),
    creditBalance: integer('credit_balance').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    disabledAt: timestamp('disabled_at'),
  },
  (t) => ({
    ownerUnique: uniqueIndex('workspaces_owner_unique').on(t.ownerUserId),
    balanceCheck: check('workspaces_credit_balance_check', sql`${t.creditBalance} >= 0`),
  }),
);

/**
 * G-052 (D-067): a workspace's staff, kept as G-044 keeps a team: a join link for one role (`manager` or `desk`) stored as
 * the SHA-256 of its secret, a grant once a customer accepts it, `revoked_at` when the owner revokes it or the member
 * leaves. Rows are never deleted; every access check reads this table live.
 */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // manager | desk
    label: varchar('label', { length: 60 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    userId: integer('user_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('workspace_members_token_unique').on(t.tokenHash),
    liveGrantUnique: uniqueIndex('workspace_members_live_grant_unique')
      .on(t.workspaceId, t.userId)
      .where(sql`${t.userId} is not null and ${t.revokedAt} is null`),
    userIdx: index('workspace_members_user_idx').on(t.userId).where(sql`${t.revokedAt} is null`),
    workspaceIdx: index('workspace_members_workspace_idx').on(t.workspaceId, t.createdAt),
    roleCheck: check('workspace_members_role_check', sql`${t.role} in ('manager', 'desk')`),
  }),
);

/**
 * G-052 (D-067): a workspace's credit ledger, append-only. Each entry carries an operation key unique per workspace (a
 * replay returns the first entry; another payload under the same key is a conflict) and the balance after it, written
 * with `workspaces.credit_balance` in one transaction under the workspace's row lock. A debit that would overdraw is
 * refused. What a credit buys, its price, packs and top-ups are owner decisions (B-040, G-049): no product path writes
 * this table yet.
 */
export const workspaceCreditEntries = pgTable(
  'workspace_credit_entries',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    operationKey: varchar('operation_key', { length: 80 }).notNull(),
    kind: varchar('kind', { length: 12 }).notNull(), // grant | debit
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    invitationId: integer('invitation_id').references(() => invitations.id),
    actorUserId: integer('actor_user_id').references(() => users.id),
    note: varchar('note', { length: 200 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    operationUnique: uniqueIndex('workspace_credit_entries_operation_unique').on(t.workspaceId, t.operationKey),
    kindCheck: check(
      'workspace_credit_entries_kind_check',
      sql`(${t.kind} = 'debit' and ${t.delta} < 0) or (${t.kind} = 'grant' and ${t.delta} > 0)`,
    ),
    balanceCheck: check('workspace_credit_entries_balance_check', sql`${t.balanceAfter} >= 0`),
  }),
);

/**
 * G-045 (D-058): the owner's seating tables for one invitation. Host-only day-of data: written only by
 * `lib/invitation/host-logs-db.ts`, read only by the owner's logs page and its export, never by a guest page, a public
 * payload or the check-in desk.
 */
export const seatingTables = pgTable(
  'seating_tables',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    // Seats at the table; null = not counted.
    capacity: integer('capacity'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('seating_tables_invitation_name_unique').on(t.invitationId, t.name),
    capacityCheck: check('seating_tables_capacity_check', sql`${t.capacity} is null or ${t.capacity} between 1 and 100`),
  }),
);

/** G-045 (D-058): one guest's host-only day-of record: the table and seat, and when a souvenir was handed out. */
export const guestLogs = pgTable(
  'guest_logs',
  {
    guestId: integer('guest_id')
      .primaryKey()
      .references(() => guests.id, { onDelete: 'cascade' }),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    // Removing a table leaves its guests unseated.
    tableId: integer('table_id').references(() => seatingTables.id, { onDelete: 'set null' }),
    seat: varchar('seat', { length: 20 }),
    // The first hand-out is kept, as a first arrival is (D-056).
    souvenirAt: timestamp('souvenir_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    invitationIdx: index('guest_logs_invitation_idx').on(t.invitationId),
    tableIdx: index('guest_logs_table_idx').on(t.tableId),
  }),
);

/** G-045 (D-058): gifts the owner records (an envelope, a present, a transfer), from a listed guest or a typed name. */
export const giftLogs = pgTable(
  'gift_logs',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    guestId: integer('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    // The giver as recorded: the guest's name at the time or a typed name, kept if the guest row goes.
    giverName: varchar('giver_name', { length: 150 }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull(), // envelope | present | transfer | other
    // Rupiah when the owner chooses to note it; null = not noted.
    amount: bigint('amount', { mode: 'number' }),
    note: varchar('note', { length: 300 }),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
    // The form's one-time key: a double tap or a resend records one entry.
    requestKey: varchar('request_key', { length: 64 }).notNull(),
    // I-04 (D-059): the family the gift is attributed to on a wedding; null = not attributed (every entry before I-04).
    familySide: varchar('family_side', { length: 8 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    requestUnique: uniqueIndex('gift_logs_request_unique').on(t.invitationId, t.requestKey),
    invitationIdx: index('gift_logs_invitation_idx').on(t.invitationId, t.receivedAt),
    kindCheck: check('gift_logs_kind_check', sql`${t.kind} in ('envelope', 'present', 'transfer', 'other')`),
    amountCheck: check('gift_logs_amount_check', sql`${t.amount} is null or ${t.amount} between 0 and 1000000000000`),
    familySideCheck: check('gift_logs_family_side_check', sql`${t.familySide} is null or ${t.familySide} in ('bride', 'groom')`),
  }),
);

// R-04 (B-028, D-044): a wish is visible (`is_hidden` false), awaiting the host (hidden and never reviewed: the
// guestbook's moderation was on when it arrived) or hidden by the host (hidden and reviewed). `host_reply` renders under
// a visible wish. B-017: the guest page reads the newest visible wishes of one invitation through the index.
export const guestMessages = pgTable(
  'guest_messages',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id),
    guestId: integer('guest_id').references(() => guests.id),
    name: varchar('name', { length: 150 }).notNull(),
    message: text('message').notNull(),
    isHidden: boolean('is_hidden').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
    hostReply: text('host_reply'),
    repliedAt: timestamp('replied_at'),
  },
  (t) => ({
    visibleIdx: index('guest_messages_invitation_visible_idx').on(t.invitationId, t.isHidden, t.createdAt),
  }),
);

// ─────────────────────────────────────────────
// COMMERCE  (Midtrans one-time, bukan subscription)
// ─────────────────────────────────────────────
/**
 * Orders are provider-neutral.
 *
 * This table previously hard-coded `midtrans_order_id`. Payment now runs on two
 * rails — QRIS for IDR, Stripe for international — so the provider identity is a
 * column, not a column name. `reference` is ours and is the idempotency anchor
 * on both sides; `provider_payment_id` is theirs, kept for reconciliation.
 *
 * `amount` is integer MINOR UNITS in `currency`'s exponent (see lib/payment/money.ts).
 * For IDR that is whole rupiah; for USD it is cents. Never a float.
 */
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  invitationId: integer('invitation_id').references(() => invitations.id),
  // Theme the order bought. Entitlement is per (invitation, template): switching
  // themes means paying again, so the gate has to know which theme a PAID order
  // covers. NULL on orders that predate this column; those are grandfathered as
  // valid for any theme (see lib/payment/service.ts hasPaidOrder).
  templateId: integer('template_id').references(() => templates.id),
  tier: varchar('tier', { length: 50 }),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING|PAID|FAILED|EXPIRED
  rail: varchar('rail', { length: 20 }).notNull(), // qris | stripe
  reference: varchar('reference', { length: 120 }).notNull().unique(), // ours; idempotency anchor
  providerPaymentId: varchar('provider_payment_id', { length: 200 }), // theirs
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'), // payment window, not invitation lifetime
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // B-039 (migration 0027): the checkout form's key, one order per (customer, invitation, key), and the SHA-256 of the
  // server-computed intent it was bound to (lib/payment/checkout-key.ts). NULL on older orders and on keyless submits.
  checkoutKey: varchar('checkout_key', { length: 64 }),
  checkoutIntent: varchar('checkout_intent', { length: 64 }),
  // G-053 (migration 0029): the price before coupons when the order has any (`order_coupons`); `amount` is what it
  // charges. NULL on every coupon-free order, where `amount` is the price.
  listAmount: integer('list_amount'),
}, (t) => ({
  checkoutKeyIdx: uniqueIndex('orders_user_checkout_key_idx')
    .on(t.userId, t.invitationId, t.checkoutKey)
    .where(sql`${t.checkoutKey} is not null`),
}));

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  transactionId: varchar('transaction_id', { length: 200 }),
  status: varchar('status', { length: 30 }),
  rawPayload: jsonb('raw_payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Webhook delivery log — the thing that makes settlement idempotent.
 *
 * Providers retry on any non-2xx, on timeouts, and sometimes for no reason at
 * all. Without a record of which deliveries were already handled, a retry can
 * pay an order twice, or create a second account for the same customer.
 *
 * UNIQUE(rail, event_id) is the guard: the insert either wins or conflicts, and
 * a conflict means "already done, answer 200 and stop".
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: serial('id').primaryKey(),
    rail: varchar('rail', { length: 20 }).notNull(),
    eventId: varchar('event_id', { length: 200 }).notNull(),
    orderId: integer('order_id').references(() => orders.id),
    status: varchar('status', { length: 30 }),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('payment_events_rail_event_unique').on(table.rail, table.eventId)],
);

/**
 * G-050 (migration 0028): one receipt per paid order, written only by the Rust jobs runner when it delivers the order's
 * `payment_settled` outbox row (`services/api/src/payment/receipt.rs`). Next.js reads receipts for their owner and, on
 * the owner's request for an earlier payment, re-arms that order's outbox row (`lib/payment/receipts.ts`). Every column
 * is copied from the order and its payment when the receipt is issued, so it carries only the payment record's data and
 * never changes afterwards. Orders, payments and receipts are all kept by B-031's purge.
 */
export const receipts = pgTable(
  'receipts',
  {
    id: serial('id').primaryKey(),
    // Taken from `receipt_counters` under its row lock, in the issuing transaction: increasing in commit order, no gaps.
    number: integer('number').notNull(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    paymentId: integer('payment_id')
      .notNull()
      .references(() => payments.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    reference: varchar('reference', { length: 120 }).notNull(),
    tier: varchar('tier', { length: 50 }),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    rail: varchar('rail', { length: 20 }).notNull(),
    transactionId: varchar('transaction_id', { length: 200 }),
    paidAt: timestamp('paid_at').notNull(),
    issuedAt: timestamp('issued_at').notNull().defaultNow(),
  },
  (table) => [
    unique('receipts_number_unique').on(table.number),
    unique('receipts_order_unique').on(table.orderId),
    unique('receipts_payment_unique').on(table.paymentId),
    index('receipts_user_number_idx').on(table.userId, table.number),
  ],
);

/** G-050: the numbering's one counter row (`scope = 'receipt'`), created by its first increment. */
export const receiptCounters = pgTable('receipt_counters', {
  scope: varchar('scope', { length: 20 }).primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

/**
 * G-053 (migration 0029, D-066): coupons, created only by an administrator and always inactive until activated. A
 * percentage (1–99) or a fixed amount in one currency, optionally for one tier, inside an optional window, with an
 * optional cap on redemptions that still count and a per-customer limit (1: one use per rule). Stacking only between
 * coupons that all allow it. The rules are `lib/payment/coupons.ts`; the checks below refuse a malformed row anyway.
 */
export const coupons = pgTable(
  'coupons',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    kind: varchar('kind', { length: 10 }).notNull(),
    percentOff: integer('percent_off'),
    amountOff: integer('amount_off'),
    currency: varchar('currency', { length: 3 }),
    tier: varchar('tier', { length: 50 }),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    maxRedemptions: integer('max_redemptions'),
    perCustomer: integer('per_customer').notNull().default(1),
    stackable: boolean('stackable').notNull().default(false),
    active: boolean('active').notNull().default(false),
    // Affiliate attribution: the partner a code was issued to, an administrator's label shown only in the console.
    // Commission rates, partner agreements and payouts are owner decisions and are not modelled.
    partner: varchar('partner', { length: 64 }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    disabledAt: timestamp('disabled_at'),
  },
  (t) => [
    unique('coupons_code_unique').on(t.code),
    check('coupons_kind_check', sql`${t.kind} in ('percent', 'fixed')`),
    check(
      'coupons_value_check',
      sql`(${t.kind} = 'percent' and ${t.percentOff} between 1 and 99 and ${t.amountOff} is null) or (${t.kind} = 'fixed' and ${t.amountOff} >= 1 and ${t.percentOff} is null and ${t.currency} in ('IDR', 'USD'))`,
    ),
    check('coupons_limits_check', sql`${t.perCustomer} >= 1 and (${t.maxRedemptions} is null or ${t.maxRedemptions} >= 1)`),
    check('coupons_window_check', sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.startsAt} < ${t.endsAt}`),
  ],
);

/**
 * G-053: the coupons an order used, written with the order in one transaction under the coupons' row locks. The order's
 * customer is copied for the per-customer count. A redemption counts while its order is PAID, or PENDING and payable.
 */
export const orderCoupons = pgTable(
  'order_coupons',
  {
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    couponId: integer('coupon_id')
      .notNull()
      .references(() => coupons.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    discount: integer('discount').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ name: 'order_coupons_pk', columns: [t.orderId, t.couponId] }),
    index('order_coupons_coupon_user_idx').on(t.couponId, t.userId),
    check('order_coupons_discount_check', sql`${t.discount} >= 0 and ${t.position} between 1 and 3`),
  ],
);

// ─────────────────────────────────────────────
// AI / MESSAGING
// ─────────────────────────────────────────────
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id), // nullable: customer baru blm kedaftar
  customerPhone: varchar('customer_phone', { length: 30 }),
  invitationId: integer('invitation_id').references(() => invitations.id),
  channel: varchar('channel', { length: 20 }).notNull().default('wa'), // wa | web
  state: varchar('state', { length: 30 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id),
  senderType: varchar('sender_type', { length: 20 }).notNull(), // customer | agent
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const intakeSession = pgTable('intake_session', {
  id: serial('id').primaryKey(),
  invitationId: integer('invitation_id').references(() => invitations.id),
  eventType: varchar('event_type', { length: 20 }),
  slots: jsonb('slots'), // {field:{value,status,source_utterance}}
  templateId: integer('template_id').references(() => templates.id),
  paletteId: varchar('palette_id', { length: 50 }),
  status: varchar('status', { length: 20 }).notNull().default('in_progress'), // in_progress|ready|assembled
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const agentTasks = pgTable('agent_tasks', {
  id: serial('id').primaryKey(),
  invitationId: integer('invitation_id').references(() => invitations.id),
  type: varchar('type', { length: 20 }).notNull(), // DESIGN | REVISION
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  input: jsonb('input'),
  output: jsonb('output'),
  versionId: integer('version_id').references(() => invitationVersions.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const waLog = pgTable('wa_log', {
  id: serial('id').primaryKey(),
  invitationId: integer('invitation_id').references(() => invitations.id),
  guestId: integer('guest_id').references(() => guests.id),
  direction: varchar('direction', { length: 10 }).notNull(), // out | in
  status: varchar('status', { length: 30 }),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// CUSTOMER MEMORY (after-sales — customer-memory.md)
// ─────────────────────────────────────────────
export const customerMemory = pgTable('customer_memory', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  preferensi: jsonb('preferensi'), // catatan LUNAK, bukan fakta keras
  lastInteractionAt: timestamp('last_interaction_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const customerSessionSummary = pgTable('customer_session_summary', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  conversationId: integer('conversation_id').references(() => conversations.id),
  invitationId: integer('invitation_id').references(() => invitations.id), // 1 customer : N acara
  summary: varchar('summary', { length: 300 }).notNull(),
  nextAction: text('next_action'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | confirmed
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────���──────────────────────────────────���
// ANALYTICS
// ─────────────────────────────────────��───────
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id),
    guestId: integer('guest_id').references(() => guests.id),
    eventType: varchar('event_type', { length: 20 }).notNull(), // VIEW|RSVP|GUESTBOOK|CHECKIN
    meta: jsonb('meta'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    // The view-dedupe lookup (B-017a, QA-010): one invitation, one guest, one event type, newest first.
    viewDedupe: index('analytics_events_view_dedupe_idx').on(t.invitationId, t.guestId, t.eventType, t.createdAt),
  }),
);

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  invitations: many(invitations),
  orders: many(orders),
  memory: one(customerMemory),
}));

export const invitationsRelations = relations(invitations, ({ one, many }) => ({
  user: one(users, { fields: [invitations.userId], references: [users.id] }),
  template: one(templates, { fields: [invitations.templateId], references: [templates.id] }),
  versions: many(invitationVersions),
  guests: many(guests),
  media: many(mediaAssets),
}));

export const invitationVersionsRelations = relations(invitationVersions, ({ one }) => ({
  invitation: one(invitations, {
    fields: [invitationVersions.invitationId],
    references: [invitations.id],
  }),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  invitation: one(invitations, { fields: [guests.invitationId], references: [invitations.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  invitation: one(invitations, { fields: [orders.invitationId], references: [invitations.id] }),
  template: one(templates, { fields: [orders.templateId], references: [templates.id] }),
  payments: many(payments),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ─────────────────────────────────────────────
// API OPERATIONAL STATE (R-03, D-043): written only by the Rust API (services/api); no domain data
// ─────────────────────────────────────────────
// Fixed-window write counters shared by every API instance (B-013). `bucket` names what is limited:
// `rsvp:link:<guest id>` or `rsvp:ip:<keyed hash>`; an address never reaches this table. Rows older than a day are pruned.
export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    bucket: varchar('bucket', { length: 120 }).primaryKey(),
    windowStart: timestamp('window_start').notNull(),
    hits: integer('hits').notNull(),
  },
  (t) => ({ windowIdx: index('api_rate_limits_window_idx').on(t.windowStart) }),
);

// A write protected by an `Idempotency-Key`, committed in the same transaction as that write with its response, so a
// retry replays the response. `scope` names who may receive the replay: the guest a link resolves to
// (`rsvp:guest:<id>`), or for a host write the verified owner, the invitation and the guest or wish
// (`rsvp:host:<owner>:<invitation>:<guest>`; D-046). Kept 24 hours.
export const apiIdempotencyKeys = pgTable(
  'api_idempotency_keys',
  {
    scope: varchar('scope', { length: 120 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scope, t.key] }),
    createdIdx: index('api_idempotency_keys_created_idx').on(t.createdAt),
  }),
);

// ─────────────────────────────────────────────
// JOBS AND MEDIA VARIANTS (B-019, 09 §8.6–8.7)
// ─────────────────────────────────────────────
// The job queue. Next.js inserts a row (kind, payload, dedupe key, `run_at` in UTC wall time); the Rust runner
// (`services/api/src/jobs.rs`) owns the processing columns: attempts, the lease (`locked_until`), the retry time, the
// last error and completion. Due rows are claimed with `for update skip locked`; a job at `max_attempts` without
// `done_at` has failed and keeps its last error.
export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: varchar('kind', { length: 40 }).notNull(),
    payload: jsonb('payload').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    runAt: timestamp('run_at').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedUntil: timestamp('locked_until'),
    lastError: varchar('last_error', { length: 500 }),
    doneAt: timestamp('done_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    dedupe: uniqueIndex('jobs_kind_dedupe_unique').on(t.kind, t.dedupeKey),
    due: index('jobs_due_idx').on(t.runAt).where(sql`${t.doneAt} is null`),
  }),
);

// The WebP variants of a host's public upload (B-019), written only by the Rust image-variant job
// (`services/api/src/media.rs`) and read by the guest page for `srcset` (`lib/media/variants.ts`). Objects live under
// `variants/<invitation>/<name>/`, never beside the original; deleting rows makes the pages serve the originals again.
export const mediaVariants = pgTable(
  'media_variants',
  {
    id: serial('id').primaryKey(),
    invitationId: integer('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    sourceKey: varchar('source_key', { length: 512 }).notNull(),
    variantKey: varchar('variant_key', { length: 512 }).notNull(),
    format: varchar('format', { length: 10 }).notNull(), // webp
    tier: varchar('tier', { length: 10 }).notNull(), // standard | lite (Save-Data, I-28)
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    variant: uniqueIndex('media_variants_source_unique').on(t.sourceKey, t.tier, t.format, t.width),
    invitationIdx: index('media_variants_invitation_idx').on(t.invitationId),
  }),
);

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type InvitationVersion = typeof invitationVersions.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type GuestRegistration = typeof guestRegistrations.$inferSelect;
export type InvitationMember = typeof invitationMembers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CustomerMemory = typeof customerMemory.$inferSelect;
export type CustomerSessionSummary = typeof customerSessionSummary.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

// Activity log action enum (dipertahankan dari starter, dipakai auth/session)
export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_INVITATION = 'CREATE_INVITATION',
  PUBLISH_INVITATION = 'PUBLISH_INVITATION',
}
