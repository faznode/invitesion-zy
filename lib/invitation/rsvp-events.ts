import { z } from 'zod';
import type { DetailConfig } from './detail-config';
import { eventVisibleTo, guestAudience } from './event-eligibility';
import { EVENT_ID_PATTERN, eventsWithIds } from './event-ids';
import { isRsvpStatus, rsvpAttendance, RSVP_STATUSES, type RsvpStatus } from './rsvp-rules';

/**
 * B-027 slice 2c (D-036): an answer per event. One rule set for the form, the action, the export and the dashboard, so
 * the page never asks for an answer the action would refuse and the host never sees one the action would not store.
 *
 * Storage: `guests.rsvp_event_answers`, `{ [eventId]: { status, attending } }`, written by the same UPDATE as the overall
 * RSVP (one statement, so status, headcount and per-event answers never disagree after a write) and keyed by the durable
 * event id, never a position.
 */

export type EventAnswer = { status: RsvpStatus; attending: number | null };
export type EventAnswers = Record<string, EventAnswer>;
type ConfigEvent = NonNullable<DetailConfig['events']>[number];
export type AskedEvent = ConfigEvent & { id: string };

/** Form fields for one event's answer; the prefixes keep event ids clear of the form's own fields and of question fields. */
export const eventStatusField = (id: string) => `ev:${id}`;
export const eventCountField = (id: string) => `evn:${id}`;

/**
 * The events a guest answers one by one: the host switched per-event RSVP on and the invitation lists at least two events.
 * With one event the overall answer already is the answer for it.
 */
export function perEventRsvpEvents(input: { perEvent?: boolean; events?: readonly ConfigEvent[] }, flagOn: boolean): AskedEvent[] {
  if (!flagOn || input.perEvent !== true) return [];
  const events = eventsWithIds(input.events);
  return events.length >= 2 ? events : [];
}

const entrySchema = z
  .object({ status: z.enum(RSVP_STATUSES), attending: z.number().int().min(0).max(100_000).nullable() })
  .strict();

/** Per-event answers as stored. Each entry is read on its own, so a malformed one (a hand edit) costs only itself. */
export function readEventAnswers(raw: unknown): EventAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const answers: EventAnswers = {};
  for (const [id, value] of Object.entries(raw)) {
    const parsed = entrySchema.safeParse(value);
    if (EVENT_ID_PATTERN.test(id) && parsed.success) answers[id] = parsed.data;
  }
  return answers;
}

export type EventAnswersResult =
  | { ok: true; answers: EventAnswers; status: RsvpStatus; attendingCount: number | null }
  | { ok: false; eventId: string };

/**
 * The overall RSVP the per-event answers amount to: "hadir" if any event is "hadir", else "mungkin" if any is "mungkin",
 * else "tidak hadir". People attending overall = the largest per-event "hadir" count: the fewest distinct people the
 * answers imply (who attends which event is not recorded per person). "Mungkin" never adds people.
 */
export function overallFromEvents(answers: readonly EventAnswer[]): { status: RsvpStatus; attendingCount: number | null } {
  const confirmed = answers.filter((answer) => answer.status === 'CONFIRMED');
  if (confirmed.length) return { status: 'CONFIRMED', attendingCount: Math.max(...confirmed.map((answer) => answer.attending ?? 1)) };
  if (answers.some((answer) => answer.status === 'MAYBE')) return { status: 'MAYBE', attendingCount: null };
  return { status: 'DECLINED', attendingCount: 0 };
}

/**
 * One answer for every event the form asked about, by the single RSVP's rules: "hadir" stores the requested people clamped
 * to 1…allowance, "mungkin" (only while its flag is on) stores no headcount, a decline stores 0. Every listed event must
 * be answered: a form rendered before the host added an event is refused naming that event, never stored half answered.
 * Fields for events no longer listed (deleted after the page was rendered) are ignored, and so are fields naming another
 * invitation's events: only this config's ids are read.
 */
export function parseEventAnswers(
  form: { get(name: string): FormDataEntryValue | null },
  events: readonly AskedEvent[],
  allowance: number,
  options: { maybe: boolean },
): EventAnswersResult {
  const answers: EventAnswers = {};
  for (const event of events) {
    const raw = form.get(eventStatusField(event.id));
    const status = typeof raw === 'string' ? raw : '';
    if (!isRsvpStatus(status, { maybe: options.maybe })) return { ok: false, eventId: event.id };
    answers[event.id] = { status, attending: rsvpAttendance(status, Number(form.get(eventCountField(event.id)) || 1), allowance) };
  }
  return { ok: true, answers, ...overallFromEvents(Object.values(answers)) };
}

