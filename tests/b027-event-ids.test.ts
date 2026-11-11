// B-027 slice 2c, step 1 (D-036): durable event ids. Readers, the write path and migration 0013 derive the same ids; an
// id travels with its event through edits and reordering; a new event never inherits a position id.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { calendarEventsFromConfig, calendarUid } from '../lib/invitation/calendar';
import { CONTENT_SCHEMA_VERSION } from '../lib/invitation/content-contract';
import { normalizeStoredConfig, prepareConfigWrite } from '../lib/invitation/content-read';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { eventsWithIds, keyEventsForWrite, keyStoredEvents, legacyEventPosition, newEventId, rekeyRestoredEvents } from '../lib/invitation/event-ids';

const FRESH = /^ev-[a-z][a-z0-9]{9}$/;
const akad = { title: 'Akad Nikah', startAt: '2026-08-01T08:00:00+07:00', venueName: 'Masjid Contoh' };
const resepsi = { title: 'Resepsi', startAt: '2026-08-01T11:00:00+07:00', venueName: 'Gedung Contoh' };
const ids = (events: readonly { id?: string }[] | undefined) => (events ?? []).map((event) => event.id);

test('stored events without ids read as ev-<position>, the same ids on every read', () => {
  const stored = { events: [akad, resepsi] };
  const first = normalizeStoredConfig(stored);
  assert.deepEqual(ids(first.config.events), ['ev-1', 'ev-2']);
  assert.deepEqual(ids(normalizeStoredConfig(JSON.parse(JSON.stringify(stored))).config.events), ['ev-1', 'ev-2']);
  assert.equal(first.config.events?.[1]?.title, 'Resepsi', 'content is untouched');
  assert.deepEqual(first.dropped, []);
});

test('a usable id is kept; a repeated, malformed or missing one is minted by position, avoiding taken ids', () => {
  assert.deepEqual(ids(keyStoredEvents([{ ...akad, id: 'ev-k2' }, resepsi]) as { id?: string }[]), ['ev-k2', 'ev-2']);
  assert.deepEqual(ids(keyStoredEvents([{ ...akad, id: 'x' }, { ...resepsi, id: 'x' }]) as { id?: string }[]), ['x', 'ev-2']);
  assert.deepEqual(ids(keyStoredEvents([{ ...akad, id: 'has space' }, { ...resepsi, id: 7 }]) as { id?: string }[]), ['ev-1', 'ev-2']);
  // ev-2 is held by the first event, so the id-less second event takes the next free suffix.
  assert.deepEqual(ids(keyStoredEvents([{ ...akad, id: 'ev-2' }, resepsi, { title: 'Ngunduh', id: 'ev-2-2' }]) as { id?: string }[]), ['ev-2', 'ev-2-3', 'ev-2-2']);
  // Not an array of objects: returned as is, and the schema judges the section exactly as before.
  for (const raw of [undefined, 'x', [akad, 'y'], { 0: akad }]) assert.equal(keyStoredEvents(raw), raw);
  const legacyBroken = normalizeStoredConfig({ events: [{ title: 'Akad', startAt: 'not-a-date' }] });
  assert.deepEqual(legacyBroken.dropped, ['events']);
});

test('reordering keyed events moves each id with its event', () => {
  const keyed = normalizeStoredConfig({ events: [akad, resepsi] }).config.events ?? [];
  const reordered = normalizeStoredConfig({ events: [keyed[1], keyed[0]] }).config.events ?? [];
  assert.deepEqual(reordered.map((event) => [event.id, event.title]), [['ev-2', 'Resepsi'], ['ev-1', 'Akad Nikah']]);
});

test('the write path persists the ids readers saw and gives new events fresh ids', () => {
  const stored = { settings: { title: 'Budi & Sari' }, events: [akad, resepsi] };
  // A save of another section carries the events with the ids guests already answered under.
  const other = prepareConfigWrite(stored, { settings: { title: 'Budi & Sari 2' } });
  assert.deepEqual(ids(other.events), ['ev-1', 'ev-2']);
  assert.equal(other.schemaVersion, CONTENT_SCHEMA_VERSION);
  // The editor sends the ids back, reordered, plus one new event without an id.
  const read = normalizeStoredConfig(stored).config.events ?? [];
  const saved = prepareConfigWrite(stored, { events: [read[1], read[0], { title: 'Ngunduh Mantu' }] });
  assert.deepEqual(ids(saved.events).slice(0, 2), ['ev-2', 'ev-1']);
  assert.match(saved.events?.[2]?.id ?? '', FRESH);
  // Deleting ev-2 and adding an event never hands the new one ev-2.
  const afterDelete = prepareConfigWrite(saved as Record<string, unknown>, { events: [saved.events![1], { title: 'Acara baru' }] });
  assert.deepEqual(ids(afterDelete.events)[0], 'ev-1');
  assert.notEqual(afterDelete.events?.[1]?.id, 'ev-2');
  assert.match(afterDelete.events?.[1]?.id ?? '', FRESH);
});

