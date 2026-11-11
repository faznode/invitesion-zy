'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { backendFor } from '@/lib/backend';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { analyticsEvents, guests } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { tickedInviteIds } from '@/lib/invitation/event-eligibility';
import { accessFor } from '@/lib/invitation/members-db';
import { decideHostRsvp, isHostRsvpStatus } from '@/lib/invitation/rsvp-decision';
import { writeHostRsvpThroughApi } from '@/lib/invitation/rsvp-writer';
import { addRosterGuest, rosterOperation, setRosterCategoryInvitation, setRosterInvitedEvents, type RosterCaller } from '@/lib/invitation/roster';
import { rosterNotice } from '@/lib/invitation/roster-notices';
import type { RosterOperation } from '@/lib/invitation/roster-outcomes';

/**
 * The invitation named by the form, for its owner or a co-host (G-044, D-057: `guests`), with its config read leniently
 * like every other reader. The writers check the same grant again inside their transactions.
 */
async function context(formData: FormData) {
  const user = await getUser(); if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const invitationId = Number(formData.get('invitationId')); if (!Number.isInteger(invitationId)) redirect('/dashboard/invitations');
  const access = await accessFor(user.id, invitationId, 'guests');
  if (!access) redirect('/dashboard/invitations');
  const caller: RosterCaller = { userId: user.id, ownerToken: ownerSessionToken };
  return { invitationId, caller, config: normalizeStoredConfig(access.invitation.config ?? {}).config, path: `/dashboard/invitations/${invitationId}/guests` };
}

/** Where a roster write ends: sign-in when the API knows no live customer for the session, otherwise a notice. */
function finish(outcome: { kind: string; reason?: string }, path: string, saved: string): never {
  if (outcome.kind === 'signin') redirect('/sign-in');
  revalidatePath(path);
  redirect(`${path}?${rosterNotice(outcome) ?? saved}`);
}

/** B-033: one guest through the roster writer (`BACKEND_ROSTER`); the rules are `roster-rules.ts` in both writers. */
export async function addScopedGuest(formData: FormData) {
  const { invitationId, caller, path } = await context(formData);
  const row = { name: String(formData.get('name') ?? ''), phone: String(formData.get('phone') ?? ''), category: String(formData.get('category') ?? ''), guestCount: String(formData.get('guestCount') ?? '') };
  // D-037: the invite-only events ticked in the form; the writer keeps only this invitation's current invite-only events.
  const outcome = await addRosterGuest(caller, { invitationId, row, invitedEventIds: tickedInviteIds(formData) });
  finish(outcome, path, 'added=1');
}

const ROSTER_OPERATIONS: readonly string[] = ['sent', 'checkin', 'undo-checkin'] satisfies RosterOperation[];

/**
 * Dashboard operations on one guest. `sent`, `checkin` and `undo-checkin` are roster writes (B-033, `BACKEND_ROSTER`).
 * RSVP operations (`CONFIRMED`, …, or `event:<eventId>:<STATUS>` for one event) go through `decideHostRsvp`
 * (`hostRsvpUpdate`, D-037): the status, the people attending and the per-event answers are written by one UPDATE, so
 * the dashboard never leaves them contradicting each other.
 */
export async function updateGuestOperation(formData: FormData) {
  const { invitationId, caller, config, path }=await context(formData); const guestId=Number(formData.get('guestId')); const operation=String(formData.get('operation'));
  if (ROSTER_OPERATIONS.includes(operation)) {
    const outcome = await rosterOperation(caller, { invitationId, guestId, operation: operation as RosterOperation });
    if (outcome.kind === 'signin') redirect('/sign-in');
    if (outcome.kind !== 'saved') redirect(`${path}?${rosterNotice(outcome)}`);
    revalidatePath(path);
    return;
  }
  const [owned]=await db.select().from(guests).where(and(eq(guests.id,guestId),eq(guests.invitationId,invitationId))).limit(1); if(!owned) redirect(`${path}?error=notfound`);
  const [scope, eventId, eventStatus] = operation.startsWith('event:') ? operation.split(':') : [undefined, undefined, operation];
  const status = String(eventStatus ?? '');
  if (scope !== undefined && !eventId) redirect(`${path}?error=invalid`);
  if (!isHostRsvpStatus(status)) redirect(`${path}?error=invalid`);
  // R-03: the same pure rule (`hostRsvpUpdate` behind `decideHostRsvp`) the Rust override endpoint applies; exactly
  // one writer per call (`BACKEND_RSVP`), never a fallback to the other.
  const flags = { perEvent: isFlagOn('RSVP_PER_EVENT'), inviteOnlyEvents: isFlagOn('INVITE_ONLY_EVENTS') };
  if (backendFor('RSVP') === 'rust') {
    const ownerToken = await ownerSessionToken();
    if (!ownerToken) redirect('/sign-in');
    const outcome = await writeHostRsvpThroughApi({ invitationId, guestId, status, eventId, flags, ownerToken });
    // The API refused the session's account (deleted, or an administrator): the same answer `context()` gives.
    if (outcome.kind === 'signin') redirect('/sign-in');
    if (outcome.kind !== 'saved') redirect(`${path}?error=${outcome.kind}`);
  } else {
    const update = decideHostRsvp({ config, guest: owned, status, eventId, flags });
    if (!update) redirect(`${path}?error=invalid`);
    await db.update(guests).set(update).where(and(eq(guests.id,guestId),eq(guests.invitationId,invitationId)));
    await db.insert(analyticsEvents).values({invitationId,guestId,eventType:'RSVP',meta:{status:update.rsvpStatus,source:'dashboard'}});
  }
  revalidatePath(path);
}

/** D-037: which invite-only events one guest is invited to, from the checkboxes of the guest's row (B-033 writer). */
export async function setGuestInvitedEvents(formData: FormData) {
  const { invitationId, caller, path } = await context(formData);
  const outcome = await setRosterInvitedEvents(caller, { invitationId, guestId: Number(formData.get('guestId')), ticked: tickedInviteIds(formData) });
  finish(outcome, path, 'invites=1');
}

/**
 * D-037: invite (or uninvite) every guest of one category to one invite-only event, in one UPDATE scoped to the owner's
 * invitation (B-033 writer). The event must be a current invite-only event; an empty category means guests without one.
 */
export async function setCategoryInvitation(formData: FormData) {
  const { invitationId, caller, path } = await context(formData);
  const mode = String(formData.get('mode') || '');
  if (mode !== 'add' && mode !== 'remove') redirect(`${path}?error=invalid`);
  const outcome = await setRosterCategoryInvitation(caller, { invitationId, eventId: String(formData.get('eventId') || ''), category: String(formData.get('category') ?? ''), mode });
  finish(outcome, path, outcome.kind === 'saved' ? `invites=${outcome.changed}` : 'invites=0');
}
