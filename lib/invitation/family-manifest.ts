import type { EventType } from './create';
import { FAMILY_IDS, type FamilyId } from './families';
import type { PortraitFrame } from '@/components/invitation/guest-blocks';

/**
 * B-030 (U7 step 1, `08-template-system-and-harness.md` §8 "Family capabilities"): what each design family declares.
 * The manifest is the source of the section order a family composes (`composeSections` in
 * `components/invitation/family-sections.tsx` calls the layout's renderers in this order) and of its motion tier
 * (`motionClasses`), so changing either is a manifest change the tests and the harness check, never an edit buried in a
 * layout. The family still owns how each section looks; the invitation still owns its content (`DetailConfig`).
 */

/**
 * Every guest-facing section a family composes. This list is also the canonical order: a section a family does not
 * declare is placed after the nearest section before it here and drawn by the shared fallback, never left blank.
 */
export const SECTION_IDS = [
  'cover',
  'notices',
  'greeting',
  'quote',
  'profiles',
  'events',
  'ceremony',
  'programme',
  'story',
  'gallery',
  'streaming',
  'share',
  'gift',
  'rsvp',
  'guestbook',
  'footer',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The rules every family's order keeps: who reads what before acting. `[a, b]` means a comes before b. */
export const CONTRACT_ORDER_RULES: readonly (readonly [SectionId, SectionId])[] = [
  // The time and place come before the RSVP form and the gift details.
  ['events', 'rsvp'],
  ['events', 'gift'],
  // The RSVP comes before the guestbook; both forms close the page.
  ['rsvp', 'guestbook'],
  ['gift', 'rsvp'],
];

/**
 * Motion tiers. Tier 0: nothing moves. Tier 1: a one-time entrance (`inv-rise`, opacity and transform only, switched off
 * under `prefers-reduced-motion` in `app/globals.css`), never on the names, so they paint first. A higher tier
 * (scroll-linked or ambient motion) does not exist until it has a byte budget, a reduced-motion fallback and a written
 * review; the validator refuses any other value.
 */
export const MOTION_TIERS = {
  0: { label: 'still', classes: [] as readonly string[] },
  1: { label: 'entrance', classes: ['inv-rise'] as readonly string[] },
} as const;
export type MotionTier = keyof typeof MOTION_TIERS;

/** The entrance class a tier allows; `rise('mt-6 …')` prefixes it, and adds nothing on tier 0. */
export function motionClasses(tier: MotionTier) {
  const entrance = MOTION_TIERS[tier].classes[0] ?? '';
  return { rise: (classes = '') => [entrance, classes].filter(Boolean).join(' ') };
}

/**
 * G-041: the choices a host may make inside a family's contract, stored in the invitation's theme (`theme.sectionOrder`,
 * `theme.fontPairing`) next to its palette. Option ids are shared by every family and every family declares every
 * section-order option (the validator checks), so the writers judge an id without knowing the family and a family
 * switch never strands a stored choice. `standard` is the family's own order (`sections`).
 */
export const SECTION_ORDER_OPTIONS = ['standard', 'story-first', 'photos-last'] as const;
export type SectionOrderOption = (typeof SECTION_ORDER_OPTIONS)[number];
export const DEFAULT_SECTION_ORDER: SectionOrderOption = 'standard';

/**
 * Font pairings over the two faces every family ships (`provenance.fonts`); none adds a font file. `serif-display` sets
 * headings in the serif and text in the sans (each family's default); `sans` sets both in the sans.
 */
export const FONT_PAIRINGS = ['serif-display', 'sans'] as const;
export type FontPairing = (typeof FONT_PAIRINGS)[number];

/** An aspect window as the layout draws it: a CSS ratio, or `bounded` where the height follows the viewport (S18-G2). */
export type Aspect = '4:3' | '3:4' | '1:1' | 'bounded';

export type FamilyManifest = {
  schemaVersion: 1;
  family: FamilyId;
  /** The order the layout composes its sections in. */
  sections: readonly SectionId[];
  /** Sections the cover draws inside itself (Lontar's opening words sit under the greeting); never composed twice. */
  coverIncludes: readonly SectionId[];
  /** This family's own order rules on top of `CONTRACT_ORDER_RULES`. */
  orderRules: readonly (readonly [SectionId, SectionId])[];
  /** G-041: the other orders a host may choose; each reorders `sections` and keeps every order rule. */
  sectionOrders: Record<Exclude<SectionOrderOption, 'standard'>, readonly SectionId[]>;
  /** G-041: the font pairings a host may choose; the first is the family's default look. */
  fontPairings: readonly FontPairing[];
  /** Every event type the family renders (all of them: a template change never requires a content change). */
  eventTypes: readonly EventType[];
  /** The event types a new invitation starts on this family for (F-02, `defaultFamilyFor`). */
  startsNewFor: readonly EventType[];
  photoSlots: {
    cover: { phone: Aspect; wide: Aspect };
    portrait: PortraitFrame;
    gallery: { tile: Aspect; columns: { phone: number; wide: number } };
  };
  /** Where the organiser's logo sits on the cover (B-029). */
  logoFrame: 'center' | 'start';
  motionTier: MotionTier;
  /** B-009: the cover gate and the music are one shared island around every layout; a layout never draws its own. */
  music: { coverGate: 'shared'; audio: 'shared' };
  /** B-016: every registered palette's tokens (contrast-checked per family in the rendered sweep). */
  palettes: 'all-registered';
  /** Q-D17: judged by `PRODUCT_PAGE_BUDGETS.familyKiB` on design bytes (`tools/template-harness/policy.ts`). */
  byteBudget: { familyKiB: number; basis: 'design' };
  provenance: {
    fonts: readonly ('font-serif' | 'font-sans')[];
    /** Ornament drawn in CSS (no image, font or audio asset ships with a family). */
    art: 'css-only';
    brief: string;
  };
};

const ALL_EVENT_TYPES: readonly EventType[] = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'];
const SHARED = {
  schemaVersion: 1,
  eventTypes: ALL_EVENT_TYPES,
  music: { coverGate: 'shared', audio: 'shared' },
  palettes: 'all-registered',
  byteBudget: { familyKiB: 80, basis: 'design' },
  fontPairings: FONT_PAIRINGS,
} as const;
const fonts = ['font-serif', 'font-sans'] as const;

export const FAMILY_MANIFESTS: Record<FamilyId, FamilyManifest> = {
  // Ceremonial: the opening words and the verse first, then the couple, then the day.
  gapura: {
    ...SHARED,
    family: 'gapura',
    sections: ['cover', 'notices', 'greeting', 'quote', 'profiles', 'events', 'ceremony', 'programme', 'story', 'gallery', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
    coverIncludes: [],
    orderRules: [
      ['greeting', 'events'],
      ['profiles', 'events'],
    ],
    sectionOrders: {
      'story-first': ['cover', 'notices', 'greeting', 'quote', 'profiles', 'story', 'gallery', 'events', 'ceremony', 'programme', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
      'photos-last': ['cover', 'notices', 'greeting', 'quote', 'profiles', 'events', 'ceremony', 'programme', 'story', 'streaming', 'share', 'gallery', 'gift', 'rsvp', 'guestbook', 'footer'],
    },
    startsNewFor: ['wedding'],
    photoSlots: { cover: { phone: '4:3', wide: 'bounded' }, portrait: 'arch', gallery: { tile: '3:4', columns: { phone: 2, wide: 2 } } },
    logoFrame: 'center',
    motionTier: 1,
    provenance: { fonts, art: 'css-only', brief: 'templates/_briefs/gapura.md' },
  },
  // A stack of printed cards, in the ceremonial order.
  kartu: {
    ...SHARED,
    family: 'kartu',
    sections: ['cover', 'notices', 'greeting', 'quote', 'profiles', 'events', 'ceremony', 'programme', 'story', 'gallery', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
    coverIncludes: [],
    orderRules: [
      ['greeting', 'events'],
      ['profiles', 'events'],
    ],
    sectionOrders: {
      'story-first': ['cover', 'notices', 'greeting', 'quote', 'profiles', 'story', 'gallery', 'events', 'ceremony', 'programme', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
      'photos-last': ['cover', 'notices', 'greeting', 'quote', 'profiles', 'events', 'ceremony', 'programme', 'story', 'streaming', 'share', 'gallery', 'gift', 'rsvp', 'guestbook', 'footer'],
    },
    startsNewFor: [],
    photoSlots: { cover: { phone: '4:3', wide: 'bounded' }, portrait: 'card', gallery: { tile: '1:1', columns: { phone: 2, wide: 2 } } },
    logoFrame: 'start',
    motionTier: 0,
    provenance: { fonts, art: 'css-only', brief: 'templates/_briefs/kartu.md' },
  },
  // A celebration leads with who and when; the opening words follow the facts, in alternating bands.
  riang: {
    ...SHARED,
    family: 'riang',
    sections: ['cover', 'notices', 'profiles', 'events', 'ceremony', 'programme', 'greeting', 'quote', 'story', 'gallery', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
    coverIncludes: [],
    orderRules: [
      ['events', 'greeting'],
      ['events', 'quote'],
    ],
    sectionOrders: {
      'story-first': ['cover', 'notices', 'profiles', 'story', 'gallery', 'events', 'ceremony', 'programme', 'greeting', 'quote', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
      'photos-last': ['cover', 'notices', 'profiles', 'events', 'ceremony', 'programme', 'greeting', 'quote', 'story', 'streaming', 'share', 'gallery', 'gift', 'rsvp', 'guestbook', 'footer'],
    },
    startsNewFor: ['birthday', 'aqiqah', 'tasyakuran', 'khitanan'],
    photoSlots: { cover: { phone: '1:1', wide: '1:1' }, portrait: 'round', gallery: { tile: '1:1', columns: { phone: 2, wide: 3 } } },
    logoFrame: 'center',
    motionTier: 1,
    provenance: { fonts, art: 'css-only', brief: 'templates/_briefs/riang.md' },
  },
  // Programme-led: the agenda comes before the events with address and map; the opening words sit in the cover letter.
  lontar: {
    ...SHARED,
    family: 'lontar',
    sections: ['cover', 'notices', 'profiles', 'ceremony', 'programme', 'events', 'quote', 'story', 'gallery', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
    coverIncludes: ['greeting'],
    orderRules: [
      ['programme', 'events'],
      ['ceremony', 'events'],
    ],
    sectionOrders: {
      'story-first': ['cover', 'notices', 'profiles', 'story', 'gallery', 'ceremony', 'programme', 'events', 'quote', 'streaming', 'share', 'gift', 'rsvp', 'guestbook', 'footer'],
      'photos-last': ['cover', 'notices', 'profiles', 'ceremony', 'programme', 'events', 'quote', 'story', 'streaming', 'share', 'gallery', 'gift', 'rsvp', 'guestbook', 'footer'],
    },
    startsNewFor: ['corporate'],
    photoSlots: { cover: { phone: '4:3', wide: 'bounded' }, portrait: 'leaf', gallery: { tile: '1:1', columns: { phone: 2, wide: 3 } } },
    logoFrame: 'start',
    motionTier: 0,
    provenance: { fonts, art: 'css-only', brief: 'templates/_briefs/lontar.md' },
  },
};

/**
 * The order a page is composed in: the family's declared sections, then every section it neither declares nor draws in
 * its cover, each placed after the nearest section before it in `SECTION_IDS` (the shared fallback draws it).
 */
export function composedSectionOrder(manifest: FamilyManifest): SectionId[] {
  const order = [...manifest.sections];
  for (const id of SECTION_IDS) {
    if (order.includes(id) || manifest.coverIncludes.includes(id)) continue;
    const canonical = SECTION_IDS.indexOf(id);
    let at = 0;
    for (let index = order.length - 1; index >= 0; index--) {
      if (SECTION_IDS.indexOf(order[index]) < canonical && order[index] !== 'footer') {
        at = index + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  return order;
}

/** Every problem with a manifest, empty when it is valid; the tests and `pnpm harness families` run it on each family. */
export function validateFamilyManifest(manifest: FamilyManifest): string[] {
  const problems: string[] = [];
  const where = (id: SectionId) => manifest.sections.indexOf(id);
  if (manifest.schemaVersion !== 1) problems.push(`schemaVersion ${manifest.schemaVersion} is not 1`);
  if (!(FAMILY_IDS as readonly string[]).includes(manifest.family)) problems.push(`unknown family ${manifest.family}`);
  const seen = new Set<string>();
  for (const id of [...manifest.sections, ...manifest.coverIncludes]) {
    if (!(SECTION_IDS as readonly string[]).includes(id)) problems.push(`unknown section ${id}`);
    if (seen.has(id)) problems.push(`section ${id} is declared twice`);
    seen.add(id);
  }
  if (manifest.sections[0] !== 'cover') problems.push('the cover comes first');
  if (manifest.sections[1] !== 'notices') problems.push('the notices follow the cover, before any other section');
  if (manifest.sections.at(-1) !== 'footer') problems.push('the footer comes last');
  for (const id of manifest.coverIncludes) if (id === 'cover' || id === 'notices' || id === 'footer') problems.push(`the cover cannot include ${id}`);
  const composed = composedSectionOrder(manifest);
  for (const [first, then] of [...CONTRACT_ORDER_RULES, ...manifest.orderRules]) {
    const a = composed.indexOf(first);
    const b = composed.indexOf(then);
    if (a >= 0 && b >= 0 && a > b) problems.push(`${first} must come before ${then}`);
  }
  for (const [first, then] of manifest.orderRules) {
    if (where(first) < 0 || where(then) < 0) problems.push(`order rule ${first} → ${then} names a section the family does not compose`);
  }
  if (!(manifest.motionTier in MOTION_TIERS)) problems.push(`motion tier ${manifest.motionTier} does not exist`);
  for (const type of ALL_EVENT_TYPES) if (!manifest.eventTypes.includes(type)) problems.push(`event type ${type} is not rendered`);
  for (const type of manifest.startsNewFor) if (!manifest.eventTypes.includes(type)) problems.push(`starts new ${type} invitations it does not render`);
  if (manifest.provenance.fonts.length > 2) problems.push('more than two font families');
  if (manifest.byteBudget.familyKiB <= 0) problems.push('no byte budget');
  // G-041: each section-order option keeps every rule above. A section an option leaves out is still composed, at its
  // canonical place (`composedSectionOrder`), so only duplicates, unknown ids and sections the cover draws are refused.
  for (const option of SECTION_ORDER_OPTIONS) {
    if (option === 'standard') continue;
    const order = manifest.sectionOrders[option];
    if (!order) {
      problems.push(`section order ${option} is not declared`);
      continue;
    }
    const listed = new Set<string>();
    for (const id of order) {
      if (!(SECTION_IDS as readonly string[]).includes(id)) problems.push(`section order ${option}: unknown section ${id}`);
      if (listed.has(id)) problems.push(`section order ${option} declares ${id} twice`);
      if (manifest.coverIncludes.includes(id)) problems.push(`section order ${option} composes ${id}, which the cover draws`);
      listed.add(id);
    }
    for (const problem of orderProblems(manifest, order)) problems.push(`section order ${option}: ${problem}`);
  }
  for (const key of Object.keys(manifest.sectionOrders)) {
    if (key === DEFAULT_SECTION_ORDER || !(SECTION_ORDER_OPTIONS as readonly string[]).includes(key)) problems.push(`unknown section order ${key}`);
  }
  if (manifest.fontPairings.length === 0) problems.push('no font pairing');
  if (new Set(manifest.fontPairings).size !== manifest.fontPairings.length) problems.push('a font pairing is declared twice');
  for (const pairing of manifest.fontPairings) {
    if (!(FONT_PAIRINGS as readonly string[]).includes(pairing)) problems.push(`unknown font pairing ${pairing}`);
  }
  return problems;
}

/** The position and order rules one candidate order must keep (the same checks as the declared order above). */
function orderProblems(manifest: FamilyManifest, sections: readonly SectionId[]): string[] {
  const problems: string[] = [];
  if (sections[0] !== 'cover') problems.push('the cover comes first');
  if (sections[1] !== 'notices') problems.push('the notices follow the cover, before any other section');
  if (sections.at(-1) !== 'footer') problems.push('the footer comes last');
  const composed = composedSectionOrder({ ...manifest, sections });
  for (const [first, then] of [...CONTRACT_ORDER_RULES, ...manifest.orderRules]) {
    const a = composed.indexOf(first);
    const b = composed.indexOf(then);
    if (a >= 0 && b >= 0 && a > b) problems.push(`${first} must come before ${then}`);
  }
  return problems;
}

/** G-041: the order a stored choice selects; an unset, unknown or retired value keeps the family's own order. */
export function sectionOrderFor(manifest: FamilyManifest, option: unknown): readonly SectionId[] {
  if (option === DEFAULT_SECTION_ORDER || !(SECTION_ORDER_OPTIONS as readonly unknown[]).includes(option)) return manifest.sections;
  return manifest.sectionOrders[option as Exclude<SectionOrderOption, 'standard'>] ?? manifest.sections;
}

/** G-041: a stored font pairing the family offers, otherwise the family's default (its first pairing). */
export function fontPairingFor(manifest: FamilyManifest, option: unknown): FontPairing {
  return manifest.fontPairings.find((pairing) => pairing === option) ?? manifest.fontPairings[0];
}

export type FamilyChoices = {
  /** The manifest in the chosen order; the family's own object when the order is its own. */
  manifest: FamilyManifest;
  /** `data-font-pairing` for the page root; absent for the default pairing. */
  fontPairing: FontPairing | undefined;
};

/**
 * G-041: what a layout applies from the invitation's theme. Without choices (or with values the contract does not
 * offer) it returns the family's own manifest and no attribute, so such a page renders exactly as before. Rollback:
 * return `{ manifest, fontPairing: undefined }` here and every page draws its family's own look again; the stored keys
 * stay valid and are simply ignored.
 */
export function familyChoices(manifest: FamilyManifest, theme: { sectionOrder?: unknown; fontPairing?: unknown } | undefined): FamilyChoices {
  const sections = sectionOrderFor(manifest, theme?.sectionOrder);
  const pairing = fontPairingFor(manifest, theme?.fontPairing);
  return {
    manifest: sections === manifest.sections ? manifest : { ...manifest, sections },
    fontPairing: pairing === manifest.fontPairings[0] ? undefined : pairing,
  };
}
