'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { backendFor } from '@/lib/backend';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guestMessages } from '@/lib/db/schema';
import { accessFor } from '@/lib/invitation/members-db';
import { decideHostReply, isWishModeration, moderationUpdate } from '@/lib/invitation/wish-decision';
import { moderateWishThroughApi, replyToWishThroughApi, type HostWishOutcome } from '@/lib/invitation/wish-writer';

/**
 * R-04 (B-028, D-044): the host's moderation and replies. The invitation must be the signed-in customer's or one they
 * co-host (G-044, D-057: `wishes`; administrators sign in), and the wish must belong to it. Exactly one writer per call
 * (`BACKEND_WISHES`, default `next`), never a fallback to the other; the Rust writer checks the same grant again.
 */
async function context(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = Number(formData.get('invitationId'));
  if (!Number.isInteger(invitationId) || invitationId <= 0) redirect('/dashboard/invitations');
  if (!(await accessFor(user.id, invitationId, 'wishes'))) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${invitationId}/wishes`;
  const wishId = Number(formData.get('wishId'));
  if (!Number.isInteger(wishId) || wishId <= 0) redirect(`${path}?error=notfound`);
  const filter = String(formData.get('filter') ?? '');
  const back = /^(all|pending|visible|hidden)$/.test(filter) ? `${path}?filter=${filter}&` : `${path}?`;
  return { invitationId, wishId, path, back, ownedWish: and(eq(guestMessages.id, wishId), eq(guestMessages.invitationId, invitationId)) };
}

/** The Rust writer's outcome as the dashboard's answer: sign-in for a refused session, a notice otherwise. */
function finish(outcome: HostWishOutcome, path: string, back: string, done: string): never {
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind !== 'saved') redirect(`${back}error=${outcome.kind}`);
  revalidatePath(path);
  redirect(`${back}done=${done}`);
}

export async function moderateWish(formData: FormData) {
  const { invitationId, wishId, path, back, ownedWish } = await context(formData);
  const action = formData.get('action');
  if (!isWishModeration(action)) redirect(`${back}error=invalid`);
  if (backendFor('WISHES') === 'rust') {
    const ownerToken = await ownerSessionToken();
    if (!ownerToken) redirect('/sign-in');
    finish(await moderateWishThroughApi({ invitationId, wishId, action, ownerToken }), path, back, action);
  }
  const changed =
    action === 'delete'
      ? await db.delete(guestMessages).where(ownedWish).returning({ id: guestMessages.id })
      : await db.update(guestMessages).set(moderationUpdate(action, new Date())).where(ownedWish).returning({ id: guestMessages.id });
  if (!changed.length) redirect(`${back}error=notfound`);
  revalidatePath(path);
  redirect(`${back}done=${action}`);
}

export async function replyToWish(formData: FormData) {
  const { invitationId, wishId, path, back, ownedWish } = await context(formData);
  const reply = String(formData.get('reply') ?? '');
  // The same pure rule both writers apply; here it also names the notice (a blank reply clears the reply).
  const decision = decideHostReply(reply);
  if (decision.kind === 'invalid') redirect(`${back}error=invalid`);
  const done = decision.hostReply ? 'reply' : 'unreply';
  if (backendFor('WISHES') === 'rust') {
    const ownerToken = await ownerSessionToken();
    if (!ownerToken) redirect('/sign-in');
    finish(await replyToWishThroughApi({ invitationId, wishId, reply, ownerToken }), path, back, done);
  }
  const changed = await db
    .update(guestMessages)
    .set({ hostReply: decision.hostReply, repliedAt: decision.hostReply ? new Date() : null })
    .where(ownedWish)
    .returning({ id: guestMessages.id });
  if (!changed.length) redirect(`${back}error=notfound`);
  revalidatePath(path);
  redirect(`${back}done=${done}`);
}
