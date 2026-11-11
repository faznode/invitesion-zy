import { CalendarCheck2, MessageCircleHeart, QrCode } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';

/**
 * Two-panel frame around the Clerk forms.
 *
 * The original sign-in was a bare form on an empty page — the "too basic" that
 * prompted moving to Clerk. Clerk supplies the form; the reason to trust it with
 * an email address is this side of the page, so the brand and the three things
 * the product actually does live here.
 *
 * The narrative panel is `hidden lg:flex`: on a phone it would push the form
 * below the fold, and the form is what the visitor came for.
 */
export function AuthShell({ children, en }: { children: React.ReactNode; en: boolean }) {
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Same wordmark as the marketing header — see components/brand/wordmark.tsx */}
          <Wordmark className="text-slate-900" />

          <div className="mt-10">{children}</div>
        </div>
      </section>

      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 lg:flex lg:flex-col lg:justify-center lg:px-14"
      >
        <div className="relative z-10 max-w-md text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            {en ? 'Invitesion invitations' : 'Undangan Invitesion'}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight">
            {en ? 'One place to run your whole event.' : 'Satu tempat untuk seluruh acaramu.'}
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/80">
            {en
              ? 'Invitations, RSVPs, guest lists and event details — from the first announcement to the day itself.'
              : 'Undangan, RSVP, daftar tamu, dan detail acara — dari kabar pertama sampai hari-H.'}
          </p>

          <ul className="mt-10 space-y-5">
            <Feature
              icon={<QrCode className="h-4 w-4" />}
              title={en ? 'A unique link per guest' : 'Tautan unik per tamu'}
              body={
                en
                  ? 'Every guest gets their own page, and you see who opened it.'
                  : 'Tiap tamu punya halaman sendiri, dan kamu tahu siapa yang membukanya.'
              }
            />
            <Feature
              icon={<CalendarCheck2 className="h-4 w-4" />}
              title={en ? 'RSVP and check-in' : 'RSVP dan check-in'}
              body={
                en
                  ? 'Confirmations, headcount and arrivals in one list.'
                  : 'Konfirmasi, jumlah hadir, dan kedatangan dalam satu daftar.'
              }
            />
            <Feature
              icon={<MessageCircleHeart className="h-4 w-4" />}
              title={en ? 'Wishes from everyone' : 'Ucapan dari semua'}
              body={
                en
                  ? 'A guestbook your guests can fill from their phone.'
                  : 'Buku tamu yang bisa diisi langsung dari ponsel.'
              }
            />
          </ul>
        </div>

        {/* Soft light behind the copy; purely decorative, hence aria-hidden above. */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      </aside>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white ring-1 ring-white/25">
        {icon}
      </span>
      <span>
        <strong className="block text-sm font-semibold">{title}</strong>
        <span className="mt-1 block text-xs leading-6 text-white/75">{body}</span>
      </span>
    </li>
  );
}
