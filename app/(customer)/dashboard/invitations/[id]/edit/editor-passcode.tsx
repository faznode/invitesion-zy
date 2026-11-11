'use client';

import { useId, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

const MIN = 6;
const MAX = 32;
const DATE = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/**
 * G-047 (D-069): the host's guest passcode, saved on its own request (`/api/invitations/<id>/passcode`), never by the
 * content autosave: it is an access setting, not content, so it is neither versioned nor restored. The code is never
 * shown again after saving (only a hash is kept); the host shares it with the guests together with the link.
 */
export function GuestPasscodeChoice({ invitationId, initial }: { invitationId: number; initial: { enabled: boolean; setAt: string | null } }) {
  const inputId = useId();
  const [state, setState] = useState(initial);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const valid = /^[a-z0-9]+$/i.test(code.trim()) && code.trim().length >= MIN && code.trim().length <= MAX;

  async function send(method: 'PUT' | 'DELETE') {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/invitations/${invitationId}/passcode`, {
        method,
        headers: method === 'PUT' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'PUT' ? JSON.stringify({ passcode: code }) : undefined,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ tone: 'error', text: body?.error?.code === 'INVALID_PASSCODE' ? `Kode akses harus ${MIN}–${MAX} huruf atau angka.` : 'Kode akses belum tersimpan. Coba lagi.' });
        return;
      }
      setState({ enabled: body.data.enabled, setAt: body.data.setAt });
      setCode('');
      setMessage({ tone: 'ok', text: method === 'PUT' ? 'Kode akses tersimpan. Bagikan kode ini bersama tautan undangan.' : 'Kode akses dimatikan. Undangan terbuka untuk siapa pun yang punya tautannya.' });
    } catch {
      setMessage({ tone: 'error', text: 'Koneksi terputus. Periksa internet, lalu coba lagi.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <KeyRound className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        {state.enabled ? `Aktif${state.setAt ? ` sejak ${DATE.format(new Date(state.setAt))} WIB` : ''}` : 'Tidak aktif: siapa pun yang punya tautan bisa membuka undangan.'}
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) void send('PUT');
        }}
      >
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-700">
          {state.enabled ? 'Ganti kode akses' : 'Buat kode akses'}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            minLength={MIN}
            maxLength={MAX}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="mis. mawar2027"
            aria-describedby={`${inputId}-hint`}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={!valid || busy}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Simpan kode akses
          </button>
        </div>
        <p id={`${inputId}-hint`} className="text-xs leading-5 text-slate-500">
          {MIN}–{MAX} huruf atau angka; huruf besar atau kecil sama saja. Tamu hanya melihat cover sampai memasukkan kode ini. Kode
          tidak bisa dilihat lagi setelah disimpan.
        </p>
      </form>
      {state.enabled && (
        <button
          type="button"
          onClick={() => void send('DELETE')}
          disabled={busy}
          className="inline-flex min-h-11 w-fit items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
        >
          Matikan kode akses
        </button>
      )}
      <p role="status" className={`min-h-5 text-pretty text-sm leading-5 ${message?.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}
