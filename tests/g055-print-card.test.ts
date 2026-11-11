// G-055 (I-30): printable cards and the public e-card with a QR code to the live invitation. The e-card is public and
// drawn from the link preview's data only (its code opens the general link); a guest's card is the owner's alone (its code
// opens that guest's personal link). One rule: flag, published, host opt-in. Rendered and decoded here. Fictional data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import jsQR from 'jsqr';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins some modules need at import time.
import { fixtureInvitation } from './support/render-guest-page';
import { decodePng } from '../tools/template-harness/design-acceptance';
import { isFlagOn } from '../lib/flags';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { GUEST_COPY } from '../lib/invitation/guest-copy';
import { CARD_IMAGE_SIZE, cardAddressText, cardExportAvailable, cardExportState, cardFileName, cardGuestName, cardTarget } from '../lib/invitation/print-card';
import { cardImageResponse } from '../lib/invitation/print-card-image';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ON = { FLAG_CARD_EXPORT: 'on' };
const ORIGIN = 'https://undangan.example';

const wedding = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Akad Nikah', startAt: '2027-01-10T09:00:00+08:00' }],
  theme: { paletteId: 'sage', familyId: 'gapura' },
  settings: { cardExport: true },
} as DetailConfig;
const optedOut = (config: DetailConfig, cardExport?: boolean): DetailConfig => ({ ...config, settings: { ...config.settings, cardExport } });

/** The card as pixels, and what a phone camera would read from its code. */
async function readCard(response: Response) {
  const png = decodePng(Buffer.from(await response.arrayBuffer()));
  const rgba = new Uint8ClampedArray(png.width * png.height * 4);
  for (let pixel = 0; pixel < png.width * png.height; pixel++) {
    const from = pixel * png.channels;
    rgba.set([png.data[from], png.data[from + 1], png.data[from + 2], png.channels === 4 ? png.data[from + 3] : 255], pixel * 4);
  }
  return { width: png.width, height: png.height, code: jsQR(rgba, png.width, png.height)?.data ?? null };
}

test('G-055: card export is on by default and FLAG_CARD_EXPORT=off turns every card off', () => {
  assert.equal(isFlagOn('CARD_EXPORT', {}), true);
  assert.equal(isFlagOn('CARD_EXPORT', { FLAG_CARD_EXPORT: 'off' }), false);
});

test('G-055: one rule, a published invitation whose host opted in; a draft or expired link never gets a card', () => {
  const NOW = Date.parse('2026-11-11T10:00:00Z');
  const published = fixtureInvitation({ status: 'PUBLISHED' });
  assert.equal(cardExportAvailable(published, wedding, NOW, ON), true);
  assert.equal(cardExportAvailable(fixtureInvitation({ status: 'DRAFT' }), wedding, NOW, ON), false, 'a draft link answers 404');
  assert.equal(cardExportAvailable(fixtureInvitation({ status: 'EXPIRED' }), wedding, NOW, ON), false, 'an expired link is read-only');
  assert.equal(cardExportAvailable(published, optedOut(wedding), NOW, ON), false, 'unset is off: no stored invitation gains a card');
  assert.equal(cardExportAvailable(published, optedOut(wedding, false), NOW, ON), false);
  assert.equal(cardExportAvailable(published, wedding, NOW, { FLAG_CARD_EXPORT: 'off' }), false, 'the rollback');
  // The card is not the guest page, so the classic layout (D-041) is not excluded: the page itself is untouched.
  assert.equal(cardExportAvailable(published, { ...wedding, theme: { paletteId: 'sage' } }, NOW, ON), true);
  // s50 finding: past `expiresAt` the guest page is read-only while the status still says PUBLISHED (the usual case).
  const lapsed = fixtureInvitation({ status: 'PUBLISHED', expiresAt: new Date(NOW - 1000) });
  assert.equal(cardExportAvailable(lapsed, wedding, NOW, ON), false, 'past expiresAt is expired, as on the guest page');
  assert.equal(cardExportAvailable(fixtureInvitation({ status: 'PUBLISHED', expiresAt: new Date(NOW + 1000) }), wedding, NOW, ON), true);
  // The owner page names why: one state per reason, each with its own words on the page.
  assert.equal(cardExportState(published, wedding, NOW, ON), 'available');
  assert.equal(cardExportState(fixtureInvitation({ status: 'DRAFT' }), wedding, NOW, ON), 'draft');
  assert.equal(cardExportState(lapsed, wedding, NOW, ON), 'expired');
  assert.equal(cardExportState(lapsed, optedOut(wedding), NOW, ON), 'expired', 'expiry is named before the missing opt-in');
  assert.equal(cardExportState(published, optedOut(wedding), NOW, ON), 'off');
});

