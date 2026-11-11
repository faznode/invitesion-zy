/**
 * G-053 (D-066), run by the database job (and by the rust job with the API, for the Rust writer's section): coupons on
 * a database migrated by drizzle-kit, through the real `createOrder` (the manual QRIS rail with a synthetic static QR)
 * and the console's own functions.
 *
 *  - a new coupon is inactive and refused until activated; a refusal writes nothing;
 *  - the discount is computed on the server and recorded on the order (`amount`, `list_amount`, `order_coupons`), and the
 *    QRIS code charges the discounted amount;
 *  - five taps with one key and one code reach one order and one redemption; another code under the key is a conflict;
 *  - a cap of three with eight customers at once: exactly three orders, five refusals, no other row;
 *  - one use per rule per customer; a failed order and a pending one past its window give their redemption back;
 *  - stacking only between stackable coupons, percentages before fixed amounts; window, tier, currency, floor, disabled;
 *  - with coupons closed (`FLAG_COUPONS` off) no new coupon order is written, but a key's own coupon order resumes;
 *  - an operator's close of a windowless manual order gives its redemption back; pressing twice is a duplicate, and a
 *    confirmation after it is kept without effect;
 *  - the discounted order settles once at its discounted amount; the full price is refused and nothing is kept; a close
 *    frees a redemption; the console reports the partner and what paid orders charged; with `API_BASE_URL` and
 *    `INTERNAL_API_SECRET` the writer steps run through the Rust writer too (`BACKEND_PAYMENT=rust`).
 *
 *   POSTGRES_URL=… [API_BASE_URL=… INTERNAL_API_SECRET=… REQUIRE_RUST=1] npx tsx scripts/verify-coupons.ts
 *
 * Synthetic data only (fake emails, `vne_` references, `G053` codes); every row it makes is deleted at the end.
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
  const rust = Boolean(env.API_BASE_URL && env.INTERNAL_API_SECRET);
  if (env.REQUIRE_RUST === '1' && !rust) throw new Error('REQUIRE_RUST=1 needs API_BASE_URL and INTERNAL_API_SECRET');

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

  const { client: sql } = await import('@/lib/db/drizzle');
  const service = await import('@/lib/payment/service');
  const admin = await import('@/lib/payment/coupon-admin');
  const { CouponRefusedError } = await import('@/lib/payment/coupons');
  const { money } = await import('@/lib/payment/money');

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const code = (name: string) => `G053-${name}-${tag}`.slice(0, 32);
  const userIds: number[] = [];
  const invitationIds: number[] = [];
  const couponIds: number[] = [];
  let serial = 0;

  async function customer(name: string) {
    const [row] = await sql`insert into users (email, clerk_user_id) values (${`g053-${name}-${tag}@example.invalid`.toLowerCase()}, ${`user_g053_${name}_${tag}`}) returning id`;
    userIds.push(row.id);
    return row.id as number;
  }
  const [template] = await sql`insert into templates (name, category) values (${`G-053 coupons ${tag}`}, 'wedding') returning id`;
  const templateId = template.id as number;
  async function invitation(userId: number) {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, template_id, config)
      values (${userId}, ${`g053-${tag.toLowerCase()}-${++serial}`}, 'wedding', 'DRAFT', ${templateId}, '{}'::jsonb) returning id`;
    invitationIds.push(row.id);
    return row.id as number;
  }
  const operator = await customer('admin');
  async function coupon(input: Partial<Parameters<typeof admin.createCoupon>[0]> & { code: string }, activate = true) {
    const created = await admin.createCoupon(
      { kind: 'percent', percentOff: 10, amountOff: null, currency: null, tier: null, startsAt: null, endsAt: null, maxRedemptions: null, perCustomer: 1, stackable: false, partner: null, ...input },
      operator,
    );
    if (!created.ok) throw new Error(`coupon ${input.code}: ${created.error}`);
    couponIds.push(created.id);
    if (activate) await admin.setCouponActive(created.id, true);
    return created.id;
  }
  const checkout = (userId: number, invitationId: number, codes: string[], key: string | null = randomUUID(), price = money(149_000, 'IDR'), tier = 'standard', couponsOpen = true) =>
    service.createOrder({
      couponsOpen,
      userId,
      invitationId,
      templateId,
      price,
      tier,
      description: 'Aktivasi undangan (G-053 check)',
      customerEmail: `g053-${tag}@example.invalid`.toLowerCase(),
      successUrl: 'https://app.invitesion.test/checkout?paid=1',
      cancelUrl: 'https://app.invitesion.test/checkout?cancelled=1',
      checkoutKey: key,
      couponCodes: [...codes].sort(),
    });
  const refusal = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return 'accepted';
    } catch (error) {
      return error instanceof CouponRefusedError ? error.reason : (error as Error).name;
    }
  };
  const count = async () => {
    const [row] = await sql`select (select count(*)::int from orders where user_id = any(${userIds})) as orders,
      (select count(*)::int from order_coupons where user_id = any(${userIds})) as lines`;
    return `${row.orders}/${row.lines}`;
  };
  const orderRow = async (id: number) =>
    (await sql`select amount, list_amount, status from orders where id = ${id}`)[0] as { amount: number; list_amount: number | null; status: string };

  try {
    // 1. Created inactive; refused until activated, writing nothing.
    const c1 = await customer('c1');
    const i1 = await invitation(c1);
    const ten = await coupon({ code: code('TEN') }, false);
    const before = await count();
    check('a new coupon is inactive and refused until activated; the refusal writes nothing', (await refusal(() => checkout(c1, i1, [code('TEN')]))) === 'inactive' && (await count()) === before, before);
    await admin.setCouponActive(ten, true);

    // 2. Server-computed and recorded on the order; the QR charges the discounted amount.
    const start = await checkout(c1, i1, [code('TEN')]);
    const o1 = start.kind === 'charge' ? start.orderId : -1;
    const row1 = await orderRow(o1);
    const [line1] = await sql`select coupon_id, discount, position, user_id from order_coupons where order_id = ${o1}`;
    check(
      'the discount is computed on the server: 10 % of 149 000 → amount 134 100, list 149 000, one line with its discount',
      row1.amount === 134_100 && row1.list_amount === 149_000 && line1?.coupon_id === ten && line1?.discount === 14_900 && line1?.position === 1 && line1?.user_id === c1,
      JSON.stringify(row1),
    );
    const qr = start.kind === 'charge' ? (start.handle.qrisPayload ?? '') : '';
    check('the QRIS code carries the discounted amount (tag 54 = 134100)', qr.includes('5406134100'));

    // 3. One key, one code, five taps: one order and one redemption; another code under the key conflicts.
    const c2 = await customer('c2');
    const i2 = await invitation(c2);
    const key = randomUUID();
    const tapped = await Promise.all(Array.from({ length: 5 }, () => checkout(c2, i2, [code('TEN')], key).catch((error: Error) => error)));
    const taps = tapped.filter((t): t is Awaited<ReturnType<typeof checkout>> => !(t instanceof Error));
    const tapErrors = tapped.filter((t): t is Error => t instanceof Error).map((e) => (e instanceof CouponRefusedError ? e.reason : e.name));
    const tapOrders = new Set(taps.map((t) => (t.kind === 'charge' ? t.orderId : -1)));
    const [{ n: c2lines }] = await sql`select count(*)::int as n from order_coupons where user_id = ${c2}`;
    check(
      'five taps with one key and one code reach one order and one redemption (the others resume it)',
      tapErrors.length === 0 && tapOrders.size === 1 && c2lines === 1 && taps.filter((t) => t.kind === 'charge' && t.resumed).length === 4,
      `${tapOrders.size} orders, ${c2lines} lines, refused ${JSON.stringify(tapErrors)}`,
    );
    const minus = await coupon({ code: code('MINUS'), kind: 'fixed', percentOff: null, amountOff: 5_000, currency: 'IDR', stackable: true, partner: 'Mitra Uji G053' });
    const beforeConflict = await count();
    check('another code under the same key is a conflict and writes nothing', (await refusal(() => checkout(c2, i2, [code('MINUS')], key))) === 'CheckoutConflictError' && (await count()) === beforeConflict);

    // 4. A cap of three, eight customers at once.
    const cap = await coupon({ code: code('CAP'), maxRedemptions: 3 });
    const racers = await Promise.all(Array.from({ length: 8 }, async (_, n) => {
      const user = await customer(`r${n}`);
      return { user, invitation: await invitation(user) };
    }));
    const raced = await Promise.all(racers.map((r) => refusal(() => checkout(r.user, r.invitation, [code('CAP')]))));
    const capOrders = (await sql`select o.id, o.user_id from order_coupons oc join orders o on o.id = oc.order_id where oc.coupon_id = ${cap} order by o.id`) as unknown as { id: number; user_id: number }[];
    const racerOrders = (await sql`select count(*)::int as n from orders where user_id = any(${racers.map((r) => r.user)})`)[0].n as number;
    check(
      'a cap of three with eight customers at once: exactly three orders, five refusals as exhausted, no other order',
      raced.filter((r) => r === 'accepted').length === 3 && raced.filter((r) => r === 'exhausted').length === 5 && capOrders.length === 3 && racerOrders === 3,
      JSON.stringify(raced),
    );

    // 5. One use per rule; a failed order and a pending one past its window give the redemption back.
    const i1b = await invitation(c1);
    check('one use per customer: the same customer on another invitation is refused as already used', (await refusal(() => checkout(c1, i1b, [code('TEN')]))) === 'already_used');
    const [failedOrder] = (await sql`select reference from orders where id = ${capOrders[0].id}`) as unknown as { reference: string }[];
    await service.settle({ rail: 'qris', eventId: `g053-fail-${tag}`, reference: failedOrder.reference, providerPaymentId: null, status: 'FAILED', paid: null, raw: { g053: true } });
    // Three racers without an order are needed below; a broken cap leaves fewer, which those checks then report.
    const [late1, late2, late3] = racers.filter((r) => !capOrders.some((o) => o.user_id === r.user));
    const attempt = (racer: { user: number; invitation: number } | undefined) =>
      racer ? refusal(() => checkout(racer.user, racer.invitation, [code('CAP')])) : Promise.resolve('no racer left without an order');
    check('a failed order gives its redemption back: the next customer is accepted', (await attempt(late1)) === 'accepted');
    if (capOrders[1]) await sql`update orders set expires_at = (now() at time zone 'utc') - interval '1 minute' where id = ${capOrders[1].id}`;
    check('a pending order past its window gives its redemption back too', (await attempt(late2)) === 'accepted');
    check('…and the cap holds again: the next one is exhausted', (await attempt(late3)) === 'exhausted');

    // 6. Stacking, the window, tier, currency, floor and disabled.
    const c3 = await customer('c3');
    const stackPct = await coupon({ code: code('STACK'), percentOff: 20, stackable: true });
    void stackPct;
    const loner = await coupon({ code: code('LONE'), percentOff: 15 });
    void loner;
    const i3 = await invitation(c3);
    check('two coupons when one does not allow stacking: refused, nothing written', (await refusal(() => checkout(c3, i3, [code('LONE'), code('STACK')]))) === 'not_stackable');
    const stacked = await checkout(c3, i3, [code('MINUS'), code('STACK')]);
    const stackedRow = stacked.kind === 'charge' ? await orderRow(stacked.orderId) : null;
    check('two stackable coupons: the percentage first, then the fixed amount (149 000 → 119 200 → 114 200)', stackedRow?.amount === 114_200 && stackedRow?.list_amount === 149_000, JSON.stringify(stackedRow));
    const c4 = await customer('c4');
    await coupon({ code: code('PAST'), endsAt: new Date(Date.now() - 60_000) });
    await coupon({ code: code('SOON'), startsAt: new Date(Date.now() + 86_400_000) });
    await coupon({ code: code('PREM'), tier: 'premium' });
    await coupon({ code: code('USD'), kind: 'fixed', percentOff: null, amountOff: 500, currency: 'USD' });
    await coupon({ code: code('HUGE'), kind: 'fixed', percentOff: null, amountOff: 148_500, currency: 'IDR' });
    const gone = await coupon({ code: code('GONE') });
    await admin.disableCoupon(gone);
    const refusals: Record<string, string> = {};
    for (const [name, expected] of [['PAST', 'expired'], ['SOON', 'not_started'], ['PREM', 'wrong_tier'], ['USD', 'wrong_currency'], ['HUGE', 'below_minimum'], ['GONE', 'inactive'], ['NOPE', 'unknown']] as const) {
      const inv = await invitation(c4);
      const got = await refusal(() => checkout(c4, inv, [code(name)]));
      refusals[name] = got === expected ? got : `${got} (expected ${expected})`;
    }
    const [{ n: c4orders }] = await sql`select count(*)::int as n from orders where user_id = ${c4}`;
    check('ended, not started, other tier, other currency, below the floor, disabled and unknown codes: refused, nothing written', Object.values(refusals).every((r) => !r.includes('expected')) && c4orders === 0, JSON.stringify(refusals));
    const premiumOk = await refusal(() => checkout(c4, invitationIds[invitationIds.length - 1], [code('PREM')], randomUUID(), money(299_000, 'IDR'), 'premium'));
    check('the premium-only coupon applies to a premium checkout', premiumOk === 'accepted');
    check('a disabled code stays reserved: creating it again is a duplicate', (await admin.createCoupon({ code: code('GONE'), kind: 'percent', percentOff: 5, amountOff: null, currency: null, tier: null, startsAt: null, endsAt: null, maxRedemptions: null, perCustomer: 1, stackable: false, partner: null }, operator)).ok === false);

    // 6b. Coupons closed (FLAG_COUPONS off): no new coupon order, but a key's own coupon order still resumes.
    const c5 = await customer('c5');
    const i5 = await invitation(c5);
    const beforeClosed = await count();
    check('with coupons closed a new coupon order is refused as unavailable and nothing is written', (await refusal(() => checkout(c5, i5, [code('STACK')], randomUUID(), undefined, undefined, false))) === 'unavailable' && (await count()) === beforeClosed);
    const resumeKey = randomUUID();
    const opened = await checkout(c5, i5, [code('STACK')], resumeKey);
    const resumedClosed = await checkout(c5, i5, [code('STACK')], resumeKey, undefined, undefined, false);
    check(
      '…while the order its key already made with that code resumes at its own discounted amount',
      opened.kind === 'charge' && resumedClosed.kind === 'charge' && resumedClosed.resumed && resumedClosed.orderId === opened.orderId && (resumedClosed.handle.qrisPayload ?? '').includes('5406119200'),
      JSON.stringify({ opened: opened.orderId, resumed: resumedClosed.kind === 'charge' && resumedClosed.resumed }),
    );

    // 6c. A windowless manual order holds its redemption until an operator closes it.
    const solo = await coupon({ code: code('SOLO'), maxRedemptions: 1 });
    const c6 = await customer('c6');
    const held = await checkout(c6, await invitation(c6), [code('SOLO')]);
    const heldRow = held.kind === 'charge' ? (await sql`select expires_at, reference from orders where id = ${held.orderId}`)[0] : null;
    const c7 = await customer('c7');
    const i7 = await invitation(c7);
    check('a manual QRIS order has no payment window and holds the only redemption', heldRow?.expires_at === null && (await refusal(() => checkout(c7, i7, [code('SOLO')]))) === 'exhausted');
    const closed = await service.closeUnpaid({ reference: held.reference, adminUserId: operator, note: 'G-053 check' });
    const closedAgain = await service.closeUnpaid({ reference: held.reference, adminUserId: operator });
    check('the operator closes it unpaid (EXPIRED, no payment); a second press is a duplicate', closed.applied && !closedAgain.applied && (await orderRow(held.kind === 'charge' ? held.orderId : -1)).status === 'EXPIRED', JSON.stringify([closed, closedAgain]));
    check('…which gives the redemption back: the next customer is accepted', (await refusal(() => checkout(c7, i7, [code('SOLO')]))) === 'accepted');
    const late = await service.confirmManually({ reference: held.reference, adminUserId: operator, note: 'arrived after the close' });
    const [{ n: latePays }] = await sql`select count(*)::int as n from payments where order_id = ${held.kind === 'charge' ? held.orderId : -1}`;
    check('a confirmation after the close is kept without effect: still EXPIRED, no payment row', !late.applied && latePays === 0 && (await orderRow(held.kind === 'charge' ? held.orderId : -1)).status === 'EXPIRED', JSON.stringify(late));
    const [stripeOrder] = await sql`insert into orders (user_id, invitation_id, template_id, tier, amount, currency, rail, reference, status)
      values (${c7}, ${i7}, ${templateId}, 'standard', 1900, 'USD', 'stripe', ${`vne_g053stripe${tag.toLowerCase()}`}, 'PENDING') returning id, reference`;
    check('a Stripe order cannot be closed by hand (it closes through its own expiry webhook)', (await refusal(() => service.closeUnpaid({ reference: stripeOrder.reference, adminUserId: operator }))) === 'RailMismatchError' && (await orderRow(stripeOrder.id)).status === 'PENDING');
    void solo;

    // 7. Settlement verifies the discounted amount, through each writer.
    const writers: [string, Record<string, string | undefined>][] = [['next', { ...env, BACKEND_PAYMENT: 'next' }]];
    if (rust) writers.push(['rust', { ...env, BACKEND_PAYMENT: 'rust' }]);
    for (const [writer, writerEnv] of writers) {
      const payer = await customer(`pay-${writer}`);
      const inv = await invitation(payer);
      const order = await checkout(payer, inv, [code('MINUS')]);
      const id = order.kind === 'charge' ? order.orderId : -1;
      const reference = order.reference;
      const full = await refusal(() => service.settle({ rail: 'qris', eventId: `g053-full-${writer}-${tag}`, reference, providerPaymentId: null, status: 'PAID', paid: money(149_000, 'IDR'), raw: { g053: true } }, writerEnv));
      const afterFull = await orderRow(id);
      const [{ n: kept }] = await sql`select count(*)::int as n from payment_events where event_id = ${`g053-full-${writer}-${tag}`}`;
      check(`${writer}: the full price on a discounted order is refused and nothing is kept`, full === 'AmountMismatchError' && afterFull.status === 'PENDING' && kept === 0, `${full} ${afterFull.status} events=${kept}`);
      const paid = await service.settle({ rail: 'qris', eventId: `g053-paid-${writer}-${tag}`, reference, providerPaymentId: null, status: 'PAID', paid: money(144_000, 'IDR'), raw: { g053: true } }, writerEnv);
      const again = await service.settle({ rail: 'qris', eventId: `g053-paid-${writer}-${tag}`, reference, providerPaymentId: null, status: 'PAID', paid: money(144_000, 'IDR'), raw: { g053: true } }, writerEnv);
      const [{ n: pays }] = await sql`select count(*)::int as n from payments where order_id = ${id}`;
      check(`${writer}: the discounted amount settles the order once (a redelivery is a duplicate)`, paid.applied && !again.applied && (await orderRow(id)).status === 'PAID' && pays === 1, JSON.stringify([paid, again]));

      // A close through this writer gives a held redemption back (the operator's close names the writer's settlement).
      await coupon({ code: code(`ONE${writer.toUpperCase()}`), maxRedemptions: 1 });
      const holder = await customer(`hold-${writer}`);
      const hold = await checkout(holder, await invitation(holder), [code(`ONE${writer.toUpperCase()}`)]);
      const closeEvent = await service.settle({ rail: 'qris', eventId: `manual-close:${hold.reference}`, reference: hold.reference, providerPaymentId: null, status: 'EXPIRED', paid: null, raw: { g053: true } }, writerEnv);
      const next = await customer(`next-${writer}`);
      const nextInvitation = await invitation(next);
      const freed = await refusal(() => checkout(next, nextInvitation, [code(`ONE${writer.toUpperCase()}`)]));
      check(`${writer}: closing a held order gives its redemption back`, closeEvent.applied && freed === 'accepted', JSON.stringify({ closeEvent, freed }));
    }

    // 8. The console's counts read the same rule.
    const listing = (await admin.listCouponsWithUsage()).find((row) => row.id === cap);
    check('the console counts the cap\'s live redemptions (3 of 3) and none paid', listing?.live === 3 && listing?.paid === 0, JSON.stringify({ live: listing?.live, paid: listing?.paid }));
    const minusListing = (await admin.listCouponsWithUsage()).find((row) => row.id === minus);
    check(
      '…and a coupon paid through the writers as paid, with its partner and what the paid orders charged (144 000 each)',
      (minusListing?.paid ?? 0) === writers.length && minusListing?.partner === 'Mitra Uji G053' && minusListing?.paidIdr === 144_000 * writers.length && minusListing?.paidUsd === 0,
      JSON.stringify({ live: minusListing?.live, paid: minusListing?.paid, partner: minusListing?.partner, paidIdr: minusListing?.paidIdr }),
    );
  } finally {
    const orderIds = ((await sql`select id from orders where user_id = any(${userIds})`) as unknown as { id: number }[]).map((r) => r.id);
    await sql`delete from order_coupons where order_id = any(${orderIds})`;
    await sql`delete from jobs where kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`;
    await sql`delete from receipts where order_id = any(${orderIds})`;
    await sql`delete from payments where order_id = any(${orderIds})`;
    await sql`delete from payment_events where order_id = any(${orderIds}) or event_id like ${`g053-%-${tag}`}`;
    // The Rust writer records its answer under a key the Next.js caller minted; this run's answers name its orders.
    await sql`delete from api_idempotency_keys where scope = 'payment:settlement' and response_body->>'orderId' = any(${orderIds.map(String)})`;
    await sql`delete from orders where id = any(${orderIds})`;
    await sql`delete from coupons where id = any(${couponIds})`;
    await sql`delete from invitations where id = any(${invitationIds})`;
    await sql`delete from templates where id = ${templateId}`;
    await sql`delete from users where id = any(${userIds})`;
    const [left] = await sql`select (select count(*)::int from coupons where code like ${`G053-%-${tag}`}) + (select count(*)::int from users where id = any(${userIds})) as n`;
    check('cleanup: no fixture row left (coupons, orders, users)', Number(left.n) === 0);
    await sql.end();
  }

  console.log(failures === 0 ? 'verify-coupons: all checks passed' : `verify-coupons: ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('verify-coupons failed:', error);
  process.exit(1);
});
