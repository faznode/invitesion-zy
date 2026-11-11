/**
 * Generates `contracts/vectors/content-rules.json` from the TypeScript content rules (B-035, B-036). Both writers' suites
 * run the file: `tests/b035-content-rules.test.ts` and `services/api/tests/content_vectors.rs`. After a rule change,
 * regenerate it here and make the Rust port agree; `--check` fails instead of writing when the file is stale.
 *
 *   npx tsx scripts/api/content-vectors.ts [--check]   # from the repository root
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDecision, contentNeedsTier, type ContentWriteInput } from '../../lib/invitation/content-rules';
import { FONT_PAIRINGS, SECTION_ORDER_OPTIONS } from '../../lib/invitation/family-manifest';
import { isProtectedMediaPath, isUploadedMediaPath, mediaPathInvitationId } from '../../lib/invitation/image-url';
import { childPhotoField, GIFT_QRIS_FIELD } from '../../lib/invitation/media-ownership';
import { paletteIds } from '../../lib/invitation/palettes';
import { CATALOG_THEME_TIERS, FALLBACK_PALETTE_ID, paletteTier } from '../../lib/invitation/theme-entitlement';

const OUT = join(process.cwd(), 'contracts/vectors/content-rules.json');
const H = '0123456789abcdef01234567';
const pub = (id: number | string) => `/media/${id}/${H}.jpg`;
const prot = (id: number | string) => `/media/protected/${id}/${H}.png`;
const avatar = (id: number) => `/media/avatars/${id}/${H}.webp`;

type Case = { name: string; input: Partial<ContentWriteInput>; tier?: 'standard' | 'premium' };
const base = (over: Partial<ContentWriteInput>): ContentWriteInput => ({
  invitationId: 7, eventType: 'wedding', storedConfig: {}, config: {}, touchedSections: [], baseVersion: 3, currentVersion: 3, ...over,
});
const theme = (stored: Record<string, unknown> | undefined, next: Record<string, unknown>): Partial<ContentWriteInput> => ({
  touchedSections: ['theme'], storedConfig: stored === undefined ? {} : { theme: stored }, config: { theme: next },
});

// Catalog themes used below (lib/invitation/templates.ts): 103 Sage Garden and 107 Sand Minimal are free (Standard
// palettes sage, sand); 102 Rose Gold Romance is premium on a Standard palette; 106 Orchid Monogram is premium on the
// Premium palette orchid; 104 Midnight Gala is signature, which is Premium too.
const cases: Case[] = [
  { name: 'a save of untouched rules writes the next version', input: { touchedSections: ['quote'], config: { quote: { enabled: true, text: 'Selamat datang' } } } },
  { name: 'the first save of an invitation without versions writes 1', input: { baseVersion: 0, currentVersion: 0, touchedSections: ['quote'], config: { quote: { enabled: true } } } },
  { name: 'a stale base is a conflict', input: { baseVersion: 3, currentVersion: 4, touchedSections: ['quote'], config: { quote: { enabled: true } } } },
  { name: 'a stale base is a conflict before its content is judged', input: { baseVersion: 2, currentVersion: 5, touchedSections: ['couple'], config: { couple: { bride: { photoUrl: prot(7) } } } } },
  { name: 'a newer base than stored is a conflict too', input: { baseVersion: 6, currentVersion: 5, touchedSections: ['quote'], config: {} } },
  { name: 'a protected upload in a public field is refused', input: { touchedSections: ['couple'], config: { couple: { bride: { photoUrl: prot(7) } } } } },
  { name: 'a section the save did not send is not judged', input: { touchedSections: ['quote'], config: { couple: { bride: { photoUrl: prot(7) } }, quote: { enabled: true } } } },
  { name: 'a save that sends no section judges no reference', input: { touchedSections: [], config: { couple: { bride: { photoUrl: prot(7) } } } } },
  { name: "birthday: this invitation's protected child photo", input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: prot(7) } } } },
  { name: "birthday: another invitation's protected photo is refused", input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: prot(8) } } } },
  { name: "birthday: this invitation's public upload from before D-040", input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: pub(7) } } } },
  { name: "birthday: another invitation's public upload is refused", input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: pub(9) } } } },
  { name: "birthday: a user's avatar is refused", input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: avatar(7) } } } },
  { name: 'birthday: a typed absolute URL is kept', input: { eventType: 'birthday', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: 'https://example.com/foto.jpg' } } } },
  { name: "aqiqah: the child photo is the ceremony profile's", input: { eventType: 'aqiqah', touchedSections: ['ceremonyProfile'], config: { ceremonyProfile: { photoUrl: prot(7) } } } },
  { name: "khitanan: another invitation's protected photo is refused", input: { eventType: 'khitanan', touchedSections: ['ceremonyProfile'], config: { ceremonyProfile: { photoUrl: prot(70) } } } },
  { name: 'wedding: the ceremony profile is a public field', input: { eventType: 'wedding', touchedSections: ['ceremonyProfile'], config: { ceremonyProfile: { photoUrl: prot(7) } } } },
  { name: 'tasyakuran: the birthday field is a public field', input: { eventType: 'tasyakuran', touchedSections: ['birthdayPerson'], config: { birthdayPerson: { photoUrl: prot(7) } } } },
  { name: "gift QRIS: this invitation's protected image", input: { touchedSections: ['gift'], config: { gift: { qrisImageUrl: prot(7) } } } },
  { name: "gift QRIS: another invitation's protected image is refused", input: { eventType: 'corporate', touchedSections: ['gift'], config: { gift: { qrisImageUrl: prot(3) } } } },
  { name: 'a protected upload inside a list is refused at its index', input: { touchedSections: ['events'], config: { events: [{ title: 'Akad' }, { title: 'Resepsi', photoUrl: prot(7) }] } } },
  { name: 'several refusals come sorted by path', input: { touchedSections: ['couple', 'story'], config: { story: { items: [{ photoUrl: prot(7) }] }, couple: { groom: { photoUrl: prot(7) }, bride: { photoUrl: prot(7) } } } } },
  { name: 'ten list items sort as text', input: { touchedSections: ['story'], config: { story: { items: Array.from({ length: 11 }, (_, i) => (i === 2 || i === 10 ? { photoUrl: prot(7) } : { title: `Bab ${i}` })) } } } },
  { name: 'malformed protected paths are not protected uploads', input: { touchedSections: ['couple'], config: { couple: { bride: { photoUrl: prot('07') }, groom: { photoUrl: `/media/protected/7/${H.toUpperCase()}.png` }, extra: [`/media/protected/7/${H}.jpeg`, `${prot(7)}?v=1`, `${prot(7)}\n`, ` ${prot(7)}`, `/media/protected//${H}.png`, `/media/protected/1234567890123456/${H}.png`] } } } },
  { name: 'non-string values are not references', input: { touchedSections: ['couple', 'rsvp'], config: { couple: { bride: { order: 1, visible: true, photoUrl: null } }, rsvp: { maxGuests: 5 } } } },
  { name: 'a Premium palette needs a Premium entitlement', input: theme({ paletteId: 'sage' }, { paletteId: 'midnight' }), tier: 'standard' },
  { name: 'a Premium palette with a Premium entitlement is saved', input: theme({ paletteId: 'sage' }, { paletteId: 'gold-noir' }), tier: 'premium' },
  { name: 'an unknown palette is refused', input: theme(undefined, { paletteId: 'neon' }) },
  { name: 'a Standard palette needs no tier lookup', input: theme({ paletteId: 'midnight' }, { paletteId: 'sand' }) },
  { name: 'an unchanged Premium palette is kept on a Standard invitation', input: theme({ paletteId: 'midnight' }, { paletteId: 'midnight', headline: 'Baru' }) },
  { name: 'a cleared palette is not a change', input: theme({ paletteId: 'midnight' }, {}) },
  // B-036 (D-054): a switch within the entitled tier keeps the content and needs no checkout.
  { name: 'switching to a Standard catalog theme with its palette is saved without a tier lookup', input: theme({ templateId: 107, paletteId: 'sand' }, { templateId: 103, paletteId: 'sage' }) },
  { name: 'a blank invitation may take a Standard catalog theme', input: theme(undefined, { templateId: 103 }) },
  { name: 'switching to a Premium catalog theme needs a Premium entitlement', input: theme({ templateId: 103, paletteId: 'sage' }, { templateId: 102, paletteId: 'rose-gold' }), tier: 'standard' },
  { name: 'a Premium catalog theme with a Premium entitlement is saved', input: theme({ templateId: 103, paletteId: 'sage' }, { templateId: 102, paletteId: 'rose-gold' }), tier: 'premium' },
  { name: 'a signature catalog theme is Premium', input: theme({ templateId: 103 }, { templateId: 104 }), tier: 'standard' },
  { name: 'a Premium theme on its Premium palette names both refusals, the theme first', input: theme({ templateId: 103, paletteId: 'sage' }, { templateId: 106, paletteId: 'orchid' }), tier: 'standard' },
  { name: 'a Premium entitlement may switch down to a Standard theme', input: theme({ templateId: 106, paletteId: 'orchid' }, { templateId: 103, paletteId: 'sage' }), tier: 'premium' },
  { name: 'naming the stored catalog theme again is no change, even above the tier', input: theme({ templateId: 106, paletteId: 'orchid' }, { templateId: 106, paletteId: 'orchid' }), tier: 'standard' },
  { name: 'a cleared catalog theme is not a change', input: theme({ templateId: 106 }, {}) },
  { name: 'an id the catalog does not know is refused', input: theme({ templateId: 103 }, { templateId: 5 }) },
  { name: 'a fractional template id is no catalog theme', input: theme({ templateId: 103 }, { templateId: 103.5 }) },
  { name: 'a stored theme read leniently: a string template id is no template id', input: theme({ templateId: '103', paletteId: 12 }, { templateId: 103, paletteId: 'sage' }) },
  { name: 'both theme refusals, the template first', input: theme(undefined, { paletteId: 'neon', templateId: 9 }) },
  { name: 'the theme is judged only when the save sends it', input: { touchedSections: ['quote'], storedConfig: { theme: { paletteId: 'sage', templateId: 103 } }, config: { theme: { paletteId: 'midnight', templateId: 106 }, quote: { enabled: true } } }, tier: 'standard' },
  { name: 'references are judged before the theme', input: { touchedSections: ['theme', 'couple'], config: { theme: { paletteId: 'midnight' }, couple: { bride: { photoUrl: prot(7) } } } }, tier: 'standard' },
  { name: 'a stored config that is not an object reads as no theme', input: { touchedSections: ['theme'], storedConfig: 'rusak', config: { theme: { paletteId: 'midnight' } } }, tier: 'premium' },
  // G-041: layout choices inside the family contract, free in every tier.
  { name: 'a declared section order is saved without a tier lookup', input: theme({ familyId: 'gapura' }, { familyId: 'gapura', sectionOrder: 'story-first' }) },
  { name: 'a section order outside the contract is refused', input: theme({ familyId: 'gapura' }, { familyId: 'gapura', sectionOrder: 'acak' }) },
  { name: 'a declared font pairing is saved', input: theme(undefined, { fontPairing: 'sans' }) },
  { name: 'a font pairing outside the contract is refused', input: theme(undefined, { fontPairing: 'Comic Sans' }) },
  { name: 'switching back to the standard order is saved', input: theme({ sectionOrder: 'photos-last' }, { sectionOrder: 'standard' }) },
  { name: 'an unknown choice stored before G-041 is kept while it does not change', input: theme({ sectionOrder: 'lama', fontPairing: 'Playfair Display' }, { sectionOrder: 'lama', fontPairing: 'Playfair Display', headline: 'Baru' }) },
  { name: 'a cleared choice is not a change', input: theme({ sectionOrder: 'story-first', fontPairing: 'sans' }, {}) },
  { name: 'a choice that is not a string reads as absent', input: theme(undefined, { sectionOrder: 3, fontPairing: true }) },
  { name: 'every theme refusal in order: template, palette, section order, font pairing', input: theme(undefined, { fontPairing: 'y', sectionOrder: 'x', paletteId: 'neon', templateId: 9 }) },
  { name: 'a Premium palette refusal comes before a choice refusal', input: theme({ paletteId: 'sage' }, { paletteId: 'midnight', sectionOrder: 'x' }), tier: 'standard' },
  { name: 'choices are judged only when the save sends the theme', input: { touchedSections: ['quote'], storedConfig: {}, config: { theme: { sectionOrder: 'x', fontPairing: 'y' }, quote: { enabled: true } } } },
];

const decisions = cases.map(({ name, input, tier = 'standard' }) => {
  const full = base(input);
  return { name, input: full, tier, needsTier: contentNeedsTier(full), expect: contentDecision(full, tier) };
});

const pathSamples = [pub(7), pub(0), prot(7), prot(123456789012345), avatar(7), prot('07'), `/media/7/${H}.gif`, `/media/7/${H}.svg`, `/media/7/${H.slice(1)}.png`,
  `/media/protected/7/${H}.webp`, `/media/avatars/protected/7/${H}.png`, `/media/protected/avatars/7/${H}.png`, `/media//${H}.png`, `media/7/${H}.png`,
  `/media/7/${H}.png/`, `/media/7/sub/${H}.png`, `https://cdn.example.com/media/7/${H}.png`, '', '/media/', `/media/protected/1234567890123456/${H}.png`];
const mediaPaths = pathSamples.map((value) => ({ value, uploaded: isUploadedMediaPath(value), protected: isProtectedMediaPath(value), invitation: mediaPathInvitationId(value) }));

const out = {
  description:
    "B-035 / B-036: the content writer's decision under the row lock (version, D-040 references, the theme: B-041 and the switch within the tier, D-054; G-041's layout choices inside the family contract), run by tests/b035-content-rules.test.ts and services/api/tests/content_vectors.rs. Generated by scripts/api/content-vectors.ts from the TypeScript rules; both suites must agree with every entry.",
  fallbackPalette: FALLBACK_PALETTE_ID,
  palettes: paletteIds.map((id) => [id, paletteTier(id)]),
  templates: CATALOG_THEME_TIERS.map(([id, tier]) => [id, tier]),
  sectionOrders: [...SECTION_ORDER_OPTIONS],
  fontPairings: [...FONT_PAIRINGS],
  childPhotoFields: Object.fromEntries(['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate', 'unknown'].map((type) => [type, childPhotoField(type)])),
  giftQrisField: GIFT_QRIS_FIELD,
  mediaPaths,
  decisions,
};
const text = `${JSON.stringify(out, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== text) {
    console.error(`stale: ${OUT} differs from the rules; run without --check`);
    process.exit(1);
  }
  console.log('content vectors current');
} else {
  writeFileSync(OUT, text);
  const kinds = decisions.reduce<Record<string, number>>((count, { expect }) => ({ ...count, [expect.kind]: (count[expect.kind] ?? 0) + 1 }), {});
  console.log('decisions', decisions.length, 'templates', CATALOG_THEME_TIERS.length, 'paths', mediaPaths.length, 'kinds', JSON.stringify(kinds));
}
