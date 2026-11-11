// S23r-P1 (s24): at 360 × 800 corporate covers kept the guest's greeting below the first viewport on Riang, Lontar and
// (with a long name) Gapura. Riang keeps the facts beside the date card on phones, Lontar greets the guest before the
// photo on phones, and Gapura's corporate gate takes the desktop's top space and a tighter window rhythm on phones.
// Desktop classes, photo boxes and every non-corporate cover keep their markup.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, fixtureInvitation, renderGuestPage, withFamily } from './support/render-guest-page';

const COVER = 'https://cdn.contoh.test/cover.jpg';
const corporate = fixtureInvitation({ eventType: 'corporate' });
const events = [{ id: 'ev-1', title: 'Peluncuran', startAt: '2027-02-10T09:00:00+07:00', venueName: 'Balai Contoh' }];
// `null` means "no cover"; `undefined` would fall back to the default and put the cover back.
const corp = (cover: string | null = COVER): DetailConfig => ({
  corporateProfile: { organizationName: 'PT Contoh Sinar', eventName: 'Peluncuran Layanan Contoh 2026', logoUrl: 'https://cdn.contoh.test/logo.png', eventCategory: 'product_launch' },
  theme: { cover: { headline: 'Undangan Resmi', imageUrl: cover ?? undefined } },
  events,
});
const wedding: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  theme: { cover: { headline: 'The Wedding of', imageUrl: COVER } },
  events,
};
const header = (page: string) => /<header[\s\S]*?<\/header>/.exec(page)?.[0] ?? '';
const classOf = (html: string, pattern: RegExp) => pattern.exec(html)?.[1] ?? '';

test('S23r-P1: Riang keeps a corporate cover\u2019s facts beside the date card on phones; other covers keep the stacked list', () => {
  const facts = (config: DetailConfig, invitation = corporate) =>
    classOf(header(renderGuestPage({ config: withFamily(config, 'riang'), invitation, guest: fixtureGuest() })), /<ul class="([^"]*)"/);
  const corporateFacts = facts(corp());
  for (const cls of ['flex-1', 'min-w-0', 'items-start', 'text-left', '[overflow-wrap:anywhere]', 'sm:flex-initial', 'max-w-60']) {
    assert.ok(corporateFacts.split(' ').includes(cls), `corporate facts list has ${cls}: ${corporateFacts}`);
  }
  assert.ok(!corporateFacts.includes('items-center'), 'corporate facts are not centred under the card');
  assert.equal(facts(wedding, fixtureInvitation()), 'flex max-w-60 flex-col items-center gap-2 text-center text-sm sm:items-start sm:text-left');
});

test('S23r-P1: Lontar greets the guest before the photo on a corporate cover with a band; the photo box keeps its size', () => {
  const h = header(renderGuestPage({ config: withFamily(corp(), 'lontar'), invitation: corporate, guest: fixtureGuest() }));
  const band = h.indexOf('pt-11');
  const greeting = h.indexOf('Kepada Yth.');
  const photo = h.indexOf(`src="${COVER}"`);
  assert.ok(band > 0 && band < greeting && greeting < photo, `band ${band} < greeting ${greeting} < photo ${photo}`);
  assert.match(h, /sm:grid-cols-\[1fr_13rem\]/, 'from 640 px the photo stays beside the band');
  assert.match(h, /<div class="mt-4 sm:col-span-2 sm:row-start-2">/, 'from 640 px the greeting spans both columns below them');
  const img = classOf(h, new RegExp(`<img src="${COVER.replace(/[.]/g, '\\.')}"[^>]*class="([^"]*)"`));
  for (const cls of ['aspect-[4/3]', 'w-full', 'sm:aspect-auto', 'sm:h-full', 'sm:col-start-2', 'sm:row-start-1']) {
    assert.ok(img.split(' ').includes(cls), `photo has ${cls}: ${img}`);
  }
});

test('S23r-P1: Lontar keeps the greeting after the photo on weddings, and in its old place without a guest, photo or band', () => {
  const weddingHeader = header(renderGuestPage({ config: withFamily(wedding, 'lontar'), guest: fixtureGuest() }));
  assert.ok(weddingHeader.indexOf(`src="${COVER}"`) < weddingHeader.indexOf('Kepada Yth.'), 'wedding: photo, then greeting');
  assert.match(weddingHeader, /<div class="mt-10"><p class="[^"]*">Kepada Yth\.<\/p>/);
  assert.doesNotMatch(weddingHeader, /sm:col-start|sm:row-start/, 'wedding: no grid placement classes');

  const publicPage = header(renderGuestPage({ config: withFamily(corp(), 'lontar'), invitation: corporate }));
  assert.ok(!publicPage.includes('Kepada Yth.') && publicPage.includes(`src="${COVER}"`), 'public page: photo, no greeting');
  assert.doesNotMatch(publicPage, /sm:col-start|sm:row-start/, 'public page: band and photo placed as before');

  const noPhoto = header(renderGuestPage({ config: withFamily(corp(null), 'lontar'), invitation: corporate, guest: fixtureGuest() }));
  assert.ok(!noPhoto.includes(`src="${COVER}"`), 'no photo: the fixture really has no cover');
  assert.match(noPhoto, /<div class="mt-8"><p class="[^"]*">Kepada Yth\.<\/p>/, 'no photo: the greeting follows the band as before');
});

test('S23r-P1: Gapura\u2019s corporate gate takes the desktop top space and a tighter window rhythm on phones only', () => {
  const page = renderGuestPage({ config: withFamily(corp(), 'gapura'), invitation: corporate, guest: fixtureGuest() });
  const headerClass = classOf(page, /<header\b[^>]*\bclass="([^"]*)"/).split(' ');
  assert.ok(headerClass.includes('pt-10') && !headerClass.includes('pt-14') && headerClass.includes('sm:pt-10'), headerClass.join(' '));
  assert.match(page, /rounded-t-full border [^"]*pb-10 sm:pb-12/, 'window bottom space: 40 px on phones, 48 px from 640 px');
  assert.match(page, /<div class="flex flex-col items-center px-6 pt-6 sm:pt-8">/, 'photo to logo: 24 px on phones, 32 px from 640 px');
  assert.match(page, /<p class="inv-rise mt-6 sm:mt-8 text-sm tracking-wide/, 'organiser to date: 24 px on phones, 32 px from 640 px');

  const weddingPage = renderGuestPage({ config: withFamily(wedding, 'gapura'), guest: fixtureGuest() });
  assert.equal(classOf(weddingPage, /<header\b[^>]*\bclass="([^"]*)"/), 'flex flex-col items-center justify-center px-5 pt-14 text-center sm:min-h-[90vh] sm:pb-14 sm:pt-10');
  assert.match(weddingPage, /<div class="flex flex-col items-center px-6 pt-8">/);
  assert.match(weddingPage, /<p class="inv-rise mt-8 text-sm tracking-wide/);
});
