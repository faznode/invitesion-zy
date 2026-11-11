/**
 * B-039 (09 §8.6), run by the rust job against the real API binary: settlement through both writers, selected per call
 * with `BACKEND_PAYMENT`, on a database migrated by drizzle-kit. Every scenario runs once per writer on fresh rows; the
 * rows each writer leaves (statuses, counts, the outbox row, the invitation) are compared and must be identical. Then
 * what only the Rust call can show: the Idempotency-Key replays a committed answer, refuses another body, and covers a
 * lost answer; and rollback: rows paid by one writer are read and refused the same way by the other.
 *
 * Finally the entitlement outbox through the real `invitesion-jobs` (`JOBS_BIN`; with `REQUIRE_JOBS_BIN=1`, as in CI, a
 * missing binary fails instead of skipping): delivered once, delivered again after an expired lease, writing nothing.
 *
 *   API_BASE_URL=… INTERNAL_API_SECRET=… POSTGRES_URL=… [JOBS_BIN=… REQUIRE_JOBS_BIN=1] npx tsx scripts/verify-payment-api.ts
 *
 * Synthetic data only (fake emails, `vne_` references, a synthetic Stripe secret); every row it makes is deleted.
 */
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

const reportFatal = console.error.bind(console);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

type Writer = 'next' | 'rust';
const WRITERS: Writer[] = ['next', 'rust'];
const STRIPE_SECRET = 'whsec_b039_synthetic_0123456789abcdef';

