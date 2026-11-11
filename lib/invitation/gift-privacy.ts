import { RENDER_CAPABILITIES } from './content-contract';
import type { DetailConfig } from './detail-config';
import { isProtectedMediaPath, mediaPathInvitationId } from './image-url';

/**
 * G-045 (D-058): the sections no guest surface shows at all (the content contract lists neither a rendered nor a
 * stored-only field: the seating plan, meal preferences, communications, secondary events, ticketing, the event planner,
 * the WhatsApp template), dropped from the guest audiences so host tools never travel with a guest page's data.
 * `checkInSettings` stays because the personal page's pass reads it on the server (B-024), `schemaVersion` for the readers.
 */
const READ_FOR_GUESTS = new Set<string>(['checkInSettings', 'schemaVersion']);
export const HOST_ONLY_SECTIONS: readonly string[] = Object.entries(RENDER_CAPABILITIES)
  .filter(([section, capability]) => capability.rendered.length === 0 && capability.storedOnly.length === 0 && !READ_FOR_GUESTS.has(section))
  .map(([section]) => section);

function withoutHostOnlySections(config: DetailConfig): DetailConfig {
  if (!HOST_ONLY_SECTIONS.some((section) => section in config)) return config;
  const kept: Record<string, unknown> = { ...config };
  for (const section of HOST_ONLY_SECTIONS) delete kept[section];
  return kept as DetailConfig;
}

/**
 * B-026 / G-021 (D-047): who may see an invitation's gift details (account numbers, holders, notes, the host's QRIS
 * image). Bank and e-wallet details are personal data (UU PDP), so a host can keep them to personal guest links.
 *
 * - `personal`: a personal guest link that resolved under the B-011 rule (an opaque token, or the slug of a guest
 *   without one).
 * - `link`: the invitation's link without a guest, and every response built for it (its metadata, link-preview image,
 *   calendar file and the slug-level QRIS route). Query parameters never change the audience.
 * - `owner`: the host's own preview, after its ownership check.
 */
export type GiftAudience = 'personal' | 'link' | 'owner';

/**
 * Absent counts as off: invitations created before B-026 keep today's visibility until their host changes it, and
 * `createInvitation` starts every new invitation with it on (`withNewInvitationGiftDefaults`).
 */
export function giftPersonalOnly(config: Pick<DetailConfig, 'gift'>): boolean {
  return config.gift?.personalOnly === true;
}

/**
 * The config a response for this audience may carry. The loaders apply it before anything renders, so withheld details
 * are absent from the HTML, the RSC payload, client props and metadata alike, rather than hidden by a layout.
 * `giftWithheld` is true when the section is on and something was removed, so the page can say where to find it.
 */
export function configForAudience(config: DetailConfig, audience: GiftAudience): { config: DetailConfig; giftWithheld: boolean } {
  const shown = audience === 'owner' ? config : withoutHostOnlySections(config);
  const gift = shown.gift;
  if (!gift || audience !== 'link' || !giftPersonalOnly(shown)) return { config: shown, giftWithheld: false };
  const giftWithheld = gift.enabled === true && Boolean(gift.accounts?.length || gift.qrisImageUrl);
  const kept = { ...gift };
  delete kept.accounts;
  delete kept.qrisImageUrl;
  return { config: { ...shown, gift: kept }, giftWithheld };
}

/** `createInvitation`: a new invitation keeps its gift details to personal links from the start (B-026's new-only default). */
export function withNewInvitationGiftDefaults(config: Record<string, unknown>): Record<string, unknown> {
  const gift = config.gift && typeof config.gift === 'object' && !Array.isArray(config.gift) ? (config.gift as Record<string, unknown>) : {};
  return { ...config, gift: { ...gift, personalOnly: true } };
}

/**
 * The host's QRIS image when it is this invitation's protected upload, otherwise nothing: a stored value of any other
 * shape, or another invitation's upload, never renders and is never delivered.
 */
export function ownQrisUpload(path: string | undefined, invitationId: number): string | undefined {
  return path && isProtectedMediaPath(path) && mediaPathInvitationId(path) === invitationId ? path : undefined;
}
