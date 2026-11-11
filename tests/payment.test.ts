import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  formatMoney,
  fromStripeAmount,
  money,
  sameMoney,
  toStripeAmount,
} from '../lib/payment/money';
import {
  crc16,
  formatQrisAmount,
  isStaticPayload,
  parseTlv,
  QrisPayloadError,
  serialiseTlv,
  verifyChecksum,
  withAmount,
} from '../lib/payment/qris-payload';
import {
  computeSignature,
  parseSignatureHeader,
  StripeSignatureError,
  verifyStripeSignature,
} from '../lib/payment/stripe-signature';
import { railForCurrency } from '../lib/payment/types';

// ── Money ────────────────────────────────────────────────────

test('money refuses non-integer and negative amounts', () => {
  assert.throws(() => money(1.5, 'IDR'), TypeError);
  assert.throws(() => money(-1, 'USD'), TypeError);
  assert.deepEqual(money(149_000, 'IDR'), { amount: 149_000, currency: 'IDR' });
});

test('IDR is scaled for Stripe but not for our own accounting', () => {
  // We hold whole rupiah; Stripe counts IDR in hundredths. Sending 149000
  // unscaled would charge Rp1.490 instead of Rp149.000.
  assert.equal(toStripeAmount(money(149_000, 'IDR')), 14_900_000);
  // USD is already in cents on both sides.
  assert.equal(toStripeAmount(money(1999, 'USD')), 1999);
});

test('reading a Stripe amount back is exactly inverse', () => {
  assert.deepEqual(fromStripeAmount(14_900_000, 'IDR'), money(149_000, 'IDR'));
  assert.deepEqual(fromStripeAmount(1999, 'USD'), money(1999, 'USD'));
});

test('a Stripe IDR amount that is not whole rupiah is refused, not rounded', () => {
  // Rp149.000,50 cannot correspond to anything we issued. Rounding it would
  // silently accept an underpayment.
  assert.throws(() => fromStripeAmount(14_900_050, 'IDR'), RangeError);
});

test('formatting respects each currency exponent', () => {
  assert.match(formatMoney(money(149_000, 'IDR'), 'id'), /149\.000/);
  assert.match(formatMoney(money(1999, 'USD'), 'en'), /19\.99/);
});

test('money comparison refuses to equate across currencies', () => {
  assert.equal(sameMoney(money(100, 'USD'), money(100, 'USD')), true);
  assert.equal(sameMoney(money(100, 'USD'), money(100, 'IDR')), false);
});

test('the rail follows the currency, not geolocation', () => {
  assert.equal(railForCurrency('IDR'), 'qris');
  assert.equal(railForCurrency('USD'), 'stripe');
});

// ── QRIS payload ─────────────────────────────────────────────

/** Builds a plausible static merchant QR with a correct checksum. */
function staticMerchantQr(): string {
  const body =
    serialiseTlv([
      { tag: '00', value: '01' },
      { tag: '01', value: '11' }, // static
      { tag: '26', value: '0013ID.CO.QRIS.WWW0215ID10200000000000303UMI' },
      { tag: '52', value: '5812' },
      { tag: '53', value: '360' },
      { tag: '58', value: 'ID' },
      { tag: '59', value: 'Vienne Undangan' },
      { tag: '60', value: 'Bandung' },
    ]) + '6304';
  return body + crc16(body);
}

test('CRC-16/CCITT-FALSE matches its documented check value', () => {
  // The standard check vector for CRC-16/CCITT-FALSE over "123456789".
  assert.equal(crc16('123456789'), '29B1');
});

test('a generated static QR verifies against its own checksum', () => {
  const qr = staticMerchantQr();
  assert.equal(verifyChecksum(qr), true);
  assert.equal(isStaticPayload(qr), true);
});

test('a tampered payload fails checksum verification', () => {
  const qr = staticMerchantQr().replace('Bandung', 'Jakarta');
  assert.equal(verifyChecksum(qr), false);
});

test('TLV parsing round-trips', () => {
  const entries = parseTlv(staticMerchantQr());
  assert.equal(serialiseTlv(entries), staticMerchantQr());
});

test('truncated and malformed TLV is rejected', () => {
  assert.throws(() => parseTlv('00'), QrisPayloadError);
  assert.throws(() => parseTlv('0099AB'), QrisPayloadError);
  assert.throws(() => parseTlv('XX02AB'), QrisPayloadError);
});

test('injecting an amount produces a valid dynamic QR', () => {
  const dynamic = withAmount(staticMerchantQr(), 149_000);

  assert.equal(verifyChecksum(dynamic), true, 'checksum recomputed');
  assert.equal(isStaticPayload(dynamic), false, 'no longer static');

  const entries = parseTlv(dynamic);
  assert.equal(entries.find((e) => e.tag === '01')?.value, '12', 'point of initiation is dynamic');
  assert.equal(entries.find((e) => e.tag === '54')?.value, '149000', 'amount carried verbatim');
});

