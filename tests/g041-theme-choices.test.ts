// G-041: section order, font pairing and palette chosen inside the family contract. Only contract-declared options are
// offered and accepted; a family renders each option in its declared order; an unset or unknown choice (and the legacy
// layout) renders exactly as before, which is also the rollback. Fictional names.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import { familyReviewInvitations } from '../invitation-research/_tools/setup/seed-family-review';
import { prepareConfigWrite } from '../lib/invitation/content-read';
import { contentDecision, contentNeedsTier, type ContentWriteInput } from '../lib/invitation/content-rules';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS, type FamilyId } from '../lib/invitation/families';
import {
  composedSectionOrder,
  DEFAULT_SECTION_ORDER,
  familyChoices,
  FAMILY_MANIFESTS,
  FONT_PAIRINGS,
  SECTION_ORDER_OPTIONS,
  sectionOrderFor,
  validateFamilyManifest,
  type FamilyManifest,
  type SectionId,
} from '../lib/invitation/family-manifest';
import { onlyChoiceIssues, themeChangeIssues } from '../lib/invitation/theme-entitlement';
import { fontPairingPick, LayoutChoices, PaletteChoice, sectionOrderPick } from '../app/(customer)/dashboard/invitations/[id]/edit/editor-appearance';

const markers = (html: string) =>
  [...html.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1] as SectionId).filter((id, index, all) => id !== all[index - 1]);
const rows = familyReviewInvitations({ programme: true, profiles: true, ceremony: true });
const fixture = (slug: string) => {
  const row = rows.find((candidate) => candidate.slug === slug);
  assert.ok(row, slug);
  return row;
};
const withTheme = (config: DetailConfig, theme: Record<string, unknown>): DetailConfig => ({ ...config, theme: { ...config.theme, ...theme } as DetailConfig['theme'] });
const render = (slug: string, config: DetailConfig) =>
  renderGuestPage({ config, invitation: fixtureInvitation({ slug, eventType: fixture(slug).eventType }), guest: fixtureGuest() });
/**
 * The countdown renders with the request time (B-008), so two renders a second apart differ in its seconds (session 44
 * caught `40` against `39` on a Riang page). A test that compares renders holds the clock, as `b035-preview-parity` does.
 */
const holdClock = (t: TestContext) => t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

test('G-041: every family declares every section-order option as a valid reordering, and the font pairings', () => {
  for (const id of FAMILY_IDS) {
    const manifest = FAMILY_MANIFESTS[id];
    assert.deepEqual(validateFamilyManifest(manifest), [], id);
    for (const option of SECTION_ORDER_OPTIONS) {
      const order = sectionOrderFor(manifest, option);
      assert.deepEqual([...order].sort(), [...manifest.sections].sort(), `${id} ${option} keeps every section`);
      assert.equal(order[0], 'cover');
      assert.equal(order.at(-1), 'footer');
    }
    assert.deepEqual([...manifest.fontPairings], [...FONT_PAIRINGS], id);
  }
  const base = FAMILY_MANIFESTS.gapura;
  const broken = (change: Partial<FamilyManifest>) => validateFamilyManifest({ ...base, ...change });
  const { 'photos-last': _photos, ...withoutPhotosLast } = base.sectionOrders;
  assert.ok(broken({ sectionOrders: withoutPhotosLast as FamilyManifest['sectionOrders'] }).includes('section order photos-last is not declared'));
  assert.ok(
    broken({ sectionOrders: { ...base.sectionOrders, 'story-first': [...base.sections.slice(0, -1), 'quote', 'footer'] } }).includes(
      'section order story-first declares quote twice',
    ),
  );
  const lontar = FAMILY_MANIFESTS.lontar;
  assert.ok(
    validateFamilyManifest({ ...lontar, sectionOrders: { ...lontar.sectionOrders, 'photos-last': ['cover', 'notices', 'greeting', ...lontar.sections.slice(2)] } }).includes(
      'section order photos-last composes greeting, which the cover draws',
    ),
  );
  const rsvpFirst: SectionId[] = ['cover', 'notices', 'rsvp', ...base.sections.filter((id) => !['cover', 'notices', 'rsvp'].includes(id))];
  assert.ok(broken({ sectionOrders: { ...base.sectionOrders, 'story-first': rsvpFirst } }).includes('section order story-first: events must come before rsvp'));
  const eventsFirst: SectionId[] = ['cover', 'notices', 'events', ...base.sections.filter((id) => !['cover', 'notices', 'events'].includes(id))];
  assert.ok(broken({ sectionOrders: { ...base.sectionOrders, 'photos-last': eventsFirst } }).includes('section order photos-last: greeting must come before events'), "the family's own rule");
  assert.ok(broken({ sectionOrders: { ...base.sectionOrders, random: base.sections } as never }).includes('unknown section order random'));
  assert.ok(broken({ fontPairings: [] }).includes('no font pairing'));
  assert.ok(broken({ fontPairings: ['sans', 'comic' as never] }).includes('unknown font pairing comic'));
});

