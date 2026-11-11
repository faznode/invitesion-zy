import { getProvider } from '@/lib/payment/registry';
import {
  AmountMismatchError,
  OrderNotFoundError,
  RailMismatchError,
  SettlementUnconfirmedError,
  settle,
} from '@/lib/payment/service';
import { ProviderError, WebhookVerificationError, type PaymentRail } from '@/lib/payment/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ rail: string }> };

const RAILS: PaymentRail[] = ['stripe', 'qris'];

/**
 * Settlement webhook.
 *
 * **This is the source of truth for payment, not the browser redirect.** A
 * customer who pays and immediately closes the tab must still end up with a paid
 * order; a customer who merely loads the success URL must not.
 *
 * Three properties this handler has to get right:
 *
 *  1. **Raw body.** The signature covers the exact bytes sent. Reading `.json()`
 *     first and re-serialising changes whitespace and key order and invalidates
 *     it, so the body is read as text and parsed only after verification.
 *  2. **Status codes decide retries.** A provider retries on non-2xx. So a
 *     verification failure is 400 (never retry — it will never become valid), a
 *     duplicate is 200 (stop retrying, already done), and only a genuine
 *     server-side fault is 500 (please retry).
 *  3. **No authentication of its own.** The signature *is* the authentication.
 *     There is no session here, which is why `/api` is excluded from the
 *     session middleware.
 */
export async function POST(request: Request, { params }: Ctx) {
  const railParam = (await params).rail;
  if (!RAILS.includes(railParam as PaymentRail)) {
    return json({ error: 'Unknown payment rail' }, 404);
  }
  const rail = railParam as PaymentRail;

  // Read as text. See note 1 above.
  const rawBody = await request.text();

  let provider;
  try {
    provider = getProvider(rail);
  } catch (error) {
    // Misconfiguration on our side. 500 so the provider retries once we fix it,
    // rather than silently dropping a real payment.
    console.error(`[payments] ${rail} webhook received but rail is unavailable`, error);
    return json({ error: 'Payment rail unavailable' }, 500);
  }

  let event;
  try {
    event = await provider.parseWebhook(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // Forged, malformed, or replayed. This will never become valid, so tell the
      // provider to stop.
      console.warn(`[payments] ${rail} webhook rejected: ${error.message}`);
      return json({ error: 'Invalid webhook' }, 400);
    }
    if (error instanceof ProviderError) {
      console.error(`[payments] ${rail} webhook not supported: ${error.message}`);
      return json({ error: 'Webhook not supported for this rail' }, 400);
    }
    throw error;
  }

  // Authentic, but not an event we act on. 200 so it is not retried forever.
  if (!event) return json({ received: true, applied: false, reason: 'ignored' }, 200);

  // B-039: the verified event goes to exactly one writer (`BACKEND_PAYMENT`), never to both.
  try {
    const outcome = await settle(event);
    return json({ received: true, ...outcome }, 200);
  } catch (error) {
    if (error instanceof RailMismatchError) {
      // Authenticated by one rail's adapter, but naming another rail's order. Never applied; this needs a person.
      console.error(`[payments] ${rail} event named an order of another rail: ${event.reference}`);
      return json({ error: 'Rail mismatch' }, 409);
    }
    if (error instanceof SettlementUnconfirmedError) {
      // The selected writer's outcome is unknown. 500 invites the provider's retry, which the event's unique id makes safe.
      console.error(`[payments] ${rail} settlement unconfirmed for ${event.reference}: ${error.message}`);
      return json({ error: 'Settlement unconfirmed' }, 500);
    }
    if (error instanceof OrderNotFoundError) {
      // A signed event for a reference we do not have. Retrying will not create
      // the order, so acknowledge and record it for a human to look at.
      console.error(`[payments] ${rail} settlement for unknown reference ${event.reference}`);
      return json({ error: 'Unknown order reference' }, 400);
    }
    if (error instanceof AmountMismatchError) {
      // Authenticated, but the amount disagrees with what we asked for. Never
      // mark such an order paid; this needs a person.
      console.error(`[payments] ${rail} amount mismatch on ${event.reference}: ${error.message}`);
      return json({ error: 'Amount mismatch' }, 409);
    }
    // Genuine fault. 500 invites a retry, which our idempotency layer makes safe.
    console.error(`[payments] ${rail} settlement failed for ${event.reference}`, error);
    return json({ error: 'Settlement failed' }, 500);
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}
