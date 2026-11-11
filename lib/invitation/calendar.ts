/**
 * Save-the-date helpers for guest pages (B-008): an RFC 5545 calendar file, a Google Calendar template link, and the
 * countdown arithmetic. Pure functions; the route and the client island only wire them.
 *
 * Times: `startAt` / `endAt` carry the offset the host saved (B-004), so `new Date(value)` is the correct instant and
 * DTSTART is written in UTC ("…Z"), which every calendar converts to the reader's zone. A missing or non-increasing
 * end leaves DTEND out (RFC 5545 §3.6.1: the event then ends at DTSTART) rather than inventing a duration.
 * No guest data goes into the file: it is the same for every guest of an invitation.
 */
import { legacyEventPosition } from './event-ids';

export type CalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  end?: Date | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

type ConfigEvent = { id?: string; title: string; startAt?: string; endAt?: string; venueName?: string; address?: string };

/**
 * An entry's UID follows the event's id (D-036), so after a reorder a calendar app updates the right entry. A legacy
 * `ev-<n>` id keeps the index UID it had before ids existed (`<slug>.<n-1>`), so entries guests already saved still match.
 */
export function calendarUid(slug: string, eventId: string | undefined, index: number): string {
  const legacy = legacyEventPosition(eventId);
  return `${slug}.${legacy !== null ? legacy - 1 : (eventId ?? index)}@invitesion`;
}

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function icsDateTimeUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/** TEXT value escaping, RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (continuations start with one space), never splitting a code point. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = char;
      octets = size;
    } else {
      current += char;
      octets += size;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(events: CalendarEvent[], now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Invitesion//Undangan Digital//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${icsDateTimeUtc(now)}`, `DTSTART:${icsDateTimeUtc(event.start)}`);
    if (event.end && event.end.getTime() > event.start.getTime()) lines.push(`DTEND:${icsDateTimeUtc(event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url.replace(/[\r\n]/g, '')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** One calendar entry per configured event that has a valid start; titles read "Akad Nikah · Sari & Budi". */
export function calendarEventsFromConfig(input: {
  slug: string;
  displayName: string;
  events: ConfigEvent[];
  publicUrl?: string | null;
}): CalendarEvent[] {
  return input.events.flatMap((event, index) => {
    const start = validDate(event.startAt);
    if (!start) return [];
    const location = [event.venueName, event.address].filter((part) => part?.trim()).join(', ');
    return [
      {
        uid: calendarUid(input.slug, event.id, index),
        title: `${event.title} · ${input.displayName}`,
        start,
        end: validDate(event.endAt),
        location: location || null,
        description: input.publicUrl ? `Undangan: ${input.publicUrl}` : null,
        url: input.publicUrl ?? null,
      },
    ];
  });
}

/** Google Calendar "add event" template link; a zero-length range when no end is known. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const end = event.end && event.end.getTime() > event.start.getTime() ? event.end : event.start;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${icsDateTimeUtc(event.start)}/${icsDateTimeUtc(end)}`,
  });
  if (event.location) params.set('location', event.location);
  if (event.description) params.set('details', event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

/** Whole days / hours / minutes / seconds until `targetMs`, or null once the moment has passed. */
export function countdownParts(targetMs: number, nowMs: number): CountdownParts | null {
  const remaining = Math.floor((targetMs - nowMs) / 1000);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return {
    days: Math.floor(remaining / 86_400),
    hours: Math.floor((remaining % 86_400) / 3_600),
    minutes: Math.floor((remaining % 3_600) / 60),
    seconds: remaining % 60,
  };
}
