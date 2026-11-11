import type { Tier } from '../pricing';
import { contentDecision } from './content-rules';
import type { DetailConfig } from './detail-config';
import type { MediaReferenceIssue } from './media-ownership';
import { resolveEventType } from './template-event-types';
import { storedThemeFields, type ThemeIssue } from './theme-entitlement';

/**
 * B-037 (D-055): the decision every draft creation makes before its row is written, in both content writers
 * (`create-next.ts` and `services/api/src/content/create.rs`), shared through `contracts/vectors/creation-rules.json`.
 * Pure: the writer supplies the template row it read (category, tier, the catalog id its defaults name) and the config the
 * facade prepared (`initialDraftConfig`).
 *
 * Order:
 * 1. The creation itself: the event type is the template's (its catalog category through `resolveEventType`, or one of
 *    the six core types when there is no template), and the config's `theme.templateId` is the catalog id the template's
 *    own defaults name. That pins `config.theme.templateId` (a catalog id) to `invitations.template_id` (a row id, the
 *    price anchor of checkout, publishing and settlement) at birth, which B-036's switch rule (D-054) relies on.
 * 2. Then the content rules of an editor save, applied to the whole config as if every section were sent to an empty
 *    invitation at version 0 (B-035's `contentDecision`): D-040's references (a new invitation owns no upload, so any
 *    invitation-scoped reference is refused) and the theme entitlement against the template's tier (B-041).
 */

export const CORE_EVENT_TYPES = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'] as const;

export type CreationIssue = {
  path: 'eventType' | 'theme.templateId';
  reason: 'event-type' | 'template-mismatch';
};

export type CreationInput = {
  eventType: string;
  /** The template row's category (`templates.category`), or null for a creation without a template. */
  templateCategory: string | null;
  /** The catalog id the template row's defaults name (`default_config.theme.templateId`), null when they name none. */
  templateCatalogId: number | null;
  /** The template row's tier (`templates.is_premium`); Standard without a template. */
  templateTier: Tier;
  /** The whole config the creation stores. */
  config: unknown;
};

export type CreationRefusal =
  | { kind: 'creation'; issues: CreationIssue[] }
  | { kind: 'media'; issues: MediaReferenceIssue[] }
  | { kind: 'theme'; issues: ThemeIssue[] };

export type CreationDecision = CreationRefusal | { kind: 'write' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The top-level sections of a config, sorted: a creation sends every section it holds. */
export function creationSections(config: unknown): string[] {
  return isRecord(config) ? Object.keys(config).sort() : [];
}

/**
 * The catalog id a template row's stored defaults name (a positive safe integer), or null (a row seeded before the
 * catalog, or no defaults).
 */
export function catalogIdOfDefaults(defaultConfig: unknown): number | null {
  const theme = isRecord(defaultConfig) ? defaultConfig.theme : undefined;
  const id = isRecord(theme) ? theme.templateId : undefined;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function creationDecision(input: CreationInput): CreationDecision {
  const issues: CreationIssue[] = [];
  const expectedType = input.templateCategory === null ? null : resolveEventType(input.templateCategory);
  const typeOk =
    input.templateCategory === null ? (CORE_EVENT_TYPES as readonly string[]).includes(input.eventType) : expectedType === input.eventType;
  if (!typeOk) issues.push({ path: 'eventType', reason: 'event-type' });
  if ((storedThemeFields(input.config).templateId ?? null) !== input.templateCatalogId) {
    issues.push({ path: 'theme.templateId', reason: 'template-mismatch' });
  }
  if (issues.length) return { kind: 'creation', issues };

  const content = contentDecision(
    {
      invitationId: 0,
      eventType: input.eventType,
      storedConfig: {},
      config: input.config,
      touchedSections: creationSections(input.config),
      baseVersion: 0,
      currentVersion: 0,
    },
    input.templateTier,
  );
  if (content.kind === 'media' || content.kind === 'theme') return content;
  return { kind: 'write' };
}

/** Longest slug base a creation stores: room for a `-200` suffix inside `invitations.slug` (120). */
export const SLUG_BASE_MAX = 60;
const SLUG_BASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlugBase(value: string): boolean {
  return value.length <= SLUG_BASE_MAX && SLUG_BASE_PATTERN.test(value);
}

/** A slugified title cut to `SLUG_BASE_MAX` without a trailing hyphen; the fallback when nothing usable is left. */
export function boundedSlugBase(slug: string, fallback: string): string {
  const cut = slug.slice(0, SLUG_BASE_MAX).replace(/-+$/, '');
  return isSlugBase(cut) ? cut : fallback;
}

/** How far a creation counts before it gives up on numbered slugs (the rule of `slug.ts`'s `resolveUniqueSlug`). */
export const SLUG_SUFFIX_LIMIT = 200;

/**
 * The first free slug for `base`: `base`, then `base-2` … `base-200`, given the slugs already taken among `base` and
 * `base-<n>`. Null when all are taken; the writer then appends the time in base 36, as `resolveUniqueSlug` does.
 */
export function firstFreeSlug(base: string, taken: Iterable<string>, limit = SLUG_SUFFIX_LIMIT): string | null {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= limit; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

/** 1–255 visible ASCII characters: the API's `Idempotency-Key` rule, so the same key works through either writer. */
export function isCreationKey(value: string): boolean {
  return value.length >= 1 && value.length <= 255 && /^[\x21-\x7e]+$/.test(value);
}

/** What the facade hands the selected writer. */
export type DraftCreateRequest = {
  /** The template row (`templates.id`, the price anchor), or null. */
  templateId: number | null;
  eventType: string;
  /** The slug before any numbered suffix (`isSlugBase`). */
  slugBase: string;
  config: DetailConfig;
  /** The creation's idempotency key (`isCreationKey`), or null for a creation without one. */
  creationKey: string | null;
};

/**
 * A writer's answer. `created`: the draft exists, `replayed` when an earlier creation with this owner and key made it.
 * `template-missing`: no template row with that id. `signin` / `unconfirmed`: as for content saves (B-035).
 */
export type DraftCreateOutcome =
  | { kind: 'created'; invitationId: number; slug: string; replayed: boolean }
  | CreationRefusal
  | { kind: 'template-missing' }
  | { kind: 'signin' }
  | { kind: 'unconfirmed' };
