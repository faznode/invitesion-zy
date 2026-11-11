import type { Tier } from '../pricing';
import type { DetailConfig } from './detail-config';
import { mediaReferenceIssues, type MediaReferenceIssue } from './media-ownership';
import { changedThemeFields, needsTierLookup, storedThemeFields, themeChangeIssues, type ThemeFields, type ThemeIssue } from './theme-entitlement';

/**
 * B-035: the decision every content write makes under the invitation's row lock, in both writers (`content-next.ts` and
 * `services/api/src/content/`), shared through `contracts/vectors/content-rules.json`. Pure: the writer supplies the
 * locked row, the current version and, only when the change needs it, the invitation's tier.
 *
 * Order: a stale base is refused before the content is judged (it was prepared from a config that is no longer stored);
 * then D-040's media references and the theme entitlement (B-041, with B-036's switch within the tier), in the order the
 * editor's PATCH has always answered them. The version is `max(invitation_versions.version_no)` for the invitation, 0
 * when it has no row yet: creation writes 1 and every content write the next number in the transaction that holds the
 * lock, so it only grows.
 *
 * The purchased theme (`invitations.template_id`) is not an input: the writer reads it only to look up the tier, and a
 * theme switch is judged against the catalog (D-054), never against that row id (a different id space).
 */

export type ContentWriteInput = {
  invitationId: number;
  eventType: string;
  /** The config the row holds under the lock. */
  storedConfig: unknown;
  /** The whole config the write stores (prepared by the content contract from the base version's config). */
  config: unknown;
  /** The top-level sections the save sent; only their references are judged (D-040), and the theme only when sent. */
  touchedSections: readonly string[];
  /** The version the write was prepared from. */
  baseVersion: number;
  currentVersion: number;
};

export type ContentRefusal =
  | { kind: 'conflict'; currentVersion: number }
  | { kind: 'media'; issues: MediaReferenceIssue[] }
  | { kind: 'theme'; issues: ThemeIssue[] };

export type ContentDecision = ContentRefusal | { kind: 'write'; nextVersion: number };

/** Code-unit order: the same as Rust's byte order for the ASCII paths and reasons the rules produce. */
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The theme fields a write changes; empty unless the save sent its theme. */
export function themeChangeOf(input: Pick<ContentWriteInput, 'touchedSections' | 'storedConfig' | 'config'>): ThemeFields {
  if (!input.touchedSections.includes('theme')) return {};
  return changedThemeFields(storedThemeFields(input.storedConfig), storedThemeFields(input.config));
}

/** Whether the decision needs the invitation's tier from the database: only a changed Premium palette or theme does. */
export function contentNeedsTier(input: Pick<ContentWriteInput, 'touchedSections' | 'storedConfig' | 'config'>): boolean {
  return needsTierLookup(themeChangeOf(input));
}

export function contentDecision(input: ContentWriteInput, tier: Tier): ContentDecision {
  if (input.baseVersion !== input.currentVersion) return { kind: 'conflict', currentVersion: input.currentVersion };
  const media = mediaReferenceIssues(input.config, {
    invitationId: input.invitationId,
    eventType: input.eventType,
    touchedSections: input.touchedSections,
  });
  // Sorted by path, then reason, so both writers name the same fields in the same order (the walk follows key order, which
  // a JSON parser need not keep).
  if (media.length) return { kind: 'media', issues: [...media].sort((a, b) => compareText(a.path, b.path) || compareText(a.reason, b.reason)) };
  const theme = themeChangeIssues(themeChangeOf(input), tier);
  if (theme.length) return { kind: 'theme', issues: theme };
  return { kind: 'write', nextVersion: input.currentVersion + 1 };
}

/** What the facade hands the selected writer: the prepared whole, the sections sent and the version it came from. */
export type ContentWriteRequest = {
  invitationId: number;
  baseVersion: number;
  config: DetailConfig;
  touchedSections: string[];
};

/**
 * A writer's answer. `signin`: no session token for the API (or the API knows no live customer behind it). `unconfirmed`:
 * the API's answer was lost twice under one idempotency key, so the write may or may not have committed; nothing is
 * retried under a new key, and the editor keeps the edits and reports it.
 */
export type ContentWriteOutcome =
  | { kind: 'saved'; version: number }
  | ContentRefusal
  | { kind: 'notfound' }
  | { kind: 'signin' }
  | { kind: 'unconfirmed' };
