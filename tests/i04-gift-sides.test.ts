// I-04 (D-059): a gift's family side on a wedding, extending G-045's private gift log. The pure rules in
// `lib/invitation/host-logs.ts` and source guards for what `scripts/verify-host-logs.ts` proves end to end: the writer
// refuses a side on any other event type, a resend with another side is a reused key, a form without the field keeps the
// stored side, and the side reaches the owner's view and export only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const rules = () => require('../lib/invitation/host-logs') as typeof import('../lib/invitation/host-logs');
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const LOGS = 'app/(customer)/dashboard/invitations/[id]/logs';

test('sides: two families on a wedding only; empty is unattributed, anything else invalid', () => {
  const { FAMILY_SIDES, familySidesApply, parseFamilySide } = rules();
  assert.deepEqual([...FAMILY_SIDES], ['bride', 'groom']);
  assert.equal(familySidesApply('wedding'), true);
  for (const other of ['birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate', '']) assert.equal(familySidesApply(other), false, other);
  assert.deepEqual(parseFamilySide('bride'), { ok: true, value: 'bride' });
  assert.deepEqual(parseFamilySide('groom'), { ok: true, value: 'groom' });
  for (const empty of ['', null, undefined]) assert.deepEqual(parseFamilySide(empty), { ok: true, value: null });
  for (const bad of ['Bride', 'both', 'wanita', ' groom', 1, {}]) assert.deepEqual(parseFamilySide(bad), { ok: false }, String(bad));
});

test('labels name each family after the couple, in the couple\u2019s own order', () => {
  const { sideLabels, sideOrder } = rules();
  const config = { couple: { bride: { fullName: 'Sari Wulandari', nickName: 'Sari' }, groom: { fullName: 'Budi Hartono' }, displayOrder: 'groom-first' } };
  assert.deepEqual(sideLabels(config), { bride: 'Keluarga Sari (mempelai wanita)', groom: 'Keluarga Budi Hartono (mempelai pria)' });
  assert.deepEqual(sideOrder(config), ['groom', 'bride']);
  assert.deepEqual(sideOrder({ couple: { displayOrder: 'bride-first' } }), ['bride', 'groom']);
  assert.deepEqual(sideOrder(null), ['bride', 'groom']);
  assert.deepEqual(sideLabels(null), { bride: 'Keluarga mempelai wanita', groom: 'Keluarga mempelai pria' });
  assert.deepEqual(sideLabels({ couple: { bride: { nickName: '  ' }, groom: { nickName: 'Bu\u202eDi' } } }), { bride: 'Keluarga mempelai wanita', groom: 'Keluarga Bu Di (mempelai pria)' });
});

test('totals per family, then the unattributed entries (every entry recorded before I-04)', () => {
  const { sideTotals } = rules();
  const gifts = [
    { side: 'bride' as const, amount: 500_000 },
    { side: 'bride' as const, amount: null },
    { side: 'groom' as const, amount: 1_000_000 },
    { side: null, amount: 250_000 },
    { side: null, amount: null },
  ];
  assert.deepEqual(sideTotals(gifts, ['groom', 'bride']), [
    { side: 'groom', gifts: 1, noted: 1, amount: 1_000_000 },
    { side: 'bride', gifts: 2, noted: 1, amount: 500_000 },
    { side: null, gifts: 2, noted: 1, amount: 250_000 },
  ]);
  assert.deepEqual(sideTotals([], ['bride', 'groom']).map((t) => t.gifts), [0, 0, 0]);
});

test('the gift export names the family, empty when unattributed', () => {
  const { giftsCsv, sideLabels } = rules();
  const at = new Date('2026-12-12T12:30:00Z');
  const labels = sideLabels({ couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } } });
  const lines = giftsCsv(
    [
      { id: 2, guestId: null, giverName: 'Keluarga Pak RT', kind: 'envelope', amount: 300_000, note: null, receivedAt: at, side: 'groom' },
      { id: 1, guestId: 5, giverName: 'Dewi', kind: 'transfer', amount: null, note: null, receivedAt: at, side: null },
    ],
    labels,
  ).split('\n');
  assert.equal(lines[0].split(',')[1], '"Pihak"');
  assert.equal(lines[1], '"Keluarga Pak RT","Keluarga Budi (mempelai pria)","Tidak","Amplop","300000","","2026-12-12 19:30"');
  assert.equal(lines[2], '"Dewi","","Ya","Transfer","","","2026-12-12 19:30"');
});

test('the writer: a side only on a wedding, part of the replay comparison, kept when a form omits it', () => {
  const writer = source('lib/invitation/host-logs-db.ts');
  const record = writer.slice(writer.indexOf('export async function recordGift(')).split(/\nexport /)[0];
  assert.match(record, /if \(input\.side !== null && !familySidesApply\(owned\.eventType\)\) return \{ kind: 'side' \};/);
  assert.match(record, /const content = \{ guestId: input\.guestId, giverName, kind: input\.kind, amount: input\.amount, note: input\.note, side: input\.side \};/);
  assert.match(record, /side: giftLogs\.familySide \}\)/, 'the stored side is read back for the comparison, in the same key order');
  const update = writer.slice(writer.indexOf('export async function updateGift(')).split(/\nexport /)[0];
  assert.match(update, /if \(side !== undefined && side !== null && !familySidesApply\(owned\.eventType\)\) return 'side';/);
  assert.match(update, /\.\.\.\(side === undefined \? \{\} : \{ familySide: side \}\)/);

  const actions = source(`${LOGS}/actions.ts`);
  assert.match(actions, /const side = parseFamilySide\(formData\.get\('side'\)\);/, 'recording: no field is unattributed');
  assert.match(actions, /const side = rawSide === null \? \{ ok: true as const, value: undefined \} : parseFamilySide\(rawSide\);/, 'correcting: no field keeps the side');
  assert.match(source(`${LOGS}/page.tsx`), /'gift-side': 'Pihak keluarga hanya bisa dipilih pada undangan pernikahan\.'/);
  assert.match(source(`${LOGS}/export/route.ts`), /giftsCsv\(logs\.gifts, sideLabels\(access\.invitation\.config\)\)/);
});

test('the view: the side choice only on a wedding; the migration is additive with its check', () => {
  const section = source(`${LOGS}/gifts-section.tsx`);
  assert.match(section, /\{sides\.applies && <SideSelect sides=\{sides\} defaultValue=\{null\} \/>\}/);
  assert.match(section, /\{sides\.applies && <SideSelect sides=\{sides\} defaultValue=\{gift\.side\} compact \/>\}/);
  assert.match(source(`${LOGS}/page.tsx`), /applies: familySidesApply\(access\.invitation\.eventType\)/);
  const migration = source('lib/db/migrations/0025_gift_family_side.sql');
  assert.match(migration, /^ALTER TABLE "gift_logs" ADD COLUMN "family_side" varchar\(8\);/);
  assert.match(migration, /CHECK \("gift_logs"\."family_side" is null or "gift_logs"\."family_side" in \('bride', 'groom'\)\)/);
  assert.doesNotMatch(migration, /DROP|NOT NULL|UPDATE/i, 'additive: old entries stay unattributed');
});
