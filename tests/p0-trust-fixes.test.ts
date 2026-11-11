// Regression tests for the masterplan's sprint-1 P0 items (invitation-research/09-masterplan/06-backlog.md, B-001 … B-007).
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { getMarketingCopy } from '../app/marketing-copy';
import { csvCell, csvRow } from '../lib/csv';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { formatEventDate, formatEventTime } from '../lib/invitation/event-time';
import { guestPath, invitationPath, ownerPreviewPath } from '../lib/invitation/public-path';
import { corpusSchema, findUnverifiedReligiousText, isVerifiedReligiousText, loadCorpus, looksReligious } from '../lib/invitation/religious-text';
import { isRsvpStatus, rsvpAttendance, rsvpDefaultCount } from '../lib/invitation/rsvp-rules';
import { catalogDefaultConfig, presetConfigFromTemplateDefaults } from '../lib/invitation/template-defaults';
import { invitationTemplates } from '../lib/invitation/templates';
import { formatMoney } from '../lib/payment/money';
import { currencyForLocale, priceFor, tierPriceLabel } from '../lib/pricing';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

// `pnpm test` runs from the repository root (package type is CommonJS, so no import.meta).
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

// ── B-001: catalog presets survive the template-owned `art` key ───────────────

test('B-001: the strict invitation schema still rejects template art (the reason for the fix)', () => {
  const stored = catalogDefaultConfig(invitationTemplates[0]);
  assert.ok('art' in stored);
  assert.equal(detailConfigSchema.safeParse(stored).success, false);
});

test('B-001: every catalog template yields its full preset for a new invitation', () => {
  assert.ok(invitationTemplates.length >= 64, `registry has ${invitationTemplates.length} templates`);
  for (const template of invitationTemplates) {
    const result = presetConfigFromTemplateDefaults(catalogDefaultConfig(template));
    assert.ok(result.ok, `${template.slug}: ${result.ok ? '' : result.issues.join('; ')}`);
    assert.deepEqual(result.droppedKeys, ['art'], template.slug);
    assert.deepEqual(result.config, detailConfigSchema.parse(template.preset), `${template.slug} lost preset keys`);
    assert.ok(Object.keys(result.config).length > 0, `${template.slug} produced an empty config`);
  }
});

test('B-001: unknown non-template keys still fail validation; missing defaults give an empty config', () => {
  const stored = { ...catalogDefaultConfig(invitationTemplates[0]), notAConfigKey: true };
  const result = presetConfigFromTemplateDefaults(stored);
  assert.equal(result.ok, false);
  assert.deepEqual(presetConfigFromTemplateDefaults(null), { ok: true, config: {}, droppedKeys: [] });
  assert.equal(presetConfigFromTemplateDefaults(['x']).ok, false);
});

