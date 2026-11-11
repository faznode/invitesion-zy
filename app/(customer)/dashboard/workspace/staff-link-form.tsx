'use client';

import { useActionState } from 'react';
import type { Locale } from '@/lib/i18n';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@/lib/invitation/members';
import { createStaffLinkAction, type StaffLinkState } from './actions';

const INITIAL: StaffLinkState = { status: 'idle' };

const COPY = {
  id: {
    labelField: 'Untuk siapa',
    labelPlaceholder: 'Rina, staf meja tamu',
    roleField: 'Peran',
    submit: 'Buat tautan',
    pending: 'Membuat…',
    createdBefore: 'Tautan untuk',
    createdAs: 'sebagai',
    createdAfter: 'Salin sekarang: tautan ini tidak bisa ditampilkan lagi dan berlaku 7 hari untuk satu akun.',
    urlLabel: 'Tautan bergabung',
    whatsapp: 'Kirim lewat WhatsApp',
  },
  en: {
    labelField: 'For whom',
    labelPlaceholder: 'Rina, guest desk',
    roleField: 'Role',
    submit: 'Create link',
    pending: 'Creating…',
    createdBefore: 'Link for',
    createdAs: 'as',
    createdAfter: 'Copy it now: this link cannot be shown again and works for 7 days, for one account.',
    urlLabel: 'Join link',
    whatsapp: 'Send via WhatsApp',
  },
} as const;

/** G-052 (D-067): the owner makes a one-time staff link; the secret is shown here once and never again. */
export function StaffLinkForm({ locale, roleNames }: { locale: Locale; roleNames: Record<WorkspaceRole, string> }) {
  const [state, action, pending] = useActionState(createStaffLinkAction, INITIAL);
  const copy = COPY[locale];
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="staff-label" className="text-sm font-medium text-foreground">
            {copy.labelField}
          </label>
          <input
            id="staff-label"
            name="label"
            required
            maxLength={60}
            autoComplete="off"
            placeholder={copy.labelPlaceholder}
            className="rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="staff-role" className="text-sm font-medium text-foreground">
            {copy.roleField}
          </label>
          <select id="staff-role" name="role" defaultValue="manager" className="rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground">
            {WORKSPACE_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleNames[role]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? copy.pending : copy.submit}
        </button>
      </form>
      <div aria-live="polite">
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        {state.status === 'created' ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4">
            <p className="text-sm leading-relaxed text-foreground">
              {copy.createdBefore} <strong>{state.label}</strong> {copy.createdAs} {roleNames[state.role]}. {copy.createdAfter}
            </p>
            <label htmlFor="staff-link-url" className="sr-only">
              {copy.urlLabel}
            </label>
            <input
              id="staff-link-url"
              readOnly
              value={state.url}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
            />
            <a
              href={state.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
            >
              {copy.whatsapp}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
