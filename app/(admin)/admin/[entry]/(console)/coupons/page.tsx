import { TicketPercent } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin } from '@/lib/auth/admin-access';
import { isFlagOn } from '@/lib/flags';
import { listCouponsWithUsage, type CouponListing } from '@/lib/payment/coupon-admin';
import { formatMoney, isCurrency, money } from '@/lib/payment/money';
import { createCouponAction, disableCouponAction, setCouponActiveAction } from './actions';

export const dynamic = 'force-dynamic';

type Search = { created?: string; activated?: string; paused?: string; disabled?: string; error?: string };

const ERRORS: Record<string, string> = {
  code: 'Kode harus 3–32 karakter: huruf, angka atau tanda hubung.',
  kind: 'Pilih jenis diskon.',
  percent: 'Persentase harus bilangan bulat 1–99.',
  amount: 'Nominal tidak valid (rupiah tanpa desimal; dolar paling banyak dua desimal).',
  currency: 'Pilih mata uang untuk diskon nominal.',
  tier: 'Paket tidak dikenal.',
  window: 'Periode tidak valid: waktu mulai harus sebelum waktu berakhir.',
  max: 'Kuota harus bilangan bulat 1 atau lebih, atau dikosongkan.',
  per_customer: 'Batas per customer harus bilangan bulat 1 atau lebih.',
  partner: 'Nama mitra paling banyak 64 karakter: huruf, angka, spasi dan . , & @ _ \' -',
  duplicate: 'Kode itu sudah dipakai kupon lain (termasuk kupon yang dinonaktifkan).',
  notfound: 'Kupon tidak ditemukan atau sudah dinonaktifkan permanen.',
};

const wib = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

function discountLabel(row: CouponListing): string {
  if (row.kind === 'percent') return `${row.percentOff}%`;
  const currency = row.currency && isCurrency(row.currency) ? row.currency : 'IDR';
  return formatMoney(money(row.amountOff ?? 0, currency), 'id');
}

