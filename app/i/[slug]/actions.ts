'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFor } from '@/lib/backend';
import { db } from '@/lib/db/drizzle';
import { analyticsEvents, guestMessages, guests, invitations } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { liveInvitation } from '@/lib/invitation/deletion-db';
import { guestAccessLocked } from '@/lib/invitation/guest-gate';
import {
  normalizePasscode,
  PASSCODE_UNLOCK_TTL_SECONDS,
  passcodeAddressScope,
  passcodeGateActive,
  passcodeInvitationBucket,
  passcodeLimits,
  unlockCookieName,
  unlockToken,
  verifyPasscode,
} from '@/lib/invitation/guest-passcode';
import { removeOwnGuestPhoto } from '@/lib/invitation/guest-photos-db';
import { photoNoticeQuery, type PhotoNotice } from '@/lib/invitation/post-event';
import { removeGuestPhotoFile } from '@/lib/invitation/post-event-server';
import { findGuestByLinkSegment } from '@/lib/invitation/public';
import { guestPath, invitationPath } from '@/lib/invitation/public-url';
import { decideGuestRsvp, rsvpSubmissionFromForm, type GuestRsvpDecision, type RsvpFlags } from '@/lib/invitation/rsvp-decision';
import { isFormKey, isRsvpFormKey } from '@/lib/invitation/rsvp-form-key';
import { writeGuestRsvpThroughApi, type GuestRsvpOutcome } from '@/lib/invitation/rsvp-writer';
import { decideGuestWish } from '@/lib/invitation/wish-decision';
import { writeGuestWishThroughApi, type GuestWishOutcome } from '@/lib/invitation/wish-writer';
import { clientAddressFrom, trustedProxyHops } from '@/lib/net/client-address';
import { addressKey, addressSecret, hit, ipBucket } from '@/lib/rate-limit';

/**
 * G-047 (D-069): admits a visitor to a passcode-protected invitation. Every attempt counts against the invitation's
 * limits before the passcode is checked (per address, by the trusted-proxy contract and the limiter's keyed hash, and per
 * invitation from every address), so a refused window refuses a correct code too. A match sets the admission cookie:
 * HttpOnly, SameSite=Lax, scoped to the invitation's path, keyed by the stored hash (a passcode change ends it). The
 * return path is rebuilt here from the slug and guest segment, never taken from the form.
 */
export async function unlockInvitation(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const guestSlug = String(formData.get('guestSlug') || '');
  const page = guestSlug ? guestPath(slug, guestSlug) : invitationPath(slug);
  const back = guestSlug && formData.get('target') === 'pass' ? `${page}/pass` : page;
  const [invitation] = await db
    .select({ id: invitations.id, status: invitations.status, guestPasscodeHash: invitations.guestPasscodeHash })
    .from(invitations)
    .where(and(eq(invitations.slug, slug), liveInvitation))
    .limit(1);
  if (!invitation || invitation.status === 'DRAFT' || !passcodeGateActive(invitation)) redirect(back);
  const stored = invitation.guestPasscodeHash as string;

  const limits = passcodeLimits();
  const address = await clientAddress();
  const key = address ? addressKey(address) : null;
  const secret = addressSecret();
  const verdicts = [await hit(passcodeInvitationBucket(invitation.id), limits.invitation)];
  if (key && secret) verdicts.push(await hit(ipBucket(secret, passcodeAddressScope(invitation.id), key), limits.address));
  const refused = verdicts.filter((verdict) => !verdict.allowed);
  if (refused.length) redirect(`${back}?kode=tunggu&menit=${Math.ceil(Math.max(...refused.map((verdict) => verdict.retryAfter)) / 60)}`);

  if (!(await verifyPasscode(normalizePasscode(formData.get('passcode')), stored))) redirect(`${back}?kode=salah`);
  (await cookies()).set(unlockCookieName(invitation.id), unlockToken(invitation.id, stored), {
    httpOnly: true,
    sameSite: 'lax',
    secure: (await headers()).get('x-forwarded-proto') === 'https',
    path: invitationPath(slug),
    maxAge: PASSCODE_UNLOCK_TTL_SECONDS,
  });
  redirect(back);
}

/**
 * Resolves the invitation + guest pair a public form submission refers to, and
 * refuses anything that is not currently open for responses. The link's last
 * segment is the credential: an opaque token, or the slug of a legacy guest
 * (B-011 rule, `lib/invitation/guest-link.ts`) — the same rule as the page.
 */
