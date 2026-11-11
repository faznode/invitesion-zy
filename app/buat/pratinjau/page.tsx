import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicInvitationRenderer } from '@/components/invitation/public-renderer';
import { isFlagOn } from '@/lib/flags';
import { occasionOfCategory } from '@/lib/invitation/occasion';
import { catalogDefaultConfig } from '@/lib/invitation/template-defaults';
import { templateEventTypes } from '@/lib/invitation/template-event-types';
import { getTemplateBySlug } from '@/lib/invitation/templates';
import { EMPTY_TRIAL_INPUT, initialDraftConfig, previewInput, trialPlaceholders } from '@/lib/invitation/trial';
import { trialPreviewInvitation, trialPreviewProps } from '@/lib/invitation/trial-preview';
import { readTrialState } from '../trial-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pratinjau tema',
  robots: { index: false, follow: false },
};

/** Stands in for the draft key before the visitor has typed anything (no date, so no event carries it). */
const NO_KEY = '00000000-0000-4000-8000-000000000000';

/**
 * B-037 + I-08: the try-with-your-names preview, framed by the wizard (`frame-ancestors 'self'` here only, `proxy.ts`).
 * The real guest renderer draws the config the draft would store (`initialDraftConfig`, the catalog defaults as
 * `template-sync.ts` stores them), read as a stored draft is read for its owner (`trialPreviewProps`), with the visitor's
 * typed names from their own cookie, or the catalog's sample names while a field is empty. No database, no account, no
 * view counted; nothing is written. `?tema=` names the selected catalog theme (never personal data).
 */
export default async function TrialPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isFlagOn('CREATION_WIZARD')) notFound();
  const state = await readTrialState();
  const requested = (await searchParams).tema;
  const template = getTemplateBySlug(typeof requested === 'string' && requested ? requested : (state?.slug ?? ''));
  if (!template) notFound();

  const eventType = templateEventTypes[template.category];
  const stateTemplate = state ? getTemplateBySlug(state.slug) : undefined;
  // Names belong to fields of one event type (a couple, a celebrant, an event name), so they carry across themes of it only,
  // and never between a celebration and a memorial (B-032).
  const carried =
    state &&
    stateTemplate &&
    templateEventTypes[stateTemplate.category] === eventType &&
    occasionOfCategory(stateTemplate.category) === occasionOfCategory(template.category);
  const typed = carried ? state : EMPTY_TRIAL_INPUT;
  const input = previewInput(typed, trialPlaceholders(template, eventType), eventType);
  const { config } = initialDraftConfig(catalogDefaultConfig(template), eventType, { input, key: state?.key ?? NO_KEY });

  return <PublicInvitationRenderer {...trialPreviewProps(trialPreviewInvitation(eventType, config), config)} />;
}