test('G-041: each family renders each section order in its declared order on the review fixtures', () => {
  for (const id of FAMILY_IDS) {
    for (const variant of ['full', 'birthday', 'corporate']) {
      const slug = `review-${id}-${variant}`;
      const config = fixture(slug).config;
      const byOption = new Map<string, SectionId[]>();
      for (const option of SECTION_ORDER_OPTIONS) {
        const rendered = markers(render(slug, withTheme(config, { sectionOrder: option })));
        const declared = composedSectionOrder(familyChoices(FAMILY_MANIFESTS[id], { sectionOrder: option }).manifest);
        assert.deepEqual(rendered, declared.filter((section) => rendered.includes(section)), `${slug} ${option}`);
        byOption.set(option, rendered);
      }
      const storyFirst = byOption.get('story-first')!;
      const photosLast = byOption.get('photos-last')!;
      if (storyFirst.includes('story') && storyFirst.includes('events')) {
        assert.ok(storyFirst.indexOf('story') < storyFirst.indexOf('events'), `${slug}: story before the events`);
        assert.notDeepEqual(storyFirst, byOption.get('standard'), `${slug}: the option changes the page`);
      }
      if (photosLast.includes('gallery') && photosLast.includes('gift')) {
        assert.equal(photosLast[photosLast.indexOf('gift') - 1], 'gallery', `${slug}: the gallery right before the gift`);
      }
    }
  }
});

test('G-041: the sans pairing marks the family page root and changes nothing else', (t) => {
  holdClock(t);
  for (const id of FAMILY_IDS) {
    const slug = `review-${id}-full`;
    const config = fixture(slug).config;
    const plain = render(slug, config);
    const sans = render(slug, withTheme(config, { fontPairing: 'sans' }));
    assert.equal(sans.match(/data-font-pairing="sans"/g)?.length, 1, id);
    assert.match(sans, /<main [^>]*data-font-pairing="sans"/, `${id}: on <main>`);
    assert.equal(sans.replace(' data-font-pairing="sans"', ''), plain, `${id}: only the attribute differs`);
    assert.equal(render(slug, withTheme(config, { fontPairing: 'serif-display' })), plain, `${id}: the default pairing adds nothing`);
  }
  const css = readFileSync('app/globals.css', 'utf8');
  const base = css.slice(css.indexOf('@layer base'), css.indexOf('/* App-shell utility compatibility'));
  assert.match(base, /\[data-font-pairing='sans'\] \{ --font-serif: var\(--font-sans\); \}/, 'the rule maps headings to the text face, in the base layer');
});

test('G-041: no choice, a default choice, an unknown choice and the legacy layout all render exactly as before (rollback)', (t) => {
  holdClock(t);
  const config = fixture('review-gapura-full').config;
  for (const { label, familyId } of LAYOUTS) {
    const page = withFamily(config, familyId);
    const plain = render('review-gapura-full', page);
    const variants: Record<string, unknown>[] = [
      { sectionOrder: 'standard', fontPairing: 'serif-display' },
      { sectionOrder: 'acak', fontPairing: 'Comic Sans' },
      { sectionOrder: 'constructor', fontPairing: '__proto__' },
    ];
    for (const theme of variants) assert.equal(render('review-gapura-full', withTheme(page, theme)), plain, `${label} ${JSON.stringify(theme)}`);
    if (!familyId) {
      const chosen = render('review-gapura-full', withTheme(page, { sectionOrder: 'story-first', fontPairing: 'sans' }));
      assert.equal(chosen, plain, 'legacy ignores valid choices too (D-041)');
    }
  }
  for (const id of FAMILY_IDS) {
    const manifest = FAMILY_MANIFESTS[id];
    const none = familyChoices(manifest, undefined);
    assert.equal(none.manifest, manifest, `${id}: the family's own manifest object`);
    assert.equal(none.fontPairing, undefined);
  }
});

