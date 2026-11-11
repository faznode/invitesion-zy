// B-030 (U7 step 1): the family manifest is the section contract. Each family declares its sections, order rules,
// event types, photo slots, logo frame, motion tier, music, palettes, byte budget and provenance; the layout composes
// its sections in the manifest's order (`composeSections`), a section it does not draw comes from the shared fallback,
// and the entrance class comes from the manifest's tier. Rendered markers (`data-section`) prove the order on the
// review fixtures the product gates use, through three distinct compositions including non-wedding pages.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixtureGuest, fixtureInvitation, renderGuestPage, withFamily, withoutSectionMarkers } from './support/render-guest-page';
import { familyReviewInvitations } from '../invitation-research/_tools/setup/seed-family-review';
import { defaultFamilyFor, FAMILY_IDS, type FamilyId } from '../lib/invitation/families';
import {
  composedSectionOrder,
  CONTRACT_ORDER_RULES,
  FAMILY_MANIFESTS,
  MOTION_TIERS,
  motionClasses,
  SECTION_IDS,
  validateFamilyManifest,
  type FamilyManifest,
  type SectionId,
} from '../lib/invitation/family-manifest';
import { paletteIds } from '../lib/invitation/palettes';
import { FAMILY_BUDGET_BASIS, MAX_FONT_FAMILIES, PRODUCT_PAGE_BUDGETS } from '../tools/template-harness/policy';
import type { DetailConfig } from '../lib/invitation/detail-config';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const layoutSource = (id: FamilyId) => source(`components/invitation/families/${id}.tsx`);
/** The sections a page rendered, in order; a repeated id (several programme sections) counts once. */
const markers = (html: string) => [...html.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1] as SectionId).filter((id, index, all) => id !== all[index - 1]);
const reviewRows = familyReviewInvitations({ programme: true, newInvitations: true, questions: true, portraits: true, ceremony: true, profiles: true, markVariants: true });
const review = (slug: string) => {
  const row = reviewRows.find((candidate) => candidate.slug === slug);
  assert.ok(row, `review fixture ${slug}`);
  return row;
};
const renderRow = (slug: string) => {
  const row = review(slug);
  return renderGuestPage({ config: row.config, invitation: fixtureInvitation({ slug: row.slug, eventType: row.eventType }), guest: fixtureGuest(), readOnly: row.expired });
};
const before = (order: SectionId[], first: SectionId, then: SectionId) => order.indexOf(first) >= 0 && order.indexOf(first) < order.indexOf(then);

test('B-030: every family has a valid manifest, keyed by its own id', () => {
  assert.deepEqual(Object.keys(FAMILY_MANIFESTS).sort(), [...FAMILY_IDS].sort());
  for (const id of FAMILY_IDS) {
    assert.equal(FAMILY_MANIFESTS[id].family, id);
    assert.deepEqual(validateFamilyManifest(FAMILY_MANIFESTS[id]), [], id);
  }
});

test('B-030: the validator refuses broken manifests', () => {
  const base = FAMILY_MANIFESTS.gapura;
  const broken = (change: Partial<FamilyManifest>) => validateFamilyManifest({ ...base, ...change });
  assert.ok(broken({ sections: base.sections.filter((id) => id !== 'footer') }).includes('the footer comes last'));
  assert.ok(broken({ sections: ['notices', 'cover', ...base.sections.slice(2)] }).includes('the cover comes first'));
  assert.ok(broken({ sections: [...base.sections.slice(0, 2), 'rsvp', ...base.sections.slice(2).filter((id) => id !== 'rsvp')] }).some((problem) => problem === 'events must come before rsvp'));
  assert.ok(broken({ sections: [...base.sections.slice(0, -1), 'quote', 'footer'] }).includes('section quote is declared twice'));
  assert.ok(broken({ motionTier: 2 as never }).includes('motion tier 2 does not exist'));
  assert.ok(broken({ eventTypes: ['wedding'] }).some((problem) => problem.startsWith('event type birthday')));
  assert.ok(broken({ orderRules: [['events', 'greeting']] }).includes('events must come before greeting'), 'a family rule its own order breaks');
  assert.ok(broken({ coverIncludes: ['footer'] }).includes('the cover cannot include footer'));
  assert.ok(broken({ provenance: { ...base.provenance, fonts: ['font-serif', 'font-sans', 'font-serif'] as never } }).includes('more than two font families'));
});

