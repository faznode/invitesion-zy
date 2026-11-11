'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Eye, LoaderCircle } from 'lucide-react';
import { saveTrial, updateTrial, type TrialField, type TrialFieldErrors, type TrialFormValues } from '../actions';

export type TrialThemeOption = { slug: string; name: string; premium: boolean; swatch: [string, string, string] };

type Props = {
  initial: TrialFormValues;
  /** D-055: one key for this wizard's draft, sent with every update and save (a repeat then finds the same draft). */
  draftKey: string;
  fields: { first: string; second: string | null; secondRequired: boolean };
  placeholders: { first: string; second: string };
  nameMax: number;
  themes: TrialThemeOption[];
  signedIn: boolean;
};

type PreviewStatus = 'sample' | 'updating' | 'updated' | 'invalid';

const ZONES = [
  { value: 'Asia/Jakarta', label: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT' },
] as const;

const STATUS_TEXT: Record<PreviewStatus, string> = {
  sample: 'Nama contoh dipakai sampai kamu mengetik.',
  updating: 'Memperbarui pratinjau…',
  updated: 'Pratinjau memakai isianmu.',
  invalid: 'Periksa isian yang ditandai.',
};

const UPDATE_DELAY_MS = 450;

const inputClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary aria-[invalid=true]:border-destructive';

/** Enter in a field never saves: the draft is created only by the button (and an IME's Enter only confirms text). */
const keepTyping = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.preventDefault();
};