test('G-041: the strict schema stores the choice keys; a retired option id still reads and renders the default', (t) => {
  holdClock(t);
  const parsed = detailConfigSchema.parse({ theme: { familyId: 'riang', paletteId: 'sage', sectionOrder: 'photos-last', fontPairing: 'sans' } });
  assert.deepEqual(parsed.theme, { familyId: 'riang', paletteId: 'sage', sectionOrder: 'photos-last', fontPairing: 'sans' });
  assert.equal(detailConfigSchema.safeParse({ theme: { sectionOrder: 'x'.repeat(41) } }).success, false);
  const retired = detailConfigSchema.parse({ theme: { familyId: 'riang', sectionOrder: 'old-order' } });
  assert.equal(retired.theme?.sectionOrder, 'old-order');
  const config = fixture('review-riang-full').config;
  assert.equal(render('review-riang-full', withTheme(config, { sectionOrder: 'old-order' })), render('review-riang-full', config));
});

test('G-041: the writers refuse a choice outside the contract only when the save changes it; choices never need the tier', () => {
  const input = (stored: Record<string, unknown>, next: Record<string, unknown>): ContentWriteInput => ({
    invitationId: 7,
    eventType: 'wedding',
    storedConfig: { theme: stored },
    config: { theme: next },
    touchedSections: ['theme'],
    baseVersion: 2,
    currentVersion: 2,
  });
  assert.deepEqual(contentDecision(input({}, { sectionOrder: 'story-first', fontPairing: 'sans' }), 'standard'), { kind: 'write', nextVersion: 3 });
  assert.equal(contentNeedsTier(input({}, { sectionOrder: 'story-first', fontPairing: 'sans' })), false);
  assert.deepEqual(contentDecision(input({}, { sectionOrder: 'acak', fontPairing: 'Comic Sans' }), 'premium'), {
    kind: 'theme',
    issues: [
      { path: 'theme.sectionOrder', reason: 'unknown-section-order' },
      { path: 'theme.fontPairing', reason: 'unknown-font-pairing' },
    ],
  });
  assert.deepEqual(contentDecision(input({ sectionOrder: 'lama' }, { sectionOrder: 'lama', paletteId: 'sand' }), 'standard'), { kind: 'write', nextVersion: 3 });
  assert.equal(onlyChoiceIssues(themeChangeIssues({ sectionOrder: 'x' }, 'standard')), true);
  assert.equal(onlyChoiceIssues(themeChangeIssues({ sectionOrder: 'x', paletteId: 'neon' }, 'standard')), false);
  const vectors = JSON.parse(readFileSync('contracts/vectors/content-rules.json', 'utf8')) as { sectionOrders: string[]; fontPairings: string[] };
  assert.deepEqual(vectors.sectionOrders, [...SECTION_ORDER_OPTIONS]);
  assert.deepEqual(vectors.fontPairings, [...FONT_PAIRINGS]);
});

test('G-041: returning to the defaults reaches storage through the save path and renders as no choice (session 44)', (t) => {
  holdClock(t);
  const stored = { theme: { familyId: 'gapura', paletteId: 'sage', sectionOrder: 'story-first', fontPairing: 'sans' } };
  // The editor's patch (`{ ...v, ...next }`), serialised as `sendDetailSave` does and parsed as the detail route does.
  const save = (next: Record<string, unknown>) =>
    prepareConfigWrite(stored, detailConfigSchema.partial().parse(JSON.parse(JSON.stringify({ theme: { ...stored.theme, ...next } }))));

  for (const id of FAMILY_IDS) {
    const reset = save({ familyId: id, ...sectionOrderPick(DEFAULT_SECTION_ORDER), ...fontPairingPick(FAMILY_MANIFESTS[id].fontPairings[0]) });
    assert.equal(reset.theme?.sectionOrder, 'standard', id);
    assert.equal(reset.theme?.fontPairing, 'serif-display', id);
  }
  // The merge contract the fix relies on: a key the patch leaves out (an `undefined` the JSON dropped) keeps the stored value.
  const omitted = save({ sectionOrder: undefined, fontPairing: undefined });
  assert.equal(omitted.theme?.sectionOrder, 'story-first');
  assert.equal(omitted.theme?.fontPairing, 'sans');
  // A family switch keeps the stored choices, which every family declares.
  assert.deepEqual(save({ familyId: 'kartu' }).theme, { ...stored.theme, familyId: 'kartu' });

  for (const id of FAMILY_IDS) {
    const slug = `review-${id}-full`;
    const config = fixture(slug).config;
    const chosen = render(slug, withTheme(config, { sectionOrder: 'story-first', fontPairing: 'sans' }));
    const back = render(slug, withTheme(config, { ...sectionOrderPick('standard'), ...fontPairingPick(FAMILY_MANIFESTS[id].fontPairings[0]) }));
    assert.notEqual(back, chosen, `${id}: the choice changed the page`);
    assert.equal(back, render(slug, config), `${id}: back to the defaults renders as a page that never chose`);
  }

  const editor = readFileSync('app/(customer)/dashboard/invitations/[id]/edit/editor-appearance.tsx', 'utf8');
  assert.match(editor, /onPick=\{\(\) => onChange\(sectionOrderPick\(option\)\)\}/, 'the order cards send the pick helper');
  assert.match(editor, /onPick=\{\(\) => onChange\(fontPairingPick\(pairing\)\)\}/, 'the pairing cards send the pick helper');
  assert.doesNotMatch(editor, /\?\s*undefined\s*:\s*(option|pairing)\b/, 'no pick maps a default to undefined');
});

