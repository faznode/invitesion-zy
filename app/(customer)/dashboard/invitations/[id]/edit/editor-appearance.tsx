'use client';

import { useId, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import {
  DEFAULT_SECTION_ORDER,
  FAMILY_MANIFESTS,
  SECTION_ORDER_OPTIONS,
  type FontPairing,
  type SectionOrderOption,
} from '@/lib/invitation/family-manifest';
import type { FamilyId } from '@/lib/invitation/families';
import type { Tier } from '@/lib/pricing';

/**
 * G-041: the choices inside a design family's contract (`family-manifest.ts`): the section order, the font pairing and
 * the palette. Only contract-declared options are offered; the writers refuse anything else. Picking a family's default
 * stores the default's own id (`standard`, the family's first pairing), which renders exactly like no choice.
 */

/**
 * What a pick sends to the editor: always the option's own id, the family's default included. The save merges `theme`
 * into the stored one (`mergeDetailConfig` keeps every key a patch leaves out) and `sendDetailSave`'s `JSON.stringify`
 * drops an `undefined` key, so a default sent as "no value" never reached storage and the host could not return to it
 * (fixed in session 44). `familyChoices` reads the default ids exactly like an absent key.
 */
export const sectionOrderPick = (option: SectionOrderOption) => ({ sectionOrder: option });
export const fontPairingPick = (pairing: FontPairing) => ({ fontPairing: pairing });

export type PaletteOption = { id: string; tier: Tier; bg: string; accent: string; ink: string };

const ORDER_LABELS: Record<SectionOrderOption, { name: string; hint: string }> = {
  standard: { name: 'Urutan bawaan', hint: 'Bagian tampil sesuai urutan tata letak.' },
  'story-first': { name: 'Cerita & galeri dulu', hint: 'Cerita dan galeri tampil sebelum jadwal acara.' },
  'photos-last': { name: 'Galeri di akhir', hint: 'Galeri tampil setelah bagian lain, sebelum hadiah dan RSVP.' },
};

const FONT_LABELS: Record<FontPairing, { name: string; hint: string }> = {
  'serif-display': { name: 'Serif untuk judul', hint: 'Judul bergaya klasik, teks tetap mudah dibaca.' },
  sans: { name: 'Sans untuk semua teks', hint: 'Judul dan teks memakai huruf modern yang sama.' },
};

const paletteName = (id: string) => id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

function ChoiceCard({
  group,
  value,
  chosen,
  locked = false,
  onPick,
  children,
}: {
  group: string;
  value: string;
  chosen: boolean;
  locked?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  // The app shell pins `bg-white` and `border-slate-200` with unlayered rules (globals.css), so the chosen card carries
  // neither, as in `ThemeSwitch`.
  const tone = chosen
    ? 'cursor-pointer border-brand-500 bg-brand-50'
    : locked
      ? 'cursor-not-allowed border-slate-200 bg-slate-50'
      : 'cursor-pointer border-slate-200 bg-white hover:shadow-sm';
  return (
    <label className={`flex items-center gap-3 rounded-lg border p-3 transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-brand-100 ${tone}`}>
      <input type="radio" name={group} value={value} checked={chosen} disabled={locked} onChange={onPick} className="sr-only" />
      {children}
      {chosen ? (
        <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" />
      ) : locked ? (
        <Lock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      ) : null}
    </label>
  );
}

function Labelled({ name, hint }: { name: string; hint: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm leading-5 font-medium text-pretty text-slate-900">{name}</span>
      <span className="block text-xs leading-5 text-pretty text-slate-500">{hint}</span>
    </span>
  );
}

/** Section order and font pairing; a legacy invitation (no family) has neither, so it only gets the pointer. */
export function LayoutChoices({
  familyId,
  sectionOrder,
  fontPairing,
  onChange,
}: {
  familyId?: FamilyId;
  sectionOrder?: string;
  fontPairing?: string;
  onChange: (next: { sectionOrder?: string; fontPairing?: string }) => void;
}) {
  const orderGroup = useId();
  const fontGroup = useId();
  const manifest = familyId ? FAMILY_MANIFESTS[familyId] : undefined;
  if (!manifest) {
    return <p className="text-xs leading-5 text-pretty text-slate-500">Pilih tata letak desain untuk mengatur urutan bagian dan pasangan huruf.</p>;
  }
  const currentOrder = (SECTION_ORDER_OPTIONS as readonly string[]).includes(sectionOrder ?? '') ? sectionOrder : DEFAULT_SECTION_ORDER;
  const defaultPairing = manifest.fontPairings[0];
  const currentPairing = manifest.fontPairings.find((pairing) => pairing === fontPairing) ?? defaultPairing;
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-slate-700">Urutan bagian</legend>
        {SECTION_ORDER_OPTIONS.map((option) => (
          <ChoiceCard
            key={option}
            group={orderGroup}
            value={option}
            chosen={currentOrder === option}
            onPick={() => onChange(sectionOrderPick(option))}
          >
            <Labelled {...ORDER_LABELS[option]} />
          </ChoiceCard>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-slate-700">Pasangan huruf</legend>
        {manifest.fontPairings.map((pairing) => (
          <ChoiceCard
            key={pairing}
            group={fontGroup}
            value={pairing}
            chosen={currentPairing === pairing}
            onPick={() => onChange(fontPairingPick(pairing))}
          >
            <span aria-hidden="true" className={`w-8 shrink-0 text-center text-xl text-slate-900 ${pairing === 'sans' ? 'font-sans font-semibold' : 'font-serif'}`}>
              Aa
            </span>
            <Labelled {...FONT_LABELS[pairing]} />
          </ChoiceCard>
        ))}
      </fieldset>
    </div>
  );
}

/** Every registered palette; a Premium one is locked below a Premium entitlement, as the writers judge it. */
export function PaletteChoice({
  options,
  tier,
  paletteId,
  onPick,
}: {
  options: PaletteOption[];
  tier: Tier;
  paletteId?: string;
  onPick: (id: string) => void;
}) {
  const group = useId();
  const known = options.some((option) => option.id === paletteId);
  const someLocked = tier !== 'premium' && options.some((option) => option.tier === 'premium');
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-semibold text-slate-700">Palet warna</legend>
      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {options.map((option) => {
          const locked = option.tier === 'premium' && tier !== 'premium';
          return (
            <ChoiceCard key={option.id} group={group} value={option.id} chosen={option.id === paletteId} locked={locked} onPick={() => onPick(option.id)}>
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200">
                <span className="h-full flex-1" style={{ backgroundColor: option.bg }} />
                <span className="h-full flex-1" style={{ backgroundColor: option.accent }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm leading-5 font-medium ${locked ? 'text-slate-500' : 'text-slate-900'}`}>{paletteName(option.id)}</span>
                <span className="block text-xs text-slate-500">
                  {option.tier === 'premium' ? 'Premium' : 'Standar'}
                  {locked ? <span className="sr-only"> · perlu upgrade</span> : null}
                </span>
              </span>
            </ChoiceCard>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-pretty text-slate-500">
        {paletteId && !known ? `Palet "${paletteId}" tidak dikenal; undangan memakai Ivory sampai kamu memilih palet. ` : ''}
        {someLocked ? 'Palet Premium terbuka setelah paket di-upgrade.' : 'Semua palet tersedia untuk paketmu.'}
      </p>
    </fieldset>
  );
}
