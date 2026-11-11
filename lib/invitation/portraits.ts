import { GUEST_COPY, type GuestCopy } from './guest-copy';
import { isProtectedMediaPath, isUploadedMediaPath, mediaPathInvitationId, safeChildPhotoSrc, safeImageSrc } from './image-url';

/**
 * s20 (D-038): person photos on the guest page, the last stored-only ceremony field and the couple's and celebrant's photos.
 * One rule set for every layout; layouts only choose the frame.
 *
 * Children's privacy: an aqiqah or khitanan honouree is a child, and a birthday celebrant often is. Such a photo is shown
 * only when the host switched it on (`showPhoto`) and only to someone holding a personal guest link (or the host's own
 * preview): never on the page without a guest link, and never in the link preview (that image carries no photo at all).
 * Adults' photos (the couple, a tasyakuran honouree) are shown once uploaded, as the editor has always offered.
 *
 * Every photo is framed at full strength with no text on it (T1), in a box of fixed aspect so nothing moves while it
 * loads, with an alt text naming the person. Upload paths and http(s) URLs only (`safeImageSrc`).
 */

export type Portrait = { key: string; src: string; alt: string; name?: string; caption?: string };
export type Portraits = { heading: string; people: Portrait[] } | null;
export type PortraitAudience = { personalLink: boolean; preview: boolean };

type Side = { fullName?: string; nickName?: string; parents?: string; order?: number; photoUrl?: string };
const ORDINALS = ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan', 'kesembilan', 'kesepuluh'];
const clean = (value?: string) => value?.trim() || undefined;

/**
 * The relation a host may already have typed in the parents field ("Putri dari …", "Putra sulung Bapak …"): the word,
 * then an optional rank, before "dari" or a parent's title. s20 acceptance found "Putri kedua dari Putri dari …".
 */
const TYPED_RELATION = new RegExp(
  `^(putra|putri|anak)(\\s+(?:${ORDINALS.join('|')}|sulung|bungsu|tunggal|ke-?\\s?\\d+))?(?=\\s+(?:dari|bapak|ibu|bpk|keluarga|alm|almh|almarhum|almarhumah)\\b)`,
  'i',
);

/**
 * "Putri kedua dari …": the parents line the couple section shows under a name, when the host gave the parents. The
 * editor asks for the parents' names only ("Bapak Budi & Ibu Ani"); when the host typed the relation anyway, their words
 * are kept, with the order the host set added after the relation word only if they wrote no rank of their own.
 */
export function parentsLine(child: 'putra' | 'putri', parents?: string, order?: number, people: PeopleCopy = GUEST_COPY.id.people): string | undefined {
  const names = clean(parents);
  if (!names) return undefined;
  const rank = order && order >= 1 ? (ORDINALS[order - 1] ?? `ke-${order}`) : undefined;
  const typed = TYPED_RELATION.exec(names);
  if (typed) return typed[2] || !rank ? names : `${typed[1]} ${rank}${names.slice(typed[1].length)}`;
  // G-018: the relation in the guest's language ("Second daughter of …"); a relation the host typed is kept as typed.
  return people.parentsLine(child, names, order);
}

type PeopleCopy = GuestCopy['people'];

function sidePortrait(key: string, side: Side | undefined, child: 'putra' | 'putri', fallbackAlt: string, people: PeopleCopy): Portrait | null {
  const src = safeImageSrc(side?.photoUrl);
  if (!src) return null;
  const name = clean(side?.fullName) ?? clean(side?.nickName);
  return { key, src, alt: name ? people.photoOf(name) : fallbackAlt, name, caption: parentsLine(child, side?.parents, side?.order, people) };
}

/** Whether a child's photo may be shown here: the host's consent and a personal guest link (or the host's preview). */
export function childPhotoAllowed(showPhoto: boolean | undefined, audience: PortraitAudience): boolean {
  return showPhoto === true && (audience.personalLink || audience.preview);
}

/**
 * The couple, bride and groom in the host's display order; null without a photo, so pages without photos do not change.
 * The legacy layout's section (frozen by D-041); the design families show `coupleProfiles` instead (B-023).
 */
