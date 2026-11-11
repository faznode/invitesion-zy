// G-046: the owner's version history and restore. A restore stores the saved version as a whole through the selected
// content writer, keyed by the D-036 contract, and changes the config only (the database proof, through both writers, is
// `scripts/verify-content-api.ts`). Fictional data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins some modules need at import time.
import './support/render-guest-page';
import { isFlagOn } from '../lib/flags';
import { versionHistoryQuery } from '../lib/invitation/content';
import { CONTENT_SCHEMA_VERSION } from '../lib/invitation/content-contract';
import { prepareRestoreWrite } from '../lib/invitation/content-read';
import { changedSections, historyCursor, SECTION_LABELS, versionAuthor } from '../lib/invitation/version-history';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const akad = { title: 'Akad Nikah', startAt: '2027-01-10T09:00:00+08:00' };
const resepsi = { title: 'Resepsi', startAt: '2027-01-10T19:00:00+08:00' };

test('G-046: version history is on by default and FLAG_VERSION_HISTORY=off hides it', () => {
  assert.equal(isFlagOn('VERSION_HISTORY', {}), true);
  assert.equal(isFlagOn('VERSION_HISTORY', { FLAG_VERSION_HISTORY: 'off' }), false);
});

test('G-046: a restore stores the version as a whole; a section only today has is not carried over', () => {
  const today = { couple: { bride: { nickName: 'Sari' } }, quote: { enabled: true, text: 'Kutipan baru (fiktif)' }, events: [{ ...akad, id: 'ev-a' }] };
  const version = { couple: { bride: { nickName: 'Laras' } }, gift: { enabled: true }, events: [{ ...akad, id: 'ev-a' }], schemaVersion: 2 };
  const restored = prepareRestoreWrite(today, version);
  assert.ok(restored);
  assert.equal(restored.couple?.bride?.nickName, 'Laras');
  assert.equal(restored.quote, undefined, 'the newer section is gone, as in the version');
  assert.equal(restored.gift?.enabled, true, 'the section today lacks comes back');
  assert.equal(restored.schemaVersion, CONTENT_SCHEMA_VERSION);
});

test('G-046: D-036, restored events keep their ids, id-less ones take the live id of the same event, never a position', () => {
  const live = [{ ...resepsi, id: 'ev-live-resepsi' }, { ...akad, id: 'ev-live-akad' }];
  const restored = prepareRestoreWrite({ events: live }, { events: [{ ...akad, id: 'ev-kept' }, resepsi, { title: 'Pengajian', startAt: '2027-01-09T19:00:00+08:00' }] });
  assert.ok(restored?.events);
  const [kept, matched, fresh] = restored.events;
  assert.equal(kept.id, 'ev-kept', 'an event with an id keeps it, so its answers reattach');
  assert.equal(matched.id, 'ev-live-resepsi', 'an id-less event takes the id of the live event with the same title and start');
  assert.ok(fresh.id && !/^ev-\d+$/.test(fresh.id) && fresh.id !== 'ev-live-akad', `a new event gets a fresh id, never a position (${fresh.id})`);
});

test('G-046: nothing faithful to restore is refused, never silently rewritten', () => {
  assert.equal(prepareRestoreWrite({}, null), null);
  assert.equal(prepareRestoreWrite({}, ['not', 'a', 'config']), null);
  assert.equal(prepareRestoreWrite({ quote: { enabled: true, text: 'x' } }, { couple: { bride: { nickName: 'Laras' } }, gift: 'tidak sah' }), null, 'a section today no longer reads');
});

test('G-046: the history names what differs from today in the editor words, in the editor order', () => {
  const today = { couple: { bride: { nickName: 'Sari' } }, events: [{ ...akad, id: 'ev-a' }], quote: { enabled: true, text: 'x' } };
  assert.deepEqual(changedSections(today, { couple: { bride: { nickName: 'Laras' } }, events: [{ ...akad, id: 'ev-a' }] }), ['Mempelai', 'Kutipan']);
  assert.deepEqual(changedSections(today, JSON.parse(JSON.stringify(today))), [], 'equal content, whatever the key order');
  assert.equal(SECTION_LABELS.events, 'Acara');
  assert.equal(versionAuthor('customer'), 'Disimpan dari editor');
  assert.equal(versionAuthor('ai-agent'), 'Dibuat asisten');
  assert.equal(historyCursor('12'), 12);
  assert.equal(historyCursor(['7', '9']), 7);
  for (const bad of [undefined, '', '0', '-3', '1.5', 'abc']) assert.equal(historyCursor(bad), undefined, String(bad));
});

test('G-046: the restore goes through the one selected writer under every save rule, and touches the config only', () => {
  const facade = source('lib/invitation/content.ts');
  assert.match(facade, /export async function restoreInvitationVersion\(/);
  assert.match(facade, /const state = await loadContentState\(input\.invitationId, caller\.userId\);\n  if \(!state\) return \{ kind: 'notfound' \};/, 'owner only, as the editor');
  assert.match(facade, /if \(input\.expectedVersion !== state\.version\) return \{ kind: 'conflict', currentVersion: state\.version \};/, 'a stale page writes nothing');
  assert.match(facade, /if \(input\.versionNo === state\.version\) return \{ kind: 'current' \};/);
  assert.match(facade, /config = prepareRestoreWrite\(state\.config, row\.config\);/);
  assert.match(
    facade,
    /const touchedSections = \[\.\.\.new Set\(\[\.\.\.Object\.keys\(config\), \.\.\.Object\.keys\(state\.config\)\]\)\]\.filter\(\(key\) => key !== 'schemaVersion'\);\n  return writeContent\(caller, \{ invitationId: input\.invitationId, baseVersion: state\.version, config, touchedSections \}, env\);/,
    "every section of the version and of today's config judged (D-040, B-041), because a restore replaces them all",
  );
  assert.match(facade, /return writeContent\(caller, \{ invitationId: input\.invitationId, baseVersion: state\.version, config: validated, touchedSections: Object\.keys\(input\.patch\) \}, env\);/, 'the save shares the same writer selection');
  assert.equal(facade.match(/backendFor\('CONTENT', env\)/g)?.length, 1, 'one place selects the writer');
  const code = facade.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\b(guests|guestMessages|orders|payments|mediaAssets|giftLogs)\b/, 'no guest, wish, media or payment table here');
});

