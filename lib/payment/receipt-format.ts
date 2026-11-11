/**
 * G-050: the pure parts of receipts (no database): the printed number, the URL segment, and what an owner sees for a paid
 * order. `lib/payment/receipts.ts` holds the queries.
 */

/** The printed form of a receipt number: `KW-000123` (kuitansi). The stored number is the integer. */
export function formatReceiptNumber(number: number): string {
  return `KW-${String(number).padStart(6, '0')}`;
}

/** A receipt number from a URL segment: a positive integer without sign, leading zeros or exponent; anything else is none. */
export function parseReceiptNumber(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const number = Number(raw);
  return number <= 2_147_483_647 ? number : null;
}

export type ReceiptState = 'issued' | 'preparing' | 'on_request';

/**
 * Whether a paid order has its receipt, is waiting for the runner (its outbox row is due or leased), or needs the owner's
 * request: no row (an earlier payment), or a row delivered or given up without a receipt.
 */
export function receiptState(row: { number: number | null; job: { done: boolean; givenUp: boolean } | null }): ReceiptState {
  if (row.number !== null) return 'issued';
  if (row.job && !row.job.done && !row.job.givenUp) return 'preparing';
  return 'on_request';
}

/** The rail as a customer knows it. */
export function railLabel(rail: string, en: boolean): string {
  if (rail === 'qris') return 'QRIS';
  if (rail === 'stripe') return en ? 'Card (Stripe)' : 'Kartu (Stripe)';
  return rail;
}

/** What was bought, from the order's tier alone (no invitation title: it can carry personal names). */
export function receiptItem(tier: string | null, en: boolean): string {
  const base = en ? 'Digital invitation activation' : 'Aktivasi undangan digital';
  if (!tier) return base;
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  return en ? `${base}, ${name} package` : `${base}, paket ${name}`;
}
