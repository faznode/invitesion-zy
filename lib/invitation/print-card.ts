import { isFlagOn } from '@/lib/flags';
import type { DetailConfig } from './detail-config';
import { BUNDLED_FONT_TEXT } from './preview-image';

/**
 * G-055 (I-30): printable cards and an e-card whose QR code opens the live invitation. Two kinds, one rule:
 * - the e-card (`/i/<slug>/card.png`): public, drawn from the link preview's model (B-010) and nothing else, its code
 *   opens the general invitation link; anyone may receive it, so it never carries a guest;
 * - a guest's card (owner only, `/dashboard/invitations/<id>/cards/<guest>`): the same card with "Kepada Yth." and the
 *   guest's name, its code opens that guest's personal link, so only the owner may make it (`manage`).
 * A card exists only while the code reaches an authorized live link: a published invitation whose host opted in
 * (`settings.cardExport = true`). A draft's link answers 404 and an expired one is read-only, so neither gets a card.
 */

/** A6 portrait at 300 dpi (105 × 148 mm): prints sharp at the size of a paper invitation and stays light to send. */
export const CARD_IMAGE_SIZE = { width: 1240, height: 1748 } as const;

/** Whether cards are offered and, if not, why: the owner page names the reason, the routes only ask for `available`. */
export type CardExportState = 'available' | 'draft' | 'expired' | 'off';

/**
 * The one rule. Expiry is the guest page's own (`loadPublicInvitation`): past `expiresAt` the link is read-only whatever
 * the stored status says, and most expired invitations still say PUBLISHED. Off covers the flag and the missing opt-in.
 */
export function cardExportState(
  invitation: { status: string; expiresAt?: Date | null },
  config: DetailConfig,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): CardExportState {
  if (invitation.status === 'DRAFT') return 'draft';
  if (invitation.status === 'EXPIRED' || (invitation.expiresAt && invitation.expiresAt.getTime() < now)) return 'expired';
  if (!isFlagOn('CARD_EXPORT', env) || invitation.status !== 'PUBLISHED' || config.settings?.cardExport !== true) return 'off';
  return 'available';
}

export function cardExportAvailable(
  invitation: { status: string; expiresAt?: Date | null },
  config: DetailConfig,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  return cardExportState(invitation, config, now, env) === 'available';
}

/** The absolute address a card's code opens: the general invitation link, or a guest's personal link. */
export function cardTarget(origin: string, slug: string, guestSegment?: string): string {
  const base = `${origin.replace(/\/+$/, '')}/i/${encodeURIComponent(slug)}`;
  return guestSegment === undefined ? base : `${base}/${encodeURIComponent(guestSegment)}`;
}

/** The address printed under the code for a guest who types it instead: the target without its scheme. */
export function cardAddressText(target: string): string {
  return target.replace(/^https?:\/\//, '');
}

/**
 * A guest's name as the card prints it, or null: only text the bundled Latin font can draw (rendering never fetches
 * glyphs), at most 60 characters. A name it cannot print leaves the greeting off; the code still opens their link.
 */
export function cardGuestName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed && trimmed.length <= 60 && BUNDLED_FONT_TEXT.test(trimmed) ? trimmed : null;
}

/** `<slug>-kartu.png`, or `<slug>-<guest link>-kartu.png` for a guest's card; only filename-safe characters. */
export function cardFileName(slug: string, guestSegment?: string): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9-]/g, '-');
  return guestSegment === undefined ? `${safe(slug)}-kartu.png` : `${safe(slug)}-${safe(guestSegment)}-kartu.png`;
}
