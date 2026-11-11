/**
 * B-034 (G-038, G-039; ideas I-06, I-29): the host's analytics and follow-up lists for one invitation, computed from its
 * own guest rows and its deduplicated VIEW events (B-017a: at most one VIEW and one `opened_count` step per guest per
 * 30 minutes, whichever writer records it). Read-only. The owner-scoped loader is `host-analytics-query.ts`; the page is
 * `/dashboard/invitations/<id>/insights`; reminders go through the B-018 builder (`guestWhatsApp`).
 *
 * Follow-up rule: only a guest without an answer (`PENDING`) needs a nudge. One who never opened their link is
 * "belum membuka" (unopened); one who opened it and still has not answered is "belum menjawab" (unanswered). Answered
 * guests, including "mungkin", are in neither list. Server-side helpers only (personal links use `node:crypto` through
 * `guest-link.ts`); the view receives plain data.
 */
import { csvRow } from '@/lib/csv';
import { indonesianZoneOf, INDONESIAN_ZONES, isIndonesianZone, type IndonesianZone } from '@/lib/invitation/event-time';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { guestPath } from '@/lib/invitation/public-path';
import { rsvpSummary, type RsvpSummary } from '@/lib/invitation/rsvp-rules';
import { guestWhatsApp, type GuestWhatsApp } from '@/lib/invitation/whatsapp';

export type AnalyticsGuest = {
  id: number;
  name: string;
  slug: string;
  linkToken: string | null;
  phone: string | null;
  category: string | null;
  rsvpStatus: string;
  attendingCount: number | null;
  openedCount: number;
  openedAt: Date | null;
  sentAt: Date | null;
};

export type FollowUpKind = 'unopened' | 'unanswered';
export const FOLLOW_UP_KINDS: readonly FollowUpKind[] = ['unopened', 'unanswered'];

export function isFollowUpKind(value: unknown): value is FollowUpKind {
  return value === 'unopened' || value === 'unanswered';
}

/** Which follow-up list a guest belongs to, or null when they have answered (or carry an unknown status). */
export function followUpKind(guest: Pick<AnalyticsGuest, 'rsvpStatus' | 'openedCount'>): FollowUpKind | null {
  if (guest.rsvpStatus !== 'PENDING') return null;
  return guest.openedCount > 0 ? 'unanswered' : 'unopened';
}

const byName = (a: AnalyticsGuest, b: AnalyticsGuest) => a.name.localeCompare(b.name, 'id') || a.id - b.id;
const timeOrLast = (value: Date | null) => value?.getTime() ?? Number.POSITIVE_INFINITY;

/**
 * Both follow-up lists, most overdue first: unopened guests by when the host marked them sent (never marked sent last),
 * unanswered guests by their last counted open (opened longest ago first); ties by name.
 */
export function followUpLists<T extends AnalyticsGuest>(rows: readonly T[]): Record<FollowUpKind, T[]> {
  const lists: Record<FollowUpKind, T[]> = { unopened: [], unanswered: [] };
  for (const row of rows) {
    const kind = followUpKind(row);
    if (kind) lists[kind].push(row);
  }
  lists.unopened.sort((a, b) => timeOrLast(a.sentAt) - timeOrLast(b.sentAt) || byName(a, b));
  lists.unanswered.sort((a, b) => timeOrLast(a.openedAt) - timeOrLast(b.openedAt) || byName(a, b));
  return lists;
}

export type AnalyticsTotals = {
  guests: number;
  /** Guests whose personal link counted at least one open. */
  opened: number;
  /** Guests with an answer: hadir, mungkin or tidak hadir. */
  answered: number;
  unopened: number;
  unanswered: number;
  rsvp: RsvpSummary;
};

export function analyticsTotals(rows: readonly AnalyticsGuest[]): AnalyticsTotals {
  const rsvp = rsvpSummary(rows);
  let opened = 0;
  let unopened = 0;
  let unanswered = 0;
  for (const row of rows) {
    if (row.openedCount > 0) opened += 1;
    const kind = followUpKind(row);
    if (kind === 'unopened') unopened += 1;
    else if (kind === 'unanswered') unanswered += 1;
  }
  return { guests: rows.length, opened, answered: rsvp.counts.CONFIRMED + rsvp.counts.MAYBE + rsvp.counts.DECLINED, unopened, unanswered, rsvp };
}

export type GroupRow = AnalyticsTotals & { group: string | null };

/** Totals per guest group (the host's category / tag, trimmed); guests without one last, as one group. */
export function groupBreakdown(rows: readonly AnalyticsGuest[]): GroupRow[] {
  const groups = new Map<string | null, AnalyticsGuest[]>();
  for (const row of rows) {
    const key = row.category?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'id')))
    .map(([group, members]) => ({ group, ...analyticsTotals(members) }));
}

