import { formatMoney, money, type Currency, type Money } from '@/lib/payment/money';

/**
 * Single place for invitation activation pricing.
 *
 * One-time payment per invitation (locked decision #1) — never a subscription.
 * Two currencies because there are two payment rails: IDR is collected over
 * QRIS, everything else over Stripe. The currency decides the rail, so the price
 * shown and the way it is charged can never disagree.
 *
 * These figures were previously inlined in the customer theme catalog, and the
 * marketing pricing page separately advertised "Rp0 / GRATIS". Whoever settles
 * that conflict changes the constants here (or moves them to the database), and
 * does not re-scatter literals across components.
 *
 * Amounts are integer minor units: whole rupiah for IDR, cents for USD.
 */

export type Tier = 'standard' | 'premium';

const PRICES: Record<Currency, Record<Tier, number>> = {
  IDR: { standard: 149_000, premium: 299_000 },
  // Set independently of the exchange rate: international customers are a
  // different market, and a floating conversion would make prices move daily.
  USD: { standard: 1900, premium: 3900 },
};

export function priceFor(tier: Tier, currency: Currency): Money {
  return money(PRICES[currency][tier], currency);
}

export function tierFor(isPremium: boolean): Tier {
  return isPremium ? 'premium' : 'standard';
}

export function activationPrice(isPremium: boolean, currency: Currency = 'IDR'): Money {
  return priceFor(tierFor(isPremium), currency);
}

/**
 * Billing currency for a visitor.
 *
 * Follows the resolved locale rather than IP geolocation, so the price on the
 * page is by construction the price charged — one signal drives both.
 */
export function currencyForLocale(locale: 'id' | 'en'): Currency {
  return locale === 'id' ? 'IDR' : 'USD';
}

/**
 * The price string marketing pages show for a tier (B-002, ADR-O02): the amount checkout charges for the visitor's
 * locale, formatted the same way. Copy never carries a price literal.
 */
export function tierPriceLabel(tier: Tier, locale: 'id' | 'en'): string {
  return formatMoney(priceFor(tier, currencyForLocale(locale)), locale);
}

/**
 * Raw rupiah figures, retained for call sites that render a plain number.
 * Prefer `priceFor`, which carries its currency.
 */
export const ACTIVATION_PRICE_IDR = {
  standard: PRICES.IDR.standard,
  premium: PRICES.IDR.premium,
} as const;