/**
 * What a per-event submission stores: the new answer for every listed event, plus what the guest said earlier about events
 * no longer listed (deleting an event never erases answers; a restore that brings its id back reattaches them).
 */
export function mergeEventAnswers(stored: EventAnswers, fresh: EventAnswers): EventAnswers {
  return { ...stored, ...fresh };
}

/**
 * D-037: what a single answer does to the per-event answers. `listed` is the invitation's per-event list
 * (`perEventRsvpEvents`), `asked` the part of it this guest is invited to (fewer than two, or the guest would answer each).
 * Per-event RSVP not active for the invitation: as D-036, the single answer replaces earlier per-event answers (null)
 * while the flag is on; the flag off leaves the column alone (undefined). Active, and the guest is invited to exactly one
 * listed event: the single answer is that event's answer, merged with what the guest said earlier about other events, so
 * the host's per-event counts include it. Active and invited to none: there is no event to record it for (undefined).
 */
export function singleAnswerEventAnswers(input: {
  flagOn: boolean;
  listed: readonly AskedEvent[];
  asked: readonly AskedEvent[];
  stored: EventAnswers;
  answer: EventAnswer;
}): EventAnswers | null | undefined {
  if (!input.flagOn) return undefined;
  if (input.listed.length === 0) return null;
  if (input.asked.length === 1) return mergeEventAnswers(input.stored, { [input.asked[0].id]: input.answer });
  return undefined;
}

export type HostRsvpStatus = RsvpStatus | 'PENDING';
export type HostRsvpUpdate = { rsvpStatus: HostRsvpStatus; attendingCount: number | null; rsvpEventAnswers?: EventAnswers | null };

/**
 * The overall answer a host's per-event answers amount to. Unlike a guest's submission (which answers every event), the
 * host may have set some events only: "hadir" if any is "hadir", else "mungkin" if any is "mungkin", else "tidak hadir"
 * once every asked event is declined, else still "belum menjawab". People: the largest per-event "hadir" count, or
 * unknown (null) when any "hadir" has no count, never guessed from the allowance (E-033).
 */
export function overallFromAskedAnswers(asked: readonly AskedEvent[], answers: EventAnswers): { rsvpStatus: HostRsvpStatus; attendingCount: number | null } {
  const given = asked.flatMap((event) => (answers[event.id] ? [answers[event.id]] : []));
  const confirmed = given.filter((answer) => answer.status === 'CONFIRMED');
  if (confirmed.length) {
    const known = confirmed.flatMap((answer) => (answer.attending === null ? [] : [answer.attending]));
    return { rsvpStatus: 'CONFIRMED', attendingCount: known.length === confirmed.length ? Math.max(...known) : null };
  }
  if (given.some((answer) => answer.status === 'MAYBE')) return { rsvpStatus: 'MAYBE', attendingCount: null };
  if (asked.length > 0 && given.length === asked.length) return { rsvpStatus: 'DECLINED', attendingCount: 0 };
  return { rsvpStatus: 'PENDING', attendingCount: null };
}

/**
 * D-037: a host sets a guest's answer from the dashboard (a phone call, a reply on WhatsApp). Before this the dashboard
 * wrote the status alone, so a guest declined earlier and confirmed by the host still brought 0 people, and per-event
 * answers could contradict the overall one.
 *
 * Without per-event RSVP for this guest (`asked` empty): the status, and the people attending by the guest rules: 0 for a
 * decline, unknown for "mungkin" and "belum menjawab", and for "hadir" the number the guest gave with an earlier "hadir",
 * else unknown. Per-event answers follow D-036's single-answer rule (`singleAnswerEventAnswers` without an asked event).
 * With per-event RSVP: the answer applies to every asked event, or to `eventId` alone, keeping a "hadir" count the guest
 * gave for that event; "belum menjawab" removes the event's answer; the overall answer follows from the events.
 */
