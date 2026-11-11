import type { TemplateCategory } from './templates';

/**
 * Catalog category → core event type, without the database (B-036: the editor's theme picker and its unit tests read
 * it; `template-sync.ts` re-exports it for its existing callers).
 */

export type CoreEventType =
  | 'wedding'
  | 'birthday'
  | 'aqiqah'
  | 'tasyakuran'
  | 'khitanan'
  | 'corporate';

const CORE_EVENT_TYPES: readonly string[] = [
  'wedding',
  'birthday',
  'aqiqah',
  'tasyakuran',
  'khitanan',
  'corporate',
];

/**
 * Kategori katalog (27) → event type inti (6) yang dipahami pipeline
 * pembuatan undangan, aturan publish, dan agen desain.
 */
export const templateEventTypes: Record<TemplateCategory, CoreEventType> = {
  wedding: 'wedding',
  anniversary: 'tasyakuran',
  'bridal-shower': 'wedding',
  birthday: 'birthday',
  'aqiqah-khitanan': 'aqiqah',
  syukuran: 'tasyakuran',
  'baby-shower': 'tasyakuran',
  graduation: 'tasyakuran',
  reunion: 'corporate',
  'holiday-gathering': 'tasyakuran',
  corporate: 'corporate',
  'gender-reveal': 'tasyakuran',
  tahlilan: 'tasyakuran',
  retirement: 'corporate',
  'product-launch': 'corporate',
  conference: 'corporate',
  tradeshow: 'corporate',
  'sales-kickoff': 'corporate',
  workshop: 'corporate',
  networking: 'corporate',
  'team-building': 'corporate',
  'investor-meeting': 'corporate',
  gala: 'corporate',
  'client-vip': 'corporate',
  'employee-appreciation': 'corporate',
  shows: 'corporate',
  'community-event': 'tasyakuran',
};

/**
 * Menerjemahkan kategori yang tersimpan di DB menjadi event type inti.
 * Menerima kategori katalog baru maupun kategori inti lawas (baris seed lama),
 * dan mengembalikan null untuk nilai tak dikenal.
 */
export function resolveEventType(category: string): CoreEventType | null {
  if (category in templateEventTypes) {
    return templateEventTypes[category as TemplateCategory];
  }
  return CORE_EVENT_TYPES.includes(category) ? (category as CoreEventType) : null;
}
