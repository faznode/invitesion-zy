// B-027 slice 2c (D-036): an answer per event, keyed by the durable event id. The form, the action's rules, the export and
// the host's summary agree; a reorder, a rename, a deleted or added event and a stale form never move an answer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { guestExportCsv } from '../lib/invitation/guest-export';
import {
  eventRsvpSummary,
  exportedEvents,
  mergeEventAnswers,
  overallFromEvents,
  parseEventAnswers,
  perEventRsvpEvents,
  readEventAnswers,
  type AskedEvent,
} from '../lib/invitation/rsvp-events';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const akad = { title: 'Akad Nikah', startAt: '2026-08-01T08:00:00+07:00', venueName: 'Masjid Contoh' };
const resepsi = { title: 'Resepsi', startAt: '2026-08-01T11:00:00+07:00', venueName: 'Gedung Contoh' };
const keyed = (config: Record<string, unknown>): DetailConfig => normalizeStoredConfig(config).config;
const config = keyed({ events: [akad, resepsi], rsvp: { enabled: true, perEvent: true } });
const events = perEventRsvpEvents({ perEvent: true, events: config.events }, true);
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
};
const inputs = (html: string, name: string) => [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => tag.includes(` name="${name}"`));
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('per-event answers are asked only with the flag, the host switch and at least two events', () => {
  assert.deepEqual(events.map((event) => event.id), ['ev-1', 'ev-2']);
  assert.deepEqual(perEventRsvpEvents({ perEvent: true, events: config.events }, false), [], 'flag off');
  assert.deepEqual(perEventRsvpEvents({ perEvent: false, events: config.events }, true), [], 'switch off');
  assert.deepEqual(perEventRsvpEvents({ perEvent: true, events: config.events?.slice(0, 1) }, true), [], 'one event');
});

test('one answer per event, clamped like the single answer; the overall answer follows from them', () => {
  const parsed = parseEventAnswers(form({ 'ev:ev-1': 'DECLINED', 'evn:ev-1': '3', 'ev:ev-2': 'CONFIRMED', 'evn:ev-2': '9' }), events, 4, { maybe: true });
  assert.deepEqual(parsed, {
    ok: true,
    answers: { 'ev-1': { status: 'DECLINED', attending: 0 }, 'ev-2': { status: 'CONFIRMED', attending: 4 } },
    status: 'CONFIRMED',
    attendingCount: 4,
  });
  const maybe = parseEventAnswers(form({ 'ev:ev-1': 'MAYBE', 'ev:ev-2': 'DECLINED' }), events, 2, { maybe: true });
  assert.ok(maybe.ok && maybe.status === 'MAYBE' && maybe.attendingCount === null && maybe.answers['ev-1'].attending === null);
  assert.deepEqual(parseEventAnswers(form({ 'ev:ev-1': 'MAYBE', 'ev:ev-2': 'DECLINED' }), events, 2, { maybe: false }), { ok: false, eventId: 'ev-1' }, 'maybe follows its flag');
  assert.deepEqual(overallFromEvents([{ status: 'CONFIRMED', attending: 1 }, { status: 'CONFIRMED', attending: 3 }]), { status: 'CONFIRMED', attendingCount: 3 });
  assert.deepEqual(overallFromEvents([{ status: 'DECLINED', attending: 0 }, { status: 'DECLINED', attending: 0 }]), { status: 'DECLINED', attendingCount: 0 });
});

test('stale forms: a missing event is refused by name; deleted events and other invitations\u2019 ids are ignored', () => {
  // The host added "Ngunduh Mantu" after the page was rendered: the old form cannot answer it.
  const added = keyed({ events: [akad, resepsi, { title: 'Ngunduh Mantu', startAt: '2026-08-08T10:00:00+07:00' }], rsvp: { perEvent: true } });
  const addedEvents = perEventRsvpEvents({ perEvent: true, events: added.events }, true);
  assert.deepEqual(parseEventAnswers(form({ 'ev:ev-1': 'CONFIRMED', 'ev:ev-2': 'CONFIRMED' }), addedEvents, 2, { maybe: true }), { ok: false, eventId: 'ev-3' });
  // A single-answer form (rendered before the switch) carries no event answers at all.
  assert.deepEqual(parseEventAnswers(form({ status: 'CONFIRMED', guestCount: '2' }), events, 2, { maybe: true }), { ok: false, eventId: 'ev-1' });
  // ev-9 was deleted, ev-k is another invitation's event: neither is read.
  const extra = parseEventAnswers(form({ 'ev:ev-1': 'CONFIRMED', 'ev:ev-2': 'DECLINED', 'ev:ev-9': 'CONFIRMED', 'ev:ev-k': 'CONFIRMED' }), events, 2, { maybe: true });
  assert.ok(extra.ok);
  assert.deepEqual(Object.keys(extra.answers).sort(), ['ev-1', 'ev-2']);
});

