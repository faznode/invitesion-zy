import 'server-only';

import { randomUUID } from 'node:crypto';
import { ApiProblem, apiConfigFromEnv, apiPost } from '@/lib/api/client';
import { AmountMismatchError, OrderNotFoundError, RailMismatchError, SettlementUnconfirmedError } from './errors';
import type { SettleOutcome } from './service';
import type { SettlementEvent } from './types';

/** Unreachable, timed out or a 5xx: the write may have committed (D-043's rule, as `rsvp-writer.ts`). */
const isAmbiguous = (error: ApiProblem): boolean => error.status === 0 || error.status >= 500;

/**
 * B-039: the Rust writer's side of settlement (`BACKEND_PAYMENT=rust`; `next` stays the default). The webhook route and
 * the administrator's confirmation hand it an event the rail adapter (or the administrator check) already verified;
 * this call is signed like every internal call and carries an `Idempotency-Key` that the API records in the
 * settlement's own transaction. One key per settlement: an unknown outcome (unreachable, timed out, 5xx) is sent exactly
 * once more under the same key, so a committed settlement replays its answer; if the outcome is still unknown the caller
 * gets `SettlementUnconfirmedError` and nothing falls back to the Next.js writer. A 400, 401 or 422 is a deployment or
 * programming error and propagates.
 */
export async function settleThroughApi(
  event: SettlementEvent,
  env: Record<string, string | undefined> = process.env,
): Promise<SettleOutcome> {
  const config = apiConfigFromEnv(env);
  const body = {
    rail: event.rail,
    eventId: event.eventId,
    reference: event.reference,
    ...(event.providerPaymentId !== null && { providerPaymentId: event.providerPaymentId }),
    status: event.status,
    ...(event.paid && { paid: { amount: event.paid.amount, currency: event.paid.currency } }),
    raw: event.raw ?? null,
  };
  const key = randomUUID();
  const post = () => apiPost(config, '/v1/payments/settlements', body, { idempotencyKey: key });

  let result;
  try {
    try {
      result = await post();
    } catch (error) {
      if (!(error instanceof ApiProblem) || !isAmbiguous(error)) throw error;
      result = await post();
    }
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    switch (error.code) {
      case 'payment.order_not_found':
        throw new OrderNotFoundError(event.reference);
      case 'payment.rail_mismatch':
        throw new RailMismatchError(event.rail, 'another rail');
      case 'payment.amount_mismatch':
      case 'payment.amount_unverifiable':
        throw new AmountMismatchError(null, event.paid);
    }
    if (isAmbiguous(error)) {
      // Codes and status only: a settlement problem never carries personal data, and neither does this line.
      console.error(`[payments] settlement through the API unconfirmed after a retry (${error.status} ${error.code})`);
      throw new SettlementUnconfirmedError(error.status, error.code);
    }
    throw error;
  }

  if (result.applied) {
    if (typeof result.orderId !== 'number') throw new Error('settlement answer without an order id');
    return { applied: true, orderId: result.orderId, invitationActivated: result.invitationActivated === true };
  }
  return { applied: false, reason: result.reason === 'already-final' ? 'already-final' : 'duplicate' };
}
