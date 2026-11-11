import { googleCalendarUrl } from '@/lib/invitation/calendar';
import { GUEST_COPY, type GuestCopy } from '@/lib/invitation/guest-copy';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { mapFacadeOf } from '@/lib/invitation/map-embed';
import type { Portrait, Profile, Profiles } from '@/lib/invitation/portraits';
import { invitationCalendarPath } from '@/lib/invitation/public-path';
import { ANSWER_LIMITS } from '@/lib/invitation/rsvp-questions';
import { rsvpDefaultCount, type RsvpStatus } from '@/lib/invitation/rsvp-rules';
import { IMAGE_SIZES } from '@/lib/media/variants';
import { submitGuestMessage, submitRsvp } from '@/app/i/[slug]/actions';
import { InvitationIcon } from '@/components/invitation/icons';
import { MapFacade } from '@/components/invitation/map-facade';
import type { GuestPageProps, GuestView, InvitationEvent } from '@/components/invitation/guest-view';

/**
 * Behaviour shared by every guest-page layout (legacy and the B-030 families). Layouts own composition and framing;
 * the forms, notices and calendar links stay one implementation, so identity from the guest link, the guest-count
 * limit and the status messages cannot drift between layouts. Markup is the legacy page's, unchanged.
 */

export function Notice({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  return kind === 'success' ? (
    <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
      {children}
    </p>
  ) : (
    <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
      {children}
    </p>
  );
}

/**
 * B-027: a form rendered before the host switched its section off is refused on submit (`?rsvp=closed`, `?wish=closed`),
 * but that section is no longer on the page, so its own notice has nowhere to appear. Layouts place this where the
 * read-only notice goes, right after the cover. Nothing renders while the section is shown or when nothing was refused.
 * G-018: every block speaks the view's language (`view.copy`); the legacy layout's view is always Indonesian (D-041).
 */
export function SwitchedOffNotices({ props, view, className }: { props: GuestPageProps; view: GuestView; className: string }) {
  const refusals = [
    !view.rsvpShown && props.status.rsvp === 'closed' ? view.copy.rsvp.refusedClosed : null,
    !view.guestbookShown && props.status.wish === 'closed' ? view.copy.wishes.refusedClosed : null,
  ].filter((text): text is string => text !== null);
  if (!refusals.length) return null;
  return (
    <div className={className}>
      {refusals.map((text) => (
        <Notice key={text} kind="error">
          {text}
        </Notice>
      ))}
    </div>
  );
}

export function ReadOnlyNotice({ className = 'mx-auto max-w-xl px-6', copy = GUEST_COPY.id }: { className?: string; copy?: GuestCopy }) {
  return (
    <p className={className}>
      <span className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
        {copy.readOnly}
      </span>
    </p>
  );
}

export function EventFacts({
  event,
  view,
  className = 'mt-4 space-y-2 text-sm',
  rowClassName = 'flex items-center gap-2',
  venueRowClassName = 'flex items-start gap-2',
}: {
  event: InvitationEvent;
  view: GuestView;
  className?: string;
  rowClassName?: string;
  venueRowClassName?: string;
}) {
  const { tone, formatDate, formatTime } = view;
  return (
    <dl className={className}>
      {formatDate(event.startAt) && (
        <div className={rowClassName}>
          <InvitationIcon name="calendar-days" className={`h-4 w-4 shrink-0 ${tone.accent}`} />
          <dd>{formatDate(event.startAt)}</dd>
        </div>
      )}
      {formatTime(event.startAt) && (
        <div className={rowClassName}>
          <InvitationIcon name="clock" className={`h-4 w-4 shrink-0 ${tone.accent}`} />
          <dd>
            {formatTime(event.startAt)}
            {formatTime(event.endAt) ? ` – ${formatTime(event.endAt)}` : ''}
          </dd>
        </div>
      )}
      {(event.venueName || event.address) && (
        <div className={venueRowClassName}>
          <InvitationIcon name="map-pin" className={`mt-0.5 h-4 w-4 shrink-0 ${tone.accent}`} />
          <dd>
            {event.venueName && <span className="block font-medium">{event.venueName}</span>}
            {event.address && <span className={`block ${tone.muted}`}>{event.address}</span>}
          </dd>
        </div>
      )}
    </dl>
  );
}

export function MapLink({ event, view, className = 'mt-5' }: { event: InvitationEvent; view: GuestView; className?: string }) {
  if (!event.mapUrl) return null;
  return (
    <a
      href={event.mapUrl}
      target="_blank"
      rel="noreferrer"
      className={`${className} inline-flex min-h-11 items-center rounded-full border border-current px-5 text-xs font-semibold ${view.tone.accent}`}
    >
      {view.copy.seeLocation}
    </a>
  );
}

/**
 * G-029: the design families' location: the static link exactly as `MapLink` renders it, then, when the event can be
 * mapped (`mapFacadeOf`), the map behind its button. Without a map (flag off, no link, no coordinates or address) this is
 * `MapLink` itself, byte for byte. The legacy layout keeps `MapLink` (D-041).
 */
export function MapBlock({ event, view, className = 'mt-5' }: { event: InvitationEvent; view: GuestView; className?: string }) {
  const link = <MapLink event={event} view={view} className={className} />;
  const facade = mapFacadeOf(event, view.language);
  if (!facade) return link;
  return (
    <>
      {link}
      <MapFacade
        embedUrl={facade.embedUrl}
        title={event.venueName ? `${view.copy.map.frame}: ${event.venueName}` : view.copy.map.frame}
        labels={view.copy.map}
        accentClass={view.tone.accent}
        lineClass={view.tone.line}
      />
    </>
  );
}

export function CalendarLinks({
  view,
  slug,
  className = 'mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center',
}: {
  view: GuestView;
  slug: string;
  className?: string;
}) {
  // The calendar entry exists only for a published invitation's future primary event; it no longer depends on the
  // countdown, which the host can switch off (B-032).
  const { tone, primaryCalendarEvent } = view;
  if (!primaryCalendarEvent) return null;
  return (
    <div className={className}>
      <a
        href={googleCalendarUrl(primaryCalendarEvent)}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-5 text-xs font-semibold ${tone.accent}`}
      >
        <InvitationIcon name="calendar-plus" className="h-4 w-4" />
        {view.copy.calendarGoogle}
      </a>
      <a
        href={invitationCalendarPath(slug)}
        download
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-5 text-xs font-semibold ${tone.accent}`}
      >
        <InvitationIcon name="calendar-plus" className="h-4 w-4" />
        {view.copy.calendarFile}
      </a>
    </div>
  );
}

