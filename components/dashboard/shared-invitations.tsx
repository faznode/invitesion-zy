import Link from 'next/link';
import { BarChart3, LogOut, MessageSquare, ScanLine, Users } from 'lucide-react';
import { leaveTeamAction } from '@/app/(customer)/dashboard/team-actions';
import { can, ROLE_COPY } from '@/lib/invitation/members';
import type { SharedInvitation } from '@/lib/invitation/members-db';

const entry = 'inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50';

/**
 * G-044 (D-057): the invitations this customer works on as a member, each with exactly the entries its role allows.
 * The check-in desk opens by a full page load (a plain link), so the scanner's own camera policy applies (D-056).
 */
export function SharedInvitations({ items, joined, en }: { items: SharedInvitation[]; joined: number | null; en: boolean }) {
  if (!items.length) return null;
  const welcome = items.find((item) => item.invitationId === joined);
  return (
    <section aria-labelledby="shared-invitations-title" className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 id="shared-invitations-title" className="font-bold text-slate-900">
          {en ? 'Shared with you' : 'Dibagikan dengan Anda'}
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          {en ? "Other people's invitations where you are on the team." : 'Undangan milik orang lain tempat Anda menjadi anggota tim.'}
        </p>
      </div>
      {welcome && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {en ? `You joined the team of /${welcome.slug}.` : `Anda sudah bergabung dengan tim /${welcome.slug}.`}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {items.map((item) => {
          const base = `/dashboard/invitations/${item.invitationId}`;
          return (
            <li key={item.invitationId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="break-all font-bold text-slate-900">/{item.slug}</span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{ROLE_COPY[item.role].name}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {can(item.role, 'checkin') && (
                  <a href={`${base}/checkin`} className={entry}>
                    <ScanLine className="h-4 w-4 text-brand-700" aria-hidden="true" />
                    {en ? 'Check-in desk' : 'Meja check-in'}
                  </a>
                )}
                {can(item.role, 'guests') && (
                  <Link href={`${base}/guests`} className={entry}>
                    <Users className="h-4 w-4 text-brand-700" aria-hidden="true" />
                    {en ? 'Guests & RSVP' : 'Tamu & RSVP'}
                  </Link>
                )}
                {can(item.role, 'wishes') && (
                  <Link href={`${base}/wishes`} className={entry}>
                    <MessageSquare className="h-4 w-4 text-brand-700" aria-hidden="true" />
                    {en ? 'Wishes' : 'Ucapan'}
                  </Link>
                )}
                {can(item.role, 'insights') && (
                  <Link href={`${base}/insights`} className={entry}>
                    <BarChart3 className="h-4 w-4 text-brand-700" aria-hidden="true" />
                    {en ? 'Insights' : 'Statistik'}
                  </Link>
                )}
                <form action={leaveTeamAction}>
                  <input type="hidden" name="invitationId" value={item.invitationId} />
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {en ? 'Leave team' : 'Keluar dari tim'}
                    <span className="sr-only"> /{item.slug}</span>
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
