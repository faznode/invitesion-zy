import { Fragment } from 'react';
import { InvitationIcon } from '@/components/invitation/icons';
import { Countdown } from '@/components/invitation/countdown';
import { PostEventMemory } from '@/components/invitation/post-event-memory';
import { GiftCopyButton } from '@/components/invitation/gift-copy';
import { InviteShareActions } from '@/components/invitation/invite-share';
import { ReadingToggle } from '@/components/invitation/reading-toggle';
import {
  CalendarLinks,
  CeremonyProfileBody,
  PortraitsBody,
  EventFacts,
  CorporateLogo,
  CorporateMark,
  CoverEyebrow,
  GiftQris,
  GiftWithheldNotice,
  giftNumberId,
  GuestbookBlock,
  MapBlock,
  ProgrammeBody,
  programmeSections,
  ReadOnlyNotice,
  RsvpBlock,
  ShareBody,
  SwitchedOffNotices,
  VariantImage,
} from '@/components/invitation/guest-blocks';
import type { GuestPageProps, GuestView } from '@/components/invitation/guest-view';
import { GalleryBody, type GalleryFrame } from '@/components/invitation/gallery';
import { composeSections, sharedSections, type SectionRenderers } from '@/components/invitation/family-sections';
import { FAMILY_MANIFESTS, familyChoices, type SectionId } from '@/lib/invitation/family-manifest';
import { IMAGE_SIZES } from '@/lib/media/variants';

/** B-025: Kartu's grid opens with one wide photo across both columns; its rounded cards keep that shape in every layout. */
const KARTU_GALLERY: GalleryFrame = {
  spacing: 'mt-8',
  grid: {
    className: 'grid grid-cols-2 gap-3',
    photo: (index) =>
      index === 0
        ? { span: 'col-span-2', image: 'aspect-[4/3] w-full rounded-xl object-cover', sizes: IMAGE_SIZES.kartuGalleryWide }
        : { image: 'aspect-square w-full rounded-xl object-cover', sizes: IMAGE_SIZES.kartuGallery },
  },
  shape: 'rounded-xl',
  masonry: { columns: 'columns-2', sizes: IMAGE_SIZES.kartuGallery },
  carousel: { sizes: IMAGE_SIZES.kartuCarousel },
};

type Tone = GuestView['tone'];

/**
 * Kartu (B-030): an asymmetric stack of printed cards. The cover is a card on an offset backing card with a dashed date
 * stamp; each event is a ticket whose date stub is torn off along a perforation. Left-aligned throughout. Motion tier 0
 * (`FAMILY_MANIFESTS.kartu`, which also holds the section order).
 */
