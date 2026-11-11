/**
 * Generates `contracts/vectors/creation-rules.json` from the TypeScript creation rules (B-037, D-055). Both writers'
 * suites run the file: `tests/b037-creation-rules.test.ts` and `services/api/tests/creation_vectors.rs`. After a rule
 * change, regenerate it here and make the Rust port agree; `--check` fails instead of writing when the file is stale.
 *
 *   npx tsx scripts/api/creation-vectors.ts [--check]   # from the repository root
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  catalogIdOfDefaults,
  CORE_EVENT_TYPES,
  creationDecision,
  firstFreeSlug,
  isCreationKey,
  isSlugBase,
  SLUG_BASE_MAX,
  SLUG_SUFFIX_LIMIT,
  type CreationInput,
} from '../../lib/invitation/creation-rules';
import { templateEventTypes } from '../../lib/invitation/template-event-types';

const OUT = join(process.cwd(), 'contracts/vectors/creation-rules.json');
const H = '0123456789abcdef01234567';

// Catalog themes used below (lib/invitation/templates.ts): 103 Sage Garden is free (Standard palette sage); 106 Orchid
// Monogram is premium on the Premium palette orchid; 101 Eternal Ivory is premium on the Standard palette ivory.
const sage = { templateId: 103, paletteId: 'sage' };
const orchid = { templateId: 106, paletteId: 'orchid' };
const names = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } } };
const event = { events: [{ id: 'ev-3f9a2b1c4d', title: 'Resepsi', startAt: '2027-02-14T10:00:00+07:00' }] };
const base = (over: Partial<CreationInput>): CreationInput => ({
  eventType: 'wedding',
  templateCategory: 'wedding',
  templateCatalogId: 103,
  templateTier: 'standard',
  config: { theme: sage, ...names, ...event, gift: { personalOnly: true } },
  ...over,
});

const cases: { name: string; input: CreationInput }[] = [
  { name: 'a free catalog theme with its own theme, names and a date is written', input: base({}) },
  { name: 'a Premium catalog theme on a Premium row with its Premium palette is written', input: base({ templateCatalogId: 106, templateTier: 'premium', config: { theme: orchid, ...names } }) },
  { name: 'a bridal-shower template creates a wedding', input: base({ templateCategory: 'bridal-shower' }) },
  { name: 'a catalog category maps to its core event type (graduation → tasyakuran)', input: base({ eventType: 'tasyakuran', templateCategory: 'graduation', config: { theme: sage } }) },
  { name: 'a row seeded with a core category (aqiqah) creates that type', input: base({ eventType: 'aqiqah', templateCategory: 'aqiqah', templateCatalogId: null, config: { ceremonyProfile: { nickName: 'Rafa' } } }) },
  { name: "an event type that is not the template's is refused", input: base({ eventType: 'birthday' }) },
  { name: 'an unknown category refuses every event type', input: base({ templateCategory: 'mystery' }) },
  { name: "a config naming another catalog theme than the row's is refused", input: base({ config: { theme: { templateId: 101, paletteId: 'ivory' } } }) },
  { name: 'a config naming no theme for a row that names one is refused', input: base({ config: { ...names } }) },
  { name: 'both creation issues are named, event type first', input: base({ eventType: 'corporate', config: { theme: { templateId: 104 } } }) },
  { name: 'without a template, a core event type and no theme id is written', input: base({ eventType: 'corporate', templateCategory: null, templateCatalogId: null, config: { corporateProfile: { eventName: 'Rapat Tahunan' } } }) },
  { name: 'without a template, a type outside the core six is refused', input: base({ eventType: 'party', templateCategory: null, templateCatalogId: null, config: {} }) },
  { name: 'without a template, a config naming a theme is refused', input: base({ eventType: 'wedding', templateCategory: null, templateCatalogId: null, config: { theme: sage } }) },
  { name: 'a row seeded before the catalog (no catalog id) with no theme id is written', input: base({ templateCatalogId: null, config: { ...names } }) },
  { name: 'a Premium palette on a Standard row is refused', input: base({ config: { theme: { templateId: 103, paletteId: 'orchid' } } }) },
  { name: 'an unregistered palette is refused', input: base({ config: { theme: { templateId: 103, paletteId: 'neon' } } }) },
  { name: 'a catalog id the catalog does not know is refused as a theme', input: base({ templateCatalogId: 999, config: { theme: { templateId: 999 } } }) },
  { name: 'a Premium catalog theme on a row priced Standard is refused (a stale row)', input: base({ templateCatalogId: 106, config: { theme: orchid } }) },
  { name: 'a public upload in a public field is kept: D-040 guards child photos and protected uploads only', input: base({ config: { theme: sage, couple: { bride: { nickName: 'Sari', photoUrl: `/media/7/${H}.jpg` } } } }) },
  { name: 'a protected upload in a public field is refused', input: base({ config: { theme: sage, couple: { groom: { photoUrl: `/media/protected/7/${H}.png` } } } }) },
  { name: "birthday: another invitation's upload as the child photo is refused (a new draft owns none)", input: base({ eventType: 'birthday', templateCategory: 'birthday', config: { theme: sage, birthdayPerson: { photoUrl: `/media/protected/9/${H}.png` } } }) },
  { name: 'references are judged before the theme', input: base({ config: { theme: { templateId: 103, paletteId: 'orchid' }, couple: { bride: { photoUrl: `/media/protected/9/${H}.png` } } } }) },
  { name: 'a typed absolute photo URL is kept', input: base({ config: { theme: sage, couple: { bride: { photoUrl: 'https://example.com/foto.jpg' } } } }) },
];

const decisions = cases.map(({ name, input }) => ({ name, input, expect: creationDecision(input) }));

const takenUpTo = (base: string, last: number) => [base, ...Array.from({ length: last - 1 }, (_, index) => `${base}-${index + 2}`)];
const slugs = [
  { name: 'a free base is used as it is', base: 'budi-sari', taken: [], limit: SLUG_SUFFIX_LIMIT },
  { name: 'a taken base gets -2', base: 'budi-sari', taken: ['budi-sari'], limit: SLUG_SUFFIX_LIMIT },
  { name: 'the next free number', base: 'budi-sari', taken: ['budi-sari', 'budi-sari-2'], limit: SLUG_SUFFIX_LIMIT },
  { name: 'a gap is filled first', base: 'budi-sari', taken: ['budi-sari', 'budi-sari-3'], limit: SLUG_SUFFIX_LIMIT },
  { name: 'other slugs do not count', base: 'budi-sari', taken: ['budi-sari-x', 'budi', 'budi-sari-2'], limit: SLUG_SUFFIX_LIMIT },
  { name: 'every number up to the limit taken: none', base: 'sage-garden', taken: takenUpTo('sage-garden', SLUG_SUFFIX_LIMIT), limit: SLUG_SUFFIX_LIMIT },
  { name: 'a smaller limit', base: 'wedding', taken: ['wedding', 'wedding-2', 'wedding-3'], limit: 3 },
].map((entry) => ({ ...entry, expect: firstFreeSlug(entry.base, entry.taken, entry.limit) }));

const slugBases = ['budi-sari', 'a', 'x1-2y', 'a'.repeat(SLUG_BASE_MAX), '', '-a', 'a-', 'a--b', 'A', 'a_b', 'é', 'a'.repeat(SLUG_BASE_MAX + 1), 'a b'].map((value) => ({
  value,
  valid: isSlugBase(value),
}));

const catalogIds = [
  { name: 'a catalog default', defaults: { theme: { templateId: 101, paletteId: 'ivory' }, art: { cover: '/x.jpg' } } },
  { name: 'a text id', defaults: { theme: { templateId: '101' } } },
  { name: 'no theme', defaults: { events: [] } },
  { name: 'no defaults', defaults: null },
  { name: 'zero', defaults: { theme: { templateId: 0 } } },
  { name: 'negative', defaults: { theme: { templateId: -3 } } },
  { name: 'a fraction', defaults: { theme: { templateId: 1.5 } } },
  { name: 'a theme that is not an object', defaults: { theme: 5 } },
].map((entry) => ({ ...entry, expect: catalogIdOfDefaults(entry.defaults) }));

const keys = ['3f9a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'a', 'k'.repeat(255), '', 'has space', 'k'.repeat(256), 'é', 'tab\there'].map((value) => ({
  value,
  valid: isCreationKey(value),
}));

const out = {
  description:
    "B-037 (D-055): the creation writers' decision before a draft row is written (the event type and theme are the template's, then the content rules of a save applied to the whole config at version 0), the slug suffix rule and the input contracts, run by tests/b037-creation-rules.test.ts and services/api/tests/creation_vectors.rs. Generated by scripts/api/creation-vectors.ts from the TypeScript rules; both suites must agree with every entry.",
  coreEventTypes: [...CORE_EVENT_TYPES],
  categoryEventTypes: Object.entries(templateEventTypes),
  slugBaseMax: SLUG_BASE_MAX,
  slugSuffixLimit: SLUG_SUFFIX_LIMIT,
  slugBases,
  slugs,
  catalogIds,
  keys,
  decisions,
};
const text = `${JSON.stringify(out, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== text) {
    console.error(`stale: ${OUT} differs from the rules; run without --check`);
    process.exit(1);
  }
  console.log('creation vectors current');
} else {
  writeFileSync(OUT, text);
  const kinds = decisions.reduce<Record<string, number>>((count, { expect }) => ({ ...count, [expect.kind]: (count[expect.kind] ?? 0) + 1 }), {});
  console.log('decisions', decisions.length, 'slugs', slugs.length, 'kinds', JSON.stringify(kinds));
}
