import type { Currency, Money } from './money';

/**
 * Payment provider boundary.
 *
 * Two rails, chosen by where the customer is paying from, not by preference:
 *
 *  - **QRIS** for Indonesian customers. QRIS is an interoperable standard, not a
 *    payment company: issuing a *dynamic* QR and receiving an automatic
 *    settlement callback requires an acquirer (Xendit, DOKU, Flip, Midtrans, a
 *    bank). Which acquirer is a business decision, so the QRIS side is written
 *    against `QrisAcquirer` and ships with a manual driver that works today.
 *  - **Stripe** for international customers.
 *
 * The invariant both share, and the reason this interface exists at all:
 * **the webhook is the source of truth, never the browser redirect.** A
 * customer closing the tab after paying must still end up with a paid order, and
 * a customer reaching the success page must not be able to grant themselves one.
 */

export type PaymentRail = 'qris' | 'stripe';

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

/** What we ask a provider to collect. */
export type ChargeRequest = {
  /** Our own reference. Unique, and the idempotency anchor on both sides. */
  reference: string;
  price: Money;
  /** Shown to the customer on the provider's surface. */
  description: string;
  customerEmail: string;
  /** Where the provider should send the browser afterwards. */
  successUrl: string;
  cancelUrl: string;
};

/** What the customer needs in order to pay. */
export type ChargeHandle = {
  rail: PaymentRail;
  /** Provider-side identifier, stored for reconciliation. */
  providerPaymentId: string | null;
  /**
   * Redirect target, for rails that host their own payment page (Stripe).
   * Null for rails rendered in-app (QRIS).
   */
  redirectUrl: string | null;
  /**
   * Raw QRIS payload to render as a QR code, for the QRIS rail. Null otherwise.
   * This is the EMVCo string, not an image — rendering belongs to the UI.
   */
  qrisPayload: string | null;
  /** When the payment window closes, if the rail imposes one. */
  expiresAt: Date | null;
};

/**
 * A settlement event, normalised across rails.
 *
 * `eventId` is what makes webhook handling idempotent: providers retry, and a
 * retry must not be able to pay an order twice or create a second account.
 */
export type SettlementEvent = {
  rail: PaymentRail;
  /** Provider's unique id for this delivery. */
  eventId: string;
  /** Our reference, echoed back by the provider. */
  reference: string;
  providerPaymentId: string | null;
  status: 'PAID' | 'FAILED' | 'EXPIRED';
  /** What the provider says was actually collected. Verified against the order. */
  paid: Money | null;
  raw: unknown;
};

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface PaymentProvider {
  readonly rail: PaymentRail;
  /** Currencies this rail may be used for. */
  readonly currencies: readonly Currency[];

  createCharge(request: ChargeRequest): Promise<ChargeHandle>;

  /**
   * Verifies an inbound webhook and normalises it.
   *
   * Must throw `WebhookVerificationError` on any signature, timestamp, or shape
   * problem — returning null would let a forged body be treated as "nothing to
   * do", which is indistinguishable from success to the caller.
   * Returns null only for authentic events we do not act on.
   */
  parseWebhook(rawBody: string, headers: Headers): Promise<SettlementEvent | null>;
}

/**
 * Rail selection.
 *
 * IDR is collected over QRIS; everything else goes to Stripe. Deliberately
 * driven by the currency of the order rather than by IP geolocation, so the
 * amount the customer was quoted and the rail they pay on can never disagree.
 */
export function railForCurrency(currency: Currency): PaymentRail {
  return currency === 'IDR' ? 'qris' : 'stripe';
}
