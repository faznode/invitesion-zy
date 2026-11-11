import { normalizeStoredConfig } from './content-read';

/**
 * G-046: what the owner's history page says about each saved version, in the host's words. Pure (no database), so the
 * page, the route and the tests share one reading of a version.
 */

/** Versions listed per page; older ones are reached with `?sebelum=<number>`. */
export const HISTORY_PAGE_SIZE = 30;

/** The editor's names for the config's sections; a section without one is shown by its key. */
export const SECTION_LABELS: Record<string, string> = {
  settings: 'Pengaturan',
  couple: 'Mempelai',
  birthdayPerson: 'Yang berulang tahun',
  ceremonyProfile: 'Profil acara',
  corporateProfile: 'Profil perusahaan',
  theme: 'Tema & cover',
  events: 'Acara',
  music: 'Musik',
  greetings: 'Salam & doa',
  postEvent: 'Kenangan setelah acara',
  gift: 'Hadiah',
  rsvp: 'RSVP',
  gallery: 'Galeri',
  streaming: 'Siaran langsung',
  story: 'Cerita',
  instagramStory: 'Story Instagram',
  quote: 'Kutipan',
  guestbook: 'Buku ucapan',
  eventPlanner: 'Perencana acara',
  registrationForm: 'Formulir pendaftaran',
  mealPreferences: 'Pilihan menu',
  communications: 'Komunikasi',
  checkInSettings: 'Check-in',
  seatingPlan: 'Denah tempat duduk',
  secondaryEvents: 'Acara tambahan',
  ticketing: 'Tiket',
  eventOperations: 'Operasional acara',
  whatsappTemplate: 'Templat WhatsApp',
};

/** JSON with object keys in one order, so two equal sections compare equal whatever order they were stored in. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The sections a version holds differently from today's config, as readers see both, in the editor's names. */
export function changedSections(current: unknown, version: unknown): string[] {
  const now = normalizeStoredConfig(current).config as Record<string, unknown>;
  const then = normalizeStoredConfig(version).config as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(now), ...Object.keys(then)])].filter((key) => key !== 'schemaVersion');
  return keys
    .filter((key) => stable(now[key]) !== stable(then[key]))
    .sort((a, b) => Object.keys(SECTION_LABELS).indexOf(a) - Object.keys(SECTION_LABELS).indexOf(b))
    .map((key) => SECTION_LABELS[key] ?? key);
}

/** Who saved a version: the editor (customer) or the assistant. */
export function versionAuthor(createdBy: string): string {
  return createdBy === 'ai-agent' ? 'Dibuat asisten' : 'Disimpan dari editor';
}

const VERSION_TIME = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/** When a version was saved, in Western Indonesia Time (the dashboard's convention). */
export function versionTime(createdAt: Date): string {
  return `${VERSION_TIME.format(createdAt)} WIB`;
}

/** `?sebelum=` as a version number, or undefined for the first page. */
export function historyCursor(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
}
