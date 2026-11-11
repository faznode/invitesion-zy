// S21-K1 (s22): Kartu's cover photo is bounded by the viewport from 640 px so the guest name stays in the first
// viewport of a 1024 × 768, 1280 × 800 or 1366 × 768 screen; phones keep the full 4:3 photo. Fictional data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, renderGuestPage, withFamily } from './support/render-guest-page';

const config: DetailConfig = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  theme: { cover: { headline: 'Pernikahan', imageUrl: 'https://example.test/cover.jpg' } },
  events: [{ title: 'Resepsi', startAt: '2027-01-05T19:00:00+08:00', venueName: 'Aula Contoh' }],
};

const headerImages = (html: string) => {
  const header = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
  return [...header.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
};

test('S21-K1: from 640 px Kartu keeps the 4:3 photo but caps it at the viewport minus the cover text, never below 11rem', () => {
  const [img, ...rest] = headerImages(renderGuestPage({ config: withFamily(config, 'kartu'), guest: fixtureGuest() }));
  assert.ok(img, 'the cover photo renders in the header');
  assert.equal(rest.length, 0, 'one image in the header');
  const classes = (/class="([^"]*)"/.exec(img)?.[1] ?? '').split(/\s+/);
  for (const name of ['aspect-[4/3]', 'w-full', 'object-cover', 'sm:max-h-[max(11rem,calc(100svh_-_37rem))]']) {
    assert.ok(classes.includes(name), `${name} in ${classes.join(' ')}`);
  }
  assert.equal(classes.includes('sm:aspect-auto'), false, 'the ratio stays 4:3 when the viewport leaves room');
  assert.equal(classes.some((name) => /^(?:max-h|h)-/.test(name)), false, 'no height bound below 640 px (S17-G1 at 360 × 800)');
  assert.match(img, /alt=""/, 'the cover photo is decorative');
});

test('S21-K1: without a cover photo Kartu renders no header image', () => {
  const plain = withFamily({ ...config, theme: { cover: { headline: 'Pernikahan' } } }, 'kartu');
  assert.equal(headerImages(renderGuestPage({ config: plain, guest: fixtureGuest() })).length, 0);
});
