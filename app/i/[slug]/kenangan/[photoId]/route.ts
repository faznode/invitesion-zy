import { guestAccessLocked } from '@/lib/invitation/guest-gate';
import { serveGuestPhoto } from '@/lib/invitation/guest-photo-delivery';
import { loadGuestPhoto } from '@/lib/invitation/guest-photos-db';
import { findGuestByLinkSegment, loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string; photoId: string }> };

/** I-21 (D-070): a visible guest photo on the invitation's link; the access contract is `serveGuestPhoto`. */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug, photoId } = await params;
  return serveGuestPhoto(
    { slug, photoId },
    { locked: guestAccessLocked, loadPublished: loadPublishedInvitationSummary, findGuest: findGuestByLinkSegment, loadPhoto: loadGuestPhoto, storage: getStorage() },
  );
}
