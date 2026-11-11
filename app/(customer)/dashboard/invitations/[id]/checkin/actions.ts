'use server';

import { and, eq } from 'drizzle-orm';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guests } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { passManualAllowed } from '@/lib/invitation/guest-pass';
import { accessFor } from '@/lib/invitation/members-db';
import { rosterOperation } from '@/lib/invitation/roster';

export type ManualCheckInResult =
  | { ok: true; checkedInAt: string; already: boolean }
  | { ok: false; reason: 'signin' | 'off' | 'notfound' | 'manual-off' | 'unconfirmed' };

/** The guest's stored check-in time, once the caller's access to its invitation is known (a read; writes use the facade). */
async function storedCheckIn(invitationId: number, guestId: number) {
  const [row] = await db
    .select({ checkedInAt: guests.checkedInAt })
    .from(guests)
    .where(and(eq(guests.id, guestId), eq(guests.invitationId, invitationId)))
    .limit(1);
  return row ?? null;
}

/**
 * B-024: the scanner's manual fallback (a pass that will not scan, a guest without one). It is the guest list's own
 * check-in (`rosterOperation('checkin')`, one roster writer, first check-in only), refused where the host turned manual
 * check-in off or requires the QR. The owner, a co-host or an usher may use it (G-044, D-057: `checkin`); the writer
 * checks the same grant again. A guest already checked in (at another desk, or by a pass scanned meanwhile) is answered
 * with the stored time and `already`, so the usher sees it; otherwise the answer carries the time the writer stored.
 * Server actions already refuse cross-site posts.
 */
export async function manualCheckIn(invitationId: number, guestId: number): Promise<ManualCheckInResult> {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') return { ok: false, reason: 'signin' };
  if (!isFlagOn('GUEST_PASS')) return { ok: false, reason: 'off' };
  if (!Number.isInteger(invitationId) || !Number.isInteger(guestId)) return { ok: false, reason: 'notfound' };
  const access = await accessFor(user.id, invitationId, 'checkin');
  if (!access) return { ok: false, reason: 'notfound' };
  const guest = await storedCheckIn(invitationId, guestId);
  if (!guest) return { ok: false, reason: 'notfound' };
  if (!passManualAllowed(access.invitation.config)) return { ok: false, reason: 'manual-off' };
  if (guest.checkedInAt) return { ok: true, checkedInAt: guest.checkedInAt.toISOString(), already: true };
  const outcome = await rosterOperation({ userId: user.id, ownerToken: ownerSessionToken }, { invitationId, guestId, operation: 'checkin' });
  if (outcome.kind !== 'saved') return { ok: false, reason: outcome.kind };
  const stored = await storedCheckIn(invitationId, guestId);
  return { ok: true, checkedInAt: (stored?.checkedInAt ?? new Date()).toISOString(), already: false };
}
