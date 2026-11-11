import { isFlagOn } from '@/lib/flags';
import type { DetailConfig } from './detail-config';
import { familyOf } from './families';

/**
 * G-036 (I-05): elder-friendly reading. One tap on the cover switches a design-family page to larger text, the palette's
 * own ink for muted text (the B-016 tokens only, never new colours) and no motion. It is the guest's choice on their own
 * device, never the host's and never stored on the server: a cookie the guest routes read, so the next page paints large
 * from its first byte. A year, so an older guest keeps it on every invitation they open on that device.
 */
export const READING_COOKIE = 'inv_reading';
export const READING_COOKIE_VALUE = 'large';
export const READING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ReadingMode = { on: boolean };

/**
 * One rule for the cover's switch and the page's reading state: guest reading mode on (`GUEST_READING`) and a design
 * family (the legacy layout is frozen, D-041). Every page status offers it, a read-only (expired) page and the host's
 * preview included, because reading help changes nothing a guest can do. Off renders every page exactly as before and
 * ignores the cookie (the rollback).
 */
export function readingModeOf(
  config: DetailConfig,
  requested: boolean | undefined,
  env: Record<string, string | undefined> = process.env,
): ReadingMode | null {
  if (!isFlagOn('GUEST_READING', env) || !familyOf(config.theme?.familyId)) return null;
  return { on: requested === true };
}

/** The cookie as the server reads it: only the exact value the switch writes turns the mode on. */
export function readingRequested(value: string | undefined): boolean {
  return value === READING_COOKIE_VALUE;
}
