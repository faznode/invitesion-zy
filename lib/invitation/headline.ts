import type { DetailConfig } from './detail-config';

/**
 * The headline person / pair per event type (config keeps them separate). Shared by the guest renderer, the
 * calendar file and the link-preview image so all three name the event the same way.
 */
export function invitationHeadline(eventType: string, config: DetailConfig): string[] | null {
  switch (eventType) {
    case 'wedding': {
      const bride = config.couple?.bride?.nickName || config.couple?.bride?.fullName;
      const groom = config.couple?.groom?.nickName || config.couple?.groom?.fullName;
      if (!bride && !groom) return null;
      const pair = config.couple?.displayOrder === 'groom-first' ? [groom, bride] : [bride, groom];
      return pair.filter((name): name is string => Boolean(name));
    }
    case 'birthday':
      return [config.birthdayPerson?.nickName || config.birthdayPerson?.fullName].filter(Boolean) as string[];
    case 'corporate':
      return [config.corporateProfile?.eventName || config.corporateProfile?.organizationName].filter(Boolean) as string[];
    default:
      return [config.ceremonyProfile?.nickName || config.ceremonyProfile?.honoureeName].filter(Boolean) as string[];
  }
}

/** "Sari & Budi", the configured title, or a neutral fallback (G-018: in the guest's language, "Undangan" by default). */
export function invitationDisplayName(eventType: string, config: DetailConfig, fallback = 'Undangan'): string {
  const names = invitationHeadline(eventType, config);
  if (names?.length) return names.join(' & ');
  return config.settings?.title?.trim() || fallback;
}
