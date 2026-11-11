import type { Money } from './money';

/**
 * Settlement refusals, shared by both writers (`lib/payment/service.ts` for Next.js, `lib/payment/settlement-api.ts`
 * for Rust) and mapped to the provider's retry signal by the webhook route: an unknown reference is 400 (a retry cannot
 * create the order), a disagreement with the order is 409 (a person looks at it), an unconfirmed outcome is 500 (the
 * provider retries, and the event's unique id makes that safe).
 */

export class OrderNotFoundError extends Error {
  constructor(reference: string) {
    super(`No order for reference ${reference}`);
    this.name = 'OrderNotFoundError';
  }
}

/**
 * The reported amount disagrees with the order, or a PAID event reported none (`actual` null). `expected` is null when
 * the Rust writer refused it: the answer names the rule, not the order's amount.
 */
export class AmountMismatchError extends Error {
  constructor(expected: Money | null, actual: Money | null) {
    const wanted = expected ? `order expects ${expected.amount} ${expected.currency}` : 'it disagrees with the order';
    super(actual ? `Provider reported ${actual.amount} ${actual.currency}, ${wanted}` : `Provider reported a payment without an amount, ${wanted}`);
    this.name = 'AmountMismatchError';
  }
}

/** An event of one rail named an order of another: it never touches that order. */
export class RailMismatchError extends Error {
  constructor(eventRail: string, orderRail: string) {
    super(`A ${eventRail} event named a ${orderRail} order`);
    this.name = 'RailMismatchError';
  }
}

/**
 * The Rust writer's answer stayed unknown after the one retry under the same key (B-039, D-043's rule). Nothing falls
 * back to the other writer: the event may or may not be applied, and the provider's next delivery, or the operator's
 * next press, settles it exactly once.
 */
export class SettlementUnconfirmedError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Settlement outcome unknown after a retry under the same key (${status} ${code})`);
    this.name = 'SettlementUnconfirmedError';
  }
}
