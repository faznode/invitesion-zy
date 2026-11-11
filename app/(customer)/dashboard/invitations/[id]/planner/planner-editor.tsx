'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Banknote, CalendarDays, Check, ChevronLeft, ClipboardList, Loader2, MapPin, Plus, Save, Settings2, Trash2, UsersRound, UtensilsCrossed, WalletCards } from 'lucide-react';
import type { Locale } from '@/lib/i18n';

type ChecklistItem = { title: string; done: boolean };
type Planner = { enabled?: boolean; eventName?: string; coordinatorName?: string; coordinatorPhone?: string; notes?: string; checklist?: ChecklistItem[] };
type Props = { invitationId: number; slug: string; eventType: string; locale: Locale; initial: Planner };

// Mirrors --color-brand-600. Kept as a literal only because these values go to
// inline styles and icon props, which Tailwind classes cannot express.
const BRAND_600 = "#e80053";

export function PlannerEditor({ invitationId, slug, eventType, locale, initial }: Props) {
  const en = locale === 'en';
  const [p, setP] = useState<Planner>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const items = p.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const setItems = (next: ChecklistItem[]) => setP((c) => ({ ...c, checklist: next }));
  const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
  const label = 'text-xs font-semibold text-slate-700';

  async function save() {
    setSaving(true); setNotice('');
    const payload: Planner = { ...p, checklist: items.filter((i) => i.title.trim()) };
    const r = await fetch(`/api/invitations/${invitationId}/detail`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventPlanner: payload }) });
    setSaving(false);
    setNotice(r.ok ? (en ? 'Saved.' : 'Tersimpan.') : (en ? 'Could not save. Check the fields.' : 'Gagal menyimpan. Periksa isian.'));
  }

  const moduleCards = [
    [ClipboardList, en ? 'To Do List' : 'To Do List', en ? 'Preparation checklist' : 'Checklist persiapan', `${done}/${items.length || 0}`, BRAND_600, () => document.getElementById('planner-tasks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })],
    [WalletCards, en ? 'Budgeting' : 'Budgeting', en ? 'Budget & spending' : 'Anggaran & pengeluaran', en ? 'Coming soon' : 'Segera hadir', '#0f9d78', undefined],
    [UtensilsCrossed, en ? 'Vendor' : 'Vendor', en ? 'Manage vendors' : 'Kelola vendor', en ? 'Coming soon' : 'Segera hadir', '#d97706', undefined],
    [UsersRound, en ? 'Guest List' : 'Daftar Tamu', en ? 'Invitation guest list' : 'Daftar tamu undangan', en ? 'Use Guests & RSVP' : 'Pakai Tamu & RSVP', '#2563eb', undefined],
    [CalendarDays, en ? 'Timeline' : 'Timeline', en ? 'Event rundown' : 'Rundown acara', en ? 'Coming soon' : 'Segera hadir', '#db2777', undefined],
    [MapPin, en ? 'Seating' : 'Seating', en ? 'Seating layout' : 'Denah tempat duduk', en ? 'Coming soon' : 'Segera hadir', '#64748b', undefined],
    [UsersRound, en ? 'Committee' : 'Panitia', en ? 'Event team' : 'Tim panitia', en ? 'Coming soon' : 'Segera hadir', '#475569', undefined],
    [Settings2, en ? 'Settings' : 'Pengaturan', en ? 'Event configuration' : 'Konfigurasi event', en ? 'Open settings' : 'Buka pengaturan', BRAND_600, () => setShowSettings(true)],
  ] as const;

  return <section className="min-h-full bg-slate-50/70">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center px-4 py-2.5 lg:px-6"><Link href="/dashboard/invitations" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><ChevronLeft className="h-4 w-4" />{en ? 'My invitations' : 'Undangan saya'}</Link></div></header>
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <article className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm"><div className="bg-gradient-to-r from-[#b90042] via-brand-600 to-[#ff5a91] p-5 text-white sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-100">Event Planner</p><h1 className="mt-2 text-2xl font-bold">{p.eventName || `/${slug}`}</h1><p className="mt-1 text-sm text-brand-100">{en ? 'Internal event preparation. Not shown to guests.' : 'Persiapan internal acara. Tidak tampil ke tamu.'}</p></div><button type="button" onClick={() => setShowSettings(true)} className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg bg-white/15 px-3 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25"><Settings2 className="h-4 w-4" />{en ? 'Event details' : 'Detail event'}</button></div><div className="mt-5 grid gap-2 sm:grid-cols-4"><Stat label={en ? 'TYPE' : 'TIPE'} value={eventType} /><Stat label={en ? 'TASKS' : 'TUGAS'} value={`${done}/${items.length}`} /><Stat label={en ? 'COORDINATOR' : 'KOORDINATOR'} value={p.coordinatorName || '—'} /><Stat label={en ? 'STATUS' : 'STATUS'} value={p.enabled ? (en ? 'Active' : 'Aktif') : (en ? 'Draft' : 'Draf')} /></div></div></article>

      <section className="mt-6"><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{en ? 'Event Planner menu' : 'Menu Event Planner'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{en ? 'Manage your event' : 'Kelola acara kamu'}</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{moduleCards.map(([Icon, title, description, meta, color, onClick]) => <button key={title} type="button" onClick={onClick} disabled={!onClick} className="group min-h-32 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-brand-200 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"><span className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: `${color}14`, color }}><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p><p className="mt-3 text-xs font-semibold" style={{ color }}>{meta}</p></button>)}</div></section>

      <section id="planner-tasks" className="mt-6 scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{en ? 'To Do List' : 'To Do List'}</h2><p className="mt-1 text-sm text-slate-500">{en ? 'Track preparations toward the event.' : 'Lacak tugas persiapan menuju hari-H.'}</p></div>{items.length > 0 && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{done}/{items.length}</span>}</div><div className="mt-4 space-y-2">{items.map((x, i) => <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={x.done} onChange={(e) => setItems(items.map((q, j) => j === i ? { ...q, done: e.target.checked } : q))} className="h-4 w-4 shrink-0 accent-brand-600" /><input value={x.title} placeholder={en ? 'Task title…' : 'Judul tugas…'} onChange={(e) => setItems(items.map((q, j) => j === i ? { ...q, title: e.target.value } : q))} className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${x.done ? 'text-slate-400 line-through' : 'text-slate-800'}`} /><button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={en ? 'Remove task' : 'Hapus tugas'} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}{!items.length && <p className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">{en ? 'No tasks yet. Add your first preparation task.' : 'Belum ada tugas. Tambahkan tugas persiapan pertama.'}</p>}</div><button type="button" onClick={() => setP((c) => ({ ...c, enabled: true, checklist: [...items, { title: '', done: false }] }))} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-bold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100"><Plus className="h-4 w-4" />{en ? 'Add task' : 'Tambah tugas'}</button></section>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{notice ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check className="h-4 w-4" />{notice}</span> : <span className="text-sm text-slate-500">{en ? 'Save your changes when you’re done.' : 'Simpan perubahan setelah selesai.'}</span>}<button onClick={save} disabled={saving} className="ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? (en ? 'Saving…' : 'Menyimpan…') : (en ? 'Save' : 'Simpan')}</button></div>

      {showSettings && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><div role="dialog" aria-modal="true" aria-label={en ? 'Event details' : 'Detail event'} className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900">{en ? 'Event details' : 'Detail event'}</h2><p className="mt-1 text-sm text-slate-500">{en ? 'Basic information for this event planner.' : 'Informasi dasar untuk Event Planner ini.'}</p></div><button type="button" onClick={() => setShowSettings(false)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={en ? 'Close' : 'Tutup'}>×</button></div><label className="mt-5 flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-medium"><span>{en ? 'Enable Event Planner' : 'Aktifkan Event Planner'}</span><input type="checkbox" checked={!!p.enabled} onChange={(e) => setP((c) => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4 accent-brand-600" /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5"><span className={label}>{en ? 'Event name' : 'Nama event'}</span><input className={field} placeholder={en ? 'e.g. Fitri & Andi Wedding' : 'mis. Pernikahan Fitri & Andi'} value={p.eventName ?? ''} onChange={(e) => setP((c) => ({ ...c, eventName: e.target.value }))} /></label><label className="block space-y-1.5"><span className={label}>{en ? 'Coordinator name' : 'Nama koordinator'}</span><input className={field} placeholder={en ? 'e.g. Dina (WO)' : 'mis. Dina (WO)'} value={p.coordinatorName ?? ''} onChange={(e) => setP((c) => ({ ...c, coordinatorName: e.target.value }))} /></label><label className="block space-y-1.5"><span className={label}>{en ? 'Coordinator phone' : 'Nomor koordinator'}</span><input className={field} placeholder="mis. 0812xxxxxxx" value={p.coordinatorPhone ?? ''} onChange={(e) => setP((c) => ({ ...c, coordinatorPhone: e.target.value }))} /></label></div><label className="mt-4 block space-y-1.5"><span className={label}>{en ? 'Notes' : 'Catatan event'}</span><textarea className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100" placeholder={en ? 'Rundown, vendor contacts, reminders…' : 'Rundown, kontak vendor, pengingat…'} value={p.notes ?? ''} onChange={(e) => setP((c) => ({ ...c, notes: e.target.value }))} /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowSettings(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">{en ? 'Done' : 'Selesai'}</button></div></div></div>}
    </div>
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-white/12 px-3 py-2.5 ring-1 ring-white/15"><p className="text-[10px] font-semibold tracking-wide text-brand-100">{label}</p><p className="mt-1 truncate text-sm font-bold capitalize text-white">{value}</p></div>; }

void Banknote;