test('reordering and renaming events never moves an answer: answers follow ids, not positions', () => {
  const answers = { 'ev-1': { status: 'DECLINED' as const, attending: 0 }, 'ev-2': { status: 'CONFIRMED' as const, attending: 2 } };
  const reordered: AskedEvent[] = [{ ...events[1], title: 'Resepsi (malam)' }, events[0]];
  const parsed = parseEventAnswers(form({ 'ev:ev-2': 'CONFIRMED', 'evn:ev-2': '2', 'ev:ev-1': 'DECLINED' }), reordered, 2, { maybe: true });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.answers, answers);
  const csv = guestExportCsv([fixtureGuest({ rsvpEventAnswers: answers })], [], reordered).split('\n');
  assert.match(csv[0], /,"Resepsi \(malam\) - rsvp_status","Resepsi \(malam\) - attending_count","Akad Nikah - rsvp_status","Akad Nikah - attending_count"$/);
  assert.match(csv[1], /,"CONFIRMED","2","DECLINED","0"$/);
});

test('answers to deleted events stay stored; a malformed entry costs only itself', () => {
  assert.deepEqual(mergeEventAnswers({ 'ev-9': { status: 'CONFIRMED', attending: 1 }, 'ev-1': { status: 'MAYBE', attending: null } }, { 'ev-1': { status: 'DECLINED', attending: 0 } }), {
    'ev-9': { status: 'CONFIRMED', attending: 1 },
    'ev-1': { status: 'DECLINED', attending: 0 },
  });
  assert.deepEqual(readEventAnswers({ 'ev-1': { status: 'CONFIRMED', attending: 2 }, 'ev-2': { status: 'YES', attending: 1 }, 'bad id': { status: 'DECLINED', attending: 0 } }), {
    'ev-1': { status: 'CONFIRMED', attending: 2 },
  });
  for (const raw of [null, 'x', [1], 42]) assert.deepEqual(readEventAnswers(raw), {});
});

test('host summary per event: no answer is "belum menjawab", never a decline; maybe adds no seats', () => {
  const rows = [
    { rsvpEventAnswers: { 'ev-1': { status: 'CONFIRMED', attending: 2 }, 'ev-2': { status: 'MAYBE', attending: null } } },
    { rsvpEventAnswers: { 'ev-1': { status: 'DECLINED', attending: 0 } } },
    { rsvpEventAnswers: null },
  ];
  assert.deepEqual(eventRsvpSummary(rows, events), [
    // D-037 adds who each event is for: every guest while no event is invite-only.
    { id: 'ev-1', title: 'Akad Nikah', counts: { PENDING: 1, CONFIRMED: 1, DECLINED: 1, MAYBE: 0 }, seats: 2, invited: 3, inviteOnly: false },
    { id: 'ev-2', title: 'Resepsi', counts: { PENDING: 2, CONFIRMED: 0, DECLINED: 0, MAYBE: 1 }, seats: 0, invited: 3, inviteOnly: false },
  ]);
});

test('export: every listed event while on; after switching off, only listed events someone answered; text cells neutralised', () => {
  const off = keyed({ events: [akad, resepsi], rsvp: { perEvent: false } });
  assert.deepEqual(exportedEvents(config, []).map((event) => event.id), ['ev-1', 'ev-2']);
  assert.deepEqual(exportedEvents(off, [{ rsvpEventAnswers: { 'ev-2': { status: 'DECLINED', attending: 0 } } }]).map((event) => event.id), ['ev-2']);
  assert.deepEqual(exportedEvents(off, [{ rsvpEventAnswers: { 'ev-9': { status: 'DECLINED', attending: 0 } } }]), [], 'deleted events get no column');
  const hostile = guestExportCsv([fixtureGuest()], [], [{ id: 'ev-1', title: '=HYPERLINK("x")' }, { id: 'ev-2', title: 'حفل الاستقبال' }]).split('\n')[0];
  assert.ok(hostile.includes(`"'=HYPERLINK(""x"") - rsvp_status"`), hostile);
  assert.ok(hostile.includes('حفل الاستقبال - attending_count'), 'RTL titles are kept as written');
});

