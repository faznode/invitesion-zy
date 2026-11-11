'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { restoreDeletedInvitation, scheduleInvitationDeletion } from '@/lib/invitation/deletion-db';
import {
  NotPaidError,
  NotPublishableError,
  OwnershipError,
  publishInvitation,
  unpublishInvitation,
} from '@/lib/invitation/publish';

const LIST_PATH = '/dashboard/invitations';

function parseInvitationId(formData: FormData): number | null {
  const id = Number(formData.get('invitationId'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Takes an invitation live.
 *
 * Ownership is resolved from the session inside the domain service, never from
 * the submitted id alone — the form field says which invitation, the session
 * says whose. A mismatch surfaces as "not found" so the action cannot be used
 * to probe which invitation ids exist.
 */
export async function publish(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const id = parseInvitationId(formData);
  if (!id) redirect(`${LIST_PATH}?error=invalid`);

  try {
    await publishInvitation(id, user.id);
  } catch (error) {
    if (error instanceof NotPublishableError) {
      redirect(`${LIST_PATH}?error=incomplete&id=${id}&why=${encodeURIComponent(error.reasons.join(' '))}`);
    }
    // Publishing is what the customer buys, so an unpaid invitation is sent to
    // checkout rather than shown an error it cannot act on.
    if (error instanceof NotPaidError) redirect(`/dashboard/invitations/${id}/checkout`);
    if (error instanceof OwnershipError) redirect(`${LIST_PATH}?error=notfound`);
    throw error;
  }

  revalidatePath(LIST_PATH);
  revalidatePath('/dashboard');
  redirect(`${LIST_PATH}?published=${id}`);
}

/**
 * B-031 (D-063): the owner deletes an invitation. Ownership comes from the session (a co-host's grant never reaches
 * this), and the post must carry the confirmation the card asks for, so a stray or forged post without it changes
 * nothing. Unavailable (flag off or no window set) is refused before anything is read.
 */
export async function deleteInvitation(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const id = parseInvitationId(formData);
  if (!id) redirect(`${LIST_PATH}?error=invalid`);
  if (formData.get('confirm') !== 'yes') redirect(`${LIST_PATH}?error=unconfirmed`);

  const outcome = await scheduleInvitationDeletion(user.id, id);
  if (outcome.kind === 'unavailable') redirect(`${LIST_PATH}?error=deletion-off`);
  if (outcome.kind === 'notfound') redirect(`${LIST_PATH}?error=notfound`);

  revalidatePath(LIST_PATH);
  revalidatePath('/dashboard');
  redirect(`${LIST_PATH}?deleted=${id}`);
}

/** B-031: the owner restores a deleted invitation before its purge; it returns exactly as it was. */
export async function restoreInvitation(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const id = parseInvitationId(formData);
  if (!id) redirect(`${LIST_PATH}?error=invalid`);

  const outcome = await restoreDeletedInvitation(user.id, id);
  if (outcome.kind === 'purged') redirect(`${LIST_PATH}?error=purged`);
  if (outcome.kind === 'notfound') redirect(`${LIST_PATH}?error=notfound`);

  revalidatePath(LIST_PATH);
  revalidatePath('/dashboard');
  redirect(`${LIST_PATH}?restored=${id}`);
}

/** Returns an invitation to DRAFT without touching its paid active window. */
export async function unpublish(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const id = parseInvitationId(formData);
  if (!id) redirect(`${LIST_PATH}?error=invalid`);

  try {
    await unpublishInvitation(id, user.id);
  } catch (error) {
    if (error instanceof OwnershipError) redirect(`${LIST_PATH}?error=notfound`);
    throw error;
  }

  revalidatePath(LIST_PATH);
  revalidatePath('/dashboard');
  redirect(`${LIST_PATH}?unpublished=${id}`);
}
