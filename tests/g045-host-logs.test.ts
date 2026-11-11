// G-045 (D-058): the owner's day-of logs (seating, souvenirs, gifts). The pure rules and exports in
// `lib/invitation/host-logs.ts`, the flag default, and source guards for what the database acceptance
// (`scripts/verify-host-logs.ts`, the database job) proves end to end: every entry is owner-only behind FLAG_HOST_LOGS and
// refuses administrators, and no guest page, public payload, check-in desk or Rust handler reads these rows.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const rules = () => require('../lib/invitation/host-logs') as typeof import('../lib/invitation/host-logs');
const flags = () => require('../lib/flags') as typeof import('../lib/flags');

const ROOT = process.cwd();
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const filesUnder = (dir: string, pattern: RegExp) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[]).filter((file) => pattern.test(file)).map((file) => join(dir, file).split('\\').join('/'));
const LOGS = 'app/(customer)/dashboard/invitations/[id]/logs';

test('text fields: trimmed, collapsed, control and bidirectional characters removed, measured in characters', () => {
  const { optionalText, requiredText } = rules();
  assert.deepEqual(optionalText('  Meja \t  1  ', 60), { ok: true, value: 'Meja 1' });
  assert.deepEqual(optionalText('Bu\u202eDi\u0007', 60), { ok: true, value: 'Bu Di' });
  assert.deepEqual(optionalText('   ', 60), { ok: true, value: null });
  assert.deepEqual(optionalText(null, 60), { ok: true, value: null });
  assert.deepEqual(optionalText(7, 60), { ok: false });
  assert.deepEqual(optionalText('🎁'.repeat(20), 20), { ok: true, value: '🎁'.repeat(20) }, 'an emoji is one character');
  assert.deepEqual(optionalText('a'.repeat(21), 20), { ok: false });
  assert.deepEqual(requiredText('', 60), { ok: false });
  assert.deepEqual(requiredText('VIP Keluarga', 60), { ok: true, value: 'VIP Keluarga' });
});

test('capacity: empty is not counted, otherwise a whole number from 1 to 100', () => {
  const { parseCapacity } = rules();
  assert.deepEqual(parseCapacity(''), { ok: true, value: null });
  assert.deepEqual(parseCapacity(null), { ok: true, value: null });
  assert.deepEqual(parseCapacity(' 10 '), { ok: true, value: 10 });
  assert.deepEqual(parseCapacity('100'), { ok: true, value: 100 });
  for (const bad of ['0', '101', '-1', '2.5', '1e2', 'sepuluh', '0010']) assert.deepEqual(parseCapacity(bad), { ok: false }, bad);
});

test('amounts: rupiah as a host types it, whole rupiah only, never guessed', () => {
  const { parseAmount, GIFT_AMOUNT_MAX } = rules();
  for (const [raw, value] of [
    ['1.500.000', 1_500_000],
    ['1,500,000', 1_500_000],
    ['Rp 1.500.000', 1_500_000],
    ['rp.250.000', 250_000],
    ['IDR 50000', 50_000],
    ['1500000', 1_500_000],
    ['0', 0],
  ] as const) {
    assert.deepEqual(parseAmount(raw), { ok: true, value }, raw);
  }
  assert.deepEqual(parseAmount(''), { ok: true, value: null });
  assert.deepEqual(parseAmount('Rp '), { ok: true, value: null });
  for (const bad of ['1.5', '1.50.000', '-5000', '1e6', '500rb', '12,34', '10000000000000']) assert.deepEqual(parseAmount(bad), { ok: false }, bad);
  assert.deepEqual(parseAmount(String(GIFT_AMOUNT_MAX)), { ok: true, value: GIFT_AMOUNT_MAX });
});

test('ids and request keys: positive 32-bit ids, UUID-like keys only', () => {
  const { parseId, parseRequestKey } = rules();
  assert.equal(parseId('42'), 42);
  assert.equal(parseId('2147483647'), 2_147_483_647);
  for (const bad of ['0', '-1', '2147483648', '1.5', ' 4', 'abc', '', null]) assert.equal(parseId(bad), null, String(bad));
  assert.deepEqual(parseRequestKey('5f0c3a64-8f7e-4f3d-9a51-2b6f2d8e1c90'), { ok: true, value: '5f0c3a64-8f7e-4f3d-9a51-2b6f2d8e1c90' });
  for (const bad of ['short', 'x'.repeat(65), 'key with spaces and more', '<script>alert(1)</script>', 42]) assert.deepEqual(parseRequestKey(bad), { ok: false }, String(bad));
});

