import { and, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Eye, EyeOff, ImageIcon, Trash2 } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guests, invitations } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { liveInvitation } from '@/lib/invitation/deletion-db';
import { listGuestPhotos } from '@/lib/invitation/guest-photos-db';
import { postEventSettings, type PhotoReview } from '@/lib/invitation/post-event';
import { deleteGuestPhotoAsHost, reviewGuestPhotoAsHost } from './actions';

export const dynamic = 'force-dynamic';

const GROUPS: { review: PhotoReview; title: string }[] = [
  { review: 'pending', title: 'Menunggu persetujuan' },
  { review: 'visible', title: 'Tampil di undangan' },
  { review: 'hidden', title: 'Disembunyikan' },
];
const DONE: Record<string, string> = { visible: 'Foto ditampilkan di undangan.', hidden: 'Foto disembunyikan.', deleted: 'Foto dihapus.' };
const DATE = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/**
 * I-21 (D-070): the host's review of the photos guests shared after the event. The owner of a live invitation only;
 * images load from `/media/protected/…`, which serves them to this owner alone. Pending photos first.
 */
export default async function GuestPhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('POST_EVENT_MEMORY')) notFound();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [invitation] = await db
    .select({ id: invitations.id, slug: invitations.slug, config: invitations.config })
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, user.id), liveInvitation))
    .limit(1);
  if (!invitation) notFound();

  const settings = postEventSettings(normalizeStoredConfig(invitation.config ?? {}).config);
  const photos = await listGuestPhotos(id);
  const guestIds = [...new Set(photos.map((photo) => photo.guestId).filter((guestId): guestId is number => guestId !== null))];
  const rows = guestIds.length ? await db.select({ id: guests.id, name: guests.name }).from(guests).where(and(eq(guests.invitationId, id), inArray(guests.id, guestIds))) : [];
  const names = new Map(rows.map((row) => [row.id, row.name]));
  const query = await searchParams;

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <Link href={`/dashboard/invitations/${id}/edit`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke editor
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">/{invitation.slug}</p>
          <h1 className="mt-1 text-balance text-2xl font-bold text-slate-950">Foto tamu</h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-500">
            Foto yang dikirim tamu dari tautan pribadinya setelah acara. Foto baru menunggu persetujuanmu; hanya foto yang tampil yang bisa dilihat tamu lain.
          </p>
        </header>

        {!settings.photos && (
          <p role="status" className="rounded-lg border bg-white p-4 text-pretty text-sm leading-relaxed text-slate-700">
            {settings.enabled
              ? 'Pengiriman foto tamu sedang dimatikan di editor (Ucapan & Doa → Kenangan setelah acara). Foto yang sudah ada tetap tersimpan dan tidak tampil.'
              : 'Kenangan setelah acara sedang dimatikan di editor. Foto yang sudah ada tetap tersimpan dan tidak tampil.'}
          </p>
        )}
        {query.done && DONE[query.done] && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {DONE[query.done]}
          </p>
        )}
        {query.error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Foto itu tidak ditemukan. Mungkin sudah dihapus.
          </p>
        )}

        {photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-8 text-center">
            <ImageIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-600">Belum ada foto dari tamu.</p>
          </div>
        ) : (
          GROUPS.map(({ review, title }) => {
            const group = photos.filter((photo) => photo.review === review);
            if (group.length === 0) return null;
            return (
              <section key={review} aria-labelledby={`foto-${review}`} className="flex flex-col gap-3">
                <h2 id={`foto-${review}`} className="text-lg font-bold text-slate-900">
                  {title} ({group.length})
                </h2>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((photo) => {
                    const name = (photo.guestId !== null && names.get(photo.guestId)) || 'Tamu';
                    return (
                      <li key={photo.id} className="flex flex-col gap-3 rounded-xl border bg-white p-3">
                        <img src={photo.url} alt={`Foto dari ${name}`} loading="lazy" className="aspect-square w-full rounded-lg bg-slate-100 object-cover" />
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{name}</span> · {DATE.format(photo.createdAt)} WIB
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {review !== 'visible' && (
                            <form action={reviewGuestPhotoAsHost}>
                              <input type="hidden" name="invitationId" value={id} />
                              <input type="hidden" name="photoId" value={photo.id} />
                              <input type="hidden" name="decision" value="visible" />
                              <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
                                <Eye className="h-4 w-4" aria-hidden="true" />
                                Tampilkan
                              </button>
                            </form>
                          )}
                          {review !== 'hidden' && (
                            <form action={reviewGuestPhotoAsHost}>
                              <input type="hidden" name="invitationId" value={id} />
                              <input type="hidden" name="photoId" value={photo.id} />
                              <input type="hidden" name="decision" value="hidden" />
                              <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                                Sembunyikan
                              </button>
                            </form>
                          )}
                          <form action={deleteGuestPhotoAsHost}>
                            <input type="hidden" name="invitationId" value={id} />
                            <input type="hidden" name="photoId" value={photo.id} />
                            <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Hapus
                            </button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
