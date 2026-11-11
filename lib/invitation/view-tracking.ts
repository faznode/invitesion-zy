import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { analyticsEvents, guests } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';

/** A re-render caused by an RSVP redirect is not a new open. */
export const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

// Namespace of the transaction-scoped advisory lock: the ASCII bytes of "VIEW" as an int4.
const VIEW_LOCK_NAMESPACE = 0x56494557;

/** Lock key: the guest id, or the negated invitation id for an open without a personal link (ids are positive serials). */
export function viewLockKey(invitationId: number, guestId?: number | null): number {
  return guestId ? guestId : -invitationId;
}

/**
 * Records one open of an invitation and bumps the guest's open counter, at most once per dedupe window (B-017a).
 *
 * The check and the write used to be separate statements, so two near-simultaneous first opens of one link both saw
 * "no recent VIEW" and both inserted (s09 spike: duplicate VIEW rows for 8 of 300 guests). They now run in one
 * transaction serialised per guest (or per invitation for anonymous opens) by `pg_advisory_xact_lock`, which is
 * released at commit or rollback, so only opens of the same link wait for each other.
 *
 * Returns true when a VIEW row was written. Errors propagate; `trackInvitationView()` keeps tracking best-effort.
 */
export async function recordInvitationView(
  database: PostgresJsDatabase<typeof schema>,
  invitationId: number,
  guestId?: number | null,
  now: Date = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${VIEW_LOCK_NAMESPACE}::int4, ${viewLockKey(invitationId, guestId)}::int4)`);
    const since = new Date(now.getTime() - VIEW_DEDUPE_WINDOW_MS);
    const [recent] = await tx
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.invitationId, invitationId),
          eq(analyticsEvents.eventType, 'VIEW'),
          guestId ? eq(analyticsEvents.guestId, guestId) : isNull(analyticsEvents.guestId),
          gte(analyticsEvents.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return false;

    await tx.insert(analyticsEvents).values({ invitationId, guestId: guestId ?? null, eventType: 'VIEW', createdAt: now });
    if (guestId) {
      await tx
        .update(guests)
        .set({ openedAt: now, openedCount: sql`${guests.openedCount} + 1` })
        .where(eq(guests.id, guestId));
    }
    return true;
  });
}
