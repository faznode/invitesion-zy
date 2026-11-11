import 'server-only';

import { cache } from 'react';
import { and, asc, count, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { GUEST_PHOTO_TYPE } from './post-event';
import { db } from '@/lib/db/drizzle';
import { guestMessages, guests, invitations, mediaAssets } from '@/lib/db/schema';
import { loadImageVariants } from '@/lib/media/variant-jobs';
import { normalizeStoredConfig } from './content-read';
import { liveInvitation } from './deletion-db';
import type { DetailConfig } from './detail-config';
import { configForAudience } from './gift-privacy';
import { pickGuestForSegment } from './guest-link';
import { writeInvitationView } from './view-writer';
import { guestbookRules } from './wish-decision';

export type PublicInvitation = Awaited<ReturnType<typeof loadPublicInvitation>>;

/**
 * How many guestbook messages a public page renders.
 *
 * Chosen to be generous for a normal event while keeping the payload bounded.
 * Everything beyond this is counted, not fetched, so the page can honestly say
 * how many wishes there are without paying to serialise them all.
 */
export const GUESTBOOK_PAGE_SIZE = 50;

const visibleOf = (invitationId: number) => and(eq(guestMessages.invitationId, invitationId), eq(guestMessages.isHidden, false));

/**
 * The newest page of an invitation's visible wishes. Newest first, capped: this query once had no bound at all, and a
 * wedding with 800 guests leaving wishes meant thousands of rows re-serialised on every view of the page that receives a
 * WhatsApp blast all at once. Exported (with the count) so `scripts/verify-wishes-api.ts` EXPLAINs exactly these
 * queries against `guest_messages_invitation_visible_idx` (B-017).
 */
export const visibleWishes = (invitationId: number) =>
  db.select().from(guestMessages).where(visibleOf(invitationId)).orderBy(desc(guestMessages.createdAt)).limit(GUESTBOOK_PAGE_SIZE);

export const visibleWishCount = (invitationId: number) => db.select({ value: count() }).from(guestMessages).where(visibleOf(invitationId));

/**
 * Loads everything the public renderer needs.
 *
 * Access rules (handoff 1.1 / 1.5):
 * - DRAFT invitations are not public at all.
 * - An invitation past `expiresAt` stays viewable but becomes read-only:
 *   RSVP and guestbook close while guest data is retained.
 * - The guest name is never part of the config; it is injected here from the
 *   guests table so one config can serve every guest.
 * - `includeDraft` is only for the owner preview (`app/preview/[id]`), which
 *   checks ownership before calling; public routes never pass it. It shows
 *   drafts and, as the host's own view, every gift detail (B-026).
 * - B-026 (D-047): gift details the host keeps to personal links are removed
 *   here for the invitation link's audience, before anything renders, so they
 *   reach neither the HTML nor the RSC payload nor the metadata.
 *
 * Wrapped in React `cache()` (B-014 step 1): `generateMetadata` and the page
 * of one request share a single load instead of querying everything twice.
 * The cache lives for one server request only, so guests never share results.
 * Arguments are primitives so the cache key is stable.
 */
export const loadPublicInvitation = cache(async (slug: string, guestSlug?: string, includeDraft = false) => {
  // B-031 (D-063): a deleted invitation is a missing one for every audience, the owner's preview included.
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.slug, slug), liveInvitation)).limit(1);
  if (!invitation || (invitation.status === 'DRAFT' && !includeDraft)) return null;

  const expired = invitation.status === 'EXPIRED' || (invitation.expiresAt ? invitation.expiresAt.getTime() < Date.now() : false);

  const guest = guestSlug ? await findGuestByLinkSegment(invitation.id, guestSlug) : null;

  // An unknown guest slug is a wrong link, not a different view of the page.
  if (guestSlug && !guest) return null;

  const { config, giftWithheld } = configForAudience(
    readStoredConfig(invitation.id, invitation.config),
    includeDraft ? 'owner' : guest ? 'personal' : 'link',
  );
  // R-04 (D-044): a closed guestbook and a hosts-only one list nothing, so neither guestbook query runs for them. The
  // listed wishes are the visible ones; pending and hidden wishes never reach the page. B-017: both queries use
  // `guest_messages_invitation_visible_idx`.
  const rules = guestbookRules(config);
  const listed = rules.enabled && rules.visibility === 'public';

  // B-019: the WebP variants of the invitation's uploads (none while `IMAGE_VARIANTS` is off).
  const [media, messages, messageCount, imageVariants] = await Promise.all([
    // I-21 (D-070): guest photos are never page media (no gallery, no payload); they reach a page only through its memory.
    db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.invitationId, invitation.id), ne(mediaAssets.type, GUEST_PHOTO_TYPE)))
      .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id)),
    listed ? visibleWishes(invitation.id) : Promise.resolve([]),
    listed ? visibleWishCount(invitation.id) : Promise.resolve([{ value: 0 }]),
    loadImageVariants(invitation.id),
  ]);

  const totalMessages = Number(messageCount[0]?.value ?? 0);

  return {
    invitation,
    config,
    guest,
    media,
    // Restored to chronological order for display; the cap is applied to the
    // most recent, which is what a guest arriving late actually wants to read.
    messages: [...messages].reverse(),
    totalMessages,
    hiddenMessageCount: Math.max(0, totalMessages - messages.length),
    expired,
    readOnly: expired,
    giftWithheld,
    imageVariants,
  };
});

