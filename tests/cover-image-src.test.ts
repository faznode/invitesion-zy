// E-023 (s17): the cover photo goes through `safeImageSrc` like the organiser's logo. A stored cover keeps parsing as
// before (stored-value compatibility); the guest page requests only an upload path or an http(s) URL, and draws the
// photo chip only when it draws a photo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const UPLOAD = '/media/12/0123456789abcdef01234567.jpg';
const REMOTE = 'https://cdn.contoh.test/sampul.jpg';
const HOSTILE = ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'blob:https://x.test/1', 'file:///etc/passwd', 'ftp://x.test/sampul.jpg'];

// A past event: no countdown, so two renders of the same config are byte-identical, and Lontar shows its usual
// arrangement, the photo beside the date band (without a band it frames the photo on its own: E-032, S17-L1).
const cover = (imageUrl?: string): DetailConfig => ({
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  theme: { paletteId: 'ivory', cover: { headline: 'Pernikahan', ...(imageUrl ? { imageUrl } : {}) } },
  events: [{ title: 'Resepsi', startAt: '2020-03-10T19:00:00+08:00', venueName: 'Gedung Contoh' }],
});
const imgSources = (html: string) => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((match) => match[1]);

test('E-023: every layout draws an uploaded or http(s) cover from the value the host saved', () => {
  for (const { label, familyId } of LAYOUTS) {
    for (const value of [UPLOAD, REMOTE]) {
      const page = renderGuestPage({ config: withFamily(cover(value), familyId), guest: fixtureGuest() });
      assert.deepEqual(imgSources(page), [value], `${label}: ${value}`);
    }
  }
});

test('E-023: any other stored scheme renders exactly the page without a cover, in every layout', () => {
  for (const { label, familyId } of LAYOUTS) {
    const withoutCover = renderGuestPage({ config: withFamily(cover(), familyId), guest: fixtureGuest() });
    for (const value of HOSTILE) {
      const page = renderGuestPage({ config: withFamily(cover(value), familyId), guest: fixtureGuest() });
      assert.equal(page, withoutCover, `${label}: ${value.split(':')[0]}`);
      assert.ok(!page.includes(value), `${label}: the stored value never reaches the markup`);
    }
  }
});

test('E-023: the photo chip follows the drawn photo, not the stored value (legacy lays text over it)', () => {
  const chip = /class="[^"]*\bw-fit rounded-2xl\b[^"]*"[^>]*>Pernikahan</;
  assert.ok(chip.test(renderGuestPage({ config: cover(UPLOAD), guest: fixtureGuest() })), 'legacy: chip over a photo');
  assert.ok(!chip.test(renderGuestPage({ config: cover('javascript:alert(1)'), guest: fixtureGuest() })), 'legacy: no photo, no chip');
  // Gapura frames the photo above its text since the s17 revision (S16-X1): the frame follows the drawn photo, and no
  // cover text meets the photo, so none needs a chip.
  const framed = renderGuestPage({ config: withFamily(cover(UPLOAD), 'gapura'), guest: fixtureGuest() });
  assert.ok(/<img src="[^"]*"[^>]*\baspect-\[4\/3\][^"]*\bobject-cover\b/.test(framed) && framed.includes(`<img src="${UPLOAD}"`), 'gapura: the photo in its frame');
  assert.ok(!chip.test(framed), 'gapura: no chip');
});

test('E-032 (S17-L1): a saved cover is drawn without date, time or venue in every layout; Lontar frames it on its own', () => {
  const bare = (events?: DetailConfig['events']): DetailConfig => ({
    couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
    theme: { paletteId: 'ivory', cover: { headline: 'Pernikahan', imageUrl: UPLOAD } },
    ...(events ? { events } : {}),
  });
  for (const [what, config] of [['no events', bare()], ['an event with a title only', bare([{ title: 'Resepsi' }])]] as const) {
    for (const { label, familyId } of LAYOUTS) {
      const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
      assert.deepEqual(imgSources(page), [UPLOAD], `${label}, ${what}: the saved photo is drawn`);
    }
  }
  const header = (html: string) => html.slice(0, html.indexOf('</header>'));
  const alone = header(renderGuestPage({ config: withFamily(bare(), 'lontar'), guest: fixtureGuest() }));
  assert.match(alone, /<img src="[^"]*"[^>]*\baspect-\[4\/3\]/, 'lontar: the lone photo keeps its 4:3 frame');
  assert.doesNotMatch(alone, /sm:grid-cols-\[1fr_13rem\]/, 'lontar: no empty band column beside the photo');
  assert.doesNotMatch(alone, /sm:h-full/, 'lontar: no height borrowed from a band that is not there');
  assert.doesNotMatch(alone, /top-5 block/, 'lontar: no binding cord without the band');
  // Bounded by width, never by a max-w-* utility, which app/globals.css's unlayered `img { max-width: 100% }` overrides.
  assert.match(alone, /<img src="[^"]*"[^>]*\bsm:w-96\b/, 'lontar: the lone photo is at most 24 rem wide from 640 px');
  assert.doesNotMatch(alone.match(/<img [^>]*>/)?.[0] ?? '', /max-w-/, 'lontar: no max-w-* utility on the photo');
  const beside = header(renderGuestPage({ config: withFamily(cover(UPLOAD), 'lontar'), guest: fixtureGuest() }));
  assert.match(beside, /sm:grid-cols-\[1fr_13rem\]/, 'lontar: with a band, the photo stays beside it as before');
  assert.match(beside, /<img src="[^"]*"[^>]*\bsm:h-full\b/, 'lontar: beside the band, the photo takes the band height as before');
});

test('E-023: stored covers keep parsing, so the lenient read never drops the theme for an old value', () => {
  for (const value of [UPLOAD, REMOTE, ...HOSTILE]) {
    assert.ok(detailConfigSchema.safeParse(cover(value)).success, value);
    const { config, dropped } = normalizeStoredConfig(withFamily(cover(value), 'kartu'));
    assert.deepEqual(dropped, [], value);
    assert.equal(config.theme?.familyId, 'kartu', `${value}: family kept`);
    assert.equal(config.theme?.cover?.imageUrl, value, `${value}: stored value unchanged`);
  }
});
