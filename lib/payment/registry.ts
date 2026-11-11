import 'server-only';

import { ManualQrisAcquirer, QrisProvider, type QrisAcquirer } from './qris-provider';
import { StripeProvider } from './stripe-provider';
import { ProviderError, type PaymentProvider, type PaymentRail } from './types';

/**
 * Provider wiring.
 *
 * Configuration problems surface here, at first use, with a message that names
 * the missing variable. The alternative — a provider that constructs happily and
 * fails at charge time — turns a deploy mistake into a customer-facing error on
 * the checkout page.
 */

let stripe: StripeProvider | null = null;
let qris: QrisProvider | null = null;

function buildStripe(): StripeProvider {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secretKey) throw new ProviderError('STRIPE_SECRET_KEY is not set; international payment is unavailable');
  if (!webhookSecret) {
    // Without this we could take money and never learn that we had. Refusing to
    // start the rail is better than collecting unverifiable payments.
    throw new ProviderError('STRIPE_WEBHOOK_SECRET is not set; settlement could not be verified');
  }
  return new StripeProvider(secretKey, webhookSecret);
}

function buildQris(): QrisProvider {
  const acquirer = resolveQrisAcquirer();
  return new QrisProvider(acquirer);
}

/**
 * Selects the QRIS acquirer.
 *
 * Only the manual merchant-QR driver exists today. When an acquirer is chosen,
 * add its adapter here and set `QRIS_ACQUIRER` — nothing else in the system needs
 * to change, which is the whole point of the `QrisAcquirer` interface.
 */
function resolveQrisAcquirer(): QrisAcquirer {
  const configured = process.env.QRIS_ACQUIRER?.trim() || 'manual';

  if (configured === 'manual') {
    const staticPayload = process.env.QRIS_STATIC_PAYLOAD?.trim();
    if (!staticPayload) {
      throw new ProviderError(
        'QRIS_STATIC_PAYLOAD is not set. Paste the merchant QRIS string (the raw EMVCo text ' +
          'behind your QR image) to enable local payment.',
      );
    }
    return new ManualQrisAcquirer(staticPayload);
  }

  throw new ProviderError(
    `Unknown QRIS_ACQUIRER "${configured}". Only "manual" is implemented; add an adapter for your ` +
      'acquirer in lib/payment/ and register it here.',
  );
}

export function getProvider(rail: PaymentRail): PaymentProvider {
  if (rail === 'stripe') return (stripe ??= buildStripe());
  return (qris ??= buildQris());
}

/** Whether a rail is usable, for surfacing availability without throwing. */
export function railStatus(rail: PaymentRail): { available: true; note?: string } | { available: false; reason: string } {
  try {
    const provider = getProvider(rail);
    if (provider instanceof QrisProvider && !provider.settlesAutomatically) {
      return {
        available: true,
        note: `Acquirer "${provider.acquirerName}" has no settlement callback; orders need admin confirmation.`,
      };
    }
    return { available: true };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Test seam. */
export function resetProviders() {
  stripe = null;
  qris = null;
}
