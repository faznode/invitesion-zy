'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { liveInvitation } from '@/lib/invitation/deletion-db';
import { removeGuestPhoto, reviewGuestPhoto } from '@/lib/invitation/guest-photos-db';
import { removeGuestPhotoFile } from '@/lib/invitation/post-event-server';

/**
 * I-21 (D-070): the host reviews guest photos. The signed-in owner of a live invitation only (administrators sign in
 * as customers; co-hosts have no grant here, as `/media` serves the protected prefix to the owner alone), with the flag
 * on, and the photo must be one of this invitation's guest photos. A refusal writes nothing.
 */
async function hostContext(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = Number(formData.get('invitationId'));
  if (!isFlagOn('POST_EVENT_MEMORY') || !Number.isInteger(invitationId) || invitationId <= 0) redirect('/dashboard/invitations');
  const [owned] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, user.id), liveInvitation))
    .limit(1);
  if (!owned) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${invitationId}/kenangan`;
  const photoId = Number(formData.get('photoId'));
  if (!Number.isInteger(photoId) || photoId <= 0) redirect(`${path}?error=notfound`);
  return { invitationId, photoId, path };
}

export async function reviewGuestPhotoAsHost(formData: FormData) {
  const { invitationId, photoId, path } = await hostContext(formData);
  const decision = formData.get('decision');
  if (decision !== 'visible' && decision !== 'hidden') redirect(`${path}?error=notfound`);
  if (!(await reviewGuestPhoto(invitationId, photoId, decision))) redirect(`${path}?error=notfound`);
  revalidatePath(path);
  redirect(`${path}?done=${decision}`);
}

export async function deleteGuestPhotoAsHost(formData: FormData) {
  const { invitationId, photoId, path } = await hostContext(formData);
  const url = await removeGuestPhoto(invitationId, photoId);
  if (!url) redirect(`${path}?error=notfound`);
  await removeGuestPhotoFile(url);
  revalidatePath(path);
  redirect(`${path}?done=deleted`);
}
