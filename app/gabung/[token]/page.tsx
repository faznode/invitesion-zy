import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { joinPreview } from '@/lib/invitation/members-db';
import { acceptJoin, beginJoin } from '../actions';
import { JOIN_REFUSALS, JoinMessage, JoinShell, RoleSummary } from '../join-shell';

export const dynamic = 'force-dynamic';

// The path carries the link's secret: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  title: 'Bergabung dengan tim undangan · Invitesion',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * G-044 (D-057): a team join link. It shows the invitation and the role, and accepts only on a POST: signed in, here;
 * signed out, after sign-in or sign-up through `/gabung/terima`. A link that cannot be accepted says so without saying
 * why (used, revoked, expired or never made look the same). Flag off: 404.
 */
export default async function JoinLinkPage({ params }: { params: Promise<{ token: string }> }) {
  if (!isFlagOn('TEAM_ACCESS')) notFound();
  const { token } = await params;
  const user = await getUser();
  if (user?.role === 'ADMIN') {
    return (
      <JoinShell>
        <JoinMessage {...JOIN_REFUSALS.admin} cta={{ href: '/', label: 'Ke beranda' }} />
      </JoinShell>
    );
  }
  const preview = await joinPreview(token, user?.id ?? null);

  if (preview.state === 'invalid') {
    return (
      <JoinShell>
        <JoinMessage {...JOIN_REFUSALS.invalid} cta={user ? undefined : { href: '/', label: 'Ke beranda' }} />
      </JoinShell>
    );
  }
  if (preview.state === 'already') {
    return (
      <JoinShell>
        <JoinMessage title="Anda sudah bergabung" body={`Akun ini sudah ada di tim /${preview.slug}. Buka dasbor untuk mulai bekerja.`} />
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary">Undangan tim</p>
        <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Anda diajak bergabung</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Pemilik undangan ini meminta bantuan Anda. Setelah bergabung, pemilik akan melihat nama dan email akun Anda, dan bisa mencabut akses kapan saja.
        </p>
      </div>
      <RoleSummary role={preview.role} slug={preview.slug} />
      {user ? (
        <form action={acceptJoin}>
          <input type="hidden" name="token" value={token} />
          <button className="w-full rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 sm:w-fit">
            Terima dan bergabung
          </button>
        </form>
      ) : (
        <form action={beginJoin} className="flex flex-col gap-3">
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
