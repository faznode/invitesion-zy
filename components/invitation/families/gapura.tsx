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
import { MASONRY_PORTRAIT_ASPECTS } from '@/lib/invitation/gallery';
import { IMAGE_SIZES } from '@/lib/media/variants';

/** B-025: Gapura's arch-topped photos, two to a row, the same shape in every gallery layout (portrait boxes only). */
const GAPURA_GALLERY: GalleryFrame = {
  spacing: 'mt-10',
  grid: { className: 'grid grid-cols-2 gap-3', photo: () => ({ image: 'aspect-[3/4] w-full rounded-t-full object-cover', sizes: IMAGE_SIZES.gapuraGallery }) },
  shape: 'rounded-t-full',
  masonry: { columns: 'columns-2', sizes: IMAGE_SIZES.gapuraGallery, aspects: MASONRY_PORTRAIT_ASPECTS },
  carousel: { sizes: IMAGE_SIZES.gapuraCarousel },
};

type Tone = GuestView['tone'];

/**
 * Gapura (B-030): symmetric and ceremonial. The cover sits inside a double gate arch; a cover photo fills the gate's
 * window at full strength above the text (s17 revision, S16-X1), and event cards, gifts and forms repeat the arch; a
 * small diamond marks every section. Motion tier 1 (`FAMILY_MANIFESTS.gapura`): ornaments, date and guest block rise in
 * once (`inv-rise`, off under prefers-reduced-motion); the names never animate, so they paint first.
 */
