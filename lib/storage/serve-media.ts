import { isProtectedMediaPath, mediaPathInvitationId } from '../invitation/image-url';
import { InvalidKeyError, type StorageDriver } from './driver';

/**
 * `/media/<key>` delivery, free of Clerk and the database so the access contract is unit-tested (D-040).
 *
 * Two audiences:
 * - **public** keys (`<invitation>/…`, `avatars/<user>/…`): anyone, cacheable for a year, as before;
 * - **protected** keys (`protected/<invitation>/<24 hex>.<ext>`, children's photos): the invitation's signed-in owner
 *   only, `private, no-store`. Anything under `protected` that is not exactly that shape is refused, and any failure of
 *   the owner check (no session, no middleware, a database error) refuses too: this branch fails closed.
 *
 * The audience is decided on the joined key, never on the first route segment: Next decodes `%2F` inside a segment, so
 * `/media/protected%2F1%2F….png` arrives as one segment `protected/1/….png` and would otherwise take the public branch.
 */
export type MediaAccess =
  | { kind: 'public'; key: string }
  | { kind: 'protected'; key: string; invitationId: number }
  | { kind: 'refused' };

export function classifyMediaKey(segments: readonly string[]): MediaAccess {
  if (segments.length === 0) return { kind: 'refused' };
  const key = segments.join('/');
  if (key === 'protected' || key.startsWith('protected/')) {
    const path = `/media/${key}`;
    const invitationId = isProtectedMediaPath(path) ? mediaPathInvitationId(path) : null;
    return invitationId === null ? { kind: 'refused' } : { kind: 'protected', key, invitationId };
  }
  return { kind: 'public', key };
}

/**
 * B-031 (D-063): the invitation a public upload belongs to (`<invitation>/…` or `variants/<invitation>/…`), or null for
 * keys that belong to no invitation (avatars). Protected keys are classified by `classifyMediaKey`.
 */
export function publicKeyInvitationId(key: string): number | null {
  const match = /^(?:variants\/)?(0|[1-9]\d{0,14})\//.exec(key);
  return match ? Number(match[1]) : null;
}

export type ServeMediaDeps = {
  storage: Pick<StorageDriver, 'read'>;
  /** Whether the current request's signed-in user owns the invitation. May throw; a throw refuses. */
  ownerMayRead: (invitationId: number) => Promise<boolean>;
  /**
   * B-031: whether the invitation of a public upload has been deleted. A deleted invitation's photos stop at the origin
   * for its whole window (the purge then removes the objects). May throw; a throw serves the object as before (fails
   * open: these keys were public, and a database hiccup must not blank every live page). Copies already cached by
   * browsers under the year-long public cache are outside this check.
   */
  invitationGone?: (invitationId: number) => Promise<boolean>;
  /** Reports a failed owner check by error name only (no personal data). */
  onAccessCheckError?: (error: unknown) => void;
};

const SANDBOX_CSP = "default-src 'none'; sandbox; style-src 'unsafe-inline'";
const PUBLIC_CACHE = 'public, max-age=31536000, immutable';
const PRIVATE_CACHE = 'private, no-store';

export async function serveMedia(segments: readonly string[], deps: ServeMediaDeps): Promise<Response> {
  const access = classifyMediaKey(segments);
  if (access.kind === 'refused') return notFound(PRIVATE_CACHE);

  if (access.kind === 'protected') {
    let allowed = false;
    try {
      allowed = await deps.ownerMayRead(access.invitationId);
    } catch (error) {
      deps.onAccessCheckError?.(error);
      allowed = false;
    }
    // 404, not 401 / 403: a refused request learns nothing about whether the object exists.
    if (!allowed) return notFound(PRIVATE_CACHE);
  }

  const owningInvitation = access.kind === 'public' ? publicKeyInvitationId(access.key) : null;
  if (owningInvitation !== null && deps.invitationGone) {
    let gone = false;
    try {
      gone = await deps.invitationGone(owningInvitation);
    } catch (error) {
      deps.onAccessCheckError?.(error);
    }
    if (gone) return notFound(PRIVATE_CACHE);
  }

  let object;
  try {
    object = await deps.storage.read(access.key);
  } catch (error) {
    if (error instanceof InvalidKeyError) return new Response('Bad request', { status: 400, headers: { 'cache-control': PRIVATE_CACHE } });
    throw error;
  }
  const cache = access.kind === 'protected' ? PRIVATE_CACHE : PUBLIC_CACHE;
  if (!object) return notFound(access.kind === 'protected' ? PRIVATE_CACHE : undefined);
  // Only types this system knowingly stores are servable; anything else would hand the browser a document to sniff.
  if (object.contentType === 'application/octet-stream') return notFound(access.kind === 'protected' ? PRIVATE_CACHE : undefined);

  const headers: Record<string, string> = {
    'content-type': object.contentType,
    'cache-control': cache,
    // Defence in depth for user-supplied bytes served from our own origin: never let the browser re-interpret the type,
    // and strip any scripting or navigation capability if it somehow does.
    'x-content-type-options': 'nosniff',
    'content-security-policy': SANDBOX_CSP,
  };
  if (access.kind === 'protected') headers['x-robots-tag'] = 'noindex';
  if (object.size > 0) headers['content-length'] = String(object.size);
  return new Response(object.body, { status: 200, headers });
}

function notFound(cache?: string) {
  return new Response('Not found', { status: 404, headers: cache ? { 'cache-control': cache } : undefined });
}
