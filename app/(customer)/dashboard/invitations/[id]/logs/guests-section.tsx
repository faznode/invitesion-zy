import { CheckCircle2 } from 'lucide-react';
import { SEAT_MAX, wib, type GuestLogRow, type SeatingTable } from '@/lib/invitation/host-logs';
import { assignSeatAction, souvenirAction } from './actions';
import { GuestFilter } from './guest-filter';

const field = 'h-11 rounded-lg border px-3 text-sm outline-none focus:border-brand-700';

/** G-045 (D-058): each guest's table, seat and souvenir, one small form per change. */
export function GuestsSection({ invitationId, guests, tables, focus }: { invitationId: number; guests: GuestLogRow[]; tables: SeatingTable[]; focus: number | null }) {
  return (
    <section id="tamu" aria-labelledby="guests-title" className="flex scroll-mt-6 flex-col gap-4 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 id="guests-title" className="font-bold text-slate-900">
          Tempat duduk & suvenir
        </h2>
        <p className="text-sm leading-6 text-slate-600">Pilih meja dan kursi setiap tamu, lalu tandai suvenir saat diberikan. Waktu pertama suvenir tetap tercatat.</p>
      </div>

      {guests.length ? (
        <>
          <GuestFilter />
          <ul className="divide-y rounded-lg border">
            {guests.map((guest) => (
              <li
                key={guest.guestId}
                data-guest-row=""
                data-name={guest.name.toLowerCase()}
                className={`flex flex-col gap-3 p-4 xl:flex-row xl:items-center ${focus === guest.guestId ? 'bg-brand-50' : ''}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span dir="auto" className="break-words font-semibold text-slate-900">
                    {guest.name}
                  </span>
                  <span className="text-xs text-slate-600">
                    {[guest.category, guest.checkedInAt ? `Check-in ${wib(guest.checkedInAt)} WIB` : 'Belum check-in'].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <form action={assignSeatAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="invitationId" value={invitationId} />
                  <input type="hidden" name="guestId" value={guest.guestId} />
                  <label className="flex flex-col gap-1">
                    <span className="sr-only">Meja untuk {guest.name}</span>
                    <select name="tableId" defaultValue={guest.tableId ?? ''} className={`${field} w-44 bg-white`}>
                      <option value="">Belum ada meja</option>
                      {tables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="sr-only">Kursi untuk {guest.name}</span>
                    <input name="seat" maxLength={SEAT_MAX} defaultValue={guest.seat ?? ''} placeholder="Kursi" autoComplete="off" className={`${field} w-24`} />
                  </label>
                  <button className="min-h-11 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Simpan<span className="sr-only">: tempat duduk {guest.name}</span>
                  </button>
                </form>
                <form action={souvenirAction} className="flex items-center gap-2">
                  <input type="hidden" name="invitationId" value={invitationId} />
                  <input type="hidden" name="guestId" value={guest.guestId} />
                  <input type="hidden" name="given" value={guest.souvenirAt ? '0' : '1'} />
                  {guest.souvenirAt && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {wib(guest.souvenirAt).slice(11)} WIB
                    </span>
                  )}
                  <button
                    className={`min-h-11 rounded-lg px-3 text-xs font-bold ${guest.souvenirAt ? 'border text-slate-700 hover:bg-slate-50' : 'bg-brand-700 text-white hover:bg-brand-800'}`}
                  >
                    {guest.souvenirAt ? 'Batalkan suvenir' : 'Suvenir diberikan'}
                    <span className="sr-only">: {guest.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-slate-600">Belum ada tamu. Tambahkan tamu di daftar tamu lebih dulu.</p>
      )}
    </section>
  );
}
