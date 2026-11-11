import { z } from 'zod';
import { boundedSlugBase, catalogIdOfDefaults } from './creation-rules';
import { detailConfigSchema, type DetailConfig } from './detail-config';
import { EVENT_ID_PATTERN, legacyEventPosition } from './event-ids';
import { newInvitationConfig } from './new-invitation';
import { MEMORIAL_COPY, occasionOf, type Occasion } from './occasion';
import { slugify } from './slug';
import { presetConfigFromTemplateDefaults } from './template-defaults';
import type { InvitationTemplate } from './templates';

/**
 * B-037 + I-08: the wizard's typed content (names, date, theme) and how it becomes an invitation config. Pure and shared by
 * the try-with-your-names preview (`/buat/pratinjau`, nothing stored) and the draft creation (`creation.ts`), so the page
 * the visitor sees before saving is built from exactly the config the draft stores (`initialDraftConfig`).
 *
 * The typed content lives only in the visitor's own browser between requests: an HttpOnly cookie scoped to `/buat`
 * (`encodeTrialState`), never a URL (names would reach history, logs and Referer) and never the database before save.
 */

type Config = Record<string, unknown>;
type Env = Record<string, string | undefined>;

export const TRIAL_NAME_MAX = 60;
export const TRIAL_ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;
export type TrialZone = (typeof TRIAL_ZONES)[number];
const ZONE_OFFSETS: Record<TrialZone, string> = { 'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00' };

/**
 * Typed names keep every script (RTL, emoji, long names up to the limit); control characters and explicit bidi
 * embedding / override / isolate controls are removed, so a name cannot reorder the text around it where it is shown.
 * React escapes the rest wherever it renders.
 */
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const nameField = z
  .string()
  .transform((value) => value.replace(CONTROL_CHARS, '').replace(BIDI_CONTROLS, '').trim())
  .pipe(z.string().max(TRIAL_NAME_MAX, `Maksimal ${TRIAL_NAME_MAX} karakter.`));

