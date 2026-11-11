'use client';

import { useId } from 'react';
import { familyOf } from '@/lib/invitation/families';

/**
 * G-035 (I-16): whether the guest page offers its share actions and Status / Story image (`settings.guestShare`), saved
 * through the normal save as an explicit boolean, because the save merge keeps a key a save leaves out. Unset reads as
 * shown. The classic layout is frozen (D-041) and never shows them, so the hint says so until a design family is chosen.
 */
export function GuestShareChoice({ value, familyId, onChange }: { value?: boolean; familyId?: string; onChange: (shown: boolean) => void }) {
  const hintId = useId();
  const classic = !familyOf(familyId);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-brand-200">
        <span>Tampilkan tombol bagikan di halaman tamu</span>
        <input
          type="checkbox"
          checked={value !== false}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={hintId}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
      </label>
      <p id={hintId} className="text-pretty text-xs leading-5 text-slate-500">
        {classic
          ? 'Tata letak klasik tidak menampilkan tombol bagikan. Pilih tata letak Gapura, Kartu, Riang, atau Lontar di atas agar tombol ini tampil.'
          : 'Tamu membagikan tautan undangan umum, tidak pernah tautan pribadinya. Gambar Status / Story hanya memuat nama, tanggal, dan warna undangan, sama seperti pratinjau tautan.'}
      </p>
    </div>
  );
}
