/**
 * Server-side theme entitlement for config writes (B-041, D-042; B-036, D-054). Pure rules; the database lookup of the
 * invitation's tier lives in the content writers (`content-next.ts`, `services/api/src/content/http.rs`).
 *
 * Checkout charges by the tier of the invitation's purchased theme (`invitations.template_id`, a `templates` row id →
 * `templates.is_premium`), while guests see `config.theme.paletteId` (content contract: `templateId` is host-only and
 * never rendered). Without a check, a Standard invitation could take a Premium look through the config PATCH, before or
 * after paying.
 *
 * Rules, applied only to fields a write changes, so saving any other part of a stored config never fails:
 * - `paletteId` must be a registered palette, and a Premium palette needs a Premium entitlement. A palette is Premium
 *   when no free catalog theme uses it. The fallback palette is never Premium: a page without a palette renders it.
 * - `templateId` is a catalog id (`templates.ts`, e.g. 101), not a `templates` row id. It may name any catalog theme
 *   within the invitation's entitled tier (B-036): a Standard theme always, a Premium or Signature theme only with a
 *   Premium entitlement; an id the catalog does not know is refused. A switch changes the config only: it never writes
 *   `invitations.template_id`, so checkout, publishing and settlement keep pricing the purchased theme, and the
 *   entitlement cannot change through a switch (D-054). A higher tier waits for U6's upgrade.
 * - G-041: `sectionOrder` and `fontPairing` must be options the family contract declares (`family-manifest.ts`). They
 *   are free in every tier, so they never need the tier lookup.
 */
import type { Tier } from '../pricing';
import { FONT_PAIRINGS, SECTION_ORDER_OPTIONS } from './family-manifest';
import { paletteIds } from './palettes';
import { invitationTemplates } from './templates';

/** What every guest page renders when its palette is missing or unknown (`palette()` in palettes.ts). */
export const FALLBACK_PALETTE_ID = 'ivory';

const STANDARD_PALETTES = new Set<string>([
  FALLBACK_PALETTE_ID,
  ...invitationTemplates.filter((template) => template.tier === 'free').map((template) => template.paletteId),
]);
const REGISTERED_PALETTES = new Set<string>(paletteIds);

/** The tier a palette needs, or null for an id the palette registry does not know. */
export function paletteTier(paletteId: string): Tier | null {
  if (!REGISTERED_PALETTES.has(paletteId)) return null;
  return STANDARD_PALETTES.has(paletteId) ? 'standard' : 'premium';
}

/**
 * Every catalog theme and the tier it needs, in catalog order: free themes are Standard, premium and signature themes
 * Premium, as `template-sync.ts` stores them (`is_premium = tier !== 'free'`). The Rust writer carries the same list,
 * checked by `contracts/vectors/content-rules.json`.
 */
export const CATALOG_THEME_TIERS: readonly (readonly [number, Tier])[] = invitationTemplates.map(
  (template) => [template.id, template.tier === 'free' ? 'standard' : 'premium'] as const,
);
const CATALOG_TIER_BY_ID = new Map<number, Tier>(CATALOG_THEME_TIERS);

/** The tier a catalog theme needs, or null for an id the catalog does not know. */
export function catalogThemeTier(templateId: number): Tier | null {
  return CATALOG_TIER_BY_ID.get(templateId) ?? null;
}

export type ThemeFields = { templateId?: number; paletteId?: string; sectionOrder?: string; fontPairing?: string };

/** The theme fields of a stored config, read leniently: stored JSON may predate today's schema. */
export function storedThemeFields(config: unknown): ThemeFields {
  const theme = (config as { theme?: unknown } | null)?.theme;
  if (!theme || typeof theme !== 'object') return {};
  const { templateId, paletteId, sectionOrder, fontPairing } = theme as Record<string, unknown>;
  return {
    templateId: typeof templateId === 'number' ? templateId : undefined,
    paletteId: typeof paletteId === 'string' ? paletteId : undefined,
    sectionOrder: typeof sectionOrder === 'string' ? sectionOrder : undefined,
    fontPairing: typeof fontPairing === 'string' ? fontPairing : undefined,
  };
}

