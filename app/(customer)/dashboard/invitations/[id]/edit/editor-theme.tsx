'use client';

import { useId } from 'react';
import { Check, Lock } from 'lucide-react';
import type { ThemeSwitchOption } from '@/lib/invitation/theme-switch';
import type { Tier } from '@/lib/pricing';

/**
 * B-036 (D-054): switch the catalog theme without paying again. Choosing a theme sets its catalog id and its palette;
 * the content, layout and cover stay. Premium themes above the entitled tier are shown locked: the upgrade belongs to
 * U6's checkout, and the writers refuse them anyway (`premium-template`).
 */
export function ThemeSwitch({
  options,
  tier,
  templateId,
  paletteId,
  onPick,
}: {
  options: ThemeSwitchOption[];
  tier: Tier;
  templateId?: number;
  paletteId?: string;
  onPick: (option: ThemeSwitchOption) => void;
}) {
  const group = useId();
  if (!options.length) return <p className="text-sm text-slate-500">Belum ada tema katalog untuk jenis acara ini.</p>;

  const current = options.find((option) => option.id === templateId);
  const someLocked = tier !== 'premium' && options.some((option) => option.tier === 'premium');
  const summary = current
    ? `Dipakai: ${current.name}`
    : templateId
      ? `Tema #${templateId} tidak ada di katalog.`
      : 'Belum memakai tema katalog.';

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-semibold text-slate-700">Tema katalog</legend>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {options.map((option) => {
          const locked = option.tier === 'premium' && tier !== 'premium';
          const chosen = option.id === templateId;
          // The app shell pins `bg-white` and `border-slate-200` with unlayered rules (globals.css), so the chosen card
          // carries neither: state variants on the same element could never win against them.
          const tone = chosen
            ? 'cursor-pointer border-brand-500 bg-brand-50'
            : locked
              ? 'cursor-not-allowed border-slate-200 bg-slate-50'
              : 'cursor-pointer border-slate-200 bg-white hover:shadow-sm';
          return (
            <label
              key={option.id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-brand-100 ${tone}`}
            >
              <input
                type="radio"
                name={group}
                value={option.id}
                checked={chosen}
                disabled={locked}
                onChange={() => onPick(option)}
                className="sr-only"
              />
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200">
                {option.swatch.map((color, index) => (
                  <span key={index} className="h-full flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm leading-5 font-medium text-pretty ${locked ? 'text-slate-500' : 'text-slate-900'}`}>{option.name}</span>
                <span className="block text-xs text-slate-500">
                  {option.tier === 'premium' ? 'Premium' : 'Standar'}
                  {locked ? <span className="sr-only"> · perlu upgrade</span> : null}
                </span>
              </span>
              {chosen ? (
                <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" />
              ) : locked ? (
                <Lock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
              ) : null}
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-pretty text-slate-500">
        {summary} · Palet: {paletteId ?? 'bawaan'}.{someLocked ? ' Tema Premium terbuka setelah paket di-upgrade.' : ''}
      </p>
    </fieldset>
  );
}
