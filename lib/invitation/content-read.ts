import { CONTENT_SCHEMA_VERSION } from './content-contract';
import { customQuestionSchema, detailConfigSchema, mergeDetailConfig, registrationFormReadSchema, type DetailConfig } from './detail-config';
import { keyEventsForWrite, keyStoredEvents, rekeyRestoredEvents } from './event-ids';

export type NormalizedConfig = { config: DetailConfig; version: number; dropped: string[] };
type RegistrationForm = NonNullable<DetailConfig['registrationForm']>;

/**
 * S18-Q4 / D-035: the registration form is the one section whose rules reach across items (unique ids, a condition naming
 * another question), so one question an older version or a hand edit left inconsistent used to take the whole form off the
 * page, every question column out of the export and every question out of the editor. Read it question by question
 * instead: a question that does not parse, or repeats an id (the first one stays), is left out, because no reader could
 * ever show it; a condition naming a missing question stays, because D-034 already treats that question as never applying
 * and its stored answers belong in the export. `removed` counts the left-out questions; `undefined` = not readable at all.
 */
function readRegistrationForm(value: unknown): { form: RegistrationForm; removed: number } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.customQuestions)) return undefined;
  const ids = new Set<string>();
  const questions = raw.customQuestions.flatMap((item) => {
    const parsed = customQuestionSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id)) return [];
    ids.add(parsed.data.id);
    return [parsed.data];
  });
  const parsed = registrationFormReadSchema.safeParse({ ...raw, customQuestions: questions });
  return parsed.success ? { form: parsed.data, removed: raw.customQuestions.length - questions.length } : undefined;
}

/**
 * Read path for stored configs. The strict schema stays on the write path; reading is lenient per section, so a
 * config written by an older version (or containing a section today's rules reject) loses only that section instead
 * of rendering as an empty invitation. `dropped` names the removed top-level keys (never their values) for logging;
 * `registrationForm.customQuestions` means the form was kept with some unreadable questions left out.
 * `schemaVersion` absent = 1 (every config written before the field existed). Version 2 (D-036): every event carries a
 * durable id. The step from 1 is `keyStoredEvents`, applied on every read so a config the backfill (migration 0013) left
 * alone, or one a writer stored without ids, reads with the same ids each time; the write path persists them.
 */
export function normalizeStoredConfig(raw: unknown): NormalizedConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { config: {}, version: CONTENT_SCHEMA_VERSION, dropped: [] };
  const record = raw as Record<string, unknown>;
  const version = typeof record.schemaVersion === 'number' && Number.isInteger(record.schemaVersion) ? record.schemaVersion : 1;
  const shape = detailConfigSchema.shape as Record<string, { safeParse: (value: unknown) => { success: boolean; data?: unknown } }>;
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  let readForm: RegistrationForm | undefined;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'schemaVersion') continue;
    const parsed = shape[key]?.safeParse(key === 'events' ? keyStoredEvents(value) : value);
    if (parsed?.success) {
      kept[key] = parsed.data;
      continue;
    }
    const read = key === 'registrationForm' ? readRegistrationForm(value) : undefined;
    if (read) {
      readForm = read.form;
      if (read.removed) dropped.push('registrationForm.customQuestions');
    } else dropped.push(key);
  }
  // A form kept by the read rules may name a missing question, which the strict whole would refuse; it joins afterwards.
  const whole = detailConfigSchema.safeParse(kept);
  if (!whole.success) return { config: {}, version, dropped: Object.keys(record) };
  return { config: readForm ? { ...whole.data, registrationForm: readForm } : whole.data, version, dropped };
}

/**
 * The write path's half of S18-Q4 / D-035: a save that does not touch the registration form carries the stored form as
 * every reader already sees it, so a condition naming a deleted question cannot block saving another section and is
 * never silently rewritten into a different form. `undefined` = nothing to carry: the stored form passes the strict rules
 * (or is absent), or not even the read rules accept it, in which case the strict parse refuses the save as before.
 */
export function carriedRegistrationForm(raw: unknown): { rest: Record<string, unknown>; form: RegistrationForm } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { registrationForm, ...rest } = raw as Record<string, unknown>;
  if (registrationForm === undefined || detailConfigSchema.shape.registrationForm.safeParse(registrationForm).success) return undefined;
  const read = readRegistrationForm(registrationForm);
  return read ? { rest, form: read.form } : undefined;
}

/**
 * The config a save stores: the stored config with the patch merged in and the whole re-validated strictly, so a partial
 * patch cannot produce an invalid whole (an invalid whole throws the schema's error, as before).
 * - S18-Q4 / D-035: a save that leaves the registration form alone carries it as every reader sees it.
 * - D-036: carried events keep the ids readers derive (`keyStoredEvents`), so the first save of a pre-0013 config persists
 *   exactly the ids guests already answered under; events the writer sends without a usable id are new and get a fresh
 *   random id. The content version is stamped.
 */
export function prepareConfigWrite(stored: Record<string, unknown>, patch: DetailConfig): DetailConfig {
  const carried = patch.registrationForm === undefined ? carriedRegistrationForm(stored) : undefined;
  const base = carried?.rest ?? stored;
  const keyedBase = Array.isArray(base.events) ? { ...base, events: keyStoredEvents(base.events) } : base;
  const keyedPatch = patch.events ? { ...patch, events: keyEventsForWrite(patch.events) } : patch;
  const merged = { ...mergeDetailConfig(keyedBase, keyedPatch as Record<string, unknown>), schemaVersion: CONTENT_SCHEMA_VERSION };
  const parsed = detailConfigSchema.parse(merged);
  return carried ? { ...parsed, registrationForm: carried.form } : parsed;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * G-046: the config a restore stores. The saved version as a whole, not merged into today's config (a section the version
 * did not have is not carried over), re-validated strictly like every save. Null when there is nothing faithful to
 * restore: no config, or a section today's rules no longer read (the restore would silently drop it).
 * - D-036 (`rekeyRestoredEvents`): the version's events are keyed before the read rules see them, because the read path
 *   would give an id-less event its old position's id, which may now belong to another event. An event with an id keeps
 *   it, so answers stored for it reattach; an id-less one takes the id of today's event with the same title and start.
 * - S18-Q4 / D-035: a registration form only the read rules accept joins after the strict parse, as on the save path.
 */
export function prepareRestoreWrite(stored: Record<string, unknown>, version: unknown): DetailConfig | null {
  if (!isRecord(version)) return null;
  const events = version.events;
  const source = Array.isArray(events) && events.every(isRecord)
    ? { ...version, events: rekeyRestoredEvents(events, normalizeStoredConfig(stored).config.events ?? []) }
    : version;
  const { config, dropped } = normalizeStoredConfig(source);
  if (dropped.some((key) => key !== 'registrationForm.customQuestions')) return null;
  const { registrationForm, ...rest } = config;
  const strictForm = registrationForm !== undefined && detailConfigSchema.shape.registrationForm.safeParse(registrationForm).success;
  const parsed = detailConfigSchema.parse({ ...rest, ...(strictForm ? { registrationForm } : {}), schemaVersion: CONTENT_SCHEMA_VERSION });
  return registrationForm && !strictForm ? { ...parsed, registrationForm } : parsed;
}