test('fresh ids are random, unique and can never take the legacy ev-<n> form', () => {
  const seen = new Set(Array.from({ length: 500 }, () => newEventId()));
  assert.equal(seen.size, 500);
  for (const id of seen) assert.match(id, FRESH);
  assert.equal(newEventId(() => new Uint8Array(10).fill(27)), 'ev-b111111111', 'the first character is always a letter');
  assert.equal(legacyEventPosition('ev-3'), 3);
  for (const id of ['ev-0', 'ev-03', 'ev-k2', 'ev-2-2', undefined]) assert.equal(legacyEventPosition(id), null);
  let n = 0;
  const repeated = keyEventsForWrite([{ title: 'A' }, { title: 'B' }], () => (n++ < 2 ? 'ev-same' : `ev-x${n}`));
  assert.equal(new Set(ids(repeated)).size, 2, 'a collision with an id minted earlier is re-drawn');
});

test('the strict schema refuses duplicate event ids and still accepts events without one', () => {
  assert.equal(detailConfigSchema.safeParse({ events: [{ ...akad, id: 'ev-1' }, { ...resepsi, id: 'ev-1' }] }).success, false);
  assert.equal(detailConfigSchema.safeParse({ events: [{ ...akad, id: 'ev-1' }, resepsi] }).success, true);
  assert.equal(detailConfigSchema.safeParse({ events: [{ ...akad, id: 'bad id' }] }).success, false);
});

test('restore contract: kept ids reattach, pre-0013 events match the live event or get a fresh id, never a position', () => {
  const live = [{ ...resepsi, id: 'ev-1' }, { ...akad, id: 'ev-2' }];
  const keptIds = rekeyRestoredEvents([{ ...akad, id: 'ev-2' }], live);
  assert.deepEqual(ids(keptIds), ['ev-2']);
  // A version saved before ids existed listed akad first; position would wrongly give it ev-1 (now resepsi's id).
  const legacy = rekeyRestoredEvents([akad, { title: 'Pengajian', startAt: '2026-07-31T19:00:00+07:00' }], live);
  assert.equal(legacy[0].id, 'ev-2');
  assert.match(legacy[1].id, FRESH);
});

test('calendar UIDs follow the event id; legacy ids keep the index UID entries were saved with', () => {
  assert.equal(calendarUid('budi-sari', 'ev-1', 5), 'budi-sari.0@invitesion');
  assert.equal(calendarUid('budi-sari', 'ev-k2m4p6r8t0', 0), 'budi-sari.ev-k2m4p6r8t0@invitesion');
  assert.equal(calendarUid('budi-sari', undefined, 3), 'budi-sari.3@invitesion');
  const events = normalizeStoredConfig({ events: [akad, resepsi] }).config.events ?? [];
  const before = calendarEventsFromConfig({ slug: 'budi-sari', displayName: 'Budi & Sari', events });
  const after = calendarEventsFromConfig({ slug: 'budi-sari', displayName: 'Budi & Sari', events: [events[1], events[0]] });
  assert.deepEqual(before.map((event) => event.uid), ['budi-sari.0@invitesion', 'budi-sari.1@invitesion'], 'unchanged for unmoved legacy events');
  assert.equal(after.find((event) => event.title.startsWith('Akad'))?.uid, 'budi-sari.0@invitesion', 'a reorder keeps the UID');
});

test('eventsWithIds narrows a normalised list without losing events', () => {
  const events = normalizeStoredConfig({ events: [akad, resepsi] }).config.events;
  assert.equal(eventsWithIds(events).length, 2);
});

test('the editor mints an id for an added event, keys rows by id and moves events instead of renumbering them', () => {
  const editor = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/invitations/[id]/edit/editor.tsx'), 'utf8');
  assert.match(editor, /\{id:newEventId\(\),title:'Acara baru'\}/);
  assert.match(editor, /key=\{e\.id \?\? i\}/);
  assert.match(editor, /const move=\(i:number,d:number\)=>/);
});

test('migration 0013 mints exactly the read rule for the configs it rewrites and leaves tie-breaks to the read path', () => {
  const sql = readFileSync(join(process.cwd(), 'lib/db/migrations/0013_event_ids.sql'), 'utf8');
  assert.match(sql, /jsonb_build_object\('id', 'ev-' \|\| e\."ord"\)/);
  assert.match(sql, /HAVING count\(\*\) > 1/);
  assert.match(sql, /jsonb_build_object\('schemaVersion', 2\)/);
  assert.doesNotMatch(sql, /invitation_versions/, 'saved versions are history and are not rewritten');
});