test('B-001: createInvitation and the catalog sync use the shared helpers', () => {
  // B-037 (D-055): creation's preset step lives in `initialDraftConfig`, which every creation reaches through the facade.
  const trial = source('lib/invitation/trial.ts');
  assert.match(trial, /const preset = presetConfigFromTemplateDefaults\(defaultConfig\);/);
  assert.match(source('lib/invitation/creation.ts'), /initialDraftConfig\(input\.template\?\.defaultConfig \?\? null,/);
  for (const path of ['lib/invitation/trial.ts', 'lib/invitation/creation.ts', 'lib/invitation/create.ts', 'lib/invitation/create-next.ts']) {
    assert.doesNotMatch(source(path), /detailConfigSchema\.safeParse\((?:template\.)?defaultConfig/, `${path}: raw defaults never meet the strict schema`);
  }
  assert.match(source('lib/invitation/template-sync.ts'), /defaultConfig: catalogDefaultConfig\(tpl\)/);
});

// ── B-002: marketing prices come from lib/pricing.ts; no free plan is claimed ──

test('B-002: tier prices in the copy equal what checkout charges for the locale', () => {
  for (const locale of ['id', 'en'] as const) {
    const copy = getMarketingCopy(locale);
    const currency = currencyForLocale(locale);
    assert.equal(copy.tierStandardPrice, formatMoney(priceFor('standard', currency), locale));
    assert.equal(copy.tierPremiumPrice, formatMoney(priceFor('premium', currency), locale));
    assert.equal(copy.tierStandardPrice, tierPriceLabel('standard', locale));
  }
  assert.match(getMarketingCopy('en').tierStandardPrice, /^\$/, 'English visitors are charged in USD');
});

test('B-002: no page claims a free plan or carries a price literal', () => {
  for (const locale of ['id', 'en'] as const) {
    const copy = getMarketingCopy(locale);
    const text = JSON.stringify(copy);
    assert.doesNotMatch(text, /Rp\s?0\b/);
    assert.ok(!['GRATIS', 'FREE'].includes(copy.pricingBadge), `badge ${copy.pricingBadge}`);
    assert.doesNotMatch(text, /All free features|Semua fitur gratis/);
  }
  for (const path of ['app/page.tsx', 'app/pricing/page.tsx', 'app/marketing-copy.ts', 'app/layout.tsx']) {
    const file = source(path);
    assert.doesNotMatch(file, /Rp\s?0\b/, `${path} shows Rp0`);
    assert.doesNotMatch(file, /(Rp|IDR)\s?\d{2,3}[.,]\d{3}/, `${path} hard-codes a price`);
  }
});

// ── B-003: no unverified religious text in presets ──────────────────────────────

test('B-003: the verified corpus validates and starts empty', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.entries.length, 0);
  assert.equal(isVerifiedReligiousText('any text', corpus), false);
});

test('B-003: corpus schema refuses incomplete provenance, duplicates and unapproved use', () => {
  const entry = {
    id: 'sample-entry', tradition: 'example', kind: 'verse', language: 'id', text: 'Teks contoh, bukan kitab suci.',
    citation: 'Contoh 1:1', source: 'Contoh Penerbit, 2026', licence: 'written permission', verifiedBy: 'Reviewer A',
    verifiedAt: '2026-11-03', approvedBy: 'Owner', status: 'approved' as const,
  };
  const corpus = corpusSchema.parse({ schemaVersion: 1, entries: [entry] });
  assert.equal(isVerifiedReligiousText(entry.text, corpus), true);
  assert.equal(isVerifiedReligiousText(entry.text, corpusSchema.parse({ schemaVersion: 1, entries: [{ ...entry, status: 'pending', approvedBy: undefined }] })), false);
  assert.equal(corpusSchema.safeParse({ schemaVersion: 1, entries: [{ ...entry, source: undefined }] }).success, false);
  assert.equal(corpusSchema.safeParse({ schemaVersion: 1, entries: [entry, entry] }).success, false);
  assert.equal(corpusSchema.safeParse({ schemaVersion: 1, entries: [{ ...entry, approvedBy: undefined }] }).success, false);
});

test('B-003: the gate flags scripture citations and prayers but allows attributed literary quotes', () => {
  const corpus = loadCorpus();
  assert.equal(looksReligious('Teks apa pun', 'QS. Ar-Rum: 21'), true);
  assert.equal(looksReligious('Kasih itu sabar', '1 Korintus 13:4'), true);
  assert.equal(looksReligious('Whatever our souls are made of, his and mine are the same.', 'Emily Bronte'), false);
  assert.deepEqual(findUnverifiedReligiousText({ greetings: { prayer: 'Doa apa pun' } }, corpus).map((f) => f.path), ['greetings.prayer']);
  assert.deepEqual(findUnverifiedReligiousText({ quote: { enabled: true, text: 'Kalimat contoh', author: 'HR. Contoh' } }, corpus).map((f) => f.path), ['quote.text']);
  assert.deepEqual(findUnverifiedReligiousText({ quote: { enabled: true, text: 'A line from a novel.', author: 'A Novelist' } }, corpus), []);
});