export function KartuLayout({ props, view }: { props: GuestPageProps; view: GuestView }) {
  const { invitation, config, guest, readOnly } = props;
  const choices = familyChoices(FAMILY_MANIFESTS.kartu, config.theme);
  const { tone, formatDate, dateParts, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery, organiser } = view;
  const stamp = dateParts(primaryEvent?.startAt);
  const card = `rounded-2xl border ${tone.line} ${tone.card} shadow-sm`;
  const mark = view.corporateMark;
  const corporate = Boolean(mark);
  const eventTitle = view.headlineKind === 'event';
  const stampTile = stamp && (
    <p className={`shrink-0 rounded-lg border-2 border-dashed ${tone.accentLine} px-3 py-2 text-center ${tone.accent}`}>
      <span className="block font-serif text-3xl leading-none">{stamp.day}</span>
      <span className="mt-1 block text-xs uppercase tracking-widest">
        {stamp.monthShort} {stamp.year}
      </span>
    </p>
  );

  const sections: SectionRenderers = {
    cover: () => (
      <header data-section="cover" className="px-5 pb-12 pt-10 sm:pt-16">
        <div className="relative mx-auto max-w-md">
          <div aria-hidden className={`absolute inset-0 translate-x-3 translate-y-3 rounded-2xl ${tone.soft}`} />
          <div className={`relative ${card} p-6 sm:p-8`}>
            {view.coverImageSrc && (
              // S21-K1 (s22): the card is 28rem wide at every desktop size, so a 4:3 photo is always ≈ 287 px tall and the
              // guest name ended at 804–836 px, below the fold of a 1024 × 768, 1280 × 800 or 1366 × 768 viewport. From
              // 640 px the photo keeps 4:3 but is capped at what the viewport leaves after the cover's text with a two-line
              // guest name (≈ 34.5rem, plus a margin: 37rem), never below 11rem (as Gapura's window, E-040). Phones keep
              // the full 4:3 photo (S17-G1 holds at 360 × 800).
              <VariantImage
                srcSet={view.imageSrcSet(view.coverImageSrc)}
                sizes={IMAGE_SIZES.kartuCover}
                src={view.coverImageSrc}
                alt=""
                aria-hidden
                className="mb-6 aspect-[4/3] w-full rounded-xl object-cover sm:max-h-[max(11rem,calc(100svh_-_37rem))]"
              />
            )}
            {corporate ? (
              // S22-K2 (s23r): the organiser's logo takes the eyebrow's place beside the stamp, and the category and the
              // cover headline share one eyebrow line below, so the mark costs one row instead of three.
              <>
                <div className="flex items-start justify-between gap-4">
                  {mark?.logo ? <CorporateLogo view={view} align="start" className="min-w-0 flex-1 [--inv-logo-bg:var(--inv-card)]" /> : <span aria-hidden />}
                  {stampTile}
                </div>
                <CoverEyebrow category={mark?.category} headline={config.theme?.cover?.headline || view.copy.invitation} tone={tone} align="start" className="mt-5" />
              </>
            ) : (
              <>
                <CorporateMark view={view} align="start" className="mb-6 [--inv-logo-bg:var(--inv-card)]" />
                <div className="flex items-start justify-between gap-4">
                  <p className={`pt-1 text-xs uppercase tracking-[0.25em] ${tone.accent}`}>{config.theme?.cover?.headline || view.copy.invitation}</p>
                  {stampTile}
                </div>
              </>
            )}
            <h1
              className={
                eventTitle
                  ? `${corporate ? 'mt-5' : 'mt-10'} font-serif text-4xl leading-[1.1] text-balance [overflow-wrap:anywhere]`
                  : 'mt-10 font-serif text-5xl leading-[1.05] [overflow-wrap:anywhere]'
              }
            >
              {names?.length
                ? names.filter(Boolean).map((name, index) => (
                    <Fragment key={name ?? index}>
                      {index > 0 && <span className={`block text-3xl italic ${tone.accent}`}>&amp;</span>}
                      <span className="block" dir="auto">
                        {name}
                      </span>
                    </Fragment>
                  ))
                : config.settings?.title || view.copy.invitation}
            </h1>
            {organiser && (
              <p dir="auto" className={`mt-4 text-sm ${tone.muted} [overflow-wrap:anywhere]`}>
                {organiser}
              </p>
            )}
            {primaryEvent?.startAt && (
              <p className={`mt-6 text-sm ${tone.muted}`}>
                {formatDate(primaryEvent.startAt)}
                {primaryEvent.venueName ? ` · ${primaryEvent.venueName}` : ''}
              </p>
            )}
            {guest && (
              <div className={`mt-8 border-t-2 border-dashed ${tone.line} pt-5`}>
                <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.dear}</p>
                <p className="mt-1 font-serif text-2xl [overflow-wrap:anywhere]" dir="auto">
                  {guest.name}
                </p>
              </div>
            )}
          </div>
        </div>
        {view.reading && <ReadingToggle reading={view.reading} labels={view.copy.reading} accentClass={tone.accent} align="start" className="mx-auto max-w-md" />}
      </header>
    ),

    notices: () => (
      <>
        {readOnly && <ReadOnlyNotice className="mx-auto max-w-xl px-5" copy={view.copy} />}
        <SwitchedOffNotices props={props} view={view} className="mx-auto max-w-xl px-5" />
        <PostEventMemory props={props} view={view} className="mx-auto max-w-xl px-5" />
      </>
    ),

    greeting: () =>
      config.greetings?.enabled !== false &&
      (config.greetings?.prayer || config.settings?.openingCopy) && (
        <CardSection section="greeting" tone={tone}>
          <div className={`${card} p-6`}>
            {config.greetings?.prayer && <p className={`font-serif text-xl leading-relaxed text-pretty ${tone.accent}`}>{config.greetings.prayer}</p>}
            {config.settings?.openingCopy && <p className="mt-3 text-sm leading-7 text-pretty">{config.settings.openingCopy}</p>}
          </div>
        </CardSection>
      ),

    quote: () =>
      view.quote && (
        <CardSection section="quote" tone={tone}>
          <figure className="flex gap-4">
            <InvitationIcon name="quote" className={`h-8 w-8 shrink-0 ${tone.accent}`} />
            <div>
              <blockquote className="font-serif text-xl leading-8 text-pretty">{view.quote.text}</blockquote>
              {view.quote.author && <figcaption className={`mt-3 text-xs uppercase tracking-widest ${tone.muted}`}>{view.quote.author}</figcaption>}
              {view.quote.provenance && <p className={`mt-3 text-xs leading-5 ${tone.muted}`}>{view.quote.provenance}</p>}
            </div>
          </figure>
        </CardSection>
      ),

    profiles: () =>
      view.profiles && (
        <CardSection section="profiles" tone={tone} title={view.profiles.heading}>
          <PortraitsBody view={view} section={view.profiles} frame="card" align="start" />
        </CardSection>
      ),

    events: () =>
      events.length > 0 && (
        <CardSection section="events" tone={tone} label={view.copy.kartuLabels.timeAndPlace} title={view.copy.sections.eventSeries}>
          {showCountdown && primaryEvent && (
            <Countdown
              target={primaryStartMs}
              initialNow={renderedAt}
              eventTitle={primaryEvent.title}
              boxClassName={`border ${tone.line} ${tone.card}`}
              labelClassName={tone.muted}
              labels={view.copy.countdown}
            />
          )}
          <div className="mt-8 flex flex-col gap-4">
            {events.map((event, index) => {
              const parts = dateParts(event.startAt);
              return (
                <article key={`${event.title}-${index}`} className={`flex overflow-hidden ${card}`}>
                  <div className={`flex w-20 shrink-0 flex-col items-center justify-center border-r-2 border-dashed ${tone.line} ${tone.soft} px-2 py-5 text-center`}>
                    {parts ? (
                      <>
                        <span className="font-serif text-4xl leading-none">{parts.day}</span>
                        <span className={`mt-1 text-xs uppercase tracking-widest ${tone.muted}`}>{parts.monthShort}</span>
                      </>
                    ) : (
                      <span className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.sections.event}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 p-5">
                    <h3 className="font-serif text-xl text-balance">{event.title}</h3>
                    <EventFacts event={event} view={view} className="mt-3 space-y-2 text-sm" />
                    {event.note && <p className={`mt-3 text-sm ${tone.muted}`}>{event.note}</p>}
                    <MapBlock event={event} view={view} className="mt-4" />
                  </div>
                </article>
              );
            })}
          </div>
          <CalendarLinks view={view} slug={invitation.slug} className="mt-8 flex flex-col items-start gap-3 sm:flex-row" />
        </CardSection>
      ),

    ceremony: () =>
      view.ceremonyProfile && (
        <CardSection section="ceremony" tone={tone} label={view.copy.kartuLabels.profile} title={view.ceremonyProfile.heading}>
          <CeremonyProfileBody view={view} cardClassName={card} frame="card" align="start" />
        </CardSection>
      ),

    programme: () =>
      programmeSections(view).map((id) => (
        <CardSection key={id} section="programme" tone={tone} label={view.copy.kartuProgramme[id]} title={view.copy.programme[id]}>
          <ProgrammeBody id={id} view={view} cardClassName={card} />
        </CardSection>
      )),

    story: () =>
      config.story?.enabled && config.story.items?.length ? (
        <CardSection section="story" tone={tone} label={view.copy.kartuLabels.journey} title={view.copy.sections.ourStory}>
          <ol className="mt-8 flex flex-col gap-6">
            {config.story.items.map((item, index) => (
              <li key={index} className={`relative ${card} p-5 pt-7`}>
                {item.date && (
                  <p className={`absolute -top-3 left-5 rounded-full border ${tone.line} ${tone.bg} px-3 py-0.5 text-xs ${tone.accent}`}>{item.date}</p>
                )}
                {item.title && <h3 className="font-serif text-xl text-balance">{item.title}</h3>}
                {item.body && <p className="mt-2 text-sm leading-7 text-pretty">{item.body}</p>}
              </li>
            ))}
          </ol>
        </CardSection>
      ) : null,

    gallery: () =>
      (gallery.length > 0 || view.galleryVideos.length > 0) && (
        <CardSection section="gallery" tone={tone} label={view.copy.kartuLabels.moments} title={view.copy.sections.gallery}>
          <GalleryBody view={view} frame={KARTU_GALLERY} />
        </CardSection>
      ),

    streaming: () =>
      config.streaming?.enabled &&
      config.streaming.url && (
        <CardSection section="streaming" tone={tone} label={view.copy.kartuLabels.fromAfar} title={view.copy.sections.liveStream}>
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            <InvitationIcon name="radio" className="h-4 w-4" />
            {view.copy.watchStream}
          </a>
        </CardSection>
      ),

    share: () =>
      view.share && (
        <CardSection section="share" tone={tone} label={view.copy.kartuLabels.social} title={view.copy.sections.share}>
          <ShareBody view={view} align="start" />
        </CardSection>
      ),

    gift: () =>
      view.gift ? (
        <CardSection section="gift" tone={tone} label={view.copy.kartuLabels.tokenOfLove} title={view.copy.sections.gifts}>
          {view.gift.accounts.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {view.gift.accounts.map((account, index) => (
                <article key={index} className={`rounded-2xl border-2 border-dashed ${tone.line} ${tone.card} p-5`}>
                  <div className="flex items-center gap-2">
                    <InvitationIcon name="gift" className={`h-4 w-4 shrink-0 ${tone.accent}`} />
                    <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{account.label}</p>
                  </div>
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
        </CardSection>
      ) : null,

    // RSVP — only a recognised guest can respond, and only while the invitation is active.
    rsvp: () =>
      view.rsvpShown && (
        <CardSection section="rsvp" tone={tone} label={view.copy.kartuLabels.rsvp} title={view.copy.sections.rsvp}>
          <RsvpBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-5 ${card} border-t-4 border-t-(--inv-accent) p-6`}
            fallbackClassName={`mt-8 rounded-2xl border-2 border-dashed ${tone.line} ${tone.card} p-6 text-sm ${tone.muted}`}
          />
        </CardSection>
      ),

    guestbook: () =>
      view.guestbookShown && (
        <CardSection section="guestbook" tone={tone} label={view.copy.kartuLabels.guestbook} title={config.guestbook?.heading || view.copy.sections.wishes}>
          {config.guestbook?.prompt && <p className={`mt-2 text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock props={props} view={view} formClassName={`mt-8 space-y-4 ${card} p-6`} messageClassName={`${card} p-5`} />
        </CardSection>
      ),

    footer: () => (
      <footer data-section="footer" className={`mx-auto max-w-xl px-5 pb-12 pt-4 text-xs ${tone.muted}`}>
        {view.inviteShare && (
          <div className="mb-6">
            <InviteShareActions share={view.inviteShare} labels={view.copy.inviteShare} accentClass={tone.accent} mutedClass={tone.muted} fieldClass={`${tone.line} ${tone.field}`} align="start" />
          </div>
        )}
        <p>{view.copy.footer}</p>
      </footer>
    ),
  };

  return (
    <main lang={view.contentLang} className={`min-h-screen ${tone.bg} ${tone.ink}`} style={tone.style} data-font-pairing={choices.fontPairing} data-reading={view.reading?.on ? 'large' : undefined}>
      {composeSections(FAMILY_MANIFESTS.kartu, sections, sharedSections(props, view), config.theme)}
    </main>
  );
}

function CardSection({ section, tone, label, title, children }: { section: SectionId; tone: Tone; label?: string; title?: string; children: React.ReactNode }) {
  return (
    <section data-section={section} className="mx-auto w-full max-w-xl px-5 py-10 sm:py-14">
      {label && <p className={`text-xs uppercase tracking-[0.25em] ${tone.muted}`}>{label}</p>}
      {title && <h2 className="mt-1 font-serif text-3xl text-balance">{title}</h2>}
      {children}
    </section>
  );
}
