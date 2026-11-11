// R-03 step 1: the RSVP rules as shared vectors (`contracts/vectors/rsvp-rules.json`), run here against the
// TypeScript rules that write today. The Rust RSVP module must pass the same file before `BACKEND_RSVP` may select it,
// so a rule change starts with the vectors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { guestAudience, visibleEvents } from '../lib/invitation/event-eligibility';
import { isRsvpStatus, requestedHeadcount, rsvpAttendance, rsvpClosedReason, type RsvpStatus } from '../lib/invitation/rsvp-rules';

type Vectors = {
  status: { value: string; maybe: boolean; accepted: boolean }[];
  attendance: { status: RsvpStatus; requestedField: string | null; allowance: number; attending: number | null }[];
  closed: { rsvp: { enabled?: boolean; deadline?: string } | null; now: string; reason: 'disabled' | 'deadline' | null }[];
  eligibility: {
    events: { id?: string; inviteOnly?: unknown }[];
    cases: { guest: { invitedEventIds: unknown } | null; enabled: boolean; visible: number[] }[];
  };
};

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const vectors = JSON.parse(source('contracts/vectors/rsvp-rules.json')) as Vectors;

test('R-03 vectors: the answers a guest may send, with and without the maybe flag', () => {
  assert.ok(vectors.status.length >= 7);
  for (const c of vectors.status) assert.equal(isRsvpStatus(c.value, { maybe: c.maybe }), c.accepted, JSON.stringify(c));
});

test('R-03 vectors: attendance from the raw form field and the host allowance (B-007)', () => {
  assert.ok(vectors.attendance.length >= 15);
  for (const c of vectors.attendance) {
    assert.equal(rsvpAttendance(c.status, requestedHeadcount(c.requestedField), c.allowance), c.attending, JSON.stringify(c));
  }
  // The live decision converts the first `guestCount` value exactly this way (R-03: `rsvpSubmissionFromForm` → decision).
  const decision = source('lib/invitation/rsvp-decision.ts');
  assert.match(decision, /rsvpAttendance\(status, requestedHeadcount\(submission\.guestCount\), guest\.guestCount\)/);
  assert.match(decision, /guestCount: fieldText\(form\.get\('guestCount'\)\)/);
});

test('R-03 vectors: when a write is refused as closed (switched off, or from the deadline instant on)', () => {
  assert.ok(vectors.closed.length >= 9);
  for (const c of vectors.closed) {
    assert.equal(rsvpClosedReason(c.rsvp ?? undefined, Date.parse(c.now)), c.reason, JSON.stringify(c));
  }
});

test('R-03 vectors: the events a guest may answer for (D-037)', () => {
  const { cases } = vectors.eligibility;
  // Stored configs are untyped JSON: one vector event says `inviteOnly: "yes"` on purpose, and only `true` may gate it.
  const events = vectors.eligibility.events as { id?: string; inviteOnly?: boolean }[];
  assert.ok(cases.length >= 6);
  for (const c of cases) {
    const visible = visibleEvents(events, guestAudience(c.guest), c.enabled).map((event) => events.indexOf(event));
    assert.deepEqual(visible, c.visible, JSON.stringify(c));
  }
});