export function GapuraLayout({ props, view }: { props: GuestPageProps; view: GuestView }) {
  const { invitation, config, guest, readOnly } = props;
  const choices = familyChoices(FAMILY_MANIFESTS.gapura, config.theme);
  const { tone, formatDate, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery, organiser } = view;
  const arch = `rounded-t-[3rem] rounded-b-2xl ${tone.card} shadow-sm`;
  const photo = view.coverImageSrc;
  const mark = view.corporateMark;
  const { rise } = motionClasses(FAMILY_MANIFESTS.gapura.motionTier);

  const sections: SectionRenderers = {
    // S16-X2 (s17): full-height only from 640 px; on a phone the cover ends with its content, so the first section
    // follows at the section rhythm instead of after ≈ 180 px of empty page.
    // S23r-P1 (s24): a corporate gate holds logo, eyebrow, title, organiser and date, so on a phone it takes the
    // desktop's top space (pt-10) and a tighter rhythm inside the window; from 640 px nothing changes.
    cover: () => (
      <header data-section="cover" className={`flex flex-col items-center justify-center px-5 ${mark ? 'pt-10' : 'pt-14'} text-center sm:min-h-[90vh] sm:pb-14 sm:pt-10`}>
        <div className={`w-full max-w-sm rounded-t-full border ${tone.line} p-2`}>
          <div className={`overflow-hidden rounded-t-full border ${tone.accentLine} ${mark ? 'pb-10 sm:pb-12' : 'pb-12'} ${photo ? '' : 'pt-20'}`}>
            {photo && (
              // S16-X1 (s17): the photo fills the gate's window at full strength and no text is set on it, so it reads as
              // a photograph with any photo and the cover text keeps the page's own contrast. S17-G1: a 4:3 window below
              // 640 px keeps the guest greeting inside a 360 × 800 first viewport. S18-G2 (s20): from 640 px the window is
              // as tall as the viewport leaves after the cover's text with a two-line guest name (≈ 36.5rem; a long couple's
              // name wraps to two lines on a desktop card), between 11rem and its full square (22.75rem), so on a
              // 1024 × 768, 1280 × 800 or 1366 × 768 screen the guest greeting is in the first viewport too.
              <VariantImage
                srcSet={view.imageSrcSet(photo)}
                sizes={IMAGE_SIZES.gapuraCover}
                src={photo}
                alt=""
                aria-hidden
                className="block aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-[clamp(11rem,calc(100svh_-_36.5rem),22.75rem)]"
              />
            )}
            <div className={`flex flex-col items-center px-6 ${photo ? (mark ? 'pt-6 sm:pt-8' : 'pt-8') : ''}`}>
              {mark ? (
                // S22-K2 (s23r): the organiser's logo crowns the window in the diamond's place, and the category and the
                // cover headline share one eyebrow line.
                <>
                  {mark.logo ? <CorporateLogo view={view} align="center" /> : <Diamond tone={tone} className={rise()} />}
                  <CoverEyebrow category={mark.category} headline={config.theme?.cover?.headline} tone={tone} align="center" className={rise('mt-5')} />
                </>
              ) : (
                <>
                  <Diamond tone={tone} className={rise()} />
                  <CorporateMark view={view} align="center" className="mt-6" />
                  {config.theme?.cover?.headline && (
                    <p className={rise(`mt-6 text-xs uppercase tracking-[0.3em] ${tone.accent}`)}>{config.theme.cover.headline}</p>
                  )}
                </>
              )}
              <h1
                className={
                  view.headlineKind === 'event'
                    ? `${mark ? 'mt-4' : 'mt-6'} font-serif text-3xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-4xl`
                    : 'mt-6 font-serif text-4xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-5xl'
                }
              >
                {names?.length
                  ? names.filter(Boolean).map((name, index) => (
                      <Fragment key={name ?? index}>
                        {index > 0 && <AmpersandRule tone={tone} />}
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
                <p className={rise(`${mark ? 'mt-6 sm:mt-8' : 'mt-8'} text-sm tracking-wide ${tone.accent}`)}>{formatDate(primaryEvent.startAt)}</p>
              )}
            </div>
          </div>
        </div>

        {guest && (
          <div className={rise(`mt-6 w-full max-w-sm rounded-2xl ${tone.soft} px-6 py-4`)}>
            <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.dear}</p>
            <p className="mt-1 font-serif text-xl [overflow-wrap:anywhere]" dir="auto">
              {guest.name}
            </p>
          </div>
        )}
        {view.reading && <ReadingToggle reading={view.reading} labels={view.copy.reading} accentClass={tone.accent} align="center" />}
      </header>
    ),

    notices: () => (
      <>
        {readOnly && <ReadOnlyNotice className="mx-auto max-w-lg px-6" copy={view.copy} />}
        <SwitchedOffNotices props={props} view={view} className="mx-auto max-w-lg px-6" />
        <PostEventMemory props={props} view={view} className="mx-auto max-w-lg px-6" />
      </>
    ),

    greeting: () =>
      config.greetings?.enabled !== false &&
      (config.greetings?.prayer || config.settings?.openingCopy) && (
        <ArchSection section="greeting" tone={tone}>
          {config.greetings?.prayer && <p className={`font-serif text-xl leading-relaxed text-balance ${tone.accent}`}>{config.greetings.prayer}</p>}
          {config.settings?.openingCopy && <p className="mt-4 text-sm leading-7 text-pretty">{config.settings.openingCopy}</p>}
        </ArchSection>
      ),

    quote: () =>
      view.quote && (
        <ArchSection section="quote" tone={tone}>
          <InvitationIcon name="quote" className={`mx-auto h-6 w-6 ${tone.accent}`} />
          <blockquote className="mt-4 font-serif text-xl leading-8 text-pretty">{view.quote.text}</blockquote>
          {view.quote.author && <cite className={`mt-3 block text-xs uppercase not-italic tracking-widest ${tone.muted}`}>{view.quote.author}</cite>}
          {view.quote.provenance && <p className={`mt-3 text-xs leading-5 ${tone.muted}`}>{view.quote.provenance}</p>}
        </ArchSection>
      ),

    profiles: () =>
      view.profiles && (
        <ArchSection section="profiles" tone={tone} title={view.profiles.heading}>
          <PortraitsBody view={view} section={view.profiles} frame="arch" />
        </ArchSection>
      ),

    events: () =>
      events.length > 0 && (
        <ArchSection section="events" tone={tone} title={view.copy.sections.eventSeries}>
          {showCountdown && primaryEvent && (
            <Countdown
              target={primaryStartMs}
              initialNow={renderedAt}
              eventTitle={primaryEvent.title}
              boxClassName={`rounded-t-3xl ${tone.soft}`}
              labelClassName={tone.muted}
              labels={view.copy.countdown}
            />
          )}
          <div className="mt-10 flex flex-col gap-6">
            {events.map((event, index) => (
              <article key={`${event.title}-${index}`} className={`${arch} px-6 pb-8 pt-10`}>
                <Diamond tone={tone} />
                <h3 className="mt-4 font-serif text-2xl text-balance">{event.title}</h3>
                <EventFacts
                  event={event}
                  view={view}
                  className="mt-5 flex flex-col items-center gap-2 text-sm"
                  rowClassName="flex items-center justify-center gap-2"
                  venueRowClassName="flex max-w-xs flex-col items-center gap-1"
                />
                {event.note && <p className={`mt-4 text-sm ${tone.muted}`}>{event.note}</p>}
                <MapBlock event={event} view={view} />
              </article>
            ))}
          </div>
          <CalendarLinks view={view} slug={invitation.slug} />
        </ArchSection>
      ),

    ceremony: () =>
      view.ceremonyProfile && (
        <ArchSection section="ceremony" tone={tone} title={view.ceremonyProfile.heading}>
          <CeremonyProfileBody view={view} cardClassName={`rounded-2xl ${tone.card} shadow-sm`} frame="arch" />
        </ArchSection>
      ),

    programme: () =>
      programmeSections(view).map((id) => (
        <ArchSection key={id} section="programme" tone={tone} title={view.copy.programme[id]}>
          <ProgrammeBody id={id} view={view} cardClassName={`rounded-2xl ${tone.card} shadow-sm`} />
        </ArchSection>
      )),

    story: () =>
      config.story?.enabled && config.story.items?.length ? (
        <ArchSection section="story" tone={tone} title={view.copy.sections.ourStory}>
          <ol className="mt-10 flex flex-col items-center">
            {config.story.items.map((item, index) => (
              <li key={index} className="flex flex-col items-center">
                {index > 0 && <span aria-hidden className={`my-6 block h-10 w-px ${tone.lineFill}`} />}
                {item.date && <p className={`text-xs uppercase tracking-widest ${tone.accent}`}>{item.date}</p>}
                {item.title && <h3 className="mt-2 font-serif text-xl text-balance">{item.title}</h3>}
                {item.body && <p className="mt-2 max-w-md text-sm leading-7 text-pretty">{item.body}</p>}
              </li>
            ))}
          </ol>
        </ArchSection>
      ) : null,

    gallery: () =>
      (gallery.length > 0 || view.galleryVideos.length > 0) && (
        <ArchSection section="gallery" tone={tone} title={view.copy.sections.gallery}>
          <GalleryBody view={view} frame={GAPURA_GALLERY} />
        </ArchSection>
      ),

    streaming: () =>
      config.streaming?.enabled &&
      config.streaming.url && (
        <ArchSection section="streaming" tone={tone} title={view.copy.sections.liveStream}>
          <InvitationIcon name="radio" className={`mx-auto mt-6 h-6 w-6 ${tone.accent}`} />
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-6 inline-flex min-h-11 items-center rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            {view.copy.watchStream}
          </a>
        </ArchSection>
      ),

    share: () =>
      view.share && (
        <ArchSection section="share" tone={tone} title={view.copy.sections.share}>
          <ShareBody view={view} align="center" />
        </ArchSection>
      ),

    gift: () =>
      view.gift ? (
        <ArchSection section="gift" tone={tone} title={view.copy.sections.tokenOfLove}>
          <InvitationIcon name="gift" className={`mx-auto mt-6 h-6 w-6 ${tone.accent}`} />
          {view.gift.accounts.length > 0 && (
            <div className="mt-8 flex flex-col gap-4">
              {view.gift.accounts.map((account, index) => (
                <article key={index} className={`${arch} px-6 pb-6 pt-9`}>
                  <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{account.label}</p>
                  {account.number && (
                    <p id={giftNumberId(index)} className="mt-2 font-mono text-lg tracking-wide [overflow-wrap:anywhere]">
                      {account.number}
                    </p>
                  )}
                  {account.holder && <p className={`mt-1 text-sm ${tone.muted}`}>{view.copy.gift.holderPrefix}{account.holder}</p>}
                  {account.number && (
                    <GiftCopyButton number={account.number} label={account.label} targetId={giftNumberId(index)} accentClass={tone.accent} mutedClass={tone.muted} align="center" labels={view.copy.giftCopy} />
                  )}
                  {account.note && <p className={`mt-2 text-sm ${tone.muted}`}>{account.note}</p>}
                </article>
              ))}
            </div>
          )}
          <GiftQris view={view} />
          <GiftWithheldNotice view={view} />
        </ArchSection>
      ) : null,

    // RSVP — only a recognised guest can respond, and only while the invitation is active.
    rsvp: () =>
      view.rsvpShown && (
        <ArchSection section="rsvp" tone={tone} title={view.copy.sections.rsvp}>
          <RsvpBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-5 ${arch} p-6 pt-10 text-left`}
            fallbackClassName={`mt-8 ${arch} border border-dashed ${tone.line} px-6 pb-6 pt-10 text-sm ${tone.muted}`}
          />
        </ArchSection>
      ),

    guestbook: () =>
      view.guestbookShown && (
        <ArchSection section="guestbook" tone={tone} title={config.guestbook?.heading || view.copy.sections.wishes}>
          {config.guestbook?.prompt && <p className={`mt-3 text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-4 ${arch} p-6 pt-10 text-left`}
            messageClassName={`rounded-2xl ${tone.card} p-5 text-left shadow-sm`}
          />
        </ArchSection>
      ),

    footer: () => (
      <footer data-section="footer" className={`flex flex-col items-center gap-4 px-6 pb-12 pt-4 text-center text-xs ${tone.muted}`}>
        {view.inviteShare && (
          <InviteShareActions share={view.inviteShare} labels={view.copy.inviteShare} accentClass={tone.accent} mutedClass={tone.muted} fieldClass={`${tone.line} ${tone.field}`} align="center" />
        )}
        <Diamond tone={tone} />
        <p>{view.copy.footer}</p>
      </footer>
    ),
  };

  return (
    <main lang={view.contentLang} className={`min-h-screen ${tone.bg} ${tone.ink}`} style={tone.style} data-font-pairing={choices.fontPairing} data-reading={view.reading?.on ? 'large' : undefined}>
      {composeSections(FAMILY_MANIFESTS.gapura, sections, sharedSections(props, view), config.theme)}
    </main>
  );
}

function ArchSection({ section, tone, title, children }: { section: SectionId; tone: Tone; title?: string; children: React.ReactNode }) {
  return (
    <section data-section={section} className="mx-auto w-full max-w-lg px-6 py-14 text-center sm:py-20">
      {title && (
        <>
          <Diamond tone={tone} />
          <h2 className={`mt-4 font-serif text-3xl text-balance ${tone.accent}`}>{title}</h2>
        </>
      )}
      {children}
    </section>
  );
}

function Diamond({ tone, className = '' }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={`mx-auto block size-2 rotate-45 ${tone.accentFill} ${className}`} />;
}

function AmpersandRule({ tone }: { tone: Tone }) {
  return (
    <span className={`my-3 flex items-center justify-center gap-3 text-2xl ${tone.accent}`}>
      <span aria-hidden className={`h-px w-10 ${tone.accentFill}`} />
      &amp;
      <span aria-hidden className={`h-px w-10 ${tone.accentFill}`} />
    </span>
  );
}