export const trialInputSchema = z
  .object({
    /** The chosen catalog theme (`templates.ts` slug). */
    slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    /** Bride, celebrant, honouree or event name, by event type (`trialFieldsFor`). */
    first: nameField,
    /** Groom (wedding) or organiser (corporate); unused for the other types. */
    second: nameField,
    /** The event's date, `YYYY-MM-DD`, or empty while the visitor has not chosen one. */
    date: z.union([z.literal(''), z.string().date('Tanggal tidak valid.')]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam tidak valid.'),
    zone: z.enum(TRIAL_ZONES),
  })
  .strict();

export type TrialInput = z.infer<typeof trialInputSchema>;

export const EMPTY_TRIAL_INPUT: Omit<TrialInput, 'slug'> = { first: '', second: '', date: '', time: '10:00', zone: 'Asia/Jakarta' };

/**
 * The draft key that makes a creation idempotent per owner (D-055): minted once per wizard page (or taken from the
 * visitor's cookie) and sent with every update and save, so a queued double tap, a retry after the first save cleared
 * the cookie, or a resend after an unknown outcome all carry the same key and find the one draft.
 */
export const draftKeySchema = z.string().uuid();

/** What the visitor's cookie carries: the input plus the draft key. */
export const trialStateSchema = trialInputSchema.extend({ v: z.literal(1), key: draftKeySchema }).strict();
export type TrialState = z.infer<typeof trialStateSchema>;

/** Base64url JSON; a cookie value never needs quoting or escaping. */
export function encodeTrialState(state: TrialState): string {
  return Buffer.from(JSON.stringify(trialStateSchema.parse(state)), 'utf8').toString('base64url');
}

/** The state a cookie carries, or null for anything that is not one (absent, oversized, tampered, an older shape). */
export function decodeTrialState(raw: string | null | undefined): TrialState | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed = trialStateSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type TrialFieldLabels = { first: string; second: string | null; secondRequired: boolean };

/** The name fields the wizard asks for, by core event type; a memorial (B-032) asks for the name of the one remembered. */
export function trialFieldsFor(eventType: string, occasion?: Occasion): TrialFieldLabels {
  if (occasion === 'memorial') return { first: MEMORIAL_COPY.nameField, second: null, secondRequired: false };
  switch (eventType) {
    case 'wedding':
      return { first: 'Nama panggilan mempelai wanita', second: 'Nama panggilan mempelai pria', secondRequired: true };
    case 'birthday':
      return { first: 'Nama yang berulang tahun', second: null, secondRequired: false };
    case 'aqiqah':
    case 'khitanan':
      return { first: 'Nama anak', second: null, secondRequired: false };
    case 'corporate':
      return { first: 'Nama acara', second: 'Penyelenggara', secondRequired: false };
    default:
      return { first: 'Nama tuan rumah', second: null, secondRequired: false };
  }
}

const EVENT_TITLES: Record<string, { id: string; en: string }> = {
  wedding: { id: 'Resepsi', en: 'Reception' },
  birthday: { id: 'Pesta Ulang Tahun', en: 'Birthday Party' },
  aqiqah: { id: 'Aqiqah', en: 'Aqiqah' },
  khitanan: { id: 'Khitanan', en: 'Khitanan' },
  tasyakuran: { id: 'Tasyakuran', en: 'Thanksgiving' },
  corporate: { id: 'Acara Utama', en: 'Main Event' },
};

/**
 * The wizard's event id: fixed by the draft key, so the preview and the stored draft carry the same id (D-036 needs a
 * durable id; the key is random, so the id is too). Never a legacy positional id (`ev-<1–999>`).
 */
export function trialEventId(key: string): string {
  const id = `ev-${key.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10) || 'wizard'}`;
  return EVENT_ID_PATTERN.test(id) && legacyEventPosition(id) === null ? id : 'ev-wizard';
}

const isRecord = (value: unknown): value is Config => typeof value === 'object' && value !== null && !Array.isArray(value);
const section = (config: Config, key: string): Config => (isRecord(config[key]) ? (config[key] as Config) : {});
const filled = (value: string) => (value ? value : undefined);
const withoutUndefined = (record: Config): Config => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

/** The typed names and date on top of a config: only filled fields are set, every other key stays as it was. */
export function applyTrialContent(config: Config, eventType: string, input: Omit<TrialInput, 'slug'>, key: string): Config {
  const first = input.first.trim();
  const second = input.second.trim();
  const next: Config = { ...config };
  switch (eventType) {
    case 'wedding': {
      const couple = section(config, 'couple');
      next.couple = withoutUndefined({
        ...couple,
        bride: withoutUndefined({ ...section(couple, 'bride'), nickName: filled(first) ?? section(couple, 'bride').nickName }),
        groom: withoutUndefined({ ...section(couple, 'groom'), nickName: filled(second) ?? section(couple, 'groom').nickName }),
      });
      break;
    }
    case 'birthday':
      next.birthdayPerson = withoutUndefined({ ...section(config, 'birthdayPerson'), nickName: filled(first) ?? section(config, 'birthdayPerson').nickName });
      break;
    case 'corporate': {
      const profile = section(config, 'corporateProfile');
      next.corporateProfile = withoutUndefined({
        ...profile,
        eventName: filled(first) ?? profile.eventName,
        organizationName: filled(second) ?? profile.organizationName,
      });
      break;
    }
    default:
      next.ceremonyProfile = withoutUndefined({ ...section(config, 'ceremonyProfile'), nickName: filled(first) ?? section(config, 'ceremonyProfile').nickName });
  }
  if (input.date) {
    const language = section(config, 'settings').language === 'en' ? 'en' : 'id';
    // B-032: a memorial preset's first event is never titled "Tasyakuran / Thanksgiving".
    const titles = occasionOf(config) === 'memorial' ? MEMORIAL_COPY.firstEventTitle : (EVENT_TITLES[eventType] ?? EVENT_TITLES.tasyakuran);
    next.events = [{ id: trialEventId(key), title: titles[language], startAt: `${input.date}T${input.time}:00${ZONE_OFFSETS[input.zone]}` }];
  }
  return next;
}

export type InitialDraftConfig = { config: DetailConfig; presetIssues: string[] };

/**
 * The config a new draft starts with, the one rule for creation and for the preview: the template's stored defaults
 * (template-owned keys set aside, strict schema, B-001), then the defaults only a new invitation receives
 * (`newInvitationConfig`: gift details on personal links, B-026; the event type's design family, F-02), then the
 * wizard's typed content when there is any. Defaults the strict schema refuses degrade to an empty preset, as creation
 * always did, keeping only the catalog id the defaults name so the draft still names its purchased theme (D-055).
 */
export function initialDraftConfig(
  defaultConfig: unknown,
  eventType: string,
  trial: { input: Omit<TrialInput, 'slug'>; key: string } | null,
  env: Env = process.env,
): InitialDraftConfig {
  const preset = presetConfigFromTemplateDefaults(defaultConfig);
  const catalogId = catalogIdOfDefaults(defaultConfig);
  const start: Config = preset.ok ? (preset.config as Config) : catalogId !== null ? { theme: { templateId: catalogId } } : {};
  const base = newInvitationConfig(start, eventType, env);
  const config = trial ? applyTrialContent(base, eventType, trial.input, trial.key) : base;
  const checked = detailConfigSchema.safeParse(config);
  if (!checked.success) {
    // The typed fields are bounded below every schema limit, so this is a programming error, never a visitor's input.
    throw new Error(`[trial] draft config refused: ${checked.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return { config: config as DetailConfig, presetIssues: preset.ok ? [] : preset.issues };
}

/** Sample names from the catalog card, shown in the preview until the visitor types their own. */
export function trialPlaceholders(template: Pick<InvitationTemplate, 'sample'>, eventType: string): { first: string; second: string } {
  const names = template.sample.names.trim();
  if (eventType === 'wedding') {
    const [first = '', second = ''] = names.split('&').map((part) => part.trim());
    return { first, second };
  }
  return { first: names, second: '' };
}

/** The input the preview renders: the typed names, or the catalog's sample names where a field is still empty. */
export function previewInput(input: Omit<TrialInput, 'slug'>, placeholders: { first: string; second: string }, eventType: string): Omit<TrialInput, 'slug'> {
  const usesSecond = trialFieldsFor(eventType).second !== null;
  return {
    ...input,
    first: input.first.trim() || placeholders.first.slice(0, TRIAL_NAME_MAX),
    second: usesSecond ? input.second.trim() || placeholders.second.slice(0, TRIAL_NAME_MAX) : input.second,
  };
}

export type TrialFieldIssue = { field: 'first' | 'second' | 'date'; message: string };

/** What a save needs before it may create the draft: the names the event type asks for and the date. */
export function trialSaveIssues(eventType: string, input: Omit<TrialInput, 'slug'>, occasion?: Occasion): TrialFieldIssue[] {
  const fields = trialFieldsFor(eventType, occasion);
  const issues: TrialFieldIssue[] = [];
  if (!input.first.trim()) issues.push({ field: 'first', message: `${fields.first} wajib diisi.` });
  if (fields.second && fields.secondRequired && !input.second.trim()) issues.push({ field: 'second', message: `${fields.second} wajib diisi.` });
  if (!input.date) issues.push({ field: 'date', message: 'Tanggal acara wajib diisi.' });
  return issues;
}

/**
 * The draft's slug before any numbered suffix: from the typed names when they have letters a URL can carry, otherwise from
 * the template's name (creation's rule before B-037), otherwise the event type. Bounded for the `-200` suffix.
 */
export function draftSlugBase(eventType: string, input: Omit<TrialInput, 'slug'> | null, fallbackTitle?: string | null): string {
  const names = input ? (eventType === 'wedding' || eventType === 'corporate' ? [input.first, input.second] : [input.first]) : [];
  const fromNames = slugify(names.map((name) => name.trim()).filter(Boolean).join(' '), '');
  const fromTitle = slugify(fallbackTitle ?? '', '');
  return boundedSlugBase(fromNames || fromTitle || eventType, slugify(eventType, 'undangan'));
}
