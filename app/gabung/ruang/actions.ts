'use server';

import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { JOIN_TOKEN_PATTERN } from '@/lib/invitation/members';
import { acceptStaffLink } from '@/lib/workspace/workspace-db';
import { clearStaffJoinToken, readStaffJoinToken, SIGN_IN_TO_JOIN_WORKSPACE, writeStaffJoinToken } from './session';

/** Signed out on a staff link: keep its secret in the `/gabung/ruang` cookie and sign in, coming back to `terima`. */
export async function beginStaffJoin(formData: FormData) {
  if (!isFlagOn('WORKSPACES')) notFound();
  const token = String(formData.get('token') ?? '');
  if (!JOIN_TOKEN_PATTERN.test(token)) redirect('/gabung/ruang/terima');
  await writeStaffJoinToken(token);
  const user = await getUser();
  redirect(user ? '/gabung/ruang/terima' : SIGN_IN_TO_JOIN_WORKSPACE);
}

/**
 * G-052 (D-067): accepts the staff link posted from its page, or the one kept through sign-in. A POST, so opening or
 * reloading a link never accepts it. Joined (or already joined by this account) lands on the workspace page.
 */
export async function acceptStaffJoin(formData: FormData) {
  if (!isFlagOn('WORKSPACES')) notFound();
  const user = await getUser();
  if (!user) redirect(SIGN_IN_TO_JOIN_WORKSPACE);
  if (user.role === 'ADMIN') {
    await clearStaffJoinToken();
    redirect('/gabung/ruang/terima?status=admin');
  }
  const posted = String(formData.get('token') ?? '');
  const token = JOIN_TOKEN_PATTERN.test(posted) ? posted : await readStaffJoinToken();
  if (!token) redirect('/gabung/ruang/terima');
  const outcome = await acceptStaffLink(user.id, token);
  await clearStaffJoinToken();
  if (outcome.kind === 'joined' || outcome.kind === 'already') redirect(`/dashboard/workspace?joined=${outcome.workspaceId}`);
  redirect(`/gabung/ruang/terima?status=${outcome.kind}`);
}