test('planned tables: names cleaned and de-duplicated, capacities kept only within 1–100, at most 200', () => {
  const { planTables, MAX_TABLES } = rules();
  const config = {
    seatingPlan: {
      tables: [
        { id: 'a', name: '  Meja 1 ', capacity: 8 },
        { id: 'b', name: 'Meja 1', capacity: 4 },
        { id: 'c', name: 'VIP', capacity: 0 },
        { id: 'd', name: '', capacity: 5 },
        { id: 'e', name: 'Keluarga', capacity: 2.5 },
        { id: 'f', name: 'x'.repeat(61) },
        null,
        'Meja 9',
        { id: 'g', name: 'Teman', capacity: 100 },
      ],
    },
  };
  assert.deepEqual(planTables(config), [
    { name: 'Meja 1', capacity: 8 },
    { name: 'VIP', capacity: null },
    { name: 'Keluarga', capacity: null },
    { name: 'Teman', capacity: 100 },
  ]);
  for (const empty of [null, undefined, {}, { seatingPlan: null }, { seatingPlan: { tables: 'Meja 1' } }, 'config']) assert.deepEqual(planTables(empty), []);
  const many = { seatingPlan: { tables: Array.from({ length: 250 }, (_, i) => ({ name: `Meja ${i + 1}` })) } };
  assert.equal(planTables(many).length, MAX_TABLES);
});

test('seating summary and totals: seated counts per table, over capacity flagged, noted amounts summed', () => {
  const { tableUse, logTotals } = rules();
  const tables = [
    { id: 1, name: 'Meja 1', capacity: 2 },
    { id: 2, name: 'VIP', capacity: null },
    { id: 3, name: 'Kosong', capacity: 4 },
  ];
  const at = new Date('2026-12-12T12:00:00Z');
  const guest = (guestId: number, tableId: number | null, souvenirAt: Date | null = null) => ({ guestId, name: `Tamu ${guestId}`, category: null, tableId, seat: null, souvenirAt, checkedInAt: null });
  const rows = [guest(1, 1, at), guest(2, 1), guest(3, 1, at), guest(4, 2), guest(5, null)];
  assert.deepEqual(
    tableUse(tables, rows).map(({ id, assigned, over }) => ({ id, assigned, over })),
    [
      { id: 1, assigned: 3, over: true },
      { id: 2, assigned: 1, over: false },
      { id: 3, assigned: 0, over: false },
    ],
  );
  const gift = (id: number, amount: number | null) => ({ id, guestId: null, giverName: 'Budi', kind: 'envelope' as const, amount, note: null, receivedAt: at, side: null });
  assert.deepEqual(logTotals(rows, [gift(1, 500_000), gift(2, null), gift(3, 250_000)]), { guests: 5, seated: 4, souvenirs: 2, gifts: 3, noted: 2, amount: 750_000 });
});

test('times and money as the owner reads them: Western Indonesia Time and rupiah', () => {
  const { wib, rupiah } = rules();
  assert.equal(wib(new Date('2026-11-09T12:05:00Z')), '2026-11-09 19:05');
  assert.equal(wib(new Date('2026-11-09T17:00:00Z')), '2026-11-10 00:00');
  assert.equal(wib(null), '');
  assert.equal(rupiah(1_500_000), 'Rp 1.500.000');
  assert.equal(rupiah(null), '—');
});

