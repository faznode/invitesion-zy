import 'server-only';

import { fromStripeAmount, isCurrency, toStripeAmount, type Currency } from './money';
import { verifyStripeSignature, StripeSignatureError } from './stripe-signature';
import {
  ProviderError,
  WebhookVerificationError,
  type ChargeHandle,
  type ChargeRequest,
  type PaymentProvider,
  type SettlementEvent,
} from './types';

/**
 * Stripe Checkout, for international customers.
 *
 * Uses the REST API over `fetch` instead of the Stripe SDK. The whole surface
 * needed is one POST to create a Checkout Session plus webhook verification, and
 * the SDK is a large dependency for that. The tradeoff is explicit: we give up
 * the SDK's convenience and typing, and in exchange the signature path is a pure
 * function covered by tests rather than a black box.
 *
 * Checkout is used in preference to Payment Intents so that card data, 3DS, and
 * regional payment methods stay entirely on Stripe's surface — this application
 * never sees a card number.
 */
export class StripeProvider implements PaymentProvider {
  readonly rail = 'stripe' as const;
  readonly currencies: readonly Currency[] = ['USD'];

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly apiBase = 'https://api.stripe.com',
  ) {}

  async createCharge(request: ChargeRequest): Promise<ChargeHandle> {
    const amount = toStripeAmount(request.price);

    // Form-encoded with Stripe's bracket notation for nested fields.
    const body = new URLSearchParams({
      mode: 'payment',
      // Our reference travels on the session so the webhook can be matched back
      // to an order without trusting anything the browser reports.
      client_reference_id: request.reference,
      customer_email: request.customerEmail,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': request.price.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': request.description,
      'metadata[reference]': request.reference,
    });

    const response = await fetch(`${this.apiBase}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Stripe deduplicates retries of this creation call by this key, so a
        // double-clicked checkout button cannot open two sessions for one order.
        'idempotency-key': `checkout:${request.reference}`,
      },
      body,
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; url?: string; expires_at?: number; error?: { message?: string } }
      | null;

    if (!response.ok || !payload?.id) {
      throw new ProviderError(
        `Stripe checkout session failed (${response.status}): ${payload?.error?.message ?? 'unknown error'}`,
      );
    }

    return {
      rail: this.rail,
      providerPaymentId: payload.id,
      redirectUrl: payload.url ?? null,
      qrisPayload: null,
      expiresAt: payload.expires_at ? new Date(payload.expires_at * 1000) : null,
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<SettlementEvent | null> {
    try {
      verifyStripeSignature({
        rawBody,
        header: headers.get('stripe-signature'),
        secret: this.webhookSecret,
      });
    } catch (error) {
      if (error instanceof StripeSignatureError) throw new WebhookVerificationError(error.message);
      throw error;
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      // The signature verified, so this is malformed rather than forged — still
      // not something to treat as a no-op.
      throw new WebhookVerificationError('Webhook body is not valid JSON');
    }

    if (!event.id || !event.type) throw new WebhookVerificationError('Webhook body is missing id or type');

    const session = event.data?.object;
    const reference = session?.client_reference_id ?? session?.metadata?.reference ?? null;

    // Authentic events we simply do not act on. Returning null here is correct;
    // the route still records the delivery so retries stay cheap.
    const status = STRIPE_EVENT_STATUS[event.type];
    if (!status || !reference) return null;

    let paid = null;
    if (status === 'PAID') {
      const currency = session?.currency?.toUpperCase();
      const total = session?.amount_total;
      if (!currency || !isCurrency(currency) || typeof total !== 'number') {
        throw new WebhookVerificationError(`Paid event ${event.id} has no usable amount`);
      }
      // Throws if Stripe reports an amount that is not a whole minor unit for
      // us, rather than rounding a mismatch into an order.
      paid = fromStripeAmount(total, currency);
    }

    return {
      rail: this.rail,
      eventId: event.id,
      reference,
      providerPaymentId: session?.id ?? null,
      status,
      paid,
      raw: event,
    };
  }
}

/**
 * Only terminal outcomes are mapped. `checkout.session.completed` is the
 * settlement signal for Checkout in payment mode; `async_payment_failed` and
 * `expired` close the order out so it stops looking pending forever.
 */
const STRIPE_EVENT_STATUS: Record<string, SettlementEvent['status'] | undefined> = {
  'checkout.session.completed': 'PAID',
  'checkout.session.async_payment_succeeded': 'PAID',
  'checkout.session.async_payment_failed': 'FAILED',
  'checkout.session.expired': 'EXPIRED',
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      client_reference_id?: string | null;
      currency?: string;
      amount_total?: number;
      metadata?: { reference?: string };
    };
  };
};
