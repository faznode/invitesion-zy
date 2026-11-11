import { ROSTER_LIMITS } from './roster-rules';

/**
 * B-033: reads a guest list pasted from a spreadsheet or saved as CSV into raw rows. Decoding only: the roster's rules
 * (`roster-rules.ts`, run by the live writer) judge every value afterwards. Client-safe and pure.
 *
 * - A leading byte-order mark is dropped (Excel's "CSV UTF-8").
 * - The delimiter is read from the first non-blank line: a tab (a paste from Excel or Google Sheets), `;` (Excel with
 *   Indonesian regional settings) or `,`. A first line with none of them makes a one-column list, so a name written
 *   with its titles ("Sari Dewi, S.E.") is never split on its comma.
 * - Quotes follow RFC 4180 (`""` inside a quoted field is one quote; a quoted field may hold the delimiter or a line
 *   break); CRLF, LF and CR all end a record; blank records are skipped.
 * - A first record naming a name column (Indonesian or English) is a header that maps the columns; without one the
 *   columns are name, WhatsApp, category, seats in that order.
 */

export type ImportDelimiter = ',' | ';' | '\t' | null;
export type ImportColumn = 'name' | 'phone' | 'category' | 'guestCount';

export type ParsedImportRow = {
  /** The physical line the record starts on, counting the header. */
  line: number;
  name: string;
  phone: string;
  category: string;
  guestCount: string;
};

export type ImportParseError = 'empty' | 'too_large' | 'unterminated_quote' | 'no_name_column' | 'too_many_rows';

export type ParsedImport =
  | { ok: true; delimiter: ImportDelimiter; header: boolean; rows: ParsedImportRow[] }
  | { ok: false; error: ImportParseError; rowCount?: number };

/** Characters accepted in one import, far above 1,000 rows of name, number, category and seats. */
export const MAX_IMPORT_TEXT = 512 * 1024;

const ALIASES: Record<ImportColumn, readonly string[]> = {
  name: ['nama', 'name', 'nama tamu', 'nama lengkap', 'tamu', 'guest', 'guest name', 'full name'],
  phone: [
    'whatsapp', 'wa', 'no wa', 'nomor wa', 'no whatsapp', 'nomor whatsapp', 'phone', 'phone number', 'mobile', 'telepon',
    'telp', 'no telp', 'no telepon', 'nomor telepon', 'hp', 'no hp', 'nomor hp', 'handphone', 'nomor',
  ],
  category: ['kategori', 'category', 'tag', 'grup', 'group', 'kelompok', 'label'],
  guestCount: ['jumlah', 'jumlah tamu', 'jumlah orang', 'orang', 'pax', 'kursi', 'seats', 'guests', 'guest count'],
};

const POSITIONAL: Record<ImportColumn, number> = { name: 0, phone: 1, category: 2, guestCount: 3 };

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[._\-/:#()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function columnOf(cell: string): ImportColumn | null {
  const key = headerKey(cell);
  for (const column of Object.keys(ALIASES) as ImportColumn[]) if (ALIASES[column].includes(key)) return column;
  return null;
}

/** The delimiter of the first non-blank line, counted outside quotes. */
export function detectDelimiter(text: string): ImportDelimiter {
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let quoted = false;
  let seen = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (seen) break;
    } else if (!quoted && c in counts) {
      counts[c as keyof typeof counts]++;
      seen = true;
    } else if (!quoted && c.trim()) seen = true;
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[';'] && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > 0 && counts[';'] >= counts[',']) return ';';
  if (counts[','] > 0) return ',';
  return null;
}

type RawRecord = { line: number; cells: string[] };

function readRecords(text: string, delimiter: ImportDelimiter): RawRecord[] | null {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStart = true;
  let line = 1;
  let recordLine = 1;
  const endRecord = () => {
    cells.push(cell);
    records.push({ line: recordLine, cells });
    cells = [];
    cell = '';
    cellStart = true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
        continue;
      }
      if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
      cell += c;
      continue;
    }
    if (c === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (delimiter !== null && c === delimiter) {
      cells.push(cell);
      cell = '';
      cellStart = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += c;
      cellStart = false;
    }
  }
  if (quoted) return null;
  if (cell !== '' || cells.length > 0) endRecord();
  return records;
}

export function parseGuestImport(input: string, maxRows: number = ROSTER_LIMITS.maxImportRows): ParsedImport {
  if (input.length > MAX_IMPORT_TEXT) return { ok: false, error: 'too_large' };
  const text = input.replace(/^\ufeff/, '');
  const delimiter = detectDelimiter(text);
  const records = readRecords(text, delimiter);
  if (!records) return { ok: false, error: 'unterminated_quote' };
  const filled = records.filter((record) => record.cells.some((cell) => cell.trim() !== ''));
  if (filled.length === 0) return { ok: false, error: 'empty' };

  const first = filled[0].cells.map(columnOf);
  const header = first.some((column) => column !== null);
  if (header && !first.includes('name')) return { ok: false, error: 'no_name_column' };
  const index = header
    ? (Object.fromEntries((Object.keys(POSITIONAL) as ImportColumn[]).map((column) => [column, first.indexOf(column)])) as Record<ImportColumn, number>)
    : POSITIONAL;

  const data = header ? filled.slice(1) : filled;
  if (data.length === 0) return { ok: false, error: 'empty' };
  if (data.length > maxRows) return { ok: false, error: 'too_many_rows', rowCount: data.length };
  const at = (cells: string[], column: ImportColumn) => (index[column] >= 0 ? (cells[index[column]] ?? '') : '');
  return {
    ok: true,
    delimiter,
    header,
    rows: data.map(({ line, cells }) => ({
      line,
      name: at(cells, 'name'),
      phone: at(cells, 'phone'),
      category: at(cells, 'category'),
      guestCount: at(cells, 'guestCount'),
    })),
  };
}
