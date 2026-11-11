/**
 * Image sources a host can put on an invitation. An upload is stored by `lib/storage` and served from this origin at
 * `/media/<key>` (`mediaUrl`); anything else is an absolute URL typed into a field. The detail schema and the guest page
 * share these rules, so an image the editor has just uploaded is neither refused on save nor dropped on render.
 */

const IMAGE_EXT = '(?:png|jpg|webp|gif)';
// No leading zeros: `invitationMediaKey` writes `String(id)`, so `01/…` can never name invitation 1's objects.
const INVITATION_ID = '(0|[1-9]\\d{0,14})';

// Exactly the keys `invitationMediaKey` and `avatarKey` produce (`<id>/<24 hex>.<ext>`, optionally under `avatars/`)
// with the extensions `ALLOWED_IMAGE_EXT` stores, so no `..`, `//`, query or other path can pass as an upload.
const UPLOADED_MEDIA_PATH = new RegExp(`^/media/(?:avatars/)?${INVITATION_ID}/[0-9a-f]{24}\\.${IMAGE_EXT}$`);
const INVITATION_MEDIA_PATH = new RegExp(`^/media/${INVITATION_ID}/[0-9a-f]{24}\\.${IMAGE_EXT}$`);

/**
 * s23r (D-040): a child's photo uploaded since E-047's completion lives under `protected/<invitation>/…`. `/media` serves
 * it to the invitation's signed-in owner only; guests reach it through their personal link's photo route. It is never a
 * valid public image source (`safeImageSrc` refuses it), so no public field can render it.
 */
const PROTECTED_MEDIA_PATH = new RegExp(`^/media/protected/${INVITATION_ID}/[0-9a-f]{24}\\.${IMAGE_EXT}$`);

export function isUploadedMediaPath(value: string): boolean {
  return UPLOADED_MEDIA_PATH.test(value);
}

export function isProtectedMediaPath(value: string): boolean {
  return PROTECTED_MEDIA_PATH.test(value);
}

/**
 * The invitation an upload belongs to, from its path: `/media/<id>/…` or `/media/protected/<id>/…`. Null for avatars
 * (a user's, not an invitation's), absolute URLs and anything malformed. Uploads are written only after the upload route's
 * ownership check, so the id in a well-formed key names the invitation whose owner stored it.
 */
export function mediaPathInvitationId(value: string): number | null {
  const match = INVITATION_MEDIA_PATH.exec(value) ?? PROTECTED_MEDIA_PATH.exec(value);
  return match ? Number(match[1]) : null;
}

/** Anything `new URL()` parses without a base, which is what zod's `.url()` accepts. */
export function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The value as an `<img src>` a guest page may request: an upload path or an http(s) URL. A stored value can also be
 * any other scheme `new URL()` parses (`javascript:`, `data:`, `blob:`, `file:`); those render nothing. A protected path
 * renders nothing here either: only the child-photo slots read it, through `safeChildPhotoSrc`.
 */
export function safeImageSrc(value?: string): string | undefined {
  if (!value) return undefined;
  if (isUploadedMediaPath(value)) return value;
  if (!isAbsoluteUrl(value)) return undefined;
  const { protocol, href } = new URL(value);
  return protocol === 'https:' || protocol === 'http:' ? href : undefined;
}

/** `safeImageSrc` plus a protected upload path: for the child-photo slots only (D-040). */
export function safeChildPhotoSrc(value?: string): string | undefined {
  if (value && isProtectedMediaPath(value)) return value;
  return safeImageSrc(value);
}
