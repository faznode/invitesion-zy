import 'server-only';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { DetailConfig } from './detail-config';
import { guestPageLanguage, type GuestLanguage } from './guest-copy';
import { passcodeGateActive, unlockCookieName, unlockTokenValid } from './guest-passcode';
import { invitationShareMetadata, invitationShareTitle, previewImageModel } from './preview-image';
import { loadPublishedInvitationSummary } from './public';

/** What a locked page may show (G-047, D-069): the cover's label and names, as the link preview already does. */
export type PasscodeCover = { label: string; name: string; language: GuestLanguage; colors: { bg: string; ink: string; accent: string } };

export function passcodeCover(eventType: string, config: DetailConfig): PasscodeCover {
  const model = previewImageModel(eventType, config, undefined, true);
  return { label: model.label, name: model.name, language: guestPageLanguage(config), colors: model.colors };
}

export type GuestGate =
  | { locked: false; passcode: boolean }
  | { locked: true; invitationId: number; cover: PasscodeCover; metadata: Metadata };

/**
 * G-047 (D-069): whether this request may see the invitation behind `slug`. Null when there is no published, live
 * invitation (each caller answers its own 404 as before). Unlocked without a passcode or with the flag off; with one, only
 * a valid admission cookie (`guest-passcode.ts`) unlocks it. Called before any guest, wish, media or gift query, so a
 * locked response is built from the cover alone; one load per request (`cache`).
 */
export const loadGuestGate = cache(async (slug: string): Promise<GuestGate | null> => {
  const summary = await loadPublishedInvitationSummary(slug);
  if (!summary) return null;
  const { invitation, config } = summary;
  if (!passcodeGateActive(invitation)) return { locked: false, passcode: false };
  const token = (await cookies()).get(unlockCookieName(invitation.id))?.value;
  if (unlockTokenValid(token, invitation.id, invitation.guestPasscodeHash as string)) return { locked: false, passcode: true };
  const model = previewImageModel(invitation.eventType, config, undefined, true);
  return {
    locked: true,
    invitationId: invitation.id,
    cover: passcodeCover(invitation.eventType, config),
    metadata: {
      title: invitationShareTitle(model, config),
      ...invitationShareMetadata(invitation, config, { coverOnly: true }),
      robots: { index: false, follow: false },
    },
  };
});

/** For actions and side routes: true only when a passcode applies and this request has not been admitted. */
export async function guestAccessLocked(slug: string): Promise<boolean> {
  return (await loadGuestGate(slug))?.locked === true;
}

/** The answer of a side route a locked request may not read: the same 404 as a missing invitation, never cached. */
export function lockedResponse(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}
