'use server';

import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { requestReceipt } from '@/lib/payment/receipts';

const LIST = '/dashboard/receipts';

/**
 * G-050: the owner asks for an earlier payment's receipt. The form sends only the order id; ownership, the PAID status
 * and the payment are judged on the server (`requestReceipt`), and another customer's order reads as one that does not
 * exist. The receipt itself is issued by the jobs runner on its next pass.
 */
export async function requestReceiptAction(formData: FormData): Promise<void> {
  if (!isFlagOn('RECEIPTS')) notFound();
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') notFound();

  const orderId = Number(formData.get('orderId'));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(`${LIST}?error=not_found`);

  const outcome = await requestReceipt(user.id, orderId);
  redirect(outcome === 'not_found' ? `${LIST}?error=not_found` : `${LIST}?requested=${outcome}`);
}
