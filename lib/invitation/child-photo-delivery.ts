import { InvalidKeyError, type StorageDriver } from '../storage/driver';
import type { DetailConfig } from './detail-config';
import { childPhotoUpload, type ChildPhotoSlot } from './portraits';

/**
 * `/i/<slug>/<guest>/photo/<slot>`: a child's photo for one personal guest link (E-047, completed under D-040). Free of
 * the database so the contract is unit-tested; the route wires the real loaders.
 *
 * The same audience as the page that shows it (D-038), checked on every request: a non-draft invitation, a guest link
 * that resolves under the B-011 rule, the slot of this event type, the host's switch on, and an upload of this same
 * invitation (public before D-040, protected after). Switching the photo off, deleting the guest or rotating their link
 * ends access at once. Never stored by a shared cache.
 *
 * Not covered, by design: a forwarded personal link keeps working for whoever holds it (the link is the capability), and
 * bytes already delivered cannot be recalled from a browser or a saved copy.
 */
export const CHILD_PHOTO_SLOTS: readonly ChildPhotoSlot[] = ['celebrant', 'honouree'];

export type GuestChildPhotoDeps = {
  loadPublished: (slug: string) => Promise<{ invitation: { id: number; eventType: string }; config: DetailConfig } | null>;
  findGuest: (invitationId: number, segment: string) => Promise<unknown | null>;
  storage: Pick<StorageDriver, 'read'>;
};

const PRIVATE_CACHE = 'private, no-store';

export async function serveGuestChildPhoto(
  params: { slug: string; guestSlug: string; slot: string },
  deps: GuestChildPhotoDeps,
): Promise<Response> {
  if (!CHILD_PHOTO_SLOTS.includes(params.slot as ChildPhotoSlot)) return notFound();

  const summary = await deps.loadPublished(params.slug);
  if (!summary) return notFound();
  const guest = await deps.findGuest(summary.invitation.id, params.guestSlug);
  if (!guest) return notFound();

  const upload = childPhotoUpload(summary.invitation.eventType, summary.config, params.slot as ChildPhotoSlot, summary.invitation.id);
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
    // The page that embeds it is the only legitimate referrer; the photo URL itself never needs to leak onwards.
    'referrer-policy': 'no-referrer',
  };
  if (object.size > 0) headers['content-length'] = String(object.size);
  return new Response(object.body, { status: 200, headers });
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'cache-control': PRIVATE_CACHE } });
}
