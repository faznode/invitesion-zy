import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guests } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { passCheckInEnabled, passLookupKey, passManualAllowed, passSigningSecret } from '@/lib/invitation/guest-pass';
import { can } from '@/lib/invitation/members';
import { accessFor } from '@/lib/invitation/members-db';
import { CheckinScanner, type RosterEntry } from './checkin-scanner';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Meja check-in', robots: { index: false, follow: false } };

/**
 * B-024 (D-056): the host's scanner. The page hands the scanner each guest's display name under a one-way key of the
 * pass id (never the pass id), so a scan can be named while the signal is gone; writes go only through the check-in
 * route and the manual action. Flag off: 404. G-044 (D-057): the owner, a co-host or an usher (`checkin`); an usher
 * sees names only (no phone, RSVP or wish), and their way back is the dashboard, since the guest list is not theirs.
 */
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !isFlagOn('GUEST_PASS')) notFound();
  const access = await accessFor(user.id, id, 'checkin');
  if (!access) notFound();
  const invitation = access.invitation;
  const back = can(access.role, 'guests')
    ? { href: `/dashboard/invitations/${id}/guests`, label: 'Tamu, RSVP & Check-in' }
    : { href: '/dashboard', label: 'Dasbor' };

  const enabled = passCheckInEnabled(invitation.config);
  const rows = enabled
    ? await db
        .select({ id: guests.id, name: guests.name, passId: guests.passId, checkedInAt: guests.checkedInAt })
        .from(guests)
        .where(eq(guests.invitationId, id))
        .orderBy(asc(guests.name))
    : [];
  const roster: RosterEntry[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    key: passLookupKey(row.passId),
    checkedInAt: row.checkedInAt ? row.checkedInAt.toISOString() : null,
  }));

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link href={back.href} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {back.label}
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">/{invitation.slug}</p>
          <h1 className="text-2xl font-bold text-slate-950">Meja check-in</h1>
          <p className="text-sm leading-6 text-slate-500">Pindai QR pass tamu, atau cari namanya bila QR tidak terbaca.</p>
        </header>
        {!enabled ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-white p-5">
            <h2 className="font-bold text-slate-900">QR pass belum diaktifkan</h2>
            {access.role === 'owner' ? (
              <>
                <p className="text-sm leading-6 text-slate-600">
                  Aktifkan check-in untuk undangan ini agar setiap tamu mendapat QR pass di tautan pribadinya.
                </p>
                <Link href={`/dashboard/invitations/${id}/manage`} className="inline-flex min-h-11 w-fit items-center rounded-lg bg-brand-600 px-4 text-sm font-bold text-white">
                  Buka pengaturan check-in
                </Link>
              </>
            ) : (
              <p className="text-sm leading-6 text-slate-600">Minta pemilik undangan mengaktifkan check-in di pengaturan undangan.</p>
            )}
          </div>
        ) : (
          <CheckinScanner invitationId={id} roster={roster} manual={passManualAllowed(invitation.config)} passesShown={passSigningSecret() !== null} />
        )}
      </div>
    </section>
  );
}
