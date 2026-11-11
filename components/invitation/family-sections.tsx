import { Fragment, type ReactNode } from 'react';
import { InvitationIcon } from '@/components/invitation/icons';
import { Countdown } from '@/components/invitation/countdown';
import { GiftCopyButton } from '@/components/invitation/gift-copy';
import {
  CalendarLinks,
  CeremonyProfileBody,
  EventFacts,
  GiftQris,
  GiftWithheldNotice,
  giftNumberId,
  GuestbookBlock,
  MapBlock,
  PortraitsBody,
  ProgrammeBody,
  programmeSections,
  RsvpBlock,
  ShareBody,
} from '@/components/invitation/guest-blocks';
import type { GuestPageProps, GuestView } from '@/components/invitation/guest-view';
import { GalleryBody, type GalleryFrame } from '@/components/invitation/gallery';
import { composedSectionOrder, familyChoices, type FamilyManifest, type SectionId } from '@/lib/invitation/family-manifest';
import { IMAGE_SIZES } from '@/lib/media/variants';

/** A family's drawing of each section; a renderer returns nothing when the invitation has no content for it. */
export type SectionRenderers = Partial<Record<SectionId, () => ReactNode>>;

/**
 * B-030: the page's sections in the manifest's order (`composedSectionOrder`). Each renderer is called once, in that
 * order, so a layout whose look depends on position (Riang's alternating bands) can count as it renders. A section the
 * family does not draw comes from `fallback` (the shared sections below), never a blank. G-041: the invitation's theme
 * may choose one of the manifest's other orders (`familyChoices`); anything else keeps the manifest's own.
 */
export function composeSections(
  manifest: FamilyManifest,
  renderers: SectionRenderers,
  fallback: SectionRenderers,
  theme?: { sectionOrder?: unknown },
): ReactNode[] {
  const chosen = familyChoices(manifest, theme).manifest;
  return composedSectionOrder(chosen).map((id) => <Fragment key={id}>{(renderers[id] ?? fallback[id])?.() ?? null}</Fragment>);
}

const SHARED_GALLERY: GalleryFrame = {
  spacing: 'mt-8',
  grid: { className: 'grid grid-cols-2 gap-3 sm:grid-cols-3', photo: () => ({ image: 'aspect-square w-full rounded-2xl object-cover', sizes: IMAGE_SIZES.wideGallery }) },
  shape: 'rounded-2xl',
  masonry: { columns: 'columns-2 sm:columns-3', sizes: IMAGE_SIZES.wideGallery },
  carousel: { sizes: IMAGE_SIZES.wideCarousel },
};

function SharedSection({ id, tone, title, children }: { id: SectionId; tone: GuestView['tone']; title?: string; children: ReactNode }) {
  return (
    <section data-section={id} className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      {title && <h2 className={`font-serif text-3xl text-balance ${tone.ink}`}>{title}</h2>}
      {children}
    </section>
  );
}

/**
 * The shared drawing of every content section, for a family that does not declare one: the shared blocks on the
 * palette's tokens, left-aligned in one column. The cover, the notices and the footer are always the family's own (the
 * manifest validator requires them).
 */
