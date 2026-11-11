'use client';

import Link from 'next/link';
import { useId } from 'react';

/**
 * G-055 (I-30): the host's opt-in to printable cards and the public e-card (`settings.cardExport`), saved through the
 * normal save as an explicit boolean (the save merge keeps a key a save leaves out). Unset reads as off. The cards
 * themselves live on their own owner page, reached from here once the opt-in is saved.
 */
export function CardExportChoice({ value, cardsHref, onChange }: { value?: boolean; cardsHref: string; onChange: (on: boolean) => void }) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-brand-200">
        <span>Izinkan kartu cetak & e-card</span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={hintId}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
      </label>
      <p id={hintId} className="text-pretty text-xs leading-5 text-slate-500">
        Kartu A6 siap cetak dengan kode QR ke undangan yang sudah aktif. E-card umum hanya memuat nama, tanggal, dan warna
        undangan; kartu per tamu, dengan nama dan tautan pribadinya, hanya bisa diunduh pemilik.
      </p>
      {value === true && (
        <Link href={cardsHref} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-brand-700 underline underline-offset-2">
          Buka halaman kartu (simpan dulu perubahan)
        </Link>
      )}
    </div>
  );
}
