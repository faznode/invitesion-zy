/**
 * RSVP attendance rule (B-007, QA-005).
 *
 * `guests.guest_count` is the host's allowance for one personal link. Before B-007 the RSVP action wrote the answer
 * into that column, so "decline" set it to 0 and a later "confirm" was capped at 1. The answer now lives in
 * `attending_count` and the allowance is only ever read.
 */
export const RSVP_STATUSES = ['CONFIRMED', 'DECLINED', 'MAYBE'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** An answer a guest may send now. "Maybe" (B-027) only when the caller says its flag is on; stored MAYBE rows stay valid. */
export function isRsvpStatus(value: string, options: { maybe?: boolean } = {}): value is RsvpStatus {
  if (value === 'MAYBE') return options.maybe === true;
  return (RSVP_STATUSES as readonly string[]).includes(value);
}

/** What a guest reads back about their last answer. */
export const RSVP_ANSWER_TEXT: Record<RsvpStatus, string> = { CONFIRMED: 'hadir', DECLINED: 'tidak hadir', MAYBE: 'mungkin hadir' };

/** Answers per status (B-027: "maybe" is counted on its own and never as attending). Unknown stored values are left out. */
export function rsvpCounts(rows: readonly { rsvpStatus: string }[]): Record<RsvpStatus | 'PENDING', number> {
  const counts: Record<RsvpStatus | 'PENDING', number> = { PENDING: 0, CONFIRMED: 0, DECLINED: 0, MAYBE: 0 };
  for (const { rsvpStatus } of rows) if (rsvpStatus in counts) counts[rsvpStatus as keyof typeof counts] += 1;
  return counts;
}

export type RsvpSummary = { total: number; counts: Record<RsvpStatus | 'PENDING', number>; seats: number; seatsUnknown: number };

/**
 * One guest list's RSVP picture for the host's dashboards (E-033): answers per status, as `rsvpCounts`, and the people
 * the "hadir" answers bring. `seats` adds up `attending_count` over CONFIRMED rows; a CONFIRMED row without one (an
 * answer from before B-007) counts in `seatsUnknown` instead of being guessed from the allowance. "Maybe" and a decline
 * never add seats.
 */
export function rsvpSummary(rows: readonly { rsvpStatus: string; attendingCount: number | null }[]): RsvpSummary {
  let seats = 0;
  let seatsUnknown = 0;
  for (const { rsvpStatus, attendingCount } of rows) {
    if (rsvpStatus !== 'CONFIRMED') continue;
    if (attendingCount === null) seatsUnknown += 1;
    else seats += attendingCount;
  }
  return { total: rows.length, counts: rsvpCounts(rows), seats, seatsUnknown };
}

/**
 * The headcount a guest typed, read from the form field exactly as the RSVP action always has (`Number(field || 1)`);
 * `rsvpAttendance` then clamps it. Named so the shared RSVP vectors (R-03) pin this boundary conversion too.
 */
export function requestedHeadcount(field: unknown): number {
  return Number(field || 1);
}

/**
 * People attending for an answer: 0 on decline; unknown (null) for "maybe", so a tentative answer never enters a
 * headcount; otherwise the requested number clamped to 1…allowance.
 */
export function rsvpAttendance(status: 'MAYBE', requested: number, allowance: number): null;
export function rsvpAttendance(status: Exclude<RsvpStatus, 'MAYBE'>, requested: number, allowance: number): number;
export function rsvpAttendance(status: RsvpStatus, requested: number, allowance: number): number | null;
export function rsvpAttendance(status: RsvpStatus, requested: number, allowance: number): number | null {
  if (status === 'DECLINED') return 0;
  if (status === 'MAYBE') return null;
  const cap = Number.isInteger(allowance) && allowance > 0 ? allowance : 1;
  const wanted = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  return Math.min(Math.max(wanted, 1), cap);
}

/**
 * RSVP window (B-027). `rsvp.deadline` is an instant saved with the host's offset (detail-config), so the comparison is
 * zone-independent; only its display uses the event's wall clock (B-004). Closed from the deadline instant on. A missing
 * or unreadable deadline never closes RSVP (the lenient read path already drops a section that fails the schema).
 */
export function rsvpDeadlinePassed(deadline: string | undefined, now: number): boolean {
  if (!deadline) return false;
  const at = Date.parse(deadline);
  return Number.isFinite(at) && now >= at;
}

export type RsvpClosedReason = 'disabled' | 'deadline';

/** Why an RSVP write must be refused for this config at `now`, or null. The action applies it to every POST. */
export function rsvpClosedReason(rsvp: { enabled?: boolean; deadline?: string } | undefined, now: number): RsvpClosedReason | null {
  if (rsvp?.enabled === false) return 'disabled';
  if (rsvpDeadlinePassed(rsvp?.deadline, now)) return 'deadline';
  return null;
}

/** What the RSVP form should preselect: the last answer when the guest is attending, else the full allowance. */
export function rsvpDefaultCount(guest: { guestCount: number; attendingCount: number | null }): number {
  const allowance = guest.guestCount > 0 ? guest.guestCount : 1;
  if (guest.attendingCount && guest.attendingCount > 0) return Math.min(guest.attendingCount, allowance);
  return allowance;
}
