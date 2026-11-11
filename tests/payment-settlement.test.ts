// B-039 (09 §8.6): the settlement decision as shared vectors (`contracts/vectors/payment-settlement.json`), run here
// against the TypeScript writer's `decideSettlement`. `services/api/tests/payment_vectors.rs` runs the same file against
// the Rust writer, so the two agree on every case before `BACKEND_PAYMENT` may select Rust. The activation window is
// computed in the deployment's timezone, UTC, which this file pins before any date is made.
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PAYMENT_SETTLED_JOB,
  decideSettlement,
  paymentSettledDedupeKey,
  type SettlementDecision,
  type SettlementEventInput,
  type SettlementInvitationInput,
  type SettlementOrderInput,
} from '../lib/payment/settlement-decision';

type StoredInvitation = { status: string; templateId: number | null; publishedAt: string | null; expiresAt: string | null };
type Expected =
  | { outcome: Exclude<SettlementDecision['outcome'], 'closed' | 'paid'> }
  | { outcome: 'closed'; status: 'FAILED' | 'EXPIRED' }
  | {
      outcome: 'paid';
      activation:
        | { kind: 'activated'; publishedAt: string; expiresAt: string }
        | { kind: 'no_invitation' | 'not_live' | 'already_published' | 'theme_mismatch' };
    };
type Vectors = {
  paidAt: string;
  orders: Record<string, SettlementOrderInput>;
  invitations: Record<string, StoredInvitation>;
  cases: {
    name: string;
    recorded: boolean;
    order: string | null;
    invitation: string | null;
    paidAt?: string;
    event: SettlementEventInput;
    expect: Expected;
  }[];
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/payment-settlement.json'), 'utf8')) as Vectors;

const date = (value: string | null) => (value === null ? null : new Date(value));
function invitationNamed(name: string | null): SettlementInvitationInput | null {
  if (name === null) return null;
  const stored = vectors.invitations[name];
  assert.ok(stored, `fixture invitation ${name}`);
  return { ...stored, publishedAt: date(stored.publishedAt), expiresAt: date(stored.expiresAt) };
}

/** The decision with its dates as the ISO strings the file uses. */
function comparable(decision: SettlementDecision): Expected {
  if (decision.outcome === 'paid' && decision.activation.kind === 'activated') {
    return {
      outcome: 'paid',
      activation: {
        kind: 'activated',
        publishedAt: decision.activation.publishedAt.toISOString(),
        expiresAt: decision.activation.expiresAt.toISOString(),
      },
    };
  }
  return decision as Expected;
}

test('the vectors cover every outcome and every activation', () => {
  const outcomes = new Set(vectors.cases.map((c) => c.expect.outcome));
  for (const outcome of ['duplicate', 'unknown_order', 'rail_mismatch', 'already_final', 'closed', 'amount_unverifiable', 'amount_mismatch', 'paid']) {
    assert.ok(outcomes.has(outcome as Expected['outcome']), outcome);
  }
  const activations = new Set(vectors.cases.flatMap((c) => (c.expect.outcome === 'paid' ? [c.expect.activation.kind] : [])));
  for (const kind of ['activated', 'no_invitation', 'not_live', 'already_published', 'theme_mismatch']) {
    assert.ok(activations.has(kind as 'activated'), kind);
  }
  assert.equal(new Set(vectors.cases.map((c) => c.name)).size, vectors.cases.length, 'case names are unique');
});

for (const vector of vectors.cases) {
  test(`settlement: ${vector.name}`, () => {
    const order = vector.order === null ? null : vectors.orders[vector.order];
    if (vector.order !== null) assert.ok(order, `fixture order ${vector.order}`);
    const decision = decideSettlement({
      recorded: vector.recorded,
      event: vector.event,
      order: order ?? null,
      invitation: invitationNamed(vector.invitation),
      paidAt: new Date(vector.paidAt ?? vectors.paidAt),
    });
    assert.deepEqual(comparable(decision), vector.expect);
  });
}

test('the entitlement outbox row is one per order', () => {
  assert.equal(PAYMENT_SETTLED_JOB, 'payment_settled');
  assert.equal(paymentSettledDedupeKey(42), 'order:42');
  assert.notEqual(paymentSettledDedupeKey(42), paymentSettledDedupeKey(43));
  assert.ok(PAYMENT_SETTLED_JOB.length <= 40, 'fits jobs.kind');
});
