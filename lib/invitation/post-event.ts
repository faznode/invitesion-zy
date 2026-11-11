import { isFlagOn } from '@/lib/flags';
import { parseLimit, type Limit } from '@/lib/rate-limit-keys';
import type { DetailConfig } from './detail-config';
import { guestAudience, visibleEvents } from './event-eligibility';
import { familyOf } from './families';
import { guestPath, invitationPath } from './public-url';

/**
 * I-21 (D-070): the post-event memory's pure rules (no database, no request), so the tests run them directly.
 * `guest-photos-db.ts` is the only writer of guest photos, `guest-photo-upload.ts` receives a guest's upload and
 * `guest-photo-delivery.ts` serves them.
 *
 * - The memory is the host's opt-in (`config.postEvent.enabled`) on the invitation's own link, shown by the design
 *   families only (the legacy layout is frozen, D-041) once the last event the page's audience may see is over (D-037:
 *   an invite-only event never delays, or reveals itself through, another audience's memory).
 * - Guest photos are the host's second opt-in (`photos`). A guest shares from their personal link (the link is the
 *   identity, as for RSVP and wishes); the invitation's link only views. Each photo is pending until the host approves
 *   it; its guest sees it (and may delete it) whatever its review; nobody else sees a pending or hidden photo.
 * - A photo is a `media_assets` row of type `guest-photo` whose file sits under the invitation's protected prefix
 *   (D-040): `/media` serves it to the owner alone, the gallery and the editor never list it, and B-031's purge removes
 *   the row and the file with the invitation's other media.
 */

type Env = Record<string, string | undefined>;

export const GUEST_PHOTO_TYPE = 'guest-photo';
export const GUEST_PHOTO_SOURCE = 'guest';
export const GUEST_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Still images only: no GIF (animation) and never SVG (script). */
export const GUEST_PHOTO_EXT: readonly string[] = ['jpg', 'png', 'webp'];
export const GUEST_PHOTOS_PER_GUEST = 5;
/** An event without an end time counts as over this long after it starts. */
export const EVENT_END_GRACE_MS = 6 * 60 * 60 * 1000;

export type PhotoReview = 'pending' | 'visible' | 'hidden';
export type PostEventState = 'off' | 'before' | 'open';

export function postEventSettings(config: Pick<DetailConfig, 'postEvent'>): { enabled: boolean; message: string | null; photos: boolean } {
  const enabled = config.postEvent?.enabled === true;
  return { enabled, message: config.postEvent?.message?.trim() || null, photos: enabled && config.postEvent?.photos === true };
}

type DatedEvent = { startAt?: string | null; endAt?: string | null };

function eventEnd(event: DatedEvent): number | null {
  const end = event.endAt ? Date.parse(event.endAt) : Number.NaN;
  if (Number.isFinite(end)) return end;
  const start = event.startAt ? Date.parse(event.startAt) : Number.NaN;
  return Number.isFinite(start) ? start + EVENT_END_GRACE_MS : null;
}

/** When the memory opens for an audience: the latest end of the events it may see, or null when none is dated. */
export function memoryOpensAt(config: Pick<DetailConfig, 'events'>, guest: { invitedEventIds?: unknown } | null, env: Env = process.env): number | null {
  let latest: number | null = null;
  for (const event of visibleEvents(config.events, guestAudience(guest), isFlagOn('INVITE_ONLY_EVENTS', env))) {
    const end = eventEnd(event);
    if (end !== null && (latest === null || end > latest)) latest = end;
  }
  return latest;
}

/** `off`: the flag, the host's switch or the legacy layout; `before`: an event this audience may see is still to come. */
export function postEventState(
  config: Pick<DetailConfig, 'postEvent' | 'events' | 'theme'>,
  guest: { invitedEventIds?: unknown } | null,
  now: number = Date.now(),
  env: Env = process.env,
): PostEventState {
  if (!isFlagOn('POST_EVENT_MEMORY', env) || !postEventSettings(config).enabled || !familyOf(config.theme?.familyId)) return 'off';
  const opensAt = memoryOpensAt(config, guest, env);
  return opensAt !== null && now >= opensAt ? 'open' : 'before';
}

