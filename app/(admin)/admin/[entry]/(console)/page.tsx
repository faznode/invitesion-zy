import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, FileText, LayoutTemplate, MoreHorizontal, ShoppingCart, Sparkles, Users, WalletCards } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { invitations, orders, templates, users } from '@/lib/db/schema';

import { assertAuthorizedAdmin } from '@/lib/auth/admin-access';
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const num = (v: unknown) => Number(v || 0).toLocaleString('id-ID');

/**
 * Invitation-status chart palette. Mirrors --color-brand-* / Tailwind values.
 *
 * Literals are unavoidable here because `conic-gradient` is built as a style
 * string, but the donut and its legend must not each carry their own copy.
 */
const STATUS_COLOR = {
  published: '#f22d70', // brand-500
  draft: '#a78bfa', // violet-400
  expired: '#cbd5e1', // slate-300
  empty: '#e2e8f0', // slate-200
} as const;

/**
 * Month-over-month change. Returns null when the previous period has no
 * baseline — an operator is better served by "no comparison yet" than by a
 * fabricated growth figure.
 */
type Trend = { label: string; positive: boolean } | null;
function trend(current: number, previous: number): Trend {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return { label: `${Math.abs(change).toFixed(1)}%`, positive: change >= 0 };
}

function greeting(hour: number) {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function Kpi({ title, value, change, icon: Icon, color }: { title: string; value: string; change: Trend; icon: typeof Users; color: string }) {
  return <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{title}</span><span className={`rounded-md p-2 ${color}`}><Icon className="h-4 w-4" /></span></div><div className="mt-3 flex items-end justify-between"><span className="text-2xl font-semibold tracking-tight">{value}</span>{change && <span className={`flex items-center gap-0.5 text-xs font-medium ${change.positive ? 'text-emerald-600' : 'text-rose-600'}`}>{change.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{change.label}</span>}</div><p className="mt-1 text-[11px] text-muted-foreground">{change ? 'dibanding bulan lalu' : 'belum ada pembanding bulan lalu'}</p></div>;
}
function Empty({ text }: { text: string }) { return <div className="py-9 text-center text-xs text-muted-foreground">{text}</div>; }

export default async function DasborPage() {
  assertAuthorizedAdmin(await getUser());
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const count = (value: { value: number }[] | undefined) => Number(value?.[0]?.value ?? 0);

  const [
    customers, invites, temps, paid, revenue, recentUsers, recentInvites, pendingOrders,
    customersThis, customersPrev, invitesThis, invitesPrev, paidThis, paidPrev, revThis, revPrev,
    statusRows, revenueSeries,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(users).where(eq(users.role, 'CUSTOMER')),
    db.select({ value: sql<number>`count(*)` }).from(invitations),
    db.select({ value: sql<number>`count(*)` }).from(templates),
    db.select({ value: sql<number>`count(*)` }).from(orders).where(eq(orders.status, 'PAID')),
    db.select({ value: sql<number>`coalesce(sum(${orders.amount}),0)` }).from(orders).where(eq(orders.status, 'PAID')),
    db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.role, 'CUSTOMER')).orderBy(desc(users.createdAt)).limit(6),
    db.select().from(invitations).orderBy(desc(invitations.createdAt)).limit(6),
    db.select({ value: sql<number>`count(*)` }).from(orders).where(eq(orders.status, 'PENDING')),
    db.select({ value: sql<number>`count(*)` }).from(users).where(and(eq(users.role, 'CUSTOMER'), gte(users.createdAt, monthStart))),
    db.select({ value: sql<number>`count(*)` }).from(users).where(and(eq(users.role, 'CUSTOMER'), gte(users.createdAt, prevMonthStart), lt(users.createdAt, monthStart))),
    db.select({ value: sql<number>`count(*)` }).from(invitations).where(gte(invitations.createdAt, monthStart)),
    db.select({ value: sql<number>`count(*)` }).from(invitations).where(and(gte(invitations.createdAt, prevMonthStart), lt(invitations.createdAt, monthStart))),
    db.select({ value: sql<number>`count(*)` }).from(orders).where(and(eq(orders.status, 'PAID'), gte(orders.createdAt, monthStart))),
    db.select({ value: sql<number>`count(*)` }).from(orders).where(and(eq(orders.status, 'PAID'), gte(orders.createdAt, prevMonthStart), lt(orders.createdAt, monthStart))),
    db.select({ value: sql<number>`coalesce(sum(${orders.amount}),0)` }).from(orders).where(and(eq(orders.status, 'PAID'), gte(orders.createdAt, monthStart))),
    db.select({ value: sql<number>`coalesce(sum(${orders.amount}),0)` }).from(orders).where(and(eq(orders.status, 'PAID'), gte(orders.createdAt, prevMonthStart), lt(orders.createdAt, monthStart))),
    db.select({ status: invitations.status, value: sql<number>`count(*)` }).from(invitations).groupBy(invitations.status),
    db.select({ bucket: sql<string>`to_char(date_trunc('month', ${orders.createdAt}), 'YYYY-MM')`, value: sql<number>`coalesce(sum(${orders.amount}),0)` })
      .from(orders).where(and(eq(orders.status, 'PAID'), gte(orders.createdAt, seriesStart)))
      .groupBy(sql`date_trunc('month', ${orders.createdAt})`).orderBy(sql`date_trunc('month', ${orders.createdAt})`),
  ]);

  const rev = Number(revenue[0]?.value || 0);
  const revenueTrend = trend(count(revThis), count(revPrev));

  // Twelve fixed monthly buckets so the chart keeps a stable x-axis even when
  // a month has no paid orders at all.
  const byMonth = new Map(revenueSeries.map((row) => [row.bucket, Number(row.value)]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('id-ID', { month: 'short' }), total: byMonth.get(key) ?? 0 };
  });
  const peak = Math.max(...months.map((m) => m.total), 0);

  const totalInvites = count(invites);
  const statusCount = (status: string) => Number(statusRows.find((row) => row.status === status)?.value ?? 0);
  const share = (status: string) => (totalInvites ? (statusCount(status) / totalInvites) * 100 : 0);
  const publishedShare = share('PUBLISHED');
  const draftShare = share('DRAFT');
  // One source for the donut and its legend.
  //
  // The PUBLISHED segment was #f97316 — real Tailwind orange — while its legend
  // swatch was brand rose. A reader matching swatch to segment read the chart
  // wrong, which is worse than either colour being off on its own. A
  // conic-gradient needs literal values, so the legend now takes them from here
  // rather than from a class that has to be kept in sync by hand.
  const donut = totalInvites
    ? `conic-gradient(${STATUS_COLOR.published} 0 ${publishedShare}%, ${STATUS_COLOR.draft} ${publishedShare}% ${publishedShare + draftShare}%, ${STATUS_COLOR.expired} ${publishedShare + draftShare}% 100%)`
    : STATUS_COLOR.empty;
  const pct = (value: number) => (totalInvites ? `${value.toFixed(0)}%` : '—');
  return <section className="min-h-screen bg-slate-50/70 p-4 lg:p-6"><div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Dasbor</span><span>/</span><span className="text-slate-900">Ringkasan</span></div><h1 className="mt-2 text-xl font-semibold tracking-tight">{greeting(now.getHours())}, Admin <span className="text-brand-600">✦</span></h1><p className="mt-1 text-xs text-muted-foreground">Pantau aktivitas platform undangan hari ini.</p></div><div className="flex w-full items-center gap-2 sm:w-auto"><button className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-medium shadow-sm sm:flex-none"><CalendarDays className="h-3.5 w-3.5" /> 30 hari terakhir</button><button className="min-h-10 shrink-0 whitespace-nowrap rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-brand-700">+ Tema</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi title="Total pendapatan" value={money.format(rev)} change={revenueTrend} icon={WalletCards} color="bg-emerald-50 text-emerald-600" /><Kpi title="Total customer" value={num(customers[0]?.value)} change={trend(count(customersThis), count(customersPrev))} icon={Users} color="bg-blue-50 text-blue-600" /><Kpi title="Undangan dibuat" value={num(invites[0]?.value)} change={trend(count(invitesThis), count(invitesPrev))} icon={FileText} color="bg-violet-50 text-violet-600" /><Kpi title="Pesanan dibayar" value={num(paid[0]?.value)} change={trend(count(paidThis), count(paidPrev))} icon={ShoppingCart} color="bg-amber-50 text-amber-600" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="rounded-lg border bg-white shadow-sm"><div className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5"><div className="min-w-0"><h2 className="text-sm font-semibold">Ringkasan pendapatan</h2><p className="mt-1 text-[11px] text-muted-foreground">Performa pendapatan bulanan</p></div><button aria-label="Menu ringkasan pendapatan" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" /></button></div><div className="p-5"><div className="flex items-baseline gap-3"><span className="text-2xl font-semibold">{money.format(rev)}</span>{revenueTrend && <span className={`text-xs font-medium ${revenueTrend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>{revenueTrend.positive ? '+' : '−'}{revenueTrend.label}</span>}</div>{peak > 0 ? <><div className="mt-5 flex h-44 items-end gap-2 border-b border-l px-3 pb-0 pt-4">{months.map((m,i)=><div key={m.key} className="group relative flex h-full flex-1 items-end" title={`${m.label}: ${money.format(m.total)}`}><div style={{height:`${Math.max((m.total/peak)*100,2)}%`}} className={`w-full rounded-t-sm ${i===months.length-1?'bg-brand-600':'bg-brand-100 group-hover:bg-brand-300'}`} /></div>)}</div><div className="mt-2 flex justify-between pl-3 text-[10px] capitalize text-muted-foreground">{months.filter((_,i)=>i%2===0).map((m)=><span key={m.key}>{m.label}</span>)}</div></> : <p className="mt-5 flex h-44 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">Belum ada pendapatan untuk ditampilkan.</p>}</div></div>
      <div className="rounded-lg border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold">Status undangan</h2><p className="mt-1 text-[11px] text-muted-foreground">Komposisi konten saat ini</p></div><FileText className="h-4 w-4 text-muted-foreground" /></div><div className="p-5"><div className="flex items-center justify-center py-3"><div className="flex h-36 w-36 items-center justify-center rounded-full" style={{background:donut}}><div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-center"><span><strong className="block text-xl">{num(totalInvites)}</strong><small className="text-[10px] text-muted-foreground">total</small></span></div></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]"><div><span className="mx-auto mb-1 block h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR.published }} /><b>Tayang</b><p className="text-muted-foreground">{pct(publishedShare)}</p></div><div><span className="mx-auto mb-1 block h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR.draft }} /><b>Draf</b><p className="text-muted-foreground">{pct(draftShare)}</p></div><div><span className="mx-auto mb-1 block h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR.expired }} /><b>Berakhir</b><p className="text-muted-foreground">{pct(share('EXPIRED'))}</p></div></div></div></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
      <div className="rounded-lg border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold">Undangan terbaru</h2><p className="mt-1 text-[11px] text-muted-foreground">Undangan terbaru dari seluruh customer</p></div><a href="./invitations" className="text-xs font-medium text-brand-700 hover:underline">Lihat semua</a></div><div className="divide-y sm:hidden">{recentInvites.map(r=><article key={r.id} className="px-4 py-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">/{r.slug}</p><p className="mt-1 capitalize text-xs text-muted-foreground">{r.eventType} · {r.createdAt.toLocaleDateString('id-ID')}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${r.status==='PUBLISHED'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{r.status==='PUBLISHED'?<CheckCircle2 className="h-3 w-3" />:<Clock3 className="h-3 w-3" />}{r.status}</span></div></article>)}{!recentInvites.length&&<Empty text="Belum ada undangan." />}</div><div className="hidden overflow-x-auto sm:block"><table className="min-w-[38rem] w-full text-left text-xs"><thead className="border-b bg-slate-50/70 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Undangan</th><th className="px-5 py-3 font-medium">Tipe</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Dibuat</th></tr></thead><tbody className="divide-y">{recentInvites.map(r=><tr key={r.id} className="hover:bg-slate-50"><td className="px-5 py-3.5 font-medium">/{r.slug}</td><td className="px-5 py-3.5 capitalize text-muted-foreground">{r.eventType}</td><td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${r.status==='PUBLISHED'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{r.status==='PUBLISHED'?<CheckCircle2 className="h-3 w-3" />:<Clock3 className="h-3 w-3" />}{r.status}</span></td><td className="px-5 py-3.5 text-muted-foreground">{r.createdAt.toLocaleDateString('id-ID')}</td></tr>)}</tbody></table>{!recentInvites.length&&<Empty text="Belum ada undangan." />}</div></div>
      <div className="rounded-lg border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold">Customer terbaru</h2><p className="mt-1 text-[11px] text-muted-foreground">Akun yang baru terdaftar</p></div><a href="./customers" className="text-xs font-medium text-brand-700 hover:underline">Lihat semua</a></div><div className="divide-y">{recentUsers.map(r=><div key={r.id} className="flex items-center gap-3 px-5 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{(r.name||r.email).slice(0,1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-medium">{r.name||'Tanpa nama'}</p><p className="truncate text-[11px] text-muted-foreground">{r.email}</p></div><span className="ml-auto text-[10px] text-muted-foreground">{r.createdAt.toLocaleDateString('id-ID')}</span></div>)}{!recentUsers.length&&<Empty text="Belum ada customer." />}</div></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-semibold"><LayoutTemplate className="h-4 w-4 text-brand-600" /> Katalog tema</div><p className="mt-3 text-xl font-semibold">{num(temps[0]?.value)}</p><p className="text-[11px] text-muted-foreground">tema tersedia</p></div><div className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="h-4 w-4 text-amber-600" /> Pesanan menunggu</div><p className="mt-3 text-xl font-semibold">{num(count(pendingOrders))}</p><p className="text-[11px] text-muted-foreground">perlu ditindaklanjuti</p></div><div className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-violet-600" /> AI agent</div><p className="mt-3 text-sm font-semibold text-emerald-700">Siap</p><p className="text-[11px] text-muted-foreground">status mesin percakapan</p></div></div>
  </div></section>;
}
export const dynamic = 'force-dynamic';
