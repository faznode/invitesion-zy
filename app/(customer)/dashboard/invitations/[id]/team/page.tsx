import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, UserRound } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { ROLE_COPY, type TeamRowState } from '@/lib/invitation/members';
import { accessFor, teamOf, type TeamRow } from '@/lib/invitation/members-db';
import { revokeTeamMember } from './actions';
import { TeamInvite } from './team-invite';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tim & penerima tamu', robots: { index: false, follow: false } };

const STATE_STYLE: Record<TeamRowState, { label: string; tone: string }> = {
  active: { label: 'Aktif', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  pending: { label: 'Menunggu', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  expired: { label: 'Kedaluwarsa', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

const when = (at: Date) => at.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/**
 * G-044 (D-057): the owner's team page. Join links for co-hosts and ushers, who accepted each one, and revocation.
 * Owner only (`manage`); flag off: 404.
 */
export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revoked?: string; error?: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('TEAM_ACCESS')) notFound();
  const id = Number((await params).id);
  const access = await accessFor(user.id, id, 'manage');
  if (!access) notFound();
  const [team, q] = await Promise.all([teamOf(id), searchParams]);

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link href={`/dashboard/invitations/${id}/manage`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Control center
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">/{access.invitation.slug}</p>
          <h1 className="text-balance text-2xl font-bold text-slate-950">Tim & penerima tamu</h1>
          <p className="text-pretty text-sm leading-6 text-slate-600">
            Ajak co-host untuk ikut mengelola tamu, atau penerima tamu yang hanya memegang meja check-in. Isi, desain, pembayaran dan tim tetap di tangan Anda.
          </p>
        </header>

        {q.revoked && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Akses dicabut. Orang itu tidak bisa lagi membuka undangan ini.
          </p>
        )}
        {q.error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Anggota atau tautan itu tidak ditemukan. Mungkin sudah dicabut.
          </p>
        )}

        <TeamInvite invitationId={id} />

        <section aria-labelledby="team-list-title" className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-col gap-1 border-b p-5">
            <h2 id="team-list-title" className="font-bold text-slate-900">
              Anggota dan tautan
            </h2>
            <p className="text-sm leading-6 text-slate-600">Periksa email setiap anggota. Bila bukan orang yang Anda kirimi tautan, cabut aksesnya.</p>
          </div>
          {team.length ? (
            <ul className="divide-y">
              {team.map((row) => (
                <TeamItem key={row.id} row={row} invitationId={id} />
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-slate-600">Belum ada anggota. Undangan ini hanya bisa dibuka oleh Anda.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function TeamItem({ row, invitationId }: { row: TeamRow; invitationId: number }) {
  const state = STATE_STYLE[row.state];
  const action = row.state === 'active' ? 'Cabut akses' : row.state === 'pending' ? 'Batalkan tautan' : 'Hapus';
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <UserRound className="hidden h-5 w-5 shrink-0 text-slate-500 sm:block" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-900">{row.label}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{ROLE_COPY[row.role].name}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${state.tone}`}>{state.label}</span>
        </p>
        <p className="break-words text-xs leading-5 text-slate-600">
          {row.member
            ? `${row.member.name ? `${row.member.name} · ` : ''}${row.member.email}${row.acceptedAt ? ` · bergabung ${when(row.acceptedAt)}` : ''}`
            : row.state === 'pending'
              ? `Tautan belum dipakai · berlaku sampai ${when(row.expiresAt)}`
              : `Tautan tidak dipakai sampai ${when(row.expiresAt)}`}
        </p>
      </div>
      <form action={revokeTeamMember}>
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="rowId" value={row.id} />
        <button className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 hover:bg-rose-50">
          {action}
          <span className="sr-only">: {row.label}</span>
        </button>
      </form>
    </li>
  );
}
