import { parseWhatsAppNumber } from './whatsapp';

/**
 * B-033: the roster's rules, one pure decision for both writers (`BACKEND_ROSTER=next|rust`). The Rust port in
 * `services/api/src/roster/rules.rs` runs the same cases from `contracts/vectors/roster-rules.json`, so a host's add,
 * import or approved registration is judged and stored identically whichever writer is live. Client-safe.
 */

/**
 * Technical ceilings, the same in both writers. `lib/pricing.ts` defines no guest count per tier (an owner pricing
 * decision, B-040); a plan limit, once decided, can only tighten these.
 */
export const ROSTER_LIMITS = {
  /** Guests on one invitation, imported or not. */
  maxGuests: 3000,
  /** Rows in one import. */
  maxImportRows: 1000,
  /** Self-registrations waiting for the host on one invitation. */
  maxPendingRegistrations: 300,
  /** Seats a guest may hold, as the add form has always allowed. */
  maxSeats: 50,
  /** Seats a self-registrant may ask for. */
  maxRegistrationSeats: 5,
  /** Characters (code points) of a name and of a category, as their columns hold. */
  maxName: 150,
  maxCategory: 50,
  maxPhone: 30,
  /** A base slug leaves room for a `-<n>` suffix inside the 150-character column. */
  maxBaseSlug: 140,
} as const;

/**
 * JavaScript's `\s`, spelled out so the Rust port can use the identical set (Rust's `char::is_whitespace` differs at
 * U+FEFF and U+0085).
 */
const SPACE = /[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;
/** C0 controls and DEL left after whitespace is collapsed (NUL would not even reach PostgreSQL). */
const CONTROL = /[\u0000-\u001f\u007f]/;

const codePoints = (value: string) => [...value].length;

/** Trimmed, every run of whitespace one space. */
export function collapseSpaces(value: string | null | undefined): string {
  return (value ?? '').replace(SPACE, ' ').trim();
}

export type RosterRowInput = {
  name?: string | null;
  phone?: string | null;
  category?: string | null;
  /** As typed or as the cell held; empty = 1. */
  guestCount?: string | number | null;
};

export type RowReason = 'name' | 'phone' | 'seats' | 'category';

/** A row that passed the rules, in the shape it is stored (the phone as typed, its WhatsApp digits for the duplicate key). */
export type RosterRow = {
  name: string;
  phone: string | null;
  category: string | null;
  guestCount: number;
  /** B-018's digits of the phone, or null without one. */
  digits: string | null;
};

export type RowCheck = { ok: true; row: RosterRow } | { ok: false; reason: RowReason };

/**
 * One row against the rules, in a fixed order (name, phone, seats, category) so both writers name the same reason:
 * - name: whitespace collapsed, 1–150 code points, no control character;
 * - phone: optional; when given, at most 30 characters and a WhatsApp number by B-018's rule (`parseWhatsAppNumber`);
 * - seats: empty = 1, otherwise 1–3 digits worth 1…`maxSeats` (the registration form passes its own lower ceiling);
 * - category: optional, whitespace collapsed, at most 50 code points, no control character.
 */
export function checkRosterRow(input: RosterRowInput, maxSeats: number = ROSTER_LIMITS.maxSeats): RowCheck {
  const name = collapseSpaces(input.name);
  if (!name || codePoints(name) > ROSTER_LIMITS.maxName || CONTROL.test(name)) return { ok: false, reason: 'name' };

  const phone = collapseSpaces(input.phone);
  let digits: string | null = null;
  if (phone) {
    const parsed = parseWhatsAppNumber(phone);
    if (codePoints(phone) > ROSTER_LIMITS.maxPhone || !parsed.ok) return { ok: false, reason: 'phone' };
    digits = parsed.digits;
  }

  const seatsText = typeof input.guestCount === 'number' ? String(input.guestCount) : collapseSpaces(input.guestCount);
  const guestCount = seatsText === '' ? 1 : /^[0-9]{1,3}$/.test(seatsText) ? Number(seatsText) : Number.NaN;
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > maxSeats) return { ok: false, reason: 'seats' };

  const category = collapseSpaces(input.category);
  if (codePoints(category) > ROSTER_LIMITS.maxCategory || CONTROL.test(category)) return { ok: false, reason: 'category' };

  return { ok: true, row: { name, phone: phone || null, category: category || null, guestCount, digits } };
}

/** The name as the duplicate check compares it. */
export const nameKey = (name: string) => `n:${collapseSpaces(name).toLowerCase()}`;
/** A WhatsApp number as the duplicate check compares it. */
export const phoneKey = (digits: string) => `p:${digits}`;

/** What a guest already on the list contributes to the duplicate check: its name, and its number when that parses. */
export function rosterKeys(guest: { name: string; phone: string | null }): string[] {
  const parsed = parseWhatsAppNumber(guest.phone);
  return parsed.ok ? [nameKey(guest.name), phoneKey(parsed.digits)] : [nameKey(guest.name)];
}

