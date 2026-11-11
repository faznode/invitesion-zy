import { TABLE_CAPACITY_MAX, TABLE_NAME_MAX, type TableUse } from '@/lib/invitation/host-logs';
import { addTableAction, deleteTableAction, importPlanTablesAction, updateTableAction } from './actions';

const field = 'h-11 rounded-lg border px-3 text-sm outline-none focus:border-brand-700';

/**
 * G-045 (D-058): the owner's tables, each with its seated count against its capacity. `planPending` counts the tables
 * planned in the manage centre that the log does not hold yet; the copy action reads them from the stored invitation.
 */
export function TablesSection({ invitationId, tables, planPending }: { invitationId: number; tables: TableUse[]; planPending: number }) {
  return (
    <section id="meja" aria-labelledby="tables-title" className="flex scroll-mt-6 flex-col gap-4 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 id="tables-title" className="font-bold text-slate-900">
          Meja
        </h2>
        <p className="text-sm leading-6 text-slate-600">Buat meja dulu, lalu pilih meja untuk setiap tamu di bawah. Kapasitas boleh dikosongkan.</p>
      </div>

      {planPending > 0 && (
        <form action={importPlanTablesAction} className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center">
          <input type="hidden" name="invitationId" value={invitationId} />
          <p className="flex-1 text-sm leading-6 text-slate-700">
            {planPending} meja dari rencana tempat duduk di control center belum ada di sini.
          </p>
          <button className="min-h-11 rounded-lg border px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">Salin meja dari rencana</button>
        </form>
      )}

      <form action={addTableAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="invitationId" value={invitationId} />
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Nama meja</span>
          <input name="name" required maxLength={TABLE_NAME_MAX} placeholder="Contoh: Meja 1, VIP Keluarga" autoComplete="off" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 sm:w-32">
          <span className="text-sm font-semibold text-slate-800">Kapasitas</span>
          <input name="capacity" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder={`1–${TABLE_CAPACITY_MAX}`} className={field} />
        </label>
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800">Tambah meja</button>
      </form>

      {tables.length ? (
        <ul className="divide-y rounded-lg border">
          {tables.map((table) => (
            <li key={table.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="break-words font-bold text-slate-900">{table.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${table.over ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                  {table.assigned}
                  {table.capacity === null ? ' tamu' : ` / ${table.capacity} kursi`}
                  {table.over ? ' · melebihi kapasitas' : ''}
                </span>
              </p>
              <form action={updateTableAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="invitationId" value={invitationId} />
                <input type="hidden" name="tableId" value={table.id} />
                <label className="flex flex-col gap-1">
                  <span className="sr-only">Nama meja {table.name}</span>
                  <input name="name" required maxLength={TABLE_NAME_MAX} defaultValue={table.name} className={`${field} w-40`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="sr-only">Kapasitas meja {table.name}</span>
                  <input name="capacity" inputMode="numeric" pattern="[0-9]*" maxLength={3} defaultValue={table.capacity ?? ''} placeholder="—" className={`${field} w-20`} />
                </label>
                <button className="min-h-11 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Simpan<span className="sr-only">: {table.name}</span>
                </button>
              </form>
              <form action={deleteTableAction}>
                <input type="hidden" name="invitationId" value={invitationId} />
                <input type="hidden" name="tableId" value={table.id} />
                <button className="min-h-11 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 hover:bg-rose-50">
                  Hapus<span className="sr-only">: {table.name}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">Belum ada meja.</p>
      )}
    </section>
  );
}
