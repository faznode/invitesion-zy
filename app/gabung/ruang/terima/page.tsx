import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { staffJoinPreview } from '@/lib/workspace/workspace-db';
import { JoinMessage, JoinShell } from '../../join-shell';
import { acceptStaffJoin } from '../actions';
import { readStaffJoinToken, SIGN_IN_TO_JOIN_WORKSPACE } from '../session';
import { STAFF_JOIN_REFUSALS, StaffRoleSummary } from '../staff-role';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Terima undangan staf · Invitesion', robots: { index: false, follow: false } };

type Refusal = keyof typeof STAFF_JOIN_REFUSALS;
const isRefusal = (value: unknown): value is Refusal => typeof value === 'string' && value in STAFF_JOIN_REFUSALS;

/**
 * G-052 (D-067): where a staff link lands after sign-in or sign-up. The secret is still the visitor's own
 * `/gabung/ruang` cookie; this page shows the role again and accepts on one more tap (a POST). Refused attempts come back
 * here with their reason. Flag off: 404.
 */
export default async function StaffJoinConfirmPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!isFlagOn('WORKSPACES')) notFound();
  const user = await getUser();
  if (!user) redirect(SIGN_IN_TO_JOIN_WORKSPACE);
  const { status } = await searchParams;
  const refusal: Refusal | null = user.role === 'ADMIN' ? 'admin' : isRefusal(status) ? status : null;
  if (refusal) {
    return (
      <JoinShell>
        <JoinMessage {...STAFF_JOIN_REFUSALS[refusal]} />
      </JoinShell>
    );
  }

  const token = await readStaffJoinToken();
  const preview = token ? await staffJoinPreview(token, user.id) : null;
  if (!preview || preview.state === 'invalid') {
    return (
      <JoinShell>
        <JoinMessage
          {...(preview ? STAFF_JOIN_REFUSALS.invalid : {
            title: 'Tidak ada undangan staf yang menunggu',
            body: 'Tautan yang Anda buka sudah diterima, sudah lewat satu jam sejak dibuka, atau dibuka di perangkat lain. Buka lagi tautan dari pemilik ruang kerja.',
          })}
        />
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
        <p className="text-sm font-semibold text-primary">Satu langkah lagi</p>
        <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Terima peran ini?</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Anda masuk sebagai {user.email}. Pemilik ruang kerja akan melihat nama dan email ini, dan bisa mencabut akses kapan saja.
        </p>
      </div>
      <StaffRoleSummary role={preview.role} workspaceName={preview.workspaceName} />
      <form action={acceptStaffJoin}>
        <button className="w-full rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 sm:w-fit">
          Terima dan bergabung
        </button>
      </form>
    </JoinShell>
  );
}
