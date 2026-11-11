'use client';

import { useId } from 'react';
import { familyOf } from '@/lib/invitation/families';

type GuestLanguage = 'id' | 'en';

const OPTIONS: readonly { value: GuestLanguage; label: string; note: string }[] = [
  { value: 'id', label: 'Bahasa Indonesia', note: 'Bawaan setiap undangan.' },
  { value: 'en', label: 'English', note: 'Label, tanggal, dan pemberitahuan dalam bahasa Inggris.' },
];

/**
 * G-018 (I-31): the language of the guest page's own words, stored as `settings.language` through the normal save. Always
 * saved as an explicit value, because the save merge keeps a key a save leaves out: going back to Indonesian stores
 * `'id'`. Unset reads as Indonesian. The classic layout is frozen (D-041) and renders Indonesian whatever is stored, so
 * the hint says so until a design family is chosen.
 */
export function GuestLanguageChoice({ value, familyId, onChange }: { value?: string; familyId?: string; onChange: (language: GuestLanguage) => void }) {
  const name = useId();
  const hintId = useId();
  const current: GuestLanguage = value === 'en' ? 'en' : 'id';
  const classic = !familyOf(familyId);
  return (
    <fieldset aria-describedby={hintId} className="space-y-3">
      <legend className="text-xs font-semibold text-slate-700">Bahasa untuk tamu</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition has-checked:border-brand-400 has-checked:bg-brand-50/60 has-focus-visible:ring-2 has-focus-visible:ring-brand-200"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={current === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="flex flex-col gap-0.5">
              <span lang={option.value} className="font-semibold text-slate-900">
                {option.label}
              </span>
              <span className="text-xs leading-5 text-slate-500">{option.note}</span>
            </span>
          </label>
        ))}
      </div>
      <p id={hintId} className="text-pretty text-xs leading-5 text-slate-500">
        {classic
          ? 'Tata letak klasik selalu tampil dalam Bahasa Indonesia. Pilih tata letak Gapura, Kartu, Riang, atau Lontar di atas agar pilihan bahasa berlaku.'
          : 'Berlaku juga untuk judul halaman, tautan pratinjau, file kalender, dan QR pass. Teks yang kamu tulis sendiri (nama, judul, ucapan, nama acara) tidak diterjemahkan.'}
      </p>
    </fieldset>
  );
}
