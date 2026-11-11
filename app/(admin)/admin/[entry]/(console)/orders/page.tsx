import { desc } from 'drizzle-orm';
import { CheckCircle2, QrCode, CreditCard, XCircle } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { orders } from '@/lib/db/schema';
import { assertAuthorizedAdmin } from '@/lib/auth/admin-access';
import { formatMoney, isCurrency, money } from '@/lib/payment/money';
import { railStatus } from '@/lib/payment/registry';
import { closeOrderUnpaid, confirmOrderPaid } from './actions';

export const dynamic = 'force-dynamic';

type Search = { confirmed?: string; activated?: string; closed?: string; notice?: string; error?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  assertAuthorizedAdmin(await getUser());
  const feedback = await searchParams;

  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));

  // Surfaced rather than assumed: an operator needs to know whether QRIS orders
  // will settle on their own or are waiting on them.
  const qris = railStatus('qris');
  const stripe = railStatus('stripe');

  return (
    <section className="p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-medium text-brand-700">Transaksi</p>
        <h1 className="mt-1 text-2xl font-semibold">Pesanan &amp; Pembayaran</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          QRIS untuk pembayaran lokal (IDR), Stripe untuk internasional.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <RailCard icon={<QrCode className="h-4 w-4" />} label="QRIS · lokal (IDR)" status={qris} />
          <RailCard icon={<CreditCard className="h-4 w-4" />} label="Stripe · internasional" status={stripe} />
        </div>

        <Feedback feedback={feedback} />

        <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-[56rem] w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Referensi</th>
                <th className="px-5 py-3 font-medium">Jalur</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium">Nominal</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Dibuat</th>
                <th className="px-5 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const currency = isCurrency(row.currency) ? row.currency : 'IDR';
                const awaitingManual = row.status === 'PENDING' && row.rail === 'qris';
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-mono text-xs font-medium">{row.reference}</td>
                    <td className="px-5 py-4 uppercase text-muted-foreground">{row.rail}</td>
                    <td className="px-5 py-4 text-muted-foreground">{row.tier || '—'}</td>
                    <td className="px-5 py-4">
                      {formatMoney(money(row.amount, currency), 'id')}
                      {row.listAmount !== null && (
                        <span className="block text-xs text-muted-foreground">
                          kupon · dari {formatMoney(money(row.listAmount, currency), 'id')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          row.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700'
                            : row.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{row.createdAt.toLocaleDateString('id-ID')}</td>
                    <td className="px-5 py-4">
                      {awaitingManual ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={confirmOrderPaid}>
                            <input type="hidden" name="reference" value={row.reference} />
                            <button
                              type="submit"
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                              Tandai lunas
                            </button>
                          </form>
                          {/* G-053: an abandoned manual order would otherwise hold its coupon redemption for good. */}
                          <form action={closeOrderUnpaid}>
                            <input type="hidden" name="reference" value={row.reference} />
                            <button
                              type="submit"
                              aria-label={`Tutup tanpa bayar: order ${row.reference}`}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                              Tutup tanpa bayar
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-12 text-center text-sm text-muted-foreground">Belum ada order.</p>}
        </div>
      </div>
    </section>
  );
}

function RailCard({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: { available: true; note?: string } | { available: false; reason: string };
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-brand-600">{icon}</span>
        {label}
      </div>
      {status.available ? (
        <>
          <p className="mt-2 text-xs font-medium text-emerald-700">Aktif</p>
          {status.note && <p className="mt-1 text-[11px] leading-5 text-amber-700">{status.note}</p>}
        </>
      ) : (
        <p className="mt-2 text-[11px] leading-5 text-rose-700">Tidak aktif — {status.reason}</p>
      )}
    </div>
  );
}

function Feedback({ feedback }: { feedback: Search }) {
  if (feedback.confirmed) {
    return (
      <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Order {feedback.confirmed} ditandai lunas.{' '}
        {feedback.activated === '0'
          ? 'Undangan terkait tidak diterbitkan otomatis (sudah tayang, dihapus, atau temanya berbeda); pemilik bisa menerbitkannya.'
          : 'Undangan terkait diterbitkan.'}
      </p>
    );
  }
  if (feedback.closed) {
    return (
      <p role="status" className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
        Order {feedback.closed} ditutup tanpa pembayaran. Kupon yang dipakainya kembali tersedia, dan customer bisa memulai
        pembayaran baru. Kalau transfernya ternyata masuk, order ini tidak lagi bisa ditandai lunas: tangani manual.
      </p>
    );
  }
  if (feedback.error === 'unconfirmed') {
    return (
      <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Hasilnya belum terkonfirmasi. Muat ulang daftar ini; kalau order masih tertunda, konfirmasi sekali lagi (aman, tidak tercatat ganda).
      </p>
    );
  }
  if (feedback.error === 'rail') {
    return (
      <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Jalur pembayaran tidak cocok dengan order. Tidak ditandai lunas — periksa manual.
      </p>
    );
  }
  if (feedback.notice === 'duplicate' || feedback.notice === 'already-final') {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        Order itu sudah diproses sebelumnya. Tidak ada perubahan.
      </p>
    );
  }
  if (feedback.error === 'amount') {
    return (
      <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Nominal tidak cocok dengan order. Tidak ditandai lunas — periksa manual.
      </p>
    );
  }
  if (feedback.error) {
    return (
      <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Aksi itu tidak bisa diselesaikan.
      </p>
    );
  }
  return null;
}