test('B-030: every family renders every event type, and the manifest keeps the recorded default for new invitations (F-02)', () => {
  const { EVENT_TYPES } = require('../lib/invitation/create') as typeof import('../lib/invitation/create');
  for (const id of FAMILY_IDS) assert.deepEqual([...FAMILY_MANIFESTS[id].eventTypes].sort(), [...EVENT_TYPES].sort(), id);
  for (const type of EVENT_TYPES) {
    const starters = FAMILY_IDS.filter((id) => FAMILY_MANIFESTS[id].startsNewFor.includes(type));
    assert.ok(starters.length <= 1, `${type}: one starting family at most`);
    assert.equal(starters[0], defaultFamilyFor(type), `${type}: the manifest agrees with defaultFamilyFor`);
  }
});

test('B-030: a section a family does not declare is placed canonically; a section drawn in the cover is never composed', () => {
  const lean: FamilyManifest = { ...FAMILY_MANIFESTS.kartu, sections: FAMILY_MANIFESTS.kartu.sections.filter((id) => id !== 'quote' && id !== 'streaming') };
  assert.deepEqual(validateFamilyManifest(lean), []);
  const order = composedSectionOrder(lean);
  assert.deepEqual([...order].sort(), [...SECTION_IDS].sort(), 'every section is composed once');
  assert.ok(before(order, 'greeting', 'quote') && before(order, 'quote', 'profiles'), order.join(' '));
  assert.ok(before(order, 'gallery', 'streaming') && before(order, 'streaming', 'share'), order.join(' '));
  assert.equal(order.at(-1), 'footer');
  const lontar = composedSectionOrder(FAMILY_MANIFESTS.lontar);
  assert.equal(lontar.includes('greeting'), false, 'Lontar draws the opening words in its cover letter');
  for (const id of FAMILY_IDS) assert.deepEqual(composedSectionOrder(FAMILY_MANIFESTS[id]), [...FAMILY_MANIFESTS[id].sections], `${id} declares every section it composes`);
});

test('B-030: every review page renders its sections in its manifest order and keeps the contract rules', () => {
  let pages = 0;
  for (const row of reviewRows) {
    const familyId = row.config.theme?.familyId;
    if (!familyId) continue;
    for (const guest of [fixtureGuest(), null]) {
      const html = renderGuestPage({ config: row.config, invitation: fixtureInvitation({ slug: row.slug, eventType: row.eventType }), guest, readOnly: row.expired });
      const rendered: SectionId[] = markers(html);
      const expected: SectionId[] = composedSectionOrder(FAMILY_MANIFESTS[familyId as FamilyId]).filter((id) => rendered.includes(id));
      assert.deepEqual(rendered, expected, `${row.slug} (${guest ? 'guest' : 'no guest'})`);
      assert.equal(rendered[0], 'cover', row.slug);
      assert.equal(rendered.at(-1), 'footer', row.slug);
      for (const [first, then] of [...CONTRACT_ORDER_RULES, ...FAMILY_MANIFESTS[familyId].orderRules]) {
        if (rendered.includes(first) && rendered.includes(then)) assert.ok(before(rendered, first, then), `${row.slug}: ${first} before ${then}`);
      }
      pages++;
    }
  }
  assert.ok(pages >= 200, `${pages} family pages checked`);
});

test('B-030: three distinct compositions through the same contract, two of them for non-wedding events', () => {
  // The same wedding content through each family: Gapura and Kartu open with the words, Riang with the facts, and
  // Lontar keeps the words in its cover letter.
  const full = Object.fromEntries(FAMILY_IDS.map((id) => [id, markers(renderRow(`review-${id}-full`))])) as Record<FamilyId, SectionId[]>;
  for (const id of ['gapura', 'kartu'] as const) assert.ok(before(full[id], 'greeting', 'events') && before(full[id], 'profiles', 'events'), `${id}: ${full[id].join(' ')}`);
  assert.ok(before(full.riang, 'events', 'greeting'), `riang: ${full.riang.join(' ')}`);
  assert.equal(full.lontar.includes('greeting'), false, `lontar: ${full.lontar.join(' ')}`);
  assert.ok(renderRow('review-lontar-full').slice(0, renderRow('review-lontar-full').indexOf('</header>')).includes(review('review-lontar-full').config.settings?.openingCopy ?? '\u0000'), 'Lontar: the opening words are in the cover');

  // Non-wedding pages on the families a new invitation of that type starts on (F-02).
  const birthday = markers(renderRow('review-riang-birthday'));
  assert.equal(review('review-riang-birthday').eventType, 'birthday');
  assert.ok(before(birthday, 'events', 'greeting') && before(birthday, 'events', 'rsvp'), `riang birthday: ${birthday.join(' ')}`);
  const programme = markers(renderRow('review-lontar-programme'));
  assert.equal(review('review-lontar-programme').eventType, 'corporate');
  assert.ok(before(programme, 'programme', 'events'), `lontar programme: ${programme.join(' ')}`);
  // The same corporate programme on Gapura keeps its ceremonial order: the facts first, the programme after them.
  const gapuraProgramme = markers(renderRow('review-gapura-programme'));
  assert.ok(before(gapuraProgramme, 'events', 'programme'), `gapura programme: ${gapuraProgramme.join(' ')}`);

  const signature = (order: SectionId[]) => order.filter((id) => ['greeting', 'profiles', 'events', 'programme'].includes(id)).join(' ');
  const compositions = new Set([signature(composedSectionOrder(FAMILY_MANIFESTS.gapura)), signature(composedSectionOrder(FAMILY_MANIFESTS.riang)), signature(composedSectionOrder(FAMILY_MANIFESTS.lontar))]);
  assert.equal(compositions.size, 3, [...compositions].join(' | '));
});

