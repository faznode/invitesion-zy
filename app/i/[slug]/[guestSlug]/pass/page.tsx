import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { buildGuestView } from '@/components/invitation/guest-view';
import { PasscodeGate } from '@/components/invitation/passcode-gate';
import { guestCopy, guestPageLanguage } from '@/lib/invitation/guest-copy';
import { loadGuestGate } from '@/lib/invitation/guest-gate';
import { passcodeNoticeOf } from '@/lib/invitation/guest-passcode';
import { passExpiresAt, passSigningSecret, signGuestPass } from '@/lib/invitation/guest-pass';
import { guestPassAvailable } from '@/lib/invitation/guest-pass-page';
import { loadPublicInvitation } from '@/lib/invitation/public';
import { getLocale } from '@/lib/locale-server';

// Rendered per request: the token is signed now, and an unknown guest link answers 404 (B-011).
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; guestSlug: string }>; searchParams: Promise<{ kode?: string; menit?: string }> };

/**
 * G-018: the title in the invitation page's language. A pass that does not exist (`guestPassAvailable`) has the guest
 * routes' 404 title in the visitor's locale, like its body and `<html lang>`, so it says nothing about the invitation.
 * The loader is React-cached, so this reads the same row the page does.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, guestSlug } = await params;
  const gate = await loadGuestGate(slug);
  if (gate?.locked) return { ...gate.metadata, referrer: 'no-referrer' };
  const data = await loadPublicInvitation(slug, guestSlug);
  return {
    title: guestPassAvailable(data) ? guestCopy(guestPageLanguage(data.config)).pass.title : guestCopy(await getLocale()).notFoundTitle,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/**
 * B-024 (I-01, D-056): the guest's pass, reached from their personal link only. The QR holds a signed token
 * (`lib/invitation/guest-pass.ts`): the pass's random id, an expiry and a MAC, never the guest id. The page shows the
 * guest's display name and the event, nothing else of theirs. Flag off, an invitation that has not opted in, the shared
 * invitation link or a missing secret: 404 (`guestPassAvailable`).
 *
 * G-018 (I-31): the page speaks its invitation's language (`guestPageLanguage`), like the guest page it links back to;
 * the guest's name and the invitation's title are the host's words and stay as written.
 */
export default async function GuestPassPage({ params, searchParams }: Params) {
  const { slug, guestSlug } = await params;
  // G-047 (D-069): the pass names the guest and the event, so a locked request sees the cover and returns here after entry.
  const gate = await loadGuestGate(slug);
  if (gate?.locked) return <PasscodeGate cover={gate.cover} slug={slug} guestSlug={guestSlug} target="pass" notice={passcodeNoticeOf(await searchParams)} />;
  const data = await loadPublicInvitation(slug, guestSlug);
  const secret = passSigningSecret();
  if (!guestPassAvailable(data) || !secret) notFound();

  const language = guestPageLanguage(data.config);
  const copy = guestCopy(language);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = passExpiresAt(data.config.events ?? [], now);
  const expired = now > expiresAt;
  const token = signGuestPass(secret, data.guest.passId, expiresAt);
  const qr = expired ? null : await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#000000', light: '#ffffff' } });
  const view = buildGuestView({ invitation: data.invitation, config: data.config, guest: data.guest, media: data.media, messages: [], readOnly: data.readOnly, status: {} }, language);
  const event = view.primaryEvent;
  const title = data.config.settings?.title || copy.invitation;
  const backHref = `/i/${encodeURIComponent(slug)}/${encodeURIComponent(guestSlug)}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-100 px-4 py-10 text-slate-900" lang={language}>
      <section aria-labelledby="pass-title" className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm print:border-0 print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{copy.pass.title}</p>
        <h1 id="pass-title" dir="auto" className="text-balance text-2xl font-bold leading-snug [overflow-wrap:anywhere]">
          {data.guest.name}
        </h1>
        <div className="flex flex-col gap-1 text-sm leading-6 text-slate-600">
          <p dir="auto" className="font-semibold text-slate-800 [overflow-wrap:anywhere]">{title}</p>
          {event?.startAt && (
            <p>
              {view.formatDate(event.startAt)} · {view.formatTime(event.startAt)}
            </p>
          )}
        </div>
        {qr ? (
          <img src={qr} alt={copy.pass.qrAlt(data.guest.name)} width={256} height={256} className="h-64 w-64" />
        ) : (
          <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            {copy.pass.expired}
          </p>
        )}
        <p className="text-pretty text-sm leading-6 text-slate-600">{copy.pass.instructions}</p>
      </section>
      <a href={backHref} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-slate-700 underline underline-offset-4 print:hidden">
        {copy.pass.back}
      </a>
    </main>
  );
}
