import type { TemplateCategory } from './templates';

/**
 * B-032 (G-060, I-13): the occasion a catalog category stands for when its core event type is broader. The six core
 * event types drive creation, pricing, publishing and both writers; a memorial (tahlilan) shares `tasyakuran` with
 * celebrations, so its preset stores the occasion in `settings.occasion` and the guest page, the wizard and the editor
 * read it to keep the product's own words sober. Absent means the event type's own occasion, so every invitation created
 * before B-032 (memorials included) renders exactly as before.
 *
 * No runtime imports on purpose: the editor (a client component) and `detail-config.ts` both use this module.
 */
export const OCCASIONS = ['memorial'] as const;
export type Occasion = (typeof OCCASIONS)[number];

const OCCASION_BY_CATEGORY: Partial<Record<TemplateCategory, Occasion>> = { tahlilan: 'memorial' };

export function occasionOfCategory(category: string): Occasion | undefined {
  return Object.hasOwn(OCCASION_BY_CATEGORY, category) ? OCCASION_BY_CATEGORY[category as TemplateCategory] : undefined;
}

type WithSettings = { settings?: { occasion?: unknown } | null } | null | undefined;

/** The occasion a config declares; any other stored value reads as none. */
export function occasionOf(config: WithSettings): Occasion | undefined {
  const value = config?.settings?.occasion;
  return (OCCASIONS as readonly unknown[]).includes(value) ? (value as Occasion) : undefined;
}

export const isMemorial = (config: WithSettings): boolean => occasionOf(config) === 'memorial';

/**
 * The product's own words for a memorial wherever a celebration shows its event type's. Neutral labels only, never
 * religious text (ADR-O04: that comes from the owner-approved corpus alone). Tahlilan is the only memorial category
 * today, so the invitation is named after it.
 */
export const MEMORIAL_COPY = {
  invitation: 'Undangan Tahlilan & Doa',
  firstEventTitle: { id: 'Tahlilan & Doa Bersama', en: 'Memorial Prayers' },
  nameField: 'Nama almarhum/almarhumah',
  profileTab: 'Almarhum/almarhumah & keluarga',
  profileHeading: 'Dalam Kenangan',
} as const;
