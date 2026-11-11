/**
 * G-045 (D-058): the owner's day-of logs (seating, souvenirs, gifts): input rules, the seating summary and the CSV
 * exports; I-04 (D-059): a gift's family side on a wedding. Pure and safe in the browser: no I/O, no env. The only writer is
 * `host-logs-db.ts`; access is the owner's alone (`manage` in `members.ts`), and no guest page, public payload or check-in
 * desk reads these rows.
 */
import { csvRow } from '@/lib/csv';

export const TABLE_NAME_MAX = 60;
export const TABLE_CAPACITY_MAX = 100;
export const SEAT_MAX = 20;
export const GIVER_MAX = 150;
export const GIFT_NOTE_MAX = 300;
export const GIFT_AMOUNT_MAX = 1_000_000_000_000;
/** Technical ceilings until plan limits exist, as the roster's (D-052). */
export const MAX_TABLES = 200;
export const MAX_GIFTS = 5_000;

export const GIFT_KINDS = ['envelope', 'present', 'transfer', 'other'] as const;
export type GiftKind = (typeof GIFT_KINDS)[number];
export const GIFT_KIND_LABEL: Record<GiftKind, string> = { envelope: 'Amplop', present: 'Kado', transfer: 'Transfer', other: 'Lainnya' };

export function isGiftKind(value: unknown): value is GiftKind {
  return typeof value === 'string' && (GIFT_KINDS as readonly string[]).includes(value);
}

/**
 * I-04 (D-059): the family a gift is attributed to. Only a wedding has two families; every other event type keeps its gifts
 * unattributed. Null is "not attributed", which every entry recorded before I-04 is.
 */
export const FAMILY_SIDES = ['bride', 'groom'] as const;
export type FamilySide = (typeof FAMILY_SIDES)[number];

export function familySidesApply(eventType: string): boolean {
  return eventType === 'wedding';
}

/** A side from a form: empty is "not attributed" (null); anything but `bride` or `groom` is invalid. */
export function parseFamilySide(raw: unknown): Parsed<FamilySide | null> {
  if (raw === '' || raw === null || raw === undefined) return { ok: true, value: null };
  return raw === 'bride' || raw === 'groom' ? { ok: true, value: raw } : { ok: false };
}

function coupleName(config: unknown, side: FamilySide): string | null {
  const couple = config && typeof config === 'object' ? (config as Record<string, unknown>).couple : undefined;
  const person = couple && typeof couple === 'object' ? (couple as Record<string, unknown>)[side] : undefined;
  if (!person || typeof person !== 'object') return null;
  for (const key of ['nickName', 'fullName']) {
    const name = optionalText((person as Record<string, unknown>)[key], 60);
    if (name.ok && name.value) return name.value;
  }
  return null;
}

/** "Keluarga Sari (mempelai wanita)", or the role alone when the couple's names are not filled in. */
export function sideLabels(config: unknown): Record<FamilySide, string> {
  const bride = coupleName(config, 'bride');
  const groom = coupleName(config, 'groom');
  return {
    bride: bride ? `Keluarga ${bride} (mempelai wanita)` : 'Keluarga mempelai wanita',
    groom: groom ? `Keluarga ${groom} (mempelai pria)` : 'Keluarga mempelai pria',
  };
}

/** The couple's own order (`couple.displayOrder`), as the guest page and the headline use it: the bride first unless set. */
export function sideOrder(config: unknown): FamilySide[] {
  const couple = config && typeof config === 'object' ? (config as Record<string, unknown>).couple : undefined;
  const order = couple && typeof couple === 'object' ? (couple as Record<string, unknown>).displayOrder : undefined;
  return order === 'groom-first' ? ['groom', 'bride'] : ['bride', 'groom'];
}

export type SideTotal = { side: FamilySide | null; gifts: number; noted: number; amount: number };

/** Entries and noted amounts per side in the couple's order, then the unattributed ones. */
export function sideTotals(gifts: readonly { side: FamilySide | null; amount: number | null }[], order: readonly FamilySide[]): SideTotal[] {
  return [...order, null].map((side) => {
    const mine = gifts.filter((gift) => gift.side === side);
    const noted = mine.filter((gift) => gift.amount !== null);
    return { side, gifts: mine.length, noted: noted.length, amount: noted.reduce((sum, gift) => sum + (gift.amount ?? 0), 0) };
  });
}

export type Parsed<T> = { ok: true; value: T } | { ok: false };

// Control characters and bidirectional overrides would let a stored name reorder or hide text in the page and the CSV.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** Trimmed, inner whitespace collapsed, unsafe characters removed. Empty is null; longer than `max` is invalid. */
export function optionalText(raw: unknown, max: number): Parsed<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: true, value: null };
  return [...text].length <= max ? { ok: true, value: text } : { ok: false };
}

/** Like `optionalText`, but a value is required. */
export function requiredText(raw: unknown, max: number): Parsed<string> {
  const parsed = optionalText(raw, max);
  return parsed.ok && parsed.value !== null ? { ok: true, value: parsed.value } : { ok: false };
}

/** Seats at a table: empty is "not counted" (null), otherwise a whole number from 1 to 100. */
export function parseCapacity(raw: unknown): Parsed<number | null> {
  const text = typeof raw === 'string' ? raw.trim() : raw === null || raw === undefined ? '' : null;
  if (text === null) return { ok: false };
  if (!text) return { ok: true, value: null };
  if (!/^\d{1,3}$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= 1 && value <= TABLE_CAPACITY_MAX ? { ok: true, value } : { ok: false };
}

/**
 * Rupiah as a host types it: "1.500.000", "1,500,000", "Rp 1.500.000" or "1500000". Empty is "not noted" (null). Whole
 * rupiah only; anything else is invalid rather than guessed.
 */
export function parseAmount(raw: unknown): Parsed<number | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.trim().replace(/^(rp\.?|idr)\s*/i, '');
  if (!text) return { ok: true, value: null };
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) return { ok: false };
  const digits = text.replace(/[.,]/g, '');
  if (digits.length > 13) return { ok: false };
  const value = Number(digits);
  return value <= GIFT_AMOUNT_MAX ? { ok: true, value } : { ok: false };
}

