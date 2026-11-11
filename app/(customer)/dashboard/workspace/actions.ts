'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import {
  CLIENT_LABEL_MAX_CHARS,
  isWorkspaceRole,
  MAX_WORKSPACE_ROWS,
  normalizeLabel,
  normalizeWorkspaceText,
  staffLinkMessage,
  WORKSPACE_NAME_MAX_CHARS,
  type WorkspaceRole,
} from '@/lib/invitation/members';
import { getPublicOrigin } from '@/lib/invitation/public-url';
import { getLocale, t } from '@/lib/locale-server';
import { whatsAppShareLink } from '@/lib/invitation/whatsapp';
import {
  assignClientInvitation,
  createStaffLink,
  createWorkspace,
  leaveWorkspace,
  ownedWorkspace,
  revokeStaffRow,
  unassignClientInvitation,
} from '@/lib/workspace/workspace-db';

/**
 * G-052 (D-067): the workspace's actions. Each one reads the session again, refuses administrator accounts, checks
 * `FLAG_WORKSPACES` and passes the signed-in account's id to `lib/workspace/workspace-db.ts`, whose statements scope every
 * write to that account's own workspace, own invitations or own membership. Nothing in a form names an owner.
 */
const PAGE = '/dashboard/workspace';

async function signedInCustomer() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN' || !isFlagOn('WORKSPACES')) notFound();
  return user;
}

function done(query: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${query}`);
}

export async function createWorkspaceAction(formData: FormData) {
  const user = await signedInCustomer();
  const name = normalizeWorkspaceText(formData.get('name'), WORKSPACE_NAME_MAX_CHARS);
  if (!name) done('error=name');
  const outcome = await createWorkspace(user.id, name);
  done(outcome.kind === 'created' ? 'created=1' : 'error=exists');
}

export type StaffLinkState =
  | { status: 'idle' }
  | { status: 'created'; url: string; whatsapp: string; label: string; role: WorkspaceRole }
  | { status: 'error'; message: string };

/** A staff link for one role. The secret travels back in this answer only; the row stores its SHA-256. */
export async function createStaffLinkAction(_previous: StaffLinkState, formData: FormData): Promise<StaffLinkState> {
  const user = await signedInCustomer();
  const locale = await getLocale();
  const role = formData.get('role');
  if (!isWorkspaceRole(role)) return { status: 'error', message: t(locale, 'Pilih peran untuk tautan ini.', 'Choose a role for this link.') };
  const label = normalizeLabel(formData.get('label'));
  if (!label) {
    return { status: 'error', message: t(locale, 'Tulis untuk siapa tautan ini, paling banyak 60 karakter.', 'Write who this link is for, at most 60 characters.') };
  }
  const outcome = await createStaffLink(user.id, { role, label });
  if (outcome.kind === 'notfound') {
    return { status: 'error', message: t(locale, 'Ruang kerja tidak ditemukan atau sedang dinonaktifkan.', 'The workspace was not found or is disabled.') };
  }
  if (outcome.kind === 'full') {
    return {
      status: 'error',
      message: t(
        locale,
        `Ruang kerja sudah berisi ${MAX_WORKSPACE_ROWS} staf dan tautan aktif. Cabut yang tidak dipakai lebih dulu.`,
        `The workspace already holds ${MAX_WORKSPACE_ROWS} staff and active links. Revoke unused ones first.`,
      ),
    };
  }
  const workspace = await ownedWorkspace(user.id);
  const url = `${await getPublicOrigin()}/gabung/ruang/${outcome.token}`;
  revalidatePath(PAGE);
  return {
    status: 'created',
    url,
    label,
    role,
    whatsapp: whatsAppShareLink(staffLinkMessage({ label, role, workspaceName: workspace?.name ?? 'Anda', url })),
  };
}

export async function revokeStaffAction(formData: FormData) {
  const user = await signedInCustomer();
  const revoked = await revokeStaffRow(user.id, Number(formData.get('rowId')));
  done(revoked ? 'revoked=1' : 'error=notfound');
}

export async function assignClientAction(formData: FormData) {
  const user = await signedInCustomer();
  const clientLabel = normalizeWorkspaceText(formData.get('clientLabel'), CLIENT_LABEL_MAX_CHARS);
  if (!clientLabel) done('error=client');
  const assigned = await assignClientInvitation(user.id, Number(formData.get('invitationId')), clientLabel);
  done(assigned ? 'assigned=1' : 'error=notfound');
}

export async function unassignClientAction(formData: FormData) {
  const user = await signedInCustomer();
  const unassigned = await unassignClientInvitation(user.id, Number(formData.get('invitationId')));
  done(unassigned ? 'unassigned=1' : 'error=notfound');
}

export async function leaveWorkspaceAction(formData: FormData) {
  const user = await signedInCustomer();
  const left = await leaveWorkspace(user.id, Number(formData.get('workspaceId')));
  done(left ? 'left=1' : 'error=notfound');
}
