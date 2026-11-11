'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { isMemberRole, joinLinkMessage, MAX_TEAM_ROWS, normalizeLabel, type MemberRole } from '@/lib/invitation/members';
import { accessFor, createJoinLink, revokeTeamRow } from '@/lib/invitation/members-db';
import { getPublicOrigin } from '@/lib/invitation/public-url';
import { whatsAppShareLink } from '@/lib/invitation/whatsapp';

export type CreateLinkState =
  | { status: 'idle' }
  | { status: 'created'; url: string; whatsapp: string; label: string; role: MemberRole }
  | { status: 'error'; message: string };

/** The signed-in owner of the invitation in the form (`manage`: the team is the owner's alone), or null. */
async function ownerOf(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('TEAM_ACCESS')) return null;
  const invitationId = Number(formData.get('invitationId'));
  const access = await accessFor(user.id, invitationId, 'manage');
  return access ? { user, invitationId, slug: access.invitation.slug } : null;
}

/**
 * G-044 (D-057): a join link for one role. The secret travels back to the owner in this answer and nowhere else; the
 * row stores its SHA-256, so the link cannot be shown again (the owner revokes it and makes another).
 */
export async function createTeamLink(_previous: CreateLinkState, formData: FormData): Promise<CreateLinkState> {
  const owner = await ownerOf(formData);
  if (!owner) return { status: 'error', message: 'Undangan tidak ditemukan, atau fitur tim belum aktif.' };
  const role = formData.get('role');
  if (!isMemberRole(role)) return { status: 'error', message: 'Pilih peran untuk tautan ini.' };
  const label = normalizeLabel(formData.get('label'));
  if (!label) return { status: 'error', message: 'Tulis untuk siapa tautan ini, paling banyak 60 karakter.' };
  const outcome = await createJoinLink(owner.user.id, owner.invitationId, { role, label });
  if (outcome.kind === 'notfound') return { status: 'error', message: 'Undangan tidak ditemukan.' };
  if (outcome.kind === 'full') {
    return { status: 'error', message: `Tim sudah berisi ${MAX_TEAM_ROWS} anggota dan tautan aktif. Cabut yang tidak dipakai lebih dulu.` };
  }
  const url = `${await getPublicOrigin()}/gabung/${outcome.token}`;
  revalidatePath(`/dashboard/invitations/${owner.invitationId}/team`);
  return { status: 'created', url, label, role, whatsapp: whatsAppShareLink(joinLinkMessage({ label, role, title: `/${owner.slug}`, url })) };
}

/** Revokes a member's grant or an unused link; the member is refused from their next request. */
export async function revokeTeamMember(formData: FormData) {
  const owner = await ownerOf(formData);
  if (!owner) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${owner.invitationId}/team`;
  const rowId = Number(formData.get('rowId'));
  const revoked = Number.isInteger(rowId) && rowId > 0 && (await revokeTeamRow(owner.user.id, owner.invitationId, rowId));
  revalidatePath(path);
  redirect(`${path}?${revoked ? 'revoked=1' : 'error=notfound'}`);
}