export function sharedSections(props: GuestPageProps, view: GuestView): SectionRenderers {
  const { invitation, config } = props;
  const { tone, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery } = view;
  const card = `rounded-2xl border ${tone.line} ${tone.card}`;
  return {
    greeting: () =>
      config.greetings?.enabled !== false && (config.greetings?.prayer || config.settings?.openingCopy) ? (
        <SharedSection id="greeting" tone={tone}>
          {config.greetings?.prayer && <p className={`font-serif text-xl leading-relaxed text-pretty ${tone.accent}`}>{config.greetings.prayer}</p>}
          {config.settings?.openingCopy && <p className="mt-3 text-sm leading-7 text-pretty">{config.settings.openingCopy}</p>}
        </SharedSection>
      ) : null,
    quote: () =>
      view.quote ? (
        <SharedSection id="quote" tone={tone}>
          <figure className="flex gap-4">
            <InvitationIcon name="quote" className={`h-6 w-6 shrink-0 ${tone.accent}`} />
            <div>
              <blockquote className="font-serif text-xl leading-8 text-pretty">{view.quote.text}</blockquote>
              {view.quote.author && <figcaption className={`mt-3 text-xs uppercase tracking-widest ${tone.muted}`}>{view.quote.author}</figcaption>}
              {view.quote.provenance && <p className={`mt-3 text-xs leading-5 ${tone.muted}`}>{view.quote.provenance}</p>}
            </div>
          </figure>
        </SharedSection>
      ) : null,
    profiles: () =>
      view.profiles ? (
        <SharedSection id="profiles" tone={tone} title={view.profiles.heading}>
          <PortraitsBody view={view} section={view.profiles} frame="card" align="start" />
        </SharedSection>
      ) : null,
    events: () =>
      events.length > 0 ? (
        <SharedSection id="events" tone={tone} title={view.copy.sections.timeAndPlace}>
          {showCountdown && primaryEvent && (
            <Countdown target={primaryStartMs} initialNow={renderedAt} eventTitle={primaryEvent.title} boxClassName={card} labelClassName={tone.muted} labels={view.copy.countdown} />
          )}
          <div className="mt-8 flex flex-col gap-4">
            {events.map((event, index) => (
              <article key={`${event.title}-${index}`} className={`${card} p-5`}>
                <h3 dir="auto" className="font-serif text-xl text-balance [overflow-wrap:anywhere]">
                  {event.title}
                </h3>
                <EventFacts event={event} view={view} className="mt-3 space-y-2 text-sm" />
                {event.note && <p className={`mt-3 text-sm ${tone.muted}`}>{event.note}</p>}
                <MapBlock event={event} view={view} className="mt-4" />
              </article>
            ))}
          </div>
          <CalendarLinks view={view} slug={invitation.slug} className="mt-8 flex flex-col items-start gap-3 sm:flex-row" />
        </SharedSection>
      ) : null,
    ceremony: () =>
      view.ceremonyProfile ? (
        <SharedSection id="ceremony" tone={tone} title={view.ceremonyProfile.heading}>
          <CeremonyProfileBody view={view} cardClassName={card} frame="card" align="start" />
        </SharedSection>
      ) : null,
    programme: () =>
      programmeSections(view).map((id) => (
        <SharedSection key={id} id="programme" tone={tone} title={view.copy.programme[id]}>
          <ProgrammeBody id={id} view={view} cardClassName={card} />
        </SharedSection>
      )),
    story: () =>
      config.story?.enabled && config.story.items?.length ? (
        <SharedSection id="story" tone={tone} title={view.copy.sections.story}>
          <ol className="mt-8 flex flex-col gap-6">
            {config.story.items.map((item, index) => (
              <li key={index}>
                {item.date && <p className={`text-xs font-semibold uppercase tracking-widest ${tone.accent}`}>{item.date}</p>}
                {item.title && <h3 className="mt-1 font-serif text-xl text-balance">{item.title}</h3>}
                {item.body && <p className="mt-1 text-sm leading-7 text-pretty">{item.body}</p>}
              </li>
            ))}
          </ol>
        </SharedSection>
      ) : null,
    gallery: () =>
      gallery.length > 0 || view.galleryVideos.length > 0 ? (
        <SharedSection id="gallery" tone={tone} title={view.copy.sections.gallery}>
          <GalleryBody view={view} frame={SHARED_GALLERY} />
        </SharedSection>
      ) : null,
    streaming: () =>
      config.streaming?.enabled && config.streaming.url ? (
        <SharedSection id="streaming" tone={tone} title={view.copy.sections.liveStream}>
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            <InvitationIcon name="radio" className="h-4 w-4" />
            {view.copy.watchStream}
          </a>
        </SharedSection>
      ) : null,
    share: () =>
      view.share ? (
        <SharedSection id="share" tone={tone} title={view.copy.sections.share}>
          <ShareBody view={view} align="start" />
        </SharedSection>
      ) : null,
    gift: () =>
      view.gift ? (
        <SharedSection id="gift" tone={tone} title={view.copy.sections.gifts}>
          {view.gift.accounts.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {view.gift.accounts.map((account, index) => (
                <article key={index} className={`${card} p-5`}>
                  <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{account.label}</p>
                  {account.number && (
                    <p id={giftNumberId(index)} className="mt-3 font-mono text-lg tracking-wide [overflow-wrap:anywhere]">
                      {account.number}
                    </p>
                  )}
                  {account.holder && <p className={`mt-1 text-sm ${tone.muted}`}>{view.copy.gift.holderPrefix}{account.holder}</p>}
                  {account.number && (
                    <GiftCopyButton number={account.number} label={account.label} targetId={giftNumberId(index)} accentClass={tone.accent} mutedClass={tone.muted} labels={view.copy.giftCopy} />
                  )}
                  {account.note && <p className={`mt-2 text-sm ${tone.muted}`}>{account.note}</p>}
                </article>
              ))}
            </div>
          )}
          <GiftQris view={view} align="start" />
          <GiftWithheldNotice view={view} align="start" />
        </SharedSection>
      ) : null,
    rsvp: () =>
      view.rsvpShown ? (
        <SharedSection id="rsvp" tone={tone} title={view.copy.sections.rsvp}>
          <RsvpBlock props={props} view={view} formClassName={`mt-8 space-y-5 ${card} p-6`} fallbackClassName={`mt-8 ${card} p-6 text-sm ${tone.muted}`} />
        </SharedSection>
      ) : null,
    guestbook: () =>
      view.guestbookShown ? (
        <SharedSection id="guestbook" tone={tone} title={config.guestbook?.heading || view.copy.sections.wishes}>
          {config.guestbook?.prompt && <p className={`mt-2 text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock props={props} view={view} formClassName={`mt-8 space-y-4 ${card} p-6`} messageClassName={`${card} p-5`} />
        </SharedSection>
      ) : null,
  };
}
