// B-033: the roster rules as shared vectors (`contracts/vectors/roster-rules.json`), run here against
// `lib/invitation/roster-rules.ts` and B-018's number parser; `services/api/tests/roster_vectors.rs` runs the same file
// against the Rust port, so both writers judge every row alike before `BACKEND_ROSTER` may select Rust. Then the import
// parser (decoding only): byte-order mark, `;` and tab delimiters, quotes, line ends, headers and one-column lists.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectDelimiter, MAX_IMPORT_TEXT, parseGuestImport } from '../lib/invitation/guest-import-parse';
import { checkRosterRow, claimSlug, decideRegistration, planImport, ROSTER_LIMITS, type RosterRowInput } from '../lib/invitation/roster-rules';
import { parseWhatsAppNumber } from '../lib/invitation/whatsapp';
import { addressKey, ipBucket, parseLimit } from '../lib/rate-limit-keys';

type Text = string | { prefix?: string; repeat: string; times: number; suffix?: string };
type Person = { name: string; phone: string | null };
type Vectors = {
  limits: Record<string, number>;
  phones: { name: string; input: string; expect: unknown }[];
  rows: { name: string; input: Record<string, unknown>; maxSeats?: number; expect: unknown }[];
  slugs: { name: string; input: Text; taken: Text[]; expect: Text }[];
  imports: {
    name: string;
    existing: (Person & { slug: string })[];
    padExisting?: number;
    rows: Record<string, unknown>[];
    padRows?: number;
    expect?: { verdicts: unknown[]; ok: number; invalid: number; duplicate: number; refusal: string | null };
    expectCounts?: { ok: number; invalid: number; duplicate: number; refusal: string | null };
  }[];
  registrations: { name: string; input: Record<string, unknown>; guests: Person[]; pending: Person[]; padPending?: number; expect: unknown }[];
  rateLimit: {
    addresses: { input: string; expect: string | null }[];
    buckets: { secret: string; scope: string; address: string; expect: string }[];
    limitStrings: { input: string; expect: { max: number; windowSeconds: number } | null }[];
  };
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/roster-rules.json'), 'utf8')) as Vectors;

function expand(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'repeat' in value && 'times' in value) {
    const text = value as Exclude<Text, string>;
    return `${text.prefix ?? ''}${text.repeat.repeat(text.times)}${text.suffix ?? ''}`;
  }
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
  return value;
}

const pad = (count = 0) => Array.from({ length: count }, (_, i) => ({ name: `Isi ${i + 1}`, phone: null, slug: `isi-${i + 1}` }));
const padRows = (count = 0) => Array.from({ length: count }, (_, i) => ({ name: `Baris ${i + 1}` }));

/** A verdict as the vectors write it: the row's stored fields are compared by the row cases, so only status and slug here. */
function shape(verdict: ReturnType<typeof planImport>['verdicts'][number]) {
  if (verdict.status === 'ok') return { status: 'ok', slug: verdict.slug };
  if (verdict.status === 'invalid') return { status: 'invalid', reason: verdict.reason };
  return { status: 'duplicate', of: verdict.of };
}

test('the constants are the ones the Rust port holds', () => {
  assert.deepEqual({ ...ROSTER_LIMITS }, vectors.limits);
});

test('phone numbers follow B-018 (the duplicate key and the refusal)', () => {
  for (const entry of vectors.phones) assert.deepEqual(parseWhatsAppNumber(entry.input), entry.expect, entry.name);
});

test('every row case', () => {
  for (const entry of vectors.rows) {
    const got = checkRosterRow(expand(entry.input) as RosterRowInput, entry.maxSeats);
    assert.deepEqual(got, expand(entry.expect), entry.name);
  }
});

test('slugs: the base, then the smallest free suffix', () => {
  for (const entry of vectors.slugs) {
    const taken = new Set((entry.taken.map(expand) as string[]));
    assert.equal(claimSlug(expand(entry.input) as string, taken), expand(entry.expect), entry.name);
    assert.ok(taken.has(expand(entry.expect) as string), `${entry.name}: the claimed slug is recorded`);
  }
});

test('whole imports: verdicts in file order, duplicates against the list and the rows above, ceilings', () => {
  for (const entry of vectors.imports) {
    const plan = planImport([...entry.existing, ...pad(entry.padExisting)], [...(entry.rows as RosterRowInput[]), ...padRows(entry.padRows)]);
    const counts = { ok: plan.ok, invalid: plan.invalid, duplicate: plan.duplicate, refusal: plan.refusal };
    if (entry.expect) {
      assert.deepEqual(plan.verdicts.map(shape), entry.expect.verdicts, entry.name);
      assert.deepEqual(counts, { ok: entry.expect.ok, invalid: entry.expect.invalid, duplicate: entry.expect.duplicate, refusal: entry.expect.refusal }, entry.name);
    }
    if (entry.expectCounts) assert.deepEqual(counts, entry.expectCounts, entry.name);
  }
});

test('self-registrations: the rules with five seats, then duplicates, then the queue', () => {
  for (const entry of vectors.registrations) {
    const got = decideRegistration(entry.input as RosterRowInput, { guests: entry.guests, pending: [...entry.pending, ...pad(entry.padPending)] });
    assert.deepEqual(got, entry.expect, entry.name);
  }
});

test('rate limits: address keys, keyed buckets and limit strings are the API limiter\'s (B-013, D-043)', () => {
  for (const entry of vectors.rateLimit.addresses) assert.equal(addressKey(entry.input), entry.expect, JSON.stringify(entry.input));
  for (const entry of vectors.rateLimit.buckets) assert.equal(ipBucket(entry.secret, entry.scope, entry.address), entry.expect);
  const fallback = { max: -1, windowSeconds: -1 };
  for (const entry of vectors.rateLimit.limitStrings) {
    assert.deepEqual(parseLimit(entry.input, fallback), entry.expect ?? fallback, JSON.stringify(entry.input));
  }
});

