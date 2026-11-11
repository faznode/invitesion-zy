// B-039 (09 §8.6): the settlement facade and the Rust writer's call site against a scripted API, the checkout key, and
// the source guards that keep one writer per call: the webhook verifies before it settles, `settle` picks exactly one
// writer with no fallback, both writers move the order only from PENDING and write the outbox row in the settlement's
// transaction, and the checkout form carries a key bound to the server's intent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { SIGNATURE_HEADER } from '../lib/api/signature';
import { backendFor } from '../lib/backend';
import { checkoutIntentHash, normalizeCheckoutKey, resolveExistingCheckout, type CheckoutIntent } from '../lib/payment/checkout-key';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
const api = () => require('../lib/payment/settlement-api') as typeof import('../lib/payment/settlement-api');
const errors = () => require('../lib/payment/errors') as typeof import('../lib/payment/errors');

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ENV = { API_BASE_URL: 'http://api.test', INTERNAL_API_SECRET: 'payment-writer-test-secret-0123456789abcdef' };

type Sent = { url: string; headers: Record<string, string>; body: string };
type Scripted = { status: number; body?: unknown } | 'drop';
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function scriptApi(...replies: Scripted[]): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body ?? '') });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    if (reply === 'drop') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as typeof fetch;
  return sent;
}

const problem = (status: number, code: string) => ({ status, body: { type: `https://invitesion.id/problems/${code}`, title: 'x', status, code } });

async function quietly<T>(run: () => Promise<T>): Promise<{ value?: T; error?: unknown; logged: string[] }> {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
  try {
    return { value: await run(), logged };
  } catch (error) {
    return { error, logged };
  } finally {
    console.error = original;
  }
}

const EVENT = {
  rail: 'qris' as const,
  eventId: 'manual:vne_0123',
  reference: 'vne_0123',
  providerPaymentId: null,
  status: 'PAID' as const,
  paid: { amount: 149_000, currency: 'IDR' as const },
  raw: { source: 'manual-confirmation', adminUserId: 1, note: null, at: '2026-11-10T04:00:00.000Z' },
};

test('BACKEND_PAYMENT selects next by default, rust only when asked, and never the other writer on an unknown value', () => {
  assert.equal(backendFor('PAYMENT', {}), 'next');
  assert.equal(backendFor('PAYMENT', { BACKEND_PAYMENT: ' Rust ' }), 'rust');
  assert.equal(backendFor('PAYMENT', { BACKEND_PAYMENT: 'next' }), 'next');
  assert.equal(backendFor('PAYMENT', { BACKEND_PAYMENT: 'both' }), 'next');
});

test('the Rust writer sends the verified event signed, under one key, and maps a payment to the shared outcome', async () => {
  const sent = scriptApi({ status: 200, body: { applied: true, orderId: 7, invitationActivated: true, activation: 'activated' } });
  const outcome = await api().settleThroughApi(EVENT, ENV);
  assert.deepEqual(outcome, { applied: true, orderId: 7, invitationActivated: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'http://api.test/v1/payments/settlements');
  assert.match(sent[0].headers[SIGNATURE_HEADER] ?? '', /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.match(sent[0].headers['idempotency-key'] ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(JSON.parse(sent[0].body), {
    rail: 'qris',
    eventId: 'manual:vne_0123',
    reference: 'vne_0123',
    status: 'PAID',
    paid: { amount: 149_000, currency: 'IDR' },
    raw: EVENT.raw,
  });
});

test('a duplicate and an order already final keep their reasons', async () => {
  scriptApi({ status: 200, body: { applied: false, reason: 'duplicate' } }, { status: 200, body: { applied: false, reason: 'already-final' } });
  assert.deepEqual(await api().settleThroughApi(EVENT, ENV), { applied: false, reason: 'duplicate' });
  assert.deepEqual(await api().settleThroughApi(EVENT, ENV), { applied: false, reason: 'already-final' });
});

test('an unknown outcome is sent once more under the same key, and a committed answer replays', async () => {
  const sent = scriptApi('drop', { status: 200, body: { applied: true, orderId: 7, invitationActivated: false, activation: 'not_live' } });
  assert.deepEqual(await api().settleThroughApi(EVENT, ENV), { applied: true, orderId: 7, invitationActivated: false });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].headers['idempotency-key'], sent[1].headers['idempotency-key'], 'the retry reuses the key');
  assert.equal(sent[0].body, sent[1].body, 'and the body');
});

test('still unknown after the retry: SettlementUnconfirmedError, never a third call or the other writer', async () => {
  const sent = scriptApi(problem(503, 'database.unavailable'), problem(504, 'request.timeout'));
  const { error, logged } = await quietly(() => api().settleThroughApi(EVENT, ENV));
  assert.ok(error instanceof errors().SettlementUnconfirmedError, String(error));
  assert.equal(sent.length, 2);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /vne_0123|149000|manual/, 'the log names the status and code only');
});

