import { passcodeGateActive } from '@/lib/invitation/guest-passcode';
import { cardExportAvailable, cardFileName, cardTarget } from '@/lib/invitation/print-card';
import { cardImageResponse } from '@/lib/invitation/print-card-image';
import { loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { getPublicOrigin } from '@/lib/invitation/public-url';

export const dynamic = 'force-dynamic';

/**
 * G-055 (I-30): the public e-card of a published invitation whose host opted in (`cardExportAvailable`): the A6 card
 * from the link preview's data with a QR code to the general invitation link. One card per invitation, never per guest:
 * it takes no guest and reads no guest row. A draft, an expired invitation, no opt-in and the flag off answer 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const summary = await loadPublishedInvitationSummary(slug);
  // G-047 (D-069): the public e-card shows the date and is cached for everyone, so a protected invitation offers none.
  if (!summary || passcodeGateActive(summary.invitation) || !cardExportAvailable(summary.invitation, summary.config)) return new Response('Not found', { status: 404 });
  const { invitation, config } = summary;
  return cardImageResponse({
    eventType: invitation.eventType,
    config,
    target: cardTarget(await getPublicOrigin(), invitation.slug),
    headers: {
      'Cache-Control': 'public, max-age=600',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': `inline; filename="${cardFileName(invitation.slug)}"`,
    },
  });
}
