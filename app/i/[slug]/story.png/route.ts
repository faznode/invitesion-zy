import { passcodeGateActive } from '@/lib/invitation/guest-passcode';
import { inviteShareAvailable } from '@/lib/invitation/invite-share';
import { loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { storyImageResponse } from '@/lib/invitation/story-image';

export const dynamic = 'force-dynamic';

/**
 * G-035 (I-16): the 9:16 Status / Story image, from the link preview's public data, only where the share actions are
 * offered (`inviteShareAvailable`): flag off, the host's opt-out, a draft or the legacy layout answer 404. G-047 (D-069):
 * a passcode-protected invitation offers none either: the image carries the date and is cached for everyone it reaches.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const summary = await loadPublishedInvitationSummary(slug);
  if (!summary || passcodeGateActive(summary.invitation) || !inviteShareAvailable(summary.invitation, summary.config)) return new Response('Not found', { status: 404 });
  return storyImageResponse(summary.invitation.eventType, summary.config);
}
