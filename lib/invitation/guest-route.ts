/**
 * G-018 (I-31): which guest invitation page a request is for, so the root layout can give the document the invitation's
 * language (`<html lang>`). The proxy sets the header from the path it routed (and removes any copy a client sent);
 * the layout reads it back. Pure and dependency-free: the proxy imports this module.
 */
export const GUEST_ROUTE_HEADER = 'x-guest-route';

export type GuestRoute = { slug: string; guestSlug?: string; pass?: true };

/**
 * The header value for `/i/<slug>`, `/i/<slug>/<guest>` and `/i/<slug>/<guest>/pass` (the guest pages that render a
 * document), the pass page marked as `<slug>/<guest>/pass` so the layout can tell a pass that does not exist; null for
 * every other path, the guest page's route handlers included (`/photo/<slot>`, `/gift/qris`).
 * Segments stay as the URL carries them; `parseGuestRoute` decodes them like the router decodes `params`.
 */
export function guestRouteHeaderOf(pathname: string): string | null {
  const match = /^\/i\/([^/]+)(?:\/([^/]+)(\/pass)?)?\/?$/.exec(pathname);
  if (!match) return null;
  if (!match[2]) return match[1];
  return match[3] ? `${match[1]}/${match[2]}/pass` : `${match[1]}/${match[2]}`;
}

/** The loader's arguments from the header; null when absent or malformed (the document keeps the visitor's locale). */
export function parseGuestRoute(value: string | null | undefined): GuestRoute | null {
  if (!value) return null;
  const parts = value.split('/');
  const pass = parts.length === 3 && parts[2] === 'pass';
  if (parts.length > (pass ? 3 : 2) || parts.some((part) => !part)) return null;
  try {
    const [slug, guestSlug] = parts.slice(0, 2).map((part) => decodeURIComponent(part));
    if (!guestSlug) return { slug };
    return pass ? { slug, guestSlug, pass: true } : { slug, guestSlug };
  } catch {
    return null;
  }
}
