import { createHash } from 'node:crypto';

/**
 * B-039 (09 §8.4, §8.6): checkout creation takes an idempotency key. The checkout page renders a fresh key into its form;
 * a double tap, a retried submit or a resubmitted page carries the same key, and `createOrder` (lib/payment/service.ts)
 * finds the order that key already made instead of writing a second PENDING order with another reference.
 *
 * The key is scoped to the signed-in customer and the invitation (a unique index on user, invitation and key), and it is
 * bound to the intent the server computed for it: the invitation, the theme the order buys, the tier, the amount, the
 * currency and so the rail. Nothing of the intent comes from the form. When a submit finds its key:
 *  - another intent (the price, theme or locale changed since the page loaded): **conflict**, nothing is written and the
 *    customer reviews the new price on a fresh page;
 *  - PAID: the payment is done, the page says so;
 *  - PENDING: **resume** the same order and reference; the rail is asked for the same charge again (Stripe deduplicates
 *    the session by `checkout:<reference>`, a QRIS code is derived from the order), which covers a lost answer before or
 *    after the provider was called;
 *  - FAILED or EXPIRED: **closed**, the attempt is over and a fresh page starts a new one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The form's key when it is a UUID, lower-cased; anything else is no key. */
export function normalizeCheckoutKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return UUID.test(key) ? key : null;
}

export type CheckoutIntent = {
  invitationId: number | null;
  templateId: number | null;
  tier: string;
  /** The price before any coupon (`lib/pricing.ts`); a coupon-free order charges exactly this. */
  amount: number;
  currency: string;
  rail: string;
  /** G-053: the sorted coupon codes the customer asked for (`normalizeCouponCodes`); absent or empty for none. */
  coupons?: readonly string[];
};

/**
 * SHA-256 of the intent in a fixed field order, as stored in `orders.checkout_intent`. G-053 appends the codes only when
 * there are some, so every coupon-free intent, including those already stored on PENDING orders, hashes as before.
 */
export function checkoutIntentHash(intent: CheckoutIntent): string {
  const fields: unknown[] = [intent.invitationId, intent.templateId, intent.tier, intent.amount, intent.currency, intent.rail];
  if (intent.coupons && intent.coupons.length > 0) fields.push([...intent.coupons]);
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export type CheckoutResolution = 'resume' | 'paid' | 'closed' | 'conflict';

/** What a submit gets when its key already made an order. The intent is compared first: a changed intent never resumes. */
export function resolveExistingCheckout(existing: { status: string; checkoutIntent: string | null }, intentHash: string): CheckoutResolution {
  if (existing.checkoutIntent !== intentHash) return 'conflict';
  if (existing.status === 'PAID') return 'paid';
  if (existing.status === 'PENDING') return 'resume';
  return 'closed';
}