/**
 * A row's duplicate key: its number when it has one (the same number is the same person, however the name is spelled),
 * otherwise its name (two phoneless rows of one name cannot be told apart in the list).
 */
export const duplicateKey = (row: RosterRow) => (row.digits ? phoneKey(row.digits) : nameKey(row.name));

/** The keys a row adds once accepted: its name always, its number when it has one. */
export const acceptedKeys = (row: RosterRow) => (row.digits ? [nameKey(row.name), phoneKey(row.digits)] : [nameKey(row.name)]);

/** The slug base of a name, as both lists have always made it, cut to leave room for a suffix. */
export function slugBase(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cut = slug.slice(0, ROSTER_LIMITS.maxBaseSlug).replace(/-+$/, '');
  return cut || 'tamu';
}

/** The base if it is free, otherwise `<base>-<n>` for the smallest free n ≥ 2. Records the slug it returns as taken. */
export function claimSlug(name: string, taken: Set<string>): string {
  const base = slugBase(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export type ImportVerdict =
  | { status: 'ok'; slug: string; row: RosterRow }
  | { status: 'invalid'; reason: RowReason }
  | { status: 'duplicate'; of: 'roster' | 'file' };

export type ImportPlan = {
  verdicts: ImportVerdict[];
  ok: number;
  invalid: number;
  duplicate: number;
  /** Set when the import cannot be written as a whole; nothing is then written. */
  refusal: null | 'too_many_rows' | 'roster_full' | 'nothing_to_import';
};

/**
 * The whole import, decided before anything is written: every row's verdict in file order, the slug of every accepted
 * row, and whether the accepted rows fit (`existing + ok ≤ maxGuests`). Duplicates are judged against the list as it
 * is and against the rows accepted above them.
 */
export function planImport(existing: Array<{ name: string; phone: string | null; slug: string }>, rows: RosterRowInput[]): ImportPlan {
  if (rows.length > ROSTER_LIMITS.maxImportRows) {
    return { verdicts: [], ok: 0, invalid: 0, duplicate: 0, refusal: 'too_many_rows' };
  }
  const rosterTaken = new Set(existing.flatMap(rosterKeys));
  const fileTaken = new Set<string>();
  const slugs = new Set(existing.map((guest) => guest.slug));
  const verdicts: ImportVerdict[] = rows.map((input) => {
    const check = checkRosterRow(input);
    if (!check.ok) return { status: 'invalid', reason: check.reason };
    const key = duplicateKey(check.row);
    if (rosterTaken.has(key)) return { status: 'duplicate', of: 'roster' };
    if (fileTaken.has(key)) return { status: 'duplicate', of: 'file' };
    for (const accepted of acceptedKeys(check.row)) fileTaken.add(accepted);
    return { status: 'ok', slug: claimSlug(check.row.name, slugs), row: check.row };
  });
  const count = (status: ImportVerdict['status']) => verdicts.filter((verdict) => verdict.status === status).length;
  const ok = count('ok');
  const refusal = ok === 0 ? 'nothing_to_import' : existing.length + ok > ROSTER_LIMITS.maxGuests ? 'roster_full' : null;
  return { verdicts, ok, invalid: count('invalid'), duplicate: count('duplicate'), refusal };
}

export type RegistrationVerdict =
  | { status: 'ok'; row: RosterRow }
  | { status: 'invalid'; reason: RowReason }
  /** Already a guest or already waiting: nothing is stored, and the registrant sees the same thanks (no roster probing). */
  | { status: 'duplicate' }
  /** Too many registrations wait for the host. */
  | { status: 'full' };

/** A self-registration: the roster's row rules with the registration's seat ceiling, then duplicates and the queue. */
export function decideRegistration(
  input: RosterRowInput,
  known: { guests: Array<{ name: string; phone: string | null }>; pending: Array<{ name: string; phone: string | null }> },
): RegistrationVerdict {
  const check = checkRosterRow({ ...input, category: null }, ROSTER_LIMITS.maxRegistrationSeats);
  if (!check.ok) return { status: 'invalid', reason: check.reason };
  const taken = new Set([...known.guests, ...known.pending].flatMap(rosterKeys));
  if (taken.has(duplicateKey(check.row))) return { status: 'duplicate' };
  if (known.pending.length >= ROSTER_LIMITS.maxPendingRegistrations) return { status: 'full' };
  return { status: 'ok', row: check.row };
}

/**
 * A registration link is usable while its invitation is published and not expired (the guest links' rule). Both
 * writers refuse a closed link the same way; the public page uses it to show "closed" instead of the form.
 */
export function registrationOpen(invitation: { status: string; expiresAt: Date | null }, now: Date): boolean {
  return invitation.status === 'PUBLISHED' && !(invitation.expiresAt && invitation.expiresAt < now);
}
