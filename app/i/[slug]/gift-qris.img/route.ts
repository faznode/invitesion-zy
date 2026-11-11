import { serveGiftQris } from '@/lib/invitation/gift-qris-delivery';
import { guestAccessLocked, lockedResponse } from '@/lib/invitation/guest-gate';
import { loadInvitationForGiftAudience } from '@/lib/invitation/public';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

/** The host's QRIS image for the invitation link, only while gift details are not kept to personal links (B-026, D-047). */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  // G-047 (D-069): gift details are the invitation's content; a locked request reads nothing.
  if (await guestAccessLocked(slug)) return lockedResponse();
  return serveGiftQris({ slug }, { loadForAudience: loadInvitationForGiftAudience, storage: getStorage() });
}
