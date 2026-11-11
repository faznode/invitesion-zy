import { ClipboardList } from 'lucide-react';
import type { GuestRegistration } from '@/lib/db/schema';

type Action = (formData: FormData) => Promise<void>;

/**
 * B-033: the host's self-registration link and the queue of requests waiting for a decision. Server-rendered forms
 * only; the actions go through the roster writer. A rejected request is deleted, an approved one becomes a guest.
 */
export function RegistrationPanel({
  invitationId,
  url,
  pending,
  linkAction,
  decisionAction,
}: {
  invitationId: number;
  /** The open link (`<origin>/daftar/<token>`), or null while registration is closed. */
  url: string | null;
  pending: GuestRegistration[];
  linkAction: Action;
  decisionAction: Action;
}) {
  return (
    <section id="pendaftaran" aria-labelledby="pendaftaran-judul" className="rounded-xl border bg-white p-5">
      <h2 id="pendaftaran-judul" className="flex items-center gap-2 font-bold">
        <ClipboardList className="h-5 w-5 text-brand-600" aria-hidden="true" />
        Pendaftaran mandiri
      </h2>
      <p className="mt-1 max-w-2xl text-pretty text-sm leading-relaxed text-slate-500">
        Bagikan link pendaftaran agar tamu bisa mendaftar sendiri. Permintaan menunggu persetujuan Anda: yang disetujui masuk daftar tamu,
        yang ditolak dihapus.
      </p>
      {url ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="block text-xs font-semibold text-slate-700">
            Link pendaftaran
            <input readOnly value={url} className="mt-1.5 h-10 w-full rounded-lg border bg-slate-50 px-3 font-mono text-xs text-slate-800" />
          </label>
          <div className="flex flex-wrap gap-2">
            <LinkForm invitationId={invitationId} action="rotate" label="Ganti link (link lama berhenti)" linkAction={linkAction} />
            <LinkForm invitationId={invitationId} action="close" label="Tutup pendaftaran" linkAction={linkAction} />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <LinkForm invitationId={invitationId} action="open" label="Buka pendaftaran" linkAction={linkAction} primary />
        </div>
      )}
      <h3 className="mt-6 text-sm font-bold text-slate-900">Menunggu persetujuan ({pending.length})</h3>
      {pending.length ? (
        <ul className="mt-3 divide-y rounded-lg border">
          {pending.map((registration) => (
            <li key={registration.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{registration.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {registration.phone || 'Tanpa nomor'} · {registration.guestCount} orang · {registration.createdAt.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex gap-2">
                <DecisionForm invitationId={invitationId} registrationId={registration.id} decision="approve" decisionAction={decisionAction} />
                <DecisionForm invitationId={invitationId} registrationId={registration.id} decision="reject" decisionAction={decisionAction} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Belum ada permintaan.</p>
      )}
    </section>
  );
}

function LinkForm({ invitationId, action, label, linkAction, primary }: { invitationId: number; action: 'open' | 'rotate' | 'close'; label: string; linkAction: Action; primary?: boolean }) {
  return (
    <form action={linkAction}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="action" value={action} />
      <button
        className={
          primary
            ? 'min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white'
            : 'min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50'
        }
      >
        {label}
      </button>
    </form>
  );
}

function DecisionForm({ invitationId, registrationId, decision, decisionAction }: { invitationId: number; registrationId: number; decision: 'approve' | 'reject'; decisionAction: Action }) {
  return (
    <form action={decisionAction}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="decision" value={decision} />
      <button
        className={
          decision === 'approve'
            ? 'min-h-10 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white'
            : 'min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50'
        }
      >
        {decision === 'approve' ? 'Setujui' : 'Tolak'}
      </button>
    </form>
  );
}
