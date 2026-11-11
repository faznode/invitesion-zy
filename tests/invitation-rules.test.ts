import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVE_PERIOD_MONTHS, addMonths, hasHonouree, publishBlockers } from '../lib/invitation/publish-rules';
import { resolveUniqueSlug, slugify } from '../lib/invitation/slug';
import { assertSafeKey, InvalidKeyError } from '../lib/storage/driver';

// ── Active period ────────────────────────────────────────────

test('the active window is 12 months, per locked decision #5', () => {
  assert.equal(ACTIVE_PERIOD_MONTHS, 12);
  const published = new Date('2026-07-27T10:00:00Z');
  const expires = addMonths(published, ACTIVE_PERIOD_MONTHS);
  assert.equal(expires.toISOString(), new Date('2027-07-27T10:00:00Z').toISOString());
});

test('adding months clamps instead of rolling into the next month', () => {
  // 31 August + 6 months is February, which has no 31st. Rolling over would
  // land in March and hand the customer days they did not buy.
  const clamped = addMonths(new Date('2026-08-31T00:00:00Z'), 6);
  assert.equal(clamped.getMonth(), 1, 'should still be February');
  assert.equal(clamped.getDate(), 28);
});

test('a leap day publish does not roll past February', () => {
  const expires = addMonths(new Date('2028-02-29T00:00:00Z'), 12);
  assert.equal(expires.getFullYear(), 2029);
  assert.equal(expires.getMonth(), 1);
  assert.equal(expires.getDate(), 28);
});

// ── Publish gate ─────────────────────────────────────────────

const weddingReady = {
  couple: { bride: { fullName: 'Siti' }, groom: { fullName: 'Ahmad' } },
  events: [{ title: 'Akad', startAt: '2026-09-12T09:00:00+07:00' }],
};

test('a complete wedding has no blockers', () => {
  assert.deepEqual(publishBlockers('wedding', weddingReady), []);
});

test('an empty config is blocked on both name and schedule', () => {
  const reasons = publishBlockers('wedding', {});
  assert.equal(reasons.length, 2);
  assert.match(reasons[0], /Nama/);
  assert.match(reasons[1], /jadwal/);
});

test('a wedding with only one name is still blocked', () => {
  const reasons = publishBlockers('wedding', {
    ...weddingReady,
    couple: { bride: { fullName: 'Siti' } },
  });
  assert.match(reasons.join(' '), /Nama/);
});

test('an event without a start time is blocked', () => {
  const reasons = publishBlockers('wedding', {
    ...weddingReady,
    events: [{ title: 'Akad' }],
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /waktu mulai/);
});

test('an invalid config is reported as invalid, not as missing fields', () => {
  // `.strict()` on the schema rejects unknown keys, so this must not be read as
  // "you forgot a name" — the customer would have no idea what to fix.
  const reasons = publishBlockers('wedding', { unknownKey: true });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /tidak valid/);
});

test('each event type reads its own honouree fields', () => {
  assert.equal(hasHonouree('birthday', { birthdayPerson: { fullName: 'Dina' } }), true);
  assert.equal(hasHonouree('birthday', { couple: { bride: { fullName: 'Siti' } } }), false);
  assert.equal(hasHonouree('corporate', { corporateProfile: { organizationName: 'PT Maju' } }), true);
  assert.equal(hasHonouree('aqiqah', { ceremonyProfile: { honoureeName: 'Bayi' } }), true);
  assert.equal(hasHonouree('tasyakuran', { ceremonyProfile: { thanksgivingTitle: 'Syukuran' } }), true);
  assert.equal(hasHonouree('khitanan', {}), false);
});

// ── Slugs ────────────────────────────────────────────────────

test('slugify produces the plain-name form the guest URL contract requires', () => {
  assert.equal(slugify('Budi Santoso', 'guest'), 'budi-santoso');
  assert.equal(slugify('  Ahmad   Fauzi  ', 'guest'), 'ahmad-fauzi');
  assert.equal(slugify('Café Niño', 'guest'), 'cafe-nino', 'accents are folded, not dropped');
  assert.equal(slugify('!!!', 'fallback'), 'fallback', 'an unusable name falls back');
  assert.equal(slugify('', 'fallback'), 'fallback');
});

test('colliding slugs get a numeric suffix rather than overwriting', async () => {
  const taken = new Set(['budi-santoso', 'budi-santoso-2']);
  const resolved = await resolveUniqueSlug('budi-santoso', async (c) => taken.has(c));
  assert.equal(resolved, 'budi-santoso-3');
});

test('a free slug is used as-is', async () => {
  const resolved = await resolveUniqueSlug('siti', async () => false);
  assert.equal(resolved, 'siti');
});

test('exhausting the suffix range still yields a non-colliding slug', async () => {
  const resolved = await resolveUniqueSlug('x', async () => true, 3);
  assert.notEqual(resolved, 'x');
  assert.match(resolved, /^x-/);
});

// ── Storage keys ─────────────────────────────────────────────

test('safe storage keys are accepted', () => {
  assert.equal(assertSafeKey('avatars/12/ab34cd.png'), 'avatars/12/ab34cd.png');
  assert.equal(assertSafeKey('7/deadbeef.webp'), '7/deadbeef.webp');
});

test('traversal and absolute keys are rejected', () => {
  for (const bad of [
    '../etc/passwd',
    'avatars/../../etc/passwd',
    '/etc/passwd',
    'avatars//x.png',
    'avatars/./x.png',
    'avatars\\x.png',
    'avatars/x.png\0',
    '',
    'avatars/x y.png',
  ]) {
    assert.throws(() => assertSafeKey(bad), InvalidKeyError, `should reject ${JSON.stringify(bad)}`);
  }
});

test('an over-long key is rejected', () => {
  assert.throws(() => assertSafeKey('a/'.repeat(300) + 'x.png'), InvalidKeyError);
});
