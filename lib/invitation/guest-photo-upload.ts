import { sameOrigin } from '@/lib/api/same-origin';
import type { DetailConfig } from './detail-config';
import { GUEST_PHOTO_MAX_BYTES, GUEST_PHOTOS_PER_GUEST, guestPhotosOpen, photoNoticeQuery, type PhotoNotice } from './post-event';
import { guestPath } from './public-path';

/**
 * I-21 (D-070, R-X8): `POST /i/<slug>/<guest>/kenangan`, a guest's photo from their personal link. Free of the database
 * so the contract is unit-tested; the route wires the real loaders. A route handler rather than a server action: Next.js
 * caps a server action's body at 1 MB (raising it would raise it for every action), and here everything that can refuse
 * is decided from the link before the body is read. In order: same-origin only (ADR-A3, the check-in scanner's rule);
 * the passcode gate (G-047); a live, published invitation and a guest link that resolves (B-011); the memory open for
 * this guest with photos on and the invitation still taking writes; the guest's upload limit; their photo cap; a declared
 * body no larger than one photo; then the file (JPG, PNG or WebP by its bytes, at most 5 MB) under the invitation's
 * protected prefix (D-040) and its row, pending until the host reviews it. Every answer is a 303 back to the personal
 * link with the outcome (`?foto=…#kenangan`), built from the path, never from the form.
 */
export type GuestPhotoUploadDeps = {
  locked: (slug: string) => Promise<boolean>;
  openLink: (
    slug: string,
    guestSlug: string,
  ) => Promise<{ invitation: { id: number; status: string; expiresAt?: Date | null }; guest: { id: number; invitedEventIds?: unknown }; config: DetailConfig } | null>;
  /** Counts the attempt against the guest's limit; false once the window is spent. */
  allow: (invitationId: number, guestId: number) => Promise<boolean>;
  countBy: (invitationId: number, guestId: number) => Promise<number>;
  /** Stores a valid image under the invitation's protected prefix; its URL, or null when the file is refused. */
  save: (invitationId: number, file: File) => Promise<string | null>;
  insert: (invitationId: number, guestId: number, url: string) => Promise<number>;
  revalidate: (path: string) => void;
  now?: number;
  env?: Record<string, string | undefined>;
};

/** Multipart framing around the one file part; a body declared larger than a photo plus this is refused unread. */
export const UPLOAD_FRAMING_BYTES = 64 * 1024;

const PRIVATE_CACHE = 'private, no-store';

export async function receiveGuestPhoto(request: Request, params: { slug: string; guestSlug: string }, deps: GuestPhotoUploadDeps): Promise<Response> {
  if (!sameOrigin(request.headers)) return new Response('Forbidden', { status: 403, headers: { 'cache-control': PRIVATE_CACHE } });
  const page = guestPath(params.slug, params.guestSlug);
  const back = (notice: PhotoNotice) => seeOther(`${page}?${photoNoticeQuery(notice)}#kenangan`);

  if (await deps.locked(params.slug)) return seeOther(page);
  const link = await deps.openLink(params.slug, params.guestSlug);
  if (!link || !guestPhotosOpen({ invitation: link.invitation, config: link.config, guest: link.guest, now: deps.now, env: deps.env })) return back('closed');
  const { invitation, guest } = link;
  if (!(await deps.allow(invitation.id, guest.id))) return back('wait');
  if ((await deps.countBy(invitation.id, guest.id)) >= GUEST_PHOTOS_PER_GUEST) return back('full');

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > GUEST_PHOTO_MAX_BYTES + UPLOAD_FRAMING_BYTES) return back('invalid');
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('photo');
  } catch {
    return back('invalid');
  }
  const url = file instanceof File ? await deps.save(invitation.id, file) : null;
  if (!url) return back('invalid');
  await deps.insert(invitation.id, guest.id, url);
  deps.revalidate(page);
  return back('sent');
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': PRIVATE_CACHE } });
}
