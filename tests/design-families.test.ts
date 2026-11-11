import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { eventDateParts, formatEventDate } from '../lib/invitation/event-time';
import { FAMILIES, FAMILY_IDS, familyOf } from '../lib/invitation/families';
import { FAMILY_MANIFESTS } from '../lib/invitation/family-manifest';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
const familyFiles = readdirSync(join(process.cwd(), 'components/invitation/families')).sort();

test('B-030: four registered families, two designed for non-wedding events, each with its own layout file', () => {
  assert.deepEqual([...FAMILY_IDS], ['gapura', 'kartu', 'riang', 'lontar']);
  assert.ok(Object.values(FAMILIES).some((family) => family.intendedFor === 'celebration'));
  assert.ok(Object.values(FAMILIES).some((family) => family.intendedFor === 'formal'));
  assert.deepEqual(familyFiles, FAMILY_IDS.map((id) => `${id}.tsx`).sort());
  const renderer = source('components/invitation/public-renderer.tsx');
  for (const id of FAMILY_IDS) assert.match(renderer, new RegExp(`\\b${id}: [A-Z][a-z]+Layout\\b`), id);
});

test('B-030 Lontar: the programme leads, the leaf band carries date, time and venue, and its ornament is hidden', () => {
  const config: DetailConfig = {
    corporateProfile: { organizationName: 'PT Contoh', eventName: 'Rapat Tahunan', agenda: [{ time: '09.00 WITA', title: 'Pembukaan' }] },
    events: [{ title: 'Rapat Tahunan', startAt: '2099-12-27T09:00:00+08:00', endAt: '2099-12-27T12:00:00+08:00', venueName: 'Aula Contoh' }],
  };
  const page = renderGuestPage({ config: withFamily(config, 'lontar'), invitation: fixtureInvitation({ eventType: 'corporate' }), guest: fixtureGuest() });
  const cover = page.slice(0, page.indexOf('</header>'));
  const date = formatEventDate('2099-12-27T09:00:00+08:00') ?? 'missing';
  for (const text of ['09.00 WITA', 'sampai 12.00 WITA', 'Aula Contoh', date]) assert.ok(cover.includes(text), `cover band: ${text}`);
  assert.ok(page.indexOf('Susunan Acara') < page.indexOf('Waktu &amp; Tempat'), 'the agenda comes before the events section');
  assert.ok(page.indexOf('Waktu &amp; Tempat') < page.indexOf('Konfirmasi Kehadiran'), 'events, then RSVP');
  assert.doesNotMatch(cover, /<span class="absolute inset-x-0 top-5 block"/, 'the binding is not exposed to assistive technology');
  assert.match(cover, /<span aria-hidden="true" class="absolute inset-x-0 top-5 block"/, 'the binding is decorative');
});

test('B-030: a missing or unknown family keeps the legacy layout', () => {
  assert.equal(familyOf(undefined), null);
  assert.equal(familyOf(''), null);
  assert.equal(familyOf('retired-family'), null);
  assert.equal(familyOf('gapura')?.name, 'Gapura');
  assert.match(source('components/invitation/public-renderer.tsx'), /family \? FAMILY_LAYOUTS\[family\.id\] : LegacyLayout/);
  // A stored id whose family was retired (read past the schema, e.g. an older row) renders exactly the legacy page.
  const past: DetailConfig = { couple, events: [{ title: 'Resepsi', startAt: '2020-12-27T19:00:00+08:00' }] };
  const legacy = renderGuestPage({ config: withFamily(past), guest: fixtureGuest() });
  assert.equal(renderGuestPage({ config: withFamily(past, 'retired-family'), guest: fixtureGuest() }), legacy);
  assert.notEqual(renderGuestPage({ config: withFamily(past, 'gapura'), guest: fixtureGuest() }), legacy);
});

test('B-030: only known families are stored, and a retired id never drops the rest of the theme', () => {
  assert.equal(detailConfigSchema.parse({ theme: { paletteId: 'sage', familyId: 'kartu' } }).theme?.familyId, 'kartu');
  assert.equal(detailConfigSchema.parse({ theme: { paletteId: 'sage', familyId: 'not-a-family' } }).theme?.familyId, undefined);
  const stored = normalizeStoredConfig({ theme: { paletteId: 'midnight', familyId: 'retired', cover: { headline: 'Walimah' } } });
  assert.deepEqual(stored.dropped, []);
  assert.equal(stored.config.theme?.paletteId, 'midnight');
  assert.equal(stored.config.theme?.cover?.headline, 'Walimah');
  assert.equal(stored.config.theme?.familyId, undefined);
  assert.ok((RENDER_CAPABILITIES.theme.rendered as readonly string[]).includes('familyId'));
});

test('B-030: every family composes every guest-facing section of the legacy page', () => {
  const sections: [string, RegExp][] = [
    ['names (couple, honouree or event)', /\bnames\b/],
    ['settings.title fallback', /settings\?\.title/],
    ['settings.openingCopy', /settings\?\.openingCopy/],
    // E-023: families draw the cover from the view's guarded source, never from the stored value.
    ['theme.cover.imageUrl', /\bview\.coverImageSrc\b/],
    ['theme.cover.headline', /cover\?\.headline/],
    ['greetings.prayer', /greetings\?\.prayer/],
    ['quote.text', /quote\.text/],
    ['quote.author', /quote\.author/],
    ['events', /<EventFacts\b/],
    ['events.note', /event\.note/],
    // G-029: the families compose the static link through `MapBlock`, which renders `MapLink` and then the map facade.
    ['events.mapUrl', /<MapBlock\b/],
    ['countdown', /<Countdown\b/],
    ['calendar links', /<CalendarLinks\b/],
    ['story items', /story\.items/],
    // B-025: each family composes the gallery through the shared block (layouts, lightbox, video facades).
    ['gallery', /<GalleryBody\b/],
    ['streaming.url', /streaming\.url/],
    ['gift accounts', /account\.number/],
    ['rsvp', /<RsvpBlock\b/],
    ['guestbook', /<GuestbookBlock\b/],
    ['guestbook.heading', /guestbook\?\.heading/],
    ['guestbook.prompt', /guestbook\?\.prompt/],
    ['read-only notice', /<ReadOnlyNotice\b/],
    ['guest name', /guest\.name/],
  ];
  for (const file of familyFiles) {
    const text = source(`components/invitation/families/${file}`);
    assert.deepEqual(sections.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label), [], file);
  }
});

