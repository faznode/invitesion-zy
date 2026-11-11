import { BookOpen, Download } from 'lucide-react';
import { WISHES_BOOK_MAX } from '@/lib/invitation/wishes-book';

/**
 * I-22 (D-060): the owner's download of the wishes book. `visible` is the page's own count of VISIBLE wishes, the same rule
 * the book prints by; the link is a plain document request so the browser saves the attachment.
 */
export function WishesBookCard({ invitationId, visible }: { invitationId: number; visible: number }) {
  const summary = !visible
    ? 'Belum ada ucapan berstatus Tampil. Buku yang diunduh sekarang hanya berisi sampul.'
    : visible > WISHES_BOOK_MAX
      ? `Buku memuat ${WISHES_BOOK_MAX.toLocaleString('id-ID')} ucapan paling awal dari ${visible.toLocaleString('id-ID')} ucapan berstatus Tampil.`
      : `${visible.toLocaleString('id-ID')} ucapan berstatus Tampil dicetak dari yang terlama, lengkap dengan balasanmu.`;
  return (
    <section aria-labelledby="wishes-book-title" className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center">
      <BookOpen className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1">
        <h2 id="wishes-book-title" className="text-sm font-bold text-slate-900">
          Buku ucapan
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-slate-700">
          {summary} Ucapan yang menunggu persetujuan atau disembunyikan tidak dimasukkan.
        </p>
      </div>
      <a
        href={`/dashboard/invitations/${invitationId}/wishes/book`}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Unduh buku ucapan<span className="sr-only"> (PDF)</span>
      </a>
    </section>
  );
}
