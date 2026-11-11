'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { parseGuestImport } from '@/lib/invitation/guest-import-parse';
import { accessFor } from '@/lib/invitation/members-db';
import { importRosterGuests, undoRosterImport, type RosterCaller } from '@/lib/invitation/roster';
import { rosterNotice } from '@/lib/invitation/roster-notices';
import type { ImportPreview } from '@/lib/invitation/roster-outcomes';

/**
 * B-033: the host's import. The preview and the import go through the live roster writer (`BACKEND_ROSTER`): the
 * preview is the same decision as a dry run, so what the host sees is what that writer will do; the import re-decides
 * under the roster lock (the list may have changed since the preview) and writes every accepted row as one batch.
 */

/** The owner or a co-host of this invitation (G-044, D-057: `guests`), else null; the writer checks the grant again. */
async function host(invitationId: number): Promise<RosterCaller | null> {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!(await accessFor(user.id, invitationId, 'guests'))) return null;
  return { userId: user.id, ownerToken: ownerSessionToken };
}

const validId = (id: number) => Number.isInteger(id) && id > 0;

export async function previewGuestImport(invitationId: number, text: string): Promise<ImportPreview> {
  if (!isFlagOn('GUEST_IMPORT') || !validId(invitationId)) return { ok: false, error: 'notfound' };
  const caller = await host(invitationId);
  if (!caller) return { ok: false, error: 'notfound' };
  const parsed = parseGuestImport(String(text ?? ''));
  if (!parsed.ok) return { ok: false, error: parsed.error, rowCount: parsed.rowCount };
  const outcome = await importRosterGuests(caller, { invitationId, rows: parsed.rows, dryRun: true });
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind !== 'planned') return { ok: false, error: outcome.kind === 'notfound' ? 'notfound' : 'unconfirmed' };
  return { ok: true, rows: parsed.rows, delimiter: parsed.delimiter, header: parsed.header, summary: outcome.summary };
}

export async function commitGuestImport(formData: FormData) {
  const invitationId = Number(formData.get('invitationId'));
  if (!isFlagOn('GUEST_IMPORT') || !validId(invitationId)) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${invitationId}/guests`;
  const caller = await host(invitationId);
  if (!caller) redirect('/dashboard/invitations');
  const parsed = parseGuestImport(String(formData.get('text') ?? ''));
  if (!parsed.ok) redirect(`${path}/import?error=${parsed.error}`);
  const outcome = await importRosterGuests(caller, { invitationId, rows: parsed.rows, dryRun: false });
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind === 'refused') redirect(`${path}/import?error=${outcome.summary.refusal}`);
  if (outcome.kind !== 'imported') redirect(`${path}/import?${rosterNotice(outcome)}`);
  revalidatePath(path);
  const skipped = outcome.summary.invalid + outcome.summary.duplicate;
  redirect(`${path}?imported=${outcome.imported}&skipped=${skipped}&batch=${outcome.batchId}`);
}

/** Undo one import: untouched guests are deleted; guests with any activity are kept and counted. */
export async function undoGuestImport(formData: FormData) {
  const invitationId = Number(formData.get('invitationId'));
  if (!validId(invitationId)) redirect('/dashboard/invitations');
  const path = `/dashboard/invitations/${invitationId}/guests`;
  const caller = await host(invitationId);
  if (!caller) redirect('/dashboard/invitations');
  const outcome = await undoRosterImport(caller, { invitationId, batchId: String(formData.get('batchId') ?? '') });
  if (outcome.kind === 'signin') redirect('/sign-in');
  revalidatePath(path);
  if (outcome.kind === 'undone') redirect(`${path}?undone=${outcome.deleted}&kept=${outcome.kept}`);
  redirect(`${path}?error=${outcome.kind === 'notfound' ? 'import' : outcome.kind}`);
}