test('B-030: names typed by hosts are isolated for bidirectional text and wrap instead of overflowing', () => {
  for (const file of familyFiles) {
    const text = source(`components/invitation/families/${file}`);
    assert.match(text, /dir="auto"|<bdi/, `${file}: names need dir="auto" or <bdi>`);
    assert.match(text, /\[overflow-wrap:anywhere\]/, `${file}: long names must wrap`);
  }
  const hostile = '<img src=x onerror=alert(1)>';
  const config: DetailConfig = { couple: { bride: { nickName: `ليلى 🎉 ${hostile}` }, groom: { nickName: 'Budi' } } };
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest({ name: `${hostile} Tamu` }) });
    assert.equal(page.includes('<img src=x'), false, `${label}: host and guest text is never markup`);
    assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt; Tamu'), `${label}: the guest name is shown as text`);
    // The legacy layout keeps its pre-B-030 markup verbatim (no isolation); only families promise it.
    if (familyId) assert.match(page, /(dir="auto"[^>]*>|<bdi[^>]*>)ليلى 🎉/, `${label}: the RTL name is isolated`);
  }
});

test('B-030: declared motion tier matches the markup, and reduced motion switches the entrance off', () => {
  assert.match(source('app/globals.css'), /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.inv-rise\s*\{\s*animation: none;/);
  for (const id of FAMILY_IDS) {
    // The entrance class comes only from the manifest's tier (`motionClasses`), never typed into a layout's code.
    const code = source(`components/invitation/families/${id}.tsx`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.equal(code.includes('inv-rise'), false, `${id}: no hard-coded entrance class`);
  }
  const config: DetailConfig = { couple, theme: { cover: { headline: 'The Wedding of' } }, events: [{ title: 'Resepsi', startAt: '2099-12-27T19:00:00+08:00' }] };
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    assert.equal(page.includes('inv-rise'), familyId ? FAMILY_MANIFESTS[familyId].motionTier > 0 : false, `${label}: rendered motion matches the declared tier`);
    assert.doesNotMatch(page, /<h1[^>]*\binv-rise\b/, `${label}: the names paint without an entrance animation`);
  }
});

test('B-030: date tiles use the event zone, not the server zone', () => {
  assert.deepEqual(eventDateParts('2026-12-27T19:00:00+08:00'), { weekday: 'Minggu', day: '27', month: 'Desember', monthShort: 'Des', year: '2026' });
  assert.equal(eventDateParts('2026-12-31T23:30:00+07:00')?.day, '31', '23:30 WIB on the 31st stays the 31st');
  assert.equal(eventDateParts('not a date'), null);
});

test('S16-X2 (s17): Gapura\'s cover is full-height only from 640 px, so on a phone the first section follows its content', () => {
  const page = renderGuestPage({ config: withFamily({ couple, settings: { openingCopy: 'Pembuka' } }, 'gapura'), guest: fixtureGuest() });
  const header = /<header\b[^>]*\bclass="([^"]*)"/.exec(page)?.[1] ?? '';
  const classes = header.split(/\s+/);
  assert.ok(classes.includes('sm:min-h-[90vh]') && classes.includes('sm:pb-14'), header);
  assert.equal(classes.some((name) => /^(?:min-h-|pb-|py-)/.test(name)), false, `no phone-width minimum height or bottom padding: ${header}`);
  const legacy = /<header class="([^"]*)"/.exec(renderGuestPage({ config: { couple }, guest: fixtureGuest() }))?.[1] ?? '';
  assert.match(legacy, /(?:^|\s)min-h-\[80vh\](?:\s|$)/, 'legacy stays verbatim (the review revises Gapura only)');
});

test('S17-G1 (s17): Gapura\'s photo window is 4:3 on a phone and square from 640 px, so the guest greeting stays in the first viewport', () => {
  const cover = { headline: 'Pernikahan', imageUrl: 'https://example.test/cover.jpg' };
  const page = renderGuestPage({ config: withFamily({ couple, theme: { cover } }, 'gapura'), guest: fixtureGuest() });
  const classes = (/<img src="https:\/\/example\.test\/cover\.jpg"[^>]*\bclass="([^"]*)"/.exec(page)?.[1] ?? '').split(/\s+/);
  // S18-G2 (s20): from 640 px the window takes the height the viewport leaves after a two-line guest name (up to the former
  // square), not a fixed square; measured in the browser at 1024 × 768 to 1920 × 1080 with one- and two-line names.
  assert.ok(classes.includes('aspect-[4/3]') && classes.includes('sm:aspect-auto') && classes.includes('sm:h-[clamp(11rem,calc(100svh_-_36.5rem),22.75rem)]'), classes.join(' '));
  assert.equal(classes.includes('aspect-square'), false, `no square window below 640 px: ${classes.join(' ')}`);
  assert.ok(page.indexOf('src="https://example.test/cover.jpg"') < page.indexOf('>Pernikahan<'), 'still framed above the cover text (S16-X1)');
});
