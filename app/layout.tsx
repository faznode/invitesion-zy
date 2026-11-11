import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope, Instrument_Serif } from 'next/font/google';
import { guestDocumentLanguage } from '@/lib/invitation/guest-document-language';
import { getLocale } from '@/lib/locale-server';
import { tierPriceLabel } from '@/lib/pricing';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans' });
const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-serif',
  style: ['normal', 'italic'],
});

/** Absolute base for relative metadata URLs (link-preview images, B-010); an invalid value must not break every page. */
function metadataBaseFromEnv(): URL | undefined {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return undefined;
  try {
    return new URL(configured);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBaseFromEnv(),
  title: 'Invitesion — Undangan Pernikahan Digital: Buat, Sebar & Kelola RSVP',
  description: `Platform undangan pernikahan digital Indonesia. Pilih tema, isi detail acara, sebar ke WhatsApp, dan pantau RSVP tamu secara real-time. Bayar sekali mulai ${tierPriceLabel('standard', 'id')}.`,
  openGraph: {
    title: 'Invitesion — Undangan Pernikahan Digital',
    description:
      'Undangan digital yang hidup. Tema premium, RSVP online, sebar via WhatsApp. Bayar sekali, aktif 12 bulan.',
    type: 'website',
    locale: 'id_ID',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Invitesion — Undangan Pernikahan Digital',
    description: 'Undangan digital yang hidup. Tema premium, RSVP online, sebar via WhatsApp.',
  },
};

// maximumScale intentionally omitted — WCAG 1.4.4 requires pinch-zoom to remain enabled.
export const viewport: Viewport = { themeColor: '#e80053' };

// B-015: no ClerkProvider here. Guest pages (`/i/*`), marketing pages and `/preview` never use Clerk's client components;
// the route groups that do — (login), (customer), (admin) — wrap themselves in `AuthProvider`.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // G-018 (I-31): a guest invitation page is in its invitation's language; every other page in the visitor's locale.
  const lang = (await guestDocumentLanguage()) ?? (await getLocale());
  return (
    <html
      lang={lang}
      className={`bg-background text-foreground ${manrope.variable} ${instrumentSerif.variable} ${manrope.className}`}
      style={{ colorScheme: 'light' }}
    >
      <body className="min-h-[100dvh] bg-background text-foreground">{children}</body>
    </html>
  );
}