/**
 * The guest a personal link's last segment refers to, under the B-011 rule (`guest-link.ts`): token first, then the
 * slug of a guest without a token. One indexed query; at most two candidate rows.
 */
export async function findGuestByLinkSegment(invitationId: number, segment: string) {
  if (!segment) return null;
  const rows = await db
    .select()
    .from(guests)
    .where(
      and(
        eq(guests.invitationId, invitationId),
        or(eq(guests.linkToken, segment), and(isNull(guests.linkToken), eq(guests.slug, segment))),
      ),
    )
    .limit(2);
  return pickGuestForSegment(rows, segment);
}

/**
 * Invitation row + parsed config for guest-facing side routes (calendar file, link-preview image, the child-photo route)
 * under the same visibility rule as the page: drafts are never public. No guest lookup, media or guestbook queries. The
 * config is the invitation link's (B-026, D-047): gift details kept to personal links are already gone.
 */
export async function loadPublishedInvitationSummary(slug: string) {
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.slug, slug), liveInvitation)).limit(1);
  if (!invitation || invitation.status === 'DRAFT') return null;
  return { invitation, config: configForAudience(readStoredConfig(invitation.id, invitation.config), 'link').config };
}

/**
 * B-026 (D-047): invitation row + the config one audience may carry, for the QRIS routes, under the page's visibility
 * rule (drafts are never public). A named guest segment must resolve under the B-011 rule (otherwise null, as the page
 * answers 404); without one the audience is the invitation link. The routes deliver only what this config still holds,
 * so the image follows exactly the page's privacy rule.
 */
export async function loadInvitationForGiftAudience(slug: string, guestSegment?: string) {
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.slug, slug), liveInvitation)).limit(1);
  if (!invitation || invitation.status === 'DRAFT') return null;
  const guest = guestSegment === undefined ? null : await findGuestByLinkSegment(invitation.id, guestSegment);
  if (guestSegment !== undefined && !guest) return null;
  return { invitation, config: configForAudience(readStoredConfig(invitation.id, invitation.config), guest ? 'personal' : 'link').config };
}

/**
 * Stored config → renderable config through the content contract's lenient read path. Before s11 any schema failure
 * turned the whole invitation into `{}` (an empty page for every guest); now only the failing section is dropped.
 * Only key names are logged, never values (they can hold personal data).
 */
function readStoredConfig(invitationId: number, stored: unknown): DetailConfig {
  const { config, dropped } = normalizeStoredConfig(stored ?? {});
  if (dropped.length) console.warn(`[invitation ${invitationId}] config sections skipped on read: ${dropped.join(', ')}`);
  return config;
}

/**
 * Records that the invitation was opened.
 *
 * The page is `force-dynamic`, so it re-renders on every RSC request —
 * including the redirect that follows an RSVP or guestbook submission. Counting
 * each of those would inflate per-guest open counts, which is precisely the
 * metric this product sells. Repeat views inside a short window therefore
 * collapse into the first one, atomically (B-017a, `view-tracking.ts`).
 *
 * Best-effort: a tracking failure must never stop a guest from seeing their
 * invitation. The writer (Next.js or the Rust API) is chosen per call by
 * `BACKEND_VIEWS` (R-02, `view-writer.ts`).
 */
export async function trackInvitationView(invitationId: number, guestId?: number | null) {
  try {
    await writeInvitationView(invitationId, guestId);
  } catch (error) {
    console.error('Failed to record invitation view', error);
  }
}