test('refusals map to the errors the Next.js writer throws, after one call', async () => {
  const cases: [ReturnType<typeof problem>, new (...args: never[]) => Error][] = [
    [problem(404, 'payment.order_not_found'), errors().OrderNotFoundError],
    [problem(409, 'payment.rail_mismatch'), errors().RailMismatchError],
    [problem(409, 'payment.amount_mismatch'), errors().AmountMismatchError],
    [problem(409, 'payment.amount_unverifiable'), errors().AmountMismatchError],
  ];
  for (const [reply, kind] of cases) {
    const sent = scriptApi(reply);
    const { error } = await quietly(() => api().settleThroughApi(EVENT, ENV));
    assert.ok(error instanceof kind, `${reply.body.code} -> ${String(error)}`);
    assert.equal(sent.length, 1, reply.body.code);
  }
  scriptApi(problem(400, 'request.invalid_body'));
  const { error } = await quietly(() => api().settleThroughApi(EVENT, ENV));
  assert.equal((error as { code?: string }).code, 'request.invalid_body', 'a programming error propagates as itself');
});

test('the checkout key: UUIDs only, case-folded, bound to the whole server-computed intent', () => {
  assert.equal(normalizeCheckoutKey(' 0F8FAD5B-D9CB-469F-A165-70867728950E '), '0f8fad5b-d9cb-469f-a165-70867728950e');
  for (const bad of [null, undefined, 42, '', 'not-a-key', '0f8fad5b-d9cb-469f-a165-70867728950', '0f8fad5b-d9cb-069f-a165-70867728950e']) {
    assert.equal(normalizeCheckoutKey(bad), null, String(bad));
  }
  const intent: CheckoutIntent = { invitationId: 11, templateId: 3, tier: 'standard', amount: 149_000, currency: 'IDR', rail: 'qris' };
  const hash = checkoutIntentHash(intent);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(checkoutIntentHash({ ...intent }), hash, 'stable');
  for (const change of [{ invitationId: 12 }, { templateId: null }, { tier: 'premium' }, { amount: 249_000 }, { currency: 'USD' }, { rail: 'stripe' }]) {
    assert.notEqual(checkoutIntentHash({ ...intent, ...change }), hash, JSON.stringify(change));
  }
  assert.equal(resolveExistingCheckout({ status: 'PENDING', checkoutIntent: hash }, hash), 'resume');
  assert.equal(resolveExistingCheckout({ status: 'PAID', checkoutIntent: hash }, hash), 'paid');
  assert.equal(resolveExistingCheckout({ status: 'EXPIRED', checkoutIntent: hash }, hash), 'closed');
  assert.equal(resolveExistingCheckout({ status: 'FAILED', checkoutIntent: hash }, hash), 'closed');
  assert.equal(resolveExistingCheckout({ status: 'PAID', checkoutIntent: 'other' }, hash), 'conflict', 'a changed intent never resumes or reports paid');
  assert.equal(resolveExistingCheckout({ status: 'PENDING', checkoutIntent: null }, hash), 'conflict');
});

