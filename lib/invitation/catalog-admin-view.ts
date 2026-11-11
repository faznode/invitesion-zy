import {
  catalogIdentityProblems,
  catalogManifestReport,
  deriveCatalogManifest,
  type CatalogManifest,
  type CatalogManifestEntry,
} from './catalog-manifest';
import { THEME_ART_PROVENANCE, THEME_ART_REGISTER, type ThemeArtAsset, type ThemeArtFile } from './theme-art-register';
import { invitationTemplates, type InvitationTemplate, type TemplatePalette } from './templates';

/**
 * G-062's read-only admin surface over the catalog manifests (`catalog-manifest.ts`). Pure: the console pages read the
 * seeded `templates` rows themselves and pass them in, so this module stays testable without a database or a session.
 * Nothing here writes, and nothing here is imported by the public catalog, the guest page or the writers
 * (`tests/g062-catalog-admin.test.ts`).
 */

/** The projection of a catalog template in the `templates` table (`template-sync.ts` matches rows by name). */
export type SeededTemplateRow = { id: number; name: string; isPremium: boolean };

/**
 * What the art records say about review, counted per file; publishing (G-062 step 2) needs a recorded owner approval.
 * A file without a review record counts in none of the three, so a missing record never reads as approved.
 */
export type ArtReviewState = {
  files: number;
  agentSelfReviewed: number;
  ownerReviewPending: number;
  ownerApproved: number;
};

export type SeededState = { rowId: number; premiumAgrees: boolean } | null;

export type CatalogAdminRow = {
  id: number;
  slug: string;
  name: string;
  category: InvitationTemplate['category'];
  tier: InvitationTemplate['tier'];
  /** From the validated manifest; null while the manifest is refused. */
  entitlement: CatalogManifest['entitlement'] | null;
  valid: boolean;
  problems: string[];
  paletteId: string;
  paletteTier: CatalogManifest['palette']['tier'] | null;
  /** The registry's card palette, shown for valid and refused entries alike. */
  swatches: TemplatePalette | null;
  artPool: string | null;
  /** A same-origin `/theme-art/` card image, or null: the console never loads a remote picture. */
  cardArt: string | null;
  review: ArtReviewState;
  seeded: SeededState;
};

export type CatalogAdminSummary = {
  total: number;
  valid: number;
  invalid: number;
  identityProblems: string[];
  /** Distinct art files across the valid manifests (a file shared by two roles counts once). */
  artFiles: number;
  agentSelfReviewed: number;
  ownerReviewPending: number;
  ownerApproved: number;
  notSeeded: number;
  premiumMismatch: number;
  /** Seeded rows whose name no catalog template carries any more; their invitations keep rendering from stored config. */
  orphanRows: SeededTemplateRow[];
};

export type ArtRole = 'card' | 'cover' | 'gallery';

export type CatalogAdminAsset = {
  path: string;
  roles: ArtRole[];
  file: ThemeArtFile | null;
  /** The register entry that produced the file: its prompt, original digest and reviewed crop. */
  source: Pick<ThemeArtAsset, 'id' | 'pool' | 'prompt' | 'sourceSha256' | 'crop'> | null;
  review: string | null;
};

export type CatalogAdminDetail = {
  template: InvitationTemplate;
  manifest: CatalogManifest | null;
  /** The derived candidate, shown verbatim when validation refuses it. */
  candidate: unknown;
  problems: string[];
  assets: CatalogAdminAsset[];
  provenance: typeof THEME_ART_PROVENANCE;
  review: ArtReviewState;
  seeded: SeededState;
};

const REGISTER_BY_PATH = new Map<string, { entry: ThemeArtAsset; file: ThemeArtFile }>(
  THEME_ART_REGISTER.flatMap((entry) =>
    (['cover', 'card', 'gallery'] as const).map((kind) => [entry.files[kind].path, { entry, file: entry.files[kind] }] as const),
  ),
);

const SELF_HOSTED_ART = /^\/theme-art\/[a-z0-9-]+\.webp$/;

type ReviewedFile = { path: string; review?: unknown };

function reviewedFiles(manifest: CatalogManifest | null, candidate: unknown): ReviewedFile[] {
  if (manifest) return manifest.art.files;
  const files = (candidate as { art?: { files?: unknown } } | null)?.art?.files;
  return Array.isArray(files) ? files.filter((file): file is ReviewedFile => typeof file?.path === 'string') : [];
}

export function artReviewState(files: readonly ReviewedFile[]): ArtReviewState {
  const reviews = files.map((file) => (typeof file.review === 'string' ? file.review : ''));
  return {
    files: files.length,
    agentSelfReviewed: reviews.filter((review) => /agent self-review/i.test(review)).length,
    ownerReviewPending: reviews.filter((review) => /owner review pending/i.test(review)).length,
    ownerApproved: reviews.filter((review) => /owner approved/i.test(review) && !/owner review pending/i.test(review)).length,
  };
}

export type OwnerReviewStatus = 'no-files' | 'approved' | 'pending' | 'unrecorded';

/** The owner's review of a set of files: approved only when every file records it. */
export function ownerReviewStatus(review: ArtReviewState): OwnerReviewStatus {
  if (review.files === 0) return 'no-files';
  if (review.ownerApproved === review.files) return 'approved';
  return review.ownerReviewPending > 0 ? 'pending' : 'unrecorded';
}

