import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { PasscodeGate } from '@/components/invitation/passcode-gate';
import { PublicInvitationRenderer } from '@/components/invitation/public-renderer';
import { guestCopy, guestPageLanguage } from '@/lib/invitation/guest-copy';
import { loadGuestGate } from '@/lib/invitation/guest-gate';
import { passcodeNoticeOf } from '@/lib/invitation/guest-passcode';
import { loadMemoryView } from '@/lib/invitation/post-event-server';
import { invitationShareMetadata } from '@/lib/invitation/preview-image';
import { loadPublicInvitation, trackInvitationView } from '@/lib/invitation/public';
import { READING_COOKIE, readingRequested } from '@/lib/invitation/reading-mode';
import { getLocale } from '@/lib/locale-server';
import { saveDataRequested } from '@/lib/media/variants';

// Rendered whole so an unknown or draft invitation answers 404 rather than 200 (B-011; next.config.ts).
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ kode?: string; menit?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // G-047 (D-069): a locked page's metadata is the cover's (title and names; no opening text, no date).
  const gate = await loadGuestGate(slug);
  if (gate?.locked) return gate.metadata;
  const data = await loadPublicInvitation(slug);
  // A 404 reads in the visitor's locale, like its body and `<html lang>` (G-018).
  if (!data) return { title: guestCopy(await getLocale()).notFoundTitle };
  return {
    title: data.config.settings?.title || guestCopy(guestPageLanguage(data.config)).pageTitle,
    ...invitationShareMetadata(data.invitation, data.config, { coverOnly: gate?.passcode === true }),
    // A guest link is personal; keep it out of search results.
    robots: { index: false, follow: false },
  };
}

/**
 * Invitation without a guest slug. Renders the full invitation but cannot take
 * an RSVP, because RSVP identity comes from the personal guest link.
 */
export default async function PublicInvitationPage({ params, searchParams }: Params) {
  const { slug } = await params;
  // G-047 (D-069): until the server admits this visitor, the cover alone, before any guest, wish or media query.
  const gate = await loadGuestGate(slug);
  if (gate?.locked) return <PasscodeGate cover={gate.cover} slug={slug} notice={passcodeNoticeOf(await searchParams)} />;
  const data = await loadPublicInvitation(slug);
  if (!data) notFound();

  // Deferred until after the response flushes — see the guest page for why.
  after(() => trackInvitationView(data.invitation.id));
  // I-21 (D-070): the invitation's link views the memory (visible photos only); it never shares.
  const memory = await loadMemoryView({ invitation: data.invitation, config: data.config, guest: null, slug, guestSlug: null, notice: null });

  return (
    <PublicInvitationRenderer
      invitation={data.invitation}
      config={data.config}
      guest={null}
      media={data.media}
      memory={memory}
      messages={data.messages}
      totalMessages={data.totalMessages}
      hiddenMessageCount={data.hiddenMessageCount}
      readOnly={data.readOnly}
      status={{}}
      giftWithheld={data.giftWithheld}
      imageVariants={data.imageVariants}
      saveData={saveDataRequested((await headers()).get('save-data'))}
      readingLarge={readingRequested((await cookies()).get(READING_COOKIE)?.value)}
    />
  );
}
