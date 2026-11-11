import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Clock3, ReceiptText } from 'lucide-react';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import { formatMoney, isCurrency, money } from '@/lib/payment/money';
import { formatReceiptNumber, railLabel, receiptItem } from '@/lib/payment/receipt-format';
import { listOwnerReceipts } from '@/lib/payment/receipts';
import { requestReceiptAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Kuitansi', robots: { index: false, follow: false } };

type Search = { requested?: string; error?: string };

function notice(q: Search, en: boolean): { tone: 'ok' | 'error'; text: string } | null {
  if (q.requested === 'queued') {
    return { tone: 'ok', text: en ? 'Request received. The receipt is prepared within a few minutes.' : 'Permintaan diterima. Kuitansi disiapkan dalam beberapa menit.' };
  }
  if (q.requested === 'issued') return { tone: 'ok', text: en ? 'This receipt has already been issued.' : 'Kuitansi ini sudah terbit.' };
  if (q.error === 'not_found') return { tone: 'error', text: en ? 'That payment was not found.' : 'Pembayaran itu tidak ditemukan.' };
  return null;
}

/**
 * G-050: the owner's receipts, one row per paid order (newest first). A new payment's receipt is issued by the jobs
 * runner; an earlier payment shows a request button (the backlog's "earlier payments on request").
 */
export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isFlagOn('RECEIPTS')) notFound();
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const en = (await getLocale()) === 'en';
  const message = notice(await searchParams, en);
  const rows = await listOwnerReceipts(user.id);
  const date = new Intl.DateTimeFormat(en ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-sm font-semibold text-brand-700">{en ? 'Payments' : 'Pembayaran'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 text-balance">{en ? 'Receipts' : 'Kuitansi'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 text-pretty">
            {en
              ? 'Every paid order gets a receipt made from its payment record. For payments made before receipts existed, request one below.'
              : 'Setiap order yang lunas mendapat kuitansi dari catatan pembayarannya. Untuk pembayaran sebelum ada fitur kuitansi, minta di bawah.'}
          </p>
        </header>

        {message && (
          <p
            role="status"
            className={`mt-6 rounded-lg border px-4 py-3 text-sm ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
          >
            {message.text}
          </p>
        )}

        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <ReceiptText className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
            <p className="mt-3 text-sm text-slate-600">{en ? 'No paid orders yet.' : 'Belum ada order yang lunas.'}</p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {rows.map((row) => {
              const currency = isCurrency(row.currency) ? row.currency : 'IDR';
              return (
                <li key={row.orderId} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{receiptItem(row.tier, en)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatMoney(money(row.amount, currency), en ? 'en' : 'id')} · {railLabel(row.rail, en)}
                      {row.paidAt ? ` · ${date.format(row.paidAt)}` : ''}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{row.reference}</p>
                  </div>
                  <div className="shrink-0">
                    {row.state === 'issued' && row.number !== null ? (
                      <Link
                        href={`/dashboard/receipts/${row.number}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        <ReceiptText className="h-4 w-4 text-brand-600" aria-hidden />
                        <span>
                          {en ? 'View' : 'Lihat'} <span className="font-mono">{formatReceiptNumber(row.number)}</span>
                        </span>
                      </Link>
                    ) : row.state === 'preparing' ? (
                      <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-50 px-3 text-sm font-medium text-amber-800">
                        <Clock3 className="h-4 w-4" aria-hidden />
                        {en ? 'Being prepared' : 'Sedang disiapkan'}
                      </span>
                    ) : (
                      <form action={requestReceiptAction}>
                        <input type="hidden" name="orderId" value={row.orderId} />
                        <button
                          type="submit"
                          className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          {en ? 'Request receipt' : 'Minta kuitansi'}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
