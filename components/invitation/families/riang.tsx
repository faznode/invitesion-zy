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
import { FAMILY_MANIFESTS, familyChoices, motionClasses, type SectionId } from '@/lib/invitation/family-manifest';
import { IMAGE_SIZES } from '@/lib/media/variants';

/** B-025: Riang's soft square tiles, two to a row on phones and three from `sm`, the same corners in every layout. */
const RIANG_GALLERY: GalleryFrame = {
  spacing: 'mt-8',
  grid: { className: 'grid grid-cols-2 gap-3 sm:grid-cols-3', photo: () => ({ image: 'aspect-square w-full rounded-3xl object-cover', sizes: IMAGE_SIZES.wideGallery }) },
  shape: 'rounded-3xl',
  masonry: { columns: 'columns-2 sm:columns-3', sizes: IMAGE_SIZES.wideGallery },
  carousel: { sizes: IMAGE_SIZES.wideCarousel },
};

type Tone = GuestView['tone'];

/**
 * Riang (B-030): for birthdays, thanksgivings, aqiqah, khitanan and company events. A bunting row opens a tinted
 * cover with the date as a calendar tile; the sections below alternate between plain and tinted full-width bands, so
 * the rhythm holds whichever sections the host turned on. Who and when lead; the opening words follow the facts (the
 * order is `FAMILY_MANIFESTS.riang`). Motion tier 1 (`inv-rise`, off under reduced motion).
 */
