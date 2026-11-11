'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { leaveTeam } from '@/lib/invitation/members-db';

/** G-044 (D-057): a member leaves an invitation's team; their own grant only, whatever the flag. */
export async function leaveTeamAction(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = Number(formData.get('invitationId'));
  const left = Number.isInteger(invitationId) && invitationId > 0 && (await leaveTeam(user.id, invitationId));
  revalidatePath('/dashboard');
  redirect(left ? '/dashboard?keluar=1' : '/dashboard');
}
