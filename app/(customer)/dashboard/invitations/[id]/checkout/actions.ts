'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { templates } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getLocale } from '@/lib/locale-server';
import { OwnershipError, requireOwnedInvitation } from '@/lib/invitation/service';
import { getPublicOrigin } from '@/lib/invitation/public-url';
import { isFlagOn } from '@/lib/flags';
import { activationPrice, currencyForLocale, tierFor } from '@/lib/pricing';
import { normalizeCheckoutKey } from '@/lib/payment/checkout-key';
import { CouponRefusedError, normalizeCouponCodes } from '@/lib/payment/coupons';
import { CheckoutClosedError, CheckoutConflictError, createOrder, hasPaidOrder } from '@/lib/payment/service';
import { ProviderError } from '@/lib/payment/types';

/**
 * Starts payment for an invitation.
 *
 * The price is computed **server-side** from the template tier and the resolved
 * locale. Nothing about the amount comes from the form: a client that could post
 * its own price could buy a premium invitation for one rupiah.
 *
 * The rail follows from the currency (IDR → QRIS, otherwise Stripe), so a
 * customer can never be quoted in one currency and charged on a rail that
 * settles in another.
 *
 * B-039: the form carries the checkout key its page rendered, so a double tap or a
 * resubmitted page reaches the same order (`createOrder`). A form without a valid
 * key (a page rendered before keys existed) gets a fresh one: that submit is
 * accepted, without the double-submit protection. A rail that hosts its own page
 * (Stripe) receives the customer there; a QRIS order is shown on the checkout page.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const invitationId = Number(formData.get('invitationId'));
  if (!Number.isInteger(invitationId) || invitationId <= 0) redirect('/dashboard/invitations?error=invalid');

  let invitation;
  try {
    invitation = await requireOwnedInvitation(invitationId, user.id);
  } catch (error) {
    if (error instanceof OwnershipError) redirect('/dashboard/invitations?error=notfound');
    throw error;
  }

  if (invitation.status === 'PUBLISHED') {
    redirect('/dashboard/invitations?notice=already-published');
  }

  const checkoutPath = `/dashboard/invitations/${invitationId}/checkout`;

  // Entitlement is per (invitation, theme). If the current theme has already
  // been paid for, there is nothing to sell — surface the paid state instead of
  // charging the same pair twice.
  if (await hasPaidOrder(invitationId, invitation.templateId)) {
    redirect(`${checkoutPath}?paid=1`);
  }

  // Tier comes from the template the customer picked, not from the request.
  let isPremium = false;
  if (invitation.templateId) {
    const [template] = await db
      .select({ isPremium: templates.isPremium })
      .from(templates)
      .where(eq(templates.id, invitation.templateId))
      .limit(1);
    isPremium = template?.isPremium ?? false;
  }

  const locale = await getLocale();
  const currency = currencyForLocale(locale === 'en' ? 'en' : 'id');
  const price = activationPrice(isPremium, currency);
  const origin = await getPublicOrigin();

  const checkoutKey = normalizeCheckoutKey(formData.get('checkoutKey')) ?? randomUUID();

  // G-053: the codes are all a form says about a discount; `createOrder` decides it on the server. While coupons are off
  // a typed code is refused with a notice rather than ignored, so nobody is charged in full when they expected less;
  // the order a key already made with its codes (the Stripe resume form sends them back) still resumes.
  const couponsOpen = isFlagOn('COUPONS');
  const typedCodes = formData.get('couponCodes');
  let couponCodes: string[] = [];
  if (typeof typedCodes === 'string' && typedCodes.trim() !== '') {
    const parsed = normalizeCouponCodes(typedCodes);
    if (!parsed.ok) redirect(`${checkoutPath}?error=coupon&reason=${couponsOpen ? parsed.reason : 'unavailable'}`);
    couponCodes = parsed.codes;
  }

  let start;
  try {
    start = await createOrder({
      userId: user.id,
      invitationId,
      templateId: invitation.templateId ?? null,
      price,
      tier: tierFor(isPremium),
      description: `Aktivasi undangan /${invitation.slug}`,
      customerEmail: user.email,
      successUrl: `${origin}${checkoutPath}?paid=1`,
      cancelUrl: `${origin}${checkoutPath}?cancelled=1`,
      checkoutKey,
      couponCodes,
      couponsOpen,
    });
  } catch (error) {
    if (error instanceof CouponRefusedError) redirect(`${checkoutPath}?error=coupon&reason=${error.reason}`);
    if (error instanceof CheckoutConflictError) redirect(`${checkoutPath}?error=changed`);
    if (error instanceof CheckoutClosedError) redirect(`${checkoutPath}?error=closed`);
    if (error instanceof ProviderError) {
      // A rail that is not configured is an operator problem, not the customer's.
      // Say so plainly instead of showing a generic failure.
      console.error('[checkout] payment rail unavailable', error);
      redirect(`${checkoutPath}?error=rail`);
    }
    throw error;
  }

  if (start.kind === 'paid') redirect(`${checkoutPath}?paid=1`);
  // A rail with its own payment page (Stripe Checkout): the customer pays there, and only the webhook settles the order.
  if (start.handle.redirectUrl && new URL(start.handle.redirectUrl).protocol === 'https:') redirect(start.handle.redirectUrl);
  redirect(`${checkoutPath}?ref=${start.reference}`);
}
