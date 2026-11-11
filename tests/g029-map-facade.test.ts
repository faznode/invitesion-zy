// G-029: the event map behind a facade. The design families keep the host's static location link and add a button; the
// map frame exists only after the guest presses it, so no map request leaves the page before then. The legacy layout is
// frozen (D-041); the flag off is the byte-exact rollback. Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, renderGuestPage, withFamily, withoutMapFacade } from './support/render-guest-page';
import { isFlagOn } from '../lib/flags';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { GUEST_COPY } from '../lib/invitation/guest-copy';
import { MAP_EMBED_ORIGIN, mapCoordinates, mapEmbedUrl, mapFacadeOf } from '../lib/invitation/map-embed';
import { contentSecurityPolicy } from '../lib/security/csp';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ON = { FLAG_GUEST_MAP: 'on' };
const OFF = { FLAG_GUEST_MAP: 'off' };
const FACADE_ROW = /<div data-map-facade="" class="mt-3 w-full"><\/div>/g;
const MAP_LINK = 'https://maps.app.goo.gl/fiktif123';

const located = {
  title: 'Resepsi',
  startAt: '2027-01-10T11:00:00+08:00',
  venueName: 'Gedung Serbaguna Melati (fiktif)',
  address: 'Jl. Kenanga No. 7, Makassar',
  mapUrl: MAP_LINK,
};
const wedding = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [located],
  theme: { paletteId: 'sage', familyId: 'gapura' },
} as DetailConfig;
const invitation = fixtureInvitation({ slug: 'laras-dimas', eventType: 'wedding' });
const guest = fixtureGuest({ name: 'Ibu Sri (fiktif)', slug: 'ibu-sri' });
const count = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].length;

function atOneInstant<T>(body: () => T): T {
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-11T06:00:00Z');
  try {
    return body();
  } finally {
    Date.now = realNow;
  }
}

function withFlag<T>(value: string | undefined, render: () => T): T {
  const before = process.env.FLAG_GUEST_MAP;
  if (value === undefined) delete process.env.FLAG_GUEST_MAP;
  else process.env.FLAG_GUEST_MAP = value;
  try {
    return render();
  } finally {
    if (before === undefined) delete process.env.FLAG_GUEST_MAP;
    else process.env.FLAG_GUEST_MAP = before;
  }
}

test('G-029: the map facade is on by default and FLAG_GUEST_MAP=off turns it off', () => {
  assert.equal(isFlagOn('GUEST_MAP', {}), true);
  assert.equal(isFlagOn('GUEST_MAP', OFF), false);
});

test('G-029: the coordinates a shared map link names are read; a short link names none', () => {
  assert.deepEqual(mapCoordinates('https://www.google.com/maps/place/Gedung/@-5.1477,119.4327,17z'), [-5.1477, 119.4327]);
  assert.deepEqual(mapCoordinates('https://maps.google.com/?q=-6.2088,106.8456'), [-6.2088, 106.8456]);
  assert.deepEqual(mapCoordinates('https://www.google.com/maps?ll=-7.25,112.75&z=15'), [-7.25, 112.75]);
  assert.deepEqual(mapCoordinates('https://www.google.com/maps/place/X/data=!3d-8.65!4d115.2167'), [-8.65, 115.2167]);
  assert.deepEqual(mapCoordinates('https://maps.google.com/?q=-6.2%2C106.8'), [-6.2, 106.8], 'an escaped comma');
  assert.equal(mapCoordinates(MAP_LINK), null);
  assert.equal(mapCoordinates('https://maps.google.com/?q=95.1,10.2'), null, 'latitude out of range');
  assert.equal(mapCoordinates(undefined), null);
});

test('G-029: the embed uses the link coordinates, else the venue and its address; a venue name alone gives no map', () => {
  assert.equal(
    mapEmbedUrl({ mapUrl: 'https://www.google.com/maps/@-5.1477,119.4327,17z', venueName: 'X' }, 'id'),
    `${MAP_EMBED_ORIGIN}/maps?q=-5.1477%2C119.4327&hl=id&z=16&output=embed`,
  );
  assert.equal(
    mapEmbedUrl(located, 'en'),
    `${MAP_EMBED_ORIGIN}/maps?q=${encodeURIComponent('Gedung Serbaguna Melati (fiktif), Jl. Kenanga No. 7, Makassar')}&hl=en&z=16&output=embed`,
  );
  assert.equal(mapEmbedUrl({ mapUrl: MAP_LINK, venueName: 'Gedung Serbaguna' }, 'id'), null, 'could match another place');
  assert.equal(mapEmbedUrl({ address: '   ' }, 'id'), null);
  assert.equal(MAP_EMBED_ORIGIN, 'https://www.google.com');
});

