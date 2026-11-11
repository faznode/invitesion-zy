import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import { formatMoney, isCurrency, money } from '@/lib/payment/money';
import { formatReceiptNumber, parseReceiptNumber, railLabel, receiptItem } from '@/lib/payment/receipt-format';
import { getOwnerReceipt } from '@/lib/payment/receipts';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const number = parseReceiptNumber((await params).number);
  return {
    title: number === null ? 'Kuitansi' : `Kuitansi ${formatReceiptNumber(number)}`,
    robots: { index: false, follow: false },
  };
}

/**
 * G-050: one receipt, printable (the print dialog also saves a PDF). Only its owner reads it: any other account, a number
 * never issued and the flag off all get the same 404. Everything shown is the receipt row, which the jobs runner copied
 * from the order and its payment when it issued it: no name, e-mail, invitation title or guest data.
 */
export default async function ReceiptPage({ params }: Params) {
  if (!isFlagOn('RECEIPTS')) notFound();
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const number = parseReceiptNumber((await params).number);
  if (number === null) notFound();
  const receipt = await getOwnerReceipt(user.id, number);
  if (!receipt) notFound();

  const en = (await getLocale()) === 'en';
  const currency = isCurrency(receipt.currency) ? receipt.currency : 'IDR';
  const amount = formatMoney(money(receipt.amount, currency), en ? 'en' : 'id');
  const when = new Intl.DateTimeFormat(en ? 'en-GB' : 'id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const printed = formatReceiptNumber(receipt.number);

  const fields: Array<[string, string, boolean]> = [
    [en ? 'Status' : 'Status', en ? 'Paid' : 'Lunas', false],
    [en ? 'Paid on' : 'Dibayar', `${when.format(receipt.paidAt)} WIB`, false],
    [en ? 'Order reference' : 'Referensi order', receipt.reference, true],
    [en ? 'Method' : 'Metode', railLabel(receipt.rail, en), false],
  ];
  if (receipt.transactionId) fields.push([en ? 'Transaction ID' : 'ID transaksi', receipt.transactionId, true]);

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/dashboard/receipts" className="text-sm font-semibold text-slate-600 hover:text-brand-700">
            ← {en ? 'Receipts' : 'Kuitansi'}
          </Link>
          <PrintButton label={en ? 'Print or save as PDF' : 'Cetak atau simpan PDF'} />
        </div>

        <article
          aria-labelledby="receipt-title"
          className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <Wordmark href={null} size="sm" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {en ? 'Payment receipt' : 'Kuitansi pembayaran'}
              </p>
            </div>
            <div className="text-right">
              <h1 id="receipt-title" className="font-mono text-lg font-bold text-slate-900">
                {printed}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {en ? 'Issued' : 'Terbit'} {when.format(receipt.issuedAt)} WIB
              </p>
            </div>
          </header>

          <dl className="grid gap-x-6 gap-y-4 py-6 sm:grid-cols-2">
            {fields.map(([label, value, mono]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'break-all font-mono' : ''}`}>{value}</dd>
              </div>
            ))}
          </dl>

          <table className="w-full border-t border-slate-200 text-sm">
            <caption className="sr-only">{en ? 'What was paid' : 'Yang dibayar'}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-3 font-medium">{en ? 'Description' : 'Uraian'}</th>
                <th scope="col" className="py-3 text-right font-medium">{en ? 'Amount' : 'Jumlah'}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="py-3 pr-4 text-slate-900">{receiptItem(receipt.tier, en)}</td>
                <td className="py-3 text-right text-slate-900">{amount}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <th scope="row" className="py-3 text-left font-semibold text-slate-900">Total</th>
                <td className="py-3 text-right text-base font-bold text-slate-900">{amount}</td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-6 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 text-pretty">
            {en
              ? 'This receipt is made from the payment record of the order above. It is not a tax invoice.'
              : 'Kuitansi ini dibuat dari catatan pembayaran order di atas. Bukan faktur pajak.'}
          </p>
        </article>
      </div>
    </section>
  );
}
