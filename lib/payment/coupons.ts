import { money, type Currency, type Money } from './money';

/**
 * G-053 (D-066): coupons, decided here without a database so the rule set can be pinned by tests.
 *
 * Only an administrator creates a coupon, and it is created inactive; nothing about a discount comes from the customer's
 * form except the code. The checkout's price is the server's (`lib/pricing.ts`); this module turns it and the codes'
 * stored rows into the amount the order charges. The redemption is recorded on the order itself (`order_coupons`) when
 * `createOrder` writes it, under the coupons' row locks (`lib/payment/service.ts`), so the order's `amount` is already
 * the discounted one and both settlement writers verify the payment against it unchanged.
 *
 * Rules, in the order they are checked (the first failing one is reported, naming its code):
 *  0. at most `MAX_CODES_PER_ORDER` codes (`too_many`);
 *  1. every code exists (`unknown`) and its row is well formed (`malformed`);
 *  2. it is active and not disabled (`inactive`), inside its window (`not_started`, `expired`), for this tier when it
 *     names one (`wrong_tier`), and a fixed amount is in the order's currency (`wrong_currency`);
 *  3. more than one code only when every one of them allows stacking (`not_stackable`);
 *  4. the customer has not used it up (`already_used`, per-customer limit, 1 by default: one use per rule) and it has
 *     redemptions left (`exhausted`). A redemption counts while its order is PAID, or PENDING and still payable; a
 *     failed or expired order gives it back;
 *  5. percentages first (each on the running amount, in coupon id order), then fixed amounts (id order); each discount
 *     is rounded down to a whole minor unit, so the customer never pays less than the rules give;
 *  6. what is left to pay is at least the rail's floor (`below_minimum`): a set that would charge less is refused, not
 *     clamped, because the rails cannot collect nothing and an operator should see a code that is too generous.
 */

export const COUPON_KINDS = ['percent', 'fixed'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

/** At most this many codes on one order; more is refused before any lookup. */
export const MAX_CODES_PER_ORDER = 3;

/** A stored code: upper-case letters, digits and hyphens, 3–32 characters, starting with a letter or a digit. */
const CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/**
 * The smallest amount a discounted order may still charge, in minor units. Technical floors, not prices: Stripe's
 * minimum USD charge is 50 cents; IDR keeps a conservative Rp 1.000 for QRIS until the chosen acquirer states its own.
 */
export const MIN_CHARGE: Record<Currency, number> = { IDR: 1_000, USD: 50 };

export type CouponRow = {
  id: number;
  code: string;
  kind: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  tier: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perCustomer: number;
  stackable: boolean;
  active: boolean;
  disabledAt: Date | null;
};

/** Redemptions that still count: all customers (`live`) and this customer (`mine`). */
export type CouponUsage = { live: number; mine: number };

export type CouponRefusal =
  | 'too_many'
  | 'unknown'
  | 'malformed'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'wrong_tier'
  | 'wrong_currency'
  | 'not_stackable'
  | 'already_used'
  | 'exhausted'
  | 'below_minimum';

export const COUPON_REFUSALS: readonly CouponRefusal[] = [
  'too_many',
  'unknown',
  'malformed',
  'inactive',
  'not_started',
  'expired',
  'wrong_tier',
  'wrong_currency',
  'not_stackable',
  'already_used',
  'exhausted',
  'below_minimum',
];

export type CouponLine = { couponId: number; code: string; discount: number };

export type CouponDecision =
  | { ok: true; list: Money; payable: Money; lines: CouponLine[] }
  | { ok: false; reason: CouponRefusal; code: string | null };

/**
 * A refused coupon at checkout: nothing was written. `code` names the code the rule failed on. `unavailable` is the
 * checkout's own refusal while `FLAG_COUPONS` is off: no new coupon order is made, although the order a key already
 * made with its codes still resumes (`createOrder`'s `couponsOpen`).
 */
export class CouponRefusedError extends Error {
  constructor(
    readonly reason: CouponRefusal | 'unavailable',
    readonly code: string | null,
  ) {
    super(`coupon refused: ${reason}${code ? ` (${code})` : ''}`);
    this.name = 'CouponRefusedError';
  }
}

/** One code as an administrator types it, normalised; `null` when it cannot be a code. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

/**
 * The checkout field: codes separated by spaces, commas or semicolons, normalised, de-duplicated and sorted (the sorted
 * list is part of the checkout intent). Empty is no coupon.
 */
export function normalizeCouponCodes(raw: unknown): { ok: true; codes: string[] } | { ok: false; reason: 'invalid' | 'too_many' } {
  if (raw === null || raw === undefined) return { ok: true, codes: [] };
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };
  const codes = [...new Set(raw.toUpperCase().split(/[\s,;]+/).filter(Boolean))].sort();
  if (codes.length > MAX_CODES_PER_ORDER) return { ok: false, reason: 'too_many' };
  if (!codes.every((code) => CODE.test(code))) return { ok: false, reason: 'invalid' };
  return { ok: true, codes };
}

