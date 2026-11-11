import { isFlagOn } from '@/lib/flags';
import type { DetailConfig } from './detail-config';
import { familyOf } from './families';
import { invitationShareTitle, previewImageModel, previewImageVersion } from './preview-image';
import { invitationPath, invitationStoryImagePath } from './public-path';

/**
 * G-035 (I-16): what a guest page offers for passing the invitation on: the device's share sheet with a copy fallback,
 * WhatsApp, and a 9:16 Status / Story image. Everything here is the invitation's public face, the link preview's data
 * (B-010). The shared address is the invitation link `/i/<slug>`, never a guest's personal link (that would hand on their
 * name and their RSVP), and the title and the image name the invitation, never a guest. The model takes no guest at all,
 * so the shared link and every personal link offer exactly the same thing.
 */
export type InviteShare = {
  /** The invitation link; the browser makes it absolute from the address the guest is on. */
  path: string;
  title: string;
  storyHref: string;
  storyFileName: string;
};

type ShareableInvitation = { slug: string; eventType: string; status: string; expiresAt?: Date | null };

/**
 * One rule for the page's share actions and the Story image route (`/i/<slug>/story.png`): guest sharing on
 * (`GUEST_SHARE`), a published invitation that has not expired, on a design family (the legacy layout is frozen, D-041),
 * and not hidden by its host (`settings.guestShare = false`). A draft's link would answer 404, so it is never offered.
 */
export function inviteShareAvailable(
  invitation: Pick<ShareableInvitation, 'status' | 'expiresAt'>,
  config: DetailConfig,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!isFlagOn('GUEST_SHARE', env) || invitation.status !== 'PUBLISHED') return false;
  if (invitation.expiresAt && invitation.expiresAt.getTime() < now) return false;
  return Boolean(familyOf(config.theme?.familyId)) && config.settings?.guestShare !== false;
}

export function inviteShareOf(
  invitation: ShareableInvitation,
  config: DetailConfig,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): InviteShare | null {
  if (!inviteShareAvailable(invitation, config, now, env)) return null;
  const model = previewImageModel(invitation.eventType, config);
  return {
    path: invitationPath(invitation.slug),
    title: invitationShareTitle(model, config),
    // The link preview's version, so an edit is never served from a stale cached image.
    storyHref: `${invitationStoryImagePath(invitation.slug)}?v=${previewImageVersion(model)}`,
    storyFileName: `${invitation.slug}-story.png`,
  };
}