export function couplePortraits(
  input: { bride?: Side; groom?: Side; displayOrder?: 'bride-first' | 'groom-first' },
  copy: PeopleCopy = GUEST_COPY.id.people,
): Portraits {
  const bride = sidePortrait('bride', input.bride, 'putri', copy.brideAlt, copy);
  const groom = sidePortrait('groom', input.groom, 'putra', copy.groomAlt, copy);
  const people = (input.displayOrder === 'groom-first' ? [groom, bride] : [bride, groom]).filter((p): p is Portrait => p !== null);
  return people.length ? { heading: copy.couple, people } : null;
}

/** B-023: one side of the couple on the design families; the photo is optional (no `src`: a text-only profile). */
export type Profile = { key: string; src?: string; alt?: string; name?: string; caption?: string };
export type Profiles = { heading: string; people: Profile[] } | null;

function sideProfile(key: string, side: Side | undefined, child: 'putra' | 'putri', fallbackAlt: string, people: PeopleCopy) {
  const src = safeImageSrc(side?.photoUrl);
  const fullName = clean(side?.fullName);
  const nickName = clean(side?.nickName);
  const name = fullName ?? nickName;
  // A parents line with neither a name nor a photo has no one to describe, so such a side renders nothing.
  if (!src && !name) return null;
  const caption = parentsLine(child, side?.parents, side?.order, people);
  // The headline already shows the nickname (or the full name without one); a profile adds a photo, a parents line or
  // a full name beside the nickname.
  const adds = Boolean(src || caption || (fullName && nickName && fullName !== nickName));
  const profile: Profile = { key, name, caption, ...(src && { src, alt: name ? people.photoOf(name) : fallbackAlt }) };
  return { profile, adds };
}

/**
 * B-023 (G-026, D-049): the couple's full profiles on the design families: full name, parents line with the child order,
 * and photo, each when filled, a photo no longer required. The section opens only when a side has something the headline
 * does not already say (a photo, a parents line, or a full name beside the nickname), so a page with nicknames alone
 * stays as it was; then both sides that have a name or a photo appear, in the host's display order. With both photos it
 * equals `couplePortraits`.
 */
export function coupleProfiles(
  input: { bride?: Side; groom?: Side; displayOrder?: 'bride-first' | 'groom-first' },
  copy: PeopleCopy = GUEST_COPY.id.people,
): Profiles {
  const bride = sideProfile('bride', input.bride, 'putri', copy.brideAlt, copy);
  const groom = sideProfile('groom', input.groom, 'putra', copy.groomAlt, copy);
  const sides = (input.displayOrder === 'groom-first' ? [groom, bride] : [bride, groom]).filter((side) => side !== null);
  return sides.some((side) => side.adds) ? { heading: copy.couple, people: sides.map((side) => side.profile) } : null;
}

/**
 * The birthday celebrant, by the child rule whatever the age: a birthday invitation is very often a child's, and a stored
 * age is optional and unchecked, so the photo needs the host's switch and a personal link.
 */
export function birthdayPortrait(
  input: { fullName?: string; nickName?: string; photoUrl?: string; showPhoto?: boolean },
  audience: PortraitAudience,
  copy: PeopleCopy = GUEST_COPY.id.people,
): Portraits {
  const src = safeChildPhotoSrc(input.photoUrl);
  if (!src) return null;
  if (!childPhotoAllowed(input.showPhoto, audience)) return null;
  const name = clean(input.fullName) ?? clean(input.nickName);
  return { heading: copy.celebrant, people: [{ key: 'celebrant', src, alt: name ? copy.photoOf(name) : copy.celebrantAlt, name }] };
}

