import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { mediaAssets } from '@/lib/db/schema';
import { GUEST_PHOTO_SOURCE, GUEST_PHOTO_TYPE, photoGuestIdOf, photoReviewOf, type PhotoReview } from './post-event';

/**
 * I-21 (D-070): the only writer of guest photos, `media_assets` rows of type `guest-photo` (one writer per row kind,
 * ADR-A2). Every statement is scoped to one invitation and that type, so no owner upload is ever read or changed here
 * and no guest photo is ever touched by the media library. The guest and the review live in `meta`; the file's key is
 * under the invitation's protected prefix (D-040).
 */
export type GuestPhotoRow = { id: number; url: string; review: PhotoReview; guestId: number | null; createdAt: Date };

const guestPhotosOf = (invitationId: number) => and(eq(mediaAssets.invitationId, invitationId), eq(mediaAssets.type, GUEST_PHOTO_TYPE));
const byGuest = (guestId: number) => sql`${mediaAssets.meta}->>'guestId' = ${String(guestId)}`;
const columns = { id: mediaAssets.id, url: mediaAssets.url, meta: mediaAssets.meta, createdAt: mediaAssets.createdAt };
const toRow = (row: { id: number; url: string; meta: unknown; createdAt: Date }): GuestPhotoRow => ({
  id: row.id,
  url: row.url,
  review: photoReviewOf(row.meta),
  guestId: photoGuestIdOf(row.meta),
  createdAt: row.createdAt,
});

/** Every guest photo of the invitation, oldest first. */
export async function listGuestPhotos(invitationId: number): Promise<GuestPhotoRow[]> {
  const rows = await db.select(columns).from(mediaAssets).where(guestPhotosOf(invitationId)).orderBy(asc(mediaAssets.createdAt), asc(mediaAssets.id));
  return rows.map(toRow);
}

export async function loadGuestPhoto(invitationId: number, photoId: number): Promise<GuestPhotoRow | null> {
  const [row] = await db.select(columns).from(mediaAssets).where(and(guestPhotosOf(invitationId), eq(mediaAssets.id, photoId))).limit(1);
  return row ? toRow(row) : null;
}

export async function countGuestPhotosBy(invitationId: number, guestId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(mediaAssets).where(and(guestPhotosOf(invitationId), byGuest(guestId)));
  return Number(row?.n ?? 0);
}

/** A guest's new photo, pending until the host approves it. */
export async function insertGuestPhoto(invitationId: number, guestId: number, url: string): Promise<number> {
  const [row] = await db
    .insert(mediaAssets)
    .values({ invitationId, type: GUEST_PHOTO_TYPE, url, source: GUEST_PHOTO_SOURCE, sortOrder: 0, meta: { guestId, review: 'pending' } })
    .returning({ id: mediaAssets.id });
  return row.id;
}

/** The guest deletes one of their own photos; the stored URL (for the file) or null when it is not theirs. */
export async function removeOwnGuestPhoto(invitationId: number, guestId: number, photoId: number): Promise<string | null> {
  const [row] = await db
    .delete(mediaAssets)
    .where(and(guestPhotosOf(invitationId), eq(mediaAssets.id, photoId), byGuest(guestId)))
    .returning({ url: mediaAssets.url });
  return row?.url ?? null;
}

/** The host shows or hides a photo; false when it is not one of this invitation's guest photos. */
export async function reviewGuestPhoto(invitationId: number, photoId: number, review: Exclude<PhotoReview, 'pending'>): Promise<boolean> {
  const stamp = JSON.stringify({ review, reviewedAt: new Date().toISOString() });
  const rows = await db
    .update(mediaAssets)
    .set({ meta: sql`coalesce(${mediaAssets.meta}, '{}'::jsonb) || ${stamp}::jsonb` })
    .where(and(guestPhotosOf(invitationId), eq(mediaAssets.id, photoId)))
    .returning({ id: mediaAssets.id });
  return rows.length === 1;
}

/** The host deletes a guest photo; the stored URL (for the file) or null when it is not one of this invitation's. */
export async function removeGuestPhoto(invitationId: number, photoId: number): Promise<string | null> {
  const [row] = await db.delete(mediaAssets).where(and(guestPhotosOf(invitationId), eq(mediaAssets.id, photoId))).returning({ url: mediaAssets.url });
  return row?.url ?? null;
}
