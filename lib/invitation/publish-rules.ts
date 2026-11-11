import { normalizeStoredConfig } from './content-read';
import type { DetailConfig } from './detail-config';

/**
 * Publishing rules, as pure functions.
 *
 * Separated from `publish.ts` on purpose: these are the decisions worth testing
 * — how long an invitation stays live, and what makes one too empty to show a
 * guest — and they should not require a database connection to exercise.
 * `publish.ts` keeps the data access and depends on this, never the reverse.
 */

/** Locked decision #5: 12 months of active life from the moment of publish. */
export const ACTIVE_PERIOD_MONTHS = 12;

export class NotPublishableError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Invitation is not ready to publish: ${reasons.join('; ')}`);
    this.name = 'NotPublishableError';
    this.reasons = reasons;
  }
}

/**
 * Adds whole months, clamping to the end of a shorter target month.
 *
 * Naive `setMonth` rolls over: 31 August plus six months lands on 2 or 3 March
 * rather than 28 February. For a 12-month window that only bites on 29 February,
 * but an expiry date that silently moves is not something to leave to luck.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);
  if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) result.setDate(0);
  return result;
}

/**
 * Reasons this invitation should not go live yet, in display order.
 *
 * Deliberately shallow. The product decision is that the customer owns their
 * content, so this blocks only invitations that would render as an empty shell
 * — no name, or nothing scheduled. Per-event-type completeness is the editor's
 * job to guide, not a hard gate.
 */
export function publishBlockers(eventType: string, rawConfig: unknown): string[] {
  // Every reader must accept the stored config without dropping anything. The lenient read equals the strict schema here
  // except for a registration-form condition naming a missing question (D-035), which every reader handles and a save
  // no longer rewrites, so it must not hold publishing hostage.
  const { config, dropped } = normalizeStoredConfig(rawConfig ?? {});
  if (dropped.length || (rawConfig && (typeof rawConfig !== 'object' || Array.isArray(rawConfig)))) {
    return ['Konfigurasi undangan tidak valid. Simpan ulang dari editor sebelum menerbitkan.'];
  }
  const reasons: string[] = [];

  if (!hasHonouree(eventType, config)) reasons.push('Nama pada undangan belum diisi.');

  const events = config.events ?? [];
  if (events.length === 0) {
    reasons.push('Belum ada jadwal acara.');
  } else if (!events.some((event) => Boolean(event.startAt))) {
    reasons.push('Belum ada acara yang punya waktu mulai.');
  }

  return reasons;
}

/** Whoever the invitation is about must at least be named. */
export function hasHonouree(eventType: string, config: DetailConfig): boolean {
  switch (eventType) {
    case 'wedding':
      return Boolean(config.couple?.bride?.fullName && config.couple?.groom?.fullName);
    case 'birthday':
      return Boolean(config.birthdayPerson?.fullName);
    case 'corporate':
      return Boolean(config.corporateProfile?.eventName || config.corporateProfile?.organizationName);
    case 'aqiqah':
    case 'tasyakuran':
    case 'khitanan':
      return Boolean(config.ceremonyProfile?.honoureeName || config.ceremonyProfile?.thanksgivingTitle);
    default:
      // An unrecognised type still needs something on the page.
      return Boolean(config.settings?.title);
  }
}
