import { randomBytes } from 'node:crypto';

/**
 * Guest link credentials (B-011, QA-003).
 *
 * Legacy links end in the guest slug — a slugified name, so anyone holding one link can guess another guest's link and
 * answer or post as them. With `FLAG_OPAQUE_GUEST_LINKS=on`, new guests also get a random token and their link ends in
 * it instead. Resolution rule for the last URL segment:
 *   1. a guest whose token equals the segment;
 *   2. otherwise a guest WITHOUT a token whose slug equals the segment (legacy links keep working);
 *   3. otherwise nothing (404).
 * A guest that has a token is therefore never reachable through their guessable slug.
 */
export const GUEST_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** 128 random bits, base64url: 22 URL-safe characters with no padding. */
export function newGuestLinkToken(): string {
  return randomBytes(16).toString('base64url');
}

type LinkableGuest = { slug: string; linkToken?: string | null };

/** The last segment of a guest's personal link. */
export function guestLinkSegment(guest: LinkableGuest): string {
  return guest.linkToken || guest.slug;
}

/** Applies the resolution rule to the candidate rows of one invitation (token match first, then legacy slug). */
export function pickGuestForSegment<T extends LinkableGuest>(rows: T[], segment: string): T | null {
  if (!segment) return null;
  return rows.find((row) => row.linkToken === segment) ?? rows.find((row) => !row.linkToken && row.slug === segment) ?? null;
}
