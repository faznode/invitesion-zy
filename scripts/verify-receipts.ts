/**
 * G-050, run by the rust job against the real binaries: receipts from recorded payments (D-065).
 *
 * Orders are settled through both writers (`BACKEND_PAYMENT` per call), one of them on a deleted invitation; then two
 * `invitesion-jobs` runners deliver the outbox at the same time. Each paid order gets exactly one receipt, copied from
 * its order and payment, and the numbers are the next ones with no gap; the orders, payments, events and invitations are
 * untouched by delivery. A second delivery (expired leases) issues nothing and takes no number. Receipts are read only by
 * their owner. An earlier payment (no outbox row), one whose row was delivered before receipts existed and one whose row
 * was given up get theirs on the owner's request, through the same runner; a row still waiting is left as it is; an older
 * row without `paid_at` takes its payment's own time; a request for another customer's, an unpaid, a closed or an unknown
 * order is refused and queues nothing. An issue that fails after taking its number gives the number back. Money on a
 * purged invitation is recorded and receipted without touching the tombstone; settlements racing two runners still get
 * consecutive numbers; the owner's deletion and the runner's purge keep the receipt, and a redelivery after the purge
 * takes no number. `FLAG_RECEIPTS` stays off throughout: issuing never reads it.
 *
 *   API_BASE_URL=… INTERNAL_API_SECRET=… POSTGRES_URL=… JOBS_BIN=… npx tsx scripts/verify-receipts.ts
 *
 * Synthetic data only (fake emails, `vne_` references); every row it makes is deleted at the end. It installs one
 * temporary trigger on `receipts`, scoped to one fixture order, and drops it again (also on failure).
 */
import Module from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const RECEIPT_COLUMNS = 'id,number,order_id,payment_id,user_id,reference,tier,amount,currency,rail,transaction_id,paid_at,issued_at';

