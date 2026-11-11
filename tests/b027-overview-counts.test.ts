// E-033 (s18): the host's dashboards read one RSVP summary instead of counting "hadir" rows on their own, so the
// overview shows every answer, "maybe" apart (B-027), and the people the "hadir" answers bring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { rsvpSummary } from '../lib/invitation/rsvp-rules';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const row = (rsvpStatus: string, attendingCount: number | null = null) => ({ rsvpStatus, attendingCount });

test('E-033: the summary counts every answer, "maybe" apart, and the people "hadir" answers bring', () => {
  const summary = rsvpSummary([
    row('CONFIRMED', 3),
    row('CONFIRMED', 1),
    row('CONFIRMED', null),
    row('MAYBE', null),
    row('DECLINED', 0),
    row('PENDING'),
    row('PENDING'),
    row('LEGACY_UNKNOWN', 4),
  ]);
  assert.deepEqual(summary.counts, { PENDING: 2, CONFIRMED: 3, DECLINED: 1, MAYBE: 1 });
  assert.equal(summary.total, 8, 'every guest row, including a status no rule knows');
  assert.equal(summary.seats, 4, 'only CONFIRMED rows add people');
  assert.equal(summary.seatsUnknown, 1, 'a "hadir" without a count (before B-007) is reported, not guessed');
});

test('E-033: "maybe", a decline and an empty list add no people', () => {
  assert.deepEqual(rsvpSummary([]), { total: 0, counts: { PENDING: 0, CONFIRMED: 0, DECLINED: 0, MAYBE: 0 }, seats: 0, seatsUnknown: 0 });
  const tentative = rsvpSummary([row('MAYBE', 2), row('DECLINED', 2)]);
  assert.equal(tentative.seats, 0);
  assert.equal(tentative.seatsUnknown, 0);
});

test('E-033 wiring: the overview and the guest page read the shared summary and show each answer', () => {
  for (const path of ['app/(customer)/dashboard/page.tsx', 'app/(customer)/dashboard/guests/page.tsx']) {
    const page = source(path);
    assert.match(page, /rsvpSummary\(/, `${path}: uses the shared summary`);
    assert.doesNotMatch(page, /rsvpStatus === 'CONFIRMED'\)\.length/, `${path}: no page-local "hadir" count left`);
    for (const label of ['Hadir', 'Mungkin', 'Belum menjawab']) assert.ok(page.includes(`'${label}'`), `${path}: ${label}`);
    assert.match(page, /seatsUnknown/, `${path}: a "hadir" without a count is disclosed`);
  }
  assert.ok(source('app/(customer)/dashboard/page.tsx').includes("'Tidak hadir'"), 'overview: declines shown');
});