/** Guest writes follow the RSVP's rule: never on a draft, an expired invitation or one past its expiry (read-only). */
export function invitationWritable(invitation: { status: string; expiresAt?: Date | null }, now: number = Date.now()): boolean {
  if (invitation.status === 'DRAFT' || invitation.status === 'EXPIRED') return false;
  return !(invitation.expiresAt && invitation.expiresAt.getTime() < now);
}

/** A guest may share a photo: the memory open for them, the host's photo switch on, the invitation still writable. */
export function guestPhotosOpen(input: {
  invitation: { status: string; expiresAt?: Date | null };
  config: Pick<DetailConfig, 'postEvent' | 'events' | 'theme'>;
  guest: { invitedEventIds?: unknown };
  now?: number;
  env?: Env;
}): boolean {
  const now = input.now ?? Date.now();
  return postEventState(input.config, input.guest, now, input.env) === 'open' && postEventSettings(input.config).photos && invitationWritable(input.invitation, now);
}

export function photoReviewOf(meta: unknown): PhotoReview {
  const review = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).review : undefined;
  return review === 'visible' || review === 'hidden' ? review : 'pending';
}

export function photoGuestIdOf(meta: unknown): number | null {
  const id = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).guestId : undefined;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Who sees a photo: everyone once it is visible; its own guest whatever its review. */
export function photoVisibleTo(photo: { review: PhotoReview; guestId: number | null }, guestId: number | null): boolean {
  return photo.review === 'visible' || (guestId !== null && photo.guestId === guestId);
}

/** The photo's address for the page that shows it: the personal link's route for its guest, else the invitation's. */
export function memoryPhotoPath(slug: string, guestSlug: string | null, photoId: number): string {
  return `${guestSlug ? guestPath(slug, guestSlug) : invitationPath(slug)}/kenangan/${photoId}`;
}

/**
 * Where the personal link's upload form posts (R-X8): a route handler, not a server action, because Next.js caps a
 * server action's body at 1 MB and a phone photo is usually larger. The identity is the link in this path, never a field.
 */
export function memoryUploadPath(slug: string, guestSlug: string): string {
  return `${guestPath(slug, guestSlug)}/kenangan`;
}

const NOTICE_QUERY = { sent: 'terkirim', removed: 'dihapus', invalid: 'ditolak', full: 'penuh', closed: 'tutup', wait: 'tunggu' } as const;
export type PhotoNotice = keyof typeof NOTICE_QUERY;

/** The query an action redirects with (`?foto=terkirim`), and the notice a page reads back from it. */
export function photoNoticeQuery(notice: PhotoNotice): string {
  return `foto=${NOTICE_QUERY[notice]}`;
}

export function photoNoticeOf(query: { foto?: string | string[] }): PhotoNotice | null {
  const value = Array.isArray(query.foto) ? query.foto[0] : query.foto;
  return (Object.keys(NOTICE_QUERY) as PhotoNotice[]).find((notice) => NOTICE_QUERY[notice] === value) ?? null;
}

/** Uploads per guest per window, counted before the file is read (default 10 an hour). */
export function guestPhotoLimit(env: Env = process.env): Limit {
  return parseLimit(env.RATE_LIMIT_GUEST_PHOTO, { max: 10, windowSeconds: 3600 });
}

export const guestPhotoBucket = (invitationId: number, guestId: number) => `guest-photo:${invitationId}:${guestId}`;

export type MemoryPhoto = { id: number; src: string; mine: boolean; review: PhotoReview };

/** What a page renders of the memory; null when it is not open for this audience. */
export type PostEventMemoryView = {
  message: string | null;
  photosOn: boolean;
  photos: MemoryPhoto[];
  /** The personal link's upload form (`action` is `memoryUploadPath`), while the guest may still share. */
  upload: { action: string; remaining: number } | null;
  /** Removal forms for the guest's own photos. */
  owner: { slug: string; guestSlug: string } | null;
  notice: PhotoNotice | null;
};
