import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { guests } from '@/lib/db/schema';

/** G-055: what a guest's card needs, and nothing else of the guest (no phone, RSVP or answers). */
export type CardGuest = { id: number; name: string; slug: string; linkToken: string | null };

const cardGuestColumns = { id: guests.id, name: guests.name, slug: guests.slug, linkToken: guests.linkToken };

/** The invitation's guests for the owner's card list, by name. */
export async function loadCardGuests(invitationId: number): Promise<CardGuest[]> {
  return db.select(cardGuestColumns).from(guests).where(eq(guests.invitationId, invitationId)).orderBy(asc(guests.name), asc(guests.id));
}

/** One guest of this invitation, or null: a guest of another invitation is never reached through this one. */
export async function loadCardGuest(invitationId: number, guestId: number): Promise<CardGuest | null> {
  const [guest] = await db
    .select(cardGuestColumns)
    .from(guests)
    .where(and(eq(guests.id, guestId), eq(guests.invitationId, invitationId)))
    .limit(1);
  return guest ?? null;
}
