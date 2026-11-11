/**
 * B-019 (G-017, QA-016; I-28): responsive sources for a host's uploaded image, free of the database so the rules are
 * unit-tested (`tests/b019-image-variants.test.ts`).
 *
 * The upload route enqueues an `image-variants` job for each public upload (`lib/media/variant-jobs.ts`); the Rust job
 * (`services/api/src/media.rs`) writes WebP variants under `variants/<invitation>/<name>/` and lists them in
 * `media_variants`; the guest page turns those rows into a `srcset`.
 * - A source is exactly a public invitation upload, `/media/<invitation>/<24 hex>.<ext>` with an int4 invitation id
 *   (`contracts/vectors/image-variants.json`, run by both languages). Protected uploads (D-040), avatars and absolute
 *   URLs never have variants.
 * - The `standard` ladder goes in the `srcset`; when the browser sends `Save-Data: on`, only the `lite` one (I-28).
 * - No row for an image (no job run yet, variants deleted, flag off): no `srcset`, and the original is served exactly
 *   as before. The original stays the `<img src>` throughout, so a browser without WebP still gets an image.
 */

export const IMAGE_VARIANTS_JOB = 'image-variants';

export type VariantTier = 'standard' | 'lite';
export type VariantRow = { sourceKey: string; variantKey: string; tier: string; width: number };
export type VariantCandidate = { url: string; width: number };
export type ImageVariantSet = Readonly<Record<VariantTier, readonly VariantCandidate[]>>;
/** Keyed by the original's URL (`/media/<key>`), as the config and `media_assets` store it. */
export type ImageVariants = ReadonlyMap<string, ImageVariantSet>;

export const NO_IMAGE_VARIANTS: ImageVariants = new Map();

const INT4_MAX = 2_147_483_647;
const SOURCE_URL = /^\/media\/((0|[1-9]\d{0,14})\/[0-9a-f]{24}\.(?:png|jpg|webp|gif))$/;
const VARIANT_KEY = /^variants\/(?:0|[1-9]\d{0,9})\/[0-9a-f]{24}\/(standard|lite)-([1-9]\d{0,4})\.webp$/;

/** The storage key of a variant source (`<invitation>/<24 hex>.<ext>`), or null for anything else. */
export function variantSourceKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = SOURCE_URL.exec(url);
  if (!match || Number(match[2]) > INT4_MAX) return null;
  return match[1];
}

/** The invitation a variant source belongs to, or null. */
export function variantSourceInvitation(url: string | null | undefined): number | null {
  const key = variantSourceKey(url);
  return key === null ? null : Number(key.slice(0, key.indexOf('/')));
}

/**
 * Rows → variant sets per original. A row whose keys or tier are not the shapes the job writes is ignored, so nothing
 * but a well-formed `/media/variants/…` URL ever reaches a `srcset` (a comma or space there would split a candidate).
 */
export function groupVariants(rows: readonly VariantRow[]): ImageVariants {
  const sets = new Map<string, { standard: VariantCandidate[]; lite: VariantCandidate[] }>();
  for (const row of rows) {
    const source = `/media/${row.sourceKey}`;
    const variant = VARIANT_KEY.exec(row.variantKey);
    // A variant lives under its own source's name: `variants/<invitation>/<24 hex>/…` for `<invitation>/<24 hex>.<ext>`.
    if (!variantSourceKey(source) || !variant || !row.variantKey.startsWith(`variants/${row.sourceKey.replace(/\.[a-z]+$/, '')}/`)) continue;
    const tier = variant[1] as VariantTier;
    const width = Number(variant[2]);
    if (row.tier !== tier || row.width !== width) continue;
    const set = sets.get(source) ?? { standard: [], lite: [] };
    set[tier].push({ url: `/media/${row.variantKey}`, width });
    sets.set(source, set);
  }
  for (const set of sets.values()) {
    set.standard.sort((a, b) => a.width - b.width);
    set.lite.sort((a, b) => a.width - b.width);
  }
  return sets;
}

/** `Save-Data: on` (the only value the header defines); anything else is no request to save data. */
export function saveDataRequested(header: string | null | undefined): boolean {
  return header?.trim().toLowerCase() === 'on';
}

/**
 * The WebP `srcset` for an image, or undefined when it has no variants. Under Save-Data the lite ladder (≤ 640 px, lower
 * quality) replaces the standard one, so the browser can only choose a small file.
 */
export function variantSrcSet(variants: ImageVariants | undefined, src: string | undefined, saveData: boolean): string | undefined {
  if (!variants || !src) return undefined;
  const set = variants.get(src);
  if (!set) return undefined;
  const candidates = saveData && set.lite.length ? set.lite : set.standard;
  if (!candidates.length) return undefined;
  return candidates.map((candidate) => `${candidate.url} ${candidate.width}w`).join(', ');
}

/**
 * Rendered widths of each family's image slots, for `sizes` (Tailwind's rem scale at 16 px; containers and paddings
 * read from the layouts). A slot slightly overestimated costs a step up the ladder, never a blurry image.
 */
export const IMAGE_SIZES = {
  /** Gapura: the arch window, `max-w-sm` inside the header's `px-5`, with `p-2` and a border. */
  gapuraCover: '(min-width: 424px) 366px, calc(100vw - 58px)',
  /** Gapura: two columns in the `max-w-lg px-6` section with `gap-3`. */
  gapuraGallery: '(min-width: 512px) 226px, calc(50vw - 30px)',
  /** Kartu: the full-width photo in the header's `max-w-md`, `px-5`. */
  kartuCover: '(min-width: 488px) 448px, calc(100vw - 40px)',
  /** Kartu: the first photo spans both columns of the `max-w-xl px-5` section. */
  kartuGalleryWide: '(min-width: 576px) 536px, calc(100vw - 40px)',
  kartuGallery: '(min-width: 576px) 262px, calc(50vw - 26px)',
  /** Lontar: full width on phones, `w-96` (or its band column) from `sm`. */
  lontarCover: '(min-width: 640px) 384px, calc(100vw - 40px)',
  /** Lontar and Riang: two columns, three from `sm`, in `max-w-2xl px-5` with `gap-3`. */
  wideGallery: '(min-width: 672px) 203px, (min-width: 640px) calc(33vw - 22px), calc(50vw - 26px)',
  /** B-025 carousels: one photo is `w-4/5` of the section's content box (Gapura `max-w-lg px-6`). */
  gapuraCarousel: '(min-width: 512px) 372px, calc(80vw - 38px)',
  /** Kartu's `max-w-xl px-5`. */
  kartuCarousel: '(min-width: 576px) 429px, calc(80vw - 32px)',
  /** Lontar's and Riang's `max-w-2xl px-5`. */
  wideCarousel: '(min-width: 672px) 506px, calc(80vw - 32px)',
  /** Riang: the round `w-36` photo. */
  riangCover: '144px',
  /** Shared blocks: a person's portrait (`w-40`, `sm:w-44`, `p-1`). */
  portrait: '(min-width: 640px) 168px, 152px',
  /** Shared blocks: the organiser's logo box (`w-60 h-16`). */
  logo: '240px',
} as const;
