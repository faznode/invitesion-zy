import { revalidatePath } from 'next/cache';
import { guestAccessLocked } from '@/lib/invitation/guest-gate';
import { receiveGuestPhoto } from '@/lib/invitation/guest-photo-upload';
import { countGuestPhotosBy, insertGuestPhoto } from '@/lib/invitation/guest-photos-db';
import { GUEST_PHOTO_EXT, GUEST_PHOTO_MAX_BYTES, guestPhotoBucket, guestPhotoLimit } from '@/lib/invitation/post-event';
import { openGuestPhotoLink } from '@/lib/invitation/post-event-server';
import { hit } from '@/lib/rate-limit';
import { protectedInvitationMediaKey, saveImage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
// Node runtime: the local driver writes to the filesystem, which Edge has not.
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string; guestSlug: string }> };

/** I-21 (D-070, R-X8): a guest's photo from their personal link; the contract is `receiveGuestPhoto`. */
export async function POST(request: Request, { params }: Ctx) {
  const { slug, guestSlug } = await params;
  return receiveGuestPhoto(request, { slug, guestSlug }, {
    locked: guestAccessLocked,
    openLink: openGuestPhotoLink,
    allow: async (invitationId, guestId) => (await hit(guestPhotoBucket(invitationId, guestId), guestPhotoLimit())).allowed,
    countBy: countGuestPhotosBy,
    save: (invitationId, file) => saveImage((ext) => protectedInvitationMediaKey(invitationId, ext), file, GUEST_PHOTO_MAX_BYTES, GUEST_PHOTO_EXT),
    insert: insertGuestPhoto,
    revalidate: (path) => revalidatePath(path),
  });
}
