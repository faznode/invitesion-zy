import 'server-only';

import { withAmount } from './qris-payload';
import { ProviderError, type ChargeHandle, type ChargeRequest, type PaymentProvider, type SettlementEvent } from './types';
import type { Currency } from './money';

/**
 * QRIS, for Indonesian customers.
 *
 * QRIS is an interoperable *standard*, not a payment company. Two consequences
 * shape this file:
 *
 *  1. Issuing a QR and *receiving an automatic settlement callback* are separate
 *     capabilities. The first needs only the merchant's own QRIS string. The
 *     second needs an acquirer (Xendit, DOKU, Flip, Midtrans, or a bank) — there
 *     is no such thing as a webhook from "QRIS" itself.
 *  2. Which acquirer to use is a commercial decision, not an engineering one.
 *
 * So the rail is written against `QrisAcquirer`, and ships with
 * `ManualQrisAcquirer`, which works today with nothing but a merchant QR and
 * settles through an admin confirming the transfer. When an acquirer is signed,
 * implement its adapter and the rest of the system does not change.
 */

export interface QrisAcquirer {
  readonly name: string;
  /**
   * Whether settlement arrives on its own.
   *
   * False means an operator must confirm each payment. The system must not
   * pretend otherwise: an order that can never be paid automatically should not
   * look like it is merely waiting.
   */
  readonly supportsWebhook: boolean;

  /** Produces the payload the customer scans. */
  createQr(request: ChargeRequest): Promise<{
    payload: string;
    providerPaymentId: string | null;
    expiresAt: Date | null;
  }>;

  /**
   * Verifies and normalises an acquirer callback.
   * Must throw on a signature or shape failure — never return null for it.
   */
  parseCallback?(rawBody: string, headers: Headers): Promise<SettlementEvent | null>;
}

/**
 * Merchant-QR driver with operator confirmation.
 *
 * Takes the merchant's static QRIS string and injects the exact amount, so the
 * customer cannot underpay by mistyping. There is no callback to listen for, so
 * `supportsWebhook` is false and settlement happens through the admin panel.
 *
 * The honest limits, stated rather than buried:
 *  - confirmation is manual, so paid orders activate at operator speed;
 *  - there is no cryptographic proof of payment, only the operator's judgement
 *    against their bank statement.
 * Both are acceptable at low volume and neither is acceptable at scale.
 */
export class ManualQrisAcquirer implements QrisAcquirer {
  readonly name = 'manual-merchant-qr';
  readonly supportsWebhook = false;

  constructor(private readonly staticPayload: string) {}

  async createQr(request: ChargeRequest) {
    if (request.price.currency !== 'IDR') {
      throw new ProviderError(`QRIS collects IDR only, got ${request.price.currency}`);
    }
    // `withAmount` verifies the merchant string's own checksum first, so a
    // mis-copied payload fails here rather than in the customer's banking app.
    const payload = withAmount(this.staticPayload, request.price.amount);
    return { payload, providerPaymentId: null, expiresAt: null };
  }
}

export class QrisProvider implements PaymentProvider {
  readonly rail = 'qris' as const;
  readonly currencies: readonly Currency[] = ['IDR'];

  constructor(private readonly acquirer: QrisAcquirer) {}

  get acquirerName() {
    return this.acquirer.name;
  }

  /** False means orders on this rail require operator confirmation. */
  get settlesAutomatically() {
    return this.acquirer.supportsWebhook;
  }

  async createCharge(request: ChargeRequest): Promise<ChargeHandle> {
    const { payload, providerPaymentId, expiresAt } = await this.acquirer.createQr(request);
    return {
      rail: this.rail,
      providerPaymentId,
      // QRIS is rendered in-app; there is nowhere to redirect to.
      redirectUrl: null,
      qrisPayload: payload,
      expiresAt,
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<SettlementEvent | null> {
    if (!this.acquirer.parseCallback) {
      throw new ProviderError(
        `Acquirer "${this.acquirer.name}" does not deliver callbacks; QRIS orders settle via admin confirmation`,
      );
    }
    return this.acquirer.parseCallback(rawBody, headers);
  }
}
