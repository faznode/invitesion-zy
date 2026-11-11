'use client';

import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import { useModalDrawer } from '@/components/dashboard/use-modal-drawer';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText, LayoutDashboard, LogOut, Menu, Palette, ReceiptText,
  Settings, ShieldCheck, TicketPercent, UserRound, Users, X,
} from 'lucide-react';
import { useClerk } from '@clerk/nextjs';
import type { Locale } from '@/lib/i18n';


type AdminShellProps = { entry: string; children: React.ReactNode; locale: Locale };

export function AdminShell({ entry, children, locale }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const en = locale === 'en';
  const base = `/admin/${entry}`;
  const navigation = [
    ['', LayoutDashboard, en ? 'Overview' : 'Ringkasan'],
    ['/invitations', FileText, en ? 'Invitations' : 'Undangan'],
    ['/customers', Users, 'Customer'],
    ['/templates', Palette, en ? 'Themes' : 'Tema'],
    ['/orders', ReceiptText, en ? 'Orders' : 'Pesanan'],
    ['/coupons', TicketPercent, en ? 'Coupons' : 'Kupon'],
    ['/general', Settings, en ? 'Account' : 'Akun'],
    ['/security', ShieldCheck, en ? 'Security' : 'Keamanan'],
  ] as const;

  // Focus, Escape, the scroll lock and the page's inertness while the phone drawer is open.
  const drawer = useModalDrawer(open, setOpen);

  useEffect(() => { setOpen(false); }, [pathname]);

  const brand = (
    <Link href={base} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      <Wordmark href={null} size="sm" />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Console</span>
    </Link>
  );

  const nav = (
    <nav aria-label={en ? 'Admin navigation' : 'Navigasi admin'} className="flex flex-col gap-1">
      <p className="mb-1 px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{en ? 'Operations' : 'Operasional'}</p>
      {navigation.map(([suffix, Icon, label]) => {
        const href = `${base}${suffix}`;
        const active = suffix ? pathname === href : pathname === base;
        return (
          <Link
            key={suffix || 'home'} href={href} aria-current={active ? 'page' : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'}`} aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900">
      <Link href={`${base}/general`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-white dark:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">A</span>
        <span className="min-w-0 flex-1"><span className="block truncate">Admin</span><span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{en ? 'Account settings' : 'Pengaturan akun'}</span></span>
        <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </Link>
      <button onClick={() => clerk.signOut({ redirectUrl: '/sign-in' })} className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
        <LogOut className="h-4 w-4" aria-hidden />{en ? 'Sign out' : 'Keluar'}
      </button>
    </div>
  );

  return (
    <div data-app-shell="admin" className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header inert={open} className="sticky top-0 z-30 flex min-h-15 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
        <button ref={drawer.triggerRef} type="button" onClick={() => setOpen(true)} aria-label={en ? 'Open menu' : 'Buka menu'} aria-expanded={open} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href={base} className="min-w-0 flex-1 truncate text-center text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">Invitesion Console</Link>
        <Link href={`${base}/general`} aria-label={en ? 'Account settings' : 'Pengaturan akun'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">A</Link>
      </header>

      <aside inert={open} className="hidden min-h-dvh flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-950 lg:flex">
        <div className="mb-8">{brand}</div>{nav}
        <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">{account}</div>
      </aside>

      {/* Closed, the drawer is inert: aria-hidden alone left its links in the tab order (axe aria-hidden-focus, s34). */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open} inert={!open}>
        {/* The dialog's own close button is the keyboard path; this backdrop only takes the pointer, so it is never a tab stop outside the dialog. */}
        <button type="button" tabIndex={-1} aria-label={en ? 'Close menu' : 'Tutup menu'} onClick={drawer.close} className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <div role="dialog" aria-modal="true" aria-label={en ? 'Admin menu' : 'Menu admin'} className={`absolute inset-y-0 left-0 flex w-[17rem] max-w-[82%] flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-4 shadow-xl transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-slate-950 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-6 flex items-center justify-between">{brand}<button ref={drawer.initialFocusRef} type="button" onClick={drawer.close} aria-label={en ? 'Close menu' : 'Tutup menu'} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden /></button></div>
          {nav}<div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">{account}</div>
        </div>
      </div>

      <main inert={open} className="min-w-0 overflow-x-clip">{children}</main>
    </div>
  );
}