/** The ceremony honouree: aqiqah and khitanan by the child rule; tasyakuran (an adult's thanksgiving) once uploaded. */
export function ceremonyPortrait(
  eventType: string,
  input: { honoureeName?: string; nickName?: string; photoUrl?: string; showPhoto?: boolean },
  audience: PortraitAudience,
  copy: PeopleCopy = GUEST_COPY.id.people,
): Portrait | null {
  const child = eventType === 'aqiqah' || eventType === 'khitanan';
  // A protected path in a tasyakuran (an adult's, public) renders nothing: protected uploads exist for children only.
  const src = child ? safeChildPhotoSrc(input.photoUrl) : safeImageSrc(input.photoUrl);
  if (!src) return null;
  if (child) {
    if (!childPhotoAllowed(input.showPhoto, audience)) return null;
  } else if (eventType !== 'tasyakuran') {
    return null;
  }
  const name = clean(input.honoureeName) ?? clean(input.nickName);
  const fallback = eventType === 'aqiqah' ? copy.babyAlt : eventType === 'khitanan' ? copy.childAlt : copy.photoAlt;
  return { key: 'honouree', src, alt: name ? copy.photoOf(name) : fallback, name };
}

/**
 * E-047 (s22): the photos the child rule governs. A guest page never carries the storage path of one of these: with a
 * personal link it references `/i/<slug>/<guest>/photo/<slot>` (`guestChildPhotoPath`), which applies this same rule
 * again on every request and is never cached by a shared cache.
 */
export type ChildPhotoSlot = 'celebrant' | 'honouree';

export function childPhotoSlotOf(eventType: string): ChildPhotoSlot | null {
  if (eventType === 'birthday') return 'celebrant';
  if (eventType === 'aqiqah' || eventType === 'khitanan') return 'honouree';
  return null;
}

/** An upload of this invitation's own: public (`/media/<id>/…`, before D-040) or protected (`/media/protected/<id>/…`). */
export function isOwnInvitationUpload(src: string, invitationId: number): boolean {
  return (isUploadedMediaPath(src) || isProtectedMediaPath(src)) && mediaPathInvitationId(src) === invitationId;
}

/**
 * The uploaded child photo a personal link may fetch for `slot`: the host's switch is on, the invitation type matches the
 * slot and the stored value is an upload of this same invitation (D-040: a path naming another invitation or a user's
 * avatar is refused, whatever the schema accepted). An absolute URL the host typed is hosted elsewhere and never
 * proxied, so it gets nothing here.
 */
export function childPhotoUpload(
  eventType: string,
  people: { birthdayPerson?: { photoUrl?: string; showPhoto?: boolean }; ceremonyProfile?: { photoUrl?: string; showPhoto?: boolean } },
  slot: ChildPhotoSlot,
  invitationId: number,
): string | undefined {
  if (childPhotoSlotOf(eventType) !== slot) return undefined;
  const audience = { personalLink: true, preview: false };
  const src =
    slot === 'celebrant'
      ? birthdayPortrait({ photoUrl: people.birthdayPerson?.photoUrl, showPhoto: people.birthdayPerson?.showPhoto }, audience)?.people[0]?.src
      : ceremonyPortrait(eventType, { photoUrl: people.ceremonyProfile?.photoUrl, showPhoto: people.ceremonyProfile?.showPhoto }, audience)?.src;
  return src && isOwnInvitationUpload(src, invitationId) ? src : undefined;
}

/**
 * D-040: the `src` a page may carry for a child's photo it is allowed to show (`childPhotoAllowed` already passed).
 * - An absolute URL the host typed is shown as typed: it is hosted elsewhere, so this origin neither controls nor proxies it.
 * - An upload of another invitation, or an avatar, is dropped.
 * - The host's preview keeps the stored path (the owner's session reads `/media/protected/…`).
 * - A personal link gets its own photo route, never the storage path; without one (`guestPhotoPath` undefined) nothing.
 */
export function childPhotoSrcFor(
  src: string,
  context: { invitationId: number; preview: boolean; guestPhotoPath?: string },
): string | undefined {
  if (!isUploadedMediaPath(src) && !isProtectedMediaPath(src)) return src;
  if (!isOwnInvitationUpload(src, context.invitationId)) return undefined;
  return context.preview ? src : context.guestPhotoPath;
}