const isWhole = (value: number | null): value is number => value !== null && Number.isInteger(value);

/**
 * The administrator's form, parsed. Everything a coupon stores except who made it; a new coupon is never active.
 * `partner` attributes the code to an affiliate (a console-only label; it plays no part in the rules).
 */
export type CouponInput = Omit<CouponRow, 'id' | 'active' | 'disabledAt'> & { partner: string | null };

export type CouponInputError = 'code' | 'kind' | 'percent' | 'amount' | 'currency' | 'tier' | 'window' | 'max' | 'per_customer' | 'partner';

/** A partner label: 1–64 characters after trimming, letters, digits, spaces and `. , & @ _ ' -` only. */
const PARTNER = /^[\p{L}\p{N}][\p{L}\p{N} .,&@_'-]{0,63}$/u;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** A `datetime-local` value read as Western Indonesian Time (UTC+7), the console's stated zone; `null` when empty. */
function wibDateTime(raw: string | undefined): Date | null | 'invalid' {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return 'invalid';
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute) - WIB_OFFSET_MS;
  const check = new Date(utc + WIB_OFFSET_MS);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return 'invalid';
  return new Date(utc);
}

/** A whole number from a form field, or `null` when empty; anything else is `NaN`. */
function wholeOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  return /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
}

/**
 * The console's create form. Amounts are typed in the currency's unit (whole rupiah; dollars with up to two decimals)
 * and stored in minor units; the window is read in WIB. Refuses what `wellFormedCoupon` would refuse.
 */
export function parseCouponInput(
  fields: Record<string, string | undefined>,
  tiers: readonly string[],
): { ok: true; value: CouponInput } | { ok: false; error: CouponInputError } {
  const code = normalizeCouponCode(fields.code);
  if (!code) return { ok: false, error: 'code' };
  const kind = fields.kind;
  if (kind !== 'percent' && kind !== 'fixed') return { ok: false, error: 'kind' };

  let percentOff: number | null = null;
  let amountOff: number | null = null;
  let currency: string | null = null;
  if (kind === 'percent') {
    percentOff = wholeOrNull(fields.percent);
    if (!isWhole(percentOff) || percentOff < 1 || percentOff > 99) return { ok: false, error: 'percent' };
  } else {
    currency = fields.currency ?? null;
    if (currency !== 'IDR' && currency !== 'USD') return { ok: false, error: 'currency' };
    const decimals = currency === 'USD' ? 2 : 0;
    const raw = (fields.amount ?? '').trim();
    const pattern = decimals === 0 ? /^\d{1,9}$/ : /^\d{1,7}(\.\d{1,2})?$/;
    if (!pattern.test(raw)) return { ok: false, error: 'amount' };
    amountOff = Math.round(Number(raw) * 10 ** decimals);
    if (amountOff < 1) return { ok: false, error: 'amount' };
  }

  const tier = fields.tier ? fields.tier : null;
  if (tier !== null && !tiers.includes(tier)) return { ok: false, error: 'tier' };

  const startsAt = wibDateTime(fields.startsAt);
  const endsAt = wibDateTime(fields.endsAt);
  if (startsAt === 'invalid' || endsAt === 'invalid' || (startsAt && endsAt && startsAt >= endsAt)) return { ok: false, error: 'window' };

  const maxRedemptions = wholeOrNull(fields.maxRedemptions);
  if (maxRedemptions !== null && (!isWhole(maxRedemptions) || maxRedemptions < 1)) return { ok: false, error: 'max' };
  const perCustomer = wholeOrNull(fields.perCustomer) ?? 1;
  if (!isWhole(perCustomer) || perCustomer < 1) return { ok: false, error: 'per_customer' };

  const partnerRaw = (fields.partner ?? '').trim().replace(/\s+/g, ' ');
  if (partnerRaw !== '' && !PARTNER.test(partnerRaw)) return { ok: false, error: 'partner' };
  const partner = partnerRaw === '' ? null : partnerRaw;

  return {
    ok: true,
    value: { code, kind, percentOff, amountOff, currency, tier, startsAt, endsAt, maxRedemptions, perCustomer, stackable: fields.stackable === 'on', partner },
  };
}

