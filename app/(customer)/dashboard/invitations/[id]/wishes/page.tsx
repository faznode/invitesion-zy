import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Eye, EyeOff, MessageSquareReply, Settings2, Trash2 } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guestMessages } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { accessFor } from '@/lib/invitation/members-db';
import { REPLY_MAX_LENGTH, guestbookRules, wishState, type WishState } from '@/lib/invitation/wish-decision';
import { moderateWish, replyToWish } from './actions';
import { WishesBookCard } from './book-card';

export const dynamic = 'force-dynamic';

/** The host's list is bounded like the guest page's; the counts above it always cover every wish. */
const PAGE_SIZE = 200;

const FILTERS = [
  ['all', 'Semua'],
  ['pending', 'Menunggu'],
  ['visible', 'Tampil'],
  ['hidden', 'Disembunyikan'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const STATE_LABEL: Record<WishState, string> = { VISIBLE: 'Tampil', PENDING: 'Menunggu persetujuan', HIDDEN: 'Disembunyikan' };
const STATE_STYLE: Record<WishState, string> = {
  VISIBLE: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-800',
  HIDDEN: 'bg-slate-100 text-slate-600',
};
const DONE: Record<string, string> = {
  show: 'Ucapan ditampilkan di undangan.',
  hide: 'Ucapan disembunyikan dari undangan.',
  delete: 'Ucapan dihapus.',
  reply: 'Balasan disimpan.',
  unreply: 'Balasan dihapus.',
};
const ERROR: Record<string, string> = {
  invalid: 'Balasan paling banyak 1.000 karakter.',
  notfound: 'Ucapan tidak ditemukan. Mungkin sudah dihapus.',
  unconfirmed: 'Perubahan belum bisa dipastikan tersimpan karena gangguan sambungan. Periksa daftar, lalu ulangi bila belum berubah.',
};

export default async function WishesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; done?: string; error?: string }>;
}) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // G-044 (D-057): the owner or a co-host (`wishes`). The guestbook's settings live in the editor, which is the owner's.
  const access = await accessFor(user.id, id, 'wishes');
  if (!access) notFound();
  const inv = access.invitation;
  const owner = access.role === 'owner';
  const q = await searchParams;
  const filter: Filter = FILTERS.some(([value]) => value === q.filter) ? (q.filter as Filter) : 'all';
  const rules = guestbookRules(normalizeStoredConfig(inv.config ?? {}).config);

  // B-017: every query here starts with this invitation's rows in `guest_messages_invitation_visible_idx`.
  const ofInvitation = eq(guestMessages.invitationId, id);
  const where = {
    all: ofInvitation,
    pending: and(ofInvitation, eq(guestMessages.isHidden, true), isNull(guestMessages.reviewedAt)),
    visible: and(ofInvitation, eq(guestMessages.isHidden, false)),
    hidden: and(ofInvitation, eq(guestMessages.isHidden, true), isNotNull(guestMessages.reviewedAt)),
  }[filter];
  const [rows, totals] = await Promise.all([
    db.select().from(guestMessages).where(where).orderBy(desc(guestMessages.createdAt), desc(guestMessages.id)).limit(PAGE_SIZE),
    db
      .select({ isHidden: guestMessages.isHidden, reviewed: isNotNull(guestMessages.reviewedAt), value: count() })
      .from(guestMessages)
      .where(ofInvitation)
      .groupBy(guestMessages.isHidden, isNotNull(guestMessages.reviewedAt)),
  ]);
  const tally: Record<WishState, number> = { VISIBLE: 0, PENDING: 0, HIDDEN: 0 };
  for (const t of totals) tally[wishState({ isHidden: t.isHidden, reviewedAt: t.reviewed ? 'reviewed' : null })] += Number(t.value);
  const counts: Record<Filter, number> = { all: tally.VISIBLE + tally.PENDING + tally.HIDDEN, pending: tally.PENDING, visible: tally.VISIBLE, hidden: tally.HIDDEN };

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <Link href={owner ? `/dashboard/invitations/${id}/manage` : '/dashboard'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {owner ? 'Control center' : 'Dasbor'}
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">/{inv.slug}</p>
          <h1 className="mt-1 text-2xl font-bold text-balance text-slate-950">Ucapan & Doa</h1>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-slate-500">
            Setujui, sembunyikan, hapus, atau balas ucapan tamu. Balasanmu tampil di bawah ucapan yang tampil di undangan.
          </p>
        </header>

        <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center">
          <Settings2 className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="flex-1 text-sm leading-relaxed text-slate-700">
            {!rules.enabled
              ? 'Buku tamu sedang ditutup: tamu tidak bisa mengirim ucapan baru.'
              : `${rules.moderation ? 'Ucapan baru menunggu persetujuanmu sebelum tampil.' : 'Ucapan baru langsung tampil.'} ${
                  rules.visibility === 'host' ? 'Hanya kamu yang bisa membaca ucapan; undangan tidak menampilkan daftarnya.' : 'Semua tamu bisa membaca ucapan yang tampil.'
                }`}
          </p>
          {owner && (
            <Link href={`/dashboard/invitations/${id}/edit`} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
              Ubah di editor (Buku Tamu)
            </Link>
          )}
        </div>

        {/* I-22 (D-060): the wishes book is the owner's alone, as its route is. */}
        {owner && isFlagOn('WISHES_BOOK') && <WishesBookCard invitationId={id} visible={tally.VISIBLE} />}

        {q.done && DONE[q.done] && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {DONE[q.done]}
          </p>
        )}
        {q.error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {ERROR[q.error] ?? 'Permintaan tidak valid.'}
          </p>
        )}

        <nav aria-label="Saring ucapan" className="flex flex-wrap gap-2">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={`/dashboard/invitations/${id}/wishes${value === 'all' ? '' : `?filter=${value}`}`}
              aria-current={filter === value ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                filter === value ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={filter === value ? 'text-white' : 'text-slate-500'}>{counts[value]}</span>
            </Link>
          ))}
        </nav>

        {rows.length ? (
          <ul className="flex flex-col gap-3">
            {rows.map((wish) => {
              const state = wishState(wish);
              return (
                <li key={wish.id} className="rounded-xl border bg-white p-4 sm:p-5">
                  <article aria-labelledby={`wish-${wish.id}-from`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 id={`wish-${wish.id}-from`} className="font-bold text-slate-900">
                        {wish.name}
                      </h2>
                      <time dateTime={wish.createdAt.toISOString()} className="text-xs text-slate-500">
                        {wish.createdAt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })} WIB
                      </time>
                      <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{wish.message}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {state !== 'VISIBLE' && (
                        <ModerationButton invitationId={id} wishId={wish.id} filter={filter} action="show" label={state === 'PENDING' ? 'Setujui' : 'Tampilkan lagi'} icon="show" />
                      )}
                      {state !== 'HIDDEN' && (
                        <ModerationButton invitationId={id} wishId={wish.id} filter={filter} action="hide" label="Sembunyikan" icon="hide" />
                      )}
                      <details className="group">
                        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus
                        </summary>
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3">
                          <span className="text-xs text-red-800">Hapus permanen ucapan dari {wish.name}?</span>
                          <ModerationButton invitationId={id} wishId={wish.id} filter={filter} action="delete" label="Ya, hapus" icon="delete" />
                        </div>
                      </details>
                    </div>

                    <form action={replyToWish} className="mt-4 flex flex-col gap-2 border-t pt-4">
                      <input type="hidden" name="invitationId" value={id} />
                      <input type="hidden" name="wishId" value={wish.id} />
                      <input type="hidden" name="filter" value={filter} />
                      <label htmlFor={`reply-${wish.id}`} className="text-xs font-semibold text-slate-700">
                        {wish.hostReply ? 'Balasanmu' : 'Balas ucapan ini'}
                      </label>
                      <textarea
                        id={`reply-${wish.id}`}
                        name="reply"
                        rows={2}
                        maxLength={REPLY_MAX_LENGTH}
                        defaultValue={wish.hostReply ?? ''}
                        placeholder="Terima kasih atas doanya…"
                        className="w-full rounded-lg border p-3 text-sm leading-relaxed outline-none focus:border-brand-600"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700">
                          <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
                          Simpan balasan
                        </button>
                        {wish.hostReply && <span className="text-xs text-slate-500">Kosongkan lalu simpan untuk menghapus balasan.</span>}
                      </div>
                    </form>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
            {filter === 'all' ? 'Belum ada ucapan untuk undangan ini.' : 'Tidak ada ucapan di bagian ini.'}
          </p>
        )}
        {counts[filter] > rows.length && (
          <p className="text-center text-sm text-slate-500">
            Menampilkan {rows.length} ucapan terbaru dari {counts[filter]}.
          </p>
        )}
      </div>
    </section>
  );
}

function ModerationButton({
  invitationId,
  wishId,
  filter,
  action,
  label,
  icon,
}: {
  invitationId: number;
  wishId: number;
  filter: Filter;
  action: 'show' | 'hide' | 'delete';
  label: string;
  icon: 'show' | 'hide' | 'delete';
}) {
  const Icon = icon === 'show' ? Eye : icon === 'hide' ? EyeOff : Trash2;
  const tone = action === 'delete' ? 'border-red-300 bg-white text-red-700 hover:bg-red-100' : 'text-slate-700 hover:bg-slate-50';
  return (
    <form action={moderateWish}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="wishId" value={wishId} />
      <input type="hidden" name="filter" value={filter} />
      <input type="hidden" name="action" value={action} />
      <button className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${tone}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}
