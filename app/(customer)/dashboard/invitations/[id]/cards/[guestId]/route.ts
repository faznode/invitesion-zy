import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { parseId } from '@/lib/invitation/host-logs';
import { accessFor } from '@/lib/invitation/members-db';
import { cardExportAvailable, cardFileName, cardGuestName, cardTarget } from '@/lib/invitation/print-card';
import { loadCardGuest } from '@/lib/invitation/print-card-db';
import { cardImageResponse } from '@/lib/invitation/print-card-image';
import { getPublicOrigin } from '@/lib/invitation/public-url';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * G-055 (I-30): one guest's printable card, its QR code opening that guest's personal link. Owner only (`manage`): the
 * card carries a guest's name and their capability link. As I-22's export: signed out is 401, an administrator is refused
 * before the invitation is read, and anyone else, the flag off, no opt-in, a draft or expired invitation, or a guest of
 * another invitation get the same 404. Made on each request, never stored or cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; guestId: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role === 'ADMIN') return new Response('Forbidden', { status: 403 });
  if (!isFlagOn('CARD_EXPORT')) return notFound();
  const route = await params;
  const id = parseId(route.id);
  const guestId = parseId(route.guestId);
  const access = id === null ? null : await accessFor(user.id, id, 'manage');
  if (!access || id === null || guestId === null) return notFound();
  const { config } = normalizeStoredConfig(access.invitation.config ?? {});
  if (!cardExportAvailable(access.invitation, config)) return notFound();
  const guest = await loadCardGuest(id, guestId);
  if (!guest) return notFound();
  const segment = guestLinkSegment(guest);
  return cardImageResponse({
    eventType: access.invitation.eventType,
    config,
    target: cardTarget(await getPublicOrigin(), access.invitation.slug, segment),
    guestName: cardGuestName(guest.name),
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${cardFileName(access.invitation.slug, segment)}"`,
    },
  });
}
