'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin, getPrivateAdminPath } from '@/lib/auth/admin-access';
import {
  AmountMismatchError,
  OrderNotFoundError,
  RailMismatchError,
  SettlementUnconfirmedError,
  closeUnpaid,
  confirmManually,
} from '@/lib/payment/service';

/**
 * G-053 (D-066): closes a manual QRIS order the customer never paid, after the operator has checked that no transfer
 * arrived. A static QR has no payment window, so without this an abandoned order would hold its coupon redemption (a
 * cap, a customer's one use) for good. Through the same settlement as a confirmation; pressing twice is a duplicate.
 */
export async function closeOrderUnpaid(formData: FormData): Promise<void> {
  const admin = assertAuthorizedAdmin(await getUser());
  const adminPath = getPrivateAdminPath() ?? '/sign-in';
  const ordersPath = `${adminPath}/orders`;

  const reference = String(formData.get('reference') || '').trim();
  if (!reference) redirect(`${ordersPath}?error=invalid`);

  try {
    const outcome = await closeUnpaid({ reference, adminUserId: admin.id, note: String(formData.get('note') || '').trim() || undefined });
    revalidatePath(ordersPath);
    if (!outcome.applied) redirect(`${ordersPath}?notice=${outcome.reason}`);
    redirect(`${ordersPath}?closed=${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error instanceof OrderNotFoundError) redirect(`${ordersPath}?error=notfound`);
    if (error instanceof RailMismatchError) redirect(`${ordersPath}?error=rail`);
    if (error instanceof SettlementUnconfirmedError) redirect(`${ordersPath}?error=unconfirmed`);
    throw error;
  }
}

/**
 * Marks a QRIS order paid after an operator has seen the money arrive.
 *
 * This exists because QRIS without an acquirer has no settlement callback (see
 * `lib/payment/qris-provider.ts`). It routes through the same settlement as a real
 * webhook (`settle`, whichever writer `BACKEND_PAYMENT` selects), so an operator
 * confirmation and a provider callback cannot produce different state — and the
 * synthetic event id makes pressing the button twice a no-op rather than a double
 * activation. The notice says whether the invitation went live: a deleted one, one
 * already live or one on another theme than the order bought stays as it is.
 *
 * Authorisation is re-checked here, not inherited from the page: a server action
 * is its own entry point and reaching it does not require having rendered the
 * page that links to it.
 */
export async function confirmOrderPaid(formData: FormData): Promise<void> {
  const admin = assertAuthorizedAdmin(await getUser());
  const adminPath = getPrivateAdminPath() ?? '/sign-in';
  const ordersPath = `${adminPath}/orders`;

  const reference = String(formData.get('reference') || '').trim();
  if (!reference) redirect(`${ordersPath}?error=invalid`);

  try {
    const outcome = await confirmManually({
      reference,
      adminUserId: admin.id,
      note: String(formData.get('note') || '').trim() || undefined,
    });

    revalidatePath(ordersPath);
    revalidatePath(adminPath);

    if (!outcome.applied) redirect(`${ordersPath}?notice=${outcome.reason}`);
    redirect(`${ordersPath}?confirmed=${encodeURIComponent(reference)}${outcome.invitationActivated ? '' : '&activated=0'}`);
  } catch (error) {
    if (error instanceof OrderNotFoundError) redirect(`${ordersPath}?error=notfound`);
    if (error instanceof AmountMismatchError) redirect(`${ordersPath}?error=amount`);
    if (error instanceof RailMismatchError) redirect(`${ordersPath}?error=rail`);
    if (error instanceof SettlementUnconfirmedError) redirect(`${ordersPath}?error=unconfirmed`);
    throw error;
  }
}
