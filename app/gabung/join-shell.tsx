import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { ROLE_COPY, type MemberRole } from '@/lib/invitation/members';

/** The join pages' frame: Indonesian copy whatever the visitor's locale, as on the wizard. */
export function JoinShell({ children }: { children: ReactNode }) {
  return (
    <div lang="id" className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-3">
          <Wordmark size="sm" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">{children}</main>
    </div>
  );
}

/** What the role allows and withholds, so the visitor knows what they accept before they accept it. */
export function RoleSummary({ role, slug }: { role: MemberRole; slug: string }) {
  const copy = ROLE_COPY[role];
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Undangan</p>
        <p className="break-words text-base font-semibold text-foreground">/{slug}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peran</p>
        <p className="text-base font-semibold text-foreground">{copy.name}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.summary}</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {copy.can.map((line) => (
          <li key={line} className="flex gap-2 text-foreground">
            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
        {copy.cannot.map((line) => (
          <li key={line} className="flex gap-2 text-muted-foreground">
            <Minus className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="sr-only">Tidak termasuk: </span>
              {line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JoinMessage({ title, body, cta = { href: '/dashboard', label: 'Buka dasbor' } }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">{title}</h1>
      <p className="text-pretty leading-relaxed text-muted-foreground">{body}</p>
      <Link href={cta.href} className="w-fit rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:bg-muted">
        {cta.label}
      </Link>
    </div>
  );
}

export const JOIN_REFUSALS: Record<'invalid' | 'owner' | 'member' | 'admin', { title: string; body: string }> = {
  invalid: {
    title: 'Tautan ini tidak berlaku',
    body: 'Tautan bergabung hanya bisa dipakai satu akun, berlaku 7 hari, dan bisa dibatalkan pemilik undangan. Minta tautan baru kepada pemilik undangan.',
  },
  owner: { title: 'Ini undangan Anda sendiri', body: 'Pemilik undangan sudah memegang semua akses, jadi tidak perlu bergabung dengan timnya.' },
  member: {
    title: 'Anda sudah ada di tim ini',
    body: 'Akun ini sudah memegang peran di undangan tersebut. Bila perlu peran lain, minta pemilik undangan mencabut akses lama lebih dulu.',
  },
  admin: { title: 'Akun administrator tidak bisa bergabung', body: 'Masuk dengan akun pelanggan untuk bergabung dengan tim sebuah undangan.' },
};