test('exports: one row per guest and per gift, no phone column, formula cells neutralised (B-006)', () => {
  const { seatingCsv, giftsCsv } = rules();
  const tables = [{ id: 1, name: 'Meja 1', capacity: 8 }];
  const rows = [
    { guestId: 1, name: 'Budi Hartono', category: 'Keluarga', tableId: 1, seat: 'A1', souvenirAt: new Date('2026-12-12T12:00:00Z'), checkedInAt: new Date('2026-12-12T11:55:00Z') },
    { guestId: 2, name: '=HYPERLINK("https://evil.example","klik")', category: null, tableId: null, seat: null, souvenirAt: null, checkedInAt: null },
  ];
  const seating = seatingCsv(rows, tables).split('\n');
  assert.equal(seating[0], '"Nama","Kategori","Meja","Kursi","Suvenir","Suvenir diberikan (WIB)","Check-in (WIB)"');
  assert.equal(seating[1], '"Budi Hartono","Keluarga","Meja 1","A1","Ya","2026-12-12 19:00","2026-12-12 18:55"');
  assert.equal(seating[2], `"'=HYPERLINK(""https://evil.example"",""klik"")","","","","Belum","",""`);
  assert.equal(seating.length, 3);

  const gifts = giftsCsv([
    { id: 9, guestId: 1, giverName: 'Budi Hartono', kind: 'envelope', amount: 500_000, note: null, receivedAt: new Date('2026-12-12T12:30:00Z'), side: null },
    { id: 8, guestId: null, giverName: '+Keluarga Besar', kind: 'present', amount: null, note: '@set piring', receivedAt: new Date('2026-12-12T12:10:00Z'), side: null },
  ]).split('\n');
  assert.equal(gifts[0], '"Pemberi","Pihak","Tamu terdaftar","Jenis","Nominal (Rp)","Catatan","Dicatat (WIB)"');
  assert.equal(gifts[1], '"Budi Hartono","","Ya","Amplop","500000","","2026-12-12 19:30"');
  assert.equal(gifts[2], `"'+Keluarga Besar","","Tidak","Kado","","'@set piring","2026-12-12 19:10"`);
  assert.doesNotMatch(seating.join('\n') + gifts.join('\n'), /phone|telepon|WhatsApp/i);
});

