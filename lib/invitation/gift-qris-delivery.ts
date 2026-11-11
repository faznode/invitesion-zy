import { InvalidKeyError, type StorageDriver } from '../storage/driver';
import type { DetailConfig } from './detail-config';
import { ownQrisUpload } from './gift-privacy';

/**
 * B-026 (D-047): the host's static QRIS image for one audience. `/i/<slug>/gift-qris.img` answers the invitation link's
 * audience and `/i/<slug>/<guest>/gift/qris` one personal link's. Free of the database so the contract is unit-tested;
 * the routes wire the real loader, which applies the page's audience rule (`configForAudience`) before this reads
 * anything, so the image follows exactly what the page may show.
 *
 * Checked on every request: a non-draft invitation, the guest link under the B-011 rule when one is named, the gift
 * section switched on, and a protected upload of this same invitation. Turning the section or the personal-link setting
 * on, removing the image, deleting the guest or rotating their link ends access at once. Never stored by a shared cache.
 * The storage path itself never reaches a guest: only the host's preview uses it (`/media/protected/…`, owner only).
 *
 * Not covered, by design: a forwarded personal link keeps working for whoever holds it (the link is the capability), and
 * bytes already delivered cannot be recalled.
 */
export type GiftQrisDeps = {
  loadForAudience: (slug: string, guestSegment?: string) => Promise<{ invitation: { id: number }; config: DetailConfig } | null>;
  storage: Pick<StorageDriver, 'read'>;
};

const PRIVATE_CACHE = 'private, no-store';

export async function serveGiftQris(params: { slug: string; guestSlug?: string }, deps: GiftQrisDeps): Promise<Response> {
  const loaded = await deps.loadForAudience(params.slug, params.guestSlug);
  if (!loaded || loaded.config.gift?.enabled !== true) return notFound();
  const upload = ownQrisUpload(loaded.config.gift?.qrisImageUrl, loaded.invitation.id);
  if (!upload) return notFound();

  let object;
  try {
    object = await deps.storage.read(upload.slice('/media/'.length));
  } catch (error) {
    if (error instanceof InvalidKeyError) return notFound();
    throw error;
  }
  if (!object || object.contentType === 'application/octet-stream') return notFound();

  const headers: Record<string, string> = {
    'content-type': object.contentType,
    'cache-control': PRIVATE_CACHE,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
    'x-robots-tag': 'noindex',
    // No referrer policy here: the site-wide one (next.config.ts) replaces any route value on the served response.
  };
  if (object.size > 0) headers['content-length'] = String(object.size);
  return new Response(object.body, { status: 200, headers });
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'cache-control': PRIVATE_CACHE } });
}
