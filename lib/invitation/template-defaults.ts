import { detailConfigSchema, type DetailConfig } from './detail-config';
import { getThemeArt } from './theme-art';
import type { InvitationTemplate } from './templates';

/**
 * Keys a catalog template stores next to its preset that belong to the template, not to an invitation
 * (ADR-O01). `art` (cover + gallery photo pool) is resolved through the invitation's template and is never
 * copied into the invitation's strict `DetailConfig`.
 */
export const TEMPLATE_OWNED_KEYS = ['art'] as const;

/** What `template-sync.ts` stores in `templates.default_config` for a catalog template. */
export function catalogDefaultConfig(template: InvitationTemplate): Record<string, unknown> {
  return { ...(template.preset as Record<string, unknown>), art: getThemeArt(template) };
}

export type PresetConfigResult =
  | { ok: true; config: DetailConfig; droppedKeys: string[] }
  | { ok: false; config: Record<string, never>; issues: string[] };

/**
 * Turns a template's stored defaults into the starting config of a new invitation: template-owned keys are
 * set aside first, then the rest must pass the strict invitation schema. Before this existed, `create.ts`
 * parsed `{ ...preset, art }` directly, the strict schema rejected `art`, and every catalog invitation
 * started from `{}`.
 */
export function presetConfigFromTemplateDefaults(defaultConfig: unknown): PresetConfigResult {
  if (defaultConfig === null || defaultConfig === undefined) return { ok: true, config: {}, droppedKeys: [] };
  if (typeof defaultConfig !== 'object' || Array.isArray(defaultConfig)) {
    return { ok: false, config: {}, issues: ['template defaults are not an object'] };
  }
  const preset: Record<string, unknown> = { ...(defaultConfig as Record<string, unknown>) };
  const droppedKeys: string[] = [];
  for (const key of TEMPLATE_OWNED_KEYS) {
    if (key in preset) {
      delete preset[key];
      droppedKeys.push(key);
    }
  }
  const parsed = detailConfigSchema.safeParse(preset);
  if (!parsed.success) {
    return { ok: false, config: {}, issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`) };
  }
  return { ok: true, config: parsed.data, droppedKeys };
}