test('every layout renders one required choice per event, a count per event and one submit; stored answers preselected', () => {
  const guest = fixtureGuest({ rsvpEventAnswers: { 'ev-2': { status: 'CONFIRMED', attending: 2 } } });
  for (const layout of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(config, layout.familyId), guest });
    assert.equal(inputs(html, 'ev:ev-1').length, 3, `${layout.label}: three choices for akad`);
    assert.ok(inputs(html, 'ev:ev-1').every((tag) => /\brequired=""/.test(tag)), `${layout.label}: each choice is required`);
    assert.ok(inputs(html, 'ev:ev-2').some((tag) => /value="CONFIRMED"/.test(tag) && /\bchecked=""/.test(tag)), `${layout.label}: stored answer`);
    assert.equal(inputs(html, 'evn:ev-2').length, 1);
    assert.match(inputs(html, 'evn:ev-2')[0], /value="2"/);
    assert.equal(inputs(html, 'guestCount').length, 0, `${layout.label}: no single headcount`);
    assert.match(html, /Kirim konfirmasi/);
    assert.doesNotMatch(html, /Ya, saya hadir/);
    assert.match(html, /<legend[^>]*><span dir="auto"[^>]*>Akad Nikah<\/span><\/legend>/);
  }
  const refused = renderGuestPage({ config, guest, status: { rsvp: 'events', rsvpe: 'ev-2' } });
  assert.match(refused, /Mohon pilih jawaban untuk “<bdi>Resepsi<\/bdi>”/);
  assert.match(refused, /id="rsvp-ev-ev-2-error"/);
});

test('without per-event answers the form is exactly the single answer', () => {
  for (const single of [keyed({ events: [akad, resepsi] }), keyed({ events: [akad], rsvp: { perEvent: true } })]) {
    const html = renderGuestPage({ config: single, guest: fixtureGuest() });
    assert.equal(inputs(html, 'guestCount').length, 1);
    assert.doesNotMatch(html, /name="ev:/);
    assert.match(html, /Ya, saya hadir/);
  }
});

test('the action writes per-event answers in the same UPDATE as the status, scoped to the guest, and keeps them out of analytics', () => {
  const action = source('app/i/[slug]/actions.ts');
  // R-03: the rules live in the shared decision (run as vectors in both languages); the action keeps the one write.
  const decision = source('lib/invitation/rsvp-decision.ts');
  assert.match(decision, /parseEventAnswers\(form, events, guest\.guestCount, \{ maybe \}\)/);
  assert.match(decision, /if \(!parsed\.ok\) return \{ kind: 'events', eventId: parsed\.eventId \};/);
  assert.match(action, /rsvp=events&rsvpe=\$\{encodeURIComponent\(refusal\.eventId\)\}/);
  // D-037 reads the stored answers once for both paths; the merge is unchanged.
  assert.match(decision, /const storedEventAnswers = readEventAnswers\(guest\.rsvpEventAnswers\);/);
  assert.match(decision, /mergeEventAnswers\(storedEventAnswers, parsed\.answers\)/);
  // D-037 moved the rule into `singleAnswerEventAnswers` (flag off: untouched; per-event off: null), unit-tested in tests/d037-*.
  assert.match(decision, /rsvpEventAnswers = singleAnswerEventAnswers\(\{ flagOn: perEventOn, listed,/, 'a single answer replaces per-event answers only while the flag is on');
  assert.match(action, /\.\.\.\(rsvpEventAnswers !== undefined && \{ rsvpEventAnswers \}\) \}\)\.where\(eq\(guests\.id, context\.guest\.id\)\);/);
  assert.equal((action.match(/db\.update\(guests\)/g) ?? []).length, 1, 'one statement');
  assert.match(action, /meta: \{ status, guestCount: attendingCount, source: 'public' \}/, 'analytics carries no answers');
  assert.match(source('lib/db/migrations/0014_guest_rsvp_event_answers.sql'), /ALTER TABLE "guests" ADD COLUMN "rsvp_event_answers" jsonb;/);
});
