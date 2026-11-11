import { and, desc, eq, isNull } from 'drizzle-orm';
import { ArrowRight, CalendarDays, CheckCircle2, FileText, ImageIcon, MessageCircleHeart, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SharedInvitations } from '@/components/dashboard/shared-invitations';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { sharedInvitations } from '@/lib/invitation/members-db';
import { db } from '@/lib/db/drizzle';
import { guests, invitations } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { invitationStatusLabel } from '@/lib/i18n';
import { rsvpSummary } from '@/lib/invitation/rsvp-rules';

const statusTone = { DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200', PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200', EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200' } as const;

export default async function CustomerDashboardPage({ searchParams }: { searchParams: Promise<{ bergabung?: string; keluar?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');
  const locale = await getLocale();
  const en = locale === 'en';
  // B-031: deleted invitations are listed (with their restore) on the invitations page only.
  const items = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.userId, user.id), isNull(invitations.deletedAt)))
    .orderBy(desc(invitations.createdAt));
  // G-044 (D-057): invitations this customer works on as a member (none while FLAG_TEAM_ACCESS is off).
  const [shared, q] = await Promise.all([sharedInvitations(user.id), searchParams]);
  const team = (
    <>
      {q.keluar && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {en ? 'You left the team.' : 'Anda sudah keluar dari tim.'}
        </p>
      )}
      <SharedInvitations items={shared} joined={Number(q.bergabung) || null} en={en} />
    </>
  );
  const current = items[0];
  const guestRows = current ? await db.select().from(guests).where(eq(guests.invitationId, current.id)) : [];
  const opened = guestRows.reduce((total, guest) => total + guest.openedCount, 0);
  const summary = rsvpSummary(guestRows);
  const people = en ? `${summary.seats} ${summary.seats === 1 ? 'person' : 'people'}` : `${summary.seats} orang`;
  const seatsHint = summary.seatsUnknown ? `${people} · ${summary.seatsUnknown} ${en ? 'without a count' : 'tanpa jumlah'}` : people;

  if (!current) return <section className="min-h-full bg-slate-50/70 p-4 lg:p-8"><div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-6">{team}<div className="w-full rounded-2xl border bg-white p-7 shadow-sm sm:p-10"><span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><FileText className="h-6 w-6" /></span><p className="mt-6 text-sm font-semibold text-brand-700">{en ? 'Start here' : 'Mulai dari sini'}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{en ? 'Create your first invitation' : 'Buat undangan pertamamu'}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{en ? 'Choose a theme you love, then fill in the event details. You can continue and update the invitation anytime.' : 'Pilih tema yang kamu suka, lalu isi detail acara. Data undangan tetap bisa dilanjutkan dan diubah setelahnya.'}</p><Link href="/dashboard/templates" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{en ? 'Choose a theme' : 'Pilih tema'} <ArrowRight className="h-4 w-4" /></Link></div></div></section>;

  const tone = statusTone[current.status as keyof typeof statusTone] ?? statusTone.DRAFT;
  return <section className="min-h-full bg-slate-50/70 p-4 lg:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-brand-700">{en ? 'Invitation workspace' : 'Ruang undangan'}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{en ? 'Hello' : 'Halo'}, {user.name || user.email.split('@')[0]}</h1><p className="mt-2 text-sm text-slate-500">{en ? 'Everything important for your invitation, in one place.' : 'Semua yang penting untuk undanganmu, dalam satu tempat.'}</p></div><Link href="/dashboard/templates" className="inline-flex w-fit items-center gap-2 rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"><Plus className="h-4 w-4" /> {en ? 'New invitation' : 'Undangan baru'}</Link></header>
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b bg-gradient-to-r from-brand-50 to-amber-50 px-5 py-5 sm:px-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>{invitationStatusLabel(current.status, locale)}</span><span className="text-xs text-slate-500">{en ? 'Created' : 'Dibuat'} {current.createdAt.toLocaleDateString(en ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><h2 className="mt-3 text-xl font-bold text-slate-900">/{current.slug}</h2><p className="mt-1 text-sm capitalize text-slate-500">{en ? 'Invitation' : 'Undangan'} {current.eventType}</p></div><Link href="/dashboard/invitations" className="inline-flex w-fit items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">{en ? 'Manage' : 'Kelola'} <ArrowRight className="h-4 w-4" /></Link></div></div><div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3"><Metric value={summary.total} label={en ? 'Total guests' : 'Total tamu'} /><Metric value={summary.counts.CONFIRMED} label={en ? 'Attending' : 'Hadir'} hint={seatsHint} /><Metric value={summary.counts.MAYBE} label={en ? 'Maybe' : 'Mungkin'} /><Metric value={summary.counts.DECLINED} label={en ? 'Not attending' : 'Tidak hadir'} /><Metric value={summary.counts.PENDING} label={en ? 'No reply yet' : 'Belum menjawab'} /><Metric value={opened} label={en ? 'Invitation opens' : 'Undangan dibuka'} /></div></article>
    {team}
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]"><section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">{en ? 'Keep preparing' : 'Lanjutkan persiapan'}</h2><p className="mt-1 text-sm text-slate-500">{en ? 'Complete the essentials before sharing your invitation.' : 'Selesaikan hal penting sebelum membagikan undangan.'}</p></div><CheckCircle2 className="h-5 w-5 text-brand-600" /></div><div className="mt-5 divide-y"><Task href="/dashboard/invitations" icon={<CalendarDays className="h-4 w-4" />} title={en ? 'Complete event details' : 'Lengkapi detail acara'} body={en ? 'Time, location, and couple details' : 'Waktu, lokasi, dan informasi pasangan'} /><Task href="/dashboard/templates" icon={<ImageIcon className="h-4 w-4" />} title={en ? 'Set invitation appearance' : 'Atur tampilan undangan'} body={en ? 'Choose and customise a theme' : 'Pilih dan sesuaikan tema'} /><Task href="/dashboard/guests" icon={<Users className="h-4 w-4" />} title={en ? 'Add your guest list' : 'Tambahkan daftar tamu'} body={en ? 'Send personally and track RSVP' : 'Kirim personal dan pantau RSVP'} /></div></section><aside className="rounded-xl border bg-slate-900 p-5 text-white shadow-sm"><MessageCircleHeart className="h-6 w-6 text-brand-300" /><h2 className="mt-5 font-bold">{en ? 'Need help?' : 'Butuh bantuan?'}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{en ? 'Our team is ready to help you prepare a memorable invitation.' : 'Tim kami siap membantu menyiapkan undangan yang berkesan.'}</p></aside></div>
  </div></section>;
}
function Metric({ value, label, hint }: { value: number; label: string; hint?: string }) { return <div className="bg-white p-5"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-medium text-slate-500">{label}</p>{hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}</div>; }
function Task({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) { return <Link href={href} className="flex items-center gap-3 py-4 hover:text-brand-700"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span><span className="flex-1"><b className="block text-sm">{title}</b><small className="text-slate-500">{body}</small></span><ArrowRight className="h-4 w-4" /></Link>; }
export const dynamic = 'force-dynamic';
