import { z } from 'zod';

/**
 * `template.manifest.json` schema v1 (masterplan 08 §2). Strict everywhere: an unknown key is a failure, so a typo
 * can never silently switch a gate off.
 */
export const NICHES = ['wedding', 'islamic-wedding', 'engagement', 'birthday', 'aqiqah', 'khitanan', 'corporate', 'graduation', 'memorial'] as const;
export const TIERS = ['basic', 'premium', 'signature'] as const;
export const SECTION_IDS = ['cover', 'couple', 'events', 'countdown', 'gallery', 'gift', 'rsvp', 'wishes', 'quote', 'closing'] as const;
export const LOCALES = ['id', 'en'] as const;
/** Typography ids that need no font file: the renderer maps them to system stacks. */
export const SYSTEM_FONTS = ['system-serif', 'system-sans'] as const;

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case id');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#rrggbb');
const relativePath = z
  .string()
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._/-]+$/, 'relative path inside the template directory');

const slot = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/),
    kind: z.enum(['text', 'richtext', 'image', 'datetime', 'list']),
    maxLength: z.number().int().positive().optional(),
    localized: z.boolean().optional(),
  })
  .strict();

const section = z.object({ id: z.enum(SECTION_IDS), required: z.boolean(), slots: z.array(slot) }).strict();

/** One declared asset; exported so other asset registers (the G-016 theme art) are validated against the same shape. */
export const assetSchema = z
  .object({
    id: kebab,
    path: relativePath,
    kind: z.enum(['image', 'font', 'audio', 'model', 'og']),
    bytes: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    license: z.string().min(1),
    source: z.string().min(1),
    author: z.string().min(1),
    provenance: z.enum(['own-work', 'licensed', 'generated']),
    deferred: z.boolean(),
  })
  .strict();

const budgetOverrides = z
  .object({
    coldLoadKiB: z.number().positive(),
    jsKiB: z.number().nonnegative(),
    fontsKiB: z.number().nonnegative(),
    imageKiB: z.number().positive(),
    audioKiB: z.number().nonnegative(),
    modelKiB: z.number().nonnegative(),
    fallbackKiB: z.number().nonnegative(),
  })
  .partial()
  .strict();

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: kebab,
    name: z.string().min(1).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
    niche: z.enum(NICHES),
    tier: z.enum(TIERS),
    locales: z.array(z.enum(LOCALES)).min(1),
    defaultLocale: z.enum(LOCALES),
    sections: z.array(section).min(1),
    tokens: z
      .object({
        colors: z.object({ background: hex, surface: hex, text: hex, mutedText: hex, accent: hex, onAccent: hex }).strict(),
        typography: z.object({ display: kebab, body: kebab }).strict(),
        radius: z.string().regex(/^\d+(\.\d+)?(px|rem)$/),
        spacingScale: z.array(z.number().nonnegative()).min(3),
      })
      .strict(),
    motion: z
      .object({
        level: z.number().int().min(0).max(3),
        durationsMs: z.array(z.number().int().min(0).max(5000)),
        easing: z.string().min(1),
        reducedMotion: z.enum(['none', 'fade-only']),
      })
      .strict(),
    threeD: z
      .object({ asset: kebab, fallbackImage: kebab, lazy: z.literal(true), trigger: z.enum(['interaction', 'visible']), maxBytes: z.number().int().positive() })
      .strict()
      .optional(),
    audio: z
      .object({ asset: kebab, preload: z.literal('none'), startsOn: z.literal('open-gesture'), control: z.literal(true) })
      .strict()
      .optional(),
    assets: z.array(assetSchema),
    personalization: z
      .object({
        guestName: z.object({ slot: z.literal('guest.name'), maxLength: z.number().int().positive().max(150), dir: z.literal('auto') }).strict(),
        allowedSources: z.tuple([z.literal('guests-table')]),
      })
      .strict(),
    accessibility: z
      .object({
        minContrast: z.object({ body: z.number().min(4.5), large: z.number().min(3) }).strict(),
        lang: z.enum(LOCALES),
        focusVisible: z.literal(true),
      })
      .strict(),
    budgets: budgetOverrides.optional(),
    strings: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), z.record(z.enum(LOCALES), z.string())),
    quotes: z.array(z.object({ section: z.enum(SECTION_IDS), corpusId: z.string().min(1) }).strict()).optional(),
    originality: z.object({ statement: z.string().min(20), references: z.array(z.string()) }).strict(),
    og: z.object({ asset: kebab }).strict(),
    externalScripts: z.array(z.string()),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestAsset = Manifest['assets'][number];
export type Tier = (typeof TIERS)[number];
