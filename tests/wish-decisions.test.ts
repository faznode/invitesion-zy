// R-04 (D-044): the wish decisions as shared vectors (`contracts/vectors/wish-decisions.json`), run here against the
// TypeScript writer: the lenient read of the stored config, then `decideGuestWish`, `decideHostReply`, `wishState` and
// `moderationUpdate`. `services/api/tests/wish_vectors.rs` runs the same file against the Rust wishes module, so the two
// writers agree on every case before `BACKEND_WISHES` may select Rust.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import { decideGuestWish, decideHostReply, guestbookRules, moderationUpdate, wishState } from '../lib/invitation/wish-decision';

type Json = unknown;
type Text = string | { prefix?: string; repeat: string; times: number; suffix?: string };
type Vectors = {
  configs: Record<string, Json>;
  read: { name: string; config?: string; raw?: Json; expect: Json }[];
  guest: { name: string; config: string; message: Text; expect: Record<string, Json> }[];
  reply: { name: string; reply: Text; expect: Record<string, Json> }[];
  state: { name: string; isHidden: boolean; reviewed: boolean; expect: string }[];
  moderate: { name: string; action: 'show' | 'hide'; expect: { isHidden: boolean; reviewed: boolean } }[];
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/wish-decisions.json'), 'utf8')) as Vectors;
const text = (value: Text): string => (typeof value === 'string' ? value : `${value.prefix ?? ''}${value.repeat.repeat(value.times)}${value.suffix ?? ''}`);
/** Expands every text in an expected value or a stored config, so long strings stay readable in the file. */
function expand(value: Json): Json {
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object') {
    if ('repeat' in value && 'times' in value) return text(value as Text);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]));
  }
  return value;
}
const configOf = (entry: { config?: string; raw?: Json }) => expand(entry.raw !== undefined ? entry.raw : vectors.configs[entry.config ?? '']);
const read = (raw: Json) => normalizeStoredConfig((raw ?? {}) as Record<string, unknown>).config;

test('the vector file covers every rule', () => {
  assert.ok(vectors.read.length >= 15 && vectors.guest.length >= 20 && vectors.reply.length >= 8);
  assert.equal(vectors.state.length, 4);
  for (const entry of [...vectors.read, ...vectors.guest]) {
    if ('config' in entry && entry.config !== undefined) assert.ok(entry.config in vectors.configs, `${entry.name}: unknown config ${entry.config}`);
  }
});

test('read: the guestbook section after the lenient read', () => {
  for (const entry of vectors.read) assert.deepEqual(guestbookRules(read(configOf(entry))), entry.expect, entry.name);
});

test('guest: decideGuestWish on the stored config', () => {
  for (const entry of vectors.guest) {
    assert.deepEqual(decideGuestWish({ config: read(configOf(entry)), message: text(entry.message) }), expand(entry.expect), entry.name);
  }
});

test('reply: decideHostReply', () => {
  for (const entry of vectors.reply) assert.deepEqual(decideHostReply(text(entry.reply)), expand(entry.expect), entry.name);
});

test('state and moderation', () => {
  for (const entry of vectors.state) {
    assert.equal(wishState({ isHidden: entry.isHidden, reviewedAt: entry.reviewed ? new Date(0) : null }), entry.expect, entry.name);
  }
  const now = new Date('2026-11-06T21:00:00Z');
  for (const entry of vectors.moderate) {
    const update = moderationUpdate(entry.action, now);
    assert.deepEqual({ isHidden: update.isHidden, reviewed: update.reviewedAt === now }, entry.expect, entry.name);
  }
});
