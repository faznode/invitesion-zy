import { randomUUID } from 'node:crypto';
import {
  GIFT_KINDS,
  GIFT_KIND_LABEL,
  GIFT_NOTE_MAX,
  GIVER_MAX,
  rupiah,
  sideTotals,
  wib,
  type FamilySide,
  type GiftLogRow,
  type GuestLogRow,
} from '@/lib/invitation/host-logs';
import { deleteGiftAction, recordGiftAction, updateGiftAction } from './actions';

const field = 'h-11 rounded-lg border px-3 text-sm outline-none focus:border-brand-700';

/** I-04 (D-059): whether this invitation has two families (a wedding), their labels and the couple's order. */
export type GiftSides = { applies: boolean; labels: Record<FamilySide, string>; order: FamilySide[] };

function SideSelect({ sides, defaultValue, compact = false }: { sides: GiftSides; defaultValue: FamilySide | null; compact?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={compact ? 'text-xs font-semibold text-slate-700' : 'text-sm font-semibold text-slate-800'}>Pihak keluarga{compact ? '' : ' (opsional)'}</span>
      <select name="side" defaultValue={defaultValue ?? ''} className={`${field} bg-white`}>
        <option value="">Belum ditentukan</option>
        {sides.order.map((side) => (
          <option key={side} value={side}>
            {sides.labels[side]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * G-045 (D-058): the private gift log. Each render of the form carries a fresh one-time key, so a double tap or a
 * resend of one submission records one entry. I-04 (D-059): on a wedding each entry can be attributed to either family,
 * with a total per family; entries recorded before stay unattributed until the owner chooses.
 */
export function GiftsSection({ invitationId, gifts, guests, sides }: { invitationId: number; gifts: GiftLogRow[]; guests: GuestLogRow[]; sides: GiftSides }) {
  const showSides = sides.applies || gifts.some((gift) => gift.side !== null);
  return (
    <section id="kado" aria-labelledby="gifts-title" className="flex scroll-mt-6 flex-col gap-4 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 id="gifts-title" className="font-bold text-slate-900">
          Catatan kado
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Catat amplop, kado, atau transfer yang Anda terima. Nominal boleh dikosongkan. Hanya Anda yang melihat catatan ini.
          {sides.applies ? ' Pilih pihak keluarga bila kado ditujukan untuk keluarga mempelai wanita atau pria.' : ''}
        </p>
      </div>

      {showSides && gifts.length > 0 && (
        <dl aria-label="Kado per pihak keluarga" className="grid gap-3 sm:grid-cols-3">
          {sideTotals(gifts, sides.order).map((total) => (
            <div key={total.side ?? 'none'} className="flex flex-col gap-1 rounded-lg border bg-slate-50 p-3">
              <dt className="text-xs font-semibold text-slate-600">{total.side ? sides.labels[total.side] : 'Belum ditentukan'}</dt>
              <dd className="text-sm font-bold text-slate-900">
                {total.gifts} catatan{total.noted ? ` · ${rupiah(total.amount)}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <form action={recordGiftAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="requestKey" value={randomUUID()} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Dari tamu</span>
          <select name="guestId" defaultValue="" className={`${field} bg-white`}>
            <option value="">Bukan tamu di daftar</option>
            {guests.map((guest) => (
              <option key={guest.guestId} value={guest.guestId}>
                {guest.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Nama pemberi</span>
          <input name="giverName" maxLength={GIVER_MAX} placeholder="Wajib bila bukan tamu di daftar" autoComplete="off" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Jenis</span>
          <select name="kind" defaultValue="envelope" className={`${field} bg-white`}>
            {GIFT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GIFT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Nominal (Rp, opsional)</span>
          <input name="amount" inputMode="numeric" placeholder="Contoh: 500.000" autoComplete="off" className={field} />
        </label>
        {sides.applies && <SideSelect sides={sides} defaultValue={null} />}
        <label className={`flex flex-col gap-1.5 ${sides.applies ? '' : 'sm:col-span-2'}`}>
          <span className="text-sm font-semibold text-slate-800">Catatan (opsional)</span>
          <input name="note" maxLength={GIFT_NOTE_MAX} placeholder="Contoh: set piring, titip lewat Budi" autoComplete="off" className={field} />
        </label>
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800 sm:w-fit">Catat kado</button>
      </form>

      {gifts.length ? (
        <ul className="divide-y rounded-lg border">
          {gifts.map((gift) => (
            <li key={gift.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span dir="auto" className="break-words font-bold text-slate-900">
                  {gift.giverName}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{GIFT_KIND_LABEL[gift.kind]}</span>
                {showSides && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${gift.side ? 'bg-brand-50 text-brand-800' : 'border border-dashed text-slate-600'}`}>
                    {gift.side ? sides.labels[gift.side] : 'Pihak belum ditentukan'}
                  </span>
                )}
                <span className="text-sm font-semibold text-slate-800">{rupiah(gift.amount)}</span>
                <span className="text-xs text-slate-600">{wib(gift.receivedAt)} WIB</span>
              </div>
              {gift.note && (
                <p dir="auto" className="break-words text-sm leading-6 text-slate-700">
                  {gift.note}
                </p>
              )}
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-bold text-brand-800">
                  Ubah<span className="sr-only">: kado dari {gift.giverName}</span>
                </summary>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <form action={updateGiftAction} className={`grid flex-1 gap-2 ${sides.applies ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-4'}`}>
                    <input type="hidden" name="invitationId" value={invitationId} />
                    <input type="hidden" name="giftId" value={gift.id} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-700">Pemberi</span>
                      <input name="giverName" required maxLength={GIVER_MAX} defaultValue={gift.giverName} className={field} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-700">Jenis</span>
                      <select name="kind" defaultValue={gift.kind} className={`${field} bg-white`}>
                        {GIFT_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {GIFT_KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-700">Nominal (Rp)</span>
                      <input name="amount" inputMode="numeric" defaultValue={gift.amount ?? ''} className={field} />
                    </label>
                    {sides.applies && <SideSelect sides={sides} defaultValue={gift.side} compact />}
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-700">Catatan</span>
                      <input name="note" maxLength={GIFT_NOTE_MAX} defaultValue={gift.note ?? ''} className={field} />
                    </label>
                    <button className={`min-h-11 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:w-fit ${sides.applies ? 'sm:col-span-2 lg:col-span-5' : 'sm:col-span-4'}`}>
                      Simpan perubahan
                    </button>
                  </form>
                  <form action={deleteGiftAction}>
                    <input type="hidden" name="invitationId" value={invitationId} />
                    <input type="hidden" name="giftId" value={gift.id} />
                    <button className="min-h-11 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 hover:bg-rose-50">
                      Hapus<span className="sr-only">: kado dari {gift.giverName}</span>
                    </button>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">Belum ada catatan kado.</p>
      )}
    </section>
  );
}
