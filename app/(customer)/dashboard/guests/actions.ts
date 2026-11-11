'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { accessFor } from '@/lib/invitation/members-db';
import { addRosterGuest, rosterOperation, type RosterCaller } from '@/lib/invitation/roster';
import { rosterNotice } from '@/lib/invitation/roster-notices';

/**
 * Guests page URL that carries the explicit invitation context through
 * redirects, so acting on invitation B never bounces the customer back to
 * invitation A's list.
 */
function guestsPath(invitationId: number | null, params: string) {
  const valid = invitationId !== null && Number.isInteger(invitationId) && invitationId > 0;
  return valid ? `/dashboard/guests?invitation=${invitationId}&${params}` : `/dashboard/guests?${params}`;
}

async function caller(): Promise<RosterCaller> {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  return { userId: user.id, ownerToken: ownerSessionToken };
}

/**
 * G-044 (D-057): the flag-aware guard every entry that can serve a member asks before a roster write. The writers check
 * the grant but not `FLAG_TEAM_ACCESS`, so without it a member could still write here with the flag off.
 */
async function mayUseGuests(host: RosterCaller, invitationId: number): Promise<boolean> {
  return (await accessFor(host.userId, invitationId, 'guests')) !== null;
}

/** B-033: the global list's add goes through the roster writer (`BACKEND_ROSTER`), as the per-invitation list does. */
export async function addGuest(formData: FormData) {
  const host = await caller();
  const invitationId = Number(formData.get('invitationId'));
  if (!Number.isInteger(invitationId) || invitationId <= 0) redirect(guestsPath(null, 'error=invalid'));
  if (!(await mayUseGuests(host, invitationId))) redirect(guestsPath(null, rosterNotice({ kind: 'notfound' }) ?? 'error=notfound'));
  const row = { name: String(formData.get('name') ?? ''), phone: String(formData.get('phone') ?? ''), category: String(formData.get('category') ?? ''), guestCount: String(formData.get('guestCount') ?? '') };
  const outcome = await addRosterGuest(host, { invitationId, row, invitedEventIds: [] });
  if (outcome.kind === 'signin') redirect('/sign-in');
  revalidatePath('/dashboard/guests');
  redirect(guestsPath(invitationId, rosterNotice(outcome) ?? 'added=1'));
}

export async function markGuestSent(formData: FormData) {
  const host = await caller();
  const guestId = Number(formData.get('guestId'));
  const invitationId = Number(formData.get('invitationId'));
  const outcome = Number.isInteger(guestId) && Number.isInteger(invitationId) && (await mayUseGuests(host, invitationId))
    ? await rosterOperation(host, { invitationId, guestId, operation: 'sent' })
    : ({ kind: 'notfound' } as const);
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind !== 'saved') redirect(guestsPath(Number.isInteger(invitationId) ? invitationId : null, rosterNotice(outcome) ?? 'error=notfound'));
  revalidatePath('/dashboard/guests');
}