function seededState(template: InvitationTemplate, rows: readonly SeededTemplateRow[]): SeededState {
  const row = rows.find((candidate) => candidate.name === template.name);
  return row ? { rowId: row.id, premiumAgrees: row.isPremium === (template.tier !== 'free') } : null;
}

function cardArtOf(manifest: CatalogManifest | null, candidate: unknown): string | null {
  const card = manifest?.art.card ?? (candidate as { art?: { card?: unknown } } | null)?.art?.card;
  return typeof card === 'string' && SELF_HOSTED_ART.test(card) ? card : null;
}

function toRow(entry: CatalogManifestEntry, rows: readonly SeededTemplateRow[]): CatalogAdminRow {
  const { template, manifest, problems } = entry;
  const candidate = manifest ? null : deriveCatalogManifest(template);
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    category: template.category,
    tier: template.tier,
    entitlement: manifest?.entitlement ?? null,
    valid: manifest !== null,
    problems,
    paletteId: template.paletteId,
    paletteTier: manifest?.palette.tier ?? null,
    swatches: template.palette ?? null,
    artPool: manifest?.art.pool ?? null,
    cardArt: cardArtOf(manifest, candidate),
    review: artReviewState(reviewedFiles(manifest, candidate)),
    seeded: seededState(template, rows),
  };
}

/** One row per catalog template in catalog order, refused manifests included with their problems. */
export function catalogAdminRows(
  rows: readonly SeededTemplateRow[] = [],
  report: readonly CatalogManifestEntry[] = catalogManifestReport(),
): CatalogAdminRow[] {
  return report.map((entry) => toRow(entry, rows));
}

export function catalogAdminSummary(
  adminRows: readonly CatalogAdminRow[],
  report: readonly CatalogManifestEntry[],
  seededRows: readonly SeededTemplateRow[] = [],
  templates: readonly InvitationTemplate[] = invitationTemplates,
): CatalogAdminSummary {
  const files = new Map<string, ReviewedFile>();
  for (const entry of report) for (const file of entry.manifest?.art.files ?? []) files.set(file.path, file);
  const review = artReviewState([...files.values()]);
  const names = new Set(templates.map((template) => template.name));
  return {
    total: adminRows.length,
    valid: adminRows.filter((row) => row.valid).length,
    invalid: adminRows.filter((row) => !row.valid).length,
    identityProblems: catalogIdentityProblems(templates),
    artFiles: review.files,
    agentSelfReviewed: review.agentSelfReviewed,
    ownerReviewPending: review.ownerReviewPending,
    ownerApproved: review.ownerApproved,
    notSeeded: adminRows.filter((row) => row.seeded === null).length,
    premiumMismatch: adminRows.filter((row) => row.seeded !== null && !row.seeded.premiumAgrees).length,
    orphanRows: seededRows.filter((row) => !names.has(row.name)),
  };
}

function assetsOf(manifest: CatalogManifest | null, candidate: unknown): CatalogAdminAsset[] {
  const art = (manifest?.art ?? (candidate as { art?: Record<string, unknown> } | null)?.art ?? {}) as {
    card?: unknown;
    cover?: unknown;
    gallery?: unknown;
  };
  const roles: [ArtRole, unknown][] = [
    ['card', art.card],
    ['cover', art.cover],
    ...(Array.isArray(art.gallery) ? art.gallery.map((path): [ArtRole, unknown] => ['gallery', path]) : []),
  ];
  const byPath = new Map<string, CatalogAdminAsset>();
  const declared = new Map(reviewedFiles(manifest, candidate).map((file) => [file.path, file]));
  for (const [role, path] of roles) {
    if (typeof path !== 'string') continue;
    const existing = byPath.get(path);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      continue;
    }
    const recorded = REGISTER_BY_PATH.get(path);
    const review = declared.get(path)?.review;
    byPath.set(path, {
      path,
      roles: [role],
      file: recorded?.file ?? null,
      source: recorded
        ? {
            id: recorded.entry.id,
            pool: recorded.entry.pool,
            prompt: recorded.entry.prompt,
            sourceSha256: recorded.entry.sourceSha256,
            crop: recorded.entry.crop,
          }
        : null,
      review: typeof review === 'string' ? review : null,
    });
  }
  return [...byPath.values()];
}

/** The inspectable record of one catalog template, or null when no catalog template has the slug. */
export function catalogAdminDetail(
  slug: string,
  seededRows: readonly SeededTemplateRow[] = [],
  report: readonly CatalogManifestEntry[] = catalogManifestReport(),
): CatalogAdminDetail | null {
  const entry = report.find((candidate) => candidate.template.slug === slug);
  if (!entry) return null;
  const candidate = deriveCatalogManifest(entry.template);
  return {
    template: entry.template,
    manifest: entry.manifest,
    candidate,
    problems: entry.problems,
    assets: assetsOf(entry.manifest, candidate),
    provenance: THEME_ART_PROVENANCE,
    review: artReviewState(reviewedFiles(entry.manifest, candidate)),
    seeded: seededState(entry.template, seededRows),
  };
}
