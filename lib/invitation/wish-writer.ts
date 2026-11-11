import 'server-only';

import { randomUUID } from 'node:crypto';
import { ApiProblem, apiConfigFromEnv, apiPostTo } from '@/lib/api/client';
import { isAmbiguous } from './rsvp-writer';
import type { WishModeration } from './wish-decision';

/**
 * R-04 (D-044): the Rust writer's side of the wish call sites (`BACKEND_WISHES=rust`; `next` stays the default). Like the
 * RSVP writer (D-043): exactly one writer per call and never a fallback; every write carries an `Idempotency-Key` that
 * the API records in the write's own transaction, so an unknown outcome (unreachable, timed out, 5xx) is sent exactly
 * once more under the same key and is then reported "unconfirmed". A 400 or 401 is a deployment or programming error and
 * propagates, as a database error would.
 */

/** What the guest page says after a wish, whichever writer handled it (`?wish=`). */
export type GuestWishOutcome =
  | { kind: 'saved' }
  /** Stored, waiting for the host's approval (the guestbook is moderated). */
  | { kind: 'pending' }
  | { kind: 'closed' }
  | { kind: 'invalid' }
  /** B-013: too many wishes for this link or address; nothing was written. `retryAfter`: seconds to the window's end. */
  | { kind: 'busy'; retryAfter?: number }
  /** The wish may or may not be stored. Sending the same form again under `key` stores it at most once. */
  | { kind: 'unconfirmed'; key: string };

/** What the dashboard does after a moderation or a reply. */
export type HostWishOutcome =
  | { kind: 'saved' }
  | { kind: 'invalid' }
  | { kind: 'notfound' }
  /** The API knows no live customer for this session (deleted, or an administrator): the dashboard's rule is sign-in. */
  | { kind: 'signin' }
  /** The change may or may not be stored; the list shows which after the redirect. */
  | { kind: 'unconfirmed' };

async function sendUnderKey<T>(post: (key: string) => Promise<T>, key: string): Promise<T> {
  try {
    return await post(key);
  } catch (error) {
    if (error instanceof ApiProblem && isAmbiguous(error)) return post(key);
    throw error;
  }
}

/** Codes and status only: the problem never carries a wish or a guest's data, and neither does this line. */
function logUnconfirmed(where: string, error: ApiProblem) {
  console.error(`[wish] ${where}: outcome unknown after a retry under the same key (${error.status} ${error.code})`);
}

/** "." and ".." would be normalised away by URL parsing, and an empty segment names no route: no such link. */
const addressable = (segment: string) => segment !== '' && segment !== '.' && segment !== '..';

function guestOutcome(error: ApiProblem, key: string): GuestWishOutcome {
  switch (error.code) {
    case 'wish.link_not_found':
    case 'wish.closed':
      return { kind: 'closed' };
    case 'wish.message_invalid':
      return { kind: 'invalid' };
    case 'rate_limit.exceeded':
      return error.extras.retryAfter ? { kind: 'busy', retryAfter: error.extras.retryAfter } : { kind: 'busy' };
  }
  if (isAmbiguous(error)) {
    logUnconfirmed('guest wish', error);
    return { kind: 'unconfirmed', key };
  }
  throw error;
}

export async function writeGuestWishThroughApi(
  input: {
    slug: string;
    guestSlug: string;
    message: string;
    /** The guest's public address, for the per-address limit; hashed by the API and never stored. */
    clientIp?: string | null;
    /** The key the rendered form carried; a double submit of one form then stores one wish. */
    idempotencyKey?: string | null;
  },
  env: Record<string, string | undefined> = process.env,
): Promise<GuestWishOutcome> {
  if (!addressable(input.slug) || !addressable(input.guestSlug)) return { kind: 'closed' };
  const config = apiConfigFromEnv(env);
  const body = { message: input.message, ...(input.clientIp && { clientIp: input.clientIp }) };
  const params = { slug: input.slug, guest: input.guestSlug };
  const post = (idempotencyKey: string) => apiPostTo(config, '/v1/guest-links/{slug}/{guest}/wishes', params, body, { idempotencyKey });
  const saved = (state: string): GuestWishOutcome => (state === 'PENDING' ? { kind: 'pending' } : { kind: 'saved' });
  const key = input.idempotencyKey || randomUUID();
  try {
    return saved((await sendUnderKey(post, key)).state);
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.code !== 'idempotency.key_reused') return guestOutcome(error, key);
  }
  // The form's key with a different message is a new wish (an old page brought back and changed): send it under a fresh
  // key rather than refuse what the guest wrote.
  const fresh = randomUUID();
  try {
    return saved((await sendUnderKey(post, fresh)).state);
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return guestOutcome(error, fresh);
  }
}

function hostOutcome(error: ApiProblem, where: string): HostWishOutcome {
  if (error.code === 'wish.reply_invalid') return { kind: 'invalid' };
  if (error.code === 'invitation_or_wish.not_found') return { kind: 'notfound' };
  if (error.status === 403) return { kind: 'signin' };
  if (isAmbiguous(error)) {
    logUnconfirmed(where, error);
    return { kind: 'unconfirmed' };
  }
  throw error;
}

const ACTION = { show: 'SHOW', hide: 'HIDE', delete: 'DELETE' } as const;

export async function moderateWishThroughApi(
  input: { invitationId: number; wishId: number; action: WishModeration; ownerToken: string },
  env: Record<string, string | undefined> = process.env,
): Promise<HostWishOutcome> {
  const config = apiConfigFromEnv(env);
  const post = (idempotencyKey: string) =>
    apiPostTo(
      config,
      '/v1/invitations/{invitation}/wishes/{wish}/moderation',
      { invitation: input.invitationId, wish: input.wishId },
      { action: ACTION[input.action] },
      { ownerToken: input.ownerToken, idempotencyKey },
    );
  try {
    // One key per action: a retried delete replays instead of answering "not found".
    await sendUnderKey(post, randomUUID());
    return { kind: 'saved' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return hostOutcome(error, 'wish moderation');
  }
}

export async function replyToWishThroughApi(
  input: { invitationId: number; wishId: number; reply: string; ownerToken: string },
  env: Record<string, string | undefined> = process.env,
): Promise<HostWishOutcome> {
  const config = apiConfigFromEnv(env);
  const post = (idempotencyKey: string) =>
    apiPostTo(
      config,
      '/v1/invitations/{invitation}/wishes/{wish}/reply',
      { invitation: input.invitationId, wish: input.wishId },
      { reply: input.reply },
      { ownerToken: input.ownerToken, idempotencyKey },
    );
  try {
    await sendUnderKey(post, randomUUID());
    return { kind: 'saved' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return hostOutcome(error, 'wish reply');
  }
}
