// B-018 (G-015, QA-013): one builder for every guest WhatsApp link: Indonesian formats normalise identically, a number
// that cannot be a WhatsApp number gives no link but a visible hint, and the message is the host's template with the
// guest's name and personal link. Fictional names and numbers only.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestWhatsAppAction } from '../components/dashboard/guest-whatsapp-action';
import { DEFAULT_WHATSAPP_MESSAGE, guestWhatsApp, parseWhatsAppNumber, toWhatsAppNumber, whatsAppMessage } from '../lib/invitation/whatsapp';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const LINK = 'https://invitesion.example/i/budi-sari/tok3n-Opaque_123';

test('B-018: 08…, +62…, 62…, 0062… and a bare 8… give the same digits', () => {
  for (const phone of [
    '081234567890',
    '0812-3456-7890',
    '0812 3456 7890',
    '(0812) 3456.7890',
    '+62 812 3456 7890',
    '+62 (0)812-3456-7890',
    '62 812 3456 7890',
    '6281234567890',
    '0062 812 3456 7890',
    '812 3456 7890',
    ' 0812 3456 7890 ',
  ]) {
    assert.deepEqual(parseWhatsAppNumber(phone), { ok: true, digits: '6281234567890' }, phone);
  }
  assert.equal(toWhatsAppNumber('0811 234 567'), '62811234567', 'the shortest mobile numbers (9 digits after 62)');
  assert.equal(toWhatsAppNumber('0812 3456 78901'), '62812345678901', 'the longest (12 digits after 62)');
});

test('B-018: a number written with another country code is kept as written', () => {
  assert.equal(toWhatsAppNumber('+1 415 555 0100'), '14155550100');
  assert.equal(toWhatsAppNumber('+44 20 7946 0958'), '442079460958');
  assert.equal(toWhatsAppNumber('0065 6123 4567'), '6561234567');
  assert.equal(toWhatsAppNumber('+60 12-345 6789'), '60123456789');
});

test('B-018: missing and impossible numbers give no digits, and say which', () => {
  for (const phone of [null, undefined, '', '   ', ' - ']) assert.deepEqual(parseWhatsAppNumber(phone), { ok: false, reason: 'missing' }, String(phone));
  for (const phone of [
    '123',
    '0812',
    '0812 3456 789012',
    '021 555 1234',
    '+62 21 555 1234',
    '62 0 21 5551234',
    '0812-3456-78ab',
    '+62 812 3456 7890 ext 2',
    '++6281234567890',
    '+0812 3456 7890',
    '+1 234',
    '+1234567890123456',
    'tel:081234567890',
  ]) {
    assert.deepEqual(parseWhatsAppNumber(phone), { ok: false, reason: 'invalid' }, phone);
  }
});

test('B-018: the host\u2019s template gets the guest\u2019s name and personal link; without {link} the link is added', () => {
  assert.equal(whatsAppMessage('Halo {nama}! Buka: {link}', { name: 'Budi Hartono', link: LINK }), `Halo Budi Hartono! Buka: ${LINK}`);
  assert.equal(whatsAppMessage('Dear { Nama }, {NAME} — {Tautan}', { name: 'Sari', link: LINK }), `Dear Sari, Sari — ${LINK}`);
  assert.equal(whatsAppMessage('Halo {nama}, sampai jumpa!', { name: 'Sari', link: LINK }), `Halo Sari, sampai jumpa!\n\n${LINK}`);
  assert.equal(whatsAppMessage('{link} {link}', { name: 'Sari', link: LINK }), `${LINK} ${LINK}`);
  // A name is inserted as text, never as a replacement pattern.
  assert.equal(whatsAppMessage('Hai {nama}', { name: 'Rp$&100 $1', link: LINK }), `Hai Rp$&100 $1\n\n${LINK}`);
  for (const blank of [undefined, null, '', '   \n ']) {
    assert.equal(whatsAppMessage(blank, { name: 'Sari', link: LINK }), DEFAULT_WHATSAPP_MESSAGE.id.replace('{nama}', 'Sari').replace('{link}', LINK));
  }
  assert.equal(whatsAppMessage(undefined, { name: 'Sari', link: LINK }, 'en'), `Hi Sari, we would love to have you at our event. Your personal invitation: ${LINK}`);
});

test('B-018: the link is wa.me with the digits and the encoded message; an impossible number has none', () => {
  const action = guestWhatsApp({ phone: '0812-3456-7890', name: 'Sari & Budi #1 💐', link: LINK, template: 'Halo {nama}\nUndangan: {link}' });
  assert.ok('href' in action);
  const url = new URL(action.href);
  assert.equal(url.origin + url.pathname, 'https://wa.me/6281234567890');
  assert.equal(url.searchParams.get('text'), `Halo Sari & Budi #1 💐\nUndangan: ${LINK}`);
  assert.ok(!action.href.includes(' ') && !action.href.includes('#1'), 'everything after ?text= is encoded');
  assert.deepEqual(guestWhatsApp({ phone: '021 555 1234', name: 'Sari', link: LINK }), { hint: 'invalid' });
  assert.deepEqual(guestWhatsApp({ phone: null, name: 'Sari', link: LINK }), { hint: 'missing' });
});

test('B-018: a guest row shows the link, a visible hint for an impossible number, nothing for a missing one', () => {
  const render = (phone: string | null, en = false) =>
    renderToStaticMarkup(createElement(GuestWhatsAppAction, { action: guestWhatsApp({ phone, name: 'Sari', link: LINK }), en, className: 'wa', children: 'WhatsApp' }));
  assert.match(render('081234567890'), /^<a href="https:\/\/wa\.me\/6281234567890\?text=[^"]+" target="_blank" rel="noreferrer" class="wa">WhatsApp<\/a>$/);
  assert.match(render('12345'), />Nomor WhatsApp tidak valid</);
  assert.match(render('12345', true), />Invalid WhatsApp number</);
  assert.ok(!render('12345').includes('<a'), 'no link that would fail');
  assert.equal(render(null), '');
});

test('B-018: both guest lists use the one builder with the host\u2019s template and the personal link; no other builder remains', () => {
  for (const page of ['app/(customer)/dashboard/guests/page.tsx', 'app/(customer)/dashboard/invitations/[id]/guests/page.tsx']) {
    const code = source(page);
    assert.match(code, /guestWhatsApp\(\{/, `${page}: the builder`);
    assert.match(code, /whatsappTemplate/, `${page}: the host's template`);
    assert.match(code, /guestPath\([^)]*guestLinkSegment\(g(uest)?\)\)/, `${page}: the personal link (token or slug, B-011)`);
    assert.match(code, /<GuestWhatsAppAction /, `${page}: the shared action with its hint`);
  }
  const files = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : [],
    );
  const builders = ['app', 'components', 'lib'].flatMap(files).filter((path) => /wa\.me\/|api\.whatsapp\.com/.test(source(path)));
  // The landing page's fixed business contact is a constant, not a guest link (B-022 audits marketing copy).
  assert.deepEqual(builders.sort(), ['app/page.tsx', 'lib/invitation/whatsapp.ts']);
  assert.match(source('app/page.tsx'), /href="https:\/\/wa\.me\/\d+"/);
  assert.ok(!source('lib/invitation/public-url.ts').includes('toWhatsAppNumber'), 'the old normaliser is gone');
});
