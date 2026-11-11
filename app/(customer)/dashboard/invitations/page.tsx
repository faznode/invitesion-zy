import { and, desc, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { ClipboardList, ExternalLink, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { invitations } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { invitationStatusLabel } from '@/lib/i18n';
import { deletionWindowDays } from '@/lib/invitation/deletion-db';
import { invitationPath } from '@/lib/invitation/public-url';
import { publishBlockers } from '@/lib/invitation/publish-rules';
import { paidInvitationIds } from '@/lib/payment/service';
import { deleteInvitation, publish, restoreInvitation, unpublish } from './actions';

export const dynamic = 'force-dynamic';

type Search = { published?: string; unpublished?: string; deleted?: string; restored?: string; error?: string; why?: string };

export default async function CustomerInvitations({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const locale = await getLocale();
  const en = locale === 'en';
  const feedback = await searchParams;

  // B-031: a purged invitation is a tombstone with nothing left to show or restore, so it leaves the list; one in its
  // deletion window stays, with its restore.
  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.userId, user.id), isNull(invitations.purgedAt)))
    .orderBy(desc(invitations.createdAt));
  const windowDays = deletionWindowDays();

  // Which invitations have been paid for, resolved in one query rather than one
  // per card. Publishing is the thing the customer buys, so this decides whether
  // a card offers "publish" or "activate".
  const paidIds = await paidInvitationIds(user.id);
  const cards = rows.map((row) => ({ row, paid: row.id !== null && paidIds.has(row.id) }));

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {en ? 'My workspace' : 'Ruang saya'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {en ? 'My Invitations' : 'Undangan saya'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {en
                ? 'Manage your digital invitation and its event preparation separately.'
                : 'Kelola undangan digital dan persiapan acaranya secara terpisah.'}
            </p>
          </div>
          <Link
            href="/dashboard/event-blueprint"
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            + {en ? 'Build an event' : 'Buat event'}
          </Link>
        </header>

        <Feedback feedback={feedback} en={en} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ row: r, paid }) => {
            if (r.deletedAt && r.purgeAfter) {
              return <DeletedCard key={r.id} id={r.id} slug={r.slug} eventType={r.eventType} purgeAfter={r.purgeAfter} en={en} />;
            }
            const isPublished = r.status === 'PUBLISHED';
            // Evaluated before the customer clicks, so a disabled button always
            // explains itself instead of failing only on submit.
            const blockers = isPublished ? [] : publishBlockers(r.eventType, r.config);

            return (
              <article
                key={r.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-medium capitalize text-slate-500">
                    <FileText className="h-4 w-4 text-brand-600" />
                    {r.eventType}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {invitationStatusLabel(r.status, locale)}
                  </span>
                </div>

                <h2 className="mt-5 truncate text-lg font-bold text-slate-900">/{r.slug}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {en ? 'Created' : 'Dibuat'}{' '}
                  {r.createdAt.toLocaleDateString(en ? 'en-GB' : 'id-ID')}
                </p>

                {isPublished && r.expiresAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    {en ? 'Active until' : 'Aktif sampai'}{' '}
                    {r.expiresAt.toLocaleDateString(en ? 'en-GB' : 'id-ID')}
                  </p>
                )}

                <div className="mt-5 grid gap-2">
                  <Link
                    href={`/dashboard/invitations/${r.id}/manage`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {en ? 'Open control center' : 'Buka pusat kontrol'}
                  </Link>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/dashboard/invitations/${r.id}/edit`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {en ? 'Edit invitation' : 'Edit undangan'}
                    </Link>
                    <Link
                      href={`/dashboard/invitations/${r.id}/planner`}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Planner
                    </Link>
                  </div>

                  <PublishControl
                    id={r.id}
                    slug={r.slug}
                    isPublished={isPublished}
                    paid={paid}
                    blockers={blockers}
                    en={en}
                  />

                  {windowDays !== null && <DeleteControl id={r.id} windowDays={windowDays} en={en} />}
                </div>
              </article>
            );
          })}

          {!rows.length && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              {en ? 'No invitations yet.' : 'Belum ada undangan.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PublishControl({
  id,
  slug,
  isPublished,
  paid,
  blockers,
  en,
}: {
  id: number;
  slug: string;
  isPublished: boolean;
  paid: boolean;
  blockers: string[];
  en: boolean;
}) {
  if (isPublished) {
    return (
      <div className="mt-1 grid gap-2 border-t border-slate-100 pt-3">
        <a
          href={invitationPath(slug)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <ExternalLink className="h-4 w-4" />
          {en ? 'View live page' : 'Lihat halaman live'}
        </a>
        <form action={unpublish}>
          <input type="hidden" name="invitationId" value={id} />
          <button
            type="submit"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            {en ? 'Unpublish' : 'Tarik dari publik'}
          </button>
        </form>
      </div>
    );
  }

  if (blockers.length) {
    return (
      <div className="mt-1 border-t border-slate-100 pt-3">
        <button
          type="button"
          disabled
          className="inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400"
        >
          {en ? 'Publish' : 'Terbitkan'}
        </button>
        <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-700">
          {blockers.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      </div>
    );
  }

  // Content is ready but the invitation has not been bought yet. Sending the
  // customer to checkout is more honest than a publish button that redirects
  // there anyway.
  if (!paid) {
    return (
      <div className="mt-1 border-t border-slate-100 pt-3">
        <Link
          href={`/dashboard/invitations/${id}/checkout`}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          {en ? 'Activate & publish' : 'Aktivasi & terbitkan'}
        </Link>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          {en ? 'One-time payment, active for 12 months.' : 'Bayar sekali, aktif 12 bulan.'}
        </p>
      </div>
    );
  }

  return (
    <form action={publish} className="mt-1 border-t border-slate-100 pt-3">
      <input type="hidden" name="invitationId" value={id} />
      <button
        type="submit"
        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700"
      >
        {en ? 'Publish invitation' : 'Terbitkan undangan'}
      </button>
    </form>
  );
}

/**
 * B-031 (D-063): a deleted invitation in its window. Nothing else is offered (every other page answers 404 until the
 * restore); the date is when the purge may run, so "on or after" stays true however long the job waits.
 */
function DeletedCard({
  id,
  slug,
  eventType,
  purgeAfter,
  en,
}: {
  id: number;
  slug: string;
  eventType: string;
  purgeAfter: Date;
  en: boolean;
}) {
  const date = purgeAfter.toLocaleDateString(en ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <article className="flex flex-col rounded-xl border border-dashed border-rose-200 bg-rose-50/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium capitalize text-slate-500">
          <Trash2 className="h-4 w-4 text-rose-600" aria-hidden="true" />
          {eventType}
        </span>
        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
          {en ? 'Deleted' : 'Dihapus'}
        </span>
      </div>

      <h2 className="mt-5 truncate text-lg font-bold text-slate-500">/{slug}</h2>
      <p className="mt-2 text-pretty text-xs leading-5 text-slate-600">
        {en
          ? `Guests can no longer open this invitation. It will be deleted permanently on or after ${date}; until then you can restore it.`
          : `Tamu tidak bisa lagi membuka undangan ini. Undangan akan dihapus permanen pada atau setelah ${date}; sebelum itu Anda bisa memulihkannya.`}
      </p>

      <form action={restoreInvitation} className="mt-5">
        <input type="hidden" name="invitationId" value={id} />
        <button
          type="submit"
          className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {en ? 'Restore invitation' : 'Pulihkan undangan'}
        </button>
      </form>
    </article>
  );
}

/**
 * B-031: deletion sits behind a disclosure and a required confirmation (checked again by the action), so it takes two
 * deliberate steps and works without client JavaScript. Shown only while the flag is on and the window is set.
 */
function DeleteControl({ id, windowDays, en }: { id: number; windowDays: number; en: boolean }) {
  const days = en ? `${windowDays} ${windowDays === 1 ? 'day' : 'days'}` : `${windowDays} hari`;
  return (
    <details className="mt-1 border-t border-slate-100 pt-3">
      <summary className="inline-flex min-h-10 w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 [&::-webkit-details-marker]:hidden">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {en ? 'Delete invitation' : 'Hapus undangan'}
      </summary>
      <form action={deleteInvitation} className="mt-2 grid gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <input type="hidden" name="invitationId" value={id} />
        <p className="text-pretty text-[11px] leading-5 text-rose-900">
          {en
            ? `Guests lose access at once: the invitation link, personal links and passes stop working, and its photos are no longer served (a copy a guest's browser already saved may still show). You can restore it for ${days}; after that its guests, wishes, statistics, logs, version history and photos are deleted permanently. Payment records are kept.`
            : `Tamu langsung kehilangan akses: tautan undangan, tautan pribadi, dan pass berhenti berfungsi, dan fotonya tidak lagi disajikan (salinan yang sudah tersimpan di peramban tamu mungkin masih tampil). Anda bisa memulihkannya selama ${days}; setelah itu tamu, ucapan, statistik, catatan, riwayat versi, dan fotonya dihapus permanen. Catatan pembayaran tetap disimpan.`}
        </p>
        <label className="flex items-start gap-2 text-[11px] font-medium leading-5 text-rose-900">
          <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600" />
          {en ? 'I understand that guests lose access now.' : 'Saya mengerti tamu langsung kehilangan akses.'}
        </label>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
        >
          {en ? 'Delete' : 'Hapus'}
        </button>
      </form>
    </details>
  );
}

function Feedback({ feedback, en }: { feedback: Search; en: boolean }) {
  if (feedback.deleted) {
    return (
      <p role="status" className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        {en
          ? 'Invitation deleted. Guests can no longer open it; you can restore it from its card until the date shown.'
          : 'Undangan dihapus. Tamu tidak bisa lagi membukanya; Anda bisa memulihkannya dari kartunya sampai tanggal yang tertera.'}
      </p>
    );
  }
  if (feedback.restored) {
    return (
      <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {en ? 'Invitation restored. Its links work again as before.' : 'Undangan dipulihkan. Tautannya berfungsi lagi seperti sebelumnya.'}
      </p>
    );
  }
  if (feedback.error === 'purged') {
    return (
      <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {en ? 'This invitation has already been deleted permanently.' : 'Undangan ini sudah dihapus permanen.'}
      </p>
    );
  }
  if (feedback.error === 'unconfirmed') {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {en ? 'Tick the confirmation box to delete the invitation.' : 'Centang kotak konfirmasi untuk menghapus undangan.'}
      </p>
    );
  }
  if (feedback.error === 'deletion-off') {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {en ? 'Deleting invitations is not available yet.' : 'Penghapusan undangan belum tersedia.'}
      </p>
    );
  }
  if (feedback.published) {
    return (
      <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {en
          ? 'Invitation published. The guest link is live for 12 months.'
          : 'Undangan terbit. Tautan tamu aktif selama 12 bulan.'}
      </p>
    );
  }
  if (feedback.unpublished) {
    return (
      <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        {en
          ? 'Invitation is back to draft. Its active period was not reset.'
          : 'Undangan kembali ke draf. Masa aktifnya tidak direset.'}
      </p>
    );
  }
  if (feedback.error === 'incomplete') {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {(en ? 'Cannot publish yet: ' : 'Belum bisa terbit: ') + (feedback.why ?? '')}
      </p>
    );
  }
  if (feedback.error) {
    return (
      <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {en ? 'That action could not be completed.' : 'Aksi tersebut tidak bisa diselesaikan.'}
      </p>
    );
  }
  return null;
}
