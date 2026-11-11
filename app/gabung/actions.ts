'use server';

import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { JOIN_TOKEN_PATTERN } from '@/lib/invitation/members';
import { acceptJoinLink } from '@/lib/invitation/members-db';
import { clearJoinToken, readJoinToken, SIGN_IN_TO_JOIN, writeJoinToken } from './join-session';

/** Signed out on a join link: keep its secret in the `/gabung` cookie and sign in, coming back to `/gabung/terima`. */
export async function beginJoin(formData: FormData) {
  if (!isFlagOn('TEAM_ACCESS')) notFound();
  const token = String(formData.get('token') ?? '');
  if (!JOIN_TOKEN_PATTERN.test(token)) redirect('/gabung/terima');
  await writeJoinToken(token);
  const user = await getUser();
  redirect(user ? '/gabung/terima' : SIGN_IN_TO_JOIN);
}

/**
 * G-044 (D-057): accepts the link posted from its page, or the one kept through sign-in. A POST, so opening or
 * reloading a link never accepts it. Joined (or already joined by this account) lands on the dashboard, which opens the
 * check-in desk by a full page load for its camera policy (D-056); a server action's redirect would not be one.
 */
export async function acceptJoin(formData: FormData) {
  if (!isFlagOn('TEAM_ACCESS')) notFound();
  const user = await getUser();
  if (!user) redirect(SIGN_IN_TO_JOIN);
  if (user.role === 'ADMIN') {
    await clearJoinToken();
    redirect('/gabung/terima?status=admin');
  }
  const posted = String(formData.get('token') ?? '');
  const token = JOIN_TOKEN_PATTERN.test(posted) ? posted : await readJoinToken();
  if (!token) redirect('/gabung/terima');
  const outcome = await acceptJoinLink(user.id, token);
  await clearJoinToken();
  if (outcome.kind === 'joined' || outcome.kind === 'already') redirect(`/dashboard?bergabung=${outcome.invitationId}`);
  redirect(`/gabung/terima?status=${outcome.kind}`);
}
