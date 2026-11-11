import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { CheckCircle2, Clock3, QrCode } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { orders } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import { formatReceiptNumber } from '@/lib/payment/receipt-format';
import { ownerReceiptNumberForOrder } from '@/lib/payment/receipts';
import { OwnershipError, requireOwnedInvitation } from '@/lib/invitation/service';
import { formatMoney, isCurrency, money } from '@/lib/payment/money';
import { getProvider, railStatus } from '@/lib/payment/registry';
import { orderCouponLines } from '@/lib/payment/service';
import { startCheckout } from './actions';
import { couponNotice } from './coupon-notice';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string; paid?: string; cancelled?: string; error?: string; reason?: string }>;
};

/**
 * Payment page for one invitation.
 *
 * Deliberately does not decide anything about payment state. `?paid=1` is only
 * where the provider sent the browser back — it is not evidence of payment, and
 * this page never treats it as such. The status shown is read from our own
 * `orders` row, which only a verified webhook or an operator confirmation can
 * move. A customer who reloads this URL with `?paid=1` gets whatever the database
 * says, which is the point.
 */
export default async function CheckoutPage({ params, searchParams }: Params) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const invitationId = Number((await params).id);
  if (!Number.isInteger(invitationId) || invitationId <= 0) notFound();

  let invitation;
  try {
    invitation = await requireOwnedInvitation(invitationId, user.id);
  } catch (error) {
    if (error instanceof OwnershipError) notFound();
    throw error;
  }

  const query = await searchParams;
  const locale = await getLocale();
  const en = locale === 'en';

  // Ownership is enforced by user id as well as reference, so a guessed
  // reference cannot show someone else's order.
  const [order] = query.ref
    ? await db
        .select()
        .from(orders)
        .where(and(eq(orders.reference, query.ref), eq(orders.userId, user.id)))
        .limit(1)
    : await db
        .select()
        .from(orders)
        .where(and(eq(orders.invitationId, invitationId), eq(orders.userId, user.id)))
        .orderBy(desc(orders.createdAt))
        .limit(1);

  const currency = order && isCurrency(order.currency) ? order.currency : 'IDR';
  const amount = order ? formatMoney(money(order.amount, currency), en ? 'en' : 'id') : null;

  // G-053: a coupon order shows its price, each coupon's discount and what it charges (all as recorded on the order).
  const couponsEnabled = isFlagOn('COUPONS');
  const couponLines = order && order.listAmount !== null ? await orderCouponLines(order.id) : [];
  const show = (value: number) => formatMoney(money(value, currency), en ? 'en' : 'id');

  // B-039: every render carries a fresh checkout key, so a double tap or a resubmitted page reaches one order. A failed
  // or expired attempt is over: the page offers a new one under a new key.
  const checkoutKey = randomUUID();
  const attemptOver = order?.status === 'FAILED' || order?.status === 'EXPIRED';

  // G-050: a paid order links to its receipt once the jobs runner has issued it. The settlement itself usually publishes
  // the invitation, so the live state carries the link as well as the paid-but-not-live one.
  const receiptsEnabled = isFlagOn('RECEIPTS');
  const receiptNumber = receiptsEnabled && order?.status === 'PAID' ? await ownerReceiptNumberForOrder(user.id, order.id) : null;
  const receiptLink =
    receiptsEnabled && order?.status === 'PAID' ? (
      <Link
        href={receiptNumber !== null ? `/dashboard/receipts/${receiptNumber}` : '/dashboard/receipts'}
        className="mt-3 inline-flex text-sm font-semibold text-emerald-900 underline underline-offset-2 hover:text-emerald-950"
      >
        {receiptNumber !== null
          ? `${en ? 'View receipt' : 'Lihat kuitansi'} ${formatReceiptNumber(receiptNumber)}`
          : en ? 'Receipt being prepared: see your receipts' : 'Kuitansi sedang disiapkan: lihat daftar kuitansi'}
      </Link>
    ) : null;

  // Rendered server-side into an SVG: no client-side QR library, and the raw
  // payload never has to reach the browser as data.
  let qrSvg: string | null = null;
  let qrisNote: string | null = null;
  if (order?.status === 'PENDING' && order.rail === 'qris') {
    const status = railStatus('qris');
    if (status.available) {
      const provider = getProvider('qris');
      const handle = await provider.createCharge({
        reference: order.reference,
        price: money(order.amount, currency),
        description: `Aktivasi undangan /${invitation.slug}`,
        customerEmail: user.email,
        successUrl: '',
        cancelUrl: '',
      });
      if (handle.qrisPayload) {
        qrSvg = await QRCode.toString(handle.qrisPayload, { type: 'svg', margin: 1, width: 240 });
      }
      qrisNote = status.note ?? null;
    } else {
      qrisNote = status.reason;
    }
  }

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8">
      <div className="mx-auto max-w-xl">
        <Link href="/dashboard/invitations" className="text-sm font-semibold text-slate-600 hover:text-brand-700">
          ← {en ? 'My invitations' : 'Undangan saya'}
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {en ? 'Activate invitation' : 'Aktivasi undangan'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">/{invitation.slug}</p>

        {query.error === 'rail' && (
          <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {en
              ? 'Payment is not available right now. Please contact support.'
              : 'Pembayaran belum tersedia saat ini. Silakan hubungi kami.'}
          </p>
        )}

        {query.error === 'changed' && (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {en
              ? 'The price or theme changed since this page was opened. Nothing was charged; check the amount below and continue.'
              : 'Harga atau tema berubah sejak halaman ini dibuka. Belum ada tagihan; periksa nominal di bawah lalu lanjutkan.'}
          </p>
        )}

        {query.error === 'coupon' && (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {couponNotice(query.reason, en)}
          </p>
        )}

        {query.error === 'closed' && (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {en
              ? 'That payment attempt has ended. Start a new one below.'
              : 'Percobaan pembayaran itu sudah berakhir. Mulai yang baru di bawah.'}
          </p>
        )}

        {invitation.status === 'PUBLISHED' ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {en ? 'This invitation is already live.' : 'Undangan ini sudah tayang.'}
            </p>
            {receiptLink}
          </div>
        ) : !order || attemptOver ? (
          <form action={startCheckout} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="invitationId" value={invitationId} />
            <input type="hidden" name="checkoutKey" value={checkoutKey} />
            {attemptOver && (
              <p className="mb-3 text-sm font-medium text-slate-800">
                {en ? 'Your previous payment attempt ended without a payment.' : 'Percobaan pembayaran sebelumnya berakhir tanpa pembayaran.'}
              </p>
            )}
            <p className="text-sm text-slate-600">
              {en
                ? 'One-time payment. The invitation goes live for 12 months once payment is confirmed.'
                : 'Bayar sekali. Undangan tayang selama 12 bulan setelah pembayaran dikonfirmasi.'}
            </p>
            {couponsEnabled && (
              <div className="mt-4">
                <label htmlFor="couponCodes" className="text-sm font-medium text-slate-800">
                  {en ? 'Coupon code (optional)' : 'Kode kupon (opsional)'}
                </label>
                <input
                  id="couponCodes"
                  name="couponCodes"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={100}
                  aria-describedby="couponCodesHelp"
                  className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
                />
                <p id="couponCodesHelp" className="mt-1.5 text-xs leading-5 text-slate-600">
                  {en
                    ? 'The discount is checked on our side and shown with the amount before you pay.'
                    : 'Diskon diperiksa di sistem kami dan ditampilkan bersama nominal sebelum kamu membayar.'}
                </p>
              </div>
            )}
            <button
              type="submit"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {en ? 'Continue to payment' : 'Lanjut ke pembayaran'}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              {order.listAmount !== null && (
                <dl className="mb-3 flex flex-col gap-1.5 border-b border-slate-100 pb-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{en ? 'Price' : 'Harga'}</dt>
                    <dd className="text-slate-800">{show(order.listAmount)}</dd>
                  </div>
                  {couponLines.map((line) => (
                    <div key={line.code} className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">
                        {en ? 'Coupon' : 'Kupon'} <span className="font-mono text-slate-700">{line.code}</span>
                      </dt>
                      <dd className="text-emerald-800">{`−${show(line.discount)}`}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500">{order.listAmount !== null ? 'Total' : en ? 'Amount' : 'Nominal'}</span>
                <span className="text-lg font-bold text-slate-900">{amount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500">{en ? 'Reference' : 'Referensi'}</span>
                <span className="font-mono text-xs text-slate-700">{order.reference}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500">Status</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    order.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>

            {order.status === 'PAID' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
                <p>{en ? 'Payment confirmed. Your invitation is live.' : 'Pembayaran terkonfirmasi. Undangan kamu sudah tayang.'}</p>
                {receiptLink}
              </div>
            ) : qrSvg ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-900">
                  <QrCode className="h-4 w-4 text-brand-600" />
                  {en ? 'Scan with any QRIS app' : 'Scan pakai aplikasi apa pun yang mendukung QRIS'}
                </p>
                {/* Server-rendered SVG from our own encoder; no third-party image host. */}
                <div className="mx-auto mt-4 w-[240px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-4 text-xs leading-6 text-slate-500">
                  {en
                    ? 'The amount is already embedded in the code — no need to type it.'
                    : 'Nominal sudah tertanam di dalam kode — tidak perlu diketik manual.'}
                </p>
                {qrisNote && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-800">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {en
                      ? 'Payment is verified manually, so activation can take a short while after you pay.'
                      : 'Pembayaran diverifikasi manual, jadi aktivasi bisa perlu waktu sebentar setelah kamu bayar.'}
                  </p>
                )}
              </div>
            ) : order.rail === 'stripe' && order.status === 'PENDING' ? (
              // Resumes the same order under its own key: Stripe returns the session it already opened for this reference.
              <form action={startCheckout} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <input type="hidden" name="invitationId" value={invitationId} />
                <input type="hidden" name="checkoutKey" value={order.checkoutKey ?? checkoutKey} />
                {/* G-053: the order's own codes, so the resubmitted intent matches and the same order resumes. */}
                {couponLines.length > 0 && <input type="hidden" name="couponCodes" value={couponLines.map((line) => line.code).join(' ')} />}
                <p className="text-sm text-slate-600">
                  {en
                    ? 'Complete the payment on Stripe. This page updates once the payment is confirmed.'
                    : 'Selesaikan pembayaran di Stripe. Halaman ini akan berubah setelah pembayaran terkonfirmasi.'}
                </p>
                <button
                  type="submit"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {en ? 'Continue to Stripe' : 'Lanjut ke Stripe'}
                </button>
              </form>
            ) : order.rail === 'stripe' ? (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                {en
                  ? 'Complete the payment on the Stripe page that was opened. This page updates once payment is confirmed.'
                  : 'Selesaikan pembayaran di halaman Stripe yang terbuka. Halaman ini akan berubah setelah pembayaran terkonfirmasi.'}
              </p>
            ) : (
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                {qrisNote ?? (en ? 'Payment is unavailable.' : 'Pembayaran tidak tersedia.')}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