async function main() {
  const env = process.env;
  if (!env.API_BASE_URL || !env.INTERNAL_API_SECRET || !env.POSTGRES_URL) {
    throw new Error('API_BASE_URL, INTERNAL_API_SECRET and POSTGRES_URL are required (scripts/ci/rust.sh sets them)');
  }
  // The registry builds the Stripe rail from these on first use; synthetic values, no account behind them.
  env.STRIPE_SECRET_KEY = 'sk_test_b039_synthetic_no_account';
  env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;

  const { client: sql } = await import('@/lib/db/drizzle');
  const service = await import('@/lib/payment/service');
  const { money } = await import('@/lib/payment/money');
  const { scheduleInvitationDeletion } = await import('@/lib/invitation/deletion-db');
  const { SIGNATURE_HEADER, signServiceRequest } = await import('@/lib/api/signature');
  const webhook = await import('@/app/api/payments/[rail]/webhook/route');

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const invitationIds: number[] = [];
  const orderIds: number[] = [];
  const templateIds: number[] = [];
  let serial = 0;

  const [user] = await sql`insert into users (email, clerk_user_id) values (${`b039-${tag}@example.invalid`}, ${`user_b039_${tag}`}) returning id`;
  for (const name of ['satu', 'dua']) {
    const [row] = await sql`insert into templates (name, category) values (${`B-039 ${name} ${tag}`}, 'wedding') returning id`;
    templateIds.push(row.id);
  }
  const [t1, t2] = templateIds;

  async function invitation(status = 'DRAFT', templateId: number | null = t1, window?: { publishedAt: string; expiresAt: string }) {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, template_id, config, published_at, expires_at)
      values (${user.id}, ${`b039-${tag}-${++serial}`}, 'wedding', ${status}, ${templateId}, '{}'::jsonb,
              ${window?.publishedAt ?? null}::timestamp, ${window?.expiresAt ?? null}::timestamp) returning id`;
    invitationIds.push(row.id);
    return row.id as number;
  }
  async function order(invitationId: number, { rail = 'qris', amount = 149_000, currency = 'IDR', templateId = t1 as number | null } = {}) {
    const reference = `vne_b039_${tag}_${++serial}`;
    const [row] = await sql`insert into orders (user_id, invitation_id, template_id, tier, amount, currency, rail, reference, status)
      values (${user.id}, ${invitationId}, ${templateId}, 'standard', ${amount}, ${currency}, ${rail}, ${reference}, 'PENDING') returning id`;
    orderIds.push(row.id);
    return { id: row.id as number, reference };
  }
  const paidEvent = (reference: string, extra: Record<string, unknown> = {}) => ({
    rail: 'qris' as const,
    eventId: `b039-${tag}-${++serial}`,
    reference,
    providerPaymentId: `prov-b039-${serial}`,
    status: 'PAID' as 'PAID' | 'FAILED' | 'EXPIRED',
    paid: money(149_000, 'IDR') as ReturnType<typeof money> | null,
    raw: { source: 'verify-payment-api' },
    ...extra,
  });
  const settle = (writer: Writer, event: ReturnType<typeof paidEvent>) => service.settle(event, { ...env, BACKEND_PAYMENT: writer });
  /** An outcome whose order id says only whether it names this scenario's order: the rows, and so the ids, differ by writer. */
  const forOrder = (outcome: object, orderId: number) =>
    'orderId' in outcome ? { ...outcome, orderId: (outcome as { orderId: unknown }).orderId === orderId ? 'this order' : 'another order' } : outcome;
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return null;
    } catch (error) {
      return error;
    }
  };

  /** What a writer leaves, without ids or times. */
  async function state(orderId: number, invitationId: number) {
    const [o] = await sql`select status, paid_at is not null as paid, provider_payment_id from orders where id = ${orderId}`;
    const pays = await sql`select provider, transaction_id, status from payments where order_id = ${orderId}`;
    const events = await sql`select count(*)::int as n, count(order_id)::int as linked from payment_events where order_id = ${orderId} or event_id like ${`b039-${tag}-%`} and order_id = ${orderId}`;
    const outbox = await sql`select payload, max_attempts, done_at is null as due from jobs where kind = 'payment_settled' and dedupe_key = ${`order:${orderId}`}`;
    const [inv] = await sql`select status, published_at, expires_at, deleted_at is not null as deleted, purged_at is not null as purged,
      case when published_at is null or expires_at is null then null
           else (extract(year from age(expires_at, published_at)) * 12 + extract(month from age(expires_at, published_at)))::int end as months,
      published_at = (select paid_at from orders where id = ${orderId}) as starts_at_payment
      from invitations where id = ${invitationId}`;
    return {
      order: { status: o.status, paid: o.paid, providerId: o.provider_payment_id === null ? null : 'set' },
      payments: pays.map((p) => ({ provider: p.provider, transaction: p.transaction_id === null ? null : 'set', status: p.status })),
      events: events[0].n,
      outbox: outbox.map((j) => ({ activation: j.payload.activation, paymentLinked: typeof j.payload.paymentId === 'number', maxAttempts: j.max_attempts, due: j.due })),
      invitation: { status: inv.status, deleted: inv.deleted, purged: inv.purged, months: inv.months, startsAtPayment: inv.starts_at_payment },
    };
  }

  function stripeRequest(body: string, signature?: string) {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', STRIPE_SECRET).update(`${t}.${body}`).digest('hex');
    return new Request('http://127.0.0.1/api/payments/stripe/webhook', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? `t=${t},v1=${v1}` },
    });
  }
  const stripeEvent = (reference: string, amountTotal: number) =>
    JSON.stringify({
      id: `evt_b039_${tag}_${++serial}`,
      type: 'checkout.session.completed',
      data: { object: { id: `cs_b039_${serial}`, client_reference_id: reference, currency: 'usd', amount_total: amountTotal } },
    });
  async function post(writer: Writer, request: Request) {
    const previous = env.BACKEND_PAYMENT;
    env.BACKEND_PAYMENT = writer;
    try {
      const response = await webhook.POST(request, { params: Promise.resolve({ rail: 'stripe' }) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    } finally {
      env.BACKEND_PAYMENT = previous;
    }
  }

  const summaries: Record<Writer, Record<string, unknown>> = { next: {}, rust: {} };
  const quiet = console.error;
  console.error = () => {}; // the route and writers log refusals by design; this script prints its own lines

  for (const writer of WRITERS) {
    const other: Writer = writer === 'next' ? 'rust' : 'next';
    const s = summaries[writer];

    {
      const inv = await invitation();
      const o = await order(inv);
      const event = paidEvent(o.reference);
      const first = await settle(writer, event);
      const again = await settle(writer, event);
      const crossed = await settle(other, event);
      const late = await settle(writer, { ...event, eventId: `${event.eventId}-late` });
      const after = await state(o.id, inv);
      s.paid = { first: forOrder(first, o.id), again, crossed, late, after: { ...after, events: undefined } };
      check(`${writer}: a payment activates its draft for twelve months, with one payment and one outbox row`,
        first.applied && first.invitationActivated && after.order.status === 'PAID' && after.payments.length === 1 && after.outbox.length === 1 &&
          after.outbox[0].activation === 'activated' && after.invitation.status === 'PUBLISHED' && after.invitation.months === 12 && after.invitation.startsAtPayment === true,
        JSON.stringify(after));
      check(`${writer}: the same delivery again, through either writer, is a duplicate`, !again.applied && again.reason === 'duplicate' && !crossed.applied && crossed.reason === 'duplicate');
      const [{ n }] = await sql`select count(*)::int as n from payment_events where order_id = ${o.id}`;
      check(`${writer}: another event on the paid order is kept and changes nothing`, !late.applied && late.reason === 'already-final' && n === 2, `${n} events`);
    }

    {
      const event = paidEvent(`vne_b039_${tag}_missing_${writer}`);
      const error = await refused(() => settle(writer, event));
      const [{ n }] = await sql`select count(*)::int as n from payment_events where event_id = ${event.eventId}`;
      s.unknown = { error: (error as Error)?.name, kept: n };
      check(`${writer}: an unknown reference is refused and nothing is kept`, error instanceof service.OrderNotFoundError && n === 0);
    }

    for (const [name, change, kind] of [
      ['another rail', { rail: 'stripe', paid: money(1_900, 'USD') }, 'RailMismatchError'],
      ['an underpayment', { paid: money(148_999, 'IDR') }, 'AmountMismatchError'],
      ['another currency', { paid: money(149_000, 'USD') }, 'AmountMismatchError'],
      ['PAID without an amount', { paid: null }, 'AmountMismatchError'],
    ] as const) {
      const inv = await invitation();
      const o = await order(inv);
      const event = paidEvent(o.reference, change);
      const error = await refused(() => settle(writer, event));
      const after = await state(o.id, inv);
      const [{ n }] = await sql`select count(*)::int as n from payment_events where event_id = ${event.eventId}`;
      s[`refused ${name}`] = { error: (error as Error)?.name, after, kept: n };
      check(`${writer}: ${name} is refused, the order stays pending and the event is not kept`,
        (error as Error)?.name === kind && after.order.status === 'PENDING' && after.payments.length === 0 && after.outbox.length === 0 && n === 0,
        (error as Error)?.name ?? 'no error');
    }

    {
      const inv = await invitation();
      const o = await order(inv);
      const out = await settle(writer, paidEvent(o.reference, { status: 'FAILED', paid: null }));
      const after = await state(o.id, inv);
      s.failed = { out: forOrder(out, o.id), after };
      check(`${writer}: FAILED closes a pending order without a payment or an outbox row`,
        out.applied && !out.invitationActivated && after.order.status === 'FAILED' && after.payments.length === 0 && after.outbox.length === 0 && after.invitation.status === 'DRAFT');
    }

    {
      const inv = await invitation();
      const o = await order(inv);
      await sql`update invitations set deleted_at = (now() at time zone 'utc'), purge_after = (now() at time zone 'utc') + interval '30 days' where id = ${inv}`;
      const out = await settle(writer, paidEvent(o.reference));
      const deleted = await state(o.id, inv);
      await sql`update invitations set deleted_at = null, purge_after = null where id = ${inv}`;
      const restored = await state(o.id, inv);
      const publishable = await service.hasPaidOrder(inv, t1);
      s.deleted = { out: forOrder(out, o.id), deleted, restored, publishable };
      check(`${writer}: a deleted invitation's payment is recorded and never activates it`,
        out.applied && !out.invitationActivated && deleted.order.status === 'PAID' && deleted.payments.length === 1 && deleted.outbox[0]?.activation === 'not_live' &&
          deleted.invitation.status === 'DRAFT' && deleted.invitation.deleted);
      check(`${writer}: restored, it comes back exactly as it was and its payment counts for publishing`,
        restored.invitation.status === 'DRAFT' && !restored.invitation.deleted && restored.invitation.months === null && publishable);
    }

    {
      const inv = await invitation();
      await sql`update invitations set deleted_at = (now() at time zone 'utc') - interval '31 days', purge_after = (now() at time zone 'utc') - interval '1 day',
        purged_at = (now() at time zone 'utc'), config = null where id = ${inv}`;
      const [before] = await sql`select status, purged_at, config from invitations where id = ${inv}`;
      const o = await order(inv);
      const out = await settle(writer, paidEvent(o.reference));
      const [after] = await sql`select status, purged_at, config from invitations where id = ${inv}`;
      const rows = await state(o.id, inv);
      s.purged = { out: forOrder(out, o.id), rows };
      check(`${writer}: a purged tombstone's payment is recorded and the tombstone is untouched`,
        out.applied && !out.invitationActivated && rows.payments.length === 1 && after.status === before.status &&
          String(after.purged_at) === String(before.purged_at) && after.config === null);
    }

    for (const [name, invitationTheme, orderTheme, expected] of [
      ['a theme switched in flight is not published', t2, t1, 'theme_mismatch'],
      ['a legacy order without a theme activates', t2, null, 'activated'],
    ] as const) {
      const inv = await invitation('DRAFT', invitationTheme);
      const o = await order(inv, { templateId: orderTheme });
      const out = await settle(writer, paidEvent(o.reference));
      const after = await state(o.id, inv);
      s[name] = { out: forOrder(out, o.id), after };
      check(`${writer}: ${name}`, out.applied && after.outbox[0]?.activation === expected && (expected === 'activated') === out.invitationActivated);
    }

    {
      const inv = await invitation('PUBLISHED', t1, { publishedAt: '2026-06-01 00:00:00', expiresAt: '2027-06-01 00:00:00' });
      const o = await order(inv);
      const out = await settle(writer, paidEvent(o.reference));
      const [row] = await sql`select published_at::text as p, expires_at::text as e from invitations where id = ${inv}`;
      const after = await state(o.id, inv);
      s.published = { out: forOrder(out, o.id), after };
      check(`${writer}: a published invitation keeps its running window`,
        out.applied && !out.invitationActivated && after.outbox[0]?.activation === 'already_published' && row.p === '2026-06-01 00:00:00' && row.e === '2027-06-01 00:00:00');
    }

    {
      const inv = await invitation();
      const o = await order(inv);
      const outcomes = await Promise.all(Array.from({ length: 6 }, () => settle(writer, paidEvent(o.reference))));
      const after = await state(o.id, inv);
      const applied = outcomes.filter((x) => x.applied).length;
      const final = outcomes.filter((x) => !x.applied && x.reason === 'already-final').length;
      s.concurrentDistinct = { applied, final, after };
      check(`${writer}: six different events at once pay the order once`, applied === 1 && final === 5 && after.payments.length === 1 && after.outbox.length === 1 && after.events === 6,
        `${applied} applied, ${final} final, ${after.payments.length} payments`);
    }

    {
      const inv = await invitation();
      const o = await order(inv);
      const event = paidEvent(o.reference);
      const outcomes = await Promise.all(Array.from({ length: 4 }, () => settle(writer, event)));
      const after = await state(o.id, inv);
      const applied = outcomes.filter((x) => x.applied).length;
      const duplicates = outcomes.filter((x) => !x.applied && x.reason === 'duplicate').length;
      s.concurrentSame = { applied, duplicates, after };
      check(`${writer}: one delivery four times at once applies once`, applied === 1 && duplicates === 3 && after.events === 1 && after.payments.length === 1);
    }

    {
      // Free races on the invitation's row lock: whichever commits first, the deletion stands, the money is recorded
      // once, and the invitation is PUBLISHED exactly when the outbox row says the settlement activated it. Timestamps
      // are taken outside the lock, so they cannot order the two; the next block forces each order instead.
      const deletionEnv = { FLAG_INVITATION_DELETION: 'on', INVITATION_DELETION_WINDOW_DAYS: '30' };
      let activatedFirst = 0;
      let deletedFirst = 0;
      let consistent = true;
      for (let round = 0; round < 8; round++) {
        const inv = await invitation();
        const o = await order(inv);
        const [, deletion] = await Promise.all([settle(writer, paidEvent(o.reference)), scheduleInvitationDeletion(user.id, inv, deletionEnv)]);
        const [row] = await sql`select status, deleted_at is not null as deleted, published_at from invitations where id = ${inv}`;
        const after = await state(o.id, inv);
        const recorded = deletion.kind === 'scheduled' && row.deleted && after.order.status === 'PAID' && after.payments.length === 1 && after.outbox.length === 1;
        if (row.status === 'PUBLISHED') {
          activatedFirst++;
          consistent &&= recorded && after.outbox[0].activation === 'activated';
        } else {
          deletedFirst++;
          consistent &&= recorded && row.status === 'DRAFT' && row.published_at === null && after.outbox[0].activation === 'not_live';
        }
      }
      check(`${writer}: a deletion racing the settlement: deleted, paid once, published only if activated first (8 rounds)`, consistent,
        `${activatedFirst} settled first, ${deletedFirst} deleted first`);
    }

    for (const ending of ['commits', 'rolls back'] as const) {
      // Forced order: a transaction holds the invitation's row lock, as the deletion does, while the settlement waits on
      // it (seen in pg_stat_activity); then it deletes and commits, or rolls back. READ COMMITTED re-checks
      // `deleted_at is null` on the committed row, so a committed deletion leaves the settlement nothing to activate.
      const inv = await invitation();
      const o = await order(inv);
      let pending: Promise<Awaited<ReturnType<typeof settle>>> | undefined;
      let blocked = false;
      await sql
        .begin(async (tx) => {
          await tx`select id from invitations where id = ${inv} for update`;
          pending = settle(writer, paidEvent(o.reference));
          for (let poll = 0; poll < 100 && !blocked; poll++) {
            const [{ waiting }] = await sql`select count(*)::int as waiting from pg_stat_activity
              where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock' and query ilike '%invitations%for update%'`;
            blocked = waiting > 0;
            if (!blocked) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await tx`update invitations set deleted_at = (now() at time zone 'utc'), purge_after = (now() at time zone 'utc') + interval '30 days' where id = ${inv}`;
          if (ending === 'rolls back') throw new Error('rollback');
        })
        .catch((error: Error) => {
          if (error.message !== 'rollback') throw error;
        });
      const out = await pending!;
      const after = await state(o.id, inv);
      s[`lock held, deletion ${ending}`] = { blocked, out: forOrder(out, o.id), after };
      const recorded = blocked && out.applied && after.order.status === 'PAID' && after.payments.length === 1 && after.outbox.length === 1;
      check(ending === 'commits'
        ? `${writer}: the settlement waits for a deletion holding the lock; once it commits, the money is recorded and nothing is activated`
        : `${writer}: the settlement waits for a deletion holding the lock; once it rolls back, the invitation is activated`,
        ending === 'commits'
          ? recorded && !out.invitationActivated && after.outbox[0].activation === 'not_live' && after.invitation.status === 'DRAFT' && after.invitation.deleted
          : recorded && out.invitationActivated && after.outbox[0].activation === 'activated' && after.invitation.status === 'PUBLISHED' && !after.invitation.deleted,
        JSON.stringify({ blocked, after }));
    }

    {
      const inv = await invitation();
      const o = await order(inv);
      const previous = env.BACKEND_PAYMENT;
      env.BACKEND_PAYMENT = writer;
      try {
        const first = await service.confirmManually({ reference: o.reference, adminUserId: user.id, note: 'b039' });
        const second = await service.confirmManually({ reference: o.reference, adminUserId: user.id, note: 'b039' });
        const after = await state(o.id, inv);
        s.manual = { first: forOrder(first, o.id), second, after };
        check(`${writer}: the administrator's confirmation settles once; a second press is a duplicate`,
          first.applied && first.invitationActivated && !second.applied && second.reason === 'duplicate' && after.payments.length === 1);
      } finally {
        env.BACKEND_PAYMENT = previous;
      }
    }

    {
      const inv = await invitation();
      const o = await order(inv, { rail: 'stripe', amount: 1_900, currency: 'USD' });
      const body = stripeEvent(o.reference, 1_900);
      const ok = await post(writer, stripeRequest(body));
      const replay = await post(writer, stripeRequest(body));
      const tampered = await post(writer, stripeRequest(body.replace('1900', '1901'), stripeRequest(body).headers.get('stripe-signature') ?? ''));
      const inv2 = await invitation();
      const o2 = await order(inv2, { rail: 'stripe', amount: 1_900, currency: 'USD' });
      const wrongAmount = await post(writer, stripeRequest(stripeEvent(o2.reference, 1_800)));
      const unknown = await post(writer, stripeRequest(stripeEvent(`vne_b039_${tag}_nowhere`, 1_900)));
      const after = await state(o.id, inv);
      s.webhook = {
        ok: { ...ok, body: forOrder(ok.body, o.id) },
        replay: { ...replay, body: forOrder(replay.body, o.id) },
        tampered: tampered.status,
        wrongAmount: wrongAmount.status,
        unknown: unknown.status,
        after: { ...after, events: undefined },
      };
      check(`${writer}: the signed Stripe webhook settles once (200), a replay is a duplicate (200)`,
        ok.status === 200 && ok.body.applied === true && replay.status === 200 && replay.body.reason === 'duplicate' && after.order.status === 'PAID' && after.payments.length === 1);
      check(`${writer}: a tampered body 400, another amount 409, an unknown reference 400`,
        tampered.status === 400 && wrongAmount.status === 409 && unknown.status === 400, `${tampered.status} ${wrongAmount.status} ${unknown.status}`);
    }
  }
  console.error = quiet;

  const differing = Object.keys(summaries.next).filter((key) => !isDeepStrictEqual(summaries.next[key], summaries.rust[key]));
  check(`parity: both writers leave the same outcomes and rows in every scenario (${Object.keys(summaries.next).length} compared)`,
    differing.length === 0 && isDeepStrictEqual(Object.keys(summaries.next), Object.keys(summaries.rust)),
    differing.length === 0 ? '' : `${differing.join(', ')}; first: next ${JSON.stringify(summaries.next[differing[0]])} rust ${JSON.stringify(summaries.rust[differing[0]])}`);

  // What only the Rust call shows: the key, a lost answer, and the outbox row the jobs runner will deliver.
  {
    const url = `${env.API_BASE_URL.replace(/\/+$/, '')}/v1/payments/settlements`;
    const callApi = async (key: string, body: string) => {
      const response = await fetch(url, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': key,
          [SIGNATURE_HEADER]: signServiceRequest(env.INTERNAL_API_SECRET as string, Math.floor(Date.now() / 1000), 'POST', '/v1/payments/settlements', body),
        },
      });
      return { status: response.status, replayed: response.headers.get('idempotent-replayed'), body: await response.json() };
    };
    const inv = await invitation();
    const o = await order(inv);
    const body = JSON.stringify({ rail: 'qris', eventId: `b039-${tag}-key`, reference: o.reference, status: 'PAID', paid: { amount: 149_000, currency: 'IDR' }, raw: {} });
    const key = `b039-${tag}-key`;
    const first = await callApi(key, body);
    const again = await callApi(key, body);
    const changed = await callApi(key, body.replace('"raw":{}', '"raw":{"x":1}'));
    check('rust: a retried key replays the committed answer', first.status === 200 && again.status === 200 && again.replayed === 'true' && isDeepStrictEqual(first.body, again.body));
    check('rust: the key with another body is refused (422)', changed.status === 422 && changed.body.code === 'idempotency.key_reused');

    const inv2 = await invitation();
    const o2 = await order(inv2);
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      calls++;
      const response = await realFetch(...args);
      if (calls === 1) throw new TypeError('fetch failed'); // committed, answer lost on the way back
      return response;
    }) as typeof fetch;
    let lost;
    try {
      lost = await settle('rust', paidEvent(o2.reference));
    } finally {
      globalThis.fetch = realFetch;
    }
    const afterLost = await state(o2.id, inv2);
    check('rust: an answer lost after the commit is replayed by the one retry under the same key',
      calls === 2 && lost.applied === true && lost.invitationActivated === true && afterLost.payments.length === 1 && afterLost.outbox.length === 1);
  }

  {
    const inv = await invitation();
    const o = await order(inv);
    const byRust = await settle('rust', paidEvent(o.reference));
    const thenNext = await settle('next', paidEvent(o.reference));
    const paidIds = await service.paidInvitationIds(user.id);
    check('rollback: an order paid by Rust is read as paid by Next.js and refused again by its writer',
      byRust.applied && (await service.hasPaidOrder(inv, t1)) && paidIds.has(inv) && !thenNext.applied && thenNext.reason === 'already-final');
  }

  // The entitlement outbox delivered by the real jobs binary: every row this run's settlements wrote, through either
  // writer, completes in one pass (deleted and purged invitations included); a delivery repeated after an expired lease
  // completes again; neither writes to an order, a payment or an invitation.
  {
    const jobsBin = env.JOBS_BIN?.trim() ?? '';
    const required = env.REQUIRE_JOBS_BIN === '1';
    if (!jobsBin || !existsSync(jobsBin)) {
      check('outbox: JOBS_BIN names the invitesion-jobs binary (REQUIRE_JOBS_BIN=1: this section must run)', !required,
        jobsBin ? `not found: ${jobsBin}` : 'JOBS_BIN is not set');
      if (!required) console.log('SKIP  outbox delivery through invitesion-jobs (no JOBS_BIN)');
    } else {
      const uploads = mkdtempSync(join(tmpdir(), 'b039-jobs-'));
      // An environment built from nothing, as the retention check runs the binary: no variable of the caller.
      const jobsEnv = { PATH: env.PATH ?? '/usr/local/bin:/usr/bin:/bin', DATABASE_URL: env.POSTGRES_URL, UPLOAD_ROOT: uploads, JOBS_BATCH: '500', RUST_LOG: 'warn' };
      const runJobs = () =>
        JSON.parse(execFileSync(jobsBin, [], { env: jobsEnv as unknown as NodeJS.ProcessEnv, encoding: 'utf8' }).trim().split('\n').pop() ?? '{}') as Record<string, unknown>;
      const keys = orderIds.map((id) => `order:${id}`);
      const outbox = async () =>
        (await sql`select attempts, done_at is not null as done, last_error from jobs where kind = 'payment_settled' and dedupe_key = any(${keys}) order by id`) as unknown as { attempts: number; done: boolean; last_error: string | null }[];
      const rowsDigest = async () =>
        (await sql`select md5(coalesce(string_agg(t, '|' order by t), '')) as d from (
            select o::text as t from orders o where o.id = any(${orderIds})
            union all select p::text from payments p where p.order_id = any(${orderIds})
            union all select i::text from invitations i where i.id = any(${invitationIds})) rows`)[0].d as string;
      const [{ paid }] = await sql`select count(*)::int as paid from orders where id = any(${orderIds}) and status = 'PAID'`;
      const before = await outbox();
      check('outbox: one row per paid order, whichever writer paid it, all due before the runner',
        before.length === paid && before.length > 20 && before.every((row) => !row.done && row.attempts === 0), `${before.length} rows, ${paid} paid orders`);
      const digest = await rowsDigest();
      const first = runJobs();
      const delivered = await outbox();
      check('outbox: one pass of invitesion-jobs delivers every row once (deleted and purged invitations included)',
        delivered.length === paid && delivered.every((row) => row.done && row.attempts === 1 && row.last_error === null), JSON.stringify(first));
      await sql`update jobs set done_at = null, locked_until = (now() at time zone 'utc') - interval '1 minute'
        where kind = 'payment_settled' and dedupe_key = any(${keys})`;
      const second = runJobs();
      const again = await outbox();
      check('outbox: delivered again after an expired lease, every row completes again',
        again.length === paid && again.every((row) => row.done && row.attempts === 2 && row.last_error === null), JSON.stringify(second));
      check('outbox: delivery writes nothing to orders, payments or invitations', (await rowsDigest()) === digest);
      rmSync(uploads, { recursive: true, force: true });
    }
  }

  // Cleanup: every row this run made.
  await sql`delete from jobs where (kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)}))
    or (kind = 'invitation_purge' and (payload->>'invitationId')::int = any(${invitationIds}))`;
  // G-050: the runner above issued these orders' receipts; they reference the orders and payments.
  await sql`delete from receipts where order_id = any(${orderIds})`;
  await sql`delete from payments where order_id = any(${orderIds})`;
  await sql`delete from payment_events where order_id = any(${orderIds}) or event_id like ${`b039-${tag}-%`} or event_id like ${`evt_b039_${tag}_%`} or event_id like ${`manual:vne_b039_${tag}_%`}`;
  await sql`delete from api_idempotency_keys where scope = 'payment:settlement' and key = ${`b039-${tag}-key`}`;
  await sql`delete from orders where id = any(${orderIds})`;
  await sql`delete from invitations where id = any(${invitationIds})`;
  await sql`delete from templates where id = any(${templateIds})`;
  await sql`delete from users where id = ${user.id}`;
  const [{ left }] = await sql`select count(*)::int as left from orders where reference like ${`vne_b039_${tag}_%`}`;
  check('cleanup: no fixture row left', left === 0);

  await sql.end();
  console.log(`\nverify-payment-api: ${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  // The scenarios silence console.error; a fatal error must still be reported.
  reportFatal(error);
  process.exit(1);
});
