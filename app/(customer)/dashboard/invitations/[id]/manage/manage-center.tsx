import Link from 'next/link';
import type { ElementType } from 'react';
import type { DetailConfig } from '@/lib/invitation/detail-config';
import { ModuleConfigPanel } from './module-config-panel';
import {
  BarChart3, Bell, CalendarDays, CheckCircle2, ClipboardList, Edit3, ExternalLink,
  FileText, Gift, LayoutDashboard, Link2, Mail, MapPin, MessageSquare, Settings,
  Sparkles, Ticket, UserCog, Users, Utensils, WalletCards, type LucideIcon,
} from 'lucide-react';

type Module = { slug: string; title: string; description: string; status: 'Active' | 'Configurable' | 'Foundation' | 'Integration required'; icon: LucideIcon; href?: string; fullLoad?: boolean };

const modules: Module[] = [
  { slug: 'overview', title: 'Overview', description: 'Your event command view: invitation readiness, guests, and next actions.', status: 'Active', icon: LayoutDashboard },
  { slug: 'website', title: 'Invitation Website', description: 'Edit pages, copy, gallery, and the public invitation experience.', status: 'Active', icon: FileText, href: 'edit' },
  { slug: 'registration-rsvp', title: 'Registration & RSVP', description: 'Shape attendance fields and review responses as the RSVP foundation grows.', status: 'Configurable', icon: CheckCircle2 },
  { slug: 'guests', title: 'Guests', description: 'Manage your guest list, personalised links, and RSVP follow-up.', status: 'Active', icon: Users, href: 'guests' },
  { slug: 'wishes', title: 'Wishes', description: 'Approve, hide, delete and reply to the wishes your guests leave.', status: 'Active', icon: MessageSquare, href: 'wishes' },
  { slug: 'custom-questions', title: 'Custom Questions', description: 'Prepare event-specific questions for a future RSVP form builder.', status: 'Foundation', icon: MessageSquare },
  { slug: 'meals-dietary', title: 'Meals & Dietary', description: 'Capture meal preferences and dietary requirements when collection is enabled.', status: 'Foundation', icon: Utensils },
  { slug: 'communications', title: 'Communications', description: 'Plan guest updates and message templates. Delivery integrations are not active.', status: 'Integration required', icon: Mail },
  { slug: 'check-in', title: 'Check-in', description: 'Track arrivals manually now; QR scanner flow remains a roadmap item.', status: 'Active', icon: MapPin, href: 'guests' },
  { slug: 'seating', title: 'Seating', description: 'Reserve a place for table planning and assignments in the event workflow.', status: 'Foundation', icon: CalendarDays },
  { slug: 'secondary-events', title: 'Secondary Events', description: 'Coordinate ceremonies, dinners, and other moments around the main event.', status: 'Configurable', icon: Sparkles },
  { slug: 'tickets-donations', title: 'Tickets & Donations', description: 'Plan ticketing or donation flows; payment integrations are not active here.', status: 'Integration required', icon: Ticket },
  { slug: 'analytics-export', title: 'Analytics & Export', description: 'Opens over time, totals by group and event, follow-up lists with WhatsApp reminders, and CSV exports.', status: 'Active', icon: BarChart3, href: 'insights' },
  { slug: 'planner', title: 'Planner', description: 'Build your event timeline, tasks, vendors, and budget.', status: 'Active', icon: ClipboardList, href: 'planner' },
  { slug: 'settings', title: 'Settings', description: 'Invitation-level preferences and operational controls.', status: 'Configurable', icon: Settings },
];

const statusStyle: Record<Module['status'], string> = { Active: 'bg-emerald-50 text-emerald-700', Configurable: 'bg-blue-50 text-blue-700', Foundation: 'bg-amber-50 text-amber-700', 'Integration required': 'bg-slate-100 text-slate-600' };

/** G-045 (D-058): the owner's day-of logs, in place of the seating placeholder while `FLAG_HOST_LOGS` is on. */
const hostLogsModule: Module = {
  slug: 'seating',
  title: 'Seating, souvenirs & gifts',
  description: 'Assign tables and seats, mark souvenirs handed out, and keep a private gift log, with CSV exports. Only you see it.',
  status: 'Active',
  icon: Gift,
  href: 'logs',
};

/** G-044 (D-057): the owner's team page, listed after check-in while `FLAG_TEAM_ACCESS` is on. */
const teamModule: Module = {
  slug: 'team',
  title: 'Team',
  description: 'Invite a co-host to share the guest list, or ushers who only check guests in at the door. Revoke anyone at any time.',
  status: 'Active',
  icon: UserCog,
  href: 'team',
};

export function ManageCenter({ invitationId, slug, module, config, guestPassOn = false, teamOn = false, hostLogsOn = false }: { invitationId: number; slug: string; module?: string; config: DetailConfig; guestPassOn?: boolean; teamOn?: boolean; hostLogsOn?: boolean }) {
  // B-024: with guest passes on, the check-in module opens the scanner and says what it does. It opens by a full load, so
  // the scanner's own Permissions-Policy (camera) applies; a client-side navigation would keep this page's, which denies it.
  // G-045 (D-058): with host logs on, the seating module opens the owner's day-of logs instead of its placeholder.
  const shown = modules
    .map((item) =>
      guestPassOn && item.slug === 'check-in'
        ? { ...item, description: 'Scan each guest’s QR pass at the door, keep scanning without signal, and search by name when a pass will not scan.', href: 'checkin', fullLoad: true }
        : hostLogsOn && item.slug === 'seating'
          ? hostLogsModule
          : item,
    )
    .flatMap((item) => (teamOn && item.slug === 'check-in' ? [item, teamModule] : [item]));
  const selected = shown.find((item) => item.slug === module) ?? shown[0];
  const Icon = selected.icon;
  return <div className="min-h-full bg-slate-50/70 p-4 lg:p-8"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard/invitations" className="text-xs font-semibold text-brand-700">← My invitations</Link>
    <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand-700">Event Control Center</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">/{slug}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">One focused workspace for every part of this invitation and event.</p></div><div className="flex gap-2"><Link href={`/dashboard/invitations/${invitationId}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-700"><Edit3 className="h-4 w-4" />Edit</Link><Link href={`/dashboard/invitations/${invitationId}/planner`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white"><ClipboardList className="h-4 w-4" />Planner</Link></div></header>
    <section className="mt-6 rounded-2xl border border-brand-100 bg-gradient-to-br from-white to-brand-50 p-5 shadow-sm"><div className="flex items-start gap-3"><Icon className="mt-0.5 h-6 w-6 text-brand-600" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{selected.title}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle[selected.status]}`}>{selected.status}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{selected.description}</p>{selected.status === 'Integration required' && <p className="mt-2 text-xs font-medium text-slate-500">This area is a clear roadmap, not an active integration.</p>}</div></div></section>
    <ModuleConfigPanel invitationId={invitationId} module={selected.slug} initial={config} />
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map((item) => { const CardIcon = item.icon; const href = item.href?.startsWith('/') ? item.href : item.href ? `/dashboard/invitations/${invitationId}/${item.href}` : `/dashboard/invitations/${invitationId}/manage?module=${item.slug}`; const CardLink: ElementType = item.fullLoad ? 'a' : Link; return <CardLink key={item.slug} href={href} className={`group rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md ${selected.slug === item.slug ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><CardIcon className="h-5 w-5 text-brand-600" /><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusStyle[item.status]}`}>{item.status}</span></div><h3 className="mt-4 font-bold text-slate-900">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Open <ExternalLink className="h-3 w-3" /></span></CardLink> })}</div>
  </div></div>;
}

export { modules };