export function RiangLayout({ props, view }: { props: GuestPageProps; view: GuestView }) {
  const { invitation, config, guest, readOnly } = props;
  const choices = familyChoices(FAMILY_MANIFESTS.riang, config.theme);
  const { tone, formatTime, dateParts, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery, organiser } = view;
  const tile = dateParts(primaryEvent?.startAt);
  const startTime = formatTime(primaryEvent?.startAt);
  const block = `rounded-3xl border ${tone.line} ${tone.card} shadow-sm`;
  const chip = `rounded-full border ${tone.line} ${tone.card} px-4 py-2`;
  const mark = view.corporateMark;
  const { rise } = motionClasses(FAMILY_MANIFESTS.riang.motionTier);
  // The bands alternate plain and tinted in the order they render; `composeSections` calls each renderer once, in the
  // manifest's order, so the count follows the page.
  let bandIndex = 0;
  const band = (section: SectionId, key: string, node: React.ReactNode) => (
    <section key={key} data-section={section} className={bandIndex++ % 2 === 1 ? tone.soft : undefined}>
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-20">{node}</div>
    </section>
  );

  const sections: SectionRenderers = {
    cover: () => (
      <header data-section="cover" className={`overflow-hidden ${tone.soft} px-5 pb-14 pt-6 text-center`}>
        <Bunting tone={tone} />
        {view.coverImageSrc && (
          <VariantImage
            srcSet={view.imageSrcSet(view.coverImageSrc)}
            sizes={IMAGE_SIZES.riangCover}
            src={view.coverImageSrc}
            alt=""
            aria-hidden
            className={`mx-auto mt-10 aspect-square w-36 rounded-full border-4 ${tone.line} object-cover`}
          />
        )}
        {mark ? (
          // S22-K2 (s23r): the logo alone, then the category and the cover headline on one eyebrow line.
          <>
            <CorporateLogo view={view} align="center" className="mx-auto mt-6 [--inv-logo-bg:var(--inv-soft)]" />
            <CoverEyebrow category={mark.category} headline={config.theme?.cover?.headline || view.copy.youAreInvited} tone={tone} align="center" className={rise('mt-5')} />
          </>
        ) : (
          <>
            {/* The cover is drawn on the soft tone, so a lost logo file is covered in that colour (s20 acceptance, M2). */}
            <CorporateMark view={view} align="center" className="mt-10 [--inv-logo-bg:var(--inv-soft)]" />
            <p className={rise(`mt-10 text-sm font-semibold uppercase tracking-[0.2em] ${tone.accent}`)}>{config.theme?.cover?.headline || view.copy.youAreInvited}</p>
          </>
        )}
        <h1
          className={
            view.headlineKind === 'event'
              ? `mx-auto ${mark ? 'mt-3' : 'mt-4'} max-w-2xl font-serif text-4xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-5xl`
              : 'mx-auto mt-4 max-w-2xl font-serif text-5xl leading-none text-balance [overflow-wrap:anywhere] sm:text-7xl'
          }
        >
          {names?.length
            ? names.filter(Boolean).map((name, index) => (
                <Fragment key={name ?? index}>
                  {index > 0 && <span className={`mx-3 ${tone.accent}`}>&amp;</span>}
                  <span dir="auto">{name}</span>
                </Fragment>
              ))
            : config.settings?.title || view.copy.invitation}
        </h1>
        {organiser && (
          <p dir="auto" className={`mx-auto mt-4 max-w-xl text-sm ${tone.muted} [overflow-wrap:anywhere]`}>
            {organiser}
          </p>
        )}
        {tile && (
          <div className={rise(`${mark ? 'mt-8' : 'mt-10'} flex flex-wrap items-center justify-center gap-4`)}>
            <p className={`${block} px-6 py-4`}>
              <span className={`block text-xs uppercase tracking-widest ${tone.muted}`}>{tile.weekday}</span>
              <span className={`block font-serif text-6xl leading-none ${tone.accent}`}>{tile.day}</span>
              <span className="mt-1 block text-sm font-semibold">
                {tile.month} {tile.year}
              </span>
            </p>
            {(startTime || primaryEvent?.venueName) && (
              // S23r-P1 (s24): with an organiser's mark the facts stay beside the date card on phones too, as they do from
              // 640 px, so the date and its facts read as one row; the column takes the width the card leaves and wraps.
              <ul
                className={
                  mark
                    ? 'flex min-w-0 max-w-60 flex-1 flex-col items-start gap-2 text-left text-sm [overflow-wrap:anywhere] sm:flex-initial'
                    : 'flex max-w-60 flex-col items-center gap-2 text-center text-sm sm:items-start sm:text-left'
                }
              >
                {startTime && <li className={chip}>{startTime}</li>}
                {primaryEvent?.venueName && <li className={chip}>{primaryEvent.venueName}</li>}
              </ul>
            )}
          </div>
        )}
        {guest && (
          <p className={rise(`mx-auto ${mark ? 'mt-6' : 'mt-10'} inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 ${chip} py-3 text-sm`)}>
            <span className={tone.muted}>{view.copy.forYou}</span>
            <bdi className="font-semibold [overflow-wrap:anywhere]">{guest.name}</bdi>
          </p>
        )}
        {view.reading && <ReadingToggle reading={view.reading} labels={view.copy.reading} accentClass={tone.accent} align="center" />}
      </header>
    ),

    notices: () => (
      <>
        {readOnly && <ReadOnlyNotice className="mx-auto max-w-2xl px-5 pt-8" copy={view.copy} />}
        <SwitchedOffNotices props={props} view={view} className="mx-auto max-w-2xl px-5 pt-8" />
        <PostEventMemory props={props} view={view} className="mx-auto max-w-2xl px-5" />
      </>
    ),

    profiles: () =>
      view.profiles &&
      band(
        'profiles',
        'portraits',
        <>
          <BandHeading tone={tone}>{view.profiles.heading}</BandHeading>
          <PortraitsBody view={view} section={view.profiles} frame="round" />
        </>,
      ),

    events: () =>
      events.length > 0 &&
      band(
        'events',
        'events',
        <>
          <BandHeading tone={tone}>{view.copy.sections.event}</BandHeading>
          {showCountdown && primaryEvent && (
            <Countdown target={primaryStartMs} initialNow={renderedAt} eventTitle={primaryEvent.title} boxClassName={block} labelClassName={tone.muted} labels={view.copy.countdown} />
          )}
          <div className={`mt-8 grid gap-4 ${events.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {events.map((event, index) => {
              const parts = dateParts(event.startAt);
              return (
                <article key={`${event.title}-${index}`} className={`${block} p-6`}>
                  <div className="flex items-start gap-4">
                    {parts && (
                      <p className={`shrink-0 rounded-2xl ${tone.soft} px-3 py-2 text-center`}>
                        <span className={`block font-serif text-3xl leading-none ${tone.accent}`}>{parts.day}</span>
                        <span className={`block text-xs uppercase tracking-widest ${tone.muted}`}>{parts.monthShort}</span>
                      </p>
                    )}
                    <h3 className="font-serif text-2xl leading-tight text-balance">{event.title}</h3>
                  </div>
                  <EventFacts event={event} view={view} />
                  {event.note && <p className={`mt-4 text-sm ${tone.muted}`}>{event.note}</p>}
                  <MapBlock event={event} view={view} />
                </article>
              );
            })}
          </div>
          <CalendarLinks view={view} slug={invitation.slug} className="mt-8 flex flex-col items-start gap-3 sm:flex-row" />
        </>,
      ),

    ceremony: () =>
      view.ceremonyProfile &&
      band(
        'ceremony',
        'profile',
        <>
          <BandHeading tone={tone}>{view.ceremonyProfile.heading}</BandHeading>
          <CeremonyProfileBody view={view} cardClassName={block} frame="round" />
        </>,
      ),

    programme: () =>
      programmeSections(view).map((id) =>
        band(
          'programme',
          `programme-${id}`,
          <>
            <BandHeading tone={tone}>{view.copy.programme[id]}</BandHeading>
            <ProgrammeBody id={id} view={view} cardClassName={block} />
          </>,
        ),
      ),

    greeting: () =>
      config.greetings?.enabled !== false &&
      (config.greetings?.prayer || config.settings?.openingCopy) &&
      band(
        'greeting',
        'greeting',
        <div className="text-center">
          {config.greetings?.prayer && <p className={`font-serif text-2xl leading-snug text-balance ${tone.accent}`}>{config.greetings.prayer}</p>}
          {config.settings?.openingCopy && <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty">{config.settings.openingCopy}</p>}
        </div>,
      ),

    quote: () =>
      view.quote &&
      band(
        'quote',
        'quote',
        <figure className="text-center">
          <InvitationIcon name="quote" className={`mx-auto h-8 w-8 ${tone.accent}`} />
          <blockquote className="mx-auto mt-4 max-w-xl font-serif text-2xl leading-snug text-balance">{view.quote.text}</blockquote>
          {view.quote.author && <figcaption className={`mt-4 text-xs uppercase tracking-widest ${tone.muted}`}>{view.quote.author}</figcaption>}
          {view.quote.provenance && <p className={`mx-auto mt-3 max-w-xl text-xs leading-5 ${tone.muted}`}>{view.quote.provenance}</p>}
        </figure>,
      ),

    story: () =>
      config.story?.enabled && config.story.items?.length
        ? band(
            'story',
            'story',
            <>
              <BandHeading tone={tone}>{view.copy.sections.story}</BandHeading>
              <ol className="mt-8 flex flex-col gap-6">
                {config.story.items.map((item, index) => (
                  <li key={index} className="flex gap-4">
                    <span aria-hidden className={`mt-1.5 block size-3 shrink-0 rounded-full ${tone.accentFill}`} />
                    <div>
                      {item.date && <p className={`text-xs font-semibold uppercase tracking-widest ${tone.accent}`}>{item.date}</p>}
                      {item.title && <h3 className="mt-1 font-serif text-xl text-balance">{item.title}</h3>}
                      {item.body && <p className="mt-1 text-sm leading-7 text-pretty">{item.body}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </>,
          )
        : null,

    gallery: () =>
      (gallery.length > 0 || view.galleryVideos.length > 0) &&
      band(
        'gallery',
        'gallery',
        <>
          <BandHeading tone={tone}>{view.copy.sections.gallery}</BandHeading>
          <GalleryBody view={view} frame={RIANG_GALLERY} />
        </>,
      ),

    streaming: () =>
      config.streaming?.enabled &&
      config.streaming.url &&
      band(
        'streaming',
        'streaming',
        <>
          <BandHeading tone={tone}>{view.copy.sections.liveStream}</BandHeading>
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            <InvitationIcon name="radio" className="h-4 w-4" />
            {view.copy.watchStream}
          </a>
        </>,
      ),

    share: () =>
      view.share &&
      band(
        'share',
        'share',
        <>
          <BandHeading tone={tone}>{view.copy.sections.share}</BandHeading>
          <ShareBody view={view} align="start" />
        </>,
      ),

    gift: () => {
      const gift = view.gift;
      return gift
        ? band(
            'gift',
            'gift',
            <>
              <BandHeading tone={tone}>{view.copy.sections.giftsCasual}</BandHeading>
              {gift.accounts.length > 0 && (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {gift.accounts.map((account, index) => (
                    <article key={index} className={`${block} p-6`}>
                      <div className="flex items-center gap-2">
                        <InvitationIcon name="gift" className={`h-5 w-5 shrink-0 ${tone.accent}`} />
                        <p className={`text-xs font-semibold uppercase tracking-widest ${tone.muted}`}>{account.label}</p>
                      </div>
                      {account.number && (
                        <p id={giftNumberId(index)} className="mt-3 font-mono text-xl tracking-wide [overflow-wrap:anywhere]">
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
            </>,
          )
        : null;
    },

    // RSVP — only a recognised guest can respond, and only while the invitation is active.
    rsvp: () =>
      view.rsvpShown &&
      band(
        'rsvp',
        'rsvp',
        <>
          <BandHeading tone={tone}>{view.copy.sections.rsvp}</BandHeading>
          <RsvpBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-5 ${block} p-6`}
            fallbackClassName={`mt-8 ${block} p-6 text-sm ${tone.muted}`}
          />
        </>,
      ),

    guestbook: () =>
      view.guestbookShown &&
      band(
        'guestbook',
        'guestbook',
        <>
          <BandHeading tone={tone}>{config.guestbook?.heading || view.copy.sections.wishes}</BandHeading>
          {config.guestbook?.prompt && <p className={`mt-4 text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock props={props} view={view} formClassName={`mt-8 space-y-4 ${block} p-6`} messageClassName={`${block} p-5`} />
        </>,
      ),

    footer: () => (
      <footer data-section="footer" className={`px-5 pb-12 pt-8 text-center text-xs ${tone.muted}`}>
        {view.inviteShare && (
          <div className="mb-6">
            <InviteShareActions share={view.inviteShare} labels={view.copy.inviteShare} accentClass={tone.accent} mutedClass={tone.muted} fieldClass={`${tone.line} ${tone.field}`} align="center" />
          </div>
        )}
        <p>{view.copy.footer}</p>
      </footer>
    ),
  };

  return (
    <main lang={view.contentLang} className={`min-h-screen ${tone.bg} ${tone.ink}`} style={tone.style} data-font-pairing={choices.fontPairing} data-reading={view.reading?.on ? 'large' : undefined}>
      {composeSections(FAMILY_MANIFESTS.riang, sections, sharedSections(props, view), config.theme)}
    </main>
  );
}

function BandHeading({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-serif text-4xl text-balance sm:text-5xl">{children}</h2>
      <span aria-hidden className={`mt-3 block h-1.5 w-14 rounded-full ${tone.accentFill}`} />
    </div>
  );
}

/** Umbul-umbul: a string of alternating pennants, CSS only. */
function Bunting({ tone }: { tone: Tone }) {
  return (
    <div aria-hidden className="mx-auto max-w-lg">
      <span className={`block h-px w-full ${tone.lineFill}`} />
      <span className="flex justify-between px-2">
        {Array.from({ length: 13 }, (_, index) => (
          <span key={index} className={`block h-5 w-4 [clip-path:polygon(0_0,100%_0,50%_100%)] ${index % 2 ? tone.accentFill : tone.inkFill}`} />
        ))}
      </span>
    </div>
  );
}
