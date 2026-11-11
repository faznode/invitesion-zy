import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { coupons, orderCoupons, orders } from '@/lib/db/schema';
import type { CouponInput } from './coupons';
import { liveRedemption } from './service';

/**
 * G-053 (D-066): the console's coupon operations. The caller has authorised the administrator. A coupon is created
 * inactive; activating, pausing and disabling never touch an order already made, whose amount was fixed when it was
 * written. Disabling is final (the code stays reserved, so it can never be reissued with other terms).
 */

/**
 * A coupon with its redemptions that still count (`live`), those paid, and what the paid orders charged per currency
 * (`paidIdr`, `paidUsd`, minor units): the figures an affiliate's commission would be computed from once the owner sets
 * a rate.
 */
export type CouponListing = typeof coupons.$inferSelect & { live: number; paid: number; paidIdr: number; paidUsd: number };

/** Every coupon, newest first, with its usage. */
export async function listCouponsWithUsage(now: Date = new Date()): Promise<CouponListing[]> {
  const [rows, usage] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.createdAt), desc(coupons.id)),
    db
      .select({
        couponId: orderCoupons.couponId,
        live: sql<number>`(count(*) filter (where ${liveRedemption(now)}))::int`,
        paid: sql<number>`(count(*) filter (where ${orders.status} = 'PAID'))::int`,
        paidIdr: sql<number>`(coalesce(sum(${orders.amount}) filter (where ${orders.status} = 'PAID' and ${orders.currency} = 'IDR'), 0))::bigint`,
        paidUsd: sql<number>`(coalesce(sum(${orders.amount}) filter (where ${orders.status} = 'PAID' and ${orders.currency} = 'USD'), 0))::bigint`,
      })
      .from(orderCoupons)
      .innerJoin(orders, eq(orders.id, orderCoupons.orderId))
      .groupBy(orderCoupons.couponId),
  ]);
  const byCoupon = new Map(usage.map((row) => [row.couponId, row]));
  return rows.map((row) => {
    const use = byCoupon.get(row.id);
    return { ...row, live: Number(use?.live ?? 0), paid: Number(use?.paid ?? 0), paidIdr: Number(use?.paidIdr ?? 0), paidUsd: Number(use?.paidUsd ?? 0) };
  });
}

/** Creates the coupon inactive. `duplicate` when the code is taken (including by a disabled coupon). */
export async function createCoupon(input: CouponInput, adminUserId: number): Promise<{ ok: true; id: number } | { ok: false; error: 'duplicate' }> {
  const [row] = await db
    .insert(coupons)
    .values({ ...input, active: false, createdBy: adminUserId })
    .onConflictDoNothing({ target: coupons.code })
    .returning({ id: coupons.id });
  return row ? { ok: true, id: row.id } : { ok: false, error: 'duplicate' };
}

/** Activates or pauses a coupon that is not disabled; `false` when there was no such coupon. */
export async function setCouponActive(id: number, active: boolean): Promise<boolean> {
  const rows = await db
    .update(coupons)
    .set({ active })
    .where(and(eq(coupons.id, id), isNull(coupons.disabledAt)))
    .returning({ id: coupons.id });
  return rows.length === 1;
}

/** Disables a coupon for good; `false` when it was already disabled or does not exist. */
export async function disableCoupon(id: number, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(coupons)
    .set({ active: false, disabledAt: now })
    .where(and(eq(coupons.id, id), isNull(coupons.disabledAt)))
    .returning({ id: coupons.id });
  return rows.length === 1;
}