async function main() {
  const env = process.env;
  if (!env.API_BASE_URL || !env.INTERNAL_API_SECRET || !env.POSTGRES_URL) {
    throw new Error('API_BASE_URL, INTERNAL_API_SECRET and POSTGRES_URL are required (scripts/ci/rust.sh sets them)');
  }
  const jobsBin = env.JOBS_BIN?.trim() ?? '';
  if (!jobsBin || !existsSync(jobsBin)) throw new Error(`JOBS_BIN must name the invitesion-jobs binary (got "${jobsBin}")`);
  env.STRIPE_SECRET_KEY = 'sk_test_g050_synthetic_no_account';
  env.STRIPE_WEBHOOK_SECRET = 'whsec_g050_synthetic_0123456789abcdef';
  // D-065 (6): the flag gates the owner's surfaces, never the issuing. This run keeps it off to prove that.
  delete env.FLAG_RECEIPTS;

  const { client: sql } = await import('@/lib/db/drizzle');
  const service = await import('@/lib/payment/service');
  const { money } = await import('@/lib/payment/money');
  const receipts = await import('@/lib/payment/receipts');
  const deletion = await import('@/lib/invitation/deletion-db');
  const { PURGE_JOB_KIND } = await import('@/lib/invitation/retention');
  const { isFlagOn } = await import('@/lib/flags');

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const userIds: number[] = [];
  const invitationIds: number[] = [];
  const orderIds: number[] = [];
  const uploads = mkdtempSync(join(tmpdir(), 'g050-jobs-'));
  const refusal = `g050_refuse_${tag}`;
  let refusalInstalled = false;
  const dropRefusal = async () => {
    if (!refusalInstalled) return;
    await sql.unsafe(`drop trigger ${refusal} on receipts`);
    await sql.unsafe(`drop function ${refusal}()`);
    refusalInstalled = false;
  };

  const user = async (name: string) => {
    const [row] = await sql`insert into users (email, clerk_user_id) values (${`g050-${name}-${tag}@example.invalid`}, ${`user_g050_${name}_${tag}`}) returning id`;
    userIds.push(row.id);
    return row.id as number;
  };
  const invitation = async (userId: number, name: string) => {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status) values (${userId}, ${`g050-${name}-${tag}`}, 'wedding', 'DRAFT') returning id`;
    invitationIds.push(row.id);
    return row.id as number;
  };
  const pending = async (userId: number, invitationId: number, name: string, amount = 149000) => {
    const [row] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status)
      values (${userId}, ${invitationId}, 'standard', ${amount}, 'IDR', 'qris', ${`vne_g050_${name}_${tag}`}, 'PENDING') returning id, reference`;
    orderIds.push(row.id);
    return { id: row.id as number, reference: row.reference as string, amount };
  };
  const settle = async (order: { reference: string; amount: number }, writer: 'next' | 'rust') =>
    service.settle(
      { rail: 'qris', eventId: `g050-${writer}-${order.reference}`, reference: order.reference, providerPaymentId: `trx-${order.reference}`, status: 'PAID', paid: money(order.amount, 'IDR'), raw: { source: 'g050' } },
      { ...env, BACKEND_PAYMENT: writer },
    );
  const counter = async () => (await sql`select coalesce((select last_number from receipt_counters where scope = 'receipt'), 0)::int as n`)[0].n as number;
  const mine = async () => (await sql`select order_id, number from receipts where order_id = any(${orderIds}) order by number`) as unknown as { order_id: number; number: number }[];
  const receiptOf = async (orderId: number) => (await sql`select number, paid_at, tier, transaction_id from receipts where order_id = ${orderId}`)[0];
  const jobOf = async (orderId: number) =>
    (await sql`select id, payload, attempts, max_attempts, run_at, locked_until, last_error, done_at from jobs
      where kind = 'payment_settled' and dedupe_key = ${`order:${orderId}`}`)[0];
  const jobsFor = async (id: number) => (await sql`select count(*)::int as n from jobs where kind = 'payment_settled' and dedupe_key = ${`order:${id}`}`)[0].n as number;
  const stateOf = async (userId: number, orderId: number) => (await receipts.listOwnerReceipts(userId)).find((row) => row.orderId === orderId)?.state;
  const invitationRow = async (id: number) =>
    JSON.stringify((await sql`select status, published_at, expires_at, deleted_at, purge_after, purged_at, config from invitations where id = ${id}`)[0]);
  /** The money and the invitations this run made, as text: what delivery must leave exactly as it was. */
  const digest = async () =>
    (await sql`select coalesce(string_agg(r, '|' order by r), '') as rows from (
        select o::text as r from orders o where o.id = any(${orderIds})
        union all select p::text from payments p where p.order_id = any(${orderIds})
        union all select e::text from payment_events e where e.order_id = any(${orderIds})
        union all select i::text from invitations i where i.id = any(${invitationIds})) t`)[0].rows as string;
  /** One order's financial record and its receipt, as text: what a purge must keep. */
  const record = async (orderId: number) =>
    (await sql`select coalesce(string_agg(r, '|' order by r), '') as rows from (
        select o::text as r from orders o where o.id = ${orderId}
        union all select p::text from payments p where p.order_id = ${orderId}
        union all select e::text from payment_events e where e.order_id = ${orderId}
        union all select x::text from receipts x where x.order_id = ${orderId}) t`)[0].rows as string;
  const jobsEnv = { PATH: env.PATH ?? '/usr/bin:/bin', DATABASE_URL: env.POSTGRES_URL, UPLOAD_ROOT: uploads, JOBS_BATCH: '2', RUST_LOG: 'warn' };
  const runOnce = () =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(jobsBin, [], { env: jobsEnv as unknown as NodeJS.ProcessEnv });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out.trim().split('\n').pop() ?? '') : reject(new Error(`invitesion-jobs exit ${code}`))));
    });
  /** This run's outbox rows a runner can take now (a row backing off after a failure is not counted). */
  const due = async () =>
    (await sql`select count(*)::int as n from jobs where kind = 'payment_settled' and done_at is null and attempts < max_attempts
      and run_at <= (now() at time zone 'utc') and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`)[0].n as number;
  /** Two runners at once, pass after pass, until none of this run's rows is due. */
  const drain = async () => {
    const passes: string[] = [];
    for (let round = 0; round < 30 && (await due()) > 0; round++) passes.push(...(await Promise.all([runOnce(), runOnce()])));
    return passes;
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // The numbering checks compare against the counter's value at each step, so no other outbox row may be waiting for a
  // runner: this script's runners would deliver it too and take a number in between. CI's database is fresh and every
  // earlier step deletes its own rows; elsewhere, use a fresh database.
  const [{ foreign }] = await sql`select count(*)::int as foreign from jobs where kind = 'payment_settled' and done_at is null and attempts < max_attempts`;
  if (foreign > 0) {
    check('precondition: no other payment_settled row is waiting (the numbering checks need a controlled counter)', false, `${foreign} waiting`);
    rmSync(uploads, { recursive: true, force: true });
    await sql.end();
    process.exit(1);
  }

  try {
    const [{ cols }] = await sql`select string_agg(column_name, ',' order by ordinal_position) as cols from information_schema.columns where table_name = 'receipts'`;
    check('receipts hold only the payment record: number, order, payment, owner, reference, tier, amount, currency, rail, transaction, paid and issued times', cols === RECEIPT_COLUMNS, cols);
    check('FLAG_RECEIPTS is off for this run (every receipt below is issued with the owner surfaces closed)', !isFlagOn('RECEIPTS', env));

    const owner = await user('owner');
    const other = await user('other');
    const settled: { id: number; writer: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const writer = i % 2 === 0 ? 'next' : 'rust';
      const order = await pending(owner, await invitation(owner, `owner-${i}`), `owner_${i}`);
      const out = await settle(order, writer);
      settled.push({ id: order.id, writer });
      if (!out.applied) check(`settlement ${i} through ${writer} applied`, false, JSON.stringify(out));
    }
    const deletedInvitation = await invitation(owner, 'deleted');
    const onDeleted = await pending(owner, deletedInvitation, 'deleted');
    await sql`update invitations set deleted_at = (now() at time zone 'utc'), purge_after = (now() at time zone 'utc') + interval '30 days' where id = ${deletedInvitation}`;
    const deletedOut = await settle(onDeleted, 'rust');
    const deletedBefore = await invitationRow(deletedInvitation);
    const otherOrder = await pending(other, await invitation(other, 'other'), 'other', 99000);
    await settle(otherOrder, 'next');
    check('eight settlements through both writers, one on a deleted invitation (paid, not activated)',
      settled.length === 6 && deletedOut.applied && !deletedOut.invitationActivated);

    const start = await counter();
    const listed = await receipts.listOwnerReceipts(owner);
    check('before the runner: no receipt, and the owner sees each paid order as being prepared',
      (await mine()).length === 0 && listed.length === 7 && listed.every((row) => row.state === 'preparing' && row.number === null), `${listed.length} rows`);

    const recordBefore = await digest();
    const passes = await drain();
    const issued = await mine();
    const numbers = issued.map((row) => row.number);
    check('two runners at once: one receipt per paid order (8), numbered with the next numbers and no gap',
      issued.length === 8 && new Set(issued.map((row) => row.order_id)).size === 8
        && JSON.stringify(numbers) === JSON.stringify(Array.from({ length: 8 }, (_, i) => start + 1 + i)) && (await counter()) === start + 8,
      `start ${start}, numbers ${numbers.join(',')}; ${passes.length} passes`);
    const [{ faithful }] = await sql`select count(*)::int as faithful from receipts r join orders o on o.id = r.order_id join payments p on p.id = r.payment_id
      where r.order_id = any(${orderIds}) and p.order_id = o.id and p.status = 'PAID' and o.status = 'PAID' and r.user_id = o.user_id
        and r.reference = o.reference and r.tier is not distinct from o.tier and r.amount = o.amount and r.currency = o.currency
        and r.rail = o.rail and r.transaction_id is not distinct from p.transaction_id and r.paid_at = o.paid_at`;
    check('every receipt equals its order and payment (owner, reference, tier, amount, currency, rail, transaction, paid time)', faithful === 8, `${faithful} / 8`);
    const [{ delivered: deliveredRows, clean }] = await sql`select count(*) filter (where done_at is not null)::int as delivered,
        count(*) filter (where done_at is not null and last_error is null and locked_until is null)::int as clean
      from jobs where kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`;
    check('delivery wrote only receipts and job state: orders, payments, events and invitations unchanged; all eight rows done, no error, no lease',
      (await digest()) === recordBefore && deliveredRows === 8 && clean === 8, `${deliveredRows} delivered, ${clean} clean`);
    check('the deleted invitation stays deleted and unpublished after its receipt', (await invitationRow(deletedInvitation)) === deletedBefore);

    await sql`update jobs set done_at = null, locked_until = (now() at time zone 'utc') - interval '1 minute'
      where kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`;
    await drain();
    check('delivered again after expired leases: no receipt added, no number taken',
      JSON.stringify((await mine()).map((row) => row.number)) === JSON.stringify(numbers) && (await counter()) === start + 8);

    const otherNumber = issued.find((row) => row.order_id === otherOrder.id)?.number ?? -1;
    const ownNumber = issued.find((row) => row.order_id === settled[0].id)?.number ?? -1;
    const ownerList = await receipts.listOwnerReceipts(owner);
    check('owner scope: a customer reads their own receipt, never another customer\'s (same answer as a number never issued)',
      (await receipts.getOwnerReceipt(owner, ownNumber))?.orderId === settled[0].id
        && (await receipts.getOwnerReceipt(owner, otherNumber)) === null
        && (await receipts.getOwnerReceipt(other, otherNumber))?.orderId === otherOrder.id
        && (await receipts.getOwnerReceipt(owner, 2_000_000_000)) === null
        && ownerList.length === 7 && ownerList.every((row) => row.state === 'issued')
        && (await receipts.listOwnerReceipts(other)).length === 1);

    // An earlier payment: PAID with its payment and no outbox row, as before B-039.
    const [earlier] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status, paid_at)
      values (${owner}, ${await invitation(owner, 'earlier')}, 'premium', 249000, 'IDR', 'qris', ${`vne_g050_earlier_${tag}`}, 'PAID', (now() at time zone 'utc') - interval '90 days')
      returning id`;
    orderIds.push(earlier.id);
    await sql`insert into payments (order_id, provider, transaction_id, status, raw_payload) values (${earlier.id}, 'qris', null, 'PAID', '{}')`;
    const unpaid = await pending(owner, await invitation(owner, 'unpaid'), 'unpaid');
    const earlierState = await stateOf(owner, earlier.id);
    const crossed = await receipts.requestReceipt(other, earlier.id);
    const notPaid = await receipts.requestReceipt(owner, unpaid.id);
    check('an earlier payment is offered on request; another customer\'s or an unpaid order is refused and queues nothing',
      earlierState === 'on_request' && crossed === 'not_found' && notPaid === 'not_found' && (await jobsFor(earlier.id)) === 0 && (await jobsFor(unpaid.id)) === 0,
      `${earlierState} ${crossed} ${notPaid}`);
    const first = await receipts.requestReceipt(owner, earlier.id);
    const second = await receipts.requestReceipt(owner, earlier.id);
    const waiting = await stateOf(owner, earlier.id);
    check('the owner\'s request queues one outbox row (asked twice) and the order reads as being prepared',
      first === 'queued' && second === 'queued' && (await jobsFor(earlier.id)) === 1 && waiting === 'preparing', `${first} ${second} ${waiting}`);
    await drain();
    const [earlierReceipt] = await sql`select number, tier, amount, paid_at = (select paid_at from orders where id = ${earlier.id}) as same_time from receipts where order_id = ${earlier.id}`;
    check('the runner issues it with the next number and the earlier payment\'s own data; asking again answers issued',
      earlierReceipt?.number === start + 9 && earlierReceipt.tier === 'premium' && earlierReceipt.amount === 249000 && earlierReceipt.same_time === true
        && (await receipts.requestReceipt(owner, earlier.id)) === 'issued' && (await counter()) === start + 9 && (await jobsFor(earlier.id)) === 1);

    // Delivered before receipts existed: its row is done, the receipt missing. The request re-arms that same row.
    const beforeReceipts = await pending(owner, await invitation(owner, 'before'), 'before');
    await settle(beforeReceipts, 'rust');
    await sql`update jobs set done_at = (now() at time zone 'utc'), attempts = 1 where kind = 'payment_settled' and dedupe_key = ${`order:${beforeReceipts.id}`}`;
    const delivered = await stateOf(owner, beforeReceipts.id);
    const rearmed = await receipts.requestReceipt(owner, beforeReceipts.id);
    const [row] = await sql`select done_at is null as due, attempts, last_error from jobs where kind = 'payment_settled' and dedupe_key = ${`order:${beforeReceipts.id}`}`;
    await drain();
    const [late] = await sql`select number from receipts where order_id = ${beforeReceipts.id}`;
    check('a row delivered before receipts existed is re-armed by the request and the receipt follows with the next number',
      delivered === 'on_request' && rearmed === 'queued' && row?.due === true && row.attempts === 0 && row.last_error === null
        && late?.number === start + 10 && (await jobsFor(beforeReceipts.id)) === 1,
      `${delivered} ${rearmed} ${JSON.stringify(row)} ${late?.number}`);

    // A row still waiting is left exactly as it is; a row given up (attempts exhausted) is re-armed by the request.
    const stillWaiting = await pending(owner, await invitation(owner, 'waiting'), 'waiting');
    await settle(stillWaiting, 'next');
    const waitingRow = JSON.stringify(await jobOf(stillWaiting.id));
    const waitingState = await stateOf(owner, stillWaiting.id);
    const waitingAnswer = await receipts.requestReceipt(owner, stillWaiting.id);
    check('a row still waiting: shown as being prepared; the request answers queued and leaves the row exactly as it was',
      waitingState === 'preparing' && waitingAnswer === 'queued' && JSON.stringify(await jobOf(stillWaiting.id)) === waitingRow && (await jobsFor(stillWaiting.id)) === 1,
      `${waitingState} ${waitingAnswer}`);
    const exhausted = await pending(owner, await invitation(owner, 'exhausted'), 'exhausted');
    await settle(exhausted, 'rust');
    await sql`update jobs set attempts = max_attempts, last_error = 'synthetic: given up', locked_until = null
      where kind = 'payment_settled' and dedupe_key = ${`order:${exhausted.id}`}`;
    const exhaustedState = await stateOf(owner, exhausted.id);
    const exhaustedAnswer = await receipts.requestReceipt(owner, exhausted.id);
    const [revived] = await sql`select done_at is null as open, attempts, last_error, locked_until, run_at <= (now() at time zone 'utc') as due_now
      from jobs where kind = 'payment_settled' and dedupe_key = ${`order:${exhausted.id}`}`;
    check('a row given up (attempts exhausted) reads as on request; the request re-arms it: no attempt counted, no error, due now',
      exhaustedState === 'on_request' && exhaustedAnswer === 'queued' && revived?.open === true && revived.attempts === 0 && revived.last_error === null
        && revived.locked_until === null && revived.due_now === true && (await jobsFor(exhausted.id)) === 1,
      `${exhaustedState} ${exhaustedAnswer} ${JSON.stringify(revived)}`);
    const beforePair = await counter();
    await drain();
    const pair = [(await receiptOf(stillWaiting.id))?.number, (await receiptOf(exhausted.id))?.number].sort((a, b) => a - b);
    check('both are issued by the runner with the next two numbers',
      JSON.stringify(pair) === JSON.stringify([beforePair + 1, beforePair + 2]) && (await counter()) === beforePair + 2, JSON.stringify(pair));

    // An older paid row without `paid_at`: the receipt takes the payment row's own time (D-065 (2)).
    const [legacy] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status, paid_at)
      values (${owner}, ${await invitation(owner, 'legacy')}, null, 99000, 'IDR', 'qris', ${`vne_g050_legacy_${tag}`}, 'PAID', null) returning id`;
    orderIds.push(legacy.id);
    await sql`insert into payments (order_id, provider, transaction_id, status, raw_payload, created_at)
      values (${legacy.id}, 'qris', ${`trx-legacy-${tag}`}, 'PAID', '{}', (now() at time zone 'utc') - interval '400 days')`;
    const legacyAnswer = await receipts.requestReceipt(owner, legacy.id);
    await drain();
    const [legacyReceipt] = await sql`select r.paid_at = p.created_at as payment_time, r.tier, r.transaction_id, r.amount
      from receipts r join payments p on p.id = r.payment_id where r.order_id = ${legacy.id}`;
    check('an older paid row without paid_at is receipted with its payment row\'s time, its missing tier kept missing',
      legacyAnswer === 'queued' && legacyReceipt?.payment_time === true && legacyReceipt.tier === null
        && legacyReceipt.transaction_id === `trx-legacy-${tag}` && legacyReceipt.amount === 99000, JSON.stringify(legacyReceipt));

    // Closed orders and an unknown order are refused like an unpaid one.
    const closed: number[] = [];
    for (const status of ['FAILED', 'EXPIRED']) {
      const [closedRow] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status)
        values (${owner}, ${await invitation(owner, status.toLowerCase())}, 'standard', 149000, 'IDR', 'qris', ${`vne_g050_${status.toLowerCase()}_${tag}`}, ${status}) returning id`;
      orderIds.push(closedRow.id);
      closed.push(closedRow.id);
    }
    const closedAnswers = [await receipts.requestReceipt(owner, closed[0]), await receipts.requestReceipt(owner, closed[1])];
    const unknownAnswer = await receipts.requestReceipt(owner, 2_000_000_000);
    const listedClosed = (await receipts.listOwnerReceipts(owner)).filter((r) => closed.includes(r.orderId)).length;
    check('closed orders (FAILED, EXPIRED) and an unknown order are refused, queue nothing and are never listed',
      closedAnswers.every((answer) => answer === 'not_found') && unknownAnswer === 'not_found'
        && (await jobsFor(closed[0])) === 0 && (await jobsFor(closed[1])) === 0 && listedClosed === 0,
      `${closedAnswers.join(',')} ${unknownAnswer}`);

    // An issue that fails after its increment (a refusal raised by the receipt insert) rolls the number back with it.
    const failing = await pending(owner, await invitation(owner, 'failing'), 'failing');
    await settle(failing, 'next');
    await sql.unsafe(`create function ${refusal}() returns trigger language plpgsql as $$ begin raise exception 'g050 synthetic refusal'; end $$`);
    refusalInstalled = true;
    await sql.unsafe(`create trigger ${refusal} before insert on receipts for each row when (new.order_id = ${Number(failing.id)}) execute function ${refusal}()`);
    const beforeFailure = await counter();
    await runOnce();
    const [failed] = await sql`select done_at, attempts, last_error, run_at > (now() at time zone 'utc') as backing_off from jobs
      where kind = 'payment_settled' and dedupe_key = ${`order:${failing.id}`}`;
    check('an issue failing after its increment: no receipt, the counter unchanged, the row kept for a later retry with its error',
      !(await receiptOf(failing.id)) && (await counter()) === beforeFailure && failed?.done_at === null && failed.attempts === 1
        && /issuing the receipt of order/.test(String(failed.last_error)) && /g050 synthetic refusal/.test(String(failed.last_error)) && failed.backing_off === true,
      JSON.stringify(failed));
    await dropRefusal();
    await sql`update jobs set run_at = (now() at time zone 'utc') - interval '1 second' where kind = 'payment_settled' and dedupe_key = ${`order:${failing.id}`}`;
    await drain();
    check('the retry issues it with the very number the failed attempt gave back',
      (await receiptOf(failing.id))?.number === beforeFailure + 1 && (await counter()) === beforeFailure + 1);

    // Money arriving for purged invitations (tombstones), through both writers: recorded and receipted, never reactivated.
    const tombstones: { id: number; order: Awaited<ReturnType<typeof pending>>; writer: 'next' | 'rust'; before: string }[] = [];
    for (const writer of ['next', 'rust'] as const) {
      const id = await invitation(owner, `tomb-${writer}`);
      const order = await pending(owner, id, `tomb_${writer}`);
      await sql`update invitations set deleted_at = (now() at time zone 'utc') - interval '40 days', purge_after = (now() at time zone 'utc') - interval '10 days',
        purged_at = (now() at time zone 'utc') - interval '10 days', config = null where id = ${id}`;
      tombstones.push({ id, order, writer, before: await invitationRow(id) });
    }
    const tombOutcomes = [];
    for (const tomb of tombstones) tombOutcomes.push(await settle(tomb.order, tomb.writer));
    await drain();
    const tombsKept = [];
    for (const tomb of tombstones) tombsKept.push((await invitationRow(tomb.id)) === tomb.before && Boolean(await receiptOf(tomb.order.id)));
    check('payments on purged invitations through both writers: recorded without activation, receipted, the tombstones untouched',
      tombOutcomes.every((out) => out.applied && !out.invitationActivated) && tombsKept.every(Boolean), JSON.stringify(tombOutcomes));

    // Settlements racing two runners: six orders settle at once through both writers while two runners deliver.
    const racers = [];
    for (let i = 0; i < 6; i++) racers.push(await pending(owner, await invitation(owner, `race-${i}`), `race_${i}`));
    const raceStart = await counter();
    let settling = true;
    const runners = (async () => {
      for (let round = 0; round < 80 && (settling || (await due()) > 0); round++) {
        if ((await due()) === 0) await sleep(50);
        else await Promise.all([runOnce(), runOnce()]);
      }
    })();
    const raceOutcomes = await Promise.all(racers.map((order, i) => settle(order, i % 2 === 0 ? 'next' : 'rust')));
    settling = false;
    await runners;
    await drain();
    const raced = ((await sql`select number from receipts where order_id = any(${racers.map((order) => order.id)}) order by number`) as unknown as { number: number }[]).map((r) => r.number);
    check('settlements racing two runners: one receipt per order, the next six numbers, no gap',
      raceOutcomes.every((out) => out.applied) && JSON.stringify(raced) === JSON.stringify(Array.from({ length: 6 }, (_, i) => raceStart + 1 + i)) && (await counter()) === raceStart + 6,
      `start ${raceStart}, numbers ${raced.join(',')}`);

    // The owner deletes an invitation with a receipted payment and the runner purges it: the receipt, the order, its
    // payment and event are kept exactly; a redelivery after the purge takes no number and leaves the tombstone as it is.
    const doomed = await invitation(owner, 'purged');
    const doomedOrder = await pending(owner, doomed, 'purged');
    await settle(doomedOrder, 'rust');
    await drain();
    const keptBefore = await record(doomedOrder.id);
    const scheduled = await deletion.scheduleInvitationDeletion(owner, doomed, { FLAG_INVITATION_DELETION: 'on', INVITATION_DELETION_WINDOW_DAYS: '30' });
    await sql`update invitations set purge_after = deleted_at where id = ${doomed}`;
    await sql`update jobs set run_at = (select deleted_at from invitations where id = ${doomed}) where kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int = ${doomed}`;
    const purgeDone = async () => (await sql`select count(*)::int as n from jobs where kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int = ${doomed} and done_at is not null`)[0].n === 1;
    for (let i = 0; i < 5 && !(await purgeDone()); i++) await runOnce();
    const tomb = await invitationRow(doomed);
    const tombParsed = JSON.parse(tomb) as { purged_at: string | null; config: unknown; deleted_at: string | null };
    await sql`update jobs set done_at = null, locked_until = null, run_at = (now() at time zone 'utc') - interval '1 second'
      where kind = 'payment_settled' and dedupe_key = ${`order:${doomedOrder.id}`}`;
    const beforeRedelivery = await counter();
    await drain();
    check('the purge keeps the receipt, order, payment and event exactly; a redelivery after it takes no number; the tombstone stays one',
      scheduled.kind === 'scheduled' && (await purgeDone()) && tombParsed.purged_at !== null && tombParsed.config === null && tombParsed.deleted_at !== null
        && (await record(doomedOrder.id)) === keptBefore && keptBefore.includes(`vne_g050_purged_${tag}`)
        && (await counter()) === beforeRedelivery && (await invitationRow(doomed)) === tomb
        && (await receipts.requestReceipt(owner, doomedOrder.id)) === 'issued' && (await stateOf(owner, doomedOrder.id)) === 'issued',
      `${scheduled.kind} ${tomb}`);

    const end = await counter();
    const [{ holes, ours }] = await sql`select
        (select count(*)::int from generate_series(${start + 1}::int, ${end}::int) s(n) where not exists (select 1 from receipts where number = s.n)) as holes,
        (select count(*)::int from receipts where order_id = any(${orderIds}) and number between ${start + 1} and ${end}) as ours`;
    const [{ open }] = await sql`select count(*)::int as open from jobs where kind = 'payment_settled' and done_at is null and dedupe_key = any(${orderIds.map((id) => `order:${id}`)})`;
    check(`numbers issued in this run: ${end - start}, from the next one, without a hole, every one this run's; no outbox row left open`,
      holes === 0 && ours === end - start && open === 0, `holes ${holes}, ours ${ours}, open ${open}`);
  } finally {
    // A failure between creating the function and dropping it leaves either or both; drop what exists, quietly.
    if (refusalInstalled) {
      await sql.unsafe(`drop trigger if exists ${refusal} on receipts`).catch(() => undefined);
      await sql.unsafe(`drop function if exists ${refusal}()`).catch(() => undefined);
    }
    await sql`delete from jobs where (kind = 'payment_settled' and dedupe_key = any(${orderIds.map((id) => `order:${id}`)}))
      or (kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int = any(${invitationIds}))`;
    await sql`delete from receipts where order_id = any(${orderIds})`;
    await sql`delete from payments where order_id = any(${orderIds})`;
    await sql`delete from payment_events where order_id = any(${orderIds}) or event_id like ${`g050-%-vne_g050_%_${tag}`}`;
    await sql`delete from api_idempotency_keys where scope = 'payment:settlement' and (response_body->>'orderId') = any(${orderIds.map(String)})`;
    await sql`delete from orders where id = any(${orderIds})`;
    await sql`delete from invitations where id = any(${invitationIds})`;
    await sql`delete from users where id = any(${userIds})`;
    const [{ left }] = await sql`select (select count(*) from orders where id = any(${orderIds})) + (select count(*) from users where id = any(${userIds}))
      + (select count(*) from api_idempotency_keys where scope = 'payment:settlement' and (response_body->>'orderId') = any(${orderIds.map(String)}))::int as left`;
    check('cleanup: no fixture row left (orders, users, settlement keys)', Number(left) === 0);
    rmSync(uploads, { recursive: true, force: true });
    await sql.end();
  }

  if (failures) {
    console.log(`verify-receipts: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('verify-receipts: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
