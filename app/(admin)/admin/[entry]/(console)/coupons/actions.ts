'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin, getPrivateAdminPath } from '@/lib/auth/admin-access';
import { createCoupon, disableCoupon, setCouponActive } from '@/lib/payment/coupon-admin';
import { parseCouponInput } from '@/lib/payment/coupons';

/**
 * G-053 (D-066): the console's coupon actions. Authorisation is re-checked in each action: a server action is its own
 * entry point. A new coupon is always created inactive; activation is a separate, deliberate step.
 */

const TIERS = ['standard', 'premium'] as const;
const FIELDS = ['code', 'kind', 'percent', 'amount', 'currency', 'tier', 'startsAt', 'endsAt', 'maxRedemptions', 'perCustomer', 'stackable', 'partner'] as const;

function couponsPath(): string {
  return `${getPrivateAdminPath() ?? '/sign-in'}/coupons`;
}

function couponId(formData: FormData): number | null {
  const id = Number(formData.get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createCouponAction(formData: FormData): Promise<void> {
  const admin = assertAuthorizedAdmin(await getUser());
  const path = couponsPath();
  const fields = Object.fromEntries(FIELDS.map((name) => [name, formData.get(name)?.toString()]));
  const parsed = parseCouponInput(fields, TIERS);
  if (!parsed.ok) redirect(`${path}?error=${parsed.error}`);
  const created = await createCoupon(parsed.value, admin.id);
  if (!created.ok) redirect(`${path}?error=duplicate`);
  revalidatePath(path);
  redirect(`${path}?created=${encodeURIComponent(parsed.value.code)}`);
}

export async function setCouponActiveAction(formData: FormData): Promise<void> {
  assertAuthorizedAdmin(await getUser());
  const path = couponsPath();
  const id = couponId(formData);
  const active = formData.get('active') === 'on';
  if (id === null || !(await setCouponActive(id, active))) redirect(`${path}?error=notfound`);
  revalidatePath(path);
  redirect(`${path}?${active ? 'activated' : 'paused'}=${id}`);
}

export async function disableCouponAction(formData: FormData): Promise<void> {
  assertAuthorizedAdmin(await getUser());
  const path = couponsPath();
  const id = couponId(formData);
  if (id === null || !(await disableCoupon(id))) redirect(`${path}?error=notfound`);
  revalidatePath(path);
  redirect(`${path}?disabled=${id}`);
}