export function hostRsvpUpdate(input: {
  status: HostRsvpStatus;
  eventId?: string;
  flagOn: boolean;
  listed: readonly AskedEvent[];
  asked: readonly AskedEvent[];
  stored: EventAnswers;
  previous: { rsvpStatus: string; attendingCount: number | null };
}): HostRsvpUpdate | null {
  const { status, stored } = input;
  if (input.eventId !== undefined && !input.asked.some((event) => event.id === input.eventId)) return null;
  if (!input.flagOn || input.asked.length === 0) {
    if (input.eventId !== undefined) return null;
    const keepCount = status === 'CONFIRMED' && input.previous.rsvpStatus === 'CONFIRMED' && (input.previous.attendingCount ?? 0) > 0;
    const attendingCount = status === 'DECLINED' ? 0 : keepCount ? input.previous.attendingCount : null;
    const eventAnswers = input.flagOn && input.listed.length === 0 ? null : undefined;
    return { rsvpStatus: status, attendingCount, ...(eventAnswers !== undefined && { rsvpEventAnswers: eventAnswers }) };
  }
  const targets = input.eventId === undefined ? input.asked : input.asked.filter((event) => event.id === input.eventId);
  const next: EventAnswers = { ...stored };
  for (const event of targets) {
    if (status === 'PENDING') delete next[event.id];
    else if (status === 'CONFIRMED') next[event.id] = { status, attending: stored[event.id]?.status === 'CONFIRMED' ? stored[event.id].attending : null };
    else next[event.id] = { status, attending: status === 'DECLINED' ? 0 : null };
  }
  return { ...overallFromAskedAnswers(input.asked, next), rsvpEventAnswers: next };
}

export type EventRsvpSummary = {
  id: string;
  title: string;
  counts: Record<RsvpStatus | 'PENDING', number>;
  /** People the "hadir" answers for this event bring. */
  seats: number;
  /** D-037: guests this event is for (every guest unless it is invite-only). */
  invited: number;
  inviteOnly: boolean;
};

/**
 * Per-event picture for the host. A guest with no answer for an event counts as "belum menjawab" for it, never as a
 * decline, including a guest who answered once for the whole invitation before per-event RSVP was switched on.
 * D-037: an invite-only event counts only the guests invited to it (pass `inviteOnlyOn`, the flag); an answer kept from
 * before a guest was uninvited stays stored and is not counted.
 */
export function eventRsvpSummary(
  rows: readonly { rsvpEventAnswers: unknown; invitedEventIds?: unknown }[],
  events: readonly AskedEvent[],
  inviteOnlyOn = false,
): EventRsvpSummary[] {
  const guests = rows.map((row) => ({ answers: readEventAnswers(row.rsvpEventAnswers), audience: guestAudience(row) }));
  return events.map((event) => {
    const counts: Record<RsvpStatus | 'PENDING', number> = { PENDING: 0, CONFIRMED: 0, DECLINED: 0, MAYBE: 0 };
    let seats = 0;
    let invited = 0;
    for (const { answers, audience } of guests) {
      if (!eventVisibleTo(event, audience, inviteOnlyOn)) continue;
      invited += 1;
      const answer = answers[event.id];
      counts[answer?.status ?? 'PENDING'] += 1;
      if (answer?.status === 'CONFIRMED') seats += answer.attending ?? 0;
    }
    return { id: event.id, title: event.title, counts, seats, invited, inviteOnly: inviteOnlyOn && event.inviteOnly === true };
  });
}

/**
 * Events that get export columns: every listed event while per-event RSVP is on (two or more events), otherwise the listed
 * events some guest answered, so what was collected before the host switched it off is still exported. Answers to events
 * no longer listed stay stored but get no column, like answers to deleted questions (D-034).
 */
export function exportedEvents(
  config: Pick<DetailConfig, 'rsvp' | 'events'>,
  rows: readonly { rsvpEventAnswers: unknown }[],
): AskedEvent[] {
  const listed = eventsWithIds(config.events);
  if (config.rsvp?.perEvent === true && listed.length >= 2) return listed;
  const answered = new Set(rows.flatMap((row) => Object.keys(readEventAnswers(row.rsvpEventAnswers))));
  return listed.filter((event) => answered.has(event.id));
}

/** Export cells for one event: the status as stored, and the people attending (empty while unknown, 0 for a decline). */
export function eventAnswerCells(answer: EventAnswer | undefined): [string, string] {
  if (!answer) return ['', ''];
  return [answer.status, answer.attending === null ? '' : String(answer.attending)];
}
