/**
 * B-039 (09 §8.4), run by the database job: checkout idempotency on a database migrated by drizzle-kit. `createOrder`
 * receives the checkout key its page rendered and is driven through the real QRIS rail (the manual acquirer with a
 * synthetic static QR) and the Stripe rail, whose HTTP endpoint is replaced in-process by one that behaves like Stripe's
 * idempotency: one session per `Idempotency-Key`, and a switch that fails the next call before any session exists.
 *
 *  - five taps at once, then a retry after a lost answer, reach one order, and the rail is asked for the same charge;
 *  - another intent under the key (price, tier, theme) is a conflict and writes nothing;
 *  - the key is scoped to the customer and the invitation;
 *  - a paid key answers "paid", a failed one "closed"; a submit without a key makes its own order, as before B-039;
 *  - Stripe: concurrent submits and a provider failure before the session existed resolve to one order and one session,
 *    every call carrying `checkout:<reference>`.
 *
 *   POSTGRES_URL=… npx tsx scripts/verify-checkout-key.ts
 *
 * Synthetic data only (fake emails, `vne_` references, random keys, a synthetic merchant QR); every row it makes is
 * deleted.
 */
import Module from 'node:module';
import { randomUUID } from 'node:crypto';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const env = process.env;
  if (!env.POSTGRES_URL) throw new Error('POSTGRES_URL is required (scripts/ci/database.sh sets it)');

  // The rails read their configuration on first use. A plausible static merchant QR with a valid checksum (the unit
  // tests' fixture), and synthetic Stripe values with no account behind them.
  const { crc16, serialiseTlv } = await import('@/lib/payment/qris-payload');
  const qrBody =
    serialiseTlv([
      { tag: '00', value: '01' },
      { tag: '01', value: '11' },
      { tag: '26', value: '0013ID.CO.QRIS.WWW0215ID10200000000000303UMI' },
      { tag: '52', value: '5812' },
      { tag: '53', value: '360' },
      { tag: '58', value: 'ID' },
      { tag: '59', value: 'Vienne Undangan' },
      { tag: '60', value: 'Bandung' },
    ]) + '6304';
  env.QRIS_ACQUIRER = 'manual';
  env.QRIS_STATIC_PAYLOAD = qrBody + crc16(qrBody);
  env.STRIPE_SECRET_KEY = 'sk_test_b039_synthetic_no_account';
  env.STRIPE_WEBHOOK_SECRET = 'whsec_b039_synthetic_0123456789abcdef';

  const sessions = new Map<string, string>();
  const stripeKeys: string[] = [];
  let failNextStripeCall = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return realFetch(input, init);
    const key = new Headers(init?.headers).get('idempotency-key') ?? '';
    stripeKeys.push(key);
    if (failNextStripeCall) {
      failNextStripeCall = false;
      return new Response(JSON.stringify({ error: { message: 'synthetic outage before the session existed' } }), { status: 500 });
    }
    if (!sessions.has(key)) sessions.set(key, `cs_test_b039_${sessions.size + 1}`);
    const id = sessions.get(key) as string;
    return new Response(JSON.stringify({ id, url: `https://checkout.stripe.test/c/pay/${id}`, expires_at: Math.floor(Date.now() / 1000) + 86_400 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const { client: sql } = await import('@/lib/db/drizzle');
  const service = await import('@/lib/payment/service');
  const { ProviderError } = await import('@/lib/payment/types');
  const { money } = await import('@/lib/payment/money');

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const userIds: number[] = [];
  const templateIds: number[] = [];
  const invitationIds: number[] = [];
  let serial = 0;

  async function customer(name: string) {
    const [row] = await sql`insert into users (email, clerk_user_id) values (${`b039-ck-${name}-${tag}@example.invalid`}, ${`user_b039ck_${name}_${tag}`}) returning id`;
    userIds.push(row.id);
    return row.id as number;
  }
  for (const name of ['satu', 'dua']) {
    const [row] = await sql`insert into templates (name, category) values (${`B-039 key ${name} ${tag}`}, 'wedding') returning id`;
    templateIds.push(row.id);
  }
  const [t1, t2] = templateIds;
  async function invitation(userId: number) {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, template_id, config)
      values (${userId}, ${`b039-ck-${tag}-${++serial}`}, 'wedding', 'DRAFT', ${t1}, '{}'::jsonb) returning id`;
    invitationIds.push(row.id);
    return row.id as number;
  }
  const checkout = (userId: number, invitationId: number, checkoutKey: string | null, change: Partial<Parameters<typeof service.createOrder>[0]> = {}) =>
    service.createOrder({
      userId,
      invitationId,
      templateId: t1,
      price: money(149_000, 'IDR'),
      tier: 'standard',
      description: 'Aktivasi undangan (B-039 check)',
      customerEmail: `b039-ck-${tag}@example.invalid`,
      successUrl: 'https://app.invitesion.test/checkout?paid=1',
      cancelUrl: 'https://app.invitesion.test/checkout?cancelled=1',
      checkoutKey,
      ...change,
    });
  const ordersOf = async (userId: number, invitationId: number) =>
    (await sql`select id, reference, status, checkout_key, provider_payment_id from orders where user_id = ${userId} and invitation_id = ${invitationId} order by id`) as unknown as {
      id: number;
      reference: string;
      status: string;
      checkout_key: string | null;
      provider_payment_id: string | null;
    }[];
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return null;
    } catch (error) {
      return error;
    }
  };
  const settle = (reference: string, status: 'PAID' | 'FAILED') =>
    service.settle(
      {
        rail: 'qris',
        eventId: `b039-ck-${tag}-${++serial}`,
        reference,
        providerPaymentId: null,
        status,
        paid: status === 'PAID' ? money(149_000, 'IDR') : null,
        raw: { source: 'verify-checkout-key' },
      },
      { ...env, BACKEND_PAYMENT: 'next' },
    );

  const owner = await customer('owner');
  const other = await customer('other');

  {
    const inv = await invitation(owner);
    const key = randomUUID();
    const taps = await Promise.all(Array.from({ length: 5 }, () => checkout(owner, inv, key)));
    const rows = await ordersOf(owner, inv);
    const charges = taps.filter((start): start is Extract<typeof start, { kind: 'charge' }> => start.kind === 'charge');
    const created = charges.filter((start) => !start.resumed).length;
    const payloads = new Set(charges.map((start) => start.handle.qrisPayload));
    check('five taps at once with one key make one order: one call created it, four resumed it, one QRIS code',
      rows.length === 1 && charges.length === 5 && new Set(charges.map((start) => start.orderId)).size === 1 && charges[0].orderId === rows[0].id &&
        created === 1 && payloads.size === 1 && rows[0].checkout_key === key && rows[0].status === 'PENDING',
      `${rows.length} orders, ${created} created, ${payloads.size} codes`);

    const retry = await checkout(owner, inv, key);
    check('a retry after a lost answer resumes that order and gets the same charge',
      retry.kind === 'charge' && retry.resumed && retry.orderId === rows[0].id && retry.reference === rows[0].reference &&
        retry.handle.qrisPayload === charges[0].handle.qrisPayload && (await ordersOf(owner, inv)).length === 1);

    const changes = [
      ['another price', { price: money(199_000, 'IDR') }],
      ['another tier', { tier: 'premium' }],
      ['another theme', { templateId: t2 }],
    ] as const;
    const conflicts = [];
    for (const [name, change] of changes) {
      const error = await refused(() => checkout(owner, inv, key, change));
      conflicts.push(`${name}: ${(error as Error)?.name ?? 'accepted'}`);
    }
    check('another price, tier or theme under the key is a conflict and writes nothing',
      conflicts.every((line) => line.endsWith('CheckoutConflictError')) && (await ordersOf(owner, inv)).length === 1, conflicts.join('; '));

    const elsewhere = await invitation(owner);
    const sameKeyElsewhere = await checkout(owner, elsewhere, key);
    check('the key is scoped to the invitation: the same key on another invitation makes that invitation its own order',
      sameKeyElsewhere.kind === 'charge' && !sameKeyElsewhere.resumed && sameKeyElsewhere.orderId !== rows[0].id && (await ordersOf(owner, elsewhere)).length === 1);

    const foreign = await checkout(other, inv, key);
    const [foreignRow] = await sql`select user_id from orders where id = ${foreign.orderId}`;
    check("the key is scoped to the customer: another customer's identical key never reaches the first customer's order",
      foreign.kind === 'charge' && !foreign.resumed && foreign.orderId !== rows[0].id && foreignRow.user_id === other && (await ordersOf(owner, inv)).length === 1);

    const paid = await settle(rows[0].reference, 'PAID');
    const afterPaid = await checkout(owner, inv, key);
    check('a paid key answers "paid" with its order and writes nothing',
      paid.applied && afterPaid.kind === 'paid' && afterPaid.orderId === rows[0].id && (await ordersOf(owner, inv)).length === 1);
  }

  {
    const inv = await invitation(owner);
    const key = randomUUID();
    const first = await checkout(owner, inv, key);
    const closed = await settle(first.reference, 'FAILED');
    const error = await refused(() => checkout(owner, inv, key));
    check('a failed key is closed: a fresh page starts a new attempt, nothing is written',
      closed.applied && error instanceof service.CheckoutClosedError && (await ordersOf(owner, inv)).length === 1);
    const fresh = await checkout(owner, inv, randomUUID());
    check('a fresh key after the failed attempt makes a new order', fresh.kind === 'charge' && !fresh.resumed && (await ordersOf(owner, inv)).length === 2);
  }

  {
    const inv = await invitation(owner);
    await checkout(owner, inv, null);
    await checkout(owner, inv, null);
    const rows = await ordersOf(owner, inv);
    check('without a key every submit makes its own order (the behaviour before B-039)', rows.length === 2 && rows.every((row) => row.checkout_key === null));
  }

  {
    const inv = await invitation(owner);
    const key = randomUUID();
    const calls = stripeKeys.length;
    const submits = await Promise.all(Array.from({ length: 3 }, () => checkout(owner, inv, key, { price: money(1_900, 'USD') })));
    const rows = await ordersOf(owner, inv);
    const seen = stripeKeys.slice(calls);
    const sessionIds = new Set(submits.map((start) => (start.kind === 'charge' ? start.handle.providerPaymentId : null)));
    check('Stripe: three submits at once make one order and one session, every call keyed checkout:<reference>',
      rows.length === 1 && seen.length === 3 && seen.every((value) => value === `checkout:${rows[0].reference}`) && sessionIds.size === 1 &&
        rows[0].provider_payment_id === [...sessionIds][0] && submits.every((start) => start.kind === 'charge' && start.handle.redirectUrl?.startsWith('https://')),
      `${rows.length} orders, ${seen.length} calls, ${sessionIds.size} sessions`);
  }

  {
    const inv = await invitation(owner);
    const key = randomUUID();
    failNextStripeCall = true;
    const outage = await refused(() => checkout(owner, inv, key, { price: money(1_900, 'USD') }));
    const during = await ordersOf(owner, inv);
    const retry = await checkout(owner, inv, key, { price: money(1_900, 'USD') });
    const after = await ordersOf(owner, inv);
    check('Stripe: a failure before the session existed leaves one pending order; the retry under the key resumes it and opens its session',
      outage instanceof ProviderError && during.length === 1 && during[0].provider_payment_id === null && retry.kind === 'charge' && retry.resumed &&
        retry.orderId === during[0].id && after.length === 1 && after[0].provider_payment_id === retry.handle.providerPaymentId && retry.handle.providerPaymentId !== null);
  }

  globalThis.fetch = realFetch;

  const [{ ids }] = await sql`select coalesce(array_agg(id), '{}') as ids from orders where user_id = any(${userIds})`;
  const orderIds = ids as number[];
  await sql`delete from jobs where kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`;
  await sql`delete from receipts where order_id = any(${orderIds})`;
  await sql`delete from payments where order_id = any(${orderIds})`;
  await sql`delete from payment_events where order_id = any(${orderIds}) or event_id like ${`b039-ck-${tag}-%`}`;
  await sql`delete from orders where id = any(${orderIds})`;
  await sql`delete from invitations where id = any(${invitationIds})`;
  await sql`delete from templates where id = any(${templateIds})`;
  await sql`delete from users where id = any(${userIds})`;
  const [{ left }] = await sql`select count(*)::int as left from users where id = any(${userIds})`;
  check('cleanup: no fixture row left', left === 0);

  await sql.end();
  console.log(`\nverify-checkout-key: ${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
