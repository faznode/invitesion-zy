import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { joinPreview } from '@/lib/invitation/members-db';
import { acceptJoin } from '../actions';
import { JOIN_REFUSALS, JoinMessage, JoinShell, RoleSummary } from '../join-shell';
import { readJoinToken, SIGN_IN_TO_JOIN } from '../join-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Terima undangan tim · Invitesion', robots: { index: false, follow: false } };

type Refusal = keyof typeof JOIN_REFUSALS;
const isRefusal = (value: unknown): value is Refusal => typeof value === 'string' && value in JOIN_REFUSALS;

/**
 * G-044 (D-057): where a join link lands after sign-in or sign-up (`/sign-in?redirect_url=/gabung/terima`). The secret
 * is still the visitor's own `/gabung` cookie; this page shows the role again and accepts on one more tap (a POST).
 * Refused attempts come back here with their reason. Flag off: 404.
 */
export default async function JoinConfirmPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!isFlagOn('TEAM_ACCESS')) notFound();
  const user = await getUser();
  if (!user) redirect(SIGN_IN_TO_JOIN);
  const { status } = await searchParams;
  const refusal: Refusal | null = user.role === 'ADMIN' ? 'admin' : isRefusal(status) ? status : null;
  if (refusal) {
    return (
      <JoinShell>
        <JoinMessage {...JOIN_REFUSALS[refusal]} />
      </JoinShell>
    );
  }

  const token = await readJoinToken();
  const preview = token ? await joinPreview(token, user.id) : null;
  if (!preview) {
    return (
      <JoinShell>
        <JoinMessage
          title="Tidak ada undangan tim yang menunggu"
          body="Tautan bergabung yang Anda buka sudah diterima, sudah lewat satu jam sejak dibuka, atau dibuka di perangkat lain. Buka lagi tautan dari pemilik undangan."
        />
      </JoinShell>
    );
  }
  if (preview.state === 'invalid') {
    return (
      <JoinShell>
        <JoinMessage {...JOIN_REFUSALS.invalid} />
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
        <p className="text-sm font-semibold text-primary">Satu langkah lagi</p>
        <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Terima peran ini?</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Anda masuk sebagai {user.email}. Pemilik undangan akan melihat nama dan email ini, dan bisa mencabut akses kapan saja.
        </p>
      </div>
      <RoleSummary role={preview.role} slug={preview.slug} />
      <form action={acceptJoin}>
        <button className="w-full rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 sm:w-fit">
          Terima dan bergabung
        </button>
      </form>
    </JoinShell>
  );
}
