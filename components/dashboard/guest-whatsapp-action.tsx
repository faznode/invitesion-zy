import type { ReactNode } from 'react';
import type { GuestWhatsApp } from '@/lib/invitation/whatsapp';

/**
 * B-018: a guest row's WhatsApp action on every guest list. The link opens WhatsApp with the host's message; a number that
 * cannot be a WhatsApp number shows why instead of a link that would fail; a missing number shows nothing here (the row
 * already says so).
 */
export function GuestWhatsAppAction({ action, en, className, children }: { action: GuestWhatsApp; en: boolean; className: string; children: ReactNode }) {
  if ('href' in action) {
    return (
      <a href={action.href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  if (action.hint === 'missing') return null;
  return (
    <span className="inline-flex min-h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800">
      {en ? 'Invalid WhatsApp number' : 'Nomor WhatsApp tidak valid'}
    </span>
  );
}