/** Fields a write sets to a new value. A cleared field is not a change that needs an entitlement. */
export function changedThemeFields(stored: ThemeFields, next: ThemeFields | undefined): ThemeFields {
  const changed: ThemeFields = {};
  if (next?.templateId !== undefined && next.templateId !== stored.templateId) changed.templateId = next.templateId;
  if (next?.paletteId !== undefined && next.paletteId !== stored.paletteId) changed.paletteId = next.paletteId;
  if (next?.sectionOrder !== undefined && next.sectionOrder !== stored.sectionOrder) changed.sectionOrder = next.sectionOrder;
  if (next?.fontPairing !== undefined && next.fontPairing !== stored.fontPairing) changed.fontPairing = next.fontPairing;
  return changed;
}

/**
 * Every field a theme refusal names and every rule it cites (B-041, B-036, G-041). `content-api.ts` maps the Rust
 * writer's problems through these lists, so a rule added here reaches the editor through both writers (session 44 found
 * G-041's two rules dropped from the Rust writer's answer by a list that predated them).
 */
export const THEME_ISSUE_PATHS = ['theme.templateId', 'theme.paletteId', 'theme.sectionOrder', 'theme.fontPairing'] as const;
export const THEME_ISSUE_REASONS = [
  'unknown-template',
  'premium-template',
  'unknown-palette',
  'premium-palette',
  'unknown-section-order',
  'unknown-font-pairing',
] as const;

export type ThemeIssue = {
  path: (typeof THEME_ISSUE_PATHS)[number];
  reason: (typeof THEME_ISSUE_REASONS)[number];
};

/** Whether the changed fields need the database lookup of the invitation's tier: only a Premium palette or theme does. */
export function needsTierLookup(changed: ThemeFields): boolean {
  if (changed.paletteId !== undefined && paletteTier(changed.paletteId) === 'premium') return true;
  return changed.templateId !== undefined && catalogThemeTier(changed.templateId) === 'premium';
}

/**
 * The refusals for the changed fields under the invitation's entitled tier ('premium' when its purchased theme is
 * Premium or a PAID order bought a Premium tier for it). The theme's issue comes first.
 */
export function themeChangeIssues(changed: ThemeFields, tier: Tier): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  if (changed.templateId !== undefined) {
    const needed = catalogThemeTier(changed.templateId);
    if (needed === null) issues.push({ path: 'theme.templateId', reason: 'unknown-template' });
    else if (needed === 'premium' && tier !== 'premium') issues.push({ path: 'theme.templateId', reason: 'premium-template' });
  }
  if (changed.paletteId !== undefined) {
    const needed = paletteTier(changed.paletteId);
    if (needed === null) issues.push({ path: 'theme.paletteId', reason: 'unknown-palette' });
    else if (needed === 'premium' && tier !== 'premium') issues.push({ path: 'theme.paletteId', reason: 'premium-palette' });
  }
  if (changed.sectionOrder !== undefined && !(SECTION_ORDER_OPTIONS as readonly string[]).includes(changed.sectionOrder)) {
    issues.push({ path: 'theme.sectionOrder', reason: 'unknown-section-order' });
  }
  if (changed.fontPairing !== undefined && !(FONT_PAIRINGS as readonly string[]).includes(changed.fontPairing)) {
    issues.push({ path: 'theme.fontPairing', reason: 'unknown-font-pairing' });
  }
  return issues;
}

/** G-041: whether every refusal is a layout choice outside the contract (the editor words that apart from a tier). */
export function onlyChoiceIssues(issues: readonly Pick<ThemeIssue, 'reason'>[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.reason === 'unknown-section-order' || issue.reason === 'unknown-font-pairing');
}

export class ThemeEntitlementError extends Error {
  constructor(readonly issues: ThemeIssue[]) {
    super(`Theme not included in this invitation: ${issues.map((issue) => `${issue.path} (${issue.reason})`).join(', ')}`);
    this.name = 'ThemeEntitlementError';
  }
}
