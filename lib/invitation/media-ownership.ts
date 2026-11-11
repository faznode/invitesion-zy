import { isProtectedMediaPath, isUploadedMediaPath, mediaPathInvitationId } from './image-url';
import { childPhotoSlotOf } from './portraits';

/**
 * D-040, save time: what the detail schema cannot know without the invitation.
 * 1. A protected path (`/media/protected/<id>/…`) may stand only in this event type's child-photo field or in the gift's
 *    QRIS image (B-026, D-047), and must name this invitation. Anywhere else it is refused: a public field would hand
 *    guests an owner-only URL. (The reason keeps its D-040 name.)
 * 2. The child-photo field may hold an upload of this invitation (public or protected) or an absolute URL the host typed;
 *    another invitation's upload or a user's avatar is refused. The QRIS field holds a protected upload only (schema).
 *
 * Only sections the save touches are reported, so a stored value from before D-040 never blocks saving another section;
 * the guest page applies the same rule at render time (`childPhotoSrcFor`) and the photo route at delivery.
 */
export type MediaReferenceIssue = { path: string; reason: 'protected-outside-child-photo' | 'not-this-invitation' };

export class MediaReferenceError extends Error {
  constructor(readonly issues: MediaReferenceIssue[]) {
    super(`Image reference refused at ${issues.map((issue) => issue.path).join(', ')}`);
    this.name = 'MediaReferenceError';
  }
}

/** B-026 (D-047): the host's static QRIS image, a protected upload of this invitation on every event type. */
export const GIFT_QRIS_FIELD = 'gift.qrisImageUrl';

export function childPhotoField(eventType: string): string | null {
  const slot = childPhotoSlotOf(eventType);
  if (slot === 'celebrant') return 'birthdayPerson.photoUrl';
  if (slot === 'honouree') return 'ceremonyProfile.photoUrl';
  return null;
}

export function mediaReferenceIssues(
  config: unknown,
  context: { invitationId: number; eventType: string; touchedSections?: readonly string[] },
): MediaReferenceIssue[] {
  const childField = childPhotoField(context.eventType);
  const issues: MediaReferenceIssue[] = [];
  const touched = context.touchedSections ? new Set(context.touchedSections) : null;

  const visit = (value: unknown, path: string[]) => {
    if (typeof value === 'string') {
      const at = path.join('.');
      if (touched && !touched.has(path[0] ?? '')) return;
      if (at === childField || at === GIFT_QRIS_FIELD) {
        const upload = isUploadedMediaPath(value) || isProtectedMediaPath(value);
        if (upload && mediaPathInvitationId(value) !== context.invitationId) issues.push({ path: at, reason: 'not-this-invitation' });
        return;
      }
      if (isProtectedMediaPath(value)) issues.push({ path: at, reason: 'protected-outside-child-photo' });
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, [...path, String(index)]));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, [...path, key]);
  };
  visit(config, []);
  return issues;
}
