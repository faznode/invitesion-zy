import { ImageResponse } from 'next/og';
import { guestCopy, guestPageLanguage } from '@/lib/invitation/guest-copy';
import { passcodeGateActive } from '@/lib/invitation/guest-passcode';
import { PREVIEW_IMAGE_SIZE, previewImageModel } from '@/lib/invitation/preview-image';
import { loadPublishedInvitationSummary } from '@/lib/invitation/public';

export const dynamic = 'force-dynamic';

/**
 * 1200×630 link-preview image of a published invitation (B-010): event label, names and date in the invitation's
 * palette. Names are rendered as text by the image renderer, never parsed as markup. Only the bundled Latin font is
 * used: names it cannot draw are left out of the image (see `previewImageModel`), so rendering never fetches glyphs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const summary = await loadPublishedInvitationSummary(slug);
  if (!summary) return new Response('Not found', { status: 404 });

  // G-047 (D-069): a passcode-protected invitation's card is its cover alone (no date), for every viewer: it is cached.
  const { label, imageName, date, colors } = previewImageModel(summary.invitation.eventType, summary.config, undefined, passcodeGateActive(summary.invitation));
  const nameSize = imageName && imageName.length > 32 ? 64 : imageName && imageName.length > 20 ? 80 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          textAlign: 'center',
          background: colors.bg,
          color: colors.ink,
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, textTransform: 'uppercase', color: colors.accent }}>{label}</div>
        {imageName ? <div style={{ marginTop: 36, fontSize: nameSize, lineHeight: 1.1, maxWidth: 1040 }}>{imageName}</div> : null}
        {date ? <div style={{ marginTop: 40, fontSize: 34, color: colors.accent }}>{date}</div> : null}
        <div style={{ position: 'absolute', bottom: 48, fontSize: 22, opacity: 0.6 }}>{guestCopy(guestPageLanguage(summary.config)).ogFooter}</div>
      </div>
    ),
    {
      ...PREVIEW_IMAGE_SIZE,
      headers: { 'Cache-Control': 'public, max-age=600', 'X-Robots-Tag': 'noindex' },
    },
  );
}
