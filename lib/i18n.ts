export type Locale = 'id' | 'en';

const ENGLISH_COUNTRIES = new Set([
  'AU', 'CA', 'GB', 'IE', 'IN', 'MY', 'NZ', 'PH', 'SG', 'US', 'ZA',
]);

/**
 * Geo country is supplied by the trusted reverse-proxy/CDN header. It is a
 * stronger signal than browser UI language for an automatic first choice.
 */
export function localeFromCountry(country?: string | null): Locale | null {
  if (!country || country.length !== 2) return null;
  return ENGLISH_COUNTRIES.has(country.toUpperCase()) ? 'en' : 'id';
}

/** Reads the first weighted browser language tag, not a substring match. */
export function localeFromAcceptLanguage(value?: string | null): Locale | null {
  if (!value) return null;
  const firstLanguage = value.split(',')[0]?.trim().toLowerCase();
  if (!firstLanguage) return null;
  return firstLanguage === 'en' || firstLanguage.startsWith('en-') ? 'en' : 'id';
}

/** Auto policy: trusted geo -> browser preference -> Indonesian default. */
export function resolveLocale(country?: string | null, acceptLanguage?: string | null): Locale {
  return localeFromCountry(country) ?? localeFromAcceptLanguage(acceptLanguage) ?? 'id';
}

export function invitationStatusLabel(status: string, locale: Locale) {
  const labels = locale === 'en'
    ? { DRAFT: 'Draft', PUBLISHED: 'Published', EXPIRED: 'Expired' }
    : { DRAFT: 'Draf', PUBLISHED: 'Tayang', EXPIRED: 'Berakhir' };
  return labels[status as keyof typeof labels] ?? status;
}

export function rsvpStatusLabel(status: string, locale: Locale) {
  const labels = locale === 'en'
    ? { PENDING: 'Pending', CONFIRMED: 'Confirmed', DECLINED: 'Declined', MAYBE: 'Maybe' }
    : { PENDING: 'Menunggu', CONFIRMED: 'Hadir', DECLINED: 'Tidak hadir', MAYBE: 'Mungkin' };
  return labels[status as keyof typeof labels] ?? status;
}

export const messages = {
  id: {
    overview: 'Ringkasan', invitations: 'Undangan saya', guests: 'Tamu & RSVP',
    templates: 'Pilih tema', account: 'Akun', logout: 'Keluar',
  },
  en: {
    overview: 'Overview', invitations: 'My invitations', guests: 'Guests & RSVP',
    templates: 'Choose a theme', account: 'Account', logout: 'Sign out',
  },
} as const;