/**
 * B-029: the programme a corporate host typed (`view.programme`), each section only when filled, in one fixed order
 * after the event list. Layouts own the section frame and heading; rows, link rules and order stay here. Host text is
 * isolated for bidirectional scripts and wraps instead of overflowing at 360 px.
 */
/** The legacy layout's headings (Indonesian, D-041); the design families read `view.copy.programme`. */
export const PROGRAMME_HEADINGS = {
  about: GUEST_COPY.id.programme.about,
  agenda: GUEST_COPY.id.programme.agenda,
  speakers: GUEST_COPY.id.programme.speakers,
  info: GUEST_COPY.id.programme.info,
};

export type ProgrammeSectionId = keyof typeof PROGRAMME_HEADINGS;

export function programmeSections(view: GuestView): ProgrammeSectionId[] {
  const { programme } = view;
  if (!programme) return [];
  const filled: Record<ProgrammeSectionId, boolean> = {
    about: Boolean(programme.description),
    agenda: programme.agenda.length > 0,
    speakers: programme.speakers.length > 0,
    info: Boolean(programme.dressCode || programme.contact),
  };
  return (Object.keys(PROGRAMME_HEADINGS) as ProgrammeSectionId[]).filter((id) => filled[id]);
}

const HOST_TEXT = '[overflow-wrap:anywhere]';

