import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { formatEventDate, formatEventTime } from '@/lib/invitation/event-time';
import { occasionOfCategory } from '@/lib/invitation/occasion';
import { templateEventTypes } from '@/lib/invitation/template-event-types';
import { getTemplateBySlug } from '@/lib/invitation/templates';
import { trialFieldsFor } from '@/lib/invitation/trial';
import { readTrialState } from '../trial-session';
import { ConfirmSave } from './confirm-save';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Simpan draf undangan · Invitesion',
  robots: { index: false, follow: false },
};

const ZONE_OFFSETS: Record<string, string> = { 'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00' };

/**
 * B-037: where the wizard's save lands after signing in or signing up (`/sign-in?redirect_url=/buat/simpan`). The typed
 * content is still the visitor's own cookie; this page shows it back and creates the draft on one more tap (a POST, so a
 * reload or a link never creates anything). Signed out, it sends the visitor to sign in with the way back.
 */
export default async function SaveTrialPage() {
  if (!isFlagOn('CREATION_WIZARD')) notFound();
  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect_url=${encodeURIComponent('/buat/simpan')}`);
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const state = await readTrialState();
  const template = state ? getTemplateBySlug(state.slug) : undefined;
  const eventType = template ? templateEventTypes[template.category] : null;
  const fields = eventType && template ? trialFieldsFor(eventType, occasionOfCategory(template.category)) : null;
  const startAt = state?.date ? `${state.date}T${state.time}:00${ZONE_OFFSETS[state.zone]}` : null;

  return (
    // Indonesian copy whatever the visitor's locale, as on the wizard.
    <div lang="id" className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-3">
          <Wordmark size="sm" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
        {state && template && fields ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-primary">Hampir selesai</p>
              <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Simpan draf undanganmu</h1>
              <p className="text-pretty leading-relaxed text-muted-foreground">
                Ini isian yang kamu coba tadi. Setelah disimpan, draf masuk ke akunmu dan kamu bisa melengkapinya di editor.
              </p>
            </div>
            <dl className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-1 px-5 py-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fields.first}</dt>
                <dd className="break-words text-base text-foreground">{state.first}</dd>
              </div>
              {fields.second && state.second ? (
                <div className="flex flex-col gap-1 px-5 py-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fields.second}</dt>
                  <dd className="break-words text-base text-foreground">{state.second}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-1 px-5 py-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tanggal acara</dt>
                <dd className="text-base text-foreground">
                  {startAt ? `${formatEventDate(startAt) ?? state.date}, ${formatEventTime(startAt) ?? state.time}` : 'Belum diisi'}
                </dd>
              </div>
              <div className="flex flex-col gap-1 px-5 py-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tema</dt>
                <dd className="flex items-center gap-3 text-base text-foreground">
                  <span className="flex gap-1" aria-hidden="true">
                    {[template.palette.bg, template.palette.accent, template.palette.ink].map((color, index) => (
                      <span key={index} className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span>
                    {template.name} <span className="text-sm text-muted-foreground">({template.tier === 'free' ? 'Standar' : 'Premium'})</span>
                  </span>
                </dd>
              </div>
            </dl>
            <ConfirmSave editHref={`/buat/${template.slug}`} />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-balance font-serif text-4xl leading-tight text-foreground">Tidak ada draf yang menunggu</h1>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              Isian dari wizard sudah disimpan, sudah kedaluwarsa, atau dibuat di perangkat lain. Pilih tema untuk mencoba lagi.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/templates" className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90">
                Lihat katalog tema
              </Link>
              <Link href="/dashboard/invitations" className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:bg-muted">
                Undangan saya
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
