import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import type { DetailConfig } from './detail-config';
import { guestCopy, guestPageLanguage } from './guest-copy';
import { previewImageModel } from './preview-image';
import { CARD_IMAGE_SIZE, cardAddressText } from './print-card';

/** The code's side in pixels: about 4.4 cm at 300 dpi, comfortably scannable from a printed card. */
const QR_SIZE = 520;

export type CardImageInput = {
  eventType: string;
  config: DetailConfig;
  /** The absolute link the code opens (`cardTarget`). */
  target: string;
  /** A guest's card only, already passed through `cardGuestName`; the public e-card never has one. */
  guestName?: string | null;
  headers: Record<string, string>;
};

/**
 * G-055 (I-30): the A6 card (1240 × 1748). Everything printed comes from the link preview's model (`previewImageModel`:
 * the event label, the names the bundled font can draw, the first open event's date, the palette), plus the guest's
 * name on an owner's card. The code is black on a white plate whatever the palette, because scanners need that contrast
 * (as the B-024 pass); the address under it lets a guest type the link.
 */
export async function cardImageResponse({ eventType, config, target, guestName, headers }: CardImageInput) {
  const { label, imageName, date, colors } = previewImageModel(eventType, config);
  const copy = guestCopy(guestPageLanguage(config));
  const qr = await QRCode.toDataURL(target, { errorCorrectionLevel: 'M', margin: 2, width: QR_SIZE, color: { dark: '#000000', light: '#ffffff' } });
  const nameSize = imageName && imageName.length > 32 ? 64 : imageName && imageName.length > 20 ? 80 : 96;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 56, background: colors.bg, color: colors.ink }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '72px 64px 48px',
            textAlign: 'center',
            border: `3px solid ${colors.accent}`,
            borderRadius: 40,
          }}
        >
          <div style={{ fontSize: 30, letterSpacing: 10, textTransform: 'uppercase', color: colors.accent }}>{label}</div>
          {imageName ? <div style={{ marginTop: 40, fontSize: nameSize, lineHeight: 1.1, maxWidth: 1000 }}>{imageName}</div> : null}
          {date ? <div style={{ marginTop: 32, fontSize: 40, color: colors.accent }}>{date}</div> : null}
          {guestName ? (
            <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 1000 }}>
              <div style={{ fontSize: 26, letterSpacing: 6, textTransform: 'uppercase' }}>{copy.dear}</div>
              <div style={{ marginTop: 8, fontSize: 48, lineHeight: 1.15 }}>{guestName}</div>
            </div>
          ) : null}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', padding: 16, background: '#ffffff', borderRadius: 24 }}>
              <img src={qr} width={QR_SIZE} height={QR_SIZE} alt="" />
            </div>
            <div style={{ marginTop: 24, fontSize: 30 }}>{copy.card.scan}</div>
            <div style={{ marginTop: 8, fontSize: 24, color: colors.accent, maxWidth: 1000, wordBreak: 'break-all' }}>{cardAddressText(target)}</div>
          </div>
          <div style={{ marginTop: 28, fontSize: 22, opacity: 0.7 }}>{copy.ogFooter}</div>
        </div>
      </div>
    ),
    { ...CARD_IMAGE_SIZE, headers },
  );
}
