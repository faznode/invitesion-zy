import { InvitationIcon } from '@/components/invitation/icons';
import { Countdown } from '@/components/invitation/countdown';
import { CoverAudio, type CoverGateContent } from '@/components/invitation/cover-audio';
import { GapuraLayout } from '@/components/invitation/families/gapura';
import { KartuLayout } from '@/components/invitation/families/kartu';
import { LontarLayout } from '@/components/invitation/families/lontar';
import { RiangLayout } from '@/components/invitation/families/riang';
import {
  CalendarLinks,
  CeremonyProfileBody,
  PortraitsBody,
  EventFacts,
  CorporateMark,
  GiftQris,
  GiftWithheldNotice,
  GuestbookBlock,
  MapLink,
  PROGRAMME_HEADINGS,
  ProgrammeBody,
  programmeSections,
  ReadOnlyNotice,
  RsvpBlock,
  SHARE_HEADING,
  ShareBody,
  SwitchedOffNotices,
} from '@/components/invitation/guest-blocks';
import { buildGuestView, type GuestPageProps, type GuestView } from '@/components/invitation/guest-view';
import { familyOf, type FamilyId } from '@/lib/invitation/families';
import { guestPageLanguage } from '@/lib/invitation/guest-copy';

/**
 * Deterministic config -> HTML renderer.
 *
 * Every section is driven by the stored config, never by free-form generated
 * markup (handoff 1.3). The guest name is injected from the guests table, so a
 * single config serves every guest of an invitation. An invitation that opted
 * into a design family (B-030, `theme.familyId`) gets that family's composition
 * of the same data; every other invitation keeps the legacy layout below.
 */

type LayoutProps = { props: GuestPageProps; view: GuestView };

const FAMILY_LAYOUTS: Record<FamilyId, (input: LayoutProps) => React.ReactNode> = {
  gapura: GapuraLayout,
  kartu: KartuLayout,
  riang: RiangLayout,
  lontar: LontarLayout,
};

export function PublicInvitationRenderer(props: GuestPageProps) {
  const family = familyOf(props.config.theme?.familyId);
  // G-018 (I-31): a design family speaks the invitation's language; the legacy layout is frozen (D-041) and stays Indonesian.
  const language = guestPageLanguage(props.config);
  // B-019: image variants serve the design families; the legacy layout is frozen (D-041) and keeps its originals.
  const view = buildGuestView(family ? props : { ...props, imageVariants: undefined }, language);
  const Layout = family ? FAMILY_LAYOUTS[family.id] : LegacyLayout;
  const page = <Layout props={props} view={view} />;
  // B-009 (D-045): only an invitation with playable music gets the island; every other page renders exactly as before.
  if (!view.music) return page;
  return (
    <CoverAudio
      music={view.music}
      gate={coverGateOf(props, view)}
      style={view.tone.style}
      labels={family ? view.copy.cover : undefined}
      lang={view.contentLang}
    >
      {page}
    </CoverAudio>
  );
}

/**
 * B-009: the cover gate exists to give the music its tap, so it is shown only when the music plays on opening. A guest
 * coming back from a form post (`?rsvp=`, `?wish=`) is already inside: the gate would cover the notice they came back for.
 * Typographic on purpose: it carries no photo (T1 keeps photos framed in the layouts) and paints with the first byte.
 */