test('the flag: off by default, on only when the owner sets it', () => {
  const { isFlagOn } = flags();
  assert.equal(isFlagOn('HOST_LOGS', {}), false);
  assert.equal(isFlagOn('HOST_LOGS', { FLAG_HOST_LOGS: 'on' }), true);
  assert.equal(isFlagOn('HOST_LOGS', { FLAG_HOST_LOGS: 'off' }), false);
  assert.match(source('.env.example'), /^# FLAG_HOST_LOGS=off$/m);
});

test('guards: the page, every action and the export are owner-only behind FLAG_HOST_LOGS and refuse administrators', () => {
  const page = source(`${LOGS}/page.tsx`);
  assert.match(page, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);\s*if \(!isFlagOn\('HOST_LOGS'\)\) notFound\(\);/);
  assert.match(page, /accessFor\(user\.id, id, 'manage'\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);

  const actions = source(`${LOGS}/actions.ts`);
  assert.match(actions, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);/);
  assert.match(actions, /isFlagOn\('HOST_LOGS'\) && invitationId !== null \? await accessFor\(user\.id, invitationId, 'manage'\) : null;/);
  const exported = [...actions.matchAll(/export async function (\w+)\(formData: FormData\) \{\n\s*const \{([^}]*)\} = await ownerOf\(formData\);/g)].map((m) => m[1]);
  const declared = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(declared.length >= 9, `found ${declared.length} actions`);
  assert.deepEqual(exported, declared, 'every action asks ownerOf before anything else');
  assert.doesNotMatch(actions, /formData\.get\('(?:tables|config|seatingPlan|ownerId|userId)'\)/, 'the planned tables and the owner come from the server');

  const route = source(`${LOGS}/export/route.ts`);
  assert.match(
    route,
    /if \(!user\) return new Response\('Unauthorized', \{ status: 401 \}\);\s*if \(user\.role === 'ADMIN'\) return new Response\('Forbidden', \{ status: 403 \}\);\s*if \(!isFlagOn\('HOST_LOGS'\)\) return new Response\('Not found', \{ status: 404 \}\);/,
  );
  assert.match(route, /accessFor\(user\.id, id, 'manage'\)/);
  assert.match(route, /'cache-control': 'private, no-store'/);

  const writer = source('lib/invitation/host-logs-db.ts');
  const writes = [...writer.matchAll(/export async function (\w+)\(\s*ownerId: number/g)].map((m) => m[1]);
  assert.ok(writes.length >= 9, `found ${writes.length} writes`);
  for (const name of writes) {
    const body = writer.slice(writer.indexOf(`export async function ${name}(`)).split(/\nexport /)[0];
    assert.match(
      body,
      /return db\.transaction\(async \(tx\) => \{\s*(?:if \(!\(await lockOwned\(tx, ownerId, invitationId\)\)|const owned = await lockOwned\(tx, ownerId, invitationId\);\s*if \(!owned\))/,
      `${name} locks and re-checks the owner's invitation first`,
    );
  }
});

test('privacy: only the owner\u2019s logs read these rows; no guest page, public payload, desk or Rust handler does', () => {
  const tables = /\b(?:seatingTables|guestLogs|giftLogs)\b|\b(?:seating_tables|guest_logs|gift_logs)\b/;
  const code = [...filesUnder('app', /\.tsx?$/), ...filesUnder('components', /\.tsx?$/), ...filesUnder('lib', /\.tsx?$/), ...filesUnder('services/api/src', /\.rs$/)];
  const readers = code.filter((file) => tables.test(source(file)));
  // B-031 (D-063): the purge's table list (`PURGED_TABLES`) and the Rust purge name these tables to empty them; neither
  // reads a row (s39 added both here).
  assert.deepEqual(readers.sort(), ['lib/db/schema.ts', 'lib/invitation/host-logs-db.ts', 'lib/invitation/retention.ts', 'services/api/src/retention.rs']);
  assert.doesNotMatch(source('lib/invitation/retention.ts'), /\.from\((?:seatingTables|guestLogs|giftLogs)\)|from (?:seating_tables|guest_logs|gift_logs)\b/);
  assert.doesNotMatch(source('services/api/src/retention.rs'), /select[^;"]*from (?:seating_tables|guest_logs|gift_logs)\b/i);

  const importers = code.filter((file) => /host-logs-db'/.test(source(file)));
  assert.deepEqual(importers.sort(), [`${LOGS}/actions.ts`, `${LOGS}/export/route.ts`, `${LOGS}/page.tsx`].sort());

  const guestFacing = ['app/i', 'app/api', 'app/daftar', 'app/preview', 'app/media', 'components/invitation'].flatMap((dir) => filesUnder(dir, /\.tsx?$/));
  assert.ok(guestFacing.length > 10, `found ${guestFacing.length} guest-facing files`);
  for (const file of guestFacing) assert.doesNotMatch(source(file), /host-logs/, `${file} must not read the owner's logs`);
});

test('guest audiences: host-only sections (the seating plan among them) never travel with a guest page\u2019s data', () => {
  const { configForAudience, HOST_ONLY_SECTIONS } = require('../lib/invitation/gift-privacy') as typeof import('../lib/invitation/gift-privacy');
  assert.deepEqual([...HOST_ONLY_SECTIONS].sort(), ['communications', 'eventPlanner', 'mealPreferences', 'seatingPlan', 'secondaryEvents', 'ticketing', 'whatsappTemplate']);
  const config = {
    schemaVersion: 2,
    settings: { title: 'Budi & Sari' },
    events: [{ id: 'akad', title: 'Akad', startAt: '2026-12-12T09:00:00+07:00' }],
    eventOperations: { timezone: 'Asia/Jakarta', staffNotes: 'pintu samping' },
    checkInSettings: { enabled: true },
    seatingPlan: { tables: [{ id: 't1', name: 'Meja Rahasia', capacity: 8, guestIds: ['1'] }] },
    mealPreferences: { enabled: true },
    eventPlanner: { coordinatorPhone: '0812-0000-0000' },
    whatsappTemplate: 'Halo {nama}',
  } as never;
  for (const audience of ['link', 'personal'] as const) {
    const shown = configForAudience(config, audience).config as Record<string, unknown>;
    for (const section of HOST_ONLY_SECTIONS) assert.equal(section in shown, false, `${audience}: ${section}`);
    assert.deepEqual(shown.checkInSettings, { enabled: true }, `${audience}: the pass still reads checkInSettings on the server`);
    assert.equal(shown.schemaVersion, 2);
    assert.deepEqual(shown.events, (config as Record<string, unknown>).events);
    assert.doesNotMatch(JSON.stringify(shown), /Meja Rahasia|0812-0000-0000|Halo \{nama\}/);
  }
  assert.equal(configForAudience(config, 'owner').config, config, 'the owner\u2019s preview is unchanged');
  const plain = { settings: { title: 'Lain' } } as never;
  assert.equal(configForAudience(plain, 'personal').config, plain, 'nothing to drop: the same object');
});

test('the manage centre opens the logs only while the flag is on; the gift form carries a fresh one-time key', () => {
  assert.match(source('app/(customer)/dashboard/invitations/[id]/manage/page.tsx'), /hostLogsOn=\{isFlagOn\('HOST_LOGS'\)\}/);
  const centre = source('app/(customer)/dashboard/invitations/[id]/manage/manage-center.tsx');
  assert.match(centre, /hostLogsOn && item\.slug === 'seating'\s*\?\s*hostLogsModule/);
  assert.match(centre, /hostLogsOn = false/);
  assert.match(source(`${LOGS}/gifts-section.tsx`), /<input type="hidden" name="requestKey" value=\{randomUUID\(\)\} \/>/);
});
