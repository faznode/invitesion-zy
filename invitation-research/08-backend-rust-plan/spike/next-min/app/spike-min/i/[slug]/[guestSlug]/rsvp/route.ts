// SPIKE ONLY (08-backend-rust-plan, session 09). "next-min" RSVP arm, copied into the local-stack snapshot only.
// Same rules and the same two writes as app/i/[slug]/actions.ts submitRsvp (open check, status whitelist,
// guest_count rule, UPDATE guests, INSERT analytics_events RSVP) and the same 303 the Rust spike returns.
// Deliberate differences from the product action: plain form route instead of a server action, and no
// revalidatePath() (the Rust spike has no equivalent). Documented in ../README.md.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { analyticsEvents, guests, invitations } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const RSVP_STATUSES = ['CONFIRMED', 'DECLINED'];

function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { location } });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; guestSlug: string }> }) {
  const { slug, guestSlug } = await params;
  const back = `/spike-min/i/${slug}/${guestSlug}`;
  const form = await request.formData();
  const status = String(form.get('status') || '');
  const attending = Number(form.get('guestCount') || 1);

  const [invitation] = await db.select().from(invitations).where(eq(invitations.slug, slug)).limit(1);
  const closed =
    !invitation ||
    invitation.status === 'DRAFT' ||
    invitation.status === 'EXPIRED' ||
    (invitation.expiresAt !== null && invitation.expiresAt.getTime() < Date.now());
  if (closed) return seeOther(`${back}?rsvp=closed`);

  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.invitationId, invitation.id), eq(guests.slug, guestSlug)))
    .limit(1);
  if (!guest) return seeOther(`${back}?rsvp=closed`);
  if (!RSVP_STATUSES.includes(status)) return seeOther(`${back}?rsvp=invalid`);

  const maxPerRsvp = guest.guestCount || 1;
  const guestCount = status === 'CONFIRMED' ? Math.min(Math.max(attending, 1), maxPerRsvp) : 0;
  await db.update(guests).set({ rsvpStatus: status, guestCount }).where(eq(guests.id, guest.id));
  await db.insert(analyticsEvents).values({
    invitationId: invitation.id,
    guestId: guest.id,
    eventType: 'RSVP',
    meta: { status, guestCount, source: 'public' },
  });
  return seeOther(`${back}?rsvp=saved`);
}
