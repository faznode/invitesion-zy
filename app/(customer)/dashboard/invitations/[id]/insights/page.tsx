import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HostInsights } from '@/components/dashboard/host-insights';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { followUpItems, rsvpDigest } from '@/lib/invitation/host-analytics';
import { loadHostAnalytics } from '@/lib/invitation/host-analytics-query';
import { accessFor } from '@/lib/invitation/members-db';
import { getPublicOrigin } from '@/lib/invitation/public-url';
import { whatsAppShareLink } from '@/lib/invitation/whatsapp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Analitik & tindak lanjut' };

/**
 * B-034: the analytics and follow-up lists for one invitation, for its owner or a co-host (G-044, D-057: `insights`);
 * anyone else gets the private 404. The query keeps its owner scope, with the owner the access check resolved.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const access = await accessFor(user.id, id, 'insights');
  if (!access) notFound();
  const data = await loadHostAnalytics(db, { userId: access.invitation.userId, invitationId: id });
  if (!data) notFound();

  // B-018: reminders carry the host's message and each guest's personal link (token or slug, B-011).
  const context = { origin: await getPublicOrigin(), slug: data.invitation.slug, template: data.whatsappTemplate };
  const text = rsvpDigest({ title: data.invitation.title, today: data.today, zone: data.zone, totals: data.totals, openedToday: data.openedToday });
  return (
    <HostInsights
      invitationId={data.invitation.id}
      slug={data.invitation.slug}
      zone={data.zone}
      totals={data.totals}
      groups={data.groups}
      events={data.events}
      daily={data.daily}
      views={data.views}
      lists={{ unopened: followUpItems(data.lists.unopened, context), unanswered: followUpItems(data.lists.unanswered, context) }}
      digest={{ text, href: whatsAppShareLink(text) }}
    />
  );
}
