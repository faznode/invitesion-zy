// G-053: coupons. The rule set (server-computed discounts, one use per rule, explicit stacking, the floor), the checkout
// intent that keeps every coupon-free hash unchanged, the console's parser, and the source guards: the discount is
// decided on the server under the coupons' row locks, nothing about it comes from the form but the codes, and the flag
// closes the checkout field without hiding the console.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isFlagOn } from '../lib/flags';
import { checkoutIntentHash } from '../lib/payment/checkout-key';
import {
  COUPON_REFUSALS,
  MIN_CHARGE,
  decideCoupons,
  normalizeCouponCode,
  normalizeCouponCodes,
  parseCouponInput,
  wellFormedCoupon,
  type CouponRow,
  type CouponUsage,
} from '../lib/payment/coupons';
import { money } from '../lib/payment/money';
import { couponNotice } from '../app/(customer)/dashboard/invitations/[id]/checkout/coupon-notice';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const NOW = new Date('2026-11-10T07:00:00Z');
const row = (over: Partial<CouponRow> & { id: number; code: string }): CouponRow => ({
  kind: 'percent',
  percentOff: 10,
  amountOff: null,
  currency: null,
  tier: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  perCustomer: 1,
  stackable: false,
  active: true,
  disabledAt: null,
  ...over,
});
const decide = (codes: string[], coupons: CouponRow[], usage: Record<number, CouponUsage> = {}, list = money(149_000, 'IDR'), tier = 'standard') =>
  decideCoupons({ list, tier, now: NOW, codes, coupons, usage: new Map(Object.entries(usage).map(([id, u]) => [Number(id), u])) });

test('G-053 codes: normalised, de-duplicated, sorted; at most three; anything else refused', () => {
  assert.deepEqual(normalizeCouponCodes(undefined), { ok: true, codes: [] });
  assert.deepEqual(normalizeCouponCodes('  '), { ok: true, codes: [] });
  assert.deepEqual(normalizeCouponCodes(' hemat10 '), { ok: true, codes: ['HEMAT10'] });
  assert.deepEqual(normalizeCouponCodes('zz-2, aa1;zz-2 aa1'), { ok: true, codes: ['AA1', 'ZZ-2'] });
  assert.deepEqual(normalizeCouponCodes('A1B C2D E3F G4H'), { ok: false, reason: 'too_many' });
  for (const raw of ['ab', '-ABC', 'ÄBC', 'A'.repeat(33), 'AB!', 'abc<script>']) assert.deepEqual(normalizeCouponCodes(raw), { ok: false, reason: 'invalid' }, raw);
  assert.deepEqual(normalizeCouponCodes(42), { ok: false, reason: 'invalid' });
  assert.equal(normalizeCouponCode(' new-year-2027 '), 'NEW-YEAR-2027');
  assert.equal(normalizeCouponCode('x'), null);
});

test('G-053 discounts: computed from the server price; percentages first, then fixed; rounded down per coupon', () => {
  const ten = row({ id: 1, code: 'TEN', percentOff: 10, stackable: true });
  const fixed = row({ id: 2, code: 'MINUS5K', kind: 'fixed', percentOff: null, amountOff: 5_000, currency: 'IDR', stackable: true });
  const third = row({ id: 3, code: 'THIRD', percentOff: 33, stackable: true });

  const one = decide(['TEN'], [ten]);
  assert.ok(one.ok);
  assert.deepEqual([one.payable, one.lines], [money(134_100, 'IDR'), [{ couponId: 1, code: 'TEN', discount: 14_900 }]]);

  // Fixed is applied after the percentage whatever the codes' order, so the result does not depend on how they were typed.
  const both = decide(['MINUS5K', 'TEN'], [fixed, ten]);
  assert.ok(both.ok);
  assert.equal(both.payable.amount, 149_000 - 14_900 - 5_000);
  assert.deepEqual(both.lines.map((l) => l.code), ['TEN', 'MINUS5K']);

  // 33 % of 299 000 is 98 670; of 1 901 cents it is 627 (rounded down from 627.33), and the floor allows what is left.
  const premium = decide(['THIRD'], [third], {}, money(299_000, 'IDR'), 'premium');
  assert.ok(premium.ok);
  assert.equal(premium.payable.amount, 200_330);
  const usd = decide(['THIRD'], [third], {}, money(1_901, 'USD'));
  assert.ok(usd.ok);
  assert.equal(usd.lines[0].discount, Math.floor((1_901 * 33) / 100));

  assert.deepEqual(decide([], []), { ok: true, list: money(149_000, 'IDR'), payable: money(149_000, 'IDR'), lines: [] });
});

