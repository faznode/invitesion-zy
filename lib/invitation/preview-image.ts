import { isFlagOn } from '@/lib/flags';
import type { DetailConfig } from './detail-config';
import { visibleEvents } from './event-eligibility';
import { formatEventDate } from './event-time';
import { GUEST_DATE_LOCALE, GUEST_OG_LOCALE, guestCopy, guestPageLanguage } from './guest-copy';
import { invitationDisplayName } from './headline';
import { paletteHex } from './palettes';
import { invitationPreviewImagePath } from './public-path';

/**
 * Link-preview image for WhatsApp and other unfurlers (B-010). One image per invitation, never per guest: guest names
 * stay out of it because the same image is cached and shown to everyone the link is forwarded to.
 * The URL carries a hash of exactly what the image shows, so an edit produces a new URL instead of a stale cached card.
 */
/** The event types the card names; every other type reads "Undangan" (G-018: in the invitation's language). */
const LABELLED_EVENT_TYPES = new Set(['wedding', 'birthday', 'corporate']);

export const PREVIEW_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** G-035 (I-16): the 9:16 Status / Story image, drawn from the same model as the link preview (`story-image.tsx`). */
export const STORY_IMAGE_SIZE = { width: 1080, height: 1920 } as const;

function clip(value: string, max: number) {
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : value;
}

/**
 * Glyphs of the font next/og bundles (Noto Sans, latin subset). For anything else next/og fetches glyphs at render
 * time from Google Fonts / jsDelivr with the characters in the query string — that would send parts of customers'
 * names to a third party — and it draws Arabic without bidi shaping. Such names stay out of the image (the label and
 * date remain); the unfurler still shows them in og:title, which it renders itself.
 */
export const BUNDLED_FONT_TEXT = /^[\u0020-\u007E\u00A0-\u00FF\u2010-\u2027\u2030-\u203A]*$/;

/**
 * G-018: the card speaks the invitation page's language (`guestPageLanguage`: a design family's `settings.language`,
 * Indonesian by default and always on the classic layout). An Indonesian card's model, and so its version hash, is
 * exactly what it was before G-018, so no cached card is invalidated by the change.
 */
export function previewImageModel(eventType: string, config: DetailConfig, inviteOnlyOn = isFlagOn('INVITE_ONLY_EVENTS'), coverOnly = false) {
  const language = guestPageLanguage(config);
  const copy = guestCopy(language);
  const name = clip(invitationDisplayName(eventType, config, copy.invitation), 48);
  // D-037: the card is shown to anyone the link reaches, so its date is the first open event's, never an invite-only one.
  const [firstOpenEvent] = visibleEvents(config.events, { kind: 'public' }, inviteOnlyOn);
  return {
    label: (LABELLED_EVENT_TYPES.has(eventType) ? copy.kickers[eventType] : undefined) ?? copy.invitation,
    name,
    imageName: BUNDLED_FONT_TEXT.test(name) ? name : null,
    // G-047 (D-069): a passcode-protected invitation's card shows its cover alone (label and names), never a date.
    date: coverOnly ? null : formatEventDate(firstOpenEvent?.startAt, config.eventOperations?.timezone, GUEST_DATE_LOCALE[language]),
    colors: paletteHex(config.theme?.paletteId),
  };
}

export type PreviewImageModel = ReturnType<typeof previewImageModel>;

/** FNV-1a (32-bit) of the model: stable, dependency-free, enough to bust caches. */
export function previewImageVersion(model: PreviewImageModel): string {
  const text = JSON.stringify(model);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The invitation's public title: the host's own, else the card's label and names (og:title and the G-035 share sheet). */
export function invitationShareTitle(model: PreviewImageModel, config: DetailConfig): string {
  return config.settings?.title?.trim() || `${model.label} ${model.name}`;
}

/**
 * Open Graph + Twitter metadata for a published invitation page (both the general and the personal link). `coverOnly`
 * (G-047, a passcode-protected invitation, whether or not this visitor entered the code: unfurlers never do) keeps the
 * cover's title and names and drops the opening text and the date.
 */
export function invitationShareMetadata(invitation: { slug: string; eventType: string }, config: DetailConfig, { coverOnly = false } = {}) {
  const model = previewImageModel(invitation.eventType, config, undefined, coverOnly);
  const title = invitationShareTitle(model, config);
  const description = coverOnly ? undefined : config.settings?.openingCopy?.trim() || undefined;
  const url = `${invitationPreviewImagePath(invitation.slug)}?v=${previewImageVersion(model)}`;
  const image = { url, ...PREVIEW_IMAGE_SIZE, alt: `${model.label} ${model.name}` };
  return {
    description,
    openGraph: { title, description, type: 'website' as const, locale: GUEST_OG_LOCALE[guestPageLanguage(config)], images: [image] },
    twitter: { card: 'summary_large_image' as const, title, description, images: [url] },
  };
}
