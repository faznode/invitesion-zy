// G-047 (D-069): the host's optional guest passcode. Pure rules, the cover-only gate, and source guards that keep every
// surface holding the invitation's content behind the server's admission. The served behaviour (HTML, RSC, metadata,
// side routes, limits, caches, rollback) is the browser acceptance recorded in E-096. Fictional data.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins some modules need at import time.
import './support/render-guest-page';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasscodeGate } from '../components/invitation/passcode-gate';
import { isFlagOn } from '../lib/flags';
import { passcodeCover } from '../lib/invitation/guest-gate';
import {
  hashPasscode,
  normalizePasscode,
  PASSCODE_UNLOCK_TTL_SECONDS,
  passcodeGateActive,
  passcodeLimits,
  passcodeNoticeOf,
  unlockCookieName,
  unlockToken,
  unlockTokenValid,
  verifyPasscode,
} from '../lib/invitation/guest-passcode';
import { invitationShareMetadata, previewImageModel } from '../lib/invitation/preview-image';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
function filesUnder(dir: string, pattern = /\.(ts|tsx)$/): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const CONFIG = {
  settings: { title: 'Pernikahan Laras & Dimas (fiktif)', openingCopy: 'Dengan memohon rahmat (fiktif)' },
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ id: 'ev-akad', title: 'Akad Rahasia (fiktif)', venueName: 'Gedung Melati (fiktif)', startAt: '2027-05-01T09:00:00+07:00' }],
  quote: { enabled: true, text: 'Kutipan tersembunyi (fiktif)' },
  gift: { enabled: true, accounts: [{ bank: 'BCA', accountNumber: '9876543210', accountName: 'Laras (fiktif)' }] },
} as never;

test('G-047: a passcode is 6–32 letters or digits, compared without case or surrounding spaces', () => {
  assert.equal(normalizePasscode(' Mawar2027 '), 'mawar2027');
  assert.equal(normalizePasscode('ＡＢＣ１２３'), 'abc123', 'full-width input from a phone keyboard (NFKC)');
  for (const bad of ['abc12', 'a'.repeat(33), 'mawar-27', 'kode rahasia', '', null, 123456, undefined]) assert.equal(normalizePasscode(bad), null, String(bad));
});

test('G-047: only a salted scrypt hash is kept, and it matches the code alone', async () => {
  const first = await hashPasscode('mawar2027');
  const second = await hashPasscode('mawar2027');
  assert.match(first, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second, 'a fresh salt each time');
  assert.ok(!first.includes('mawar'), 'the code is not in the hash');
  assert.equal(await verifyPasscode('mawar2027', first), true);
  assert.equal(await verifyPasscode('mawar2028', first), false);
  for (const stored of [null, '', 'plain', 'scrypt$1$1$1$x$y', first.replace(/\$[^$]+$/, '$AAAA')]) assert.equal(await verifyPasscode('mawar2027', stored), false, String(stored));
  assert.equal(await verifyPasscode(null, first), false);
});

test('G-047: an admission is for one invitation under its current passcode, until it expires', async () => {
  const stored = await hashPasscode('mawar2027');
  const now = new Date('2027-04-01T00:00:00Z');
  const token = unlockToken(41, stored, now);
  assert.equal(unlockTokenValid(token, 41, stored, now), true);
  assert.equal(unlockTokenValid(token, 42, stored, now), false, 'another invitation');
  assert.equal(unlockTokenValid(token, 41, await hashPasscode('mawar2027'), now), false, 'a changed passcode (even to the same code) ends every admission');
  assert.equal(unlockTokenValid(token, 41, stored, new Date(now.getTime() + PASSCODE_UNLOCK_TTL_SECONDS * 1000 - 1000)), true);
  assert.equal(unlockTokenValid(token, 41, stored, new Date(now.getTime() + PASSCODE_UNLOCK_TTL_SECONDS * 1000)), false, 'expired');
  const [expires, mac] = token.split('.');
  assert.equal(unlockTokenValid(`${Number(expires) + 86400}.${mac}`, 41, stored, now), false, 'a lengthened expiry breaks the MAC');
  for (const bad of [undefined, '', 'x', `${expires}.`, `${expires}.${mac}x`, `${expires}.${mac.slice(1)}A`]) assert.equal(unlockTokenValid(bad, 41, stored, now), false, String(bad));
  assert.equal(unlockCookieName(41), 'inv_unlock_41');
});

test('G-047: the gate applies only with a stored hash and the flag on; FLAG_GUEST_PASSCODE=off is the rollback', () => {
  assert.equal(isFlagOn('GUEST_PASSCODE', {}), true);
  assert.equal(passcodeGateActive({ guestPasscodeHash: 'scrypt$x' }, {}), true);
  assert.equal(passcodeGateActive({ guestPasscodeHash: 'scrypt$x' }, { FLAG_GUEST_PASSCODE: 'off' }), false);
  assert.equal(passcodeGateActive({ guestPasscodeHash: null }, {}), false);
  assert.equal(passcodeGateActive({}, {}), false, 'an invitation from before G-047');
});

