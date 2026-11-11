import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations, jobs } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { deletionState, purgeAfterFor, purgeJobFor, retentionConfig } from './retention';

/**
 * B-031 (D-063): the owner's deletion and restore, written by Next.js (ADR-A2 §8.3: owner writes stay at the Clerk
 * boundary). The purge after the window is the Rust job `invitation_purge` (`services/api/src/retention.rs`).
 */

type Env = Record<string, string | undefined>;

/**
 * The condition every guest surface and every writer adds to its invitation lookup: not deleted. A deleted invitation
 * answers exactly as a missing one (404 for guests, `notfound` for writers), during its window and after the purge.
 */
export const liveInvitation = isNull(invitations.deletedAt);

/** The window in days when the owner may delete, or null: the flag is off or the owner has not set the window. */
export function deletionWindowDays(env: Env = process.env): number | null {
  if (!isFlagOn('INVITATION_DELETION', env)) return null;
  return retentionConfig(env).windowDays;
}

export type DeleteOutcome =
  | { kind: 'scheduled'; purgeAfter: Date }
  | { kind: 'already'; purgeAfter: Date }
  | { kind: 'notfound' }
  | { kind: 'unavailable' };

/**
 * The owner deletes an invitation: guests and writers lose it at once, the purge job is queued for the end of the
 * window. The row lock serialises this against every writer that locks the row and against a concurrent delete, and the
 * job row is written in the same transaction, so a deletion never exists without its purge (or the reverse). Owner
 * only: a co-host's role never holds deletion. A repeated delete answers `already` with the original date.
 */
export async function scheduleInvitationDeletion(
  ownerId: number,
  invitationId: number,
  env: Env = process.env,
  now: Date = new Date(),
): Promise<DeleteOutcome> {
  const windowDays = deletionWindowDays(env);
  if (windowDays === null) return { kind: 'unavailable' };
  if (!Number.isInteger(invitationId) || invitationId <= 0) return { kind: 'notfound' };
  return db.transaction(async (tx): Promise<DeleteOutcome> => {
    const [row] = await tx
      .select({ id: invitations.id, deletedAt: invitations.deletedAt, purgeAfter: invitations.purgeAfter, purgedAt: invitations.purgedAt })
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.userId, ownerId)))
      .for('update');
    if (!row) return { kind: 'notfound' };
    const state = deletionState(row);
    if (state.kind === 'purged') return { kind: 'notfound' };
    if (state.kind === 'scheduled') return { kind: 'already', purgeAfter: state.purgeAfter };
    const purgeAfter = purgeAfterFor(now, windowDays);
    await tx.update(invitations).set({ deletedAt: now, purgeAfter }).where(eq(invitations.id, row.id));
    await tx
      .insert(jobs)
      .values(purgeJobFor(row.id, now, purgeAfter))
      .onConflictDoNothing({ target: [jobs.kind, jobs.dedupeKey] });
    return { kind: 'scheduled', purgeAfter };
  });
}

export type RestoreOutcome = { kind: 'restored' } | { kind: 'live' } | { kind: 'purged' } | { kind: 'notfound' };

/**
 * The owner undoes a deletion until the purge has run (the window, then however long the job takes). Available with the
 * flag off, so switching deletion off never strands an invitation its owner wants back. The purge job takes the same row
 * lock: either this lands first and the job finds a different `deleted_at` and finishes without touching anything, or
 * the purge lands first and this answers `purged`. The invitation returns exactly as it was (status, dates, content).
 */
export async function restoreDeletedInvitation(ownerId: number, invitationId: number): Promise<RestoreOutcome> {
  if (!Number.isInteger(invitationId) || invitationId <= 0) return { kind: 'notfound' };
  return db.transaction(async (tx): Promise<RestoreOutcome> => {
    const [row] = await tx
      .select({ id: invitations.id, deletedAt: invitations.deletedAt, purgeAfter: invitations.purgeAfter, purgedAt: invitations.purgedAt })
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.userId, ownerId)))
      .for('update');
    if (!row) return { kind: 'notfound' };
    const state = deletionState(row);
    if (state.kind !== 'scheduled') return { kind: state.kind };
    await tx.update(invitations).set({ deletedAt: null, purgeAfter: null }).where(eq(invitations.id, row.id));
    return { kind: 'restored' };
  });
}

/**
 * The public `/media` route's check for an upload under `<invitation>/` or `variants/<invitation>/`: true once the
 * invitation is deleted (in its window or purged). A missing row answers false, as the route behaved before B-031.
 */
export async function invitationMediaGone(invitationId: number): Promise<boolean> {
  const [row] = await db.select({ deletedAt: invitations.deletedAt }).from(invitations).where(eq(invitations.id, invitationId)).limit(1);
  return Boolean(row?.deletedAt);
}
