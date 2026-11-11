import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe webhook signature verification.
 *
 * Implemented in-repo rather than pulled from the Stripe SDK for the same reason
 * as the S3 signer: this project needs one endpoint and one verification, and
 * the scheme is short, stable, and publicly specified. Written as a pure
 * function so the two things that actually matter — rejecting a forged signature
 * and rejecting a replayed one — are directly testable.
 *
 * Header format: `t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>…]`
 * Signed payload: `${t}.${rawBody}`
 * Signature: HMAC-SHA256 of that, keyed with the endpoint's signing secret.
 *
 * The raw body must be the exact bytes Stripe sent. Parsing and re-serialising
 * JSON changes whitespace and key order and invalidates the signature — which is
 * why the route handler reads `await request.text()` and never `.json()` first.
 */

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeSignatureError';
  }
}

/**
 * How far a webhook's timestamp may be from now.
 *
 * Without this, a signature captured once stays valid forever and can be
 * replayed to re-deliver a settlement. Five minutes is Stripe's own default and
 * comfortably absorbs clock skew.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

type ParsedHeader = { timestamp: number; signatures: string[] };

export function parseSignatureHeader(header: string): ParsedHeader {
  let timestamp = NaN;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = Number(value);
    // Multiple v1 entries appear while a secret is being rotated; any one
    // matching is sufficient.
    else if (key === 'v1') signatures.push(value);
  }

  if (!Number.isFinite(timestamp)) throw new StripeSignatureError('Signature header has no valid timestamp');
  if (signatures.length === 0) throw new StripeSignatureError('Signature header has no v1 signature');
  return { timestamp, signatures };
}

export function computeSignature(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

/** Constant-time hex comparison. `===` would leak the matching prefix length. */
function signatureMatches(expected: string, candidate: string): boolean {
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    // Non-hex candidate: not equal, and not worth an exception.
    return false;
  }
}

/**
 * Throws unless `rawBody` was signed with `secret` recently.
 *
 * `nowSeconds` is injectable so replay behaviour can be tested without waiting.
 */
export function verifyStripeSignature({
  rawBody,
  header,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  rawBody: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): void {
  if (!header) throw new StripeSignatureError('Missing Stripe-Signature header');
  if (!secret) throw new StripeSignatureError('Missing webhook signing secret');

  const { timestamp, signatures } = parseSignatureHeader(header);

  const age = nowSeconds - timestamp;
  if (age > toleranceSeconds) {
    throw new StripeSignatureError(`Webhook timestamp is ${age}s old, outside the ${toleranceSeconds}s tolerance`);
  }
  // A timestamp meaningfully in the future is also suspect: it would extend the
  // replay window rather than shorten it.
  if (age < -toleranceSeconds) {
    throw new StripeSignatureError('Webhook timestamp is too far in the future');
  }

  const expected = computeSignature(rawBody, timestamp, secret);
  if (!signatures.some((candidate) => signatureMatches(expected, candidate))) {
    throw new StripeSignatureError('No signature matched the signing secret');
  }
}
