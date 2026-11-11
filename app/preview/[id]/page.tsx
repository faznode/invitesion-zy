import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PublicInvitationRenderer } from '@/components/invitation/public-renderer';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { invitations } from '@/lib/db/schema';
import { loadPublicInvitation } from '@/lib/invitation/public';
import { READING_COOKIE, readingRequested } from '@/lib/invitation/reading-mode';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pratinjau undangan',
  robots: { index: false, follow: false },
};

/**
 * Owner preview (B-005): the guest renderer for the owner's own invitation in any status, so a draft can be checked
 * before it is paid for and published. Ownership is checked here (the middleware only guards /dashboard); views are
 * not tracked, and the RSVP and guestbook forms do not render because they need a guest link.
 */
export default async function OwnerPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  // B-035: the editor's side-by-side pane frames this page (same origin only, `proxy.ts`). The pane labels itself, so the
  // owner banner, whose link would navigate the frame, is left out; the invitation below renders exactly the same.
  const embedded = (await searchParams).embed === '1';

  const [owned] = await db
    .select({ slug: invitations.slug, status: invitations.status })
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, user.id), isNull(invitations.deletedAt)))
    .limit(1);
  if (!owned) notFound();

  const data = await loadPublicInvitation(owned.slug, undefined, true);
  if (!data) notFound();

  return (
    <>
      {!embedded && (
        <div role="status" className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-slate-900 px-4 py-2 text-center text-sm text-white">
          <span>
            {owned.status === 'DRAFT'
              ? 'Pratinjau draf: hanya kamu yang bisa melihat halaman ini. Tamu bisa membukanya setelah undangan diaktifkan.'
              : 'Pratinjau: tampilan yang sama dengan yang dilihat tamu. Kunjungan dari pratinjau tidak dihitung.'}
          </span>
          <Link href={`/dashboard/invitations/${id}/edit`} className="font-semibold underline underline-offset-2">
            Kembali ke editor
          </Link>
        </div>
      )}
      <PublicInvitationRenderer
        invitation={data.invitation}
        config={data.config}
        guest={null}
        preview
        media={data.media}
        messages={data.messages}
        totalMessages={data.totalMessages}
        hiddenMessageCount={data.hiddenMessageCount}
        readOnly={data.readOnly}
        status={{}}
        imageVariants={data.imageVariants}
        readingLarge={readingRequested((await cookies()).get(READING_COOKIE)?.value)}
      />
    </>
  );
}
