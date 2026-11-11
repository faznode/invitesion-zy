'use client';

import { useId, useState, useTransition, type ChangeEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { FileUp } from 'lucide-react';
import { importErrorMessage, REASON_LABELS } from '@/lib/invitation/import-messages';
import type { ImportPreview, ImportRowVerdict } from '@/lib/invitation/roster-outcomes';

type Props = {
  invitationId: number;
  preview: (invitationId: number, text: string) => Promise<ImportPreview>;
  commit: (formData: FormData) => Promise<void>;
};

/**
 * B-033: paste or pick a file, preview through the live roster writer, then import the accepted rows as one batch. A
 * change to the text after a preview hides that preview, so the host imports only what they last checked (the server
 * re-decides at import time either way).
 */
export function GuestImport({ invitationId, preview, commit }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ text: string; answer: ImportPreview } | null>(null);
  const [pending, startTransition] = useTransition();
  const textId = useId();
  const hintId = useId();

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  }

  function onPreview() {
    const snapshot = text;
    startTransition(async () => setResult({ text: snapshot, answer: await preview(invitationId, snapshot) }));
  }

  const current = result && result.text === text ? result.answer : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-white p-5">
        <label htmlFor={textId} className="text-sm font-bold text-slate-900">
          Data tamu
        </label>
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-slate-500">
          Salin sel dari spreadsheet (dengan atau tanpa baris judul) lalu tempel di sini, atau pilih file CSV. Pemisah koma, titik koma,
          dan tab dikenali otomatis.
        </p>
        <textarea
          id={textId}
          aria-describedby={hintId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          spellCheck={false}
          className="mt-3 w-full rounded-lg border p-3 font-mono text-sm leading-relaxed outline-none focus:border-brand-600"
          placeholder={'Nama\tWhatsApp\tKategori\tJumlah\nBudi Santoso\t0812-3456-7890\tKeluarga\t2'}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-brand-600 hover:bg-slate-50">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Pilih file CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" />
          </label>
          <button
            type="button"
            onClick={onPreview}
            disabled={!text.trim() || pending}
            className="min-h-11 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Memeriksa…' : 'Pratinjau'}
          </button>
        </div>
      </div>
      <div aria-live="polite">{current && <Preview invitationId={invitationId} text={text} answer={current} commit={commit} />}</div>
    </div>
  );
}

function Preview({ invitationId, text, answer, commit }: { invitationId: number; text: string; answer: ImportPreview; commit: Props['commit'] }) {
  if (!answer.ok) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {importErrorMessage(answer.error)}
        {answer.rowCount ? ` (${answer.rowCount.toLocaleString('id-ID')} baris)` : ''}
      </p>
    );
  }
  const { summary, rows } = answer;
  const refusal = importErrorMessage(summary.refusal ?? undefined);
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h2 className="mr-2 font-bold text-slate-900">Pratinjau</h2>
        <Count tone="ok" label="siap diimpor" value={summary.ok} />
        <Count tone="skip" label="duplikat" value={summary.duplicate} />
        <Count tone="bad" label="tidak valid" value={summary.invalid} />
      </div>
      {refusal && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {refusal}
        </p>
      )}
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Hasil pemeriksaan tiap baris</caption>
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">Baris</th>
              <th scope="col" className="px-3 py-2">Nama</th>
              <th scope="col" className="px-3 py-2">WhatsApp</th>
              <th scope="col" className="px-3 py-2">Kategori</th>
              <th scope="col" className="px-3 py-2">Jumlah</th>
              <th scope="col" className="px-3 py-2">Hasil</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={row.line} className={summary.verdicts[index]?.status === 'ok' ? '' : 'bg-slate-50/70'}>
                <td className="px-3 py-2 tabular-nums text-slate-500">{row.line}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{row.name || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{row.phone || '—'}</td>
                <td className="px-3 py-2">{row.category || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{row.guestCount || '1'}</td>
                <td className="px-3 py-2">{summary.verdicts[index] && <Verdict verdict={summary.verdicts[index]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={commit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="text" value={text} />
        <ImportButton count={summary.ok} disabled={Boolean(summary.refusal) || summary.ok === 0} />
        <p className="text-xs leading-relaxed text-slate-500">Baris duplikat dan tidak valid dilewati. Impor bisa dibatalkan dari daftar tamu.</p>
      </form>
    </div>
  );
}

function ImportButton({ count, disabled }: { count: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-11 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Mengimpor…' : `Impor ${count.toLocaleString('id-ID')} tamu`}
    </button>
  );
}

const TONES = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  skip: 'border-amber-200 bg-amber-50 text-amber-900',
  bad: 'border-red-200 bg-red-50 text-red-800',
} as const;

function Count({ tone, label, value }: { tone: keyof typeof TONES; label: string; value: number }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>
      {value.toLocaleString('id-ID')} {label}
    </span>
  );
}

function Verdict({ verdict }: { verdict: ImportRowVerdict }) {
  if (verdict.status === 'ok') return <span className="text-xs font-semibold text-emerald-700">Siap diimpor ({verdict.slug})</span>;
  if (verdict.status === 'duplicate') {
    return <span className="text-xs font-semibold text-amber-800">Dilewati: {verdict.of === 'roster' ? 'sudah ada di daftar' : 'sama dengan baris di atas'}</span>;
  }
  return <span className="text-xs font-semibold text-red-700">Dilewati: {REASON_LABELS[verdict.reason]}</span>;
}
