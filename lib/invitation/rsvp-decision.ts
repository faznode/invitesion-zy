import type { DetailConfig } from './detail-config';
import { guestAudience, visibleEvents } from './event-eligibility';
import { parseRsvpAnswers, rsvpQuestionsOf, type RsvpAnswers } from './rsvp-questions';
import {
  hostRsvpUpdate,
  mergeEventAnswers,
  parseEventAnswers,
  perEventRsvpEvents,
  readEventAnswers,
  singleAnswerEventAnswers,
  type EventAnswers,
  type HostRsvpStatus,
  type HostRsvpUpdate,
} from './rsvp-events';
import { isRsvpStatus, requestedHeadcount, rsvpAttendance, rsvpClosedReason, type RsvpClosedReason, type RsvpStatus } from './rsvp-rules';

/**
 * R-03: the RSVP write decision as pure functions over plain data. The guest action, the host's dashboard and the Rust
 * RSVP module (`services/api/src/rsvp/`) apply exactly these rules; `contracts/vectors/rsvp-decisions.json` runs the
 * whole decision (stored config through the lenient read, guest row, submission, flags, clock) in both languages.
 */

/** The switches the page was rendered with (`lib/flags.ts`). Sent with every API call so both writers apply the same. */
export type RsvpFlags = { maybe: boolean; perEvent: boolean; inviteOnlyEvents: boolean; questions: boolean };

/**
 * What a guest's form submitted, independent of HTML field names: `status` / `guestCount` are the single answer,
 * `events[id]` the per-event fields (`ev:<id>`, `evn:<id>`), `answers[id]` every value of a question (`q:<id>`).
 * A missing count is null; `Number(count || 1)` treats null and '' alike.
 */
export type RsvpSubmission = {
  status: string;
  guestCount: string | null;
  events: Record<string, { status: string; guestCount: string | null }>;
  answers: Record<string, string[]>;
};

export type RsvpGuestState = { guestCount: number; invitedEventIds: unknown; rsvpEventAnswers: unknown };

export type GuestRsvpDecision =
  | { kind: 'closed'; reason: RsvpClosedReason }
  | { kind: 'invalid' }
  | { kind: 'events'; eventId: string }
  | { kind: 'answers'; questionId: string }
  | {
      kind: 'write';
      status: RsvpStatus;
      attendingCount: number | null;
      /** Absent = leave the column as it is; null = clear it. */
      rsvpAnswers?: RsvpAnswers | null;
      rsvpEventAnswers?: EventAnswers | null;
    };

/** A file in a text field reads as '' (as the rules always treated it); a missing field is null. */
const fieldText = (value: FormDataEntryValue | null): string | null => (value === null ? null : typeof value === 'string' ? value : '');

/** Builds own properties only, so a field named after an `Object.prototype` member can never reach the prototype. */
export function rsvpSubmissionFromForm(form: FormData): RsvpSubmission {
  const events = new Map<string, { status: string; guestCount: string | null }>();
  const answers = new Map<string, string[]>();
  const event = (id: string) => events.get(id) ?? events.set(id, { status: '', guestCount: null }).get(id)!;
  for (const name of new Set(form.keys())) {
    if (name.startsWith('ev:')) event(name.slice(3)).status = fieldText(form.get(name)) ?? '';
    else if (name.startsWith('evn:')) event(name.slice(4)).guestCount = fieldText(form.get(name));
    else if (name.startsWith('q:')) answers.set(name.slice(2), form.getAll(name).map((value) => fieldText(value) ?? ''));
  }
  return {
    status: fieldText(form.get('status')) ?? '',
    guestCount: fieldText(form.get('guestCount')),
    events: Object.fromEntries(events),
    answers: Object.fromEntries(answers),
  };
}

/** The submission behind the `get` / `getAll` reads `parseEventAnswers` and `parseRsvpAnswers` make. */
function submissionReader(submission: RsvpSubmission) {
  const own = <T>(record: Record<string, T>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);
  return {
    get(name: string): string | null {
      if (name.startsWith('ev:')) return own(submission.events, name.slice(3))?.status ?? null;
      if (name.startsWith('evn:')) return own(submission.events, name.slice(4))?.guestCount ?? null;
      return null;
    },
    getAll(name: string): string[] {
      return name.startsWith('q:') ? (own(submission.answers, name.slice(2)) ?? []) : [];
    },
  };
}

/**
 * A guest's RSVP for an open invitation and a resolved guest (the caller has already refused drafts, expired
 * invitations and unknown links). Order of refusals: closed (B-027), the per-event answers or the single status
 * (D-036, D-037, B-007), then the host's questions (D-034, D-035). A write sets status, headcount, question answers and
 * per-event answers in one statement.
 */
