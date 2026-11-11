// G-050: receipts from recorded payments. The pure helpers (printed number, URL segment, what an owner sees, the item
// line), and the source guards that keep the design honest: one writer (the Rust runner, from the outbox delivery),
// numbers from one locked counter that a duplicate gives back, receipts copied from the order and its payment only,
// every read scoped to its owner, earlier payments re-armed on request, and the flag closing every surface.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isFlagOn } from '../lib/flags';
import { formatReceiptNumber, parseReceiptNumber, railLabel, receiptItem, receiptState } from '../lib/payment/receipt-format';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const path = join(dir, name);
    if (statSync(join(process.cwd(), path)).isDirectory()) files(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

test('G-050 numbers: printed KW- with six digits at least, parsed from a plain positive integer only', () => {
  assert.equal(formatReceiptNumber(1), 'KW-000001');
  assert.equal(formatReceiptNumber(123456), 'KW-123456');
  assert.equal(formatReceiptNumber(1234567), 'KW-1234567');
  assert.equal(parseReceiptNumber('12'), 12);
  assert.equal(parseReceiptNumber('2147483647'), 2147483647);
  for (const raw of ['', '0', '012', '-1', '+1', '1e3', '1.0', ' 1', 'KW-000001', '2147483648', '99999999999']) {
    assert.equal(parseReceiptNumber(raw), null, raw);
  }
});

test('G-050 states: issued wins; a due or leased row is being prepared; no row, delivered or given up is on request', () => {
  assert.equal(receiptState({ number: 7, job: null }), 'issued');
  assert.equal(receiptState({ number: 7, job: { done: false, givenUp: false } }), 'issued');
  assert.equal(receiptState({ number: null, job: { done: false, givenUp: false } }), 'preparing');
  assert.equal(receiptState({ number: null, job: null }), 'on_request', 'an earlier payment has no outbox row');
  assert.equal(receiptState({ number: null, job: { done: true, givenUp: false } }), 'on_request', 'delivered before receipts existed');
  assert.equal(receiptState({ number: null, job: { done: false, givenUp: true } }), 'on_request', 'given up');
});

test('G-050 receipt text: the item names only the tier; rails as customers know them', () => {
  assert.equal(receiptItem('standard', false), 'Aktivasi undangan digital, paket Standard');
  assert.equal(receiptItem('premium', true), 'Digital invitation activation, Premium package');
  assert.equal(receiptItem(null, false), 'Aktivasi undangan digital');
  assert.equal(railLabel('qris', false), 'QRIS');
  assert.equal(railLabel('stripe', true), 'Card (Stripe)');
});

test('G-050 flag: off by default; every surface answers 404 or shows nothing while it is off', () => {
  assert.equal(isFlagOn('RECEIPTS', {}), false);
  assert.equal(isFlagOn('RECEIPTS', { FLAG_RECEIPTS: 'on' }), true);
  for (const path of ['app/(customer)/dashboard/receipts/page.tsx', 'app/(customer)/dashboard/receipts/[number]/page.tsx', 'app/(customer)/dashboard/receipts/actions.ts']) {
    assert.match(source(path), /if \(!isFlagOn\('RECEIPTS'\)\) notFound\(\);/, path);
  }
  assert.match(source('app/(customer)/dashboard/layout.tsx'), /receiptsEnabled=\{isFlagOn\('RECEIPTS'\)\}/);
  assert.match(source('app/(customer)/dashboard/customer-shell.tsx'), /\.\.\.\(receiptsEnabled \? \[\['\/dashboard\/receipts'/);
  const checkout = source('app/(customer)/dashboard/invitations/[id]/checkout/page.tsx');
  assert.match(checkout, /const receiptsEnabled = isFlagOn\('RECEIPTS'\);/);
  // The settlement publishes the invitation, so the live state is the usual one after paying: it must carry the link too.
  assert.match(checkout, /This invitation is already live\.[\s\S]*?\{receiptLink\}[\s\S]*?Payment confirmed\. Your invitation is live\.[\s\S]*?\{receiptLink\}/);
  assert.match(source('.env.example'), /^# FLAG_RECEIPTS=off$/m);
});

test('G-050 reads: every query names the signed-in owner; a request locks the owner\'s own PAID order', () => {
  const lib = source('lib/payment/receipts.ts');
  const get = lib.slice(lib.indexOf('export async function getOwnerReceipt'), lib.indexOf('export async function ownerReceiptNumberForOrder'));
  assert.match(get, /\.where\(and\(eq\(receipts\.number, number\), eq\(receipts\.userId, userId\)\)\)/);
  const forOrder = lib.slice(lib.indexOf('export async function ownerReceiptNumberForOrder'), lib.indexOf('export type ReceiptRequest'));
  assert.match(forOrder, /eq\(receipts\.userId, userId\)/);
  const list = lib.slice(lib.indexOf('export async function listOwnerReceipts'), lib.indexOf('export type Receipt '));
  assert.match(list, /\.where\(and\(eq\(orders\.userId, userId\), eq\(orders\.status, 'PAID'\)\)\)/);
  const request = lib.slice(lib.indexOf('export async function requestReceipt'));
  assert.match(request, /\.where\(and\(eq\(orders\.id, orderId\), eq\(orders\.userId, userId\)\)\)\s*\.limit\(1\)\s*\.for\('update'\)/);
  assert.match(request, /if \(!order \|\| order\.status !== 'PAID'\) return 'not_found';/);
  assert.match(request, /setWhere: sql`\$\{jobs\.doneAt\} is not null or \$\{jobs\.attempts\} >= \$\{jobs\.maxAttempts\}`/,
    'a waiting row is left as it is; only a delivered or given-up row is re-armed');
  const page = source('app/(customer)/dashboard/receipts/[number]/page.tsx');
  assert.match(page, /const receipt = await getOwnerReceipt\(user\.id, number\);\s*if \(!receipt\) notFound\(\);/);
});

test('G-050 writer: only the Rust runner writes receipts, from the outbox delivery, numbered by one locked counter', () => {
  const offenders = [...files('app'), ...files('lib'), ...files('scripts')].filter((path) => {
    const text = source(path);
    return /\.insert\(receipts\)|\.update\(receipts\)|insert into receipts|update receipts|insert into receipt_counters|update receipt_counters/.test(text);
  });
  assert.deepEqual(offenders, [], 'no TypeScript writer of receipts or their counter');

  const rust = source('services/api/src/payment/receipt.rs');
  assert.match(rust, /insert into receipt_counters \(scope, last_number\) values \(\$1, 1\)\s*on conflict \(scope\) do update set last_number = receipt_counters\.last_number \+ 1\s*returning last_number/);
  assert.ok(rust.indexOf('insert into receipt_counters') < rust.indexOf('insert into receipts'), 'the number is taken under the counter lock first');
  assert.match(rust, /on conflict \(order_id\) do nothing\s*returning number/);
  assert.match(rust, /None => \{[\s\S]*?tx\.rollback\(\)\.await\?;/, 'a duplicate gives its number back by rolling back the increment');
  assert.ok(rust.indexOf('existing(pool, order_id)') < rust.indexOf('pool.begin()'), 'an issued receipt is found before any number is taken');
  assert.match(rust, /from orders o join payments p on p\.order_id = o\.id\s*where o\.id = \$1 and p\.id = \$2 and o\.status = 'PAID' and p\.status = 'PAID'/);
  assert.doesNotMatch(rust, /join (users|invitations|guests)/, 'nothing but the order and its payment is copied');

  const outbox = source('services/api/src/payment/outbox.rs');
  assert.match(outbox, /match receipt::issue\(pool, order_id, payment_id, utc_now\(\)\)\.await/);
  assert.match(outbox, /Err\(error\) => Outcome::Retry/);
});

test('G-050 storage: migration 0028 creates the two tables with one receipt per order, payment and number', () => {
  const dir = 'lib/db/migrations';
  const migration = readdirSync(join(process.cwd(), dir)).find((name) => name.startsWith('0028_'));
  assert.ok(migration, 'migration 0028 exists');
  const ddl = source(join(dir, migration));
  assert.match(ddl, /CREATE TABLE "receipt_counters"/);
  assert.match(ddl, /CREATE TABLE "receipts"/);
  for (const constraint of ['receipts_number_unique', 'receipts_order_unique', 'receipts_payment_unique']) {
    assert.match(ddl, new RegExp(`CONSTRAINT "${constraint}" UNIQUE`), constraint);
  }
  assert.doesNotMatch(ddl, /ALTER TABLE "(orders|payments|payment_events|invitations)"/, 'additive: no existing table changes');
});

test('G-050 CI: the rust job runs verify-receipts against the binaries and fails on a skip', () => {
  const rust = source('scripts/ci/rust.sh');
  assert.match(rust, /npx tsx scripts\/verify-receipts\.ts/);
  assert.match(rust, /step "receipts end to end \(G-050/);
});
