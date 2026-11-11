import type { GuestPageProps } from '@/components/invitation/guest-view';
import type { Invitation } from '@/lib/db/schema';
import { NO_IMAGE_VARIANTS } from '@/lib/media/variants';
import { normalizeStoredConfig } from './content-read';
import type { DetailConfig } from './detail-config';
import { configForAudience } from './gift-privacy';

/**
 * B-037 + I-08: what the try-with-your-names preview hands the real guest renderer. It mirrors the owner preview
 * (`app/preview/[id]`) of a draft holding the same config: the config is read the way a stored one is (JSON, the lenient
 * normalisation, S18-Q4) for the host's own audience (B-026), with no guest, no uploads, no wishes and no variants, so
 * no RSVP or guestbook form renders. Nothing here touches the database.
 */

/** A slug no invitation can carry (`slugify` never emits `_`), so links the renderer builds from it lead nowhere real. */
export const TRIAL_PREVIEW_SLUG = '_pratinjau';

export function trialPreviewInvitation(eventType: string, config: DetailConfig, overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 0,
    userId: 0,
    templateId: null,
    slug: TRIAL_PREVIEW_SLUG,
    eventType,
    config,
    status: 'DRAFT',
    revisionCount: 0,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date(0),
    creationKey: null,
    deletedAt: null,
    purgeAfter: null,
    purgedAt: null,
    workspaceId: null,
    clientLabel: null,
    guestPasscodeHash: null,
    guestPasscodeSetAt: null,
    ...overrides,
  };
}

/** The config as a draft would hand it to the renderer after a round trip through `invitations.config`. */
export function storedReadOf(config: DetailConfig): DetailConfig {
  const stored: unknown = JSON.parse(JSON.stringify(config));
  return configForAudience(normalizeStoredConfig(stored).config, 'owner').config;
}

export function trialPreviewProps(invitation: Invitation, config: DetailConfig): GuestPageProps {
  return {
    invitation,
    config: storedReadOf(config),
    guest: null,
    preview: true,
    media: [],
    messages: [],
    totalMessages: 0,
    hiddenMessageCount: 0,
    readOnly: false,
    status: {},
    imageVariants: NO_IMAGE_VARIANTS,
  };
}