/** A row the rules can apply: the admin form refuses anything else, and this refuses it again at checkout. */
export function wellFormedCoupon(row: CouponRow): boolean {
  if (!CODE.test(row.code)) return false;
  if (!Number.isInteger(row.perCustomer) || row.perCustomer < 1) return false;
  if (row.maxRedemptions !== null && (!Number.isInteger(row.maxRedemptions) || row.maxRedemptions < 1)) return false;
  if (row.startsAt && row.endsAt && row.startsAt >= row.endsAt) return false;
  if (row.kind === 'percent') return isWhole(row.percentOff) && row.percentOff >= 1 && row.percentOff <= 99 && row.amountOff === null;
  if (row.kind === 'fixed') {
    return isWhole(row.amountOff) && row.amountOff >= 1 && row.percentOff === null && (row.currency === 'IDR' || row.currency === 'USD');
  }
  return false;
}

const refuse = (reason: CouponRefusal, code: string | null): CouponDecision => ({ ok: false, reason, code });

export function decideCoupons(input: {
  list: Money;
  tier: string;
  now: Date;
  codes: readonly string[];
  coupons: readonly CouponRow[];
  usage: ReadonlyMap<number, CouponUsage>;
}): CouponDecision {
  const { list } = input;
  if (input.codes.length > MAX_CODES_PER_ORDER) return refuse('too_many', input.codes[MAX_CODES_PER_ORDER]);
  const byCode = new Map(input.coupons.map((row) => [row.code, row]));
  const chosen: CouponRow[] = [];
  for (const code of input.codes) {
    const row = byCode.get(code);
    if (!row) return refuse('unknown', code);
    chosen.push(row);
  }
  if (chosen.length === 0) return { ok: true, list, payable: list, lines: [] };

  for (const row of chosen) {
    if (!wellFormedCoupon(row)) return refuse('malformed', row.code);
    if (!row.active || row.disabledAt !== null) return refuse('inactive', row.code);
    if (row.startsAt && input.now < row.startsAt) return refuse('not_started', row.code);
    if (row.endsAt && input.now >= row.endsAt) return refuse('expired', row.code);
    if (row.tier !== null && row.tier !== input.tier) return refuse('wrong_tier', row.code);
    if (row.kind === 'fixed' && row.currency !== list.currency) return refuse('wrong_currency', row.code);
  }

  if (chosen.length > 1) {
    const alone = chosen.find((row) => !row.stackable);
    if (alone) return refuse('not_stackable', alone.code);
  }

  for (const row of chosen) {
    const usage = input.usage.get(row.id) ?? { live: 0, mine: 0 };
    if (usage.mine >= row.perCustomer) return refuse('already_used', row.code);
    if (row.maxRedemptions !== null && usage.live >= row.maxRedemptions) return refuse('exhausted', row.code);
  }

  const ordered = [...chosen].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'percent' ? -1 : 1));
  let running = list.amount;
  const lines: CouponLine[] = [];
  for (const row of ordered) {
    const discount = row.kind === 'percent' ? Math.floor((running * (row.percentOff as number)) / 100) : Math.min(row.amountOff as number, running);
    running -= discount;
    lines.push({ couponId: row.id, code: row.code, discount });
  }
  if (running < MIN_CHARGE[list.currency]) return refuse('below_minimum', ordered[ordered.length - 1].code);
  return { ok: true, list, payable: money(running, list.currency), lines };
}
