// S22-K2 (s23r): corporate covers with a photo, a logo and a category kept the greeting below short desktop viewports.
// The four families now set the logo alone, the category and the cover headline on one eyebrow line, and event titles
// a step smaller than people's names; non-corporate pages and the legacy layout keep their markup.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const LOGO = 'https://cdn.contoh.test/logo-lebar.png';
const corporate = fixtureInvitation({ eventType: 'corporate' });
const events = [{ id: 'ev-1', title: 'Peluncuran', startAt: '2027-02-10T09:00:00+07:00', venueName: 'Balai Contoh' }];
const corp = (extra: Partial<NonNullable<DetailConfig['corporateProfile']>> = {}): DetailConfig => ({
  corporateProfile: { organizationName: 'PT Contoh Sinar', eventName: 'Peluncuran Layanan Contoh 2026', logoUrl: LOGO, eventCategory: 'product_launch', ...extra },
  theme: { cover: { headline: 'Undangan Resmi', imageUrl: 'https://cdn.contoh.test/cover.jpg' } },
  events,
});
const h1Class = (page: string) => /<h1 class="([^"]*)"/.exec(page)?.[1] ?? '';
const FAMILIES = LAYOUTS.filter((layout) => layout.familyId);

test('S22-K2: every family sets category and cover headline on one eyebrow line, with no separator glyph to orphan', () => {
  for (const { label, familyId } of FAMILIES) {
    const page = renderGuestPage({ config: withFamily(corp(), familyId), invitation: corporate, guest: fixtureGuest() });
    const eyebrow = /<p class="flex flex-wrap gap-x-4 gap-y-1[^"]*">(.*?)<\/p>/.exec(page)?.[1] ?? '';
    assert.match(eyebrow, /<span class="[^"]*">Peluncuran produk<\/span><span class="[^"]*">Undangan Resmi<\/span>/i, `${label}: ${eyebrow}`);
    assert.ok(!/[·•|]/.test(eyebrow), `${label}: no separator glyph`);
    assert.ok(page.indexOf(LOGO) < page.indexOf(eyebrow) && page.indexOf(eyebrow) < page.indexOf('<h1'), `${label}: logo, eyebrow, headline in order`);
    assert.ok(!/>Peluncuran produk<\/p>/i.test(page), `${label}: the category has no row of its own`);
  }
});

test('S22-K2: an event title is set a step smaller than people\u2019s names in every family; weddings keep their size', () => {
  const expected: Record<string, [string, string]> = {
    kartu: ['text-4xl', 'text-5xl'],
    gapura: ['text-3xl', 'text-4xl'],
    riang: ['text-4xl', 'text-5xl'],
    lontar: ['text-3xl', 'text-4xl'],
  };
  for (const { label, familyId } of FAMILIES) {
    const [eventSize, peopleSize] = expected[familyId!];
    const event = h1Class(renderGuestPage({ config: withFamily(corp(), familyId), invitation: corporate }));
    const plainCorporate = h1Class(renderGuestPage({ config: withFamily({ corporateProfile: { eventName: 'Rapat Tahunan Contoh' }, events }, familyId), invitation: corporate }));
    const wedding = h1Class(renderGuestPage({ config: withFamily({ couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, events }, familyId) }));
    assert.ok(event.includes(eventSize), `${label} corporate: ${event}`);
    assert.ok(plainCorporate.includes(eventSize), `${label} corporate without a mark: ${plainCorporate}`);
    assert.ok(wedding.includes(peopleSize) && !wedding.includes(eventSize.split(' ')[0] + ' '), `${label} wedding: ${wedding}`);
  }
});

test('S22-K2: Kartu puts the logo in the stamp\u2019s row; Gapura\u2019s logo replaces its diamond only when there is a logo', () => {
  const kartu = renderGuestPage({ config: withFamily(corp(), 'kartu'), invitation: corporate });
  const row = /<div class="flex items-start justify-between gap-4">(.*?)<\/div>/.exec(kartu)?.[1] ?? '';
  assert.ok(row.includes(LOGO) && /border-dashed/.test(row), 'logo and date stamp share the first row');
  const gapuraLogo = renderGuestPage({ config: withFamily(corp(), 'gapura'), invitation: corporate });
  const gapuraNoLogo = renderGuestPage({ config: withFamily(corp({ logoUrl: undefined }), 'gapura'), invitation: corporate });
  const diamond = (page: string) => (page.match(/rotate-45/g) ?? []).length;
  assert.ok(diamond(gapuraNoLogo) > diamond(gapuraLogo), 'the diamond returns without a logo');
});

test('S22-K2: non-corporate covers and the legacy layout keep their markup', () => {
  const wedding: DetailConfig = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, theme: { cover: { headline: 'The Wedding of' } }, events };
  for (const { label, familyId } of FAMILIES) {
    const page = renderGuestPage({ config: withFamily(wedding, familyId), guest: fixtureGuest() });
    assert.ok(!page.includes('flex flex-wrap gap-x-4 gap-y-1'), `${label}: no corporate eyebrow on a wedding`);
  }
  const kartuWedding = renderGuestPage({ config: withFamily(wedding, 'kartu') });
  assert.equal(h1Class(kartuWedding), 'mt-10 font-serif text-5xl leading-[1.05] [overflow-wrap:anywhere]');
  const legacy = renderGuestPage({ config: corp(), invitation: corporate });
  assert.ok(/>Peluncuran produk<\/p>/i.test(legacy) && !legacy.includes('flex flex-wrap gap-x-4 gap-y-1'), 'legacy keeps its category paragraph');
});
