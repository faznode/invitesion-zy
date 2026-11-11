import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { staffJoinPreview } from '@/lib/workspace/workspace-db';
import { JoinMessage, JoinShell } from '../../join-shell';
import { acceptStaffJoin, beginStaffJoin } from '../actions';
import { STAFF_JOIN_REFUSALS, StaffRoleSummary } from '../staff-role';

export const dynamic = 'force-dynamic';

// The path carries the link's secret: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  title: 'Bergabung dengan ruang kerja · Invitesion',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * G-052 (D-067): a workspace staff link. It shows the workspace and the role, and accepts only on a POST: signed in,
 * here; signed out, after sign-in or sign-up through `/gabung/ruang/terima`. A link that cannot be accepted says so
 * without saying why. Flag off: 404.
 */
export default async function StaffLinkPage({ params }: { params: Promise<{ token: string }> }) {
  if (!isFlagOn('WORKSPACES')) notFound();
  const { token } = await params;
  const user = await getUser();
  if (user?.role === 'ADMIN') {
    return (
      <JoinShell>
        <JoinMessage {...STAFF_JOIN_REFUSALS.admin} cta={{ href: '/', label: 'Ke beranda' }} />
      </JoinShell>
    );
  }
  const preview = await staffJoinPreview(token, user?.id ?? null);

  if (preview.state === 'invalid') {
    return (
      <JoinShell>
        <JoinMessage {...STAFF_JOIN_REFUSALS.invalid} cta={user ? undefined : { href: '/', label: 'Ke beranda' }} />
      </JoinShell>
    );
  }
  if (preview.state === 'already') {
    return (
      <JoinShell>
        <JoinMessage
          title="Anda sudah bergabung"
          body={`Akun ini sudah menjadi staf ruang kerja ${preview.workspaceName}.`}
          cta={{ href: '/dashboard/workspace', label: 'Buka ruang kerja' }}
        />
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary">Undangan staf</p>
        <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Anda diajak bergabung</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Pemilik ruang kerja ini meminta bantuan Anda untuk undangan kliennya. Setelah bergabung, pemilik akan melihat nama dan email akun Anda,
          dan bisa mencabut akses kapan saja.
        </p>
      </div>
      <StaffRoleSummary role={preview.role} workspaceName={preview.workspaceName} />
      {user ? (
        <form action={acceptStaffJoin}>
          <input type="hidden" name="token" value={token} />
          <button className="w-full rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 sm:w-fit">
            Terima dan bergabung
          </button>
        </form>
      ) : (
        <form action={beginStaffJoin} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <button className="w-full rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 sm:w-fit">
            Masuk untuk bergabung
          </button>
          <p className="text-sm leading-relaxed text-muted-foreground">Belum punya akun? Anda bisa mendaftar di langkah berikutnya.</p>
        </form>
      )}
    </JoinShell>
  );
}
