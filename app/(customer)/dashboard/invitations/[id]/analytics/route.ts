import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guests } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { inviteOnlyEvents } from '@/lib/invitation/event-eligibility';
import { guestExportCsv } from '@/lib/invitation/guest-export';
import { followUpCsv, followUpItems, isFollowUpKind } from '@/lib/invitation/host-analytics';
import { loadHostAnalytics } from '@/lib/invitation/host-analytics-query';
import { accessFor } from '@/lib/invitation/members-db';
import { getPublicOrigin } from '@/lib/invitation/public-url';
import { exportedEvents } from '@/lib/invitation/rsvp-events';

/**
 * Guest list export for the invitation's owner or a co-host (G-044, D-057: `insights`); rows and neutralisation in
 * `lib/invitation/guest-export.ts` (B-006, B-027). `?list=unopened|unanswered` exports one B-034 follow-up list instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  // Decided before the invitation is looked at, so it says nothing about the resource (as the check-in route does).
  if (user.role === 'ADMIN') return new Response('Forbidden', { status: 403 });
  const id = Number((await params).id);
  const access = await accessFor(user.id, id, 'insights');
  if (!access) return new Response('Not found', { status: 404 });
  const list = new URL(req.url).searchParams.get('list');
  if (list !== null) return followUpExport(access.invitation.userId, id, list);
  const inv = access.invitation;
  const rows = await db.select().from(guests).where(eq(guests.invitationId, id));
  // Every stored question, switched on or not, so answers collected before the host closed the form are exported (D-034).
  const { config } = normalizeStoredConfig(inv.config ?? {});
  const questions = config.registrationForm?.customQuestions ?? [];
  // D-037: who is invited to each invite-only event, while invite-only events are switched on.
  const inviteOnly = isFlagOn('INVITE_ONLY_EVENTS') ? inviteOnlyEvents(config.events) : [];
  return new Response(guestExportCsv(rows, questions, exportedEvents(config, rows), inviteOnly), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${inv.slug}-guests.csv"`,
    },
  });
}

/** B-034: one follow-up list for its owner, with each guest's personal link; another host's invitation is a 404. */
async function followUpExport(userId: number, id: number, list: string): Promise<Response> {
  if (!isFollowUpKind(list)) return new Response('Unknown list', { status: 400 });
  const data = await loadHostAnalytics(db, { userId, invitationId: id });
  if (!data) return new Response('Not found', { status: 404 });
  const rows = data.lists[list];
  const items = followUpItems(rows, { origin: await getPublicOrigin(), slug: data.invitation.slug, template: data.whatsappTemplate });
  return new Response(followUpCsv(rows, items), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${data.invitation.slug}-${list === 'unopened' ? 'belum-membuka' : 'belum-menjawab'}.csv"`,
    },
  });
}
