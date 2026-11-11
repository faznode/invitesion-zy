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
import { GalleryBody } from '@/components/invitation/gallery';
import { composeSections, sharedSections, type SectionRenderers } from '@/components/invitation/family-sections';
import { FAMILY_MANIFESTS, familyChoices, type SectionId } from '@/lib/invitation/family-manifest';
import { IMAGE_SIZES } from '@/lib/media/variants';

type Tone = GuestView['tone'];

/**
 * Lontar (B-030, brief `templates/_briefs/lontar.md`): a programme-led page for formal and corporate events. The cover
 * reads like a letter (event, who invites, addressee, opening words) around one palm-leaf band, two punched holes on a
 * binding cord drawn in CSS, that carries the date, time and venue. The programme follows the cover before any other
 * section; the events with address and map come after it (the order is the manifest's, `FAMILY_MANIFESTS.lontar`).
 * Left-aligned, motion tier 0, no translucent surfaces, and a cover photo is framed beside the band, never under text.
 */
export function LontarLayout({ props, view }: { props: GuestPageProps; view: GuestView }) {
  const { invitation, config, guest, readOnly } = props;
  const choices = familyChoices(FAMILY_MANIFESTS.lontar, config.theme);
  const { tone, formatDate, formatTime, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery, organiser } = view;
  const card = `rounded-2xl border ${tone.line} ${tone.card}`;
  const date = formatDate(primaryEvent?.startAt);
  const start = formatTime(primaryEvent?.startAt);
  const end = formatTime(primaryEvent?.endAt);
  const photo = view.coverImageSrc;
  const mark = view.corporateMark;
  // S17-L1: the band and the photo are independent. A saved photo sits beside the band when both exist and is framed on
  // its own otherwise, so an invitation without date, time or venue still shows it.
  const band = Boolean(date || start || primaryEvent?.venueName);
  // S23r-P1 (s24): on a phone a corporate cover greets the guest right after the date band and shows the photo after the
  // greeting; the photo is decorative (aria-hidden), so the reading order does not change. From 640 px the photo stays
  // beside the band and the greeting below both, as before.
  const greetBeforePhoto = Boolean(mark && band && photo && guest);
  const greeting = guest && (
    <div className={greetBeforePhoto ? 'mt-4 sm:col-span-2 sm:row-start-2' : mark ? 'mt-8' : 'mt-10'}>
      <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.dear}</p>
      <p dir="auto" className="mt-1 font-serif text-2xl [overflow-wrap:anywhere]">
        {guest.name}
      </p>
    </div>
  );

  const sections: SectionRenderers = {
    cover: () => (
      <header data-section="cover" className="mx-auto w-full max-w-2xl px-5 pb-4 pt-12 sm:pt-20">
        {mark ? (
          // S22-K2 (s23r): the logo alone, then the category and the cover headline on one eyebrow line.
          <>
            <CorporateLogo view={view} align="start" className="mb-4" />
            <CoverEyebrow category={mark.category} headline={config.theme?.cover?.headline} tone={tone} align="start" />
          </>
        ) : (
          <>
            <CorporateMark view={view} align="start" className="mb-6" />
            {config.theme?.cover?.headline && <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${tone.accent}`}>{config.theme.cover.headline}</p>}
          </>
        )}
        <h1
          className={
            view.headlineKind === 'event'
              ? `${mark ? 'mt-3' : 'mt-4'} font-serif text-3xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-5xl`
              : 'mt-4 font-serif text-4xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-6xl'
          }
        >
          {names?.length
            ? names.filter(Boolean).map((name, index) => (
                <Fragment key={name ?? index}>
                  {index > 0 && <span className={tone.accent}> &amp; </span>}
                  <span dir="auto">{name}</span>
                </Fragment>
              ))
            : config.settings?.title || view.copy.invitation}
        </h1>
        {organiser && (
          <p dir="auto" className={`mt-4 text-xs font-semibold uppercase tracking-[0.2em] ${tone.muted} [overflow-wrap:anywhere]`}>
            {organiser}
          </p>
        )}

        {(band || photo) && (
          <div className={`${mark ? 'mt-6' : 'mt-8'} grid gap-4 ${band && photo ? 'sm:grid-cols-[1fr_13rem]' : ''}`}>
            {band && (
              <div className={`relative rounded-3xl ${tone.soft} px-6 pb-6 pt-11${greetBeforePhoto ? ' sm:col-start-1 sm:row-start-1' : ''}`}>
                <Binding tone={tone} />
                {date && <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${tone.muted}`}>{date}</p>}
                {start && <p className="mt-2 font-serif text-3xl leading-tight">{start}</p>}
                {end && (
                  <p className={`text-sm ${tone.muted}`}>
                    {`${view.copy.until} `}
                    {end}
                  </p>
                )}
                {primaryEvent?.venueName && (
                  <p dir="auto" className="mt-3 text-sm font-medium [overflow-wrap:anywhere]">
                    {primaryEvent.venueName}
                  </p>
                )}
              </div>
            )}
            {greetBeforePhoto && greeting}
            {photo && (
              // A lone photo is bounded by its width: the unlayered `img { max-width: 100% }` in app/globals.css overrides every
              // max-w-* utility on an image (S18-E1).
              <VariantImage
                srcSet={view.imageSrcSet(photo)}
                sizes={IMAGE_SIZES.lontarCover}
                src={photo}
                alt=""
                aria-hidden
                className={`aspect-[4/3] w-full rounded-3xl border ${tone.line} object-cover ${band ? 'sm:aspect-auto sm:h-full' : 'sm:w-96'}${greetBeforePhoto ? ' mt-2 sm:col-start-2 sm:row-start-1 sm:mt-0' : ''}`}
              />
            )}
          </div>
        )}

        {!greetBeforePhoto && greeting}
        {/* The opening words are part of the letter (the manifest's `coverIncludes: ['greeting']`). */}
        {config.greetings?.enabled !== false && (config.greetings?.prayer || config.settings?.openingCopy) && (
          <div className="mt-6 max-w-prose">
            {config.greetings?.prayer && <p className={`font-serif text-lg leading-relaxed text-pretty ${tone.accent}`}>{config.greetings.prayer}</p>}
            {config.settings?.openingCopy && <p className="mt-2 text-sm leading-7 text-pretty">{config.settings.openingCopy}</p>}
          </div>
        )}
        {view.reading && <ReadingToggle reading={view.reading} labels={view.copy.reading} accentClass={tone.accent} align="start" />}
      </header>
    ),

    notices: () => (
      <>
        {readOnly && <ReadOnlyNotice className="mx-auto max-w-2xl px-5 pt-6" copy={view.copy} />}
        <SwitchedOffNotices props={props} view={view} className="mx-auto max-w-2xl px-5 pt-6" />
        <PostEventMemory props={props} view={view} className="mx-auto max-w-2xl px-5" />
      </>
    ),

    profiles: () =>
      view.profiles && (
        <LeafSection section="profiles" tone={tone} title={view.profiles.heading}>
          <PortraitsBody view={view} section={view.profiles} frame="leaf" align="start" />
        </LeafSection>
      ),

    ceremony: () =>
      view.ceremonyProfile && (
        <LeafSection section="ceremony" tone={tone} title={view.ceremonyProfile.heading}>
          <CeremonyProfileBody view={view} cardClassName={card} frame="leaf" align="start" />
        </LeafSection>
      ),

    programme: () =>
      programmeSections(view).map((id) => (
        <LeafSection key={id} section="programme" tone={tone} title={view.copy.programme[id]}>
          <ProgrammeBody id={id} view={view} cardClassName={card} />
        </LeafSection>
      )),

    events: () =>
      events.length > 0 && (
        <LeafSection section="events" tone={tone} title={view.copy.sections.timeAndPlace}>
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
        </LeafSection>
      ),

    quote: () =>
      view.quote && (
        <LeafSection section="quote" tone={tone}>
          <figure className="flex gap-4">
            <InvitationIcon name="quote" className={`h-6 w-6 shrink-0 ${tone.accent}`} />
            <div>
              <blockquote className="font-serif text-xl leading-8 text-pretty">{view.quote.text}</blockquote>
              {view.quote.author && <figcaption className={`mt-3 text-xs uppercase tracking-widest ${tone.muted}`}>{view.quote.author}</figcaption>}
              {view.quote.provenance && <p className={`mt-3 text-xs leading-5 ${tone.muted}`}>{view.quote.provenance}</p>}
            </div>
          </figure>
        </LeafSection>
      ),

    story: () =>
      config.story?.enabled && config.story.items?.length ? (
        <LeafSection section="story" tone={tone} title={view.copy.sections.story}>
          <ol className="mt-8 flex flex-col gap-6">
            {config.story.items.map((item, index) => (
              <li key={index} className="sm:grid sm:grid-cols-[7rem_1fr] sm:gap-4">
                {item.date ? <p className={`text-xs font-semibold uppercase tracking-widest ${tone.accent} sm:pt-1.5`}>{item.date}</p> : <span aria-hidden className="hidden sm:block" />}
                <div>
                  {item.title && <h3 className="font-serif text-xl text-balance">{item.title}</h3>}
                  {item.body && <p className="mt-1 text-sm leading-7 text-pretty">{item.body}</p>}
                </div>
              </li>
            ))}
          </ol>
        </LeafSection>
      ) : null,

    gallery: () =>
      (gallery.length > 0 || view.galleryVideos.length > 0) && (
        <LeafSection section="gallery" tone={tone} title={view.copy.sections.gallery}>
          <GalleryBody
            view={view}
            frame={{
              spacing: 'mt-8',
              grid: {
                className: 'grid grid-cols-2 gap-3 sm:grid-cols-3',
                photo: () => ({ image: `aspect-square w-full rounded-2xl border ${tone.line} object-cover`, sizes: IMAGE_SIZES.wideGallery }),
              },
              shape: `rounded-2xl border ${tone.line}`,
              masonry: { columns: 'columns-2 sm:columns-3', sizes: IMAGE_SIZES.wideGallery },
              carousel: { sizes: IMAGE_SIZES.wideCarousel },
            }}
          />
        </LeafSection>
      ),

    streaming: () =>
      config.streaming?.enabled &&
      config.streaming.url && (
        <LeafSection section="streaming" tone={tone} title={view.copy.sections.liveStream}>
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            <InvitationIcon name="radio" className="h-4 w-4" />
            {view.copy.watchStream}
          </a>
        </LeafSection>
      ),

    share: () =>
      view.share && (
        <LeafSection section="share" tone={tone} title={view.copy.sections.share}>
          <ShareBody view={view} align="start" />
        </LeafSection>
      ),

    gift: () =>
      view.gift ? (
        <LeafSection section="gift" tone={tone} title={view.copy.sections.gifts}>
          {view.gift.accounts.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {view.gift.accounts.map((account, index) => (
                <article key={index} className={`${card} p-5`}>
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
        </LeafSection>
      ) : null,

    // RSVP — only a recognised guest can respond, and only while the invitation is active.
    rsvp: () =>
      view.rsvpShown && (
        <LeafSection section="rsvp" tone={tone} title={view.copy.sections.rsvp}>
          <RsvpBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-5 ${card} p-6`}
            fallbackClassName={`mt-8 ${card} p-6 text-sm ${tone.muted}`}
          />
        </LeafSection>
      ),

    guestbook: () =>
      view.guestbookShown && (
        <LeafSection section="guestbook" tone={tone} title={config.guestbook?.heading || view.copy.sections.wishes}>
          {config.guestbook?.prompt && <p className={`mt-2 text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock props={props} view={view} formClassName={`mt-8 space-y-4 ${card} p-6`} messageClassName={`${card} p-5`} />
        </LeafSection>
      ),

    footer: () => (
      <footer data-section="footer" className={`mx-auto max-w-2xl px-5 pb-12 pt-4 text-xs ${tone.muted}`}>
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
      {composeSections(FAMILY_MANIFESTS.lontar, sections, sharedSections(props, view), config.theme)}
    </main>
  );
}

/** Each section opens like the next leaf of a bundle: a hairline across the column, then the title. */
function LeafSection({ section, tone, title, children }: { section: SectionId; tone: Tone; title?: string; children: React.ReactNode }) {
  return (
    <section data-section={section} className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
      <div className={`border-t ${tone.line} pt-8`}>
        {title && <h2 className="font-serif text-3xl text-balance">{title}</h2>}
        {children}
      </div>
    </section>
  );
}

/**
 * Two punched holes, each with its cord leaving through the top edge (decorative). A cord drawn across the band read as
 * a range slider at 1280 px (s15 review L2), so each cord only runs from its hole to the edge.
 */
function Binding({ tone }: { tone: Tone }) {
  return (
    <span aria-hidden className="absolute inset-x-0 top-5 block">
      {['left-[20%]', 'right-[20%]'].map((side) => (
        <span key={side} className={`absolute ${side} top-0 block`}>
          <span className={`absolute -top-5 left-0 block h-5 w-px -translate-x-1/2 ${tone.lineFill}`} />
          <span className={`absolute left-0 top-0 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${tone.line} ${tone.bg}`} />
        </span>
      ))}
    </span>
  );
}
