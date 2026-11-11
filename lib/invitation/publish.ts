import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { requireOwnedInvitation, OwnershipError } from './service';
import { hasPaidOrder } from '@/lib/payment/service';
import { ACTIVE_PERIOD_MONTHS, NotPublishableError, addMonths, publishBlockers } from './publish-rules';

export { OwnershipError };
export { ACTIVE_PERIOD_MONTHS, NotPublishableError, addMonths, publishBlockers };

export class NotPaidError extends Error {
  constructor() {
    super('Invitation has no paid order');
    this.name = 'NotPaidError';
  }
}

/**
 * Publishing — the data-access half. Rules live in `publish-rules.ts`.
 *
 * Until this module existed, nothing in the codebase ever wrote `PUBLISHED`,
 * `publishedAt`, or `expiresAt`. `createInvitation` produces a DRAFT and the
 * public renderer refuses DRAFTs, so every invitation ever created was
 * structurally incapable of going live — the guest URL, RSVP, guestbook, and
 * analytics features all sat behind a door with no handle.
 */

/**
 * Takes an invitation live, or returns it unchanged if it already is.
 *
 * Idempotent on purpose: a double-submitted publish button must not slide the
 * 12-month expiry forward and silently sell the customer less time than they
 * paid for. Re-publishing keeps the original `publishedAt` and `expiresAt`.
 */
export async function publishInvitation(invitationId: number, userId: number) {
  const invitation = await requireOwnedInvitation(invitationId, userId);

  if (invitation.status === 'PUBLISHED' && invitation.publishedAt) {
    return { invitation, alreadyPublished: true as const };
  }

  const reasons = publishBlockers(invitation.eventType, invitation.config);
  if (reasons.length) throw new NotPublishableError(reasons);

  // Entitlement, enforced in the domain rather than only in the UI.
  //
  // The business model is one-time payment per invitation: publishing is what the
  // customer buys. Leaving this to the button would mean a direct POST to the
  // server action published for free, and server actions are their own entry
  // points — reaching one does not require having rendered the page.
  //
  // Re-publishing an invitation that was taken down stays free, because the
  // active window was already paid for; that path returns above or passes this
  // check via its existing PAID order.
  //
  // Entitlement is per (invitation, theme): the check carries the current
  // templateId, so switching to a new theme means paying the full price again
  // before the next publish. Orders from before themes were recorded
  // (template_id NULL) stay valid for any theme.
  if (!(await hasPaidOrder(invitation.id, invitation.templateId))) throw new NotPaidError();

  const publishedAt = invitation.publishedAt ?? new Date();
  const expiresAt = invitation.expiresAt ?? addMonths(publishedAt, ACTIVE_PERIOD_MONTHS);

  // B-031: a deletion that lands between the ownership read and this write wins; the publish reports "not found".
  const [updated] = await db
    .update(invitations)
    .set({ status: 'PUBLISHED', publishedAt, expiresAt })
    .where(and(eq(invitations.id, invitation.id), isNull(invitations.deletedAt)))
    .returning();
  if (!updated) throw new OwnershipError();

  return { invitation: updated, alreadyPublished: false as const };
}

/**
 * Returns a published invitation to DRAFT.
 *
 * `publishedAt` and `expiresAt` are left intact. The active window is something
 * the customer bought; taking the page down temporarily must not restart or
 * forfeit it, and re-publishing later reuses the same dates.
 */
export async function unpublishInvitation(invitationId: number, userId: number) {
  const invitation = await requireOwnedInvitation(invitationId, userId);
  if (invitation.status !== 'PUBLISHED') return invitation;

  const [updated] = await db
    .update(invitations)
    .set({ status: 'DRAFT' })
    .where(and(eq(invitations.id, invitation.id), isNull(invitations.deletedAt)))
    .returning();
  if (!updated) throw new OwnershipError();

  return updated;
}