test('G-053 rules: each refusal names its code, in the documented order', () => {
  const ok = row({ id: 1, code: 'OK10' });
  const cases: [string, CouponRow[], string[], Record<number, CouponUsage>, string][] = [
    ['too_many', [ok], ['AAA', 'BBB', 'CCC', 'DDD'], {}, 'DDD'],
    ['unknown', [ok], ['NOPE'], {}, 'NOPE'],
    ['malformed', [row({ id: 2, code: 'BAD', percentOff: 100 })], ['BAD'], {}, 'BAD'],
    ['malformed', [row({ id: 2, code: 'BAD', kind: 'bogus' })], ['BAD'], {}, 'BAD'],
    ['inactive', [row({ id: 2, code: 'OFF', active: false })], ['OFF'], {}, 'OFF'],
    ['inactive', [row({ id: 2, code: 'GONE', disabledAt: new Date('2026-11-01T00:00:00Z') })], ['GONE'], {}, 'GONE'],
    ['not_started', [row({ id: 2, code: 'SOON', startsAt: new Date('2026-11-11T00:00:00Z') })], ['SOON'], {}, 'SOON'],
    ['expired', [row({ id: 2, code: 'PAST', endsAt: NOW })], ['PAST'], {}, 'PAST'],
    ['wrong_tier', [row({ id: 2, code: 'PREM', tier: 'premium' })], ['PREM'], {}, 'PREM'],
    ['wrong_currency', [row({ id: 2, code: 'USD5', kind: 'fixed', percentOff: null, amountOff: 500, currency: 'USD' })], ['USD5'], {}, 'USD5'],
    ['not_stackable', [ok, row({ id: 2, code: 'ALSO', stackable: true })], ['ALSO', 'OK10'], {}, 'OK10'],
    ['already_used', [ok], ['OK10'], { 1: { live: 1, mine: 1 } }, 'OK10'],
    ['exhausted', [row({ id: 2, code: 'LAST', maxRedemptions: 3 })], ['LAST'], { 2: { live: 3, mine: 0 } }, 'LAST'],
    ['below_minimum', [row({ id: 2, code: 'BIG', kind: 'fixed', percentOff: null, amountOff: 148_500, currency: 'IDR' })], ['BIG'], {}, 'BIG'],
  ];
  for (const [reason, coupons, codes, usage, code] of cases) assert.deepEqual(decide(codes, coupons, usage), { ok: false, reason, code }, reason);
  assert.deepEqual(new Set(cases.map((c) => c[0])), new Set(COUPON_REFUSALS));

  // Inside the limits: a second customer, a window that has started, a cap not reached, a per-customer limit of two.
  assert.ok(decide(['OK10'], [ok], { 1: { live: 7, mine: 0 } }).ok);
  assert.ok(decide(['WIN'], [row({ id: 3, code: 'WIN', startsAt: NOW, endsAt: new Date('2026-12-01T00:00:00Z') })]).ok);
  assert.ok(decide(['CAP'], [row({ id: 4, code: 'CAP', maxRedemptions: 3 })], { 4: { live: 2, mine: 0 } }).ok);
  assert.ok(decide(['TWICE'], [row({ id: 5, code: 'TWICE', perCustomer: 2 })], { 5: { live: 1, mine: 1 } }).ok);
  // The floor is a floor: exactly the minimum is allowed.
  const exact = decide(['EXACT'], [row({ id: 6, code: 'EXACT', kind: 'fixed', percentOff: null, amountOff: 149_000 - MIN_CHARGE.IDR, currency: 'IDR' })]);
  assert.ok(exact.ok && exact.payable.amount === MIN_CHARGE.IDR);
});

test('G-053 rows: only what the console and the database checks accept is well formed', () => {
  assert.ok(wellFormedCoupon(row({ id: 1, code: 'P1' + 'X' })));
  assert.ok(wellFormedCoupon(row({ id: 1, code: 'FIX', kind: 'fixed', percentOff: null, amountOff: 1, currency: 'USD' })));
  for (const bad of [
    row({ id: 1, code: 'P0', percentOff: 0 }),
    row({ id: 1, code: 'P99X', percentOff: 99.5 }),
    row({ id: 1, code: 'MIX', percentOff: 10, amountOff: 10 }),
    row({ id: 1, code: 'FIX', kind: 'fixed', percentOff: null, amountOff: 100, currency: 'EUR' }),
    row({ id: 1, code: 'LIM', perCustomer: 0 }),
    row({ id: 1, code: 'CAP', maxRedemptions: 0 }),
    row({ id: 1, code: 'WIN', startsAt: NOW, endsAt: NOW }),
  ]) {
    assert.equal(wellFormedCoupon(bad), false, JSON.stringify(bad));
  }
});