export function decideGuestRsvp(input: {
  config: DetailConfig;
  guest: RsvpGuestState;
  submission: RsvpSubmission;
  flags: RsvpFlags;
  now: number;
}): GuestRsvpDecision {
  const { config, guest, submission } = input;
  // B-027: a hidden form is not a closed one. RSVP switched off, or past its deadline, refuses every POST, including a
  // page that was rendered while it was still open.
  const closed = rsvpClosedReason(config.rsvp, input.now);
  if (closed) return { kind: 'closed', reason: closed };

  const form = submissionReader(submission);
  const maybe = input.flags.maybe;
  let status: RsvpStatus;
  let attendingCount: number | null;
  // Undefined leaves the column as it is (flag off: per-event answers are neither read nor written).
  let rsvpEventAnswers: EventAnswers | null | undefined;
  const perEventOn = input.flags.perEvent;
  const listed = perEventRsvpEvents({ perEvent: config.rsvp?.perEvent, events: config.events }, perEventOn);
  // D-037: the guest answers only the listed events their page shows (open ones and the invite-only ones they are
  // invited to), by the rule the page used; fields naming any other event are never read.
  const events = visibleEvents(listed, guestAudience(guest), input.flags.inviteOnlyEvents);
  const storedEventAnswers = readEventAnswers(guest.rsvpEventAnswers);
  if (events.length >= 2) {
    // B-027 slice 2c (D-036): one answer per listed event, by event id; the overall status and headcount follow from them.
    // A form without them (rendered before the switch, or before an event was added) is refused, naming the event.
    const parsed = parseEventAnswers(form, events, guest.guestCount, { maybe });
    if (!parsed.ok) return { kind: 'events', eventId: parsed.eventId };
    status = parsed.status;
    attendingCount = parsed.attendingCount;
    rsvpEventAnswers = mergeEventAnswers(storedEventAnswers, parsed.answers);
  } else {
    const submitted = submission.status;
    // B-027: "maybe" is accepted only while its flag is on, so switching the flag off also refuses stale forms.
    if (!isRsvpStatus(submitted, { maybe })) return { kind: 'invalid' };
    status = submitted;
    // The answer goes to attending_count; guest_count is the host's allowance and is never written here (B-007).
    attendingCount = rsvpAttendance(status, requestedHeadcount(submission.guestCount), guest.guestCount);
    // D-036: one answer for the whole invitation replaces earlier per-event answers, so they never contradict the latest;
    // D-037: a guest invited to one listed event answers for that event.
    rsvpEventAnswers = singleAnswerEventAnswers({ flagOn: perEventOn, listed, asked: events, stored: storedEventAnswers, answer: { status, attending: attendingCount } });
  }

  // B-027 (D-034): answers to the host's questions, by the rules the form was rendered with. Undefined leaves the column
  // as it is (flag off or no questions), so switching either off never erases stored answers; null clears on a decline.
  let rsvpAnswers: RsvpAnswers | null | undefined;
  const questions = input.flags.questions ? rsvpQuestionsOf(config.registrationForm ?? {}) : [];
  if (questions.length) {
    const parsed = parseRsvpAnswers(form, questions, status);
    if (!parsed.ok) return { kind: 'answers', questionId: parsed.questionId };
    rsvpAnswers = parsed.answers;
  }

  return {
    kind: 'write',
    status,
    attendingCount,
    ...(rsvpAnswers !== undefined && { rsvpAnswers }),
    ...(rsvpEventAnswers !== undefined && { rsvpEventAnswers }),
  };
}

export const HOST_RSVP_STATUSES: readonly HostRsvpStatus[] = ['PENDING', 'CONFIRMED', 'DECLINED', 'MAYBE'];
export const isHostRsvpStatus = (value: string): value is HostRsvpStatus => (HOST_RSVP_STATUSES as readonly string[]).includes(value);

/** A host sets one guest's answer (D-037, `hostRsvpUpdate`); null = refused (unknown status or an event not asked). */
export function decideHostRsvp(input: {
  config: DetailConfig;
  guest: { invitedEventIds: unknown; rsvpEventAnswers: unknown; rsvpStatus: string; attendingCount: number | null };
  status: string;
  eventId?: string;
  flags: Pick<RsvpFlags, 'perEvent' | 'inviteOnlyEvents'>;
}): HostRsvpUpdate | null {
  const { config, guest, status, flags } = input;
  if (!isHostRsvpStatus(status)) return null;
  const listed = perEventRsvpEvents({ perEvent: config.rsvp?.perEvent, events: config.events }, flags.perEvent);
  const asked = visibleEvents(listed, guestAudience(guest), flags.inviteOnlyEvents);
  return hostRsvpUpdate({
    status,
    eventId: input.eventId,
    flagOn: flags.perEvent,
    listed,
    asked,
    stored: readEventAnswers(guest.rsvpEventAnswers),
    previous: { rsvpStatus: guest.rsvpStatus, attendingCount: guest.attendingCount },
  });
}
