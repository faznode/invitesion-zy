/**
 * Money handling.
 *
 * Amounts are stored and transported as integer **minor units** — never as
 * floats, and never as a display string. `1.15` cannot be represented exactly
 * in binary floating point, so any arithmetic on decimal currency amounts
 * eventually charges someone the wrong number.
 *
 * The exponent is per-currency and is not a detail that can be assumed. Two
 * traps this table exists to avoid:
 *
 *  - IDR is written and paid as whole rupiah domestically (Rp149.000), so our
 *    own accounting and QRIS use exponent 0.
 *  - Stripe, however, treats IDR as a two-decimal currency. Sending 149000 to
 *    Stripe as IDR would charge Rp1.490. `toStripeAmount` handles that
 *    conversion in one place rather than at each call site.
 *
 * Pure by design: no `server-only`, no I/O, so the rounding rules are directly
 * testable.
 */

export const SUPPORTED_CURRENCIES = ['IDR', 'USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** Decimal places we use internally for each currency. */
const EXPONENT: Record<Currency, number> = {
  IDR: 0,
  USD: 2,
};

/**
 * Decimal places Stripe expects. Diverges from ours for IDR, deliberately.
 * Stripe's zero-decimal list does not include IDR.
 */
const STRIPE_EXPONENT: Record<Currency, number> = {
  IDR: 2,
  USD: 2,
};

export type Money = {
  /** Integer minor units in our own exponent for `currency`. */
  amount: number;
  currency: Currency;
};

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Money amount must be an integer in minor units, got ${amount}`);
  }
  if (amount < 0) throw new TypeError(`Money amount must not be negative, got ${amount}`);
  return { amount, currency };
}

export function exponentFor(currency: Currency): number {
  return EXPONENT[currency];
}

/**
 * Converts our minor units into the minor units Stripe expects.
 *
 * For USD this is identity. For IDR it scales by 100, because Stripe counts
 * IDR in hundredths while we count whole rupiah.
 */
export function toStripeAmount(value: Money): number {
  const delta = STRIPE_EXPONENT[value.currency] - EXPONENT[value.currency];
  return value.amount * 10 ** delta;
}

/** Inverse of `toStripeAmount`, for reading amounts back off a webhook. */
export function fromStripeAmount(amount: number, currency: Currency): Money {
  const delta = STRIPE_EXPONENT[currency] - EXPONENT[currency];
  const scaled = amount / 10 ** delta;
  if (!Number.isInteger(scaled)) {
    // A Stripe IDR amount that is not a whole number of rupiah means the charge
    // did not match anything we could have issued. Refuse rather than round.
    throw new RangeError(`Stripe amount ${amount} ${currency} is not a whole minor unit for us`);
  }
  return money(scaled, currency);
}

/** Human-readable amount for the given locale. */
export function formatMoney(value: Money, locale: 'id' | 'en' = 'id'): string {
  const fractionDigits = EXPONENT[value.currency];
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value.amount / 10 ** fractionDigits);
}

/** Equality that refuses to compare across currencies. */
export function sameMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}