test('G-047: attempts are limited per address and per invitation; the action reports refusals in the page query', () => {
  assert.deepEqual(passcodeLimits({}), { address: { max: 5, windowSeconds: 600 }, invitation: { max: 50, windowSeconds: 600 } });
  assert.deepEqual(passcodeLimits({ RATE_LIMIT_PASSCODE_IP: '3/60', RATE_LIMIT_PASSCODE_LINK: '8/120' }), { address: { max: 3, windowSeconds: 60 }, invitation: { max: 8, windowSeconds: 120 } });
  assert.deepEqual(passcodeNoticeOf({ kode: 'salah' }), { kind: 'wrong' });
  assert.deepEqual(passcodeNoticeOf({ kode: 'tunggu', menit: '3' }), { kind: 'wait', minutes: 3 });
  assert.deepEqual(passcodeNoticeOf({ kode: 'tunggu', menit: 'x' }), { kind: 'wait', minutes: 10 });
  assert.equal(passcodeNoticeOf({}), null);
  assert.equal(passcodeNoticeOf({ kode: '<script>' }), null);
});

test('G-047: a protected invitation\'s link preview is its cover: label and names, no date, no opening text', () => {
  const full = previewImageModel('wedding', CONFIG, true);
  const cover = previewImageModel('wedding', CONFIG, true, true);
  assert.ok(full.date);
  assert.equal(cover.date, null);
  assert.equal(cover.name, full.name);
  const open = invitationShareMetadata({ slug: 'laras-dimas', eventType: 'wedding' }, CONFIG);
  const locked = invitationShareMetadata({ slug: 'laras-dimas', eventType: 'wedding' }, CONFIG, { coverOnly: true });
  assert.equal(open.description, 'Dengan memohon rahmat (fiktif)');
  assert.equal(locked.description, undefined);
  assert.notEqual(open.openGraph.images[0].url, locked.openGraph.images[0].url, 'a different card, so a cached full card is never reused');
});

test('G-047: the gate renders the cover and the form, and nothing else of the invitation', () => {
  const html = renderToStaticMarkup(createElement(PasscodeGate, { cover: passcodeCover('wedding', CONFIG), slug: 'laras-dimas', guestSlug: 'budi-tamu', notice: { kind: 'wrong' } }));
  assert.match(html, /Laras/);
  assert.match(html, /Undangan ini dilindungi kode akses/);
  const field = /<input[^>]*name="passcode"[^>]*>/.exec(html)?.[0] ?? '';
  assert.match(field, /\brequired=""/);
  assert.match(field, /minLength="6"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-invalid="true"/);
  for (const secret of ['Akad Rahasia', 'Gedung Melati', 'Kutipan tersembunyi', '9876543210', 'Dengan memohon rahmat', '2027']) assert.ok(!html.includes(secret), secret);
  const english = renderToStaticMarkup(createElement(PasscodeGate, { cover: passcodeCover('wedding', { ...(CONFIG as object), settings: { language: 'en' }, theme: { familyId: 'gapura' } } as never), slug: 'x', notice: { kind: 'wait', minutes: 4 } }));
  assert.match(english, /Too many attempts\. Try again in 4 minutes\./);
});

test('G-047: every guest page checks the gate before it loads the guest, wishes or media', () => {
  for (const path of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx', 'app/i/[slug]/[guestSlug]/pass/page.tsx']) {
    const page = source(path);
    const body = page.slice(page.indexOf('export default async function'));
    assert.match(body, /const gate = await loadGuestGate\(slug\);\n  if \(gate\?\.locked\) return <PasscodeGate cover=\{gate\.cover\}/, path);
    assert.ok(body.indexOf('loadGuestGate(') < body.indexOf('loadPublicInvitation('), `${path}: gate first`);
    const metadata = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function'));
    assert.ok(metadata.indexOf('if (gate?.locked) return') < metadata.indexOf('loadPublicInvitation('), `${path}: metadata gate first`);
  }
});

