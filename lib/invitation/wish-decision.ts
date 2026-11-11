import type { DetailConfig } from './detail-config';

/**
 * R-04 (B-028, B-013, D-044): the wish rules both writers apply, the guest action and the dashboard on the TypeScript
 * side and `services/api/src/wishes/` on the Rust side. `contracts/vectors/wish-decisions.json` runs against both, so
 * `BACKEND_WISHES` may select either. JavaScript's `trim()` and `length` (UTF-16 code units) are the specification, as
 * for the RSVP rules.
 *
 * A wish is VISIBLE (`is_hidden` false), PENDING (hidden and never reviewed: the guestbook's moderation was on when it
 * arrived) or HIDDEN (hidden by the host). The guest page lists visible wishes only; the host sees all of them.
 */

export const WISH_MAX_LENGTH = 1000;
export const REPLY_MAX_LENGTH = 1000;

export type WishState = 'VISIBLE' | 'PENDING' | 'HIDDEN';

/** What the guest page and the writers read from the guestbook section after the lenient read. */
export type GuestbookRules = { enabled: boolean; moderation: boolean; visibility: 'public' | 'host' };

/** A dropped or absent section reads as the schema's defaults: open, unmoderated, public. */
export function guestbookRules(config: Pick<DetailConfig, 'guestbook'>): GuestbookRules {
  const section = config.guestbook;
  return {
    enabled: section?.enabled !== false,
    moderation: section?.moderation === true,
    visibility: section?.visibility === 'host' ? 'host' : 'public',
  };
}

/** Postgres `text` cannot hold U+0000; refusing it keeps both writers' answer a refusal rather than a database error. */
const storable = (text: string) => !text.includes('\u0000');

export type GuestWishDecision =
  | { kind: 'closed'; reason: 'disabled' }
  | { kind: 'invalid' }
  /** The trimmed message, stored hidden (PENDING) while the guestbook is moderated. */
  | { kind: 'write'; message: string; isHidden: boolean };

/** The switch first, then the message: a refusal never depends on a message the page would not have accepted. */
export function decideGuestWish(input: { config: Pick<DetailConfig, 'guestbook'>; message: string }): GuestWishDecision {
  const rules = guestbookRules(input.config);
  if (!rules.enabled) return { kind: 'closed', reason: 'disabled' };
  const message = input.message.trim();
  if (!message || message.length > WISH_MAX_LENGTH || !storable(message)) return { kind: 'invalid' };
  return { kind: 'write', message, isHidden: rules.moderation };
}

export type HostReplyDecision = { kind: 'invalid' } | { kind: 'write'; hostReply: string | null };

/** A reply is trimmed; an empty one clears the reply. */
export function decideHostReply(reply: string): HostReplyDecision {
  const text = reply.trim();
  if (text.length > REPLY_MAX_LENGTH || !storable(text)) return { kind: 'invalid' };
  return { kind: 'write', hostReply: text || null };
}

export type WishModeration = 'show' | 'hide' | 'delete';

export const isWishModeration = (value: unknown): value is WishModeration => value === 'show' || value === 'hide' || value === 'delete';

/** Showing approves a pending wish or restores a hidden one; both mark the wish reviewed, as hiding does. */
export function moderationUpdate(action: Exclude<WishModeration, 'delete'>, now: Date): { isHidden: boolean; reviewedAt: Date } {
  return { isHidden: action === 'hide', reviewedAt: now };
}

export function wishState(row: { isHidden: boolean; reviewedAt: Date | string | null }): WishState {
  if (!row.isHidden) return 'VISIBLE';
  return row.reviewedAt ? 'HIDDEN' : 'PENDING';
}
