import { z } from 'zod';
import { FAMILY_IDS } from './families';
import { DEFAULT_SECTION_ORDER, FONT_PAIRINGS, SECTION_ORDER_OPTIONS } from './family-manifest';
import { paletteHex, paletteIds } from './palettes';
import { catalogThemeTier, paletteTier } from './theme-entitlement';
import { getThemeArt, isSelfHostedThemeArt } from './theme-art';
import { THEME_ART_PROVENANCE, THEME_ART_REGISTER, type ThemeArtAsset, type ThemeArtFile } from './theme-art-register';
import {
  invitationTemplates,
  templateCategoryLabels,
  templatePalettes,
  templateStyleTagLabels,
  type InvitationTemplate,
  type TemplateCategory,
  type TemplateStyleTag,
} from './templates';

/**
 * G-062: one validated manifest per catalog template (§7 step 1 of `09-masterplan/08-template-system-and-harness.md`),
 * derived from the registry (`templates.ts`) and the guest-page palette tokens (`palettes.ts`), so the catalog, the
 * admin surface and `pnpm harness catalog` read one source. A manifest is data only: identity, entitlement, tokens, the
 * preset's sections, the G-041 choices an invitation from the template may make and the G-016 art with its provenance.
 * It carries no HTML, CSS or script; layouts stay code (`components/invitation/`).
 *
 * Nothing here changes what a template renders or what an invitation stores: ids, slugs, categories, tiers, presets and
 * palettes are read from the registry, never rewritten, and an invitation keeps rendering from its stored config.
 */

const CATEGORIES = Object.keys(templateCategoryLabels) as [TemplateCategory, ...TemplateCategory[]];
const STYLE_TAGS = Object.keys(templateStyleTagLabels) as [TemplateStyleTag, ...TemplateStyleTag[]];

/** The preset blocks the public renderer draws, in the editor's order; `events` is always declared (hosts add them). */
export const PRESET_SECTIONS = ['greetings', 'quote', 'events', 'story', 'gallery', 'gift', 'rsvp', 'guestbook', 'music'] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/, 'a lowercase #rrggbb or #rrggbbaa colour');
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 hex digest');
const artPath = z.string().regex(/^\/theme-art\/[a-z0-9-]+\.webp$/, 'a self-hosted /theme-art/ WebP');