test('B-003: no registry preset carries religious text that is not in the verified corpus', () => {
  const corpus = loadCorpus();
  for (const template of invitationTemplates) {
    assert.deepEqual(findUnverifiedReligiousText(template.preset, corpus), [], `${template.slug} ships unverified religious text`);
  }
  assert.doesNotMatch(source('lib/invitation/templates.ts'), /QS\.|Bismillah/);
});

// ── B-004: event times in the event's own zone ──────────────────────────────────

test('B-004: times render in the event zone with the right label on a UTC server', () => {
  assert.equal(formatEventTime('2026-11-21T08:00:00+07:00'), '08.00 WIB');
  assert.equal(formatEventTime('2026-11-21T19:00:00+08:00'), '19.00 WITA');
  assert.equal(formatEventTime('2026-11-21T10:30:00+09:00'), '10.30 WIT');
  assert.equal(formatEventTime('2026-11-21T01:00:00Z'), '08.00 WIB');
  assert.equal(formatEventTime('2026-11-21T01:00:00Z', 'Asia/Makassar'), '09.00 WITA');
  assert.equal(formatEventTime('2026-11-21T09:15:00+01:00'), '09.15 UTC+01:00');
});

test('B-004: dates do not slip a day across the UTC boundary', () => {
  assert.equal(formatEventDate('2026-11-21T00:30:00+07:00'), 'Sabtu, 21 November 2026');
  assert.equal(formatEventDate('2026-11-21T23:30:00+09:00'), 'Sabtu, 21 November 2026');
});

test('B-004: missing or invalid values render nothing; no guest-page file formats times itself or hard-codes WIB', () => {
  assert.equal(formatEventTime(undefined), null);
  assert.equal(formatEventTime('not a date'), null);
  assert.equal(formatEventDate(''), null);
  const files = ['components/invitation/public-renderer.tsx', 'components/invitation/guest-view.ts', 'components/invitation/guest-blocks.tsx', ...FAMILY_IDS.map((id) => `components/invitation/families/${id}.tsx`)];
  for (const file of files) assert.doesNotMatch(source(file), /toLocaleTimeString|toLocaleDateString|['"`]\s*WIB['"`]|\} WIB`/, file);
  // G-018: the same formatter, in the page's language (`dateLocale`); the event's own zone still decides the wall clock.
  assert.match(source('components/invitation/guest-view.ts'), /formatEventTime\(value, eventZone, dateLocale\)/);
});

test('B-004: every layout renders the event-local day and time on a UTC server, labelled from the saved offset or zone', () => {
  const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
  // 00.30 WITA on the 28th is 16.30 UTC on the 27th: a server-zone date would slip back a day.
  const offset: DetailConfig = { couple, events: [{ title: 'Akad', startAt: '2026-12-28T00:30:00+08:00', endAt: '2026-12-28T01:30:00+08:00' }] };
  const zoned: DetailConfig = { couple, events: [{ title: 'Akad', startAt: '2026-12-27T16:30:00Z' }], eventOperations: { enabled: false, timezone: 'Asia/Jayapura' } };
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(offset, familyId) });
    assert.ok(page.includes('00.30 WITA – 01.30 WITA'), `${label}: time range in the event's zone`);
    assert.ok(page.includes('Senin, 28 Desember 2026'), `${label}: the event's own day`);
    assert.doesNotMatch(page, /WIB|27 Desember/, `${label}: no server-zone date and no fixed WIB label`);
    assert.ok(renderGuestPage({ config: withFamily(zoned, familyId) }).includes('01.30 WIT'), `${label}: the saved event zone`);
  }
});

// ── B-005: editor preview opens the real renderer; theme tab reachable ─────────

test('B-005: path builders', () => {
  assert.equal(ownerPreviewPath(42), '/preview/42');
  assert.equal(invitationPath('budi-sari'), '/i/budi-sari');
  assert.equal(guestPath('budi-sari', 'tamu 1'), '/i/budi-sari/tamu%201');
});

