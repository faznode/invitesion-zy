import 'server-only';

import { randomUUID } from 'node:crypto';
import { ApiProblem, apiConfigFromEnv, apiPostTo } from '@/lib/api/client';
import type { HostRsvpStatus } from './rsvp-events';
import type { RsvpFlags, RsvpSubmission } from './rsvp-decision';

/**
 * R-03: the Rust writer's side of the RSVP call sites (`BACKEND_RSVP=rust`; `next` stays the default). The guest action
 * and the dashboard pick exactly one writer per call and never fall back to the other: a fallback after a timeout could
 * write a second time for a request the first writer already committed.
 *
 * Every write carries an `Idempotency-Key`, and the API records it in the transaction of the write it protects. So when
 * the outcome of a write is unknown (the API was unreachable, timed out, or answered 5xx: it may have committed before
 * the answer was lost), the write is sent exactly once more under the same key: a committed write is replayed, an
 * uncommitted one is written once. If that is unknown too, the caller reports "unconfirmed" (D-043). Refusals come back
 * as problems and map to the notices the TypeScript writer gives. A 400 or 401 is a deployment or programming error and
 * propagates, as a database error would.
 */

/** What the guest page says after an RSVP, whichever writer handled it (`?rsvp=`). */
export type GuestRsvpOutcome =
  | { kind: 'saved' }
  | { kind: 'closed' }
  | { kind: 'invalid' }
  | { kind: 'events'; eventId: string }
  | { kind: 'answers'; questionId: string }
  /** B-013: too many writes for this link or address; nothing was written. `retryAfter`: seconds to the window's end. */
  | { kind: 'busy'; retryAfter?: number }
  /**
   * The answer may or may not have been saved, and no other writer touched it. Sending the same form again under `key`
   * writes at most once: the API replays the answer if the first send committed.
   */
  | { kind: 'unconfirmed'; key: string };

/** A transport failure or a 5xx answer: the write may have committed before its answer was lost. */
export const isAmbiguous = (error: ApiProblem): boolean => error.status === 0 || error.status >= 500;

/** One write under `key`, sent once more under the same key when its outcome is unknown. Never another writer. */
async function sendUnderKey<T>(post: (key: string) => Promise<T>, key: string): Promise<T> {
  try {
    return await post(key);
  } catch (error) {
    if (error instanceof ApiProblem && isAmbiguous(error)) return post(key);
    throw error;
  }
}

/** Codes and status only: the problem never carries guest data, and neither does this line. */
function logUnconfirmed(where: string, error: ApiProblem) {
  console.error(`[rsvp] ${where}: outcome unknown after a retry under the same key (${error.status} ${error.code})`);
}

/** "." and ".." would be normalised away by URL parsing, and an empty segment names no route: no such link. */
const addressable = (segment: string) => segment !== '' && segment !== '.' && segment !== '..';

function guestOutcome(error: ApiProblem, key: string): GuestRsvpOutcome {
  switch (error.code) {
    case 'rsvp.link_not_found':
    case 'rsvp.closed':
      return { kind: 'closed' };
    case 'rsvp.status_invalid':
      return { kind: 'invalid' };
    case 'rsvp.event_answer_missing':
      return error.extras.eventId ? { kind: 'events', eventId: error.extras.eventId } : { kind: 'invalid' };
    case 'rsvp.answer_invalid':
      return error.extras.questionId ? { kind: 'answers', questionId: error.extras.questionId } : { kind: 'invalid' };
    case 'rate_limit.exceeded':
      return error.extras.retryAfter ? { kind: 'busy', retryAfter: error.extras.retryAfter } : { kind: 'busy' };
  }
  if (isAmbiguous(error)) {
    logUnconfirmed('guest RSVP', error);
    return { kind: 'unconfirmed', key };
  }
  throw error;
}

export async function writeGuestRsvpThroughApi(
  input: {
    slug: string;
    guestSlug: string;
    submission: RsvpSubmission;
    flags: RsvpFlags;
    /** The guest's public address, for the per-address limit; hashed by the API and never stored. */
    clientIp?: string | null;
    /** The key the rendered form carried; a double submit of one form then writes once. */
    idempotencyKey?: string | null;
  },
  env: Record<string, string | undefined> = process.env,
): Promise<GuestRsvpOutcome> {
  if (!addressable(input.slug) || !addressable(input.guestSlug)) return { kind: 'closed' };
  const config = apiConfigFromEnv(env);
  const body = { submission: input.submission, flags: input.flags, ...(input.clientIp && { clientIp: input.clientIp }) };
  const params = { slug: input.slug, guest: input.guestSlug };
  const post = (idempotencyKey: string) =>
    apiPostTo(config, '/v1/guest-links/{slug}/{guest}/rsvp', params, body, { idempotencyKey });
  const key = input.idempotencyKey || randomUUID();
  try {
    await sendUnderKey(post, key);
    return { kind: 'saved' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.code !== 'idempotency.key_reused') return guestOutcome(error, key);
  }
  // The form's key with a different answer is a new submission (an old page brought back and changed): send it under a
  // fresh key rather than refuse what the guest chose.
  const fresh = randomUUID();
  try {
    await sendUnderKey(post, fresh);
    return { kind: 'saved' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return guestOutcome(error, fresh);
  }
}

/** What the dashboard does after a host override, or `saved`. */
export type HostRsvpOutcome =
  | { kind: 'saved' }
  | { kind: 'invalid' }
  | { kind: 'notfound' }
  /** The API knows no live customer for this session (deleted, or an administrator): the dashboard's rule is sign-in. */
  | { kind: 'signin' }
  /** The override may or may not have been saved; the guest list shows which after the redirect. */
  | { kind: 'unconfirmed' };

export async function writeHostRsvpThroughApi(
  input: {
    invitationId: number;
    guestId: number;
    status: HostRsvpStatus;
    eventId?: string;
    flags: { perEvent: boolean; inviteOnlyEvents: boolean };
    /** The signed-in owner's session token (Clerk); the API verifies it and resolves the owner from the database. */
    ownerToken: string;
  },
  env: Record<string, string | undefined> = process.env,
): Promise<HostRsvpOutcome> {
  const config = apiConfigFromEnv(env);
  const post = (idempotencyKey: string) =>
    apiPostTo(
      config,
      '/v1/invitations/{invitation}/guests/{guest}/rsvp-override',
      { invitation: input.invitationId, guest: input.guestId },
      { status: input.status, flags: input.flags, ...(input.eventId !== undefined && { eventId: input.eventId }) },
      { ownerToken: input.ownerToken, idempotencyKey },
    );
  try {
    // One key per override: the retry after a lost answer replays instead of writing a second time.
    await sendUnderKey(post, randomUUID());
    return { kind: 'saved' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.code === 'rsvp.override_invalid') return { kind: 'invalid' };
    if (error.code === 'invitation_or_guest.not_found') return { kind: 'notfound' };
    if (error.status === 403) return { kind: 'signin' };
    if (isAmbiguous(error)) {
      logUnconfirmed('host override', error);
      return { kind: 'unconfirmed' };
    }
    throw error;
  }
}
