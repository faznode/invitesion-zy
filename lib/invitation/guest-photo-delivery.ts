import { InvalidKeyError, type StorageDriver } from '../storage/driver';
import type { DetailConfig } from './detail-config';
import { postEventSettings, postEventState, photoVisibleTo, type PhotoReview } from './post-event';

/**
 * I-21 (D-070): `/i/<slug>/kenangan/<id>` and `/i/<slug>/<guest>/kenangan/<id>`, one guest photo. Free of the database
 * so the contract is unit-tested; the routes wire the real loaders. Checked on every request, in this order: the
 * passcode gate (G-047), a published, live invitation, a guest link that resolves (B-011) when one is given, the memory
 * open for that audience with the host's photo switch on, then a guest photo of this invitation that is visible, or the
 * requesting guest's own. Hiding, deleting, switching photos off or a passcode ends access at once; never stored by a
 * shared cache. The file is read from the invitation's protected prefix only (D-040).
 */
export type GuestPhotoDeps = {
  locked: (slug: string) => Promise<boolean>;
  loadPublished: (slug: string) => Promise<{ invitation: { id: number }; config: DetailConfig } | null>;
  findGuest: (invitationId: number, segment: string) => Promise<{ id: number; invitedEventIds?: unknown } | null>;
  loadPhoto: (invitationId: number, photoId: number) => Promise<{ url: string; review: PhotoReview; guestId: number | null } | null>;
  storage: Pick<StorageDriver, 'read'>;
  now?: number;
  env?: Record<string, string | undefined>;
};

const PRIVATE_CACHE = 'private, no-store';

export async function serveGuestPhoto(params: { slug: string; guestSlug?: string; photoId: string }, deps: GuestPhotoDeps): Promise<Response> {
  if (await deps.locked(params.slug)) return notFound();
  const photoId = /^\d{1,12}$/.test(params.photoId) ? Number(params.photoId) : 0;
  if (!photoId) return notFound();

  const summary = await deps.loadPublished(params.slug);
  if (!summary) return notFound();
  const guest = params.guestSlug === undefined ? null : await deps.findGuest(summary.invitation.id, params.guestSlug);
  if (params.guestSlug !== undefined && !guest) return notFound();
  if (postEventState(summary.config, guest, deps.now, deps.env) !== 'open' || !postEventSettings(summary.config).photos) return notFound();

  const photo = await deps.loadPhoto(summary.invitation.id, photoId);
  if (!photo || !photoVisibleTo(photo, guest?.id ?? null)) return notFound();
  const prefix = `/media/protected/${summary.invitation.id}/`;
  if (!photo.url.startsWith(prefix)) return notFound();

  let object;
  try {
    object = await deps.storage.read(photo.url.slice('/media/'.length));
  } catch (error) {
    if (error instanceof InvalidKeyError) return notFound();
    throw error;
  }
  if (!object || !/^image\/(jpeg|png|webp)$/.test(object.contentType)) return notFound();

  const headers: Record<string, string> = {
    'content-type': object.contentType,
    'cache-control': PRIVATE_CACHE,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
    'x-robots-tag': 'noindex',
    'referrer-policy': 'no-referrer',
  };
  if (object.size > 0) headers['content-length'] = String(object.size);
  return new Response(object.body, { status: 200, headers });
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'cache-control': PRIVATE_CACHE } });
}
