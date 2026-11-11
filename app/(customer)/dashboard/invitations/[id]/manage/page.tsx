import { and, eq, isNull } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { invitations } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { ManageCenter } from './manage-center';

export const dynamic = 'force-dynamic';

export default async function InvitationManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ module?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [invitation] = await db
    .select({ id: invitations.id, slug: invitations.slug, config: invitations.config })
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, user.id), isNull(invitations.deletedAt)))
    .limit(1);
  if (!invitation) notFound();

  const { module } = await searchParams;
  // The guest page's lenient read (S18-Q4): one section that fails today's rules no longer empties the whole editor.
  const { config } = normalizeStoredConfig(invitation.config ?? {});
  return <ManageCenter invitationId={invitation.id} slug={invitation.slug} module={module} config={config} guestPassOn={isFlagOn('GUEST_PASS')} teamOn={isFlagOn('TEAM_ACCESS')} hostLogsOn={isFlagOn('HOST_LOGS')} />;
}