function coverGateOf({ invitation, config, guest, status }: GuestPageProps, view: GuestView): CoverGateContent | null {
  if (!view.music?.playOnOpen || status.rsvp || status.wish) return null;
  const names = (view.names ?? []).filter((name): name is string => Boolean(name));
  const { copy } = view;
  return {
    // B-032: a memorial never falls back to its event type's "Undangan Tasyakuran". G-018: the view's language.
    kicker: config.theme?.cover?.headline?.trim() || (view.occasion === 'memorial' ? copy.memorial.invitation : copy.kickers[invitation.eventType]) || copy.invitation,
    names: names.length ? names : [config.settings?.title || copy.invitation],
    dateText: (view.primaryEvent?.startAt && view.formatDate(view.primaryEvent.startAt)) || undefined,
    guestName: guest?.name ?? undefined,
  };
}

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-xl px-6 py-12 sm:py-16 ${className}`}>{children}</section>;
}

function Heading({ children, accent }: { children: React.ReactNode; accent: string }) {
  return <h2 className={`text-center font-serif text-2xl ${accent}`}>{children}</h2>;
}

function LegacyLayout({ props, view }: LayoutProps) {
  const { invitation, config, guest, readOnly } = props;
  const { tone, formatDate, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, gallery, coverImageSrc, coverText, organiser, rsvpShown, guestbookShown } =
    view;

  return (
    <main className={`min-h-screen ${tone.bg} ${tone.ink}`} style={tone.style}>
      {/* Cover */}
      <header className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        {coverImageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
        )}
        <div className="relative">
          <CorporateMark view={view} align="center" className="mb-6" labelClassName={coverText(`text-xs font-semibold uppercase tracking-[0.2em] ${tone.muted}`)} />
          {config.theme?.cover?.headline && <p className={coverText(`text-xs uppercase tracking-[0.3em] ${tone.accent}`)}>{config.theme.cover.headline}</p>}
          {names?.length ? (
            <h1 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">
              {names.filter(Boolean).map((name, index) => (
                <span key={name ?? index} className="block">
                  {index > 0 && <span className={`my-2 block text-2xl ${tone.accent}`}>&</span>}
                  {name}
                </span>
              ))}
            </h1>
          ) : (
            <h1 className="mt-6 font-serif text-4xl sm:text-5xl">{config.settings?.title || 'Undangan'}</h1>
          )}
          {organiser && (
            <p dir="auto" className={coverText(`mt-4 text-sm ${tone.muted} [overflow-wrap:anywhere]`)}>
              {organiser}
            </p>
          )}
          {primaryEvent?.startAt && <p className={coverText(`mt-6 text-sm tracking-wide ${tone.accent}`)}>{formatDate(primaryEvent.startAt)}</p>}

          {guest && (
            <div className={`mt-10 inline-block rounded-2xl ${tone.soft} px-6 py-4`}>
              <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>Kepada Yth.</p>
              <p className="mt-1 font-serif text-xl">{guest.name}</p>
            </div>
          )}
        </div>
      </header>

      {readOnly && <ReadOnlyNotice />}
      <SwitchedOffNotices props={props} view={view} className="mx-auto max-w-xl px-6" />

      {config.greetings?.enabled !== false && (config.greetings?.prayer || config.settings?.openingCopy) && (
        <Section className="text-center">
          {config.greetings?.prayer && <p className={`font-serif text-lg ${tone.accent}`}>{config.greetings.prayer}</p>}
          {config.settings?.openingCopy && <p className="mt-4 text-sm leading-7">{config.settings.openingCopy}</p>}
        </Section>
      )}

      {config.quote?.enabled && config.quote.text && (
        <Section className="text-center">
          <InvitationIcon name="quote" className={`mx-auto h-6 w-6 ${tone.accent}`} />
          <blockquote className="mt-4 font-serif text-lg leading-8">{config.quote.text}</blockquote>
          {config.quote.author && <cite className={`mt-3 block text-xs uppercase tracking-widest ${tone.muted}`}>{config.quote.author}</cite>}
        </Section>
      )}

      {view.portraits && (
        <Section>
          <Heading accent={tone.accent}>{view.portraits.heading}</Heading>
          <PortraitsBody view={view} frame="round" />
        </Section>
      )}

      {events.length > 0 && (
        <Section>
          <Heading accent={tone.accent}>Rangkaian Acara</Heading>
          {showCountdown && primaryEvent && (
            <Countdown target={primaryStartMs} initialNow={renderedAt} eventTitle={primaryEvent.title} boxClassName={tone.soft} labelClassName={tone.muted} />
          )}
          <div className="mt-8 space-y-4">
            {events.map((event, index) => (
              <article key={`${event.title}-${index}`} className={`rounded-2xl ${tone.card} p-6 shadow-sm`}>
                <h3 className="font-serif text-xl">{event.title}</h3>
                <EventFacts event={event} view={view} />
                {event.note && <p className={`mt-4 text-sm ${tone.muted}`}>{event.note}</p>}
                <MapLink event={event} view={view} />
              </article>
            ))}
          </div>
          <CalendarLinks view={view} slug={invitation.slug} />
        </Section>
      )}

      {view.ceremonyProfile && (
        <Section>
          <Heading accent={tone.accent}>{view.ceremonyProfile.heading}</Heading>
          <CeremonyProfileBody view={view} cardClassName={`rounded-2xl ${tone.card} shadow-sm`} />
        </Section>
      )}

      {programmeSections(view).map((id) => (
        <Section key={id}>
          <Heading accent={tone.accent}>{PROGRAMME_HEADINGS[id]}</Heading>
          <ProgrammeBody id={id} view={view} cardClassName={`rounded-2xl ${tone.card} shadow-sm`} />
        </Section>
      ))}

      {config.story?.enabled && config.story.items?.length ? (
        <Section>
          <Heading accent={tone.accent}>Cerita Kami</Heading>
          <ol className="mt-8 space-y-6">
            {config.story.items.map((item, index) => (
              <li key={index} className={`rounded-2xl ${tone.card} p-6 shadow-sm`}>
                {item.date && <p className={`text-xs uppercase tracking-widest ${tone.accent}`}>{item.date}</p>}
                {item.title && <h3 className="mt-2 font-serif text-lg">{item.title}</h3>}
                {item.body && <p className="mt-2 text-sm leading-7">{item.body}</p>}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {gallery.length > 0 && (
        <Section>
          <Heading accent={tone.accent}>Galeri</Heading>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {gallery.map((asset) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={asset.id} src={asset.url} alt="" className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
            ))}
          </div>
        </Section>
      )}

      {config.streaming?.enabled && config.streaming.url && (
        <Section className="text-center">
          <InvitationIcon name="radio" className={`mx-auto h-6 w-6 ${tone.accent}`} />
          <Heading accent={tone.accent}>Siaran Langsung</Heading>
          <a
            href={config.streaming.url}
            target="_blank"
            rel="noreferrer"
            className={`mt-6 inline-flex min-h-11 items-center rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
          >
            Tonton siaran
          </a>
        </Section>
      )}

      {view.share && (
        <Section className="text-center">
          <Heading accent={tone.accent}>{SHARE_HEADING}</Heading>
          <ShareBody view={view} align="center" />
        </Section>
      )}

      {/* B-026 (D-041, D-047): legacy keeps its account markup byte-identical and gains only what a host chose: the
          QRIS image they uploaded, and the notice when their details stay on personal links. No copy control here. */}
      {view.gift ? (
        <Section>
          <InvitationIcon name="gift" className={`mx-auto h-6 w-6 ${tone.accent}`} />
          <Heading accent={tone.accent}>Hadiah</Heading>
          {view.gift.accounts.length > 0 && (
            <div className="mt-8 space-y-3">
              {view.gift.accounts.map((account, index) => (
                <article key={index} className={`rounded-2xl ${tone.card} p-5 shadow-sm`}>
                  <p className={`text-xs uppercase tracking-widest ${tone.muted}`}>{account.label}</p>
                  {account.number && <p className="mt-2 font-mono text-base">{account.number}</p>}
                  {account.holder && <p className={`mt-1 text-sm ${tone.muted}`}>a.n. {account.holder}</p>}
                  {account.note && <p className={`mt-2 text-sm ${tone.muted}`}>{account.note}</p>}
                </article>
              ))}
            </div>
          )}
          <GiftQris view={view} />
          <GiftWithheldNotice view={view} />
        </Section>
      ) : null}

      {/* RSVP — only a recognised guest can respond, and only while the invitation is active. */}
      {rsvpShown && (
        <Section>
          <Heading accent={tone.accent}>Konfirmasi Kehadiran</Heading>
          <RsvpBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-5 rounded-2xl ${tone.card} p-6 shadow-sm`}
            fallbackClassName={`mt-8 rounded-2xl border border-dashed ${tone.line} ${tone.card} p-6 text-center text-sm ${tone.muted}`}
          />
        </Section>
      )}

      {guestbookShown && (
        <Section>
          <Heading accent={tone.accent}>{config.guestbook?.heading || 'Ucapan & Doa'}</Heading>
          {config.guestbook?.prompt && <p className={`mt-3 text-center text-sm ${tone.muted}`}>{config.guestbook.prompt}</p>}
          <GuestbookBlock
            props={props}
            view={view}
            formClassName={`mt-8 space-y-4 rounded-2xl ${tone.card} p-6 shadow-sm`}
            messageClassName={`rounded-2xl ${tone.card} p-5 shadow-sm`}
          />
        </Section>
      )}

      <footer className={`px-6 pb-12 pt-4 text-center text-xs ${tone.muted}`}>
        <p>Undangan digital oleh Invitesion</p>
      </footer>
    </main>
  );
}