/** The gift form's one-time key (a UUID from the page). */
export function parseRequestKey(raw: unknown): Parsed<string> {
  return typeof raw === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(raw) ? { ok: true, value: raw } : { ok: false };
}

/** A positive integer id from a form field, or null. */
export function parseId(raw: unknown): number | null {
  const value = typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : null;
}

/**
 * The tables an owner already planned in the manage centre (`config.seatingPlan.tables`, config only before G-045: names
 * and capacities, never any guest), as rows the log can take: names cleaned and de-duplicated, capacities kept when they
 * fit 1–100.
 */
export function planTables(config: unknown): { name: string; capacity: number | null }[] {
  const plan = config && typeof config === 'object' ? (config as Record<string, unknown>).seatingPlan : undefined;
  const tables = plan && typeof plan === 'object' ? (plan as Record<string, unknown>).tables : undefined;
  if (!Array.isArray(tables)) return [];
  const seen = new Set<string>();
  const out: { name: string; capacity: number | null }[] = [];
  for (const table of tables) {
    if (!table || typeof table !== 'object') continue;
    const name = requiredText((table as Record<string, unknown>).name, TABLE_NAME_MAX);
    if (!name.ok || seen.has(name.value)) continue;
    seen.add(name.value);
    const capacity = (table as Record<string, unknown>).capacity;
    out.push({ name: name.value, capacity: Number.isInteger(capacity) && (capacity as number) >= 1 && (capacity as number) <= TABLE_CAPACITY_MAX ? (capacity as number) : null });
  }
  return out.slice(0, MAX_TABLES);
}

export type SeatingTable = { id: number; name: string; capacity: number | null };
export type GuestLogRow = { guestId: number; name: string; category: string | null; tableId: number | null; seat: string | null; souvenirAt: Date | null; checkedInAt: Date | null };
export type GiftLogRow = { id: number; guestId: number | null; giverName: string; kind: GiftKind; amount: number | null; note: string | null; receivedAt: Date; side: FamilySide | null };

export type TableUse = SeatingTable & { assigned: number; over: boolean };

/** Each table with the guests seated at it, and whether that is more than its capacity. */
export function tableUse(tables: readonly SeatingTable[], rows: readonly GuestLogRow[]): TableUse[] {
  const counts = new Map<number, number>();
  for (const row of rows) if (row.tableId !== null) counts.set(row.tableId, (counts.get(row.tableId) ?? 0) + 1);
  return tables.map((table) => {
    const assigned = counts.get(table.id) ?? 0;
    return { ...table, assigned, over: table.capacity !== null && assigned > table.capacity };
  });
}

export type LogTotals = { guests: number; seated: number; souvenirs: number; gifts: number; noted: number; amount: number };

export function logTotals(rows: readonly GuestLogRow[], gifts: readonly GiftLogRow[]): LogTotals {
  const noted = gifts.filter((gift) => gift.amount !== null);
  return {
    guests: rows.length,
    seated: rows.filter((row) => row.tableId !== null).length,
    souvenirs: rows.filter((row) => row.souvenirAt !== null).length,
    gifts: gifts.length,
    noted: noted.length,
    amount: noted.reduce((sum, gift) => sum + (gift.amount ?? 0), 0),
  };
}

/** Western Indonesia Time, the product's default zone, as "2026-11-09 19:05". */
export function wib(at: Date | null): string {
  if (!at) return '';
  const local = new Date(at.getTime() + 7 * 3_600_000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

/** The seating and souvenir export: one row per guest, cells neutralised for spreadsheets (B-006). */
export function seatingCsv(rows: readonly GuestLogRow[], tables: readonly SeatingTable[]): string {
  const names = new Map(tables.map((table) => [table.id, table.name]));
  const lines = [csvRow(['Nama', 'Kategori', 'Meja', 'Kursi', 'Suvenir', 'Suvenir diberikan (WIB)', 'Check-in (WIB)'])];
  for (const row of rows) {
    lines.push(csvRow([row.name, row.category ?? '', row.tableId === null ? '' : (names.get(row.tableId) ?? ''), row.seat ?? '', row.souvenirAt ? 'Ya' : 'Belum', wib(row.souvenirAt), wib(row.checkedInAt)]));
  }
  return lines.join('\n');
}

/**
 * The gift log export, newest first as stored; cells neutralised for spreadsheets (B-006). `Pihak` (I-04) is the family the
 * entry is attributed to, empty when it is not.
 */
export function giftsCsv(gifts: readonly GiftLogRow[], labels: Record<FamilySide, string> = sideLabels(null)): string {
  const lines = [csvRow(['Pemberi', 'Pihak', 'Tamu terdaftar', 'Jenis', 'Nominal (Rp)', 'Catatan', 'Dicatat (WIB)'])];
  for (const gift of gifts) {
    lines.push(
      csvRow([gift.giverName, gift.side ? labels[gift.side] : '', gift.guestId === null ? 'Tidak' : 'Ya', GIFT_KIND_LABEL[gift.kind], gift.amount ?? '', gift.note ?? '', wib(gift.receivedAt)]),
    );
  }
  return lines.join('\n');
}

/** "Rp 1.500.000", or an em dash when no amount was noted. */
export function rupiah(amount: number | null): string {
  return amount === null ? '—' : `Rp ${amount.toLocaleString('id-ID')}`;
}
