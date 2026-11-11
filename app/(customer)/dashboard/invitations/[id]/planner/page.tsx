import { and, eq, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { PlannerEditor } from './planner-editor';

export const dynamic = 'force-dynamic';

export default async function PlannerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, user.id), isNull(invitations.deletedAt)))
    .limit(1);
  if (!invitation) notFound();

  // The guest page's lenient read (S18-Q4): a broken section elsewhere no longer hides the stored planner.
  const { config } = normalizeStoredConfig(invitation.config ?? {});
  const locale = await getLocale();

  return (
    <PlannerEditor
      invitationId={id}
      slug={invitation.slug}
      eventType={invitation.eventType}
      locale={locale}
      initial={(config as any).eventPlanner ?? {}}
    />
  );
}