test('G-029: one rule, the flag and a host location link: the facade sits beside the link, never instead of it', () => {
  assert.ok(mapFacadeOf(located, 'id', ON));
  assert.equal(mapFacadeOf(located, 'id', OFF), null);
  assert.equal(mapFacadeOf({ ...located, mapUrl: undefined }, 'id', ON), null, 'no static link, no map');
});

test('G-029: every family keeps the static link and adds the facade row, with no map frame or map request in the page', () => {
  for (const familyId of FAMILY_IDS) {
    for (const pageGuest of [null, guest]) {
      const html = renderGuestPage({ config: withFamily(wedding, familyId), invitation, guest: pageGuest });
      const label = `${familyId} ${pageGuest ? 'personal' : 'shared'}`;
      assert.ok(html.includes(`href="${MAP_LINK}"`), `${label}: the static link stays`);
      assert.ok(html.includes(GUEST_COPY.id.seeLocation), `${label}: with its label`);
      assert.equal(count(html, FACADE_ROW), 1, `${label}: one facade row`);
      assert.ok(!html.includes('<iframe'), `${label}: no frame before the tap`);
      assert.ok(!html.includes(MAP_EMBED_ORIGIN), `${label}: no map address in the server markup`);
    }
  }
});

test('G-029: the flag off and an event without a mappable location render the static link exactly as before', () => {
  atOneInstant(() => {
    for (const familyId of FAMILY_IDS) {
      const config = withFamily(wedding, familyId);
      const base = renderGuestPage({ config, invitation, guest });
      const off = withFlag('off', () => renderGuestPage({ config, invitation, guest }));
      assert.equal(count(off, FACADE_ROW), 0, familyId);
      assert.equal(off, withoutMapFacade(base), `${familyId}: byte-exact rollback`);
      const venueOnly = { ...config, events: [{ ...located, address: undefined }] } as DetailConfig;
      assert.equal(count(renderGuestPage({ config: venueOnly, invitation, guest }), FACADE_ROW), 0, `${familyId}: venue name alone`);
    }
  });
});

test('G-029: the legacy layout is frozen (D-041): its static link only', () => {
  atOneInstant(() => {
    const config = withFamily(wedding, undefined);
    const html = renderGuestPage({ config, invitation, guest });
    assert.ok(html.includes(`href="${MAP_LINK}"`));
    assert.equal(count(html, FACADE_ROW), 0);
    assert.equal(withFlag('off', () => renderGuestPage({ config, invitation, guest })), html);
  });
});

test('G-029: the island is a disclosure; the frame exists only while open, sandboxed, titled and in the page language', () => {
  const island = source('components/invitation/map-facade.tsx');
  assert.match(island, /^'use client';/);
  assert.match(island, /type="button"/);
  assert.match(island, /aria-expanded=\{open\}/);
  assert.match(island, /aria-controls=\{frameId\}/);
  assert.match(island, /min-h-11/, '44 px target');
  assert.match(island, /\{open && \(\s*<iframe/, 'created on the tap, removed when hidden');
  assert.match(island, /title=\{title\}/);
  assert.match(island, /sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(island, /referrerPolicy="strict-origin-when-cross-origin"/);
  assert.deepEqual(GUEST_COPY.id.map, { show: 'Tampilkan peta', hide: 'Sembunyikan peta', frame: 'Peta lokasi' });
  assert.deepEqual(GUEST_COPY.en.map, { show: 'Show map', hide: 'Hide map', frame: 'Map of the venue' });
  const blocks = source('components/invitation/guest-blocks.tsx');
  assert.match(blocks, /const facade = mapFacadeOf\(event, view\.language\);\s*if \(!facade\) return link;/);
  for (const path of ['public-renderer.tsx']) assert.doesNotMatch(source(`components/invitation/${path}`), /MapBlock/, 'legacy keeps MapLink');
});

test('G-029: the CSP frames exactly the one map host the embed builder uses', () => {
  const policy = contentSecurityPolicy({ nonce: 'n', pathname: '/i/laras-dimas', disposition: 'enforce', secure: true });
  const frameSrc = policy.split('; ').find((directive) => directive.startsWith('frame-src'));
  assert.ok(frameSrc?.split(' ').includes(MAP_EMBED_ORIGIN), frameSrc);
  assert.ok(!frameSrc?.includes('*.google.com'), 'one host, no wildcard');
});