test('parser: a byte-order mark and a ; delimiter (Excel with Indonesian settings)', () => {
  const parsed = parseGuestImport('\ufeffNama;No. WA;Kategori;Jumlah\r\nBudi Santoso;0812-3456-7890;Keluarga;2\r\nSari;;;\r\n');
  assert.ok(parsed.ok);
  assert.equal(parsed.delimiter, ';');
  assert.equal(parsed.header, true);
  assert.deepEqual(parsed.rows, [
    { line: 2, name: 'Budi Santoso', phone: '0812-3456-7890', category: 'Keluarga', guestCount: '2' },
    { line: 3, name: 'Sari', phone: '', category: '', guestCount: '' },
  ]);
});

test('parser: a paste from a spreadsheet is tab-separated, commas stay inside cells', () => {
  const parsed = parseGuestImport('Nama\tWhatsApp\nSari Dewi, S.E.\t+62 812 0000 1111\n');
  assert.ok(parsed.ok);
  assert.equal(parsed.delimiter, '\t');
  assert.deepEqual(parsed.rows.map((row) => [row.name, row.phone]), [['Sari Dewi, S.E.', '+62 812 0000 1111']]);
});

test('parser: a one-column list of names keeps titles whole', () => {
  const parsed = parseGuestImport('Sari Dewi, S.E., M.M.\nDr. Budi Santoso, S.H.\n');
  // The first line has commas, so the list reads as comma-separated: the host is told the name lost its titles in
  // the preview, never silently. A header line without a delimiter makes it one column.
  assert.ok(parsed.ok);
  assert.equal(parsed.delimiter, ',');
  const single = parseGuestImport('Nama\nSari Dewi, S.E., M.M.\nDr. Budi Santoso, S.H.\n');
  assert.ok(single.ok);
  assert.equal(single.delimiter, null);
  assert.deepEqual(single.rows.map((row) => row.name), ['Sari Dewi, S.E., M.M.', 'Dr. Budi Santoso, S.H.']);
});

test('parser: RFC 4180 quotes, doubled quotes, a quoted delimiter and a quoted line break', () => {
  const parsed = parseGuestImport('name,phone,category\n"Santoso, Budi","0812-3456-7890","Kel ""Besar"""\n"Rina\nKartika",,Teman\nJoko,0813,\n');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows, [
    { line: 2, name: 'Santoso, Budi', phone: '0812-3456-7890', category: 'Kel "Besar"', guestCount: '' },
    { line: 3, name: 'Rina\nKartika', phone: '', category: 'Teman', guestCount: '' },
    { line: 5, name: 'Joko', phone: '0813', category: '', guestCount: '' },
  ]);
  assert.equal(checkRosterRow(parsed.rows[1]).ok && (checkRosterRow(parsed.rows[1]) as { row: { name: string } }).row.name, 'Rina Kartika');
});

test('parser: CR-only line ends, blank lines skipped, no header means positional columns', () => {
  const parsed = parseGuestImport('Budi,0812-3456-7890,Kantor,3\r\r\nSari,,,\r');
  assert.ok(parsed.ok);
  assert.equal(parsed.header, false);
  assert.deepEqual(parsed.rows.map((row) => [row.line, row.name, row.guestCount]), [[1, 'Budi', '3'], [3, 'Sari', '']]);
});

test('parser: header aliases in any order, unknown columns ignored', () => {
  const parsed = parseGuestImport('Grup,Catatan,Nomor HP,Nama Tamu,Pax\nTeman,vegetarian,0813-1111-2222,Rina,2\n');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows[0], { line: 2, name: 'Rina', phone: '0813-1111-2222', category: 'Teman', guestCount: '2' });
});

test('parser: refusals', () => {
  assert.deepEqual(parseGuestImport(''), { ok: false, error: 'empty' });
  assert.deepEqual(parseGuestImport('\n \n'), { ok: false, error: 'empty' });
  assert.deepEqual(parseGuestImport('Nama\n'), { ok: false, error: 'empty' });
  assert.deepEqual(parseGuestImport('WhatsApp,Kategori\n0812,Teman\n'), { ok: false, error: 'no_name_column' });
  assert.deepEqual(parseGuestImport('"Budi,0812\n'), { ok: false, error: 'unterminated_quote' });
  assert.deepEqual(parseGuestImport('x'.repeat(MAX_IMPORT_TEXT + 1)), { ok: false, error: 'too_large' });
  const many = ['Nama', ...Array.from({ length: 1001 }, (_, i) => `Tamu ${i}`)].join('\n');
  assert.deepEqual(parseGuestImport(many), { ok: false, error: 'too_many_rows', rowCount: 1001 });
});

test('parser and rules together: 08, 62 and +62 spellings of one number are one guest', () => {
  const parsed = parseGuestImport('Nama;WA\nBudi;0812-3456-7890\nBudi Santoso;6281234567890\nBudi S;+62 812 3456 7890\n');
  assert.ok(parsed.ok);
  const plan = planImport([], parsed.rows);
  assert.deepEqual(plan.verdicts.map((verdict) => verdict.status), ['ok', 'duplicate', 'duplicate']);
});

test('delimiter detection counts the first non-blank line only, outside quotes', () => {
  assert.equal(detectDelimiter('\n\na;b;c\nx,y,z,w,v'), ';');
  assert.equal(detectDelimiter('"a,b";c'), ';');
  assert.equal(detectDelimiter('a\tb,c'), '\t');
  assert.equal(detectDelimiter('Budi Santoso'), null);
});
