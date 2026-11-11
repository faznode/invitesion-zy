import { serveGuestChildPhoto } from '@/lib/invitation/child-photo-delivery';
import { guestAccessLocked, lockedResponse } from '@/lib/invitation/guest-gate';
import { findGuestByLinkSegment, loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string; guestSlug: string; slot: string }> };

/** A child's photo for one personal guest link; the access contract is `serveGuestChildPhoto` (E-047, D-040). */
export async function GET(_req: Request, { params }: Ctx) {
  const route = await params;
  // G-047 (D-069): D-040's checks still run after this; a locked request never reaches them or the file.
  if (await guestAccessLocked(route.slug)) return lockedResponse();
  return serveGuestChildPhoto(route, {
    loadPublished: loadPublishedInvitationSummary,
    findGuest: findGuestByLinkSegment,
    storage: getStorage(),
  });
}