test('G-055: the code opens the general link, or a guest personal link, on the configured origin', () => {
  assert.equal(cardTarget(ORIGIN, 'laras-dimas'), 'https://undangan.example/i/laras-dimas');
  assert.equal(cardTarget(`${ORIGIN}/`, 'laras-dimas', 'k3y-token'), 'https://undangan.example/i/laras-dimas/k3y-token');
  assert.equal(cardTarget(ORIGIN, 'laras dimas', 'a/b'), 'https://undangan.example/i/laras%20dimas/a%2Fb', 'encoded like every path');
  assert.equal(cardAddressText('https://undangan.example/i/laras-dimas'), 'undangan.example/i/laras-dimas');
  assert.equal(cardAddressText('http://127.0.0.1:3300/i/x'), '127.0.0.1:3300/i/x');
  assert.equal(cardFileName('laras-dimas'), 'laras-dimas-kartu.png');
  assert.equal(cardFileName('laras-dimas', 'ibu-sri'), 'laras-dimas-ibu-sri-kartu.png');
  assert.equal(cardFileName('laras-dimas', 'a"b;c'), 'laras-dimas-a-b-c-kartu.png', 'no header injection through a filename');
});

test('G-055: a guest name is printed only in the bundled font, at most 60 characters; otherwise the greeting is left off', () => {
  assert.equal(cardGuestName('  Ibu Sri Wahyuni (fiktif) '), 'Ibu Sri Wahyuni (fiktif)');
  assert.equal(cardGuestName('Bapak José Müller'), 'Bapak José Müller');
  assert.equal(cardGuestName('محمد'), null);
  assert.equal(cardGuestName('李小龍'), null);
  assert.equal(cardGuestName('x'.repeat(61)), null);
  assert.equal(cardGuestName(''), null);
  assert.equal(cardGuestName(null), null);
});

test('G-055: the public e-card is an A6 PNG at 300 dpi whose code a camera reads as the general invitation link', async () => {
  const target = cardTarget(ORIGIN, 'laras-dimas');
  const response = await cardImageResponse({ eventType: 'wedding', config: wedding, target, headers: { 'Cache-Control': 'public, max-age=600' } });
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=600');
  const card = await readCard(response);
  assert.deepEqual([card.width, card.height], [CARD_IMAGE_SIZE.width, CARD_IMAGE_SIZE.height]);
  assert.deepEqual(CARD_IMAGE_SIZE, { width: 1240, height: 1748 }, '105 × 148 mm at 300 dpi');
  assert.equal(card.code, target);
});

test('G-055: a guest card code reads as that guest personal link, also when the name cannot be printed', async () => {
  for (const [segment, name] of [['ibu-sri', 'Ibu Sri Wahyuni (fiktif)'], ['0123456789abcdef0123456789abcdef', 'محمد']] as const) {
    const target = cardTarget(ORIGIN, 'laras-dimas', segment);
    const response = await cardImageResponse({ eventType: 'wedding', config: wedding, target, guestName: cardGuestName(name), headers: {} });
    const card = await readCard(response);
    assert.equal(card.code, target, segment);
  }
  // English invitations print their own caption; the card keeps its size and code.
  const english = { ...wedding, settings: { ...wedding.settings, language: 'en' as const } };
  const response = await cardImageResponse({ eventType: 'wedding', config: english, target: cardTarget(ORIGIN, 'laras-dimas'), headers: {} });
  assert.equal((await readCard(response)).code, `${ORIGIN}/i/laras-dimas`);
});

test('G-055: the card prints only the link preview model, the caption and an owner-supplied guest name', () => {
  const image = source('lib/invitation/print-card-image.tsx');
  assert.match(image, /const \{ label, imageName, date, colors \} = previewImageModel\(eventType, config\);/);
  assert.match(image, /\{copy\.card\.scan\}/);
  assert.match(image, /\{cardAddressText\(target\)\}/);
  assert.doesNotMatch(image, /config\.(gift|rsvp|guestbook|couple|events|eventOperations)/, 'no field outside the preview model');
  assert.equal(GUEST_COPY.id.card.scan, 'Pindai kode ini untuk membuka undangan');
  assert.equal(GUEST_COPY.en.card.scan, 'Scan this code to open the invitation');
});

