'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { accessFor } from '@/lib/invitation/members-db';
import { decideRosterRegistration, setRegistrationLink, type RosterCaller } from '@/lib/invitation/roster';
import { rosterNotice } from '@/lib/invitation/roster-notices';

/** B-033: the host's self-registration link and decisions, through the roster writer (`BACKEND_ROSTER`). */

async function host(formData: FormData): Promise<{ caller: RosterCaller; invitationId: number; path: string }> {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = Number(formData.get('invitationId'));
  if (!Number.isInteger(invitationId) || invitationId <= 0) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${invitationId}/guests`;
  if (!isFlagOn('SELF_REGISTRATION')) redirect(`${path}?error=invalid`);
  // G-044 (D-057): the owner or a co-host (`guests`); the writer checks the same grant again.
  if (!(await accessFor(user.id, invitationId, 'guests'))) redirect('/dashboard/invitations');
  return { caller: { userId: user.id, ownerToken: ownerSessionToken }, invitationId, path };
}

export async function registrationLinkAction(formData: FormData) {
  const { caller, invitationId, path } = await host(formData);
  const action = String(formData.get('action'));
  if (action !== 'open' && action !== 'rotate' && action !== 'close') redirect(`${path}?error=invalid`);
  const outcome = await setRegistrationLink(caller, { invitationId, action });
  if (outcome.kind === 'signin') redirect('/sign-in');
  revalidatePath(path);
  redirect(`${path}?${rosterNotice(outcome) ?? `registration=${action}`}#pendaftaran`);
}

export async function registrationDecisionAction(formData: FormData) {
  const { caller, invitationId, path } = await host(formData);
  const decision = String(formData.get('decision'));
  const registrationId = Number(formData.get('registrationId'));
  if ((decision !== 'approve' && decision !== 'reject') || !Number.isInteger(registrationId) || registrationId <= 0) redirect(`${path}?error=invalid`);
  const outcome = await decideRosterRegistration(caller, { invitationId, registrationId, decision });
  if (outcome.kind === 'signin') redirect('/sign-in');
  revalidatePath(path);
  redirect(`${path}?${rosterNotice(outcome) ?? `${outcome.kind}=1`}#pendaftaran`);
}
