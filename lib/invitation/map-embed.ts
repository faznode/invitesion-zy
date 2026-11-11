import { isFlagOn } from '@/lib/flags';
import type { GuestLanguage } from './guest-copy';

/**
 * G-029: the map of an event's location, behind a facade. The page renders the host's static location link as before and,
 * beside it, a button; the map frame is created only after the guest presses it, so no map request leaves the page
 * before then (the CSP allows exactly this frame origin). The keyless embed needs no API key and no account.
 */
export const MAP_EMBED_ORIGIN = 'https://www.google.com';

type Located = { venueName?: string; address?: string; mapUrl?: string };

/** `@lat,lng`, `?q=lat,lng` (also `ll`, `query`, `center`) and `!3dlat!4dlng`, the forms a shared map link carries. */
const COORDINATE_PATTERNS = [
  /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  /[?&](?:q|ll|query|center)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
  /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
];

/** The coordinates a host's map link names, or null (a short link names none). */
export function mapCoordinates(mapUrl?: string): [number, number] | null {
  if (!mapUrl) return null;
  let text = mapUrl;
  try {
    text = decodeURIComponent(mapUrl);
  } catch {
    // A malformed escape: read the link as given.
  }
  for (const pattern of COORDINATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return [latitude, longitude];
  }
  return null;
}

/**
 * The embed address for an event: the link's own coordinates when it names them, else the venue and its address as the
 * host wrote them. A venue name alone is not enough (it could match another place), so without coordinates or an
 * address there is no map, only the static link.
 */
export function mapEmbedUrl(event: Located, language: GuestLanguage): string | null {
  const coordinates = mapCoordinates(event.mapUrl);
  const address = event.address?.trim();
  const query = coordinates
    ? `${coordinates[0]},${coordinates[1]}`
    : address
      ? [event.venueName?.trim(), address].filter(Boolean).join(', ').slice(0, 300)
      : '';
  if (!query) return null;
  return `${MAP_EMBED_ORIGIN}/maps?q=${encodeURIComponent(query)}&hl=${language}&z=16&output=embed`;
}

/** One rule: the flag and an event whose host gave a location link (the facade sits beside it, never instead of it). */
export function mapFacadeOf(
  event: Located,
  language: GuestLanguage,
  env: Record<string, string | undefined> = process.env,
): { embedUrl: string } | null {
  if (!isFlagOn('GUEST_MAP', env) || !event.mapUrl) return null;
  const embedUrl = mapEmbedUrl(event, language);
  return embedUrl ? { embedUrl } : null;
}