test('G-041: the editor offers only contract options and locks Premium palettes below a Premium entitlement', () => {
  const html = (familyId: FamilyId | undefined, sectionOrder?: string, fontPairing?: string) =>
    renderToStaticMarkup(createElement(LayoutChoices, { familyId, sectionOrder, fontPairing, onChange: () => {} }));
  /** The whole `<input>` tag for a value (React writes `checked` after the other attributes). */
  const input = (markup: string, value: string) => markup.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`))?.[0] ?? '';
  const gapura = html('gapura', 'story-first', 'sans');
  assert.equal(gapura.match(/type="radio"/g)?.length, SECTION_ORDER_OPTIONS.length + FONT_PAIRINGS.length);
  assert.match(input(gapura, 'story-first'), /checked=""/);
  assert.match(input(gapura, 'sans'), /checked=""/);
  assert.doesNotMatch(input(gapura, 'standard'), /checked=""/);
  assert.doesNotMatch(gapura, /type="text"/);
  assert.match(input(html('gapura', 'acak'), 'standard'), /checked=""/, 'an unknown stored order shows the default as chosen');
  assert.doesNotMatch(html(undefined), /type="radio"/, 'the legacy layout offers no choice');

  const options = [
    { id: 'sage', tier: 'standard' as const, bg: '#f5f8f4', accent: '#546f58', ink: '#34403a' },
    { id: 'midnight', tier: 'premium' as const, bg: '#101526', accent: '#d3b16a', ink: '#e8e9f2' },
  ];
  const standard = renderToStaticMarkup(createElement(PaletteChoice, { options, tier: 'standard', paletteId: 'sage', onPick: () => {} }));
  assert.match(input(standard, 'midnight'), /disabled=""/);
  assert.match(input(standard, 'sage'), /checked=""/);
  assert.doesNotMatch(input(standard, 'sage'), /disabled=""/);
  const premium = renderToStaticMarkup(createElement(PaletteChoice, { options, tier: 'premium', paletteId: 'neon', onPick: () => {} }));
  assert.doesNotMatch(premium, /disabled=""/);
  assert.match(premium, /tidak dikenal/, 'an unknown stored palette is named');
  const page = readFileSync('app/(customer)/dashboard/invitations/[id]/edit/page.tsx', 'utf8');
  assert.match(page, /paletteIds\.map/, 'the editor lists the registered palettes');
});

test('G-041: the opt-in `--choices` review rows cover every family and choice, and leave the default fixture as it was (session 44)', () => {
  const base = familyReviewInvitations();
  const withChoices = familyReviewInvitations({ choices: true });
  for (const row of base) assert.deepEqual(withChoices.find((candidate) => candidate.slug === row.slug)?.config, row.config, row.slug);
  const added = withChoices.filter((row) => !base.some((candidate) => candidate.slug === row.slug));
  const familyCases = ['none', 'default', 'story-first', 'photos-last', 'sans', 'retired'];
  assert.deepEqual(
    added.map((row) => row.slug),
    ['review-legacy-choice-none', 'review-legacy-choice-story-first', ...FAMILY_IDS.flatMap((family) => familyCases.map((name) => `review-${family}-choice-${name}`))],
  );
  for (const row of added) {
    assert.equal(row.gallery, true, `${row.slug} takes the --gallery media`);
    const family = row.config.theme?.familyId as FamilyId | undefined;
    if (!family) continue;
    const { manifest, fontPairing } = familyChoices(FAMILY_MANIFESTS[family], row.config.theme);
    const name = row.slug.replace(`review-${family}-choice-`, '');
    assert.equal(manifest.sections === FAMILY_MANIFESTS[family].sections, !['story-first', 'photos-last'].includes(name), `${row.slug} order`);
    assert.equal(fontPairing, name === 'sans' ? 'sans' : undefined, `${row.slug} pairing`);
  }
});
