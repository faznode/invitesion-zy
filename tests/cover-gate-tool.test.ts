// B-009: the pure parts of the cover-gate acceptance tool and the fixture's music variants. The browser run itself is a
// product gate (`scripts/ci/product-gates.sh`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gateVerdict, MUSIC_CONTROL, OPEN_LIMIT_MS, toneWav } from '../tools/template-harness/cover-gate';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

// The seeder builds its Drizzle client at import time; postgres.js connects lazily and this test never queries, so an
// unreachable placeholder stands in (as in tests/support/render-guest-page.ts) and the module is required afterwards.
process.env.POSTGRES_URL ??= 'postgres://render-test:unused@127.0.0.1:1/unused';
const { familyReviewInvitations } = require('../invitation-research/_tools/setup/seed-family-review') as typeof import('../invitation-research/_tools/setup/seed-family-review');

test('the fixture tone is a valid 16-bit mono PCM WAV that starts and ends silent', () => {
  const wav = toneWav(1, 8000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1, 'PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 8000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 8000 * 2);
  assert.equal(wav.length, 44 + 8000 * 2);
  assert.equal(wav.readInt16LE(44), 0, 'fades in from silence');
  assert.equal(wav.readInt16LE(wav.length - 2), 0, 'fades out to silence');
  const peak = Math.max(...Array.from({ length: 8000 }, (_, i) => Math.abs(wav.readInt16LE(44 + i * 2))));
  assert.ok(peak > 5000 && peak <= Math.round(0.2 * 32767), `soft but audible (${peak})`);
});

test('a page passes only when every check passed, and I-15 limits the opening to 1.5 s', () => {
  assert.equal(OPEN_LIMIT_MS, 1500);
  assert.equal(gateVerdict([]), 'FAIL', 'a page with no checks proves nothing');
  assert.equal(gateVerdict([{ name: 'a', pass: true }, { name: 'b', pass: true }]), 'PASS');
  assert.equal(gateVerdict([{ name: 'a', pass: true }, { name: 'b', pass: false }]), 'FAIL');
});

test("the gate addresses the music control as the toggle after the island's <audio>, never G-036's reading switch (s52 R-H16)", () => {
  assert.equal(MUSIC_CONTROL, 'audio ~ button[aria-pressed]');
  assert.doesNotMatch(read('tools/template-harness/cover-gate.ts'), /['"]button\[aria-pressed\]['"]/, 'every lookup of the control goes through MUSIC_CONTROL');
  const island = read('components/invitation/cover-audio.tsx');
  const audioAt = island.indexOf('<audio ref=');
  const pressedAt = island.indexOf('aria-pressed={playing}');
  assert.ok(audioAt > 0 && pressedAt > audioAt, 'the island renders its audio element before the music control');
  const between = island.slice(audioAt, pressedAt);
  assert.equal(between.match(/<button\b/g)?.length, 1, 'one button between them: the music control');
  assert.doesNotMatch(between, /<\/?(?:div|span|main|section)\b/, 'nothing wraps the control, so it stays a later sibling of <audio>');
  const reading = read('components/invitation/reading-toggle.tsx');
  assert.ok(reading.indexOf('data-reading-toggle') >= 0 && reading.indexOf('data-reading-toggle') < reading.indexOf('aria-pressed={on}'), 'the reading switch sits in its own row inside the layout');
  assert.doesNotMatch(reading, /<audio\b/);
});

test('`--music-url` adds a play-on-open and a manual music page to every layout, and nothing without it', () => {
  const without = familyReviewInvitations();
  assert.equal(without.filter((row) => row.slug.includes('-music')).length, 0);
  const url = 'http://127.0.0.1:3100/review/tone.wav';
  const rows = familyReviewInvitations({ musicUrl: url }).filter((row) => row.slug.includes('-music'));
  assert.deepEqual(
    rows.map((row) => row.slug).sort(),
    ['legacy', 'gapura', 'kartu', 'riang', 'lontar'].flatMap((layout) => [`review-${layout}-music`, `review-${layout}-music-manual`]).sort(),
  );
  for (const row of rows) {
    assert.equal(row.config.music?.enabled, true);
    assert.equal(row.config.music?.assetUrl, url);
    assert.equal(row.config.music?.autoplay, row.slug.endsWith('-manual') ? false : undefined, row.slug);
  }
});