async function openInvitationFor(slug: string, guestSlug: string) {
  // B-031: an old form posted after the owner deleted the invitation is refused like an unknown link.
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.slug, slug), liveInvitation)).limit(1);
  if (!invitation || invitation.status === 'DRAFT') return null;
  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) return null;
  if (invitation.status === 'EXPIRED') return null;

  const guest = await findGuestByLinkSegment(invitation.id, guestSlug);
  if (!guest) return null;

  // The same lenient read as the page, so the action enforces exactly the switches and deadline the guest saw.
  const { config } = normalizeStoredConfig(invitation.config ?? {});
  return { invitation, guest, config };
}

/** The switches this deployment renders the guest page with; the Rust writer receives the same values (R-03). */
function rsvpFlags(): RsvpFlags {
  return {
    maybe: isFlagOn('RSVP_MAYBE'),
    perEvent: isFlagOn('RSVP_PER_EVENT'),
    inviteOnlyEvents: isFlagOn('INVITE_ONLY_EVENTS'),
    questions: isFlagOn('RSVP_QUESTIONS'),
  };
}

/**
 * The page's notice for an RSVP that was not saved (`?rsvp=`; `rsvpe` names the unanswered event, `rsvpq` the question
 * to fix, `rsvpr` the seconds until a limit's window ends, `rsvpk` the key the re-rendered form must send again).
 */
function rsvpRefusalQuery(refusal: Exclude<GuestRsvpDecision, { kind: 'write' }> | Exclude<GuestRsvpOutcome, { kind: 'saved' }>): string {
  if (refusal.kind === 'events') return `rsvp=events&rsvpe=${encodeURIComponent(refusal.eventId)}`;
  if (refusal.kind === 'answers') return `rsvp=answers&rsvpq=${encodeURIComponent(refusal.questionId)}`;
  if (refusal.kind === 'busy') return refusal.retryAfter ? `rsvp=busy&rsvpr=${refusal.retryAfter}` : 'rsvp=busy';
  // R-03 (D-043): the outcome is unknown, so the form comes back with the same key; sending it again writes at most once.
  if (refusal.kind === 'unconfirmed') return `rsvp=retry&rsvpk=${encodeURIComponent(refusal.key)}`;
  return refusal.kind === 'closed' ? 'rsvp=closed' : 'rsvp=invalid';
}

/**
 * The guest's public address for the per-address limit (B-013), by the trusted-proxy contract (`TRUSTED_PROXY_HOPS`,
 * `lib/net/client-address.ts`). Passed to the API only, which keeps a keyed hash and never the address.
 */
async function clientAddress(): Promise<string | null> {
  const forwarded = await headers();
  return clientAddressFrom(forwarded.get('x-forwarded-for'), trustedProxyHops());
}

export async function submitRsvp(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const guestSlug = String(formData.get('guestSlug') || '');
  // G-047 (D-069): before either writer, a request not admitted to a passcode-protected invitation goes back to its cover.
  if (await guestAccessLocked(slug)) redirect(guestPath(slug, guestSlug));
  const submission = rsvpSubmissionFromForm(formData);
  const flags = rsvpFlags();

  // R-03: exactly one writer per call (`BACKEND_RSVP`, default `next`). This branch always ends in a redirect, so the
  // TypeScript writer below is never reached as a fallback.
  if (backendFor('RSVP') === 'rust') {
    const key = formData.get('rsvpKey');
    const outcome = await writeGuestRsvpThroughApi({
      slug,
      guestSlug,
      submission,
      flags,
      clientIp: await clientAddress(),
      idempotencyKey: isRsvpFormKey(key) ? key : null,
    });
    if (outcome.kind !== 'saved') redirect(`${guestPath(slug, guestSlug)}?${rsvpRefusalQuery(outcome)}`);
    revalidatePath(guestPath(slug, guestSlug));
    redirect(`${guestPath(slug, guestSlug)}?rsvp=saved`);
  }

  const context = await openInvitationFor(slug, guestSlug);
  if (!context) redirect(`${guestPath(slug, guestSlug)}?rsvp=closed`);
  // R-03: closed (B-027), the single or per-event answer (B-007, D-036, D-037) and the questions (D-034, D-035) are one
  // pure decision, shared with the Rust writer through contracts/vectors/rsvp-decisions.json.
  const decision = decideGuestRsvp({ config: context.config, guest: context.guest, submission, flags, now: Date.now() });
  if (decision.kind !== 'write') redirect(`${guestPath(slug, guestSlug)}?${rsvpRefusalQuery(decision)}`);
  const { status, attendingCount, rsvpAnswers, rsvpEventAnswers } = decision;

  // One statement: status, headcount, question answers and per-event answers never disagree after a write (D-034, D-036).
  await db.update(guests).set({ rsvpStatus: status, attendingCount, ...(rsvpAnswers !== undefined && { rsvpAnswers }), ...(rsvpEventAnswers !== undefined && { rsvpEventAnswers }) }).where(eq(guests.id, context.guest.id));
  await db.insert(analyticsEvents).values({
    invitationId: context.invitation.id,
    guestId: context.guest.id,
    eventType: 'RSVP',
    // `guestCount` in event meta has always meant the people attending for this answer; kept for readers.
    meta: { status, guestCount: attendingCount, source: 'public' },
  });

  revalidatePath(guestPath(slug, guestSlug));
  redirect(`${guestPath(slug, guestSlug)}?rsvp=saved`);
}