test('G-053 intent: coupon-free hashes are unchanged; codes are part of the intent next to the price before coupons', () => {
  const base = { invitationId: 7, templateId: 3, tier: 'standard', amount: 149_000, currency: 'IDR', rail: 'qris' };
  // The B-039 hash of this intent, computed with the s39 field list: PENDING orders keyed before G-053 still resume.
  const s39 = createHash('sha256').update(JSON.stringify([7, 3, 'standard', 149_000, 'IDR', 'qris'])).digest('hex');
  assert.equal(checkoutIntentHash(base), s39);
  assert.equal(checkoutIntentHash({ ...base, coupons: [] }), s39);
  const withCode = checkoutIntentHash({ ...base, coupons: ['TEN'] });
  assert.notEqual(withCode, s39);
  assert.notEqual(withCode, checkoutIntentHash({ ...base, coupons: ['TEN', 'MINUS5K'] }));
});

test('G-053 console: the create form is parsed strictly; amounts in the currency unit; the window in WIB', () => {
  const tiers = ['standard', 'premium'];
  const percent = parseCouponInput({ code: ' hemat-10 ', kind: 'percent', percent: '10', perCustomer: '1' }, tiers);
  assert.ok(percent.ok);
  assert.deepEqual(
    { code: percent.value.code, percentOff: percent.value.percentOff, amountOff: percent.value.amountOff, currency: percent.value.currency, stackable: percent.value.stackable },
    { code: 'HEMAT-10', percentOff: 10, amountOff: null, currency: null, stackable: false },
  );
  const usd = parseCouponInput({ code: 'USD-OFF', kind: 'fixed', amount: '4.5', currency: 'USD', stackable: 'on', tier: 'premium', maxRedemptions: '100' }, tiers);
  assert.ok(usd.ok && usd.value.amountOff === 450 && usd.value.stackable && usd.value.tier === 'premium' && usd.value.maxRedemptions === 100);
  const windowed = parseCouponInput({ code: 'WINDOW', kind: 'percent', percent: '5', startsAt: '2026-12-01T00:00', endsAt: '2026-12-31T23:59' }, tiers);
  assert.ok(windowed.ok && windowed.value.startsAt?.toISOString() === '2026-11-30T17:00:00.000Z');
  const refusals: [Record<string, string>, string][] = [
    [{ code: 'x', kind: 'percent', percent: '5' }, 'code'],
    [{ code: 'OKAY', kind: 'gift', percent: '5' }, 'kind'],
    [{ code: 'OKAY', kind: 'percent', percent: '100' }, 'percent'],
    [{ code: 'OKAY', kind: 'percent', percent: '7.5' }, 'percent'],
    [{ code: 'OKAY', kind: 'fixed', amount: '1000', currency: 'EUR' }, 'currency'],
    [{ code: 'OKAY', kind: 'fixed', amount: '10.5', currency: 'IDR' }, 'amount'],
    [{ code: 'OKAY', kind: 'fixed', amount: '0', currency: 'IDR' }, 'amount'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', tier: 'gold' }, 'tier'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', startsAt: '2026-12-02T00:00', endsAt: '2026-12-01T00:00' }, 'window'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', startsAt: '2026-02-30T00:00' }, 'window'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', maxRedemptions: '0' }, 'max'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', perCustomer: '-1' }, 'per_customer'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', partner: '<b>Mitra</b>' }, 'partner'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', partner: '-dash first' }, 'partner'],
    [{ code: 'OKAY', kind: 'percent', percent: '5', partner: 'M'.repeat(65) }, 'partner'],
  ];
  for (const [fields, error] of refusals) assert.deepEqual(parseCouponInput(fields, tiers), { ok: false, error }, error);

  // Affiliate attribution: an optional console label, trimmed and with inner runs of space collapsed; empty is none.
  const partner = parseCouponInput({ code: 'MITRA-A', kind: 'percent', percent: '5', partner: "  Toko   Kartu & Co. Bu Sari's  " }, tiers);
  assert.ok(partner.ok && partner.value.partner === "Toko Kartu & Co. Bu Sari's");
  const none = parseCouponInput({ code: 'MITRA-B', kind: 'percent', percent: '5', partner: '   ' }, tiers);
  assert.ok(none.ok && none.value.partner === null);
  assert.ok(percent.value.partner === null);
});