test('G-047: each side route holding content refuses a locked request; cached public images refuse a protected invitation', () => {
  const calendar = source('app/i/[slug]/calendar.ics/route.ts');
  assert.ok(calendar.indexOf('if (gate?.locked) return lockedResponse();') < calendar.indexOf('loadPublishedInvitationSummary(slug)'));
  assert.match(calendar, /'Cache-Control': gate\?\.passcode \? 'private, no-store' : 'public, max-age=300'/);
  for (const path of ['app/i/[slug]/gift-qris.img/route.ts', 'app/i/[slug]/[guestSlug]/gift/qris/route.ts', 'app/i/[slug]/[guestSlug]/photo/[slot]/route.ts']) {
    const route = source(path);
    assert.ok(route.indexOf('if (await guestAccessLocked(') > 0 && route.indexOf('if (await guestAccessLocked(') < route.indexOf('return serve'), path);
  }
  assert.match(source('app/i/[slug]/story.png/route.ts'), /if \(!summary \|\| passcodeGateActive\(summary\.invitation\) \|\| !inviteShareAvailable/);
  assert.match(source('app/i/[slug]/card.png/route.ts'), /if \(!summary \|\| passcodeGateActive\(summary\.invitation\) \|\| !cardExportAvailable/);
  assert.match(source('app/i/[slug]/og.png/route.tsx'), /previewImageModel\(summary\.invitation\.eventType, summary\.config, undefined, passcodeGateActive\(summary\.invitation\)\)/);
  const gate = source('lib/invitation/guest-gate.ts');
  assert.match(gate, /return new Response\('Not found', \{ status: 404, headers: \{ 'Cache-Control': 'private, no-store' \} \}\);/);
});

test('G-047: RSVP and wishes refuse before either writer; the unlock counts the attempt before it checks the code', () => {
  const actions = source('app/i/[slug]/actions.ts');
  for (const name of ['submitRsvp', 'submitGuestMessage']) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    assert.ok(body.indexOf('if (await guestAccessLocked(slug)) redirect(') > 0 && body.indexOf('if (await guestAccessLocked(slug))') < body.indexOf('backendFor('), name);
  }
  const unlock = actions.slice(actions.indexOf('export async function unlockInvitation('), actions.indexOf('async function openInvitationFor('));
  assert.ok(unlock.indexOf('await hit(') < unlock.indexOf('verifyPasscode('), 'the limit is counted first');
  assert.ok(unlock.indexOf("redirect(`${back}?kode=tunggu") < unlock.indexOf('verifyPasscode('), 'a refused window never checks the code');
  assert.match(unlock, /httpOnly: true,\n\s*sameSite: 'lax',\n\s*secure: .*,\n\s*path: invitationPath\(slug\),\n\s*maxAge: PASSCODE_UNLOCK_TTL_SECONDS,/);
  assert.doesNotMatch(unlock, /formData\.get\('(?:back|path|next|url)'\)/, 'the return path is rebuilt, never taken from the form');
});

test('G-047: one writer for the passcode columns, outside the content: the content writers never touch them and the Rust service only clears them in the purge', () => {
  const files = [...filesUnder('app'), ...filesUnder('lib'), ...filesUnder('components')];
  const writers = files.filter((path) => /\.set\(\{[^}]*guestPasscode(?:Hash|SetAt)/.test(source(path)));
  assert.deepEqual(writers, ['lib/invitation/guest-passcode-db.ts']);
  for (const path of ['lib/invitation/content-next.ts', 'lib/invitation/content.ts', 'lib/invitation/content-read.ts', 'lib/invitation/detail-config.ts', 'lib/invitation/version-history.ts']) {
    assert.doesNotMatch(source(path), /passcode/i, `${path} knows nothing of it`);
  }
  // R-X10: the B-031 purge's tombstone keeps no passcode. That statement is the one place the Rust service names the
  // columns, once each, and only to clear them; no Rust writer reads or sets a passcode.
  assert.deepEqual(filesUnder('services/api/src', /\.rs$/).filter((path) => /guest_passcode/.test(source(path))), ['services/api/src/retention.rs']);
  const retention = source('services/api/src/retention.rs');
  assert.deepEqual(retention.match(/guest_passcode\w*/g), ['guest_passcode_hash', 'guest_passcode_set_at']);
  assert.match(retention, /"update invitations set config = null, creation_key = null, client_label = null, guest_passcode_hash = null, guest_passcode_set_at = null, purged_at = \$2 where id = \$1"/);
  const route = source('app/api/invitations/[id]/passcode/route.ts');
  assert.match(route, /if \(!isFlagOn\('GUEST_PASSCODE'\)\) return apiError\(404/);
  assert.match(route, /if \(user\.role === 'ADMIN'\) return apiError\(403/);
  assert.match(route, /apiError\(422, 'INVALID_PASSCODE'/);
  assert.doesNotMatch(route, /guestPasscodeHash/, 'the hash is never answered');
  const migration = source('lib/db/migrations/0031_guest_passcode.sql');
  assert.deepEqual(migration.split('--> statement-breakpoint').map((s) => s.trim()), [
    'ALTER TABLE "invitations" ADD COLUMN "guest_passcode_hash" varchar(200);',
    'ALTER TABLE "invitations" ADD COLUMN "guest_passcode_set_at" timestamp;',
  ], 'additive and nullable: every invitation from before G-047 stays without a passcode');
});
