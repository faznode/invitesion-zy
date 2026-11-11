import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { guestRegistrationLinks, invitations } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { liveInvitation } from '@/lib/invitation/deletion-db';
import { GUEST_LINK_TOKEN_PATTERN } from '@/lib/invitation/guest-link';
import { registrationOpen, ROSTER_LIMITS } from '@/lib/invitation/roster-rules';
import { submitRegistration } from './actions';

export const dynamic = 'force-dynamic';

// A registration link is shared by hand and collects personal data: keep it out of search results.
export const metadata: Metadata = { title: 'Pendaftaran tamu', robots: { index: false, follow: false } };

type Query = { daftar?: string; field?: string; r?: string; k?: string };

const FIELD_MESSAGES: Record<string, string> = {
  name: 'Nama wajib diisi, paling banyak 150 karakter.',
  phone: 'Nomor WhatsApp tidak valid. Pakai nomor seluler, misalnya 0812-3456-7890.',
  seats: `Jumlah orang harus 1 sampai ${ROSTER_LIMITS.maxRegistrationSeats}.`,
  category: 'Data tidak valid.',
};

function notice(q: Query): string | null {
  switch (q.daftar) {
    case 'invalid':
      return FIELD_MESSAGES[q.field ?? ''] ?? 'Data tidak valid. Periksa lagi isiannya.';
    case 'full':
      return 'Pendaftaran sedang penuh. Hubungi tuan rumah secara langsung.';
    case 'busy': {
      const minutes = /^\d+$/.test(q.r ?? '') ? Math.max(1, Math.ceil(Number(q.r) / 60)) : null;
      return `Terlalu banyak pendaftaran dalam waktu singkat. Coba lagi${minutes ? ` dalam ${minutes} menit` : ' nanti'}.`;
    }
    case 'retry':
      return 'Pendaftaran belum bisa dipastikan terkirim karena gangguan sambungan. Kirim sekali lagi; data tidak akan tercatat dua kali.';
    default:
      return null;
  }
}

/**
 * B-033: an invitation's self-registration form (`/daftar/<token>`). Open while the host keeps the link and the
 * invitation is published and not expired; a draft's link or an unknown token is a 404. No client JavaScript.
 */
export default async function RegistrationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Query> }) {
  if (!isFlagOn('SELF_REGISTRATION')) notFound();
  const { token } = await params;
  if (!GUEST_LINK_TOKEN_PATTERN.test(token)) notFound();
  const [link] = await db
    .select({ status: invitations.status, expiresAt: invitations.expiresAt, config: invitations.config })
    .from(guestRegistrationLinks)
    .innerJoin(invitations, eq(invitations.id, guestRegistrationLinks.invitationId))
    .where(and(eq(guestRegistrationLinks.token, token), liveInvitation))
    .limit(1);
  if (!link || link.status === 'DRAFT') notFound();
  const title = normalizeStoredConfig(link.config ?? {}).config.settings?.title?.trim() || 'Undangan';
  const open = registrationOpen(link, new Date());
  const q = await searchParams;
  const message = notice(q);
  const key = q.daftar === 'retry' && q.k ? q.k : randomUUID();

  return (
    <main className="flex min-h-dvh items-start justify-center bg-slate-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Pendaftaran tamu</p>
        <h1 className="mt-2 text-balance text-2xl font-bold text-slate-950">{title}</h1>
        {!open ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-600">Pendaftaran untuk undangan ini sudah ditutup.</p>
        ) : q.daftar === 'ok' ? (
          <div role="status" className="mt-4 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-slate-700">
              Terima kasih, pendaftaran Anda sudah kami terima. Tuan rumah akan meninjaunya dan mengirimkan undangan pribadi bila disetujui.
            </p>
            <Link href={`/daftar/${token}`} className="text-sm font-semibold text-brand-600 underline underline-offset-4">
              Daftarkan orang lain
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Isi nama Anda untuk didaftarkan ke daftar tamu. Tuan rumah akan meninjau pendaftaran ini terlebih dahulu.
            </p>
            {message && (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {message}
              </p>
            )}
            <form action={submitRegistration} className="mt-6 flex flex-col gap-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="key" value={key} />
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-800">
                Nama lengkap
                <input name="name" required maxLength={150} autoComplete="name" className="h-11 rounded-lg border px-3 text-base font-normal outline-none focus:border-brand-600" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-800">
                Nomor WhatsApp <span className="font-normal text-slate-500">(opsional)</span>
                <input name="phone" type="tel" inputMode="tel" maxLength={30} autoComplete="tel" placeholder="0812-3456-7890" className="h-11 rounded-lg border px-3 text-base font-normal outline-none focus:border-brand-600" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-800">
                Jumlah orang yang hadir
                <input name="guestCount" type="number" min={1} max={ROSTER_LIMITS.maxRegistrationSeats} defaultValue={1} required className="h-11 w-28 rounded-lg border px-3 text-base font-normal outline-none focus:border-brand-600" />
              </label>
              <button className="mt-2 min-h-12 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white">Kirim pendaftaran</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
