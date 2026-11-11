import 'server-only';
import { headers } from 'next/headers';
import { guestPageLanguage, type GuestLanguage } from './guest-copy';
import { guestPassAvailable } from './guest-pass-page';
import { GUEST_ROUTE_HEADER, parseGuestRoute } from './guest-route';
import { loadPublicInvitation } from './public';

/**
 * G-018 (I-31): the document language of a guest invitation page, its invitation's language; null for every other page
 * (they keep the visitor's locale) and for every guest page that answers 404 — an unknown, unpublished or deleted
 * invitation, an unknown guest, a pass that does not exist (`guestPassAvailable`) — so a 404 reads in the visitor's
 * locale like its title and body, and says nothing about the invitation.
 *
 * The loader is wrapped in React `cache()` (B-014 step 1) and is called here with exactly the arguments the page and its
 * metadata use, so the root layout adds no database query to the guest request; no cookie is set either.
 */
export async function guestDocumentLanguage(): Promise<GuestLanguage | null> {
  const route = parseGuestRoute((await headers()).get(GUEST_ROUTE_HEADER));
  if (!route) return null;
  try {
    const data = route.guestSlug ? await loadPublicInvitation(route.slug, route.guestSlug) : await loadPublicInvitation(route.slug);
    if (!data || (route.pass && !guestPassAvailable(data))) return null;
    // The page's own language (`guestPageLanguage`): a classic-layout invitation is Indonesian whatever it stores (D-041).
    return guestPageLanguage(data.config);
  } catch {
    // The page reports its own failure; the document language falls back rather than replacing the page with an error.
    return null;
  }
}
