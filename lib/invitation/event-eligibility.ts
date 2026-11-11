import { EVENT_ID_PATTERN } from './event-ids';

/**
 * B-027 follow-up (D-037): invite-only events. A host marks an event `inviteOnly` (an akad for family, a session for
 * speakers) and invites guests to it one by one or by category. Every other event stays open to every guest, as before.
 *
 * Storage: the invitation config says which events are invite-only; the guest row says which of them the guest is invited
 * to (`guests.invited_event_ids`, an array of durable event ids). Guest ids never go into the config: the config is read
 * on every guest page and shared by every guest (B-014 caches it), while an invitation is per-guest data that goes away
 * with the guest. Ids of events that are deleted, or no longer invite-only, stay stored and do nothing; a restore that
 * brings the event back reattaches them, like per-event answers (D-036).
 *
 * Client-safe (no server imports): the editor and the dashboard forms read the same rules.
 */

type EventLike = { id?: string; inviteOnly?: boolean };

/** Who is looking: a guest through their own link, anyone without one, or the host previewing their own invitation. */
export type EventAudience =
  | { kind: 'guest'; invited: ReadonlySet<string> }
  | { kind: 'public' }
  | { kind: 'owner' };

/** The invite-only events a guest is invited to, as stored. Anything that is not a usable event id costs only itself. */
export function readInvitedEventIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === 'string' && EVENT_ID_PATTERN.test(id)));
}

export function guestAudience(guest: { invitedEventIds?: unknown } | null | undefined): EventAudience {
  return guest ? { kind: 'guest', invited: readInvitedEventIds(guest.invitedEventIds) } : { kind: 'public' };
}

export function isInviteOnly(event: EventLike): boolean {
  return event.inviteOnly === true;
}

/**
 * Whether this audience sees the event. With the flag off (`INVITE_ONLY_EVENTS`) every event is open, exactly as before
 * the switch existed, and the stored invitations are neither read nor written. The host's preview shows every event.
 * Without a guest link (the public page, the calendar file, link previews) only open events are shown, so an
 * invite-only event never reaches a page or file served without that guest's own link.
 */
export function eventVisibleTo(event: EventLike, audience: EventAudience, enabled: boolean): boolean {
  if (!enabled || !isInviteOnly(event) || audience.kind === 'owner') return true;
  return audience.kind === 'guest' && typeof event.id === 'string' && audience.invited.has(event.id);
}

export function visibleEvents<T extends EventLike>(events: readonly T[] | undefined, audience: EventAudience, enabled: boolean): T[] {
  return (events ?? []).filter((event) => eventVisibleTo(event, audience, enabled));
}

/** The listed events that are invite-only (with an id), in the invitation's order. */
export function inviteOnlyEvents<T extends EventLike>(events: readonly T[] | undefined): Array<T & { id: string }> {
  return (events ?? []).filter((event): event is T & { id: string } => isInviteOnly(event) && typeof event.id === 'string');
}

/** Form field for one invite-only event in the host's guest forms. */
export const inviteField = (eventId: string) => `invite:${eventId}`;

/**
 * What a host's guest form stores: the invite-only events ticked now, plus every stored id that is not a currently listed
 * invite-only event (a deleted event, or one switched back to open), which the form could not show and must not erase.
 * Ids from the form that are not current invite-only events of this invitation are ignored.
 */
export function invitedIdsFromForm(
  form: { get(name: string): FormDataEntryValue | null },
  events: readonly EventLike[] | undefined,
  stored: unknown,
): string[] {
  const ticked = inviteOnlyEvents(events).map((event) => event.id).filter((id) => form.get(inviteField(id)) !== null);
  return invitedIdsFromTicked(ticked, events, stored);
}

/**
 * The same rule from a list of ticked ids (B-033: what the roster writers receive): stored ids that are not current
 * invite-only events are kept, then the current invite-only events among `ticked`, in the invitation's order.
 */
export function invitedIdsFromTicked(ticked: readonly string[], events: readonly EventLike[] | undefined, stored: unknown): string[] {
  const current = inviteOnlyEvents(events).map((event) => event.id);
  const currentSet = new Set(current);
  const tickedSet = new Set(ticked);
  const kept = [...readInvitedEventIds(stored)].filter((id) => !currentSet.has(id));
  return [...kept, ...current.filter((id) => tickedSet.has(id))];
}

/** The invite-only event ids a guest form ticked (`invite:<id>` fields), unfiltered: the writer keeps only current ones. */
export function tickedInviteIds(form: { keys(): IterableIterator<string> }): string[] {
  const prefix = inviteField('');
  return [...new Set([...form.keys()].filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length)))];
}

/** Guests invited to each invite-only event, for the host's overview. Open events are not listed. */
export function inviteeCounts(
  events: readonly EventLike[] | undefined,
  rows: readonly { invitedEventIds?: unknown }[],
): Array<{ id: string; invited: number }> {
  const invited = rows.map((row) => readInvitedEventIds(row.invitedEventIds));
  return inviteOnlyEvents(events).map((event) => ({ id: event.id, invited: invited.filter((ids) => ids.has(event.id)).length }));
}