/** The page's notice after a wish (`?wish=`; `wishr` the seconds until a limit's window ends, `wishk` the key to resend). */
function wishQuery(outcome: GuestWishOutcome): string {
  if (outcome.kind === 'busy') return outcome.retryAfter ? `wish=busy&wishr=${outcome.retryAfter}` : 'wish=busy';
  // R-04 (D-044): the outcome is unknown, so the form comes back with the same key; sending it again stores at most once.
  if (outcome.kind === 'unconfirmed') return `wish=retry&wishk=${encodeURIComponent(outcome.key)}`;
  return `wish=${outcome.kind}`;
}

export async function submitGuestMessage(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const guestSlug = String(formData.get('guestSlug') || '');
  // G-047 (D-069): as for the RSVP, before either writer.
  if (await guestAccessLocked(slug)) redirect(guestPath(slug, guestSlug));
  const message = String(formData.get('message') || '');

  // R-04: exactly one writer per call (`BACKEND_WISHES`, default `next`). This branch always ends in a redirect, so the
  // TypeScript writer below is never reached as a fallback.
  if (backendFor('WISHES') === 'rust') {
    const key = formData.get('wishKey');
    const outcome = await writeGuestWishThroughApi({
      slug,
      guestSlug,
      message,
      clientIp: await clientAddress(),
      idempotencyKey: isFormKey(key) ? key : null,
    });
    if (outcome.kind === 'saved' || outcome.kind === 'pending') revalidatePath(guestPath(slug, guestSlug));
    redirect(`${guestPath(slug, guestSlug)}?${wishQuery(outcome)}`);
  }

  const context = await openInvitationFor(slug, guestSlug);
  if (!context) redirect(`${guestPath(slug, guestSlug)}?wish=closed`);
  // R-04 (D-044): the switch, the message and moderation are one pure decision, shared with the Rust writer through
  // contracts/vectors/wish-decisions.json; a refusal writes nothing.
  const decision = decideGuestWish({ config: context.config, message });
  if (decision.kind !== 'write') redirect(`${guestPath(slug, guestSlug)}?wish=${decision.kind}`);

  await db.insert(guestMessages).values({
    invitationId: context.invitation.id,
    guestId: context.guest.id,
    name: context.guest.name,
    message: decision.message,
    isHidden: decision.isHidden,
  });
  await db.insert(analyticsEvents).values({
    invitationId: context.invitation.id,
    guestId: context.guest.id,
    eventType: 'GUESTBOOK',
  });

  revalidatePath(guestPath(slug, guestSlug));
  redirect(`${guestPath(slug, guestSlug)}?wish=${decision.isHidden ? 'pending' : 'saved'}`);
}

/** I-21: back to the memory on the personal link with the outcome (`?foto=…#kenangan`). */
function photoRedirect(page: string, notice: PhotoNotice): never {
  redirect(`${page}?${photoNoticeQuery(notice)}#kenangan`);
}

/**
 * I-21: a guest's upload is the route `POST /i/<slug>/<guest>/kenangan` (`guest-photo-upload.ts`), not an action here:
 * Next.js caps a server action's body at 1 MB (R-X8). A guest deletes one of their own photos from their personal link whenever the link resolves (also after the
 * memory closes or the invitation expires: it is their photo). Another guest's photo or another invitation's is refused
 * without a write; the file goes after the row (`removeGuestPhotoFile`).
 */
export async function removeGuestPhoto(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const guestSlug = String(formData.get('guestSlug') || '');
  const page = guestPath(slug, guestSlug);
  if (await guestAccessLocked(slug)) redirect(page);
  const rawId = String(formData.get('photoId') ?? '');
  const photoId = /^\d{1,12}$/.test(rawId) ? Number(rawId) : 0;
  const [invitation] = await db
    .select({ id: invitations.id, status: invitations.status })
    .from(invitations)
    .where(and(eq(invitations.slug, slug), liveInvitation))
    .limit(1);
  const guest = invitation && invitation.status !== 'DRAFT' ? await findGuestByLinkSegment(invitation.id, guestSlug) : null;
  if (!invitation || !guest || !photoId) photoRedirect(page, 'invalid');
  const url = await removeOwnGuestPhoto(invitation.id, guest.id, photoId);
  if (!url) photoRedirect(page, 'invalid');
  await removeGuestPhotoFile(url);
  revalidatePath(page);
  photoRedirect(page, 'removed');
}