test('one entry point: the webhook verifies the raw body, then settles through the facade only', () => {
  const route = source('app/api/payments/[rail]/webhook/route.ts');
  assert.ok(route.indexOf('await request.text()') < route.indexOf('provider.parseWebhook(rawBody'), 'the raw body is read first');
  assert.ok(route.indexOf('provider.parseWebhook(rawBody') < route.indexOf('await settle(event)'), 'only a verified event is settled');
  assert.doesNotMatch(route, /applySettlement|settleThroughApi/, 'no writer is called directly');
  assert.match(route, /RailMismatchError[\s\S]*409/);
  assert.match(route, /SettlementUnconfirmedError[\s\S]*500/);

  const service = source('lib/payment/service.ts');
  assert.match(service, /return backendFor\('PAYMENT', env\) === 'rust' \? settleThroughApi\(event, env\) : applySettlement\(event\);/);
  const confirm = service.slice(service.indexOf('export async function confirmManually'), service.indexOf('export async function settle'));
  assert.match(confirm, /return settle\(\{/, 'the administrator confirmation settles through the facade');
  assert.doesNotMatch(confirm, /applySettlement\(/);
  const client = source('lib/payment/settlement-api.ts');
  assert.doesNotMatch(client, /applySettlement/, 'no fallback to the Next.js writer');
  assert.match(client, /^import type \{ SettleOutcome \} from '\.\/service';$/m, 'only a type comes from the service');

  const admin = source('app/(admin)/admin/[entry]/(console)/orders/actions.ts');
  assert.ok(admin.indexOf('assertAuthorizedAdmin(') < admin.indexOf('confirmManually('), 'the administrator is authorized first');
});

test('both writers move the order only from PENDING and write the outbox row inside the settlement', () => {
  const service = source('lib/payment/service.ts');
  const settle = service.slice(service.indexOf('export async function applySettlement'), service.indexOf('async function activateInvitation'));
  assert.equal(settle.match(/eq\(orders\.status, 'PENDING'\)/g)?.length, 2, 'the closing and the paying transition are conditional');
  assert.match(settle, /\.insert\(jobs\)[\s\S]*kind: PAYMENT_SETTLED_JOB[\s\S]*onConflictDoNothing\(\{ target: \[jobs\.kind, jobs\.dedupeKey\] \}\)/);

  const rust = source('services/api/src/payment/http.rs');
  const inOrder = (body: string, needles: string[]) => {
    let previous = -1;
    for (const needle of needles) {
      const at = body.indexOf(needle, previous + 1);
      assert.ok(at > previous, `${needle} after the statement before it`);
      previous = at;
    }
  };
  const apply = rust.slice(rust.indexOf('async fn apply('), rust.indexOf('async fn close('));
  inOrder(apply, ['insert into payment_events', 'from orders where reference = $1 for update', 'update payment_events set order_id', 'idempotency::record(', 'tx.commit()']);
  const pay = rust.slice(rust.indexOf('async fn pay('), rust.indexOf('#[cfg(test)]'));
  inOrder(pay, ['where id = $1 and deleted_at is null for update', "status = 'PAID'", "where id = $1 and status = 'PENDING'", 'insert into payments', "set status = 'PUBLISHED'", 'insert into jobs']);
  assert.equal(rust.match(/where id = \$1 and status = 'PENDING'/g)?.length, 2, 'both Rust transitions are conditional');
  assert.match(source('services/api/src/app.rs'), /\.route\("\/v1\/payments\/settlements", post\(payment::http::settle\)\)/);
  assert.match(source('services/api/src/jobs.rs'), /payment::outbox::PAYMENT_SETTLED_JOB => payment::outbox::run_payment_settled\(pool, job\)\.await/);
});

test('the checkout form carries a fresh key and the action binds it to the server-computed intent', () => {
  const page = source('app/(customer)/dashboard/invitations/[id]/checkout/page.tsx');
  assert.equal(page.match(/name="checkoutKey"/g)?.length, 2, 'the new attempt and the Stripe resume both carry a key');
  assert.match(page, /const checkoutKey = randomUUID\(\);/);
  const action = source('app/(customer)/dashboard/invitations/[id]/checkout/actions.ts');
  assert.match(action, /normalizeCheckoutKey\(formData\.get\('checkoutKey'\)\) \?\? randomUUID\(\)/);
  assert.match(action, /CheckoutConflictError\) redirect\(`\$\{checkoutPath\}\?error=changed`\)/);
  assert.ok(action.indexOf('activationPrice(') < action.indexOf('createOrder('), 'the price is computed on the server before the order');
  assert.doesNotMatch(action, /formData\.get\('(amount|price|currency|tier)'\)/, 'nothing of the intent comes from the form');
  const service = source('lib/payment/service.ts');
  assert.match(service, /target: \[orders\.userId, orders\.invitationId, orders\.checkoutKey\],\s*where: sql`\$\{orders\.checkoutKey\} is not null`/);
  assert.match(service, /\.where\(and\(eq\(orders\.id, order\.id\), eq\(orders\.status, 'PENDING'\)\)\);/, 'the provider handle is stored only on a pending order');
  const migration = source('lib/db/migrations/0027_checkout_key.sql');
  assert.match(migration, /ADD COLUMN "checkout_key" varchar\(64\);/);
  assert.match(migration, /CREATE UNIQUE INDEX "orders_user_checkout_key_idx" ON "orders" USING btree \("user_id","invitation_id","checkout_key"\) WHERE "orders"\."checkout_key" is not null;/);
  assert.doesNotMatch(migration, /DROP|NOT NULL|ALTER COLUMN/, 'additive only');
});
