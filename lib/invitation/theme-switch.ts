import type { Tier } from '../pricing';
import { occasionOfCategory, type Occasion } from './occasion';
import { resolveEventType } from './template-event-types';
import { invitationTemplates, type InvitationTemplate } from './templates';
import { catalogThemeTier } from './theme-entitlement';

/**
 * B-036 (D-054): the catalog themes the editor offers as a switch, for the invitation's event type. Read on the server
 * and handed to the editor as plain data; the writers judge every switch again (`theme-entitlement.ts`).
 *
 * Standard themes come first, then Premium ones, each in catalog order. A theme the config already names but the event
 * type would not list (a legacy row) is kept at the front, so the picker always shows what the invitation uses.
 */
export type ThemeSwitchOption = {
  /** The catalog id the config stores as `theme.templateId`. */
  id: number;
  name: string;
  tier: Tier;
  /** The palette a switch applies with the theme. */
  paletteId: string;
  /** Background, accent and ink of that palette, for the picker's swatch. */
  swatch: [string, string, string];
};

const optionOf = (template: InvitationTemplate): ThemeSwitchOption => ({
  id: template.id,
  name: template.name,
  tier: catalogThemeTier(template.id) ?? 'premium',
  paletteId: template.paletteId,
  swatch: [template.palette.bg, template.palette.accent, template.palette.ink],
});

export function themeSwitchOptions(eventType: string, currentTemplateId?: number, occasion?: Occasion): ThemeSwitchOption[] {
  // B-032 (G-060): a memorial is offered memorial themes only; without an occasion the list is the event type's, as before.
  const listed = invitationTemplates.filter(
    (template) => resolveEventType(template.category) === eventType && (!occasion || occasionOfCategory(template.category) === occasion),
  );
  const ordered = [...listed.filter((t) => t.tier === 'free'), ...listed.filter((t) => t.tier !== 'free')].map(optionOf);
  const current = invitationTemplates.find((template) => template.id === currentTemplateId);
  return current && !listed.includes(current) ? [optionOf(current), ...ordered] : ordered;
}