test('G-053 notices: every refusal, the closed flag and a malformed field say nothing was charged; inactive reads as unknown', () => {
  for (const reason of [...COUPON_REFUSALS, 'unavailable', 'invalid']) {
    for (const en of [true, false]) {
      const notice = couponNotice(reason, en);
      assert.match(notice, en ? / Nothing was charged\.$/ : / Belum ada tagihan\.$/, `${reason} ${en}`);
    }
  }
  // A code that exists but is not active must not be told apart from one that does not exist.
  assert.equal(couponNotice('inactive', true), couponNotice('unknown', true));
  assert.equal(couponNotice('malformed', false), couponNotice('unknown', false));
  assert.notEqual(couponNotice('unavailable', true), couponNotice('unknown', true));
});

test('G-053 server side: the discount is decided under the coupons row locks, from the server price, never the form', () => {
  const service = source('lib/payment/service.ts');
  assert.match(service, /\.from\(coupons\)\.where\(inArray\(coupons\.code, codes\)\)\.orderBy\(asc\(coupons\.id\)\)\.for\('update'\)/);
  // The key is looked up again under the locks before anything is counted, so a same-key submit resumes.
  assert.match(service, /for\('update'\);\s*const found = await keyedOrder\(tx\);/);
  assert.match(service, /decideCoupons\(\{ list: price, tier, now, codes, coupons: rows, usage \}\)/);
  assert.match(service, /amount: decision\.payable\.amount, listAmount: price\.amount/);
  assert.match(service, /charge = money\(existing\.amount, price\.currency\)/);
  // The flag closes new coupon orders only after the key's own order was looked for, so that order still resumes.
  assert.match(service, /if \(found\) return \{ kind: 'existing' as const, found \};\s*if \(!couponsOpen\) throw new CouponRefusedError\('unavailable', null\);/);
  const action = source('app/(customer)/dashboard/invitations/[id]/checkout/actions.ts');
  assert.match(action, /formData\.get\('couponCodes'\)/);
  assert.doesNotMatch(action, /formData\.get\('(amount|price|discount|percent)'\)/);
  assert.match(action, /const couponsOpen = isFlagOn\('COUPONS'\);/);
  assert.match(action, /reason=\$\{couponsOpen \? parsed\.reason : 'unavailable'\}/);
  assert.match(action, /checkoutKey,\s*couponCodes,\s*couponsOpen,\s*\}\)/);
  assert.match(action, /error instanceof CouponRefusedError/);
});

test('G-053 close unpaid: an operator closes a manual QRIS order through the settlement, never directly', () => {
  const service = source('lib/payment/service.ts');
  const close = service.slice(service.indexOf('export async function closeUnpaid'), service.indexOf('export async function settle('));
  assert.match(close, /if \(order\.rail !== 'qris'\) throw new RailMismatchError\('qris', order\.rail\);/);
  assert.match(close, /return settle\(\{\s*rail: 'qris',\s*eventId: `manual-close:\$\{reference\}`,/);
  assert.match(close, /status: 'EXPIRED',\s*paid: null,/);
  assert.doesNotMatch(close, /\.update\(orders\)/);
  const actions = source('app/(admin)/admin/[entry]/(console)/orders/actions.ts');
  const closeAction = actions.slice(actions.indexOf('export async function closeOrderUnpaid'));
  assert.match(closeAction, /const admin = assertAuthorizedAdmin\(await getUser\(\)\);/);
  const page = source('app/(admin)/admin/[entry]/(console)/orders/page.tsx');
  // Offered only where the confirmation is: a PENDING order on the manual QRIS rail.
  assert.match(page, /\{awaitingManual \? \(\s*<div className="flex flex-wrap gap-2">\s*<form action=\{confirmOrderPaid\}>[\s\S]*<form action=\{closeOrderUnpaid\}>/);
});

test('G-053 flag: off by default; the checkout field and its codes follow it, the console does not', () => {
  assert.equal(isFlagOn('COUPONS', {}), false);
  assert.equal(isFlagOn('COUPONS', { FLAG_COUPONS: 'on' }), true);
  const page = source('app/(customer)/dashboard/invitations/[id]/checkout/page.tsx');
  assert.match(page, /const couponsEnabled = isFlagOn\('COUPONS'\);/);
  assert.match(page, /\{couponsEnabled && \(\s*<div className="mt-4">\s*<label htmlFor="couponCodes"/);
  const consolePage = source('app/(admin)/admin/[entry]/(console)/coupons/page.tsx');
  assert.match(consolePage, /assertAuthorizedAdmin\(await getUser\(\)\)/);
  const actions = source('app/(admin)/admin/[entry]/(console)/coupons/actions.ts');
  assert.equal((actions.match(/assertAuthorizedAdmin\(await getUser\(\)\)/g) ?? []).length, 3);
  assert.match(source('lib/payment/coupon-admin.ts'), /values\(\{ \.\.\.input, active: false, createdBy: adminUserId \}\)/);
  assert.match(source('.env.example'), /^# FLAG_COUPONS=off$/m);
});
