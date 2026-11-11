/**
 * Paths for invitation pages, free of server-only imports so client components (the editor) can use them too.
 *
 * Guest-facing format is locked by REBUILD-HANDOFF section 1.5: /i/:invitationSlug/:guestSlug. The guest slug is
 * what makes per-guest personalisation and open tracking possible, so it must never be dropped from a share link.
 */
export function guestPath(invitationSlug: string, guestSlug: string) {
  return `/i/${encodeURIComponent(invitationSlug)}/${encodeURIComponent(guestSlug)}`;
}

export function invitationPath(invitationSlug: string) {
  return `/i/${encodeURIComponent(invitationSlug)}`;
}

/**
 * Side routes of a published invitation (B-008, B-010). Their last segment contains a dot, which no guest slug can
 * (every slug generator emits `[a-z0-9-]` only), so they can never shadow a guest page at `/i/<slug>/<guestSlug>`.
 */
export function invitationCalendarPath(invitationSlug: string) {
  return `${invitationPath(invitationSlug)}/calendar.ics`;
}

export function invitationPreviewImagePath(invitationSlug: string) {
  return `${invitationPath(invitationSlug)}/og.png`;
}

/** G-035 (I-16): the 9:16 Status / Story image, made from the link preview's public data. */
export function invitationStoryImagePath(invitationSlug: string) {
  return `${invitationPath(invitationSlug)}/story.png`;
}

/** B-026 (D-047): the host's QRIS image for the invitation link's audience (served only while gift details are public). */
export function invitationGiftQrisPath(invitationSlug: string) {
  return `${invitationPath(invitationSlug)}/gift-qris.img`;
}

/** B-026 (D-047): the host's QRIS image for one personal link; two segments below the guest page, like the photo route. */
export function guestGiftQrisPath(invitationSlug: string, guestSlug: string) {
  return `${guestPath(invitationSlug, guestSlug)}/gift/qris`;
}

/**
 * E-047 (s22): a child's photo for one personal link (`lib/invitation/portraits.ts`, `childPhotoUpload`). Two segments
 * below the guest page, so it never competes with a guest slug.
 */
export function guestChildPhotoPath(invitationSlug: string, guestSlug: string, slot: 'celebrant' | 'honouree') {
  return `${guestPath(invitationSlug, guestSlug)}/photo/${slot}`;
}

/**
 * The owner's preview of an invitation in any status (B-005): the same renderer guests get, behind the owner's
 * session, without view tracking. Public `/i/<slug>` refuses drafts, so the editor links here instead.
 */
export function ownerPreviewPath(invitationId: number) {
  return `/preview/${encodeURIComponent(String(invitationId))}`;
}
