import { cookies, headers } from 'next/headers';
import type { Locale } from './i18n';

/** Locale is resolved in middleware from country/CDN + browser language. */
export async function getLocale(): Promise<Locale> {
  const locale = (await headers()).get('x-app-locale');
  if (locale === 'en' || locale === 'id') return locale;

  // Safe fallback for direct server rendering outside middleware.
  const cookieLocale = (await cookies()).get('locale')?.value;
  return cookieLocale === 'en' ? 'en' : 'id';
}

export function t(locale: Locale, id: string, en: string) {
  return locale === 'en' ? en : id;
}
