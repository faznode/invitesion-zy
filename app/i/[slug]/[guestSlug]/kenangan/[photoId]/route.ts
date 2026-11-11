import { guestAccessLocked } from '@/lib/invitation/guest-gate';
import { serveGuestPhoto } from '@/lib/invitation/guest-photo-delivery';
import { loadGuestPhoto } from '@/lib/invitation/guest-photos-db';
import { findGuestByLinkSegment, loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string; guestSlug: string; photoId: string }> };

/** I-21 (D-070): a guest photo on a personal link: visible ones, and this guest's own; the contract is `serveGuestPhoto`. */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug, guestSlug, photoId } = await params;
  return serveGuestPhoto(
    { slug, guestSlug, photoId },
    { locked: guestAccessLocked, loadPublished: loadPublishedInvitationSummary, findGuest: findGuestByLinkSegment, loadPhoto: loadGuestPhoto, storage: getStorage() },
  );
}
