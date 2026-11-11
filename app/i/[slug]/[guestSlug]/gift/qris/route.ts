import { serveGiftQris } from '@/lib/invitation/gift-qris-delivery';
import { guestAccessLocked, lockedResponse } from '@/lib/invitation/guest-gate';
import { loadInvitationForGiftAudience } from '@/lib/invitation/public';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string; guestSlug: string }> };

/** The host's QRIS image for one personal guest link; the access contract is `serveGiftQris` (B-026, D-047). */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug, guestSlug } = await params;
  // G-047 (D-069): as the invitation link's QRIS image, before the guest is looked up.
  if (await guestAccessLocked(slug)) return lockedResponse();
  return serveGiftQris({ slug, guestSlug }, { loadForAudience: loadInvitationForGiftAudience, storage: getStorage() });
}
