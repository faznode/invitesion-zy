import 'server-only';

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, orders, payments, receipts } from '@/lib/db/schema';
import { receiptState, type ReceiptState } from './receipt-format';
import {
  PAYMENT_SETTLED_JOB,
  PAYMENT_SETTLED_MAX_ATTEMPTS,
  paymentSettledDedupeKey,
  type PaymentSettledPayload,
} from './settlement-decision';

/**
 * G-050: receipts from recorded payments.
 *
 * The Rust jobs runner is the only writer of `receipts`: when it delivers a paid order's `payment_settled` outbox row
 * (B-039) it copies the order and its payment into one receipt, numbered from `receipt_counters` under its row lock in the
 * same transaction (`services/api/src/payment/receipt.rs`). Every new payment therefore gets its receipt directly.
 * Payments from before that row existed (B-039's rollout, or a code rollback) get theirs on request: `requestReceipt`
 * re-arms the order's outbox row and the runner issues it on its next pass. Next.js only reads receipts, and only its
 * owner's: every query here is scoped by the signed-in customer's id.
 */

export { formatReceiptNumber, parseReceiptNumber, receiptState, type ReceiptState } from './receipt-format';

export type OwnerReceiptRow = {
  orderId: number;
  reference: string;
  tier: string | null;
  amount: number;
  currency: string;
  rail: string;
  paidAt: Date | null;
  number: number | null;
  state: ReceiptState;
};

/** The owner's paid orders, newest payment first, each with its receipt or what stands in for it. */
export async function listOwnerReceipts(userId: number): Promise<OwnerReceiptRow[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      tier: orders.tier,
      amount: orders.amount,
      currency: orders.currency,
      rail: orders.rail,
      paidAt: orders.paidAt,
      number: receipts.number,
      jobId: jobs.id,
      jobDoneAt: jobs.doneAt,
      jobAttempts: jobs.attempts,
      jobMaxAttempts: jobs.maxAttempts,
    })
    .from(orders)
    .leftJoin(receipts, eq(receipts.orderId, orders.id))
    .leftJoin(jobs, and(eq(jobs.kind, PAYMENT_SETTLED_JOB), eq(jobs.dedupeKey, sql`'order:' || ${orders.id}`)))
    .where(and(eq(orders.userId, userId), eq(orders.status, 'PAID')))
    .orderBy(desc(orders.paidAt), desc(orders.id));
  return rows.map(({ jobId, jobDoneAt, jobAttempts, jobMaxAttempts, ...row }) => ({
    ...row,
    state: receiptState({
      number: row.number,
      job: jobId === null ? null : { done: jobDoneAt !== null, givenUp: (jobAttempts ?? 0) >= (jobMaxAttempts ?? 0) },
    }),
  }));
}

export type Receipt = typeof receipts.$inferSelect;

/** One receipt by its number, only for its owner; anyone else gets nothing, exactly as for a number never issued. */
export async function getOwnerReceipt(userId: number, number: number): Promise<Receipt | null> {
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.number, number), eq(receipts.userId, userId)))
    .limit(1);
  return receipt ?? null;
}

/** The receipt number of one of the owner's orders, if it has been issued. */
export async function ownerReceiptNumberForOrder(userId: number, orderId: number): Promise<number | null> {
  const [row] = await db
    .select({ number: receipts.number })
    .from(receipts)
    .where(and(eq(receipts.orderId, orderId), eq(receipts.userId, userId)))
    .limit(1);
  return row?.number ?? null;
}

export type ReceiptRequest = 'issued' | 'queued' | 'not_found';

/**
 * The owner asks for an earlier payment's receipt. Only the owner's own PAID order with a PAID payment qualifies (anything
 * else is `not_found`, the answer for an order that does not exist). An issued receipt answers `issued`. Otherwise the
 * order's outbox row is written, or re-armed when it was already delivered or given up, so the runner issues the receipt
 * on its next pass; a row still waiting is left as it is. Asking twice queues one row and, through the runner, one receipt.
 */
export async function requestReceipt(userId: number, orderId: number): Promise<ReceiptRequest> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status, invitationId: orders.invitationId, templateId: orders.templateId })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1)
      .for('update');
    if (!order || order.status !== 'PAID') return 'not_found';

    const [issued] = await tx.select({ number: receipts.number }).from(receipts).where(eq(receipts.orderId, order.id)).limit(1);
    if (issued) return 'issued';

    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, 'PAID')))
      .orderBy(asc(payments.id))
      .limit(1);
    if (!payment) return 'not_found';

    const now = new Date();
    const payload: PaymentSettledPayload = {
      orderId: order.id,
      paymentId: payment.id,
      invitationId: order.invitationId,
      templateId: order.templateId,
      activation: 'requested',
    };
    await tx
      .insert(jobs)
      .values({
        kind: PAYMENT_SETTLED_JOB,
        payload,
        dedupeKey: paymentSettledDedupeKey(order.id),
        runAt: now,
        maxAttempts: PAYMENT_SETTLED_MAX_ATTEMPTS,
      })
      .onConflictDoUpdate({
        target: [jobs.kind, jobs.dedupeKey],
        set: { payload, attempts: 0, runAt: now, lockedUntil: null, lastError: null, doneAt: null },
        setWhere: sql`${jobs.doneAt} is not null or ${jobs.attempts} >= ${jobs.maxAttempts}`,
      });
    return 'queued';
  });
}
