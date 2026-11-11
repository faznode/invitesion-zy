import { ownerReviewStatus, type ArtReviewState, type SeededState } from '@/lib/invitation/catalog-admin-view';
import type { TemplatePalette } from '@/lib/invitation/templates';
import type { CATALOG_ADMIN_COPY } from './copy';

type Copy = (typeof CATALOG_ADMIN_COPY)['id'];

const badge = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium';

export function StatusBadge({ valid, problems, copy }: { valid: boolean; problems: number; copy: Copy }) {
  return valid ? (
    <span className={`${badge} bg-emerald-50 text-emerald-800`}>{copy.status.valid}</span>
  ) : (
    <span className={`${badge} bg-rose-50 text-rose-800`}>{copy.status.invalid(problems)}</span>
  );
}

const REVIEW_TONE = {
  'no-files': 'bg-slate-100 text-slate-700',
  approved: 'bg-emerald-50 text-emerald-800',
  pending: 'bg-amber-50 text-amber-900',
  unrecorded: 'bg-rose-50 text-rose-800',
} as const;

export function ReviewBadge({ review, copy }: { review: ArtReviewState; copy: Copy }) {
  const status = ownerReviewStatus(review);
  return <span className={`${badge} ${REVIEW_TONE[status]}`}>{copy.review[status]}</span>;
}

export function SeededLabel({ seeded, copy }: { seeded: SeededState; copy: Copy }) {
  if (!seeded) return <span className={`${badge} bg-amber-50 text-amber-900`}>{copy.database.notSeeded}</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-xs text-slate-700">{copy.database.row(seeded.rowId)}</span>
      {!seeded.premiumAgrees && <span className={`${badge} bg-rose-50 text-rose-800`}>{copy.database.premiumDiffers}</span>}
    </span>
  );
}

/** Colour chips with their hex values as text, so nothing depends on seeing the colour. */
export function Swatch({ color, label }: { color: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="size-4 shrink-0 rounded border border-slate-300" style={{ backgroundColor: color }} />
      {label ? <span className="text-xs text-slate-600">{label}</span> : null}
      <span className="font-mono text-xs text-slate-800">{color}</span>
    </span>
  );
}

export function SwatchRow({ palette }: { palette: TemplatePalette | null }) {
  if (!palette) return <span className="text-xs text-slate-500">—</span>;
  const colors = [palette.bg, palette.ink, palette.accent, palette.soft];
  return (
    <span className="flex items-center gap-1" title={colors.join(' · ')}>
      {colors.map((color, index) => (
        <span key={`${color}-${index}`} aria-hidden="true" className="size-4 rounded border border-slate-300" style={{ backgroundColor: color }} />
      ))}
      <span className="sr-only">{colors.join(', ')}</span>
    </span>
  );
}
