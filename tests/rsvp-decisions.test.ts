// R-03: the whole RSVP decision as shared vectors (`contracts/vectors/rsvp-decisions.json`), run here against the
// TypeScript that writes today: the lenient read of the stored config, then `decideGuestRsvp` / `decideHostRsvp`.
// `services/api/tests/rsvp_vectors.rs` runs the same file against the Rust RSVP module, so the two writers agree on every
// case before `BACKEND_RSVP` may select Rust.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { decideGuestRsvp, decideHostRsvp, rsvpSubmissionFromForm, type RsvpFlags, type RsvpSubmission } from '../lib/invitation/rsvp-decision';

type Json = unknown;
type Vectors = {
  defaults: { now: string; flags: RsvpFlags; guest: Record<string, Json>; hostGuest: Record<string, Json> };
  configs: Record<string, Json>;
  read: { name: string; config: Json; expect: Json }[];
  guest: { name: string; config: string; now?: string; flags?: Partial<RsvpFlags>; guest?: Record<string, Json>; submission: RsvpSubmission; expect: Json }[];
  host: { name: string; config: string; flags?: Partial<RsvpFlags>; guest?: Record<string, Json>; status: string; eventId?: string; expect: Json }[];
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/rsvp-decisions.json'), 'utf8')) as Vectors;
const read = (raw: Json): DetailConfig => normalizeStoredConfig(raw ?? {}).config;

/** What the RSVP rules use from a normalised config; the Rust read projects to the same shape. */
function project(config: DetailConfig) {
  const form = config.registrationForm;
  return {
    rsvp: config.rsvp ? { enabled: config.rsvp.enabled, deadline: config.rsvp.deadline ?? null, perEvent: config.rsvp.perEvent ?? null } : null,
    events: config.events ? config.events.map((event) => ({ id: event.id ?? null, inviteOnly: event.inviteOnly ?? null })) : null,
    form: form
      ? {
          enabled: form.enabled,
          questions: (form.customQuestions ?? []).map((question) => ({
            id: question.id,
            type: question.type,
            required: question.required,
            options: question.options ?? null,
            conditional: question.conditional
              ? { questionId: question.conditional.questionId, equals: question.conditional.equals ?? null, in: question.conditional.in ?? null }
              : null,
          })),
        }
      : null,
  };
}

test('R-03 vectors: the lenient read of the sections RSVP uses', () => {
  assert.ok(vectors.read.length >= 40);
  for (const c of vectors.read) assert.deepEqual(project(read(c.config)), c.expect, c.name);
});

test('R-03 vectors: guest decisions, from the stored config through the lenient read', () => {
  assert.ok(vectors.guest.length >= 50);
  const kinds = new Set<string>();
  for (const c of vectors.guest) {
    const decision = decideGuestRsvp({
      config: read(vectors.configs[c.config]),
      guest: { ...vectors.defaults.guest, ...c.guest } as never,
      submission: c.submission,
      flags: { ...vectors.defaults.flags, ...c.flags },
      now: Date.parse(c.now ?? vectors.defaults.now),
    });
    kinds.add(decision.kind);
    assert.deepEqual(decision, c.expect, c.name);
  }
  assert.deepEqual([...kinds].sort(), ['answers', 'closed', 'events', 'invalid', 'write'], 'every outcome is covered');
});

test('R-03 vectors: host overrides', () => {
  assert.ok(vectors.host.length >= 15);
  for (const c of vectors.host) {
    const update = decideHostRsvp({
      config: read(vectors.configs[c.config]),
      guest: { ...vectors.defaults.hostGuest, ...c.guest } as never,
      status: c.status,
      eventId: c.eventId,
      flags: { ...vectors.defaults.flags, ...c.flags },
    });
    assert.deepEqual(update, c.expect, c.name);
  }
});

test('R-03: the form becomes a submission with FormData semantics and own properties only', () => {
  const form = new FormData();
  form.append('slug', 'budi-sari');
  form.append('status', 'CONFIRMED');
  form.append('status', 'DECLINED');
  form.append('guestCount', '3');
  form.append('ev:akad', 'MAYBE');
  form.append('evn:resepsi', '2');
  form.append('q:songs', 'A');
  form.append('q:songs', 'B');
  form.append('q:file', new Blob(['x']), 'x.txt');
  form.append('ev:__proto__', 'CONFIRMED');
  form.append('q:constructor', 'x');
  const submission = rsvpSubmissionFromForm(form);
  assert.equal(submission.status, 'CONFIRMED', 'get() reads the first value');
  assert.equal(submission.guestCount, '3');
  assert.deepEqual(submission.events.akad, { status: 'MAYBE', guestCount: null });
  assert.deepEqual(submission.events.resepsi, { status: '', guestCount: '2' });
  assert.deepEqual(submission.answers.songs, ['A', 'B'], 'getAll() keeps every value in order');
  assert.deepEqual(submission.answers.file, [''], 'a file in a text field reads as an empty string');
  assert.ok(Object.hasOwn(submission.events, '__proto__') && Object.hasOwn(submission.answers, 'constructor'));
  assert.equal(({} as Record<string, unknown>).status, undefined, 'nothing reached Object.prototype');
  assert.deepEqual(rsvpSubmissionFromForm(new FormData()), { status: '', guestCount: null, events: {}, answers: {} });
});