test('B-030: the manifest drives the page: a changed order or motion tier changes the rendered page and nothing else', (t) => {
  // Two renders are compared byte for byte below, and the countdown renders with the request time (B-008): the clock is
  // held so a second boundary between them cannot fail the test (found in session 44 by advancing the render clock).
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const kartu = FAMILY_MANIFESTS.kartu;
  const gapura = FAMILY_MANIFESTS.gapura;
  const original = markers(renderRow('review-kartu-full'));
  try {
    const swapped = kartu.sections.map((id) => (id === 'greeting' ? 'quote' : id === 'quote' ? 'greeting' : id));
    FAMILY_MANIFESTS.kartu = { ...kartu, sections: swapped };
    const reordered = markers(renderRow('review-kartu-full'));
    assert.ok(before(original, 'greeting', 'quote') && before(reordered, 'quote', 'greeting'), `${original.join(' ')} → ${reordered.join(' ')}`);
    assert.deepEqual([...reordered].sort(), [...original].sort(), 'the same sections, in the new order');
    FAMILY_MANIFESTS.gapura = { ...gapura, motionTier: 0 };
    const still = renderRow('review-gapura-full');
    assert.equal(still.includes('inv-rise'), false, 'tier 0: nothing rises');
    FAMILY_MANIFESTS.gapura = gapura;
    assert.equal(withoutSectionMarkers(renderRow('review-gapura-full')).replace(/inv-rise ?/g, ''), withoutSectionMarkers(still).replace(/inv-rise ?/g, ''), 'only the entrance class differs between the tiers');
  } finally {
    FAMILY_MANIFESTS.kartu = kartu;
    FAMILY_MANIFESTS.gapura = gapura;
  }
});

test('B-030: a section the family does not draw degrades to the shared block, never to a blank', () => {
  const { composeSections, sharedSections } = require('../components/invitation/family-sections') as typeof import('../components/invitation/family-sections');
  const { buildGuestView } = require('../components/invitation/guest-view') as typeof import('../components/invitation/guest-view');
  const config: DetailConfig = {
    couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
    quote: { enabled: true, text: 'Kutipan contoh untuk uji', author: 'Penulis Contoh' },
    streaming: { enabled: true, url: 'https://siaran.contoh.example/langsung' },
    events: [{ title: 'Resepsi', startAt: '2099-12-27T19:00:00+08:00', venueName: 'Gedung Contoh' }],
  };
  const props = { config, invitation: fixtureInvitation(), guest: fixtureGuest(), media: [], messages: [], readOnly: false, status: {}, preview: false };
  const view = buildGuestView(props);
  const lean: FamilyManifest = { ...FAMILY_MANIFESTS.kartu, sections: ['cover', 'notices', 'events', 'footer'] };
  const own = { cover: () => createElement('header', { 'data-section': 'cover' }), notices: () => null, events: () => createElement('section', { 'data-section': 'events' }), footer: () => createElement('footer', { 'data-section': 'footer' }) };
  const html = renderToStaticMarkup(createElement(Fragment, null, ...composeSections(lean, own, sharedSections(props, view))));
  // A recognised guest on a published invitation also gets the shared RSVP and guestbook forms.
  assert.deepEqual(markers(html), ['cover', 'quote', 'events', 'streaming', 'rsvp', 'guestbook', 'footer']);
  assert.ok(html.includes('Kutipan contoh untuk uji') && html.includes('https://siaran.contoh.example/langsung'), 'the shared quote and streaming blocks carry the content');
  assert.equal(html.match(/<form\b/g)?.length, 2, 'the shared RSVP and guestbook forms');
  const empty = renderToStaticMarkup(createElement(Fragment, null, ...composeSections(lean, own, sharedSections({ ...props, config: { events: config.events } }, buildGuestView({ ...props, config: { events: config.events } })))));
  assert.deepEqual(markers(empty), ['cover', 'events', 'rsvp', 'guestbook', 'footer'], 'a fallback section without content renders nothing');
});

