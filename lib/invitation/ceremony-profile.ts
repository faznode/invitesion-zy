import type { DetailConfig } from './detail-config';
import { GUEST_COPY, type GuestCopy } from './guest-copy';
import type { Occasion } from './occasion';
import type { Portrait } from './portraits';

/**
 * B-029 (G-033): the profile an aqiqah, khitanan or tasyakuran host typed (the "ceremony blocks"), rendered when filled.
 * `buildGuestView()` passes the stored fields; this module keeps, per event type, exactly the fields that type's editor
 * tab offers, so a value left from another ceremony type never reaches the page. Values are trimmed, blanks dropped and
 * calendar dates formatted as written. The host's own words (doa, catatan, pesan syukur) are shown as typed: the product
 * adds no religious wording (ADR-O04). s20 (D-038): the honouree's photo, decided by `ceremonyPortrait` (children's
 * privacy rule), is passed in and shown above the facts; a photo alone is enough for the section.
 */
type StoredProfile = NonNullable<DetailConfig['ceremonyProfile']>;

export type CeremonyProfileInput = Omit<StoredProfile, 'photoUrl' | 'showPhoto'>;
export type ProfileRow = { label: string; value: string };
export type ProfileText = { label: string; text: string };
export type CeremonyProfile = { heading: string; rows: ProfileRow[]; texts: ProfileText[]; portrait?: Portrait };

export const CEREMONY_EVENT_TYPES = ['aqiqah', 'khitanan', 'tasyakuran'] as const;
export type CeremonyEventType = (typeof CEREMONY_EVENT_TYPES)[number];

export function isCeremonyEventType(value: string): value is CeremonyEventType {
  return (CEREMONY_EVENT_TYPES as readonly string[]).includes(value);
}

/** The editor's names for the thanksgiving categories (`editor.tsx`, tasyakuran tab). */
export const THANKSGIVING_LABELS = {
  housewarming: 'Rumah baru',
  promotion: 'Naik jabatan',
  graduation: 'Kelulusan / wisuda',
  new_business: 'Usaha baru',
  hajj_umrah: 'Haji / umrah',
  other: 'Lainnya',
} as const;

type ThanksgivingCategory = keyof typeof THANKSGIVING_LABELS;

/** What the achievement field holds for each category, as the editor labels it (G-018: in the guest's language). */
function achievementLabel(category: ThanksgivingCategory | undefined, labels: Record<string, string>): string {
  return (category && labels[category]) || labels.other;
}

const filled = (value: string | undefined) => value?.trim() || undefined;

// Built once per locale: constructing an Intl formatter costs far more than formatting with it (s21 profile); it holds no
// request data.
const PLAIN_DATES = new Map<string, Intl.DateTimeFormat>();
const plainDate = (locale: string) => {
  let shared = PLAIN_DATES.get(locale);
  if (!shared) {
    shared = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
    PLAIN_DATES.set(locale, shared);
  }
  return shared;
};

/**
 * "3 Oktober 2026" ("3 October 2026" with `en-GB`, G-018) for a stored calendar date (YYYY-MM-DD). A date has no zone, so
 * it is shown exactly as written.
 */
export function formatPlainDate(value: string | undefined, locale = 'id-ID'): string | undefined {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return undefined;
  return plainDate(locale).format(at);
}

/**
 * The profile for this event type with blank values dropped; null for other event types or when nothing is filled. A
 * memorial (B-032, `occasion.ts`) shows who is remembered and the family's own words, never the thanksgiving fields.
 * G-018: labels and dates in the guest's language (`copy`, Indonesian by default); the host's values as typed.
 */
export function ceremonyProfileOf(
  eventType: string,
  input: CeremonyProfileInput | undefined,
  portrait?: Portrait | null,
  occasion?: Occasion,
  copy: GuestCopy = GUEST_COPY.id,
  locale = 'id-ID',
): CeremonyProfile | null {
  if (!input || !isCeremonyEventType(eventType)) return null;
  const label = copy.profile;
  const rows: ProfileRow[] = [];
  const texts: ProfileText[] = [];
  const row = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  const text = (label: string, value: string | undefined) => {
    const trimmed = filled(value);
    if (trimmed) texts.push({ label, text: trimmed });
  };

  const honouree = filled(input.honoureeName);
  const nickName = filled(input.nickName);
  // The headline shows the nickname when there is one (`headline.ts`), so the full name is listed only then.
  const fullName = honouree && nickName && honouree !== nickName ? honouree : undefined;
  const parents = [filled(input.fatherName), filled(input.motherName)].filter(Boolean).join(' & ') || filled(input.parents);

  if (eventType === 'aqiqah') {
    row(label.fullName, fullName);
    row(label.gender, input.gender ? label.genders[input.gender] : undefined);
    row(label.childOrder, input.childOrder ? label.childNumber(input.childOrder) : undefined);
    const born = [filled(input.birthPlace), formatPlainDate(input.birthDate, locale)].filter(Boolean).join(', ');
    const time = filled(input.birthTime);
    row(label.born, born && time ? label.bornAt(born, time) : born || (time ? label.atTime(time) : undefined));
    row(label.birthWeight, filled(input.birthWeight));
    row(label.birthLength, filled(input.birthLength));
    row(label.parents, parents);
    text(label.nameMeaning, input.nameMeaning);
    text(label.prayer, input.prayer);
  } else if (eventType === 'khitanan') {
    row(label.fullName, fullName);
    row(label.age, input.age ? label.years(input.age) : undefined);
    row(label.school, filled(input.school));
    row(label.circumcisionDate, formatPlainDate(input.circumcisionDate, locale));
    row(label.parents, parents);
    text(label.prayer, input.prayer);
    text(label.note, input.recoveryNote);
  } else if (occasion === 'memorial') {
    row(label.fullName, fullName);
    row(label.family, parents);
    text(label.familyMessage, input.ceremonyNote);
  } else {
    const category = input.thanksgivingCategory;
    row(label.occasion, filled(input.thanksgivingTitle));
    row(label.thanksgivingType, category ? label.thanksgivingTypes[category] : undefined);
    row(achievementLabel(category, label.achievements), filled(input.achievement));
    text(label.thanksMessage, input.ceremonyNote);
  }

  if (!rows.length && !texts.length && !portrait) return null;
  const heading = occasion === 'memorial' ? copy.memorial.heading : eventType === 'tasyakuran' ? label.aboutThanksgiving : label.aboutChild;
  return { heading, rows, texts, ...(portrait && { portrait }) };
}
