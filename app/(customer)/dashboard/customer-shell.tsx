'use client';

import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import { useModalDrawer } from '@/components/dashboard/use-modal-drawer';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Briefcase, FileText, LayoutDashboard, LogOut, Mail, Menu, Palette, ReceiptText, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { useClerk } from '@clerk/nextjs';
import type { Locale } from '@/lib/i18n';


type CustomerShellProps = {
  children: React.ReactNode;
  locale: Locale;
  user: { name: string | null; email: string; avatarUrl: string | null } | null;
  /** G-050: `FLAG_RECEIPTS`, read on the server by the layout. */
  receiptsEnabled?: boolean;
  /** G-052: `FLAG_WORKSPACES`, read on the server by the layout. */
  workspacesEnabled?: boolean;
};

export function CustomerShell({ children, locale, user, receiptsEnabled = false, workspacesEnabled = false }: CustomerShellProps) {
  const path = usePathname();
  const router = useRouter();
  const clerk = useClerk();
  const en = locale === 'en';
  const [open, setOpen] = useState(false);

  const items: ReadonlyArray<readonly [string, LucideIcon, string]> = [
    ['/dashboard', LayoutDashboard, en ? 'Overview' : 'Ringkasan'],
    ['/dashboard/invitations', FileText, en ? 'My invitations' : 'Undangan saya'],
    ['/dashboard/guests', Users, en ? 'Guests & RSVP' : 'Tamu & RSVP'],
    ['/dashboard/templates', Palette, en ? 'Choose a theme' : 'Pilih tema'],
    ...(receiptsEnabled ? [['/dashboard/receipts', ReceiptText, en ? 'Receipts' : 'Kuitansi'] as const] : []),
    ...(workspacesEnabled ? [['/dashboard/workspace', Briefcase, en ? 'Workspace' : 'Ruang kerja'] as const] : []),
  ];
  const displayName = user?.name?.trim() || user?.email || (en ? 'Your account' : 'Akun kamu');
  const initials = displayName.slice(0, 1).toUpperCase();
  const profileActive = path === '/dashboard/profile';

  // Focus, Escape, the scroll lock and the page's inertness while the phone drawer is open.
  const drawer = useModalDrawer(open, setOpen);

  // Close the drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [path]);

  const avatar = (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-xs font-bold text-brand-700">
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );

  const nav = (
    <nav aria-label={en ? 'Main navigation' : 'Navigasi utama'} className="flex flex-col gap-1">
      {items.map(([href, Icon, label]) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'}`} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900">
      <Link
        href="/dashboard/profile"
        aria-current={profileActive ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${profileActive ? 'bg-white ring-1 ring-brand-200 dark:bg-slate-800 dark:ring-brand-800' : 'hover:bg-white dark:hover:bg-slate-800'}`}
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{displayName}</span>
          <span className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400"><Mail className="h-3 w-3 shrink-0" aria-hidden />{en ? 'Profile & account' : 'Profil & akun'}</span>
        </span>
        <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </Link>
      <button
        // Clerk clears its own session and cookies; `redirectUrl` lets it finish
        // teardown before navigating, which a manual router.push would race.
        onClick={() => clerk.signOut({ redirectUrl: '/sign-in' })}
        className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {en ? 'Sign out' : 'Keluar'}
      </button>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:px-2 lg:py-1.5">
      <Wordmark href={null} size="sm" />
    </Link>
  );

  return (
    <div data-app-shell="customer" className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] print:block print:min-h-0 print:bg-white">
      {/* Mobile top bar with burger */}
      <header inert={open} className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden print:hidden">
        <button
          ref={drawer.triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={en ? 'Open menu' : 'Buka menu'}
          aria-expanded={open}
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span aria-hidden className="flex-1" />
        <Link href="/dashboard/profile" aria-label={en ? 'Profile & account' : 'Profil & akun'} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          {avatar}
        </Link>
      </header>

      {/* Desktop sidebar */}
      <aside inert={open} className="hidden min-h-dvh flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-950 lg:flex print:hidden">
        <div className="mb-8">{brand}</div>
        {nav}
        <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">{account}</div>
      </aside>

      {/* Mobile drawer */}
      {/* Closed, the drawer is inert: aria-hidden alone left its links in the tab order (axe aria-hidden-focus, s34). */}
      <div className={`fixed inset-0 z-40 lg:hidden print:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open} inert={!open}>
        <div
          onClick={drawer.close}
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={en ? 'Menu' : 'Menu'}
          className={`absolute inset-y-0 left-0 flex w-[17rem] max-w-[82%] flex-col border-r border-slate-200 bg-white px-4 py-4 shadow-xl transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-slate-950 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="mb-6 flex items-center justify-between">
            {brand}
            <button
              ref={drawer.initialFocusRef}
              type="button"
              onClick={drawer.close}
              aria-label={en ? 'Close menu' : 'Tutup menu'}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {nav}
          <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">{account}</div>
        </div>
      </div>

      <main inert={open} className="min-w-0">{children}</main>
    </div>
  );
}
