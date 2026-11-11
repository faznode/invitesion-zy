import 'server-only';

import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { guestMessages } from '@/lib/db/schema';
import { WISHES_BOOK_MAX, type BookWish } from './wishes-book';

/**
 * I-22 (D-060): what the wishes book prints for one invitation; the caller has checked access (the owner alone) and the
 * flag. The VISIBLE wishes only (R-04, D-044: `is_hidden` false, so a pending or hidden wish stays out, and a deleted one no
 * longer exists), whatever the guestbook's settings are now; oldest first with the id breaking ties; at most `limit`; and
 * how many there are under the same rule, both from one read-only snapshot so the cover's count matches the pages. Only
 * the name, the message, the time and the host's reply are read: never the guest link, a phone or an id. Both queries
 * start in `guest_messages_invitation_visible_idx` (B-017).
 */
export async function loadWishesBook(invitationId: number, limit: number = WISHES_BOOK_MAX): Promise<{ wishes: BookWish[]; total: number }> {
  const visible = and(eq(guestMessages.invitationId, invitationId), eq(guestMessages.isHidden, false));
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select({ name: guestMessages.name, message: guestMessages.message, createdAt: guestMessages.createdAt, reply: guestMessages.hostReply })
        .from(guestMessages)
        .where(visible)
        .orderBy(asc(guestMessages.createdAt), asc(guestMessages.id))
        .limit(Math.max(0, Math.min(limit, WISHES_BOOK_MAX)));
      const [{ n }] = await tx.select({ n: count() }).from(guestMessages).where(visible);
      return { wishes: rows, total: Number(n) };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