/**
 * The zone a host reads their days in: the invitation's `eventOperations.timezone` when it names an Indonesian zone,
 * else the zone of the first event's saved offset (B-004), else Asia/Jakarta.
 */
export function hostTimeZone(config: { eventOperations?: { timezone?: string }; events?: readonly { startAt?: string }[] }): IndonesianZone {
  const configured = config.eventOperations?.timezone;
  if (isIndonesianZone(configured)) return configured;
  for (const event of config.events ?? []) {
    const zone = indonesianZoneOf(event.startAt);
    if (zone) return zone;
  }
  return 'Asia/Jakarta';
}

const LOCAL_DATE = new Map<string, Intl.DateTimeFormat>();

/** `YYYY-MM-DD` of an instant in a zone. */
export function localDate(at: Date, zone: string): string {
  let format = LOCAL_DATE.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    LOCAL_DATE.set(zone, format);
  }
  return format.format(at);
}

/** A `YYYY-MM-DD` date moved by whole days (calendar arithmetic, no zone involved). */
export function shiftDate(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

/** One local day of opens: every counted VIEW, and the distinct guests among them (opens without a personal link have none). */
export type DailyOpens = { day: string; opens: number; guests: number };

export const OPENS_WINDOW_DAYS = 14;

/** The `days` local dates ending `today`, oldest first; a day without opens reads zero. Rows outside the window are left out. */
export function opensByDay(rows: readonly DailyOpens[], today: string, days = OPENS_WINDOW_DAYS): DailyOpens[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, index) => {
    const day = shiftDate(today, index - days + 1);
    const row = byDay.get(day);
    return { day, opens: row?.opens ?? 0, guests: row?.guests ?? 0 };
  });
}

const DIGEST_DATE = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Sabtu, 7 November 2026" for a `YYYY-MM-DD` local date. */
export function formatLocalDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return DIGEST_DATE.format(new Date(Date.UTC(year, month - 1, date)));
}

/**
 * I-29: the day's RSVP picture as plain text the host forwards on WhatsApp (no API, no recipient). Counts only: no
 * guest's name, number or link ever enters it (UU PDP minimisation).
 */
export function rsvpDigest(input: { title: string; today: string; zone: IndonesianZone; totals: AnalyticsTotals; openedToday: number }): string {
  const { totals } = input;
  const { counts, seats, seatsUnknown } = totals.rsvp;
  const lines = [
    `Ringkasan RSVP · ${input.title}`,
    `${formatLocalDay(input.today)} (${INDONESIAN_ZONES[input.zone]})`,
    '',
    `Tamu: ${totals.guests}`,
    `Hadir: ${counts.CONFIRMED} tamu · ${seats} orang`,
    ...(seatsUnknown > 0 ? [`(${seatsUnknown} jawaban hadir tanpa jumlah orang)`] : []),
    `Mungkin: ${counts.MAYBE}`,
    `Tidak hadir: ${counts.DECLINED}`,
    `Belum menjawab: ${totals.unanswered} (sudah membuka undangan)`,
    `Belum membuka: ${totals.unopened}`,
    `Dibuka hari ini: ${input.openedToday} tamu`,
  ];
  return lines.join('\n');
}

export type FollowUpItem = {
  id: number;
  name: string;
  category: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  openedCount: number;
  link: string;
  whatsApp: GuestWhatsApp;
};

/** A list's rows with each guest's personal link (B-011 token or slug) and their B-018 reminder in the host's message. */
export function followUpItems(
  rows: readonly AnalyticsGuest[],
  context: { origin: string; slug: string; template?: string | null },
): FollowUpItem[] {
  return rows.map((guest) => {
    const link = `${context.origin}${guestPath(context.slug, guestLinkSegment(guest))}`;
    return {
      id: guest.id,
      name: guest.name,
      category: guest.category?.trim() || null,
      sentAt: guest.sentAt,
      openedAt: guest.openedAt,
      openedCount: guest.openedCount,
      link,
      whatsApp: guestWhatsApp({ phone: guest.phone, name: guest.name, link, template: context.template }),
    };
  });
}

export const FOLLOW_UP_EXPORT_HEADER = ['name', 'phone', 'category', 'rsvp_status', 'sent_at', 'opened_count', 'last_opened_at', 'personal_link'];

/** One follow-up list as CSV for the owner; every cell through `csvRow` (B-006), since names come from host imports. */
export function followUpCsv(rows: readonly AnalyticsGuest[], items: readonly FollowUpItem[]): string {
  const links = new Map(items.map((item) => [item.id, item.link]));
  const body = rows.map((guest) =>
    csvRow([
      guest.name,
      guest.phone,
      guest.category,
      guest.rsvpStatus,
      guest.sentAt?.toISOString(),
      guest.openedCount,
      guest.openedAt?.toISOString(),
      links.get(guest.id),
    ]),
  );
  return [FOLLOW_UP_EXPORT_HEADER.join(','), ...body].join('\n');
}
