import { ImageResponse } from 'next/og';
import type { DetailConfig } from './detail-config';
import { guestCopy, guestPageLanguage } from './guest-copy';
import { previewImageModel, STORY_IMAGE_SIZE } from './preview-image';

/**
 * G-035 (I-16): the 9:16 image a guest saves for WhatsApp Status or an Instagram Story. It is drawn from the link
 * preview's model (`previewImageModel`, B-010) and nothing else: the event label, the names the bundled font can draw,
 * the first open event's date and the palette, never a guest. Names are text to the renderer, never markup, and only the
 * bundled Latin font is used, so rendering never fetches glyphs (names it cannot draw are left out, as on the card).
 */
export function storyImageResponse(eventType: string, config: DetailConfig) {
  const { label, imageName, date, colors } = previewImageModel(eventType, config);
  const nameSize = imageName && imageName.length > 32 ? 84 : imageName && imageName.length > 20 ? 108 : 132;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 64, background: colors.bg, color: colors.ink }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 72,
            textAlign: 'center',
            border: `3px solid ${colors.accent}`,
            borderRadius: 48,
          }}
        >
          <div style={{ fontSize: 40, letterSpacing: 12, textTransform: 'uppercase', color: colors.accent }}>{label}</div>
          {imageName ? <div style={{ marginTop: 72, fontSize: nameSize, lineHeight: 1.1, maxWidth: 800 }}>{imageName}</div> : null}
          <div style={{ marginTop: 72, width: 120, height: 3, background: colors.accent }} />
          {date ? <div style={{ marginTop: 72, fontSize: 52, color: colors.accent }}>{date}</div> : null}
          <div style={{ position: 'absolute', bottom: 72, fontSize: 30, opacity: 0.7 }}>{guestCopy(guestPageLanguage(config)).ogFooter}</div>
        </div>
      </div>
    ),
    { ...STORY_IMAGE_SIZE, headers: { 'Cache-Control': 'public, max-age=600', 'X-Robots-Tag': 'noindex' } },
  );
}
