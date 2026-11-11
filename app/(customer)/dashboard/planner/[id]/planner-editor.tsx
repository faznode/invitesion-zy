'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { Locale } from '@/lib/i18n';

type ChecklistItem = { title: string; done: boolean };
type Planner = {
  enabled?: boolean;
  eventName?: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
  notes?: string;
  checklist?: ChecklistItem[];
};

type Props = {
  invitationId: number;
  slug: string;
  eventType: string;
  locale: Locale;
  initial: Planner;
};

export function PlannerEditor({ invitationId, slug, locale, initial }: Props) {
  const en = locale === 'en';
  const [p, setP] = useState<Planner>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const items = p.checklist ?? [];
  const setItems = (next: ChecklistItem[]) => setP((c) => ({ ...c, checklist: next }));
  const done = items.filter((i) => i.done).length;

  async function save() {
    setSaving(true);
    setNotice('');
    // Drop blank checklist rows before saving so the schema stays clean.
    const payload: Planner = { ...p, checklist: items.filter((i) => i.title.trim()) };
    const r = await fetch(`/api/invitations/${invitationId}/detail`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventPlanner: payload }),
    });
    setSaving(false);
    setNotice(
      r.ok
        ? en ? 'Saved.' : 'Tersimpan.'
        : en ? 'Could not save. Check the fields.' : 'Gagal menyimpan. Periksa isian.',
    );
  }

  const field =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
  const labelCls = 'text-xs font-semibold text-slate-700';

  return (
    <section className="min-h-full bg-slate-50/70">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-2.5 lg:px-6">
          <Link
            href="/dashboard/planner"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <ChevronLeft className="h-4 w-4" />
            {en ? 'All events' : 'Semua acara'}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl min-w-0 p-4 lg:p-6">
        <div className="mb-6 border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold leading-tight text-slate-900">Event Planner</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {en
              ? 'Internal prep for /' + slug + '. Not shown to guests.'
              : 'Persiapan internal untuk /' + slug + '. Tidak tampil ke tamu.'}
          </p>
        </div>

        <div className="space-y-4">
          {/* Coordinator & basics */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-bold text-slate-900">{en ? 'Coordinator & notes' : 'Koordinator & catatan'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {en ? 'Who runs the event and any prep notes.' : 'Siapa yang mengatur acara dan catatan persiapan.'}
            </p>
            <label className="mt-5 flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-medium">
              <span>{en ? 'Enable Event Planner' : 'Aktifkan Event Planner'}</span>
              <input
                type="checkbox"
                checked={!!p.enabled}
                onChange={(e) => setP((c) => ({ ...c, enabled: e.target.checked }))}
                className="h-4 w-4 accent-brand-600"
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={labelCls}>{en ? 'Event name' : 'Nama event'}</span>
                <input
                  className={field}
                  placeholder={en ? 'e.g. Fitri & Andi Wedding' : 'mis. Pernikahan Fitri & Andi'}
                  value={p.eventName ?? ''}
                  onChange={(e) => setP((c) => ({ ...c, eventName: e.target.value }))}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelCls}>{en ? 'Coordinator name' : 'Nama koordinator'}</span>
                <input
                  className={field}
                  placeholder={en ? 'e.g. Dina (WO)' : 'mis. Dina (WO)'}
                  value={p.coordinatorName ?? ''}
                  onChange={(e) => setP((c) => ({ ...c, coordinatorName: e.target.value }))}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelCls}>{en ? 'Coordinator phone' : 'Nomor koordinator'}</span>
                <input
                  className={field}
                  placeholder="mis. 0812xxxxxxx"
                  value={p.coordinatorPhone ?? ''}
                  onChange={(e) => setP((c) => ({ ...c, coordinatorPhone: e.target.value }))}
                />
              </label>
            </div>
            <label className="mt-4 block space-y-1.5">
              <span className={labelCls}>{en ? 'Notes' : 'Catatan event'}</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder={en ? 'Rundown, vendor contacts, reminders…' : 'Rundown, kontak vendor, pengingat…'}
                value={p.notes ?? ''}
                onChange={(e) => setP((c) => ({ ...c, notes: e.target.value }))}
              />
            </label>
          </section>

          {/* Checklist */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{en ? 'Preparation checklist' : 'Checklist persiapan'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {en ? 'Track prep tasks toward the event.' : 'Lacak tugas persiapan menuju hari-H.'}
                </p>
              </div>
              {items.length > 0 && (
                <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  {done}/{items.length}
                </span>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {items.map((x, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={x.done}
                    onChange={(e) => setItems(items.map((q, j) => (j === i ? { ...q, done: e.target.checked } : q)))}
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <input
                    value={x.title}
                    placeholder={en ? 'Task title…' : 'Judul tugas…'}
                    onChange={(e) => setItems(items.map((q, j) => (j === i ? { ...q, title: e.target.value } : q)))}
                    className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${x.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    aria-label={en ? 'Remove task' : 'Hapus tugas'}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {!items.length && (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                  {en ? 'No tasks yet.' : 'Belum ada tugas.'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setP((c) => ({ ...c, enabled: true, checklist: [...items, { title: '', done: false }] }))}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-100"
            >
              <Plus className="h-4 w-4" />
              {en ? 'Add task' : 'Tambah tugas'}
            </button>
          </section>

          {/* Save bar (in-card, not a floating divider) */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {notice ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <Check className="h-4 w-4" />
                {notice}
              </span>
            ) : (
              <span className="text-sm text-slate-500">
                {en ? 'Save your changes when you’re done.' : 'Simpan perubahan setelah selesai.'}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? (en ? 'Saving…' : 'Menyimpan…') : en ? 'Save' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
