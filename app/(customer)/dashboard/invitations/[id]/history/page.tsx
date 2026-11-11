import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { loadVersionHistory } from '@/lib/invitation/content';
import { parseId } from '@/lib/invitation/host-logs';
import { changedSections, HISTORY_PAGE_SIZE, historyCursor, versionAuthor, versionTime } from '@/lib/invitation/version-history';
import { HistoryAnnouncer, RestoreVersion } from './restore-version';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Riwayat versi', robots: { index: false, follow: false } };

/**
 * G-046: the owner's version history. Every save is a version; each older one can be restored as a new version (the
 * current one stays in the list, so a restore can itself be undone). Owner only, as the editor (`loadVersionHistory`);
 * flag off: 404. Restoring changes the invitation's content only, which the page says before anyone confirms.
 */
export default async function VersionHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sebelum?: string | string[] }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('VERSION_HISTORY')) notFound();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const before = historyCursor((await searchParams).sebelum);
  const history = await loadVersionHistory(id, user.id, { before, limit: HISTORY_PAGE_SIZE });
  if (!history) notFound();
  const { state, versions, more } = history;
  const base = `/dashboard/invitations/${id}`;
  const oldest = versions.at(-1)?.versionNo;

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <a href={`${base}/edit`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke editor
          </a>
          <h1 className="text-balance text-2xl font-bold text-slate-950">Riwayat versi</h1>
          <p className="text-pretty text-sm leading-6 text-slate-600">
            Setiap kali undangan disimpan, versinya dicatat di sini. Memulihkan versi lama hanya mengubah isi undangan (teks, acara,
            tema, galeri, dan pengaturan). Daftar tamu, jawaban RSVP, ucapan, foto yang diunggah, dan pembayaran tidak berubah.
            Pemulihan disimpan sebagai versi baru, jadi versi sekarang tetap ada di riwayat.
          </p>
        </header>

        {versions.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            Belum ada versi tersimpan. Versi pertama tercatat saat undangan disimpan dari editor.
          </p>
        ) : (
          <HistoryAnnouncer>
            <ol className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {versions.map((version) => {
                const current = version.versionNo === state.version;
                const changed = current ? [] : changedSections(state.config, version.config);
                return (
                  <li key={version.versionNo} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                        Versi {version.versionNo}
                        {current && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Versi saat ini</span>}
                      </p>
                      <p className="text-sm text-slate-600">
                        <time dateTime={version.createdAt.toISOString()}>{versionTime(version.createdAt)}</time> · {versionAuthor(version.createdBy)}
                      </p>
                      {!current && (
                        <p className="text-pretty text-sm leading-6 text-slate-600">
                          {changed.length ? `Berbeda dari versi saat ini: ${changed.join(', ')}.` : 'Isinya sama dengan versi saat ini.'}
                        </p>
                      )}
                    </div>
                    {!current && changed.length > 0 && <RestoreVersion invitationId={id} versionNo={version.versionNo} currentVersion={state.version} />}
                  </li>
                );
              })}
            </ol>
          </HistoryAnnouncer>
        )}

        {(before !== undefined || more) && (
          <nav aria-label="Halaman riwayat" className="flex flex-wrap gap-3">
            {before !== undefined && (
              <Link href={`${base}/history`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Versi terbaru
              </Link>
            )}
            {more && oldest !== undefined && (
              <Link href={`${base}/history?sebelum=${oldest}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Versi yang lebih lama
              </Link>
            )}
          </nav>
        )}
      </div>
    </section>
  );
}
