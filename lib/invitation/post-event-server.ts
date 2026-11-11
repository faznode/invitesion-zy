import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { normalizeStoredConfig } from './content-read';
import { liveInvitation } from './deletion-db';
import type { DetailConfig } from './detail-config';
import { listGuestPhotos } from './guest-photos-db';
import {
  GUEST_PHOTOS_PER_GUEST,
  guestPhotosOpen,
  memoryPhotoPath,
  memoryUploadPath,
  photoVisibleTo,
  postEventSettings,
  postEventState,
  type PhotoNotice,
  type PostEventMemoryView,
} from './post-event';
import { findGuestByLinkSegment } from './public';

/**
 * I-21 (R-X8): the invitation and guest an upload's link names, read as the RSVP's action reads them (never a deleted
 * or draft invitation; the link's last segment is the credential, B-011) with the page's lenient config read, or null.
 * Whether the invitation still takes writes is `guestPhotosOpen`'s to decide (expiry and status, as for the RSVP).
 */
export async function openGuestPhotoLink(slug: string, guestSlug: string) {
  const [invitation] = await db
    .select({ id: invitations.id, status: invitations.status, expiresAt: invitations.expiresAt, config: invitations.config })
    .from(invitations)
    .where(and(eq(invitations.slug, slug), liveInvitation))
    .limit(1);
  if (!invitation || invitation.status === 'DRAFT') return null;
  const guest = await findGuestByLinkSegment(invitation.id, guestSlug);
  if (!guest) return null;
  return { invitation, guest, config: normalizeStoredConfig(invitation.config ?? {}).config };
}

/**
 * I-21 (D-070): the memory a guest page renders, built on the server for one audience: null unless it is open for it.
 * The invitation's link lists visible photos; a personal link adds its guest's own (any review) with their removal
 * forms, and the upload form while the guest may still share. No photo row reaches a page in any other way.
 */
export async function loadMemoryView(input: {
  invitation: { id: number; status: string; expiresAt?: Date | null };
  config: DetailConfig;
  guest: { id: number; invitedEventIds?: unknown } | null;
  slug: string;
  guestSlug: string | null;
  notice: PhotoNotice | null;
  now?: number;
}): Promise<PostEventMemoryView | null> {
  const now = input.now ?? Date.now();
  if (postEventState(input.config, input.guest, now) !== 'open') return null;
  const settings = postEventSettings(input.config);
  const guestId = input.guest?.id ?? null;
  const rows = settings.photos ? (await listGuestPhotos(input.invitation.id)).filter((photo) => photoVisibleTo(photo, guestId)) : [];
  const personal = input.guest && input.guestSlug ? { slug: input.slug, guestSlug: input.guestSlug } : null;
  const mine = rows.filter((photo) => guestId !== null && photo.guestId === guestId).length;
  const canShare = Boolean(personal && input.guest && guestPhotosOpen({ invitation: input.invitation, config: input.config, guest: input.guest, now }));
  return {
    message: settings.message,
    photosOn: settings.photos,
    photos: rows.map((photo) => ({ id: photo.id, src: memoryPhotoPath(input.slug, input.guestSlug, photo.id), mine: guestId !== null && photo.guestId === guestId, review: photo.review })),
    upload: canShare && personal ? { action: memoryUploadPath(personal.slug, personal.guestSlug), remaining: Math.max(0, GUEST_PHOTOS_PER_GUEST - mine) } : null,
    owner: personal && mine > 0 ? personal : null,
    notice: personal ? input.notice : null,
  };
}

/**
 * Deletes a removed photo's file. Best effort: the row is already gone, so a file left by a storage failure is
 * unreachable (no row, and `/media` serves the protected prefix to the owner alone) and B-031's purge removes it.
 */
export async function removeGuestPhotoFile(url: string): Promise<void> {
  if (!url.startsWith('/media/protected/')) return;
  try {
    await getStorage().remove(url.slice('/media/'.length));
  } catch {
    // Left for the purge (see above).
  }
}