test('B-005: the editor links to the owner preview and no longer gates the theme tab on a forbidden key', () => {
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.doesNotMatch(editor, /href=\{`\/\$\{slug\}`\}/);
  assert.doesNotMatch(editor, /addons\?\.theme|themeAddon/);
  assert.match(editor, /if \(id === 'theme'\) return true;/);
  assert.doesNotMatch(editor, /label="ID template" type="number"/, 'template switching stays out of the editor (tier bypass)');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /previewHref=\{ownerPreviewPath\(id\)\}/);
  const preview = source('app/preview/[id]/page.tsx');
  assert.match(preview, /eq\(invitations\.userId, user\.id\)/, 'preview checks ownership');
  // s11 (B-014 step 1): the loader takes `includeDraft` as its third positional argument so React cache() keys stay stable.
  assert.match(preview, /loadPublicInvitation\(owned\.slug, undefined, true\)/);
  assert.doesNotMatch(preview, /trackInvitationView/, 'owner views are not tracked');
});

// ── B-006: CSV cells never execute as formulas ──────────────────────────────────

test('B-006: formula-looking values are neutralised and quoted', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+62 812 0000 0000'), `"'+62 812 0000 0000"`);
  assert.equal(csvCell('-1+1'), `"'-1+1"`);
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCell('\t=1'), `"'\t=1"`);
  assert.equal(csvCell('Budi & Sari'), '"Budi & Sari"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(2), '"2"');
  assert.equal(csvRow(['a', '=b', 'c"d']), `"a","'=b","c""d"`);
  // s17 (E-025): the route serves `guestExportCsv`, whose rows go through csvRow.
  const route = source('app/(customer)/dashboard/invitations/[id]/analytics/route.ts');
  assert.match(route, /guestExportCsv\(/);
  assert.doesNotMatch(route, /function csv\(/);
  assert.match(source('lib/invitation/guest-export.ts'), /csvRow\(/);
});

// ── B-007: RSVP keeps the host's allowance ──────────────────────────────────────

test('B-007: confirm 2 of 2, decline, confirm 2 again keeps allowance 2 and attending 2', () => {
  const guest = { guestCount: 2, attendingCount: null as number | null };
  guest.attendingCount = rsvpAttendance('CONFIRMED', 2, guest.guestCount);
  assert.deepEqual(guest, { guestCount: 2, attendingCount: 2 });
  guest.attendingCount = rsvpAttendance('DECLINED', 2, guest.guestCount);
  assert.deepEqual(guest, { guestCount: 2, attendingCount: 0 });
  assert.equal(rsvpDefaultCount(guest), 2, 'form offers the full allowance again after a decline');
  guest.attendingCount = rsvpAttendance('CONFIRMED', 2, guest.guestCount);
  assert.deepEqual(guest, { guestCount: 2, attendingCount: 2 });
});

test('B-007: attendance is clamped to 1…allowance and the status whitelist holds', () => {
  assert.equal(rsvpAttendance('CONFIRMED', 5, 2), 2);
  assert.equal(rsvpAttendance('CONFIRMED', 0, 2), 1);
  assert.equal(rsvpAttendance('CONFIRMED', Number.NaN, 3), 1);
  assert.equal(rsvpAttendance('CONFIRMED', 2, 0), 1);
  assert.equal(rsvpDefaultCount({ guestCount: 4, attendingCount: 3 }), 3);
  assert.equal(isRsvpStatus('CONFIRMED'), true);
  assert.equal(isRsvpStatus('MAYBE'), false);
});

test('B-007: the action writes attending_count, never guest_count; the migration is additive', () => {
  const action = source('app/i/[slug]/actions.ts');
  // B-027 (D-034, s17) adds the answers to the same write; status and attending count still lead it.
  assert.match(action, /set\(\{ rsvpStatus: status, attendingCount[,}\s]/);
  assert.doesNotMatch(action, /set\(\{[^}]*guestCount/);
  const migration = source('lib/db/migrations/0009_guest_attending_count.sql').trim();
  assert.equal(migration, 'ALTER TABLE "guests" ADD COLUMN "attending_count" integer;');
});
