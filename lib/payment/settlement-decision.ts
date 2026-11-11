import { ACTIVE_PERIOD_MONTHS, addMonths } from '@/lib/invitation/publish-rules';
import { isCurrency, sameMoney, type Currency } from './money';

/**
 * B-039 (09 §8.6): what one settlement event does, as a pure decision both writers share. The Next.js writer
 * (`lib/payment/service.ts`) and the Rust writer (`services/api/src/payment/decision.rs`) feed it the rows they read
 * under their locks and apply its answer in one transaction; `contracts/vectors/payment-settlement.json` pins it, and
 * `tests/payment-settlement.test.ts` and `services/api/tests/payment_vectors.rs` run that file.
 *
 * Order of the checks, which decides what a provider sees:
 *  1. the event row conflicted (UNIQUE rail, event_id): a duplicate delivery, nothing more is read or written;
 *  2. no order for the reference: refused, nothing kept (a retry cannot create the order);
 *  3. an order of another rail: refused, nothing kept (an event never touches another rail's order);
 *  4. an order no longer PENDING: the event is kept against it, nothing else changes;
 *  5. FAILED or EXPIRED: the order closes with that status;
 *  6. PAID without an amount, or with another amount or currency: refused, the order stays PENDING for a person;
 *  7. PAID: the order is paid, a payment row and the entitlement outbox row are written, and the invitation is
 *     activated when it is live (B-031), still unpublished and on the theme the order bought (B-041).
 */

export type SettlementEventInput = {
  rail: string;
  status: 'PAID' | 'FAILED' | 'EXPIRED';
  /** What the provider says it collected, in our minor units. */
  paid: { amount: number; currency: string } | null;
};

export type SettlementOrderInput = {
  status: string;
  rail: string;
  amount: number;
  currency: string;
  invitationId: number | null;
  /** The theme the order bought; null on orders older than the column (grandfathered for any theme). */
  templateId: number | null;
};

/**
 * The invitation as read under its row lock with `deleted_at IS NULL`: null when the order has none, or when it is
 * deleted or purged (B-031, D-063). The lock is the one a deletion takes, so the two serialise.
 */
export type SettlementInvitationInput = {
  status: string;
  templateId: number | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
};

export type SettlementInput = {
  /** False when the event row conflicted on UNIQUE (rail, event_id). */
  recorded: boolean;
  event: SettlementEventInput;
  order: SettlementOrderInput | null;
  invitation: SettlementInvitationInput | null;
  /** When the payment is recorded (UTC wall time, as stored). */
  paidAt: Date;
};

export type Activation =
  | { kind: 'activated'; publishedAt: Date; expiresAt: Date }
  | { kind: 'no_invitation' }
  | { kind: 'not_live' }
  | { kind: 'already_published' }
  | { kind: 'theme_mismatch' };

export type SettlementDecision =
  | { outcome: 'duplicate' }
  | { outcome: 'unknown_order' }
  | { outcome: 'rail_mismatch' }
  | { outcome: 'already_final' }
  | { outcome: 'closed'; status: 'FAILED' | 'EXPIRED' }
  | { outcome: 'amount_unverifiable' }
  | { outcome: 'amount_mismatch' }
  | { outcome: 'paid'; activation: Activation };

/** The order's amount as money; a stored currency we no longer support reads as IDR, as the writer always has. */
export function orderMoney(order: Pick<SettlementOrderInput, 'amount' | 'currency'>): { amount: number; currency: Currency } {
  return { amount: order.amount, currency: isCurrency(order.currency) ? order.currency : 'IDR' };
}

/**
 * Payment is what makes an invitation live, so a paid order activates its invitation when it may:
 * only an unpublished invitation moves, a window already running is never restarted or shortened, a payment for
 * another theme than the invitation now shows records the entitlement but does not publish the new theme, and a
 * deleted or purged invitation is never published (the money is recorded all the same).
 */
export function decideActivation(
  order: Pick<SettlementOrderInput, 'invitationId' | 'templateId'>,
  invitation: SettlementInvitationInput | null,
  paidAt: Date,
): Activation {
  if (order.invitationId === null) return { kind: 'no_invitation' };
  if (!invitation) return { kind: 'not_live' };
  if (invitation.status === 'PUBLISHED') return { kind: 'already_published' };
  if (order.templateId !== null && invitation.templateId !== null && invitation.templateId !== order.templateId) {
    return { kind: 'theme_mismatch' };
  }
  const publishedAt = invitation.publishedAt ?? paidAt;
  return {
    kind: 'activated',
    publishedAt,
    expiresAt: invitation.expiresAt ?? addMonths(publishedAt, ACTIVE_PERIOD_MONTHS),
  };
}

export function decideSettlement(input: SettlementInput): SettlementDecision {
  if (!input.recorded) return { outcome: 'duplicate' };
  const { order, event } = input;
  if (!order) return { outcome: 'unknown_order' };
  if (order.rail !== event.rail) return { outcome: 'rail_mismatch' };
  if (order.status !== 'PENDING') return { outcome: 'already_final' };
  if (event.status !== 'PAID') return { outcome: 'closed', status: event.status };
  if (!event.paid) return { outcome: 'amount_unverifiable' };
  if (!isCurrency(event.paid.currency)) return { outcome: 'amount_mismatch' };
  if (!sameMoney(orderMoney(order), { amount: event.paid.amount, currency: event.paid.currency })) {
    return { outcome: 'amount_mismatch' };
  }
  return { outcome: 'paid', activation: decideActivation(order, input.invitation, input.paidAt) };
}

/** The entitlement outbox row a paid settlement writes in its own transaction (`jobs`, one per order). */
export const PAYMENT_SETTLED_JOB = 'payment_settled';
export const PAYMENT_SETTLED_MAX_ATTEMPTS = 20;

export function paymentSettledDedupeKey(orderId: number): string {
  return `order:${orderId}`;
}

export type PaymentSettledPayload = {
  orderId: number;
  paymentId: number;
  invitationId: number | null;
  templateId: number | null;
  /** What the settlement did; `requested` when G-050 re-arms an earlier payment's row on its owner's request. */
  activation: Activation['kind'] | 'requested';
};
