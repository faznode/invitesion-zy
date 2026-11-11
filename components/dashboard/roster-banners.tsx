type Query = {
  imported?: string;
  skipped?: string;
  batch?: string;
  undone?: string;
  kept?: string;
  registration?: string;
  approved?: string;
  rejected?: string;
};

const count = (value: string | undefined) => (value && /^\d+$/.test(value) ? Number(value).toLocaleString('id-ID') : null);
const STATUS = 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700';

/** B-033: the guest list's notices after an import, its undo, a registration-link change or a decision. */
export function RosterBanners({ q, invitationId, undo }: { q: Query; invitationId: number; undo: (formData: FormData) => Promise<void> }) {
  const imported = count(q.imported);
  const skipped = count(q.skipped);
  const undone = count(q.undone);
  const kept = count(q.kept);
  const registration = { open: 'Pendaftaran dibuka.', rotate: 'Link pendaftaran diganti; link lama tidak berlaku lagi.', close: 'Pendaftaran ditutup.' }[q.registration ?? ''];
  return (
    <>
      {imported !== null && (
        <div role="status" className={`${STATUS} flex flex-wrap items-center gap-3`}>
          <span>
            {imported} tamu diimpor{skipped && skipped !== '0' ? `, ${skipped} baris dilewati` : ''}.
          </span>
          {q.batch && (
            <form action={undo}>
              <input type="hidden" name="invitationId" value={invitationId} />
              <input type="hidden" name="batchId" value={q.batch} />
              <button className="min-h-10 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                Batalkan impor ini
              </button>
            </form>
          )}
        </div>
      )}
      {undone !== null && (
        <p role="status" className={STATUS}>
          Impor dibatalkan: {undone} tamu dihapus
          {kept && kept !== '0' ? `, ${kept} tamu tetap disimpan karena sudah dikirimi, membuka, menjawab, check-in, atau menulis ucapan` : ''}.
        </p>
      )}
      {registration && (
        <p role="status" className={STATUS}>
          {registration}
        </p>
      )}
      {q.approved && (
        <p role="status" className={STATUS}>
          Permintaan disetujui; tamu masuk daftar.
        </p>
      )}
      {q.rejected && (
        <p role="status" className={STATUS}>
          Permintaan ditolak dan datanya dihapus.
        </p>
      )}
    </>
  );
}
