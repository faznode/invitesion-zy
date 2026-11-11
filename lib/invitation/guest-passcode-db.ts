import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';

/**
 * G-047 (D-069): the only writer of `invitations.guest_passcode_hash` / `guest_passcode_set_at` (one writer per column
 * group, ADR-A2). Owner-scoped like the editor (`user_id`, live rows only); neither content writer touches these columns,
 * so a save or a restore (G-046) never changes the passcode. The hash is never returned: the owner sees on / off and when.
 */
export type PasscodeState = { enabled: boolean; setAt: Date | null };

const ownedLive = (invitationId: number, userId: number) => and(eq(invitations.id, invitationId), eq(invitations.userId, userId), isNull(invitations.deletedAt));

export async function loadPasscodeState(invitationId: number, userId: number): Promise<PasscodeState | null> {
  const [row] = await db
    .select({ hash: invitations.guestPasscodeHash, setAt: invitations.guestPasscodeSetAt })
    .from(invitations)
    .where(ownedLive(invitationId, userId))
    .limit(1);
  return row ? { enabled: Boolean(row.hash), setAt: row.hash ? row.setAt : null } : null;
}

/** Sets or changes the passcode (a change ends every earlier admission, `guest-passcode.ts`); null when not the owner's. */
export async function setGuestPasscode(invitationId: number, userId: number, hash: string): Promise<PasscodeState | null> {
  const [row] = await db
    .update(invitations)
    .set({ guestPasscodeHash: hash, guestPasscodeSetAt: new Date() })
    .where(ownedLive(invitationId, userId))
    .returning({ setAt: invitations.guestPasscodeSetAt });
  return row ? { enabled: true, setAt: row.setAt } : null;
}

/** Removes the passcode: the invitation is public to its link again. False when not the owner's. */
export async function clearGuestPasscode(invitationId: number, userId: number): Promise<boolean> {
  const rows = await db
    .update(invitations)
    .set({ guestPasscodeHash: null, guestPasscodeSetAt: null })
    .where(ownedLive(invitationId, userId))
    .returning({ id: invitations.id });
  return rows.length === 1;
}