test('the amount tag is inserted in ascending tag order', () => {
  const tags = parseTlv(withAmount(staticMerchantQr(), 50_000))
    .map((e) => e.tag)
    .filter((t) => t !== '63');
  const sorted = [...tags].sort();
  assert.deepEqual(tags, sorted, `tags must stay ordered, got ${tags.join(',')}`);
});

test('re-injecting replaces rather than duplicates the amount', () => {
  const once = withAmount(staticMerchantQr(), 149_000);
  const twice = withAmount(once, 299_000);
  const amounts = parseTlv(twice).filter((e) => e.tag === '54');
  assert.equal(amounts.length, 1);
  assert.equal(amounts[0].value, '299000');
  assert.equal(verifyChecksum(twice), true);
});

test('a static payload with a bad checksum is refused up front', () => {
  // Catching this here means a mistyped merchant string fails during setup,
  // not in a customer's banking app.
  assert.throws(() => withAmount(staticMerchantQr().slice(0, -1) + '0', 1000), QrisPayloadError);
});

test('non-payable amounts are refused', () => {
  assert.throws(() => formatQrisAmount(0), QrisPayloadError);
  assert.throws(() => formatQrisAmount(-5), QrisPayloadError);
  assert.throws(() => formatQrisAmount(1500.5), QrisPayloadError);
  assert.equal(formatQrisAmount(149_000), '149000');
});

// ── Stripe webhook signature ─────────────────────────────────

const SECRET = 'whsec_test_secret';
const BODY = '{"id":"evt_1","type":"checkout.session.completed"}';

function signedHeader(timestamp: number, body = BODY, secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

test('a correctly signed webhook verifies', () => {
  const now = 1_800_000_000;
  verifyStripeSignature({ rawBody: BODY, header: signedHeader(now), secret: SECRET, nowSeconds: now });
});

test('computeSignature agrees with an independent HMAC', () => {
  const ts = 1_800_000_000;
  const expected = createHmac('sha256', SECRET).update(`${ts}.${BODY}`, 'utf8').digest('hex');
  assert.equal(computeSignature(BODY, ts, SECRET), expected);
});

test('a body altered after signing is rejected', () => {
  const now = 1_800_000_000;
  const header = signedHeader(now);
  assert.throws(
    () => verifyStripeSignature({ rawBody: BODY.replace('evt_1', 'evt_2'), header, secret: SECRET, nowSeconds: now }),
    StripeSignatureError,
  );
});

test('a signature from a different secret is rejected', () => {
  const now = 1_800_000_000;
  const header = signedHeader(now, BODY, 'whsec_wrong');
  assert.throws(() => verifyStripeSignature({ rawBody: BODY, header, secret: SECRET, nowSeconds: now }), StripeSignatureError);
});

test('a replayed webhook outside the tolerance window is rejected', () => {
  const signedAt = 1_800_000_000;
  const header = signedHeader(signedAt);
  // Valid signature, but captured and resent an hour later.
  assert.throws(
    () => verifyStripeSignature({ rawBody: BODY, header, secret: SECRET, nowSeconds: signedAt + 3600 }),
    StripeSignatureError,
  );
  // Still fine just inside the window.
  verifyStripeSignature({ rawBody: BODY, header, secret: SECRET, nowSeconds: signedAt + 299 });
});

test('a timestamp far in the future is rejected', () => {
  const signedAt = 1_800_000_000;
  assert.throws(
    () => verifyStripeSignature({ rawBody: BODY, header: signedHeader(signedAt), secret: SECRET, nowSeconds: signedAt - 3600 }),
    StripeSignatureError,
  );
});

test('a missing header or secret is rejected rather than skipped', () => {
  assert.throws(() => verifyStripeSignature({ rawBody: BODY, header: null, secret: SECRET }), StripeSignatureError);
  assert.throws(() => verifyStripeSignature({ rawBody: BODY, header: signedHeader(1), secret: '' }), StripeSignatureError);
});

test('multiple v1 signatures allow secret rotation', () => {
  const now = 1_800_000_000;
  const wrong = createHmac('sha256', 'whsec_old').update(`${now}.${BODY}`).digest('hex');
  const right = computeSignature(BODY, now, SECRET);
  verifyStripeSignature({ rawBody: BODY, header: `t=${now},v1=${wrong},v1=${right}`, secret: SECRET, nowSeconds: now });
});

test('a header without a timestamp or signature is rejected', () => {
  assert.throws(() => parseSignatureHeader('v1=abc'), StripeSignatureError);
  assert.throws(() => parseSignatureHeader('t=123'), StripeSignatureError);
});
