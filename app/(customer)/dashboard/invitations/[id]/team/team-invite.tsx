'use client';

import { useActionState, useState } from 'react';
import { Check, Copy, MessageCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { JOIN_LINK_TTL_DAYS, LABEL_MAX_CHARS, MEMBER_ROLES, ROLE_COPY, type MemberRole } from '@/lib/invitation/members';
import { createTeamLink, type CreateLinkState } from './actions';

const INITIAL: CreateLinkState = { status: 'idle' };

/** G-044 (D-057): the owner picks a role and names who the link is for; the new link is shown once, to copy or send. */
export function TeamInvite({ invitationId }: { invitationId: number }) {
  const [state, action, pending] = useActionState(createTeamLink, INITIAL);
  const [role, setRole] = useState<MemberRole>('usher');
  const [copied, setCopied] = useState(false);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="team-invite-title" className="flex flex-col gap-5 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 id="team-invite-title" className="font-bold text-slate-900">
          Ajak anggota tim
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Buat tautan untuk satu orang. Tautan berlaku {JOIN_LINK_TTL_DAYS} hari, hanya bisa dipakai satu akun, dan hanya ditampilkan sekali.
        </p>
      </div>

      <form action={action} onSubmit={() => setCopied(false)} className="flex flex-col gap-5">
        <input type="hidden" name="invitationId" value={invitationId} />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-semibold text-slate-800">Peran</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {MEMBER_ROLES.map((value) => {
              const copyFor = ROLE_COPY[value];
              const checked = role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700 ${checked ? 'border-brand-700 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="role" value={value} checked={checked} onChange={() => setRole(value)} className="h-4 w-4 accent-brand-700" />
                    <span className="font-bold text-slate-900">{copyFor.name}</span>
                  </span>
                  <span className="text-sm leading-6 text-slate-600">{copyFor.summary}</span>
                  <ul className="flex flex-col gap-1.5 text-xs leading-5 text-slate-700">
                    {copyFor.can.map((line) => (
                      <li key={line} className="flex gap-2">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                    {copyFor.cannot.map((line) => (
                      <li key={line} className="flex gap-2 text-slate-500">
                        <ShieldX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                        <span>
                          <span className="sr-only">Tidak termasuk: </span>
                          {line}
                        </span>
                      </li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Untuk siapa tautan ini</span>
          <input
            name="label"
            required
            maxLength={LABEL_MAX_CHARS}
            placeholder="Contoh: Rina, meja tamu pria"
            autoComplete="off"
            className="h-11 rounded-lg border px-3 text-sm outline-none focus:border-brand-700"
          />
          <span className="text-xs text-slate-500">Hanya Anda yang melihat catatan ini.</span>
        </label>

        <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-fit">
          {pending ? 'Membuat tautan…' : 'Buat tautan'}
        </button>
      </form>

      <div aria-live="polite">
        {state.status === 'error' && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {state.message}
          </p>
        )}
        {state.status === 'created' && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Tautan {ROLE_COPY[state.role].name} untuk {state.label} siap. Kirim sekarang: tautan ini tidak bisa ditampilkan lagi.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Tautan bergabung</span>
              <input readOnly value={state.url} onFocus={(event) => event.currentTarget.select()} className="h-11 rounded-lg border border-emerald-300 bg-white px-3 font-mono text-xs text-slate-800" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(state.url)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-900">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Tersalin' : 'Salin tautan'}
              </button>
              <a href={state.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Kirim lewat WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
