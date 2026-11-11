import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { GuestImport } from '@/components/dashboard/guest-import';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { importErrorMessage } from '@/lib/invitation/import-messages';
import { accessFor } from '@/lib/invitation/members-db';
import { ROSTER_LIMITS } from '@/lib/invitation/roster-rules';
import { commitGuestImport, previewGuestImport } from './actions';

export const dynamic = 'force-dynamic';

export default async function GuestImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!isFlagOn('GUEST_IMPORT')) notFound();
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // G-044 (D-057): the owner or a co-host (`guests`).
  const access = await accessFor(user.id, id, 'guests');
  if (!access) notFound();
  const invitation = access.invitation;
  const error = importErrorMessage((await searchParams).error);
  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <Link href={`/dashboard/invitations/${id}/guests`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Tamu, RSVP & Check-in
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">/{invitation.slug}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Impor tamu</h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-slate-500">
            Tempel daftar dari Excel atau Google Sheets, atau pilih file CSV. Kolomnya: nama, nomor WhatsApp, kategori, jumlah tamu
            (urutan bebas bila ada baris judul). Pratinjau menandai nomor yang tidak valid dan tamu yang sudah ada; hanya baris yang
            lolos yang diimpor, sekaligus dan bisa dibatalkan. Paling banyak {ROSTER_LIMITS.maxImportRows.toLocaleString('id-ID')} baris
            per impor dan {ROSTER_LIMITS.maxGuests.toLocaleString('id-ID')} tamu per undangan.
          </p>
        </header>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <GuestImport invitationId={id} preview={previewGuestImport} commit={commitGuestImport} />
      </div>
    </section>
  );
}