export function ProgrammeBody({ id, view, cardClassName }: { id: ProgrammeSectionId; view: GuestView; cardClassName: string }) {
  const { programme, tone } = view;
  if (!programme) return null;

  if (id === 'about') {
    return (
      <p dir="auto" className={`mt-6 whitespace-pre-line text-sm leading-7 ${HOST_TEXT}`}>
        {programme.description}
      </p>
    );
  }

  // One card with divided rows: 30 rows as 30 cards took ≈ 3,100 px at 360 px (s15 review F1); from 640 px the time
  // gets its own column so a guest scans times down one edge.
  if (id === 'agenda') {
    return (
      <ol className={`mt-8 ${cardClassName} px-5`}>
        {programme.agenda.map((row, index) => (
          <li key={index} className={`py-4 sm:grid sm:grid-cols-[7rem_1fr] sm:gap-4 sm:text-left ${index > 0 ? `border-t ${tone.line}` : ''}`}>
            {row.time ? (
              <p dir="auto" className={`text-xs font-semibold uppercase tracking-widest ${tone.accent} sm:pt-1 ${HOST_TEXT}`}>
                {row.time}
              </p>
            ) : (
              <span aria-hidden className="hidden sm:block" />
            )}
            <div className="min-w-0">
              <p dir="auto" className={`${row.time ? 'mt-1 sm:mt-0 ' : ''}font-medium leading-snug ${HOST_TEXT}`}>
                {row.title}
              </p>
              {row.speaker && (
                <p dir="auto" className={`mt-1 text-sm ${tone.muted} ${HOST_TEXT}`}>
                  {row.speaker}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (id === 'speakers') {
    return (
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {programme.speakers.map((speaker, index) => (
          <li key={index} className={`${cardClassName} p-5`}>
            <p dir="auto" className={`font-medium leading-snug ${HOST_TEXT}`}>
              {speaker.name}
            </p>
            {speaker.role && (
              <p dir="auto" className={`mt-1 text-sm ${tone.muted} ${HOST_TEXT}`}>
                {speaker.role}
              </p>
            )}
            {speaker.org && (
              <p dir="auto" className={`text-sm ${tone.muted} ${HOST_TEXT}`}>
                {speaker.org}
              </p>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const { dressCode, contact } = programme;
  const link = `inline-flex min-h-11 items-center font-semibold underline underline-offset-4 ${tone.accent} ${HOST_TEXT}`;
  const contactValue = (value: { label: string; href?: string }) =>
    value.href ? (
      <a href={value.href} className={link}>
        {value.label}
      </a>
    ) : (
      <span dir="auto" className={HOST_TEXT}>
        {value.label}
      </span>
    );
  return (
    <dl className={`mt-8 flex flex-col gap-5 ${cardClassName} p-5 text-sm`}>
      {dressCode && (
        <div>
          <dt className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.programme.dressCode}</dt>
          <dd dir="auto" className={`mt-1 font-medium ${HOST_TEXT}`}>
            {dressCode}
          </dd>
        </div>
      )}
      {contact && (
        <div>
          <dt className={`text-xs uppercase tracking-widest ${tone.muted}`}>{view.copy.programme.contact}</dt>
          {contact.name && (
            <dd dir="auto" className={`mt-1 font-medium ${HOST_TEXT}`}>
              {contact.name}
            </dd>
          )}
          {contact.phone && <dd>{contactValue(contact.phone)}</dd>}
          {contact.email && <dd>{contactValue(contact.email)}</dd>}
        </div>
      )}
    </dl>
  );
}

/**
 * B-029: the ceremony profile (`view.ceremonyProfile`, aqiqah / khitanan / tasyakuran): the facts as rows of one divided
 * card (repeated rows share one container, s16 review), then the host's own texts under their labels. Layouts own the
 * section frame and its heading (`view.ceremonyProfile.heading`) and put it where they put the corporate programme.
 */
export function CeremonyProfileBody({
  view,
  cardClassName,
  frame = 'round',
  align = 'center',
}: {
  view: GuestView;
  cardClassName: string;
  frame?: PortraitFrame;
  align?: 'center' | 'start';
}) {
  const { ceremonyProfile: profile, tone } = view;
  if (!profile) return null;
  return (
    <>
      {profile.portrait && (
        <div className={`mt-8 flex ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {/* A child's photo (D-040) comes through the personal-link photo route, never a variant source: no srcSet. */}
          <PortraitFigure portrait={profile.portrait} frame={frame} tone={tone} align={align} srcSet={view.imageSrcSet(profile.portrait.src)} />
        </div>
      )}
      {profile.rows.length > 0 && (
        <dl className={`mt-8 ${cardClassName} px-5 text-sm`}>
          {profile.rows.map((row, index) => (
            <div key={row.label} className={`py-4 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4 sm:text-left ${index > 0 ? `border-t ${tone.line}` : ''}`}>
              <dt className={`text-xs uppercase tracking-widest ${tone.muted} sm:pt-0.5`}>{row.label}</dt>
              <dd dir="auto" className={`mt-1 font-medium sm:mt-0 ${HOST_TEXT}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {profile.texts.map((item) => (
        <div key={item.label} className="mt-8">
          <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{item.label}</p>
          <p dir="auto" className={`mt-2 whitespace-pre-line text-sm leading-7 ${HOST_TEXT}`}>
            {item.text}
          </p>
        </div>
      ))}
    </>
  );
}

/**
 * B-019: a host's uploaded image, offered as its WebP variants when it has any (`srcSet` from `view.imageSrcSet`): a
 * `<picture>` set to `display: contents`, so the `<img>` keeps its place in every layout, with the original still its
 * `src` for a browser without WebP. Without variants this renders exactly the `<img>` it always was, attributes in the
 * caller's order, so pages whose images have no variants are unchanged byte for byte.
 */
export function VariantImage({
  srcSet,
  sizes,
  src,
  ...img
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'srcSet' | 'sizes' | 'src'> & { src: string; srcSet: string | undefined; sizes: string }) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  const image = <img src={src} {...img} />;
  if (!srcSet) return image;
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      {image}
    </picture>
  );
}

/** D-038: the frame each layout gives a person's photo; every frame has a fixed aspect, so nothing moves while it loads. */
export type PortraitFrame = 'round' | 'arch' | 'card' | 'leaf';
const PORTRAIT_FRAMES: Record<PortraitFrame, { outer: string; inner: string; width: number; height: number }> = {
  round: { outer: 'rounded-full', inner: 'aspect-square rounded-full', width: 320, height: 320 },
  arch: { outer: 'rounded-t-full rounded-b-2xl', inner: 'aspect-[3/4] rounded-t-full rounded-b-xl', width: 300, height: 400 },
  card: { outer: 'rounded-xl', inner: 'aspect-[4/5] rounded-lg', width: 320, height: 400 },
  leaf: { outer: 'rounded-sm', inner: 'aspect-[3/4] rounded-sm', width: 300, height: 400 },
};

/**
 * D-038: one person's photo, framed at full strength with nothing set on it (T1), on a thin mat in the card colour, with
 * the name and the parents line under it. Faces sit in the upper part of most portraits, hence the 30 % focal point.
 */
function PortraitFigure({
  portrait,
  frame,
  tone,
  align,
  srcSet,
}: {
  portrait: Portrait;
  frame: PortraitFrame;
  tone: GuestView['tone'];
  align: 'center' | 'start';
  srcSet: string | undefined;
}) {
  const shape = PORTRAIT_FRAMES[frame];
  return (
    <figure className={`flex w-40 flex-col sm:w-44 ${align === 'center' ? 'items-center text-center' : 'items-start text-left'}`}>
      <div className={`w-full overflow-hidden border ${tone.line} ${tone.card} p-1 ${shape.outer}`}>
        <VariantImage
          srcSet={srcSet}
          sizes={IMAGE_SIZES.portrait}
          src={portrait.src}
          alt={portrait.alt}
          width={shape.width}
          height={shape.height}
          loading="lazy"
          decoding="async"
          className={`block w-full object-cover object-[50%_30%] ${shape.inner}`}
        />
      </div>
      {(portrait.name || portrait.caption) && (
        <figcaption className="mt-4 flex flex-col gap-1">
          {portrait.name && (
            <span dir="auto" className={`font-serif text-xl leading-snug text-balance ${HOST_TEXT}`}>
              {portrait.name}
            </span>
          )}
          {portrait.caption && (
            <span dir="auto" className={`text-sm leading-6 ${tone.muted} ${HOST_TEXT}`}>
              {portrait.caption}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * B-023 (D-049): a side of the couple without a photo on the design families: the name and the parents line, set like a
 * photo's caption, so a profile reads the same with or without its photo.
 */
function ProfileText({ profile, tone, align }: { profile: Profile; tone: GuestView['tone']; align: 'center' | 'start' }) {
  return (
    <div className={`flex w-full max-w-xs flex-col gap-1 sm:w-60 ${align === 'center' ? 'items-center text-center' : 'items-start text-left'}`}>
      {profile.name && (
        <p dir="auto" className={`font-serif text-xl leading-snug text-balance ${HOST_TEXT}`}>
          {profile.name}
        </p>
      )}
      {profile.caption && (
        <p dir="auto" className={`text-sm leading-6 ${tone.muted} ${HOST_TEXT}`}>
          {profile.caption}
        </p>
      )}
    </div>
  );
}

/**
 * D-038: the couple (weddings) or the celebrant (birthdays) with their photos, `view.portraits`; null without a photo the
 * page may show. Layouts own the section frame and its heading and place it before the events. The design families pass
 * `section={view.profiles}` (B-023: the couple's profiles, a photo optional); the legacy layout keeps `view.portraits`.
 */
export function PortraitsBody({
  view,
  section,
  frame,
  align = 'center',
}: {
  view: GuestView;
  section?: Profiles;
  frame: PortraitFrame;
  align?: 'center' | 'start';
}) {
  const { tone } = view;
  const shown: Profiles = section === undefined ? view.portraits : section;
  if (!shown) return null;
  return (
    <div className={`mt-8 flex flex-col gap-10 sm:flex-row sm:gap-12 ${align === 'center' ? 'items-center sm:items-start sm:justify-center' : 'items-start'}`}>
      {shown.people.map(({ src, alt = '', ...profile }) =>
        src ? (
          <PortraitFigure key={profile.key} portrait={{ ...profile, src, alt }} frame={frame} tone={tone} align={align} srcSet={view.imageSrcSet(src)} />
        ) : (
          <ProfileText key={profile.key} profile={profile} tone={tone} align={align} />
        ),
      )}
    </div>
  );
}

/** The legacy layout's heading (Indonesian, D-041); the design families read `view.copy.sections.share`. */
export const SHARE_HEADING = GUEST_COPY.id.sections.share;

/**
 * B-029: the wedding hashtag (`view.share`): each tag as text a guest can select in one tap, then the filter link when
 * the host gave an http(s) URL. Layouts own the frame and the heading (`SHARE_HEADING`) and place it after streaming.
 */
export function ShareBody({ view, align }: { view: GuestView; align: 'center' | 'start' }) {
  const { share, tone } = view;
  if (!share) return null;
  return (
    <>
      {share.tags.length > 0 && (
        <>
          <p className={`mt-4 text-sm ${tone.muted}`}>{view.copy.share.prompt}</p>
          <ul className={`mt-4 flex flex-wrap gap-2 ${align === 'center' ? 'justify-center' : ''}`}>
            {share.tags.map((tag) => (
              <li key={tag} dir="auto" className={`select-all rounded-full border ${tone.line} ${tone.card} px-4 py-2 text-sm font-semibold ${HOST_TEXT}`}>
                {tag}
              </li>
            ))}
          </ul>
        </>
      )}
      {share.filterUrl && (
        <a
          href={share.filterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-6 inline-flex min-h-11 items-center rounded-full border border-current px-5 text-xs font-semibold ${tone.accent}`}
        >
          {view.copy.share.filter}
        </a>
      )}
    </>
  );
}

/** B-026: the element id of one account's number, which the copy button selects when the Clipboard API cannot write. */
export function giftNumberId(index: number) {
  return `hadiah-nomor-${index}`;
}

export const GIFT_WITHHELD_TEXT = GUEST_COPY.id.gift.withheld;

/**
 * B-026 (D-047): what the invitation link shows in place of gift details the host keeps to personal links. The details
 * themselves never reached this page (`configForAudience`); this only says where they are.
 */
export function GiftWithheldNotice({ view, align = 'center' }: { view: GuestView; align?: 'center' | 'start' }) {
  if (!view.gift?.withheld) return null;
  return <p className={`mt-6 text-sm leading-6 ${align === 'center' ? 'text-center' : ''} ${view.tone.muted}`}>{view.copy.gift.withheld}</p>;
}

/**
 * B-026 (D-047): the host's static QRIS image (`view.gift.qrisSrc`). Nothing is paid through Invitesion. The image is
 * framed alone with no text on it (T1) and keeps its square while it loads. Its plate is the palette's lightest surface
 * (`view.gift.qrisPlate`) because a scanner reads dark modules on a light field.
 */
export function GiftQris({ view, align = 'center' }: { view: GuestView; align?: 'center' | 'start' }) {
  const src = view.gift?.qrisSrc;
  if (!src) return null;
  return (
    <figure className={`mt-8 w-full max-w-60 ${align === 'center' ? 'mx-auto' : ''}`}>
      <div className={`rounded-2xl ${view.gift?.qrisPlate} p-3 shadow-sm`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={view.copy.gift.qrisAlt} loading="lazy" decoding="async" className="aspect-square w-full object-contain" />
      </div>
      <figcaption className={`mt-3 text-sm leading-6 ${align === 'center' ? 'text-center' : ''} ${view.tone.muted}`}>
        {view.copy.gift.qrisNote}
      </figcaption>
    </figure>
  );
}

/**
 * B-029: the organiser's logo and the event category above a corporate headline. The logo sits in a frame of fixed height
 * with intrinsic size attributes, so a logo of any aspect fits without shifting the cover while it loads. Layouts that
 * lay a photo behind the cover pass their chip classes for the label (`coverText`).
 * s20 (M1 / M2): the frame is 240 px wide (was 160), so a 4 : 1 wordmark renders 240 × 57 and an 8.5 : 1 one 240 × 28
 * instead of a 19 px strip; the 64 px height is kept, so phone covers do not move. A logo file that fails to load (a lost
 * upload) is covered by the `::after` box, which browsers draw on an image only when it is broken, in the frame's
 * background (`--inv-logo-bg`, the page colour unless a layout sets it), instead of the broken-image glyph and alt text.
 */
export function CorporateMark({
  view,
  align,
  labelClassName,
  className = '',
}: {
  view: GuestView;
  align: 'center' | 'start';
  labelClassName?: string;
  className?: string;
}) {
  const { corporateMark: mark, tone } = view;
  if (!mark) return null;
  const items = align === 'center' ? 'items-center' : 'items-start';
  return (
    <div className={`flex flex-col gap-3 ${items} ${className}`}>
      <CorporateLogo view={view} align={align} />
      {mark.category && (
        <p className={labelClassName ?? `text-xs font-semibold uppercase tracking-[0.2em] ${tone.muted}`}>{mark.category}</p>
      )}
    </div>
  );
}

/**
 * S22-K2 (s23r): the organiser's logo alone, in the same 240 × 64 frame (M1 / M2), so a family can place it in its own
 * composition (Kartu beside the date stamp) and set the category in the cover's eyebrow instead of a row of its own.
 */
export function CorporateLogo({ view, align, className = '' }: { view: GuestView; align: 'center' | 'start'; className?: string }) {
  const logo = view.corporateMark?.logo;
  if (!logo) return null;
  const items = align === 'center' ? 'items-center' : 'items-start';
  return (
    <span className={`flex h-16 w-60 max-w-full ${items} ${align === 'center' ? 'justify-center' : 'justify-start'}${className ? ` ${className}` : ''}`}>
      <VariantImage
        srcSet={view.imageSrcSet(logo.src)}
        sizes={IMAGE_SIZES.logo}
        src={logo.src}
        alt={logo.alt}
        width={240}
        height={64}
        decoding="async"
        className={`relative h-full w-full object-contain ${align === 'center' ? 'object-center' : 'object-left'} after:absolute after:inset-0 after:bg-[var(--inv-logo-bg,var(--inv-bg))] after:content-['']`}
      />
    </span>
  );
}

/**
 * S22-K2 (s23r): the cover's classification labels (a corporate event's category, then the cover headline such as
 * "Undangan Resmi") on one line that wraps label by label. Told apart by colour and a gap, not a separator glyph, so a
 * wrap never leaves a dot alone at the start or end of a line, centred or start-aligned.
 */
export function CoverEyebrow({
  category,
  headline,
  tone,
  align,
  className = '',
}: {
  category?: string;
  headline?: string;
  tone: GuestView['tone'];
  align: 'center' | 'start';
  className?: string;
}) {
  if (!category && !headline) return null;
  return (
    <p className={`flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-[0.2em] ${align === 'center' ? 'justify-center text-center' : 'justify-start'} ${className}`}>
      {category && <span className={tone.muted}>{category}</span>}
      {headline && <span className={tone.accent}>{headline}</span>}
    </p>
  );
}

type RsvpQuestion = GuestView['rsvpQuestions'][number];

/**
 * One host question in the RSVP form (B-027, D-034). Labels and options are host text, so they wrap and resolve their own
 * direction; the stored answer is the default, and a refused answer is named next to its field.
 */
function RsvpQuestionField({ question, invalid, tone, copy }: { question: RsvpQuestion; invalid: boolean; tone: GuestView['tone']; copy: GuestCopy }) {
  const id = `rsvp-${question.id}`;
  const hintId = question.condition ? `${id}-hint` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const chosen = Array.isArray(question.stored) ? question.stored : question.stored === undefined ? [] : [String(question.stored)];
  const field = `w-full rounded-lg border ${tone.line} ${tone.field} px-3 text-sm`;
  const title = (
    <>
      <span dir="auto" className={HOST_TEXT}>
        {question.label}
      </span>
      {question.required && (
        <>
          <span aria-hidden="true"> *</span>
          <span className="sr-only">{copy.rsvp.requiredSr}</span>
        </>
      )}
    </>
  );
  const notes = (
    <>
      {question.condition && (
        <span id={hintId} className={`block text-xs ${tone.muted} ${HOST_TEXT}`}>
          {question.condition}
        </span>
      )}
      {invalid && (
        <span id={errorId} className="block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {copy.rsvp.fixAnswer}
        </span>
      )}
    </>
  );

  // S18-Q2: label, then the condition and any refusal, then the control, so the guest reads when to answer before answering.
  if (question.type === 'radio' || question.type === 'checkbox' || question.type === 'multiselect') {
    return (
      <fieldset aria-describedby={describedBy} className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">{title}</legend>
        {notes}
        {(question.options ?? []).map((option, index) => (
          <label key={`${index}-${option}`} className={`flex min-h-11 items-center gap-3 rounded-lg border ${tone.line} ${tone.field} px-3 py-2 text-sm`}>
            <input
              type={question.type === 'radio' ? 'radio' : 'checkbox'}
              name={question.field}
              value={option}
              required={question.nativeRequired}
              defaultChecked={chosen.includes(option)}
              className="h-4 w-4 shrink-0"
            />
            <span dir="auto" className={HOST_TEXT}>
              {option}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  const shared = {
    id,
    name: question.field,
    required: question.nativeRequired,
    defaultValue: chosen[0] ?? '',
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {title}
      </label>
      {notes}
      {question.type === 'textarea' ? (
        <textarea {...shared} rows={3} maxLength={ANSWER_LIMITS.textarea} dir="auto" className={`${field} py-2.5 leading-6`} />
      ) : question.type === 'select' ? (
        <select {...shared} className={`h-11 ${field}`}>
          <option value="">{copy.rsvp.chooseOption}</option>
          {(question.options ?? []).map((option, index) => (
            <option key={`${index}-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : question.type === 'number' ? (
        <input {...shared} type="number" inputMode="numeric" min={0} max={ANSWER_LIMITS.numberMax} step={1} className={`h-11 ${field}`} />
      ) : (
        <input {...shared} type="text" maxLength={ANSWER_LIMITS.text} dir="auto" className={`h-11 ${field}`} />
      )}
    </div>
  );
}

type RsvpEvent = GuestView['rsvpEvents'][number];

/**
 * One event's answer in the RSVP form (B-027 slice 2c, D-036): a required choice and the people coming to this event. The
 * event title is host text, so it wraps and resolves its own direction; a refusal for this event is named inside it.
 */
function RsvpEventField({
  event,
  invalid,
  tone,
  maybe,
  allowance,
  defaultCount,
  copy,
}: {
  event: RsvpEvent;
  invalid: boolean;
  tone: GuestView['tone'];
  maybe: boolean;
  allowance: number;
  defaultCount: number;
  copy: GuestCopy;
}) {
  const errorId = invalid ? `rsvp-ev-${event.id}-error` : undefined;
  const words = copy.rsvp.eventChoices;
  const choices: Array<[RsvpStatus, string]> = [['CONFIRMED', words.CONFIRMED], ['DECLINED', words.DECLINED], ...(maybe ? [['MAYBE', words.MAYBE] as [RsvpStatus, string]] : [])];
  const storedCount = event.stored?.status === 'CONFIRMED' && event.stored.attending ? Math.min(event.stored.attending, allowance) : undefined;
  return (
    <fieldset aria-describedby={errorId} className={`flex flex-col gap-3 rounded-lg border ${tone.line} p-3`}>
      <legend className="px-1 text-sm font-semibold">
        <span dir="auto" className={HOST_TEXT}>
          {event.title}
        </span>
      </legend>
      {event.details && (
        <p dir="auto" className={`text-xs ${tone.muted} ${HOST_TEXT}`}>
          {event.details}
        </p>
      )}
      {invalid && (
        <p id={errorId} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {copy.rsvp.eventInvalid}
        </p>
      )}
      <div className={`grid gap-2 ${maybe ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {choices.map(([value, label]) => (
          <label key={value} className={`flex min-h-11 items-center gap-3 rounded-lg border ${tone.line} ${tone.field} px-3 py-2 text-sm`}>
            <input type="radio" name={event.statusField} value={value} required defaultChecked={event.stored?.status === value} className="h-4 w-4 shrink-0" />
            {label}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">{copy.rsvp.eventCount}</span>
        <input
          name={event.countField}
          type="number"
          min={1}
          max={allowance}
          defaultValue={storedCount ?? defaultCount}
          className={`h-11 w-full rounded-lg border ${tone.line} ${tone.field} px-3 text-sm`}
        />
      </label>
    </fieldset>
  );
}

/** RSVP: status notices, then the form for a recognised guest of an active invitation, otherwise an explanation. */
export function RsvpBlock({
  props,
  view,
  formClassName,
  fallbackClassName,
}: {
  props: GuestPageProps;
  view: GuestView;
  formClassName: string;
  fallbackClassName: string;
}) {
  const { invitation, guest, readOnly, status } = props;
  const { tone, canRsvp, rsvpMaybe, rsvpQuestions, rsvpEvents, rsvpDeadlineText, rsvpClosedByDeadline, copy } = view;
  const t = copy.rsvp;
  // The stored answer in the guest's language (`RSVP_ANSWER_TEXT` in Indonesian); an unknown stored value shows nothing.
  const lastAnswer = guest ? (t.answers as Partial<Record<string, string>>)[guest.rsvpStatus] : undefined;
  const refusedQuestion = status.rsvp === 'answers' ? rsvpQuestions.find((question) => question.id === status.rsvpq) : undefined;
  // D-036: with an answer per event there is one submit button; the action derives the overall answer from the events.
  const perEvent = rsvpEvents.length > 0;
  const refusedEvent = status.rsvp === 'events' ? rsvpEvents.find((event) => event.id === status.rsvpe) : undefined;
  // B-013: whole minutes until the limit's window ends, when the refusal said (`rsvpr`, seconds).
  const retrySeconds = status.rsvp === 'busy' && /^\d{1,5}$/.test(status.rsvpr ?? '') ? Number(status.rsvpr) : 0;
  const retryMinutes = retrySeconds > 0 ? Math.ceil(retrySeconds / 60) : 0;
  // "Required" means required for "hadir" (D-034): the other answers skip the browser's check, the action applies the same rule.
  const skipRequired = rsvpQuestions.length > 0 || undefined;
  const closedText = readOnly ? t.closed : rsvpClosedByDeadline ? t.deadlinePassed(rsvpDeadlineText) : t.personalOnly;
  return (
    <>
      {status.rsvp === 'saved' && <Notice kind="success">{t.saved}</Notice>}
      {status.rsvp === 'invalid' && <Notice kind="error">{t.invalid}</Notice>}
      {status.rsvp === 'closed' && <Notice kind="error">{t.refusedClosed}</Notice>}
      {status.rsvp === 'busy' && (
        <Notice kind="error">
          {t.busy}{' '}
          {retryMinutes ? copy.retryIn(retryMinutes) : copy.retryLater}
        </Notice>
      )}
      {status.rsvp === 'retry' && <Notice kind="error">{t.retry}</Notice>}
      {status.rsvp === 'answers' && (
        <Notice kind="error">
          {t.notSaved}{' '}
          {refusedQuestion ? (
            <>
              {t.checkAnswerTo[0]}
              <bdi>{refusedQuestion.label}</bdi>
              {t.checkAnswerTo[1]}
            </>
          ) : (
            t.checkAnswers
          )}
        </Notice>
      )}
      {status.rsvp === 'events' && (
        <Notice kind="error">
          {t.notSaved}{' '}
          {refusedEvent ? (
            <>
              {t.chooseAnswerFor[0]}
              <bdi>{refusedEvent.title}</bdi>
              {t.chooseAnswerFor[1]}
            </>
          ) : (
            t.chooseEveryEvent
          )}
        </Notice>
      )}

      {canRsvp && guest ? (
        <form action={submitRsvp} className={formClassName}>
          <input type="hidden" name="slug" value={invitation.slug} />
          <input type="hidden" name="guestSlug" value={guestLinkSegment(guest)} />
          {props.rsvpKey && <input type="hidden" name="rsvpKey" value={props.rsvpKey} />}

          {rsvpDeadlineText && (
            <p className={`text-sm ${tone.muted}`}>
              {t.replyBy[0]}
              <span className="font-semibold">{rsvpDeadlineText}</span>
              {t.replyBy[1]}
            </p>
          )}

          {/* Identity comes from the guest link, not user input, so the name is text rather than a locked control: it
              wraps instead of clipping (s15 review F7), stays in the contrast audit and is isolated for RTL names. */}
          <dl className="flex flex-col gap-1.5">
            <dt className="text-sm font-semibold">{t.name}</dt>
            <dd dir="auto" className={`rounded-lg border ${tone.line} ${tone.soft} px-3 py-2.5 text-sm leading-6 ${HOST_TEXT}`}>
              {guest.name}
            </dd>
            <dd className={`text-xs ${tone.muted}`}>{t.nameNote}</dd>
          </dl>

          {perEvent ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{t.perEvent}</p>
                <p className={`text-xs ${tone.muted}`}>
                  {t.perEventNote[0]}
                  {guest.guestCount || 1}
                  {t.perEventNote[1]}
                </p>
              </div>
              {rsvpEvents.map((event) => (
                <RsvpEventField
                  key={event.id}
                  event={event}
                  invalid={refusedEvent?.id === event.id}
                  tone={tone}
                  maybe={rsvpMaybe}
                  allowance={guest.guestCount || 1}
                  defaultCount={rsvpDefaultCount(guest)}
                  copy={copy}
                />
              ))}
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">{t.count}</span>
              <input
                name="guestCount"
                type="number"
                min={1}
                max={guest.guestCount || 1}
                defaultValue={rsvpDefaultCount(guest)}
                className={`h-11 w-full rounded-lg border ${tone.line} ${tone.field} px-3 text-sm`}
              />
              {/* "Maybe" stores no headcount and a decline stores 0, so the number only counts with "hadir" (s17 finding R2). */}
              <span className={`block text-xs ${tone.muted}`}>
                {t.countNote[0]}
                {guest.guestCount || 1}
                {t.countNote[1]}
              </span>
            </label>
          )}

          {rsvpQuestions.length > 0 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{t.hostQuestions}</p>
                {rsvpQuestions.some((question) => question.required) && (
                  <p className={`text-xs ${tone.muted}`}>{t.requiredNote}</p>
                )}
              </div>
              {rsvpQuestions.map((question) => (
                <RsvpQuestionField key={question.id} question={question} invalid={refusedQuestion?.id === question.id} tone={tone} copy={copy} />
              ))}
            </div>
          )}

          {perEvent ? (
            <button
              type="submit"
              name="status"
              value="EVENTS"
              className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              {t.submitEvents}
            </button>
          ) : (
          <div className={`grid gap-3 ${rsvpMaybe ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <button
              type="submit"
              name="status"
              value="CONFIRMED"
              className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              {t.yes}
            </button>
            <button
              type="submit"
              name="status"
              value="DECLINED"
              formNoValidate={skipRequired}
              className={`min-h-11 rounded-lg border ${tone.line} ${tone.field} px-4 text-sm font-semibold transition ${tone.hoverSoft}`}
            >
              {t.no}
            </button>
            {rsvpMaybe && (
              <button
                type="submit"
                name="status"
                value="MAYBE"
                formNoValidate={skipRequired}
                className={`min-h-11 rounded-lg border ${tone.line} ${tone.field} px-4 text-sm font-semibold transition ${tone.hoverSoft}`}
              >
                {t.maybe}
              </button>
            )}
          </div>
          )}

          {lastAnswer && (
            <p className={`text-center text-xs ${tone.muted}`}>
              {t.lastAnswer[0]}
              {lastAnswer}
              {t.lastAnswer[1]}
            </p>
          )}
        </form>
      ) : (
        <p className={fallbackClassName}>{closedText}</p>
      )}
      {view.guestPassHref && (
        <div className="mt-6 flex justify-center">
          <a
            href={view.guestPassHref}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold transition ${tone.line} ${tone.field} ${tone.hoverSoft}`}
          >
            {t.pass}
          </a>
        </div>
      )}
    </>
  );
}

/** Guestbook: status notices, the form for a recognised guest, then the capped list of wishes. */
export function GuestbookBlock({
  props,
  view,
  formClassName,
  messageClassName,
  listClassName = 'mt-8 space-y-3',
}: {
  props: GuestPageProps;
  view: GuestView;
  formClassName: string;
  messageClassName: string;
  listClassName?: string;
}) {
  const { invitation, guest, messages, status, totalMessages = messages.length, hiddenMessageCount = 0 } = props;
  const { tone, canRespond, wishesListed, wishesModerated, copy } = view;
  const t = copy.wishes;
  // B-013: whole minutes until the limit's window ends, when the refusal said (`wishr`, seconds).
  const retrySeconds = status.wish === 'busy' && /^\d{1,5}$/.test(status.wishr ?? '') ? Number(status.wishr) : 0;
  const retryMinutes = retrySeconds > 0 ? Math.ceil(retrySeconds / 60) : 0;
  // R-04 (D-044): on a hosts-only guestbook nothing is listed, so "saved" and "pending" both mean delivered to the hosts.
  return (
    <>
      {status.wish === 'saved' && <Notice kind="success">{wishesListed ? t.saved : t.delivered}</Notice>}
      {status.wish === 'pending' && <Notice kind="success">{wishesListed ? t.pending : t.delivered}</Notice>}
      {status.wish === 'invalid' && <Notice kind="error">{t.invalid}</Notice>}
      {status.wish === 'closed' && <Notice kind="error">{t.refusedClosed}</Notice>}
      {status.wish === 'busy' && (
        <Notice kind="error">
          {t.busy}{' '}
          {retryMinutes ? copy.retryIn(retryMinutes) : copy.retryLater}
        </Notice>
      )}
      {status.wish === 'retry' && <Notice kind="error">{t.retry}</Notice>}

      {canRespond && guest && (
        <form action={submitGuestMessage} className={formClassName}>
          <input type="hidden" name="slug" value={invitation.slug} />
          <input type="hidden" name="guestSlug" value={guestLinkSegment(guest)} />
          {props.wishKey && <input type="hidden" name="wishKey" value={props.wishKey} />}
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">
              {t.from}
              {guest.name}
            </span>
            <textarea
              name="message"
              rows={4}
              required
              maxLength={1000}
              aria-describedby={!wishesListed || wishesModerated ? `wish-note-${invitation.id}` : undefined}
              className={`w-full rounded-lg border ${tone.line} ${tone.field} p-3 text-sm ${tone.placeholder}`}
              placeholder={t.placeholder}
            />
          </label>
          {(!wishesListed || wishesModerated) && (
            <p id={`wish-note-${invitation.id}`} className={`text-sm ${tone.muted}`}>
              {!wishesListed ? t.hostOnly : t.moderated}
            </p>
          )}
          <button type="submit" className={`min-h-11 w-full rounded-lg border border-current px-4 text-sm font-semibold ${tone.accent}`}>
            {t.submit}
          </button>
        </form>
      )}

      {wishesListed && (
        <div className={listClassName}>
          {hiddenMessageCount > 0 && (
            // The list is capped for payload reasons. Saying so is better than
            // letting a guest assume the earlier wishes were lost.
            <p className={`text-center text-sm ${tone.muted}`}>
              {t.showing[0]}
              {messages.length}
              {t.showing[1]}
              {totalMessages}
              {t.showing[2]}
            </p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={messageClassName}>
              <p className="font-semibold">{message.name}</p>
              <p className="mt-2 text-sm leading-7">{message.message}</p>
              {message.hostReply && (
                <div className={`mt-4 border-t ${tone.line} pt-3`}>
                  <p className="text-xs font-semibold uppercase tracking-wider">{t.hostReply}</p>
                  <p className="mt-1 text-sm leading-7">{message.hostReply}</p>
                </div>
              )}
            </article>
          ))}
          {!messages.length && <p className={`text-center text-sm ${tone.muted}`}>{t.empty}</p>}
        </div>
      )}
    </>
  );
}