function paidRevenueLabel(row: CouponListing): string | null {
  const parts = [
    row.paidIdr > 0 ? formatMoney(money(row.paidIdr, 'IDR'), 'id') : null,
    row.paidUsd > 0 ? formatMoney(money(row.paidUsd, 'USD'), 'id') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `${parts.join(' + ')} dibayar lewat kode ini` : null;
}

function windowLabel(row: CouponListing): string {
  if (!row.startsAt && !row.endsAt) return 'Tanpa batas waktu';
  const from = row.startsAt ? wib.format(row.startsAt) : '…';
  const to = row.endsAt ? wib.format(row.endsAt) : '…';
  return `${from} – ${to} WIB`;
}

function StatusBadge({ row }: { row: CouponListing }) {
  const [label, tone] = row.disabledAt
    ? ['Nonaktif permanen', 'bg-slate-100 text-slate-600']
    : row.active
      ? ['Aktif', 'bg-emerald-50 text-emerald-800']
      : ['Belum aktif', 'bg-amber-50 text-amber-800'];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

function Feedback({ feedback }: { feedback: Search }) {
  if (feedback.error) {
    return (
      <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {ERRORS[feedback.error] ?? 'Permintaan tidak bisa diproses.'}
      </p>
    );
  }
  const message = feedback.created
    ? `Kupon ${feedback.created} dibuat dalam keadaan belum aktif. Aktifkan bila sudah siap.`
    : feedback.activated
      ? 'Kupon diaktifkan.'
      : feedback.paused
        ? 'Kupon dijeda. Pesanan yang sudah dibuat tetap dengan nominalnya.'
        : feedback.disabled
          ? 'Kupon dinonaktifkan permanen. Kodenya tidak bisa dipakai lagi.'
          : null;
  if (!message) return null;
  return (
    <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {message}
    </p>
  );
}

const field = 'mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500';
const label = 'text-sm font-medium text-slate-800';

function CreateForm() {
  return (
    <form action={createCouponAction} className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Buat kupon</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Kupon baru selalu belum aktif. Diskon dihitung di server dari harga paket; customer hanya memasukkan kodenya.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={label}>Kode</label>
          <input id="code" name="code" required maxLength={32} autoComplete="off" spellCheck={false} className={`${field} font-mono uppercase`} />
        </div>
        <fieldset>
          <legend className={label}>Jenis diskon</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-800">
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="percent" defaultChecked /> Persentase</label>
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="fixed" /> Nominal</label>
          </div>
        </fieldset>
        <div>
          <label htmlFor="percent" className={label}>Persentase (1–99, untuk jenis persentase)</label>
          <input id="percent" name="percent" inputMode="numeric" className={field} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <div>
            <label htmlFor="amount" className={label}>Nominal (untuk jenis nominal)</label>
            <input id="amount" name="amount" inputMode="decimal" className={field} />
          </div>
          <div>
            <label htmlFor="currency" className={label}>Mata uang</label>
            <select id="currency" name="currency" defaultValue="IDR" className={field}>
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="tier" className={label}>Paket</label>
          <select id="tier" name="tier" defaultValue="" className={field}>
            <option value="">Semua paket</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label htmlFor="maxRedemptions" className={label}>Kuota pemakaian (kosong = tanpa batas)</label>
          <input id="maxRedemptions" name="maxRedemptions" inputMode="numeric" className={field} />
        </div>
        <div>
          <label htmlFor="startsAt" className={label}>Mulai berlaku (WIB, opsional)</label>
          <input id="startsAt" name="startsAt" type="datetime-local" className={field} />
        </div>
        <div>
          <label htmlFor="endsAt" className={label}>Berakhir (WIB, opsional)</label>
          <input id="endsAt" name="endsAt" type="datetime-local" className={field} />
        </div>
        <div>
          <label htmlFor="perCustomer" className={label}>Batas per customer</label>
          <input id="perCustomer" name="perCustomer" inputMode="numeric" defaultValue="1" className={field} />
        </div>
        <div>
          <label htmlFor="partner" className={label}>Mitra afiliasi (opsional)</label>
          <input id="partner" name="partner" maxLength={64} autoComplete="off" aria-describedby="partnerHelp" className={field} />
          <p id="partnerHelp" className="mt-1.5 text-xs leading-5 text-slate-600">
            Hanya tampil di konsol, untuk mencatat pemakaian kode milik mitra. Komisi dan pembayarannya diatur di luar sistem.
          </p>
        </div>
        <label className="flex items-start gap-2 self-end text-sm text-slate-800">
          <input type="checkbox" name="stackable" className="mt-1" />
          <span>Boleh digabung dengan kupon lain yang juga boleh digabung</span>
        </label>
      </div>
      <button type="submit" className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">
        Buat kupon (belum aktif)
      </button>
    </form>
  );
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<Search> }) {
  assertAuthorizedAdmin(await getUser());
  const feedback = await searchParams;
  const rows = await listCouponsWithUsage();
  const enabled = isFlagOn('COUPONS');

  return (
    <section className="p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-medium text-brand-700">Transaksi</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
          <TicketPercent className="h-6 w-6 text-brand-700" aria-hidden />
          Kupon
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Satu pemakaian dihitung selama pesanannya lunas, atau masih menunggu dan belum lewat batas bayar. Pesanan yang
          gagal atau kedaluwarsa mengembalikan kuotanya. QRIS manual tidak punya batas bayar: pesanannya memegang kuota
          sampai ditandai lunas atau ditutup tanpa pembayaran di halaman Pesanan.
        </p>
        <p className={`mt-3 inline-flex rounded-lg px-3 py-2 text-sm ${enabled ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {enabled
            ? 'Kolom kupon tampil di halaman pembayaran (FLAG_COUPONS on).'
            : 'Kolom kupon belum tampil di halaman pembayaran (FLAG_COUPONS off). Kupon bisa disiapkan lebih dulu.'}
        </p>

        <Feedback feedback={feedback} />
        <CreateForm />

        <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">Daftar kupon</caption>
            <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Kode</th>
                <th scope="col" className="px-5 py-3 font-medium">Diskon</th>
                <th scope="col" className="px-5 py-3 font-medium">Berlaku</th>
                <th scope="col" className="px-5 py-3 font-medium">Pemakaian</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">Belum ada kupon.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-semibold">{row.code}</span>
                    {row.partner && <span className="block text-xs text-muted-foreground">Mitra: {row.partner}</span>}
                  </td>
                  <td className="px-5 py-4">
                    {discountLabel(row)}
                    <span className="block text-xs text-muted-foreground">
                      {row.tier ? `Paket ${row.tier}` : 'Semua paket'}
                      {row.stackable ? ' · bisa digabung' : ''}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{windowLabel(row)}</td>
                  <td className="px-5 py-4">
                    {row.live}
                    {row.maxRedemptions !== null ? ` / ${row.maxRedemptions}` : ''} terpakai
                    <span className="block text-xs text-muted-foreground">
                      {row.paid} lunas · maks. {row.perCustomer} per customer
                    </span>
                    {paidRevenueLabel(row) && <span className="block text-xs text-muted-foreground">{paidRevenueLabel(row)}</span>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge row={row} /></td>
                  <td className="px-5 py-4">
                    {row.disabledAt ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <form action={setCouponActiveAction}>
                          <input type="hidden" name="id" value={row.id} />
                          {!row.active && <input type="hidden" name="active" value="on" />}
                          <button type="submit" className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                            {row.active ? 'Jeda' : 'Aktifkan'}
                          </button>
                        </form>
                        <form action={disableCouponAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" aria-label={`Nonaktifkan permanen kupon ${row.code}`} className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50">
                            Nonaktifkan permanen
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