export const catalogManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** `config.theme.templateId`; stored invitations depend on it. */
    id: z.number().int().positive(),
    /** The public URL `/templates/<slug>`. */
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1).max(60),
    category: z.enum(CATEGORIES),
    styleTags: z.array(z.enum(STYLE_TAGS)).min(1),
    motif: z.string().min(1),
    tier: z.enum(['free', 'premium', 'signature']),
    /** The invitation tier the template needs (`catalogThemeTier`, as checkout prices it). */
    entitlement: z.enum(['standard', 'premium']),
    locales: z.array(z.enum(['id', 'en'])).min(1),
    defaultLocale: z.enum(['id', 'en']),
    tagline: z.object({ id: z.string().min(1), en: z.string().min(1) }).strict(),
    palette: z
      .object({
        id: z.string().min(1),
        tier: z.enum(['standard', 'premium']),
        tokens: z
          .object({ scheme: z.enum(['light', 'dark']), bg: hex, ink: hex, accent: hex, muted: hex, soft: hex, card: hex, field: hex, line: hex })
          .strict(),
      })
      .strict(),
    /** What the catalog card draws: the guest page's surface, ink and soft tone with the card's own accent. */
    card: z
      .object({
        palette: z.object({ bg: hex, ink: hex, accent: hex, soft: hex }).strict(),
        font: z.enum(['serif', 'sans']),
        sample: z.object({ eyebrow: z.string().min(1), names: z.string().min(1), date: z.string().min(1) }).strict(),
      })
      .strict(),
    sections: z.array(z.enum(PRESET_SECTIONS)).min(1),
    /** G-041: the choices an invitation started from this template may make; the writers refuse anything else. */
    choices: z
      .object({
        families: z.array(z.enum(FAMILY_IDS)).min(1),
        /** Without `theme.familyId` an invitation renders the classic layout (D-041). */
        legacyDefault: z.literal(true),
        sectionOrders: z.array(z.enum(SECTION_ORDER_OPTIONS)).min(1),
        defaultSectionOrder: z.literal(DEFAULT_SECTION_ORDER),
        fontPairings: z.array(z.enum(FONT_PAIRINGS)).min(1),
        /** Palettes within the template's entitlement (B-041): a Standard template never offers a Premium palette. */
        palettes: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    /** G-016: the template-owned art (never copied into an invitation's config) and each file's provenance. */
    art: z
      .object({
        pool: z.string().min(1),
        selfHosted: z.literal(true),
        card: artPath,
        cover: artPath,
        gallery: z.array(artPath).min(1),
        files: z
          .array(
            z
              .object({
                path: artPath,
                sha256,
                bytes: z.number().int().positive(),
                width: z.number().int().positive(),
                height: z.number().int().positive(),
                license: z.literal(THEME_ART_PROVENANCE.license),
                provenance: z.literal(THEME_ART_PROVENANCE.provenance),
                review: z.string().min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    /** Always empty: a manifest can never bring a script (ADR-F1's allowlist starts empty). */
    externalScripts: z.tuple([]),
  })
  .strict();

export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

const REGISTER_FILES = new Map<string, { entry: ThemeArtAsset; file: ThemeArtFile }>(
  THEME_ART_REGISTER.flatMap((entry) => (['cover', 'card', 'gallery'] as const).map((kind) => [entry.files[kind].path, { entry, file: entry.files[kind] }] as const)),
);

const STANDARD_PALETTES = paletteIds.filter((id) => paletteTier(id) === 'standard');

function enabledSections(preset: InvitationTemplate['preset']): CatalogManifest['sections'] {
  const blocks = preset as Record<string, { enabled?: unknown } | unknown[] | undefined>;
  return PRESET_SECTIONS.filter((key) => {
    if (key === 'events') return true;
    const block = blocks[key];
    return Boolean(block && !Array.isArray(block) && block.enabled === true);
  });
}

/** Derives one template's manifest from the registry; `validateCatalogManifest` says whether it holds. */
export function deriveCatalogManifest(template: InvitationTemplate): unknown {
  const art = getThemeArt(template);
  const paths = [...new Set([art.card ?? art.cover, art.cover, ...art.gallery])];
  const pools = new Set(paths.map((path) => REGISTER_FILES.get(path)?.entry.pool ?? 'remote'));
  const entitlement = catalogThemeTier(template.id);
  const language = template.preset.settings?.language;
  return {
    schemaVersion: 1,
    id: template.id,
    slug: template.slug,
    name: template.name,
    category: template.category,
    styleTags: template.styleTags,
    motif: template.motif,
    tier: template.tier,
    entitlement,
    locales: ['id', 'en'],
    defaultLocale: language === 'en' ? 'en' : 'id',
    tagline: template.tagline,
    palette: { id: template.paletteId, tier: paletteTier(template.paletteId), tokens: paletteHex(template.paletteId) },
    card: { palette: templatePalettes[template.paletteId], font: template.font, sample: template.sample },
    sections: enabledSections(template.preset),
    choices: {
      families: [...FAMILY_IDS],
      legacyDefault: true,
      sectionOrders: [...SECTION_ORDER_OPTIONS],
      defaultSectionOrder: DEFAULT_SECTION_ORDER,
      fontPairings: [...FONT_PAIRINGS],
      palettes: entitlement === 'premium' ? [...paletteIds] : STANDARD_PALETTES,
    },
    art: {
      pool: pools.size === 1 ? [...pools][0] : [...pools].join('+'),
      selfHosted: isSelfHostedThemeArt(art),
      card: art.card ?? art.cover,
      cover: art.cover,
      gallery: art.gallery,
      files: paths.map((path) => {
        const found = REGISTER_FILES.get(path);
        return found
          ? {
              path,
              sha256: found.file.sha256,
              bytes: found.file.bytes,
              width: found.file.width,
              height: found.file.height,
              license: THEME_ART_PROVENANCE.license,
              provenance: THEME_ART_PROVENANCE.provenance,
              review: THEME_ART_PROVENANCE.review,
            }
          : { path };
      }),
    },
    externalScripts: [],
  };
}

/**
 * Every rule a manifest must keep, beyond its schema: the registry agreement (ids, slugs, tier, entitlement, palette),
 * a registered palette whose tokens are the guest page's, the template's own palette among its choices, and art served
 * from one self-hosted pool whose files the register records.
 */
export function validateCatalogManifest(candidate: unknown, template: InvitationTemplate): string[] {
  const parsed = catalogManifestSchema.safeParse(candidate);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
  const manifest = parsed.data;
  const problems: string[] = [];
  if (manifest.id !== template.id || manifest.slug !== template.slug) problems.push('id or slug differs from the registry');
  if (manifest.tier !== template.tier || manifest.category !== template.category) problems.push('tier or category differs from the registry');
  if (manifest.entitlement !== (template.tier === 'free' ? 'standard' : 'premium')) problems.push('entitlement does not follow the tier');
  if (manifest.palette.id !== template.paletteId || !paletteIds.includes(manifest.palette.id)) problems.push('palette is not the registry’s registered palette');
  const tokens = paletteHex(manifest.palette.id);
  if (JSON.stringify(manifest.palette.tokens) !== JSON.stringify(tokens)) problems.push('palette tokens differ from palettes.ts');
  const card = manifest.card.palette;
  if (card.bg !== tokens.bg || card.ink !== tokens.ink || card.soft !== tokens.soft) problems.push('card surface, ink or soft tone differs from the guest page');
  if (!manifest.choices.palettes.includes(manifest.palette.id)) problems.push('the template’s own palette is not among its choices');
  if (manifest.entitlement === 'standard' && manifest.choices.palettes.some((id) => paletteTier(id) !== 'standard')) problems.push('a Standard template offers a Premium palette');
  if (manifest.art.pool.includes('+') || manifest.art.pool === 'remote') problems.push(`art mixes pools or is remote (${manifest.art.pool})`);
  const declared = new Set(manifest.art.files.map((file) => file.path));
  for (const path of [manifest.art.card, manifest.art.cover, ...manifest.art.gallery]) {
    if (!declared.has(path)) problems.push(`art ${path} has no file record`);
  }
  for (const file of manifest.art.files) {
    const recorded = REGISTER_FILES.get(file.path);
    if (!recorded || recorded.file.sha256 !== file.sha256 || recorded.file.bytes !== file.bytes) problems.push(`art ${file.path} differs from the register`);
  }
  return problems;
}

export type CatalogManifestEntry = { template: InvitationTemplate; manifest: CatalogManifest | null; problems: string[] };

/** Every catalog template with its derived manifest and the problems, if any (the admin surface lists both). */
export function catalogManifestReport(templates: readonly InvitationTemplate[] = invitationTemplates): CatalogManifestEntry[] {
  return templates.map((template) => {
    const candidate = deriveCatalogManifest(template);
    const problems = validateCatalogManifest(candidate, template);
    return { template, manifest: problems.length ? null : catalogManifestSchema.parse(candidate), problems };
  });
}

/** Ids and slugs are unique across the catalog (stored invitations and public URLs depend on both). */
export function catalogIdentityProblems(templates: readonly InvitationTemplate[] = invitationTemplates): string[] {
  const problems: string[] = [];
  for (const key of ['id', 'slug'] as const) {
    const seen = new Set<unknown>();
    for (const template of templates) {
      if (seen.has(template[key])) problems.push(`duplicate ${key} ${String(template[key])}`);
      seen.add(template[key]);
    }
  }
  return problems;
}

/** The validated manifests in catalog order; a template whose manifest fails is left out and reported. */
export const CATALOG_MANIFESTS: readonly CatalogManifest[] = catalogManifestReport()
  .map((entry) => entry.manifest)
  .filter((manifest): manifest is CatalogManifest => manifest !== null);

export function catalogManifestFor(slug: string): CatalogManifest | undefined {
  return CATALOG_MANIFESTS.find((manifest) => manifest.slug === slug);
}