export function TrialWizard({ initial, draftKey, fields, placeholders, nameMax, themes, signedIn }: Props) {
  // Held for the wizard's lifetime: a re-render of the page (each update sets the cookie) must not change it.
  const [key] = useState(draftKey);
  const [values, setValues] = useState<TrialFormValues>(initial);
  const [errors, setErrors] = useState<TrialFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState({ slug: initial.slug, revision: 0 });
  const [frameLoading, setFrameLoading] = useState(true);
  const [status, setStatus] = useState<PreviewStatus>(initial.first || initial.second ? 'updated' : 'sample');
  const [saving, startSaving] = useTransition();

  const latest = useRef(values);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const submitting = useRef(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // One update at a time: each response sets the cookie, so an older answer arriving last would bring back older typing.
  const pushUpdate = () => {
    if (inFlight.current) {
      dirty.current = true;
      return;
    }
    const sent = latest.current;
    setStatus('updating');
    inFlight.current = updateTrial(sent, key)
      .then((result) => {
        if (result.ok) {
          setErrors({});
          setStatus(sent.first || sent.second ? 'updated' : 'sample');
          setFrameLoading(true);
          setPreview((current) => ({ slug: sent.slug, revision: current.revision + 1 }));
        } else {
          setErrors(result.errors);
          setStatus('invalid');
        }
      })
      .catch(() => setStatus('invalid'))
      .finally(() => {
        inFlight.current = null;
        if (dirty.current) {
          dirty.current = false;
          pushUpdate();
        }
      });
  };

  const change = <K extends TrialField>(field: K, value: TrialFormValues[K], immediate = false) => {
    const next = { ...latest.current, [field]: value };
    latest.current = next;
    setValues(next);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) pushUpdate();
    else timer.current = setTimeout(pushUpdate, UPDATE_DELAY_MS);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Taps in the same frame arrive before `disabled` renders; only the first one saves (the key covers what slips past).
    if (submitting.current) return;
    submitting.current = true;
    if (timer.current) clearTimeout(timer.current);
    startSaving(async () => {
      try {
        if (inFlight.current) await inFlight.current;
        const result = await saveTrial(latest.current, key);
        // A created draft redirects to the editor; only a refusal comes back here.
        if (result && !result.ok) {
          setErrors(result.errors);
          setMessage(result.message ?? null);
          const first = (['first', 'second', 'date', 'time', 'zone', 'slug'] as const).find((field) => result.errors[field]);
          if (first) document.getElementById(`trial-${first}`)?.focus();
        }
      } finally {
        submitting.current = false;
      }
    });
  };

  const describedBy = (field: TrialField, hint?: string) =>
    [hint, errors[field] ? `trial-${field}-error` : null].filter(Boolean).join(' ') || undefined;

  const fieldError = (field: TrialField) =>
    errors[field] ? (
      <p id={`trial-${field}-error`} className="text-sm text-destructive">
        {errors[field]}
      </p>
    ) : null;

  const previewSrc = `/buat/pratinjau?tema=${encodeURIComponent(preview.slug)}&r=${preview.revision}`;

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <form onSubmit={save} noValidate aria-describedby="trial-intro" className="flex flex-col gap-8 lg:w-[26rem] lg:shrink-0">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-primary">Coba gratis, tanpa akun</p>
          <h1 className="text-balance font-serif text-4xl leading-tight text-foreground lg:text-5xl">Lihat undanganmu dengan namamu sendiri</h1>
          <p id="trial-intro" className="text-pretty leading-relaxed text-muted-foreground">
            Ketik nama dan tanggal acara, pilih tema, lalu lihat hasilnya langsung. Belum ada yang disimpan sampai kamu menekan Simpan.
          </p>
        </div>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">1 · Nama</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trial-first" className="text-sm font-medium text-foreground">
              {fields.first}
            </label>
            <input
              id="trial-first"
              name="first"
              type="text"
              autoComplete="off"
              maxLength={nameMax}
              value={values.first}
              placeholder={placeholders.first ? `Contoh: ${placeholders.first}` : undefined}
              aria-invalid={Boolean(errors.first)}
              aria-describedby={describedBy('first')}
              onChange={(event) => change('first', event.target.value)}
              onKeyDown={keepTyping}
              className={inputClass}
            />
            {fieldError('first')}
          </div>
          {fields.second ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="trial-second" className="text-sm font-medium text-foreground">
                {fields.second}
                {fields.secondRequired ? null : <span className="font-normal text-muted-foreground"> (opsional)</span>}
              </label>
              <input
                id="trial-second"
                name="second"
                type="text"
                autoComplete="off"
                maxLength={nameMax}
                value={values.second}
                placeholder={placeholders.second ? `Contoh: ${placeholders.second}` : undefined}
                aria-invalid={Boolean(errors.second)}
                aria-describedby={describedBy('second')}
                onChange={(event) => change('second', event.target.value)}
                onKeyDown={keepTyping}
                className={inputClass}
              />
              {fieldError('second')}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">2 · Tanggal acara</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trial-date" className="text-sm font-medium text-foreground">
              Tanggal
            </label>
            <input
              id="trial-date"
              name="date"
              type="date"
              value={values.date}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={describedBy('date')}
              onChange={(event) => change('date', event.target.value, true)}
              onKeyDown={keepTyping}
              className={inputClass}
            />
            {fieldError('date')}
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="trial-time" className="text-sm font-medium text-foreground">
                Jam mulai
              </label>
              <input
                id="trial-time"
                name="time"
                type="time"
                value={values.time}
                aria-invalid={Boolean(errors.time)}
                aria-describedby={describedBy('time')}
                onChange={(event) => change('time', event.target.value)}
                onKeyDown={keepTyping}
                className={inputClass}
              />
              {fieldError('time')}
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <label htmlFor="trial-zone" className="text-sm font-medium text-foreground">
                Zona
              </label>
              <select
                id="trial-zone"
                name="zone"
                value={values.zone}
                onChange={(event) => change('zone', event.target.value as TrialFormValues['zone'], true)}
                className={inputClass}
              >
                {ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">3 · Tema</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {themes.map((theme) => (
              <label
                key={theme.slug}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 has-checked:border-primary has-checked:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
              >
                <input
                  type="radio"
                  name="theme"
                  value={theme.slug}
                  checked={values.slug === theme.slug}
                  onChange={() => change('slug', theme.slug, true)}
                  className="sr-only"
                />
                <span className="flex shrink-0 gap-1" aria-hidden="true">
                  {theme.swatch.map((color, index) => (
                    <span key={index} className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{theme.name}</span>
                  <span className="text-xs text-muted-foreground">{theme.premium ? 'Premium' : 'Standar'}</span>
                </span>
                {values.slug === theme.slug ? <Check size={16} className="shrink-0 text-primary" aria-hidden="true" /> : null}
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Mencoba semua tema gratis. Tema Premium dibayar saat undangan diaktifkan.</p>
          {fieldError('slug')}
        </fieldset>

        {message ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="flex items-center gap-3">
            <a
              href="#pratinjau"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-3 text-sm font-semibold text-foreground lg:hidden"
            >
              <Eye size={16} aria-hidden="true" />
              Pratinjau
            </a>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {saving ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {saving ? 'Menyimpan…' : signedIn ? 'Simpan sebagai draf' : 'Masuk & simpan draf'}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {signedIn
              ? 'Draf masuk ke akunmu dan bisa kamu lanjutkan di editor.'
              : 'Kamu akan diminta masuk atau daftar. Isian ini tetap ada di perangkat ini selama 6 jam.'}
          </p>
        </div>
      </form>

      <section id="pratinjau" aria-labelledby="trial-preview-title" className="flex flex-1 flex-col items-center gap-3 lg:sticky lg:top-6">
        <div className="flex w-full max-w-sm items-baseline justify-between gap-3">
          <h2 id="trial-preview-title" className="font-serif text-2xl text-foreground">
            Pratinjau
          </h2>
          <p aria-live="polite" className="text-right text-xs text-muted-foreground">
            {STATUS_TEXT[status]}
          </p>
        </div>
        <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-border bg-card p-2 shadow-xl">
          <iframe
            src={previewSrc}
            title="Pratinjau undangan dengan isianmu"
            onLoad={() => setFrameLoading(false)}
            className="block h-[70dvh] w-full rounded-[1.5rem] bg-card lg:h-[46rem]"
          />
          {frameLoading ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-2 flex items-start justify-center rounded-[1.5rem] bg-card/60 pt-6">
              <LoaderCircle size={20} className="animate-spin text-muted-foreground motion-reduce:animate-none" />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
