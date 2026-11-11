/**
 * B-031 (D-063): the owner's deletion and the retention after expiry, as pure rules shared by the owner's actions, the
 * guest surfaces and the dry run. The purge itself is the Rust job `invitation_purge` (`services/api/src/retention.rs`,
 * ADR-A2 §8.6).
 *
 * The durations belong to the owner and to counsel (the UU PDP review is EXT), so none is invented here: deletion stays
 * off until `FLAG_INVITATION_DELETION` is on and `INVITATION_DELETION_WINDOW_DAYS` is set, and the sweep after expiry
 * does nothing until `INVITATION_RETENTION_DAYS_AFTER_EXPIRY` is set. Tests pass explicit fixture values.
 */

export const PURGE_JOB_KIND = 'invitation_purge';
/** About fifteen hours of retries (backoff doubles to an hourly cap): a storage outage does not leave objects behind. */
export const PURGE_MAX_ATTEMPTS = 20;
const DAY_MS = 86_400_000;
const MAX_DAYS = 3650;

type Env = Record<string, string | undefined>;

export type RetentionConfig = {
  /** Days between the owner's deletion and the purge; null = deletion unavailable. At least one day: a window first. */
  windowDays: number | null;
  /** Days after `expires_at` before the sweep schedules a deletion; null = no automatic retention deletion. */
  retentionDaysAfterExpiry: number | null;
};

function parseDays(raw: string | undefined, min: number): number | null {
  const value = raw?.trim();
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const days = Number(value);
  return days >= min && days <= MAX_DAYS ? days : null;
}

export function retentionConfig(env: Env = process.env): RetentionConfig {
  return {
    windowDays: parseDays(env.INVITATION_DELETION_WINDOW_DAYS, 1),
    retentionDaysAfterExpiry: parseDays(env.INVITATION_RETENTION_DAYS_AFTER_EXPIRY, 0),
  };
}

export type DeletionColumns = { deletedAt: Date | null; purgeAfter: Date | null; purgedAt: Date | null };

export type DeletionState =
  | { kind: 'live' }
  /** In the window (or past it, waiting for the job): gone for guests and writers; the owner may still restore it. */
  | { kind: 'scheduled'; deletedAt: Date; purgeAfter: Date }
  /** A tombstone: nothing left to restore. */
  | { kind: 'purged'; purgedAt: Date };

export function deletionState(row: DeletionColumns): DeletionState {
  if (row.purgedAt) return { kind: 'purged', purgedAt: row.purgedAt };
  if (row.deletedAt && row.purgeAfter) return { kind: 'scheduled', deletedAt: row.deletedAt, purgeAfter: row.purgeAfter };
  return { kind: 'live' };
}

/** Gone for every guest surface and every writer: deleted, whether or not the purge has run. */
export function isInvitationGone(row: Pick<DeletionColumns, 'deletedAt'>): boolean {
  return row.deletedAt !== null;
}

export function purgeAfterFor(deletedAt: Date, windowDays: number): Date {
  return new Date(deletedAt.getTime() + windowDays * DAY_MS);
}

/** Expired and past the retention period, and not already deleted. Drafts never expire (no `expires_at`). */
export function retentionDue(row: { expiresAt: Date | null } & Pick<DeletionColumns, 'deletedAt'>, retentionDays: number, now: Date): boolean {
  return row.deletedAt === null && row.expiresAt !== null && row.expiresAt.getTime() + retentionDays * DAY_MS <= now.getTime();
}

/**
 * The job row for one deletion. The payload names the deletion instant, so a job left behind by a deletion the owner
 * restored (or by an earlier deletion) finds a different `deleted_at` and finishes without touching anything.
 */
export function purgeJobFor(invitationId: number, deletedAt: Date, purgeAfter: Date) {
  return {
    kind: PURGE_JOB_KIND,
    payload: { invitationId, deletedAt: deletedAt.toISOString() },
    dedupeKey: `invitation:${invitationId}:${deletedAt.getTime()}`,
    runAt: purgeAfter,
    maxAttempts: PURGE_MAX_ATTEMPTS,
  };
}

/** The storage prefixes an invitation owns outright; the purge never deletes a key outside them (`owns_key` in Rust). */
export function ownPrefixes(invitationId: number): [string, string, string] {
  return [`${invitationId}/`, `variants/${invitationId}/`, `protected/${invitationId}/`];
}

/**
 * Every table the purge empties for the invitation, children first, as the Rust job deletes them. The dry run counts
 * exactly these and `tests/b031-retention.test.ts` checks that the job names each one.
 */
export const PURGED_TABLES = [
  'analytics_events',
  'guest_messages',
  'gift_logs',
  'guest_logs',
  'seating_tables',
  'guest_registrations',
  'guest_registration_links',
  'invitation_members',
  'wa_log',
  'agent_tasks',
  'intake_session',
  'media_variants',
  'media_assets',
  'invitation_versions',
  'guests',
] as const;

/**
 * Kept on purpose. `orders`, `payments` and `payment_events` are accounting records (their retention is an owner and
 * counsel decision); `conversations`, `messages` and `customer_session_summary` belong to the customer's account, not to
 * the invitation; `workspace_credit_entries` is a workspace's append-only ledger (G-052, D-067), whose balance must keep
 * equalling its entries. All keep pointing at the tombstone; the purge clears the tombstone's `client_label` (a client's
 * name) with its content.
 */
export const RETAINED_TABLES = ['orders', 'payments', 'payment_events', 'conversations', 'messages', 'customer_session_summary', 'workspace_credit_entries'] as const;
