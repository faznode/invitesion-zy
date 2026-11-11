// s21: event dates are formatted with shared Intl formatters instead of a new one per call (≈ 8 % of the guest page's
// server CPU in the s21 profile). The output must not change: these tests compare every exported formatter with the
// pre-s21 implementation, kept verbatim below as the reference, over every zone rule `resolve()` has.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPlainDate } from '@/lib/invitation/ceremony-profile';
import { eventDateParts, formatEventDate, formatEventTime } from '@/lib/invitation/event-time';

const ZONES: Record<string, string> = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' };
const BY_OFFSET: Record<string, string> = { '+07:00': 'Asia/Jakarta', '+08:00': 'Asia/Makassar', '+09:00': 'Asia/Jayapura' };

function referenceResolve(value: string | null | undefined, fallbackZone?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const offset = value.match(/([+-]\d{2}):?(\d{2})$/);
  if (offset) {
    const key = `${offset[1]}:${offset[2]}`;
    const zone = BY_OFFSET[key];
    if (zone) return { date, timeZone: zone, label: ZONES[zone] };
    const minutes = (Math.abs(Number(offset[1])) * 60 + Number(offset[2])) * (offset[1].startsWith('-') ? -1 : 1);
    return { date: new Date(date.getTime() + minutes * 60_000), timeZone: 'UTC', label: `UTC${key}` };
  }
  const zone = fallbackZone && Object.prototype.hasOwnProperty.call(ZONES, fallbackZone) ? fallbackZone : 'Asia/Jakarta';
  return { date, timeZone: zone, label: ZONES[zone] };
}
const reference = {
  date(value?: string | null, zone?: string | null) {
    const r = referenceResolve(value, zone);
    return r ? new Intl.DateTimeFormat('id-ID', { timeZone: r.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(r.date) : null;
  },
  time(value?: string | null, zone?: string | null) {
    const r = referenceResolve(value, zone);
    if (!r) return null;
    return `${new Intl.DateTimeFormat('id-ID', { timeZone: r.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(r.date)} ${r.label}`;
  },
  parts(value?: string | null, zone?: string | null) {
    const r = referenceResolve(value, zone);
    if (!r) return null;
    const parts = (options: Intl.DateTimeFormatOptions) =>
      Object.fromEntries(new Intl.DateTimeFormat('id-ID', { timeZone: r.timeZone, ...options }).formatToParts(r.date).map((p) => [p.type, p.value]));
    const long = parts({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { weekday: long.weekday, day: long.day, month: long.month, monthShort: parts({ month: 'short' }).month.replace('.', ''), year: long.year };
  },
};

const VALUES = [
  '2026-11-21T08:00:00+07:00', '2026-11-21T23:30:00+08:00', '2026-12-31T23:59:00+09:00', '2027-01-01T00:15:00+07:00',
  '2026-11-21T01:00:00Z', '2026-11-20T17:30:00.000Z', '2026-11-21T08:00:00+05:30', '2026-11-21T08:00:00-04:00',
  '2026-02-29T08:00:00+07:00', 'not a date', '', null, undefined,
];
const FALLBACKS = [undefined, null, 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Europe/Berlin'];

test('s21: shared formatters give exactly the pre-s21 output for every zone rule, interleaved across zones', () => {
  for (let pass = 0; pass < 2; pass++) {
    for (const value of VALUES) {
      for (const zone of FALLBACKS) {
        const label = `${String(value)} / ${String(zone)} / pass ${pass}`;
        assert.equal(formatEventDate(value, zone), reference.date(value, zone), label);
        assert.equal(formatEventTime(value, zone), reference.time(value, zone), label);
        assert.deepEqual(eventDateParts(value, zone), reference.parts(value, zone), label);
      }
    }
  }
});

test('s21: plain calendar dates keep the pre-s21 output', () => {
  for (const value of ['2026-10-03', '2024-02-29', '2025-02-29', '2026-13-01', ' 2026-01-09 ', '', undefined]) {
    const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let expected: string | undefined;
    if (match) {
      const [y, m, d] = match.slice(1).map(Number);
      const at = new Date(Date.UTC(y, m - 1, d));
      if (at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d) {
        expected = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
      }
    }
    assert.equal(formatPlainDate(value), expected, String(value));
  }
});
