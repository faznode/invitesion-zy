import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { isFlagOn } from '@/lib/flags';
import { occasionOfCategory } from '@/lib/invitation/occasion';
import { templateEventTypes } from '@/lib/invitation/template-event-types';
import { getTemplateBySlug, invitationTemplates } from '@/lib/invitation/templates';
import { themeSwitchOptions } from '@/lib/invitation/theme-switch';
import { EMPTY_TRIAL_INPUT, TRIAL_NAME_MAX, trialFieldsFor, trialPlaceholders } from '@/lib/invitation/trial';
import { readTrialState } from '../trial-session';
import { TrialWizard, type TrialThemeOption } from './trial-wizard';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const template = getTemplateBySlug((await params).slug);
  return {
    title: template ? `Coba ${template.name} dengan namamu · Invitesion` : 'Coba tema dengan namamu · Invitesion',
    description: 'Ketik nama dan tanggal acara, pilih tema, dan lihat undanganmu langsung. Simpan sebagai draf setelah masuk.',
    robots: { index: false, follow: true },
  };
}

/**
 * B-037 + I-08: the wizard (names, date and theme), opened from the catalog's "Pakai tema" under
 * `FLAG_CREATION_WIZARD`. Off, it does not exist (404) and the catalog keeps the path before B-037. Typed content from
 * an earlier visit (the visitor's own cookie) is offered again for themes of the same event type.
 *
 * The draft key (D-055) is the cookie's while one exists (an unsaved wizard, or a save whose answer never arrived),
 * otherwise minted here, once per page: the wizard keeps it and sends it with every update and save.
 */
export default async function TrialWizardPage({ params }: PageProps) {
  if (!isFlagOn('CREATION_WIZARD')) notFound();
  const template = getTemplateBySlug((await params).slug);
  if (!template) notFound();

  const eventType = templateEventTypes[template.category];
  // B-032: a memorial theme asks for the name of the one remembered and offers memorial themes only.
  const occasion = occasionOfCategory(template.category);
  const [state, session] = await Promise.all([readTrialState(), auth()]);
  const stateTemplate = state ? getTemplateBySlug(state.slug) : undefined;
  const carried =
    state &&
    stateTemplate &&
    templateEventTypes[stateTemplate.category] === eventType &&
    occasionOfCategory(stateTemplate.category) === occasion;
  const initial = {
    slug: template.slug,
    first: carried ? state.first : EMPTY_TRIAL_INPUT.first,
    second: carried ? state.second : EMPTY_TRIAL_INPUT.second,
    date: carried ? state.date : EMPTY_TRIAL_INPUT.date,
    time: carried ? state.time : EMPTY_TRIAL_INPUT.time,
    zone: carried ? state.zone : EMPTY_TRIAL_INPUT.zone,
  };
  const themes: TrialThemeOption[] = themeSwitchOptions(eventType, undefined, occasion).flatMap((option) => {
    const entry = invitationTemplates.find((candidate) => candidate.id === option.id);
    return entry ? [{ slug: entry.slug, name: option.name, premium: option.tier === 'premium', swatch: option.swatch }] : [];
  });

  return (
    // The wizard's copy is Indonesian whatever the visitor's locale (the root layout's `lang` follows the locale).
    <div lang="id" className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Wordmark size="sm" />
          <Link
            href={`/templates/${template.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Kembali ke tema
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-28 pt-6 lg:pb-12 lg:pt-10">
        <TrialWizard
          initial={initial}
          draftKey={state?.key ?? randomUUID()}
          fields={trialFieldsFor(eventType, occasion)}
          placeholders={trialPlaceholders(template, eventType)}
          nameMax={TRIAL_NAME_MAX}
          themes={themes}
          signedIn={Boolean(session.userId)}
        />
      </main>
    </div>
  );
}