test('B-030: motion tiers come from the manifest; tier 1 is the entrance only, never on the names, and nothing else animates', () => {
  assert.deepEqual(Object.keys(MOTION_TIERS), ['0', '1']);
  assert.equal(motionClasses(0).rise('mt-6'), 'mt-6');
  assert.equal(motionClasses(1).rise('mt-6'), 'inv-rise mt-6');
  assert.equal(motionClasses(1).rise(), 'inv-rise');
  const keyframes = [...source('app/globals.css').matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]);
  const allowed = new Set(Object.values(MOTION_TIERS).flatMap((tier) => tier.classes));
  for (const name of keyframes) assert.ok(allowed.has(name), `@keyframes ${name} belongs to a motion tier`);
  for (const id of FAMILY_IDS) {
    const page = renderRow(`review-${id}-full`);
    assert.equal(page.includes('inv-rise'), FAMILY_MANIFESTS[id].motionTier >= 1, id);
    assert.doesNotMatch(page, /<h1[^>]*inv-rise/, `${id}: the names paint first`);
    assert.doesNotMatch(page, /<(?:form|input|button|textarea|select)\b[^>]*inv-rise/, `${id}: controls never move`);
  }
});

test('B-030: photo slots, portrait frames and the logo frame agree with the layout code', () => {
  const aspectClass = { '4:3': 'aspect-[4/3]', '3:4': 'aspect-[3/4]', '1:1': 'aspect-square' } as const;
  for (const id of FAMILY_IDS) {
    const { photoSlots, logoFrame } = FAMILY_MANIFESTS[id];
    const code = layoutSource(id);
    const cover = /sizes=\{IMAGE_SIZES\.\w+Cover\}[\s\S]*?className=\{?[`"]([^`"]+)/.exec(code)?.[1] ?? '';
    assert.ok(cover.includes(aspectClass[photoSlots.cover.phone as keyof typeof aspectClass]), `${id}: cover ${photoSlots.cover.phone} (${cover})`);
    if (photoSlots.cover.wide === 'bounded') assert.match(cover, /sm:(?:aspect-auto|max-h-)/, `${id}: the cover is bounded by the viewport from 640 px`);
    assert.match(code, new RegExp(`<PortraitsBody [^>]*frame="${photoSlots.portrait}"`), `${id}: portrait frame ${photoSlots.portrait}`);
    assert.ok(code.includes(aspectClass[photoSlots.gallery.tile as keyof typeof aspectClass]), `${id}: gallery tile ${photoSlots.gallery.tile}`);
    assert.ok(code.includes(`grid-cols-${photoSlots.gallery.columns.phone}`), `${id}: ${photoSlots.gallery.columns.phone} gallery columns on phones`);
    if (photoSlots.gallery.columns.wide !== photoSlots.gallery.columns.phone) assert.ok(code.includes(`sm:grid-cols-${photoSlots.gallery.columns.wide}`), `${id}: wide gallery columns`);
    assert.match(code, new RegExp(`<CorporateLogo view=\\{view\\} align="${logoFrame}"`), `${id}: logo frame ${logoFrame}`);
  }
});

test('B-030: provenance, palettes, music and the byte budget are declared and true', () => {
  for (const id of FAMILY_IDS) {
    const manifest = FAMILY_MANIFESTS[id];
    assert.ok(existsSync(join(root, manifest.provenance.brief)), `${id}: brief ${manifest.provenance.brief}`);
    assert.ok(manifest.provenance.fonts.length <= MAX_FONT_FAMILIES);
    const code = layoutSource(id);
    assert.doesNotMatch(code, /\.(?:png|jpe?g|svg|webp|gif|woff2?|ttf|otf|mp3|wav|ogg)\b|url\(/i, `${id}: ornament is CSS only (no shipped image, font or audio asset)`);
    assert.doesNotMatch(code, /<audio\b|CoverGate/, `${id}: the cover gate and music stay the shared island (B-009)`);
    assert.equal(manifest.palettes, 'all-registered');
    assert.ok(paletteIds.length > 0);
    assert.equal(manifest.byteBudget.familyKiB, PRODUCT_PAGE_BUDGETS.familyKiB);
    assert.equal(manifest.byteBudget.basis, FAMILY_BUDGET_BASIS);
  }
});

test('B-030: the markers are the only markup the section contract adds; the legacy page carries none', () => {
  const page = renderRow('review-gapura-full');
  assert.ok(markers(page).length > 5);
  assert.equal(withoutSectionMarkers(page).includes('data-section'), false);
  assert.equal(markers(renderRow('review-legacy-full')).length, 0, 'the legacy layout keeps its markup verbatim');
  for (const id of FAMILY_IDS) assert.match(source(`components/invitation/families/${id}.tsx`), new RegExp(`composeSections\\(FAMILY_MANIFESTS\\.${id}, `), `${id} composes through its manifest`);
  assert.equal(withFamily({}, 'gapura').theme?.familyId, 'gapura');
});
