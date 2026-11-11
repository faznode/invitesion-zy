import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { familySidesApply, logTotals, parseId, planTables, rupiah, sideLabels, sideOrder, tableUse } from '@/lib/invitation/host-logs';
import { loadHostLogs } from '@/lib/invitation/host-logs-db';
import { accessFor } from '@/lib/invitation/members-db';
import { GiftsSection } from './gifts-section';
import { GuestsSection } from './guests-section';
import { TablesSection } from './tables-section';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Meja, suvenir & kado', robots: { index: false, follow: false } };

const NOTICES: Record<string, string> = {
  'table-added': 'Meja ditambahkan.',
  'table-saved': 'Meja disimpan.',
  'table-deleted': 'Meja dihapus. Tamu di meja itu kini belum mendapat meja.',
  'seat-saved': 'Tempat duduk tamu disimpan.',
  'souvenir-given': 'Suvenir dicatat sudah diberikan.',
  'souvenir-already': 'Suvenir tamu ini sudah tercatat sebelumnya; waktu pertama tetap dipakai.',
  'souvenir-cleared': 'Catatan suvenir dibatalkan.',
  'gift-recorded': 'Kado dicatat.',
  'gift-replayed': 'Kado ini sudah tercatat; tidak ada catatan ganda.',
  'gift-saved': 'Catatan kado disimpan.',
  'gift-deleted': 'Catatan kado dihapus.',
};

const ERRORS: Record<string, string> = {
  'table-invalid': 'Nama meja wajib (paling banyak 60 karakter), kapasitas kosong atau 1–100.',
  'table-duplicate': 'Sudah ada meja dengan nama itu.',
  'table-full': 'Sudah 200 meja; hapus yang tidak dipakai lebih dulu.',
  'table-notfound': 'Meja itu tidak ditemukan. Mungkin sudah dihapus.',
  'seat-invalid': 'Pilih meja dari daftar; label kursi paling banyak 20 karakter.',
  'guest-notfound': 'Tamu atau meja itu tidak ditemukan di undangan ini.',
  'gift-invalid': 'Periksa isian kado: jenis wajib, nominal angka rupiah saja, catatan paling banyak 300 karakter.',
  'gift-giver': 'Pilih tamu atau tulis nama pemberi.',
  'gift-key-reused': 'Formulir ini sudah dipakai untuk kado lain. Muat ulang halaman lalu catat lagi.',
  'gift-full': 'Sudah 5.000 catatan kado untuk undangan ini.',
  'gift-notfound': 'Catatan kado atau tamu itu tidak ditemukan di undangan ini.',
  'gift-side': 'Pihak keluarga hanya bisa dipilih pada undangan pernikahan.',
};

/**
 * G-045 (D-058): the owner's day-of logs: seating tables and each guest's table and seat, souvenirs handed out, and a
 * private gift log, with CSV exports. Owner only (`manage`); flag off: 404. Nothing here reaches a guest page, a public
 * payload or the check-in desk.
 */
function importNotice(added: string | undefined): string {
  const count = parseId(added ?? '');
  return count ? `${count} meja disalin dari rencana tempat duduk.` : 'Semua meja dari rencana tempat duduk sudah ada di daftar.';
}

export default async function HostLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; guest?: string; added?: string }>;
}) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('HOST_LOGS')) notFound();
  const id = parseId((await params).id);
  const access = id === null ? null : await accessFor(user.id, id, 'manage');
  if (!access || id === null) notFound();
  const [logs, q] = await Promise.all([loadHostLogs(id), searchParams]);
  const totals = logTotals(logs.guests, logs.gifts);
  const logged = new Set(logs.tables.map((table) => table.name));
  const planPending = planTables(access.invitation.config).filter((table) => !logged.has(table.name)).length;
  const notice = q.notice === 'tables-imported' ? importNotice(q.added) : q.notice ? NOTICES[q.notice] : undefined;
  const error = q.error ? ERRORS[q.error] : undefined;
  const base = `/dashboard/invitations/${id}`;

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link href={`${base}/manage`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Control center
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">/{access.invitation.slug}</p>
          <h1 className="text-balance text-2xl font-bold text-slate-950">Meja, suvenir & kado</h1>
          <p className="text-pretty text-sm leading-6 text-slate-600">
            Catatan hari acara yang hanya Anda lihat. Tamu, halaman undangan, dan meja check-in tidak pernah menampilkan meja, suvenir, atau kado.
          </p>
        </header>

        {notice && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Tamu bermeja', `${totals.seated} / ${totals.guests}`],
            ['Suvenir diberikan', `${totals.souvenirs} / ${totals.guests}`],
            ['Catatan kado', String(totals.gifts)],
            ['Nominal tercatat', totals.noted ? rupiah(totals.amount) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 rounded-xl border bg-white p-4">
              <dt className="text-xs font-semibold text-slate-600">{label}</dt>
              <dd className="text-lg font-bold text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          <a href={`${base}/logs/export?kind=seating`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden="true" />
            Unduh meja & suvenir (CSV)
          </a>
          <a href={`${base}/logs/export?kind=gifts`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden="true" />
            Unduh catatan kado (CSV)
          </a>
        </div>

        <TablesSection invitationId={id} tables={tableUse(logs.tables, logs.guests)} planPending={planPending} />
        <GuestsSection invitationId={id} guests={logs.guests} tables={logs.tables} focus={parseId(q.guest ?? '')} />
        <GiftsSection
          invitationId={id}
          gifts={logs.gifts}
          guests={logs.guests}
          sides={{ applies: familySidesApply(access.invitation.eventType), labels: sideLabels(access.invitation.config), order: sideOrder(access.invitation.config) }}
        />
      </div>
    </section>
  );
}
