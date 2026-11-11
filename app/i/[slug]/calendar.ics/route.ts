import { isFlagOn } from '@/lib/flags';
import { buildIcs, calendarEventsFromConfig } from '@/lib/invitation/calendar';
import { visibleEvents } from '@/lib/invitation/event-eligibility';
import { guestCopy, guestPageLanguage } from '@/lib/invitation/guest-copy';
import { loadGuestGate, lockedResponse } from '@/lib/invitation/guest-gate';
import { invitationDisplayName } from '@/lib/invitation/headline';
import { loadPublishedInvitationSummary } from '@/lib/invitation/public';
import { getPublicOrigin, invitationPath } from '@/lib/invitation/public-url';

export const dynamic = 'force-dynamic';

/**
 * Calendar file for every event of a published invitation (B-008). The same file serves every guest, so it carries
 * no guest data and the guest slug is not part of this URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isFlagOn('GUEST_CALENDAR')) return new Response('Not found', { status: 404 });

  const { slug } = await params;
  // G-047 (D-069): the dates and places are the invitation's content: a locked request gets the missing invitation's 404.
  const gate = await loadGuestGate(slug);
  if (gate?.locked) return lockedResponse();
  const summary = await loadPublishedInvitationSummary(slug);
  if (!summary) return new Response('Not found', { status: 404 });

  const origin = await getPublicOrigin();
  const events = calendarEventsFromConfig({
    slug,
    // G-018: a nameless invitation's entry is called "Undangan" / "Invitation" in its language.
    displayName: invitationDisplayName(summary.invitation.eventType, summary.config, guestCopy(guestPageLanguage(summary.config)).invitation),
    // D-037: this file is served without a guest link, so it lists open events only.
    events: visibleEvents(summary.config.events, { kind: 'public' }, isFlagOn('INVITE_ONLY_EVENTS')),
    publicUrl: origin ? `${origin}${invitationPath(slug)}` : null,
  });
  if (events.length === 0) return new Response('Not found', { status: 404 });

  const filename = `undangan-${slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'acara'}.ics`;
  return new Response(buildIcs(events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // An admitted visitor's copy of a protected invitation is theirs alone: never stored by a shared cache.
      'Cache-Control': gate?.passcode ? 'private, no-store' : 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