test('G-055: the public e-card route takes no guest and reads no guest row, under the one rule', () => {
  const route = source('app/i/[slug]/card.png/route.ts');
  assert.match(route, /loadPublishedInvitationSummary\(slug\)/);
  assert.match(route, /!cardExportAvailable\(summary\.invitation, summary\.config\)\) return new Response\('Not found', \{ status: 404 \}\)/);
  assert.match(route, /target: cardTarget\(await getPublicOrigin\(\), invitation\.slug\),/);
  assert.match(route, /'Cache-Control': 'public, max-age=600'/);
  assert.match(route, /'X-Robots-Tag': 'noindex'/);
  // G-047 (D-069): the passcode is the invitation's rule, not a guest's; its import is the one line allowed to say "guest".
  const passcodeImport = "import { passcodeGateActive } from '@/lib/invitation/guest-passcode';\n";
  assert.ok(route.startsWith(passcodeImport), 'the passcode rule is imported exactly once, first');
  assert.match(route, /if \(!summary \|\| passcodeGateActive\(summary\.invitation\) \|\| !cardExportAvailable/);
  const code = route.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(passcodeImport, '');
  assert.doesNotMatch(code, /guest|searchParams/i, 'nothing of a guest can reach the public card');
});

test('G-055: a guest card is the owner alone: 401 signed out, 403 admin, 404 for anyone else, the flag, no opt-in or another invitation guest', () => {
  const route = source('app/(customer)/dashboard/invitations/[id]/cards/[guestId]/route.ts');
  const order = [
    "if (!user) return new Response('Unauthorized', { status: 401 });",
    "if (user.role === 'ADMIN') return new Response('Forbidden', { status: 403 });",
    "if (!isFlagOn('CARD_EXPORT')) return notFound();",
    "await accessFor(user.id, id, 'manage')",
    'if (!cardExportAvailable(access.invitation, config)) return notFound();',
    'const guest = await loadCardGuest(id, guestId);',
    'if (!guest) return notFound();',
  ].map((line) => route.indexOf(line));
  assert.ok(order.every((at) => at > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'checked in this order, before any guest row is read');
  assert.match(route, /target: cardTarget\(await getPublicOrigin\(\), access\.invitation\.slug, segment\)/);
  assert.match(route, /const segment = guestLinkSegment\(guest\);/, 'the same segment the personal page resolves');
  assert.match(route, /guestName: cardGuestName\(guest\.name\)/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  assert.match(route, /'Content-Disposition': `attachment; filename="\$\{cardFileName\(access\.invitation\.slug, segment\)\}"`/);
  const loader = source('lib/invitation/print-card-db.ts');
  assert.match(loader, /^import 'server-only';/);
  assert.match(loader, /const cardGuestColumns = \{ id: guests\.id, name: guests\.name, slug: guests\.slug, linkToken: guests\.linkToken \};/, 'name and link only');
  assert.match(loader, /and\(eq\(guests\.id, guestId\), eq\(guests\.invitationId, invitationId\)\)/);
});

test('G-055: the owner page lists guests only when cards are available and says why they are not', () => {
  const page = source('app/(customer)/dashboard/invitations/[id]/cards/page.tsx');
  assert.match(page, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);/);
  assert.match(page, /if \(!isFlagOn\('CARD_EXPORT'\)\) notFound\(\);/);
  assert.match(page, /accessFor\(user\.id, id, 'manage'\)/);
  assert.match(page, /const guests = available \? await loadCardGuests\(id\) : \[\];/);
  for (const reason of ['draft', 'expired', 'off']) assert.match(page, new RegExp(`${reason}: '`), reason);
  assert.match(page, /<span className="sr-only"> untuk \{guest\.name\}<\/span>/, 'each download names its guest for a screen reader');
});

test('G-055: the opt-in is stored as an explicit boolean through the content schema, never shown to guests', () => {
  assert.equal(detailConfigSchema.safeParse({ settings: { cardExport: true } }).success, true);
  assert.equal(detailConfigSchema.safeParse({ settings: { cardExport: false } }).success, true);
  assert.equal(detailConfigSchema.safeParse({ settings: { cardExport: 'yes' } }).success, false);
  assert.ok(RENDER_CAPABILITIES.settings.hostOnly?.includes('cardExport'));
  assert.ok(!(RENDER_CAPABILITIES.settings.rendered as readonly string[]).includes('cardExport'));
  const choice = source('app/(customer)/dashboard/invitations/[id]/edit/editor-card-export.tsx');
  assert.match(choice, /checked=\{value === true\}/, 'unset reads as off');
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /\{cardExport && <Card title="Kartu cetak & e-card"/);
  assert.match(editor, /onChange=\{\(x\)=>patch\('settings',\{\.\.\.section\('settings'\),cardExport:x\}\)\}/);
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /cardExport=\{isFlagOn\('CARD_EXPORT'\)\}/);
});
