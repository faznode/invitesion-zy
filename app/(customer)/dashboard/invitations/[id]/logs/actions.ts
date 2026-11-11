'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import {
  GIFT_NOTE_MAX,
  GIVER_MAX,
  SEAT_MAX,
  TABLE_NAME_MAX,
  isGiftKind,
  optionalText,
  parseAmount,
  parseCapacity,
  parseFamilySide,
  parseId,
  parseRequestKey,
  planTables,
  requiredText,
} from '@/lib/invitation/host-logs';
import { addTable, assignSeat, deleteGift, deleteTable, importTables, recordGift, setSouvenir, updateGift, updateTable } from '@/lib/invitation/host-logs-db';
import { accessFor } from '@/lib/invitation/members-db';

/**
 * G-045 (D-058): the owner's writes to the day-of logs. Owner only (`manage`: no member role holds it), behind
 * `FLAG_HOST_LOGS`; an administrator is sent to sign-in and anyone else, or the flag off, lands on the invitations list
 * with nothing written. The writer checks ownership and every id against the invitation again in its transaction.
 */
async function ownerOf(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = parseId(formData.get('invitationId'));
  const access = isFlagOn('HOST_LOGS') && invitationId !== null ? await accessFor(user.id, invitationId, 'manage') : null;
  if (!access || invitationId === null) redirect('/dashboard/invitations');
  return { ownerId: user.id, invitationId, path: `/dashboard/invitations/${invitationId}/logs`, config: access.invitation.config };
}

function back(path: string, query: string, anchor: string): never {
  revalidatePath(path);
  redirect(`${path}?${query}#${anchor}`);
}

export async function addTableAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const name = requiredText(formData.get('name'), TABLE_NAME_MAX);
  const capacity = parseCapacity(formData.get('capacity'));
  if (!name.ok || !capacity.ok) back(path, 'error=table-invalid', 'meja');
  const outcome = await addTable(ownerId, invitationId, { name: name.value, capacity: capacity.value });
  back(path, outcome.kind === 'saved' ? 'notice=table-added' : `error=table-${outcome.kind}`, 'meja');
}

/** The tables planned in the manage centre (`config.seatingPlan`), read from the stored invitation, never the form. */
export async function importPlanTablesAction(formData: FormData) {
  const { ownerId, invitationId, path, config } = await ownerOf(formData);
  const outcome = await importTables(ownerId, invitationId, planTables(config));
  back(path, outcome.kind === 'imported' ? `notice=tables-imported&added=${outcome.added}` : `error=table-${outcome.kind}`, 'meja');
}

export async function updateTableAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const tableId = parseId(formData.get('tableId'));
  const name = requiredText(formData.get('name'), TABLE_NAME_MAX);
  const capacity = parseCapacity(formData.get('capacity'));
  if (tableId === null || !name.ok || !capacity.ok) back(path, 'error=table-invalid', 'meja');
  const outcome = await updateTable(ownerId, invitationId, tableId, { name: name.value, capacity: capacity.value });
  back(path, outcome.kind === 'saved' ? 'notice=table-saved' : `error=table-${outcome.kind}`, 'meja');
}

export async function deleteTableAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const tableId = parseId(formData.get('tableId'));
  const outcome = tableId === null ? 'notfound' : await deleteTable(ownerId, invitationId, tableId);
  back(path, outcome === 'deleted' ? 'notice=table-deleted' : 'error=table-notfound', 'meja');
}

export async function assignSeatAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const guestId = parseId(formData.get('guestId'));
  const rawTable = formData.get('tableId');
  const tableId = rawTable === '' || rawTable === null ? null : parseId(rawTable);
  const seat = optionalText(formData.get('seat'), SEAT_MAX);
  if (guestId === null || (rawTable !== '' && rawTable !== null && tableId === null) || !seat.ok) back(path, 'error=seat-invalid', 'tamu');
  const outcome = await assignSeat(ownerId, invitationId, guestId, { tableId, seat: seat.value });
  back(path, outcome === 'saved' ? `notice=seat-saved&guest=${guestId}` : 'error=guest-notfound', 'tamu');
}

export async function souvenirAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const guestId = parseId(formData.get('guestId'));
  const given = formData.get('given') === '1';
  const outcome = guestId === null ? { kind: 'notfound' as const } : await setSouvenir(ownerId, invitationId, guestId, given);
  if (outcome.kind === 'notfound') back(path, 'error=guest-notfound', 'tamu');
  back(path, `notice=${outcome.kind === 'given' ? (outcome.first ? 'souvenir-given' : 'souvenir-already') : 'souvenir-cleared'}&guest=${guestId}`, 'tamu');
}

export async function recordGiftAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const requestKey = parseRequestKey(formData.get('requestKey'));
  const rawGuest = formData.get('guestId');
  const guestId = rawGuest === '' || rawGuest === null ? null : parseId(rawGuest);
  const giverName = optionalText(formData.get('giverName'), GIVER_MAX);
  const kind = formData.get('kind');
  const amount = parseAmount(formData.get('amount'));
  const note = optionalText(formData.get('note'), GIFT_NOTE_MAX);
  const side = parseFamilySide(formData.get('side'));
  if (!requestKey.ok || (rawGuest !== '' && rawGuest !== null && guestId === null) || !giverName.ok || !isGiftKind(kind) || !amount.ok || !note.ok || !side.ok) {
    back(path, 'error=gift-invalid', 'kado');
  }
  const outcome = await recordGift(ownerId, invitationId, {
    requestKey: requestKey.value,
    guestId,
    giverName: giverName.value,
    kind,
    amount: amount.value,
    note: note.value,
    side: side.value,
  });
  back(path, outcome.kind === 'recorded' || outcome.kind === 'replayed' ? `notice=gift-${outcome.kind}` : `error=gift-${outcome.kind}`, 'kado');
}

export async function updateGiftAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const giftId = parseId(formData.get('giftId'));
  const giverName = requiredText(formData.get('giverName'), GIVER_MAX);
  const kind = formData.get('kind');
  const amount = parseAmount(formData.get('amount'));
  const note = optionalText(formData.get('note'), GIFT_NOTE_MAX);
  // I-04: a form without the field (an invitation that is not a wedding) keeps the stored side; an empty choice clears it.
  const rawSide = formData.get('side');
  const side = rawSide === null ? { ok: true as const, value: undefined } : parseFamilySide(rawSide);
  if (giftId === null || !giverName.ok || !isGiftKind(kind) || !amount.ok || !note.ok || !side.ok) back(path, 'error=gift-invalid', 'kado');
  const outcome = await updateGift(ownerId, invitationId, giftId, { giverName: giverName.value, kind, amount: amount.value, note: note.value, side: side.value });
  back(path, outcome === 'saved' ? 'notice=gift-saved' : `error=gift-${outcome}`, 'kado');
}

export async function deleteGiftAction(formData: FormData) {
  const { ownerId, invitationId, path } = await ownerOf(formData);
  const giftId = parseId(formData.get('giftId'));
  const outcome = giftId === null ? 'notfound' : await deleteGift(ownerId, invitationId, giftId);
  back(path, outcome === 'deleted' ? 'notice=gift-deleted' : 'error=gift-notfound', 'kado');
}
