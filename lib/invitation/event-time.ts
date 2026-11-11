/**
 * Event dates and times in the event's own zone, whatever zone the server runs in (B-004, QA-002).
 *
 * `startAt` / `endAt` are ISO strings with an offset (`detail-config.ts` requires `{ offset: true }`). The offset
 * the host saved is the zone the event happens in: +07:00 WIB, +08:00 WITA, +09:00 WIT. A UTC ("Z") value falls
 * back to the invitation's `eventOperations.timezone` when it names an Indonesian zone, else Asia/Jakarta. Any
 * other offset is shown as wall-clock time at that offset with a "UTC±hh:mm" label rather than a wrong local label.
 */

export const INDONESIAN_ZONES = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
} as const;

export type IndonesianZone = keyof typeof INDONESIAN_ZONES;

const ZONE_BY_OFFSET: Record<string, IndonesianZone> = {
  '+07:00': 'Asia/Jakarta',
  '+08:00': 'Asia/Makassar',
  '+09:00': 'Asia/Jayapura',
};

type Resolved = { date: Date; timeZone: string; label: string };

export function isIndonesianZone(value: string | null | undefined): value is IndonesianZone {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(INDONESIAN_ZONES, value as string);
}

/** The Indonesian zone an ISO value's offset names (+07:00 WIB, +08:00 WITA, +09:00 WIT), or null for any other value. */
export function indonesianZoneOf(value: string | null | undefined): IndonesianZone | null {
  const offset = value?.match(/([+-]\d{2}):?(\d{2})$/);
  return offset ? (ZONE_BY_OFFSET[`${offset[1]}:${offset[2]}`] ?? null) : null;
}

function resolve(value: string | undefined | null, fallbackZone?: string | null): Resolved | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const offset = value.match(/([+-]\d{2}):?(\d{2})$/);
  if (offset) {
    const key = `${offset[1]}:${offset[2]}`;
    const zone = ZONE_BY_OFFSET[key];
    if (zone) return { date, timeZone: zone, label: INDONESIAN_ZONES[zone] };
    const minutes = (Math.abs(Number(offset[1])) * 60 + Number(offset[2])) * (offset[1].startsWith('-') ? -1 : 1);
    return { date: new Date(date.getTime() + minutes * 60_000), timeZone: 'UTC', label: `UTC${key}` };
  }
  const zone: IndonesianZone = isIndonesianZone(fallbackZone) ? fallbackZone : 'Asia/Jakarta';
  return { date, timeZone: zone, label: INDONESIAN_ZONES[zone] };
}

const FORMATS = {
  dateLong: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  monthShort: { month: 'short' },
  time24: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * One shared formatter per zone and format. Building an `Intl.DateTimeFormat` costs far more than using one, and the
 * guest page formats every event several times per view (≈ 8 % of the page's server CPU in the s21 profile). Instances
 * hold only locale and options, so sharing them across requests shares no request data. `resolve()` returns one of
 * four zones (the three Indonesian zones or UTC) and a guest page speaks one of two locales (G-018), so the map holds at
 * most twenty-four entries.
 */
function formatter(timeZone: string, format: keyof typeof FORMATS, locale: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${format}`;
  let shared = formatters.get(key);
  if (!shared) {
    shared = new Intl.DateTimeFormat(locale, { timeZone, ...FORMATS[format] });
    formatters.set(key, shared);
  }
  return shared;
}

/**
 * "Sabtu, 21 November 2026" (or "Saturday 21 November 2026" with `en-GB`, G-018) in the event's zone, or null for a
 * missing / invalid value.
 */
export function formatEventDate(value?: string | null, fallbackZone?: string | null, locale = 'id-ID'): string | null {
  const resolved = resolve(value, fallbackZone);
  if (!resolved) return null;
  return formatter(resolved.timeZone, 'dateLong', locale).format(resolved.date);
}

export type EventDateParts = { weekday: string; day: string; month: string; monthShort: string; year: string };

/** Weekday, day, month and year in the event's zone, for date tiles; null for a missing / invalid value. */
export function eventDateParts(value?: string | null, fallbackZone?: string | null, locale = 'id-ID'): EventDateParts | null {
  const resolved = resolve(value, fallbackZone);
  if (!resolved) return null;
  const parts = (format: keyof typeof FORMATS) =>
    Object.fromEntries(formatter(resolved.timeZone, format, locale).formatToParts(resolved.date).map((part) => [part.type, part.value]));
  const long = parts('dateLong');
  return { weekday: long.weekday, day: long.day, month: long.month, monthShort: parts('monthShort').month.replace('.', ''), year: long.year };
}

/** "08.00 WIB" ("08:00 WIB" with `en-GB`) in the event's zone, or null for a missing / invalid value. */
export function formatEventTime(value?: string | null, fallbackZone?: string | null, locale = 'id-ID'): string | null {
  const resolved = resolve(value, fallbackZone);
  if (!resolved) return null;
  return `${formatter(resolved.timeZone, 'time24', locale).format(resolved.date)} ${resolved.label}`;
}