test('G-046: the history pages by distinct version number in the database, each by its latest row, so a repeated number never ends the paging early', () => {
  // The statement as PostgreSQL receives it. Rows written before B-035's lock may repeat a number; DISTINCT ON keeps the
  // latest row of each (the row a restore reads), and the one extra row says whether an older page exists.
  const page = versionHistoryQuery(41, { before: 9, limit: 30 }).toSQL();
  assert.match(page.sql, /^select distinct on \("invitation_versions"\."version_no"\) "version_no", "created_at", "created_by", "config" from "invitation_versions" /, page.sql);
  assert.match(page.sql, /where \("invitation_versions"\."invitation_id" = \$1 and "invitation_versions"\."version_no" < \$2\) order by "invitation_versions"\."version_no" desc, "invitation_versions"\."id" desc limit \$3$/, page.sql);
  assert.deepEqual(page.params, [41, 9, 31], 'this invitation, below the cursor, one row more than a page');
  const first = versionHistoryQuery(41, { limit: 30 }).toSQL();
  assert.doesNotMatch(first.sql, /"version_no" < /, 'the first page has no cursor');
  assert.deepEqual(first.params, [41, 31]);
  const facade = source('lib/invitation/content.ts');
  assert.match(
    facade,
    /const state = await loadContentState\(invitationId, userId\);\n  if \(!state\) return null;\n  const rows = await versionHistoryQuery\(invitationId, \{ before, limit \}\);\n  return \{ state, versions: rows\.slice\(0, limit\), more: rows\.length > limit \};/,
    'the owner check comes first, then one page',
  );
});

test('G-046: the route answers each refusal in its own words; flag first, then the session', () => {
  const route = source('app/api/invitations/[id]/versions/[versionNo]/restore/route.ts');
  assert.match(route, /export async function POST\(req: Request, \{ params \}: Ctx\) \{\n  if \(!isFlagOn\('VERSION_HISTORY'\)\) return apiError\(404, 'NOT_FOUND', 'Not found'\);/);
  assert.match(route, /if \(user\.role === 'ADMIN'\) return apiError\(403, 'FORBIDDEN', 'Customer session required'\);/);
  assert.match(route, /if \(!Number\.isInteger\(expectedVersion\) \|\| \(expectedVersion as number\) < 0\)/, 'a restore always names the version it replaces');
  for (const [code, status] of [['VERSION_CONFLICT', 409], ['ALREADY_CURRENT', 409], ['NOT_FOUND', 404], ['UNRESTORABLE', 422], ['INVALID_MEDIA', 400], ['THEME_NOT_ENTITLED', 403], ['SAVE_UNCONFIRMED', 503]] as const) {
    assert.match(route, new RegExp(`apiError\\(${status}, '${code}'`), code);
  }
});

test('G-046: the owner page explains what a restore keeps before anyone confirms, and the editor links to it plainly', () => {
  const page = source('app/(customer)/dashboard/invitations/[id]/history/page.tsx');
  assert.match(page, /if \(!isFlagOn\('VERSION_HISTORY'\)\) notFound\(\);/);
  assert.match(page, /const history = await loadVersionHistory\(id, user\.id, \{ before, limit: HISTORY_PAGE_SIZE \}\);\n  if \(!history\) notFound\(\);/);
  assert.match(page, /Daftar tamu, jawaban RSVP, ucapan, foto yang diunggah, dan pembayaran tidak berubah\./);
  const button = source('app/(customer)/dashboard/invitations/[id]/history/restore-version.tsx');
  assert.match(button, /body: JSON\.stringify\(\{ expectedVersion: currentVersion \}\)/);
  assert.match(button, /<p role="status"/, 'the outcome is announced');
  // A success is announced by the page's region, which outlives the restored row's button (gone once that row is current).
  assert.match(button, /announceRestored\(`Versi \$\{versionNo\} dipulihkan dan disimpan sebagai versi \$\{body\?\.version\}\.`\);\n\s*setStep\('idle'\);\n\s*router\.refresh\(\);/);
  assert.match(button, /export function HistoryAnnouncer\(/);
  assert.match(page, /<HistoryAnnouncer>\n\s*<ol /, 'the region wraps the list, outside every row');
  assert.match(button, /Ya, pulihkan/, 'an explicit confirmation');
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /\{historyHref && <a href=\{historyHref\}/, 'a plain link, so the unsaved-changes guard still asks');
  // The editor's first screen (the section list) renders without the section footer, so it carries its own link.
  const home = editor.slice(editor.indexOf("{tab === 'settings'"), editor.indexOf('<ControlCenter open={setTab}'));
  assert.match(home, /\{historyHref && <a href=\{historyHref\}/, "the editor's first screen leads to the history too");
  assert.equal(editor.match(/\{historyHref && <a href=\{historyHref\}/g)?.length, 2, 'the first screen and every section footer');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /historyHref=\{isFlagOn\('VERSION_HISTORY'\) \? `\/dashboard\/invitations\/\$\{id\}\/history` : null\}/);
});
