import { isFlagOn } from '@/lib/flags';
import { safeAudioSrc } from '@/lib/invitation/audio-url';
import { calendarEventsFromConfig } from '@/lib/invitation/calendar';
import { ceremonyProfileOf } from '@/lib/invitation/ceremony-profile';
import { corporateMarkOf } from '@/lib/invitation/corporate-mark';
import type { DetailConfig } from '@/lib/invitation/detail-config';
import { guestAudience, visibleEvents, type EventAudience } from '@/lib/invitation/event-eligibility';
import { eventDateParts, formatEventDate, formatEventTime } from '@/lib/invitation/event-time';
import { ownQrisUpload } from '@/lib/invitation/gift-privacy';
import { GUEST_DATE_LOCALE, guestCopy, type GuestLanguage } from '@/lib/invitation/guest-copy';
import { invitationDisplayName, invitationHeadline } from '@/lib/invitation/headline';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { safeImageSrc } from '@/lib/invitation/image-url';
import { inviteShareOf } from '@/lib/invitation/invite-share';
import type { Occasion } from '@/lib/invitation/occasion';
import { provenanceLine, verifiedBlockFor } from '@/lib/invitation/religious-text';
import { palette } from '@/lib/invitation/palettes';
import { birthdayPortrait, ceremonyPortrait, childPhotoSlotOf, childPhotoSrcFor, coupleProfiles, couplePortraits, type Profiles } from '@/lib/invitation/portraits';
import { guestChildPhotoPath, guestGiftQrisPath, invitationGiftQrisPath } from '@/lib/invitation/public-path';
import { programmeOf } from '@/lib/invitation/programme';
import { readingModeOf } from '@/lib/invitation/reading-mode';
import { answerField, askableQuestions, conditionText, isMultiChoice, readStoredAnswers, rsvpQuestionsOf } from '@/lib/invitation/rsvp-questions';
import { eventCountField, eventStatusField, perEventRsvpEvents, readEventAnswers } from '@/lib/invitation/rsvp-events';
import { rsvpDeadlinePassed } from '@/lib/invitation/rsvp-rules';
import { shareOf } from '@/lib/invitation/share';
import { variantSrcSet, type ImageVariants } from '@/lib/media/variants';
import type { PostEventMemoryView } from '@/lib/invitation/post-event';
import { galleryLayout, galleryVideo } from '@/lib/invitation/gallery';
import type { Guest, Invitation, MediaAsset } from '@/lib/db/schema';

/** A listed wish; `hostReply` is the host's answer (R-04), rendered under it. */
export type GuestMessage = { id: number; name: string; message: string; createdAt: Date; hostReply?: string | null };

export type GuestPageProps = {
  invitation: Invitation;
  config: DetailConfig;
  guest: Guest | null;
  media: MediaAsset[];
  /** I-21 (D-070): the post-event memory built on the server for this audience (`loadMemoryView`); absent or null: none. */
  memory?: PostEventMemoryView | null;
  /** The most recent page of guestbook messages, oldest first. */
  messages: GuestMessage[];
  /** Total visible messages, so a capped list can say what it is hiding. */
  totalMessages?: number;
  hiddenMessageCount?: number;
  readOnly: boolean;
  /**
   * Outcome of the last submit (`?rsvp=`, `?wish=`); `rsvpq` names the question an `rsvp=answers` refusal is about and
   * `rsvpe` the event an `rsvp=events` refusal is about (D-036).
   */
  /**
   * Notices after a form post: `rsvpr` / `wishr` = seconds until a limit's window ends, `rsvpk` / `wishk` = the key a
   * retry must reuse.
   */
  status: { rsvp?: string; wish?: string; rsvpq?: string; rsvpe?: string; rsvpr?: string; rsvpk?: string; wishr?: string; wishk?: string };
  /** The host's own preview (`/preview/[id]`): every event is shown, invite-only ones included (D-037). */
  preview?: boolean;
  /**
   * R-03: a key minted for this rendering of the RSVP form and sent back with it, so a double submit writes once
   * (`Idempotency-Key` on the Rust writer). Only the personal guest page mints one; without it the form has no key.
   */
  rsvpKey?: string;
  /** R-04: the same for the wish form, so a double submit stores one wish. */
  wishKey?: string;
  /**
   * B-026 (D-047): the loader removed gift details this page's audience may not see (`configForAudience`), so the gift
   * block says they are on the guest's personal link instead.
   */
  giftWithheld?: boolean;
  /** B-019: WebP variants of the invitation's uploads (the renderer passes none to the legacy layout, D-041). */
  imageVariants?: ImageVariants;
  /** I-28: the request carried `Save-Data: on`, so images offer only their lite variants. */
  saveData?: boolean;
  /**
   * B-024 (D-056): the guest's pass page (`/i/<slug>/<guest>/pass`), set by the personal page only when guest passes are
   * on, the invitation opted in and a signing secret exists; layouts show it through `RsvpBlock`, never decide it.
   */
  guestPassHref?: string | null;
  /**
   * G-036 (I-05): this guest's device asked for large text (the cover switch's cookie, read by the guest routes). Only a
   * design family with guest reading on acts on it (`readingModeOf`); the legacy layout ignores it (D-041).
   */
  readingLarge?: boolean;
};

/**
 * What every layout derives from the stored config, computed once so the legacy layout and each design family (B-030)
 * show the same data: dates in the event's own zone, the countdown rule, the calendar entry and who may respond.
 *
 * G-018 (I-31): `language` is the page's language, chosen by the caller: the renderer passes the invitation's for a design
 * family and Indonesian for the legacy layout (frozen, D-041). It decides the product's own words (`copy`) and how dates
 * read; the host's words, time zones and approved quotation text are unchanged.
 */
export function buildGuestView(
  { invitation, config, guest, media, readOnly, preview = false, giftWithheld = false, imageVariants, saveData = false, guestPassHref = null, readingLarge = false }: GuestPageProps,
  language: GuestLanguage = 'id',
) {
  const tone = palette(config.theme?.paletteId);
  const copy = guestCopy(language);
  const dateLocale = GUEST_DATE_LOCALE[language];
  // B-032 (G-060): a memorial keeps the product's own words sober (`occasion.ts`); absent = the event type's own.
  const occasion: Occasion | undefined = config.settings?.occasion === 'memorial' ? 'memorial' : undefined;
  // Event-local wall clock with WIB / WITA / WIT from the saved offset, whatever zone the server runs in (B-004).
  const eventZone = config.eventOperations?.timezone;
  const formatDate = (value?: string) => formatEventDate(value, eventZone, dateLocale);
  const formatTime = (value?: string) => formatEventTime(value, eventZone, dateLocale);
  const dateParts = (value?: string) => eventDateParts(value, eventZone, dateLocale);
  const names = invitationHeadline(invitation.eventType, config);
  // D-037: the events this page may show. A guest sees open events and the invite-only ones they are invited to; a page
  // without a guest link sees open events only; the host's preview sees all. Countdown, calendar entry and the per-event
  // form below all start from this list, so an event a guest may not see never reaches their page in any form.
  const inviteOnlyOn = isFlagOn('INVITE_ONLY_EVENTS');
  const audience: EventAudience = preview ? { kind: 'owner' } : guestAudience(guest);
  const events = visibleEvents(config.events, audience, inviteOnlyOn);
  const primaryEvent = events[0];
  // B-008: countdown and save-the-date only for a future primary event; the calendar file only exists once published.
  const renderedAt = Date.now();
  const primaryStartMs = primaryEvent?.startAt ? Date.parse(primaryEvent.startAt) : Number.NaN;
  const primaryIsAhead = isFlagOn('GUEST_CALENDAR') && Number.isFinite(primaryStartMs) && primaryStartMs > renderedAt;
  // B-032: the host can switch the countdown off (memorial presets start with it off); the calendar links stay.
  const showCountdown = primaryIsAhead && config.settings?.countdown !== false;
  const primaryCalendarEvent =
    primaryIsAhead && primaryEvent && invitation.status === 'PUBLISHED'
      ? calendarEventsFromConfig({ slug: invitation.slug, displayName: invitationDisplayName(invitation.eventType, config, copy.invitation), events: [primaryEvent] })[0]
      : undefined;
  const galleryOn = config.gallery?.enabled !== false;
  const gallery = galleryOn ? media.filter((asset) => asset.type === 'photo') : [];
  // B-025: the host's gallery layout (the families' own grid when unset) and video facades (no provider request before a tap).
  const galleryLayoutChoice = galleryLayout(config.gallery?.layout);
  const galleryVideos = galleryOn
    ? media.filter((asset) => asset.type === 'video').flatMap((asset) => {
        const video = galleryVideo(asset);
        return video ? [video] : [];
      })
    : [];
  const canRespond = Boolean(guest) && !readOnly;
  // B-027: the host's RSVP deadline closes the RSVP form only (the guestbook stays open); the action applies the same
  // rule to every POST, so a page rendered before the deadline cannot write after it.
  const rsvpDeadline = config.rsvp?.deadline;
  const rsvpClosedByDeadline = rsvpDeadlinePassed(rsvpDeadline, renderedAt);
  // Shown only when the rule reads the same value, so the page never announces a deadline the action would not enforce.
  const deadlineParts = rsvpDeadline && Number.isFinite(Date.parse(rsvpDeadline)) ? [formatDate(rsvpDeadline), formatTime(rsvpDeadline)] : [];
  const rsvpDeadlineText = deadlineParts.length === 2 && deadlineParts.every(Boolean) ? deadlineParts.join(', ') : undefined;
  const canRsvp = canRespond && !rsvpClosedByDeadline;
  // B-027: the "maybe" choice follows the same flag the action checks, so the form never offers an answer it would refuse.
  const rsvpMaybe = isFlagOn('RSVP_MAYBE');
  // B-027 (D-034): the host's questions in the RSVP form, by the flag and rules the action applies. Each carries the
  // guest's stored answer, so a returning guest sees what they sent and can change it.
  // S18-Q3: a question that can never apply (a cycle, or a condition no option can meet) is not shown at all.
  const questionList = isFlagOn('RSVP_QUESTIONS')
    ? askableQuestions(rsvpQuestionsOf({ enabled: config.registrationForm?.enabled, customQuestions: config.registrationForm?.customQuestions }))
    : [];
  // B-027 slice 2c (D-036): one answer per event, by the flag and switch the action reads, keyed by the durable event id.
  // D-037: over the listed events this guest is invited to; with fewer than two the single answer stands for them.
  const askedEvents = visibleEvents(perEventRsvpEvents({ perEvent: config.rsvp?.perEvent, events: config.events }, isFlagOn('RSVP_PER_EVENT')), audience, inviteOnlyOn);
  const rsvpEventList = askedEvents.length >= 2 ? askedEvents : [];
  const storedEventAnswers = readEventAnswers(guest?.rsvpEventAnswers);
  const rsvpEvents = rsvpEventList.map((event) => ({
    id: event.id,
    title: event.title,
    details: [formatDate(event.startAt), formatTime(event.startAt), event.venueName].filter(Boolean).join(' · '),
    statusField: eventStatusField(event.id),
    countField: eventCountField(event.id),
    stored: storedEventAnswers[event.id],
  }));
  const questionsById = new Map(questionList.map((question) => [question.id, question]));
  const storedAnswers = readStoredAnswers(guest?.rsvpAnswers);
  const rsvpQuestions = questionList.map((question) => ({
    ...question,
    field: answerField(question.id),
    // HTML can require only an unconditional question with one answer; the action checks the rest ("hadir" only). With
    // per-event answers the overall status is known only to the action, so the browser requires none.
    nativeRequired: question.required && !question.conditional && !isMultiChoice(question) && rsvpEvents.length === 0,
    condition: conditionText(question, questionsById, copy.rsvp.condition),
    stored: storedAnswers[question.id],
  }));
  // The host's section switches, read once: layouts render a section only while it is shown, and a refusal for a section
  // switched off after the guest's page was rendered is announced by `SwitchedOffNotices` instead.
  const rsvpShown = config.rsvp?.enabled !== false;
  const guestbookShown = config.guestbook?.enabled !== false;
  // R-04 (D-044): a hosts-only guestbook shows the form and no list; a moderated one tells the guest that a wish waits for
  // the host. The writers and the loader apply the same switches (`guestbookRules`).
  const wishesListed = config.guestbook?.visibility !== 'host';
  const wishesModerated = config.guestbook?.moderation === true;
  // A stored cover can be any absolute URL the schema has ever accepted; the page requests only an upload path or an
  // http(s) URL, the same rule as the organiser's logo (E-022). Every layout reads this, never the stored value.
  const coverImageSrc = safeImageSrc(config.theme?.cover?.imageUrl);
  // Small text drawn over a cover photo sits on an opaque page-colour chip: accent tokens clear AA on bg itself, but a
  // dark region of a 20–25 % photo can pull them to 2.8:1 (B-016, tests/palette-contrast.test.ts). No photo, no change.
  // Block-level so the chip never shares a line with the inline guest card that follows it (s15 review F6).
  const coverText = (classes: string) => (coverImageSrc ? `${classes} mx-auto block w-fit rounded-2xl ${tone.bg} px-3 py-1` : classes);
  // B-029: who invites. The corporate headline is the event name, so the organisation is shown beside it when both are
  // filled; without an event name the organisation already is the headline and is not repeated.
  const eventName = invitation.eventType === 'corporate' ? config.corporateProfile?.eventName?.trim() : undefined;
  const organisation = config.corporateProfile?.organizationName?.trim();
  const organiser = eventName && organisation && organisation !== eventName ? organisation : undefined;
  // B-029: the programme a corporate host typed, render-when-filled. Corporate invitations only, like the headline, so a
  // profile left from another event type never reaches the page; layouts read `programme`, never the stored profile.
  const programme =
    invitation.eventType === 'corporate'
      ? programmeOf({
          description: config.corporateProfile?.description,
          agenda: config.corporateProfile?.agenda,
          speakers: config.corporateProfile?.speakers,
          dressCode: config.corporateProfile?.dressCode,
          contactName: config.corporateProfile?.contactName,
          contactPhone: config.corporateProfile?.contactPhone,
          contactEmail: config.corporateProfile?.contactEmail,
        })
      : null;
  // B-029: the organiser's logo and the event category, corporate invitations only and render-when-filled (S16-L6).
  const corporateMark =
    invitation.eventType === 'corporate'
      ? corporateMarkOf(
          {
            logoUrl: config.corporateProfile?.logoUrl,
            eventCategory: config.corporateProfile?.eventCategory,
            organisation,
          },
          copy.corporate,
        )
      : null;

  // D-038: person photos. Children's photos (aqiqah, khitanan, a birthday celebrant) need the host's switch and a personal
  // link or the host's preview; the couple's and a tasyakuran honouree's show once uploaded. Field by field, as below.
  const portraitAudience = { personalLink: Boolean(guest), preview };
  // E-047 / D-040: a child's uploaded photo reaches a personal-link page only as `/i/<slug>/<guest>/photo/<slot>`, which
  // re-checks the link and the host's switch per request and is `private, no-store`; the storage path never appears in
  // the page's markup or RSC payload. The host's own preview keeps the stored path (`/media/protected/…` is served to the
  // owner's session only). An upload of another invitation, or an avatar, is dropped (`childPhotoSrcFor`).
  const childSlot = childPhotoSlotOf(invitation.eventType);
  const childSrc = (src: string) =>
    childPhotoSrcFor(src, {
      invitationId: invitation.id,
      preview,
      guestPhotoPath: guest && !preview && childSlot ? guestChildPhotoPath(invitation.slug, guestLinkSegment(guest), childSlot) : undefined,
    });
  const storedPortraits =
    invitation.eventType === 'wedding'
      ? couplePortraits({
          bride: {
            fullName: config.couple?.bride?.fullName,
            nickName: config.couple?.bride?.nickName,
            parents: config.couple?.bride?.parents,
            order: config.couple?.bride?.order,
            photoUrl: config.couple?.bride?.photoUrl,
          },
          groom: {
            fullName: config.couple?.groom?.fullName,
            nickName: config.couple?.groom?.nickName,
            parents: config.couple?.groom?.parents,
            order: config.couple?.groom?.order,
            photoUrl: config.couple?.groom?.photoUrl,
          },
          displayOrder: config.couple?.displayOrder,
        }, copy.people)
      : invitation.eventType === 'birthday'
        ? birthdayPortrait(
            {
              fullName: config.birthdayPerson?.fullName,
              nickName: config.birthdayPerson?.nickName,
              photoUrl: config.birthdayPerson?.photoUrl,
              showPhoto: config.birthdayPerson?.showPhoto,
            },
            portraitAudience,
            copy.people,
          )
        : null;
  const celebrants =
    childSlot === 'celebrant' && storedPortraits
      ? storedPortraits.people.flatMap((person) => {
          const src = childSrc(person.src);
          return src ? [{ ...person, src }] : [];
        })
      : [];
  const portraits =
    childSlot === 'celebrant' && storedPortraits ? (celebrants.length ? { ...storedPortraits, people: celebrants } : null) : storedPortraits;
  // B-023 (D-049): the people section of the design families. For a wedding, the couple's full profiles: full name, parents
  // line and photo, each when filled, a photo no longer required. Otherwise the same as `portraits` (the celebrant). The
  // legacy layout keeps `portraits` (D-041: frozen, so its photo-only section stays byte-identical).
  const profiles: Profiles =
    invitation.eventType === 'wedding'
      ? coupleProfiles({
          bride: {
            fullName: config.couple?.bride?.fullName,
            nickName: config.couple?.bride?.nickName,
            parents: config.couple?.bride?.parents,
            order: config.couple?.bride?.order,
            photoUrl: config.couple?.bride?.photoUrl,
          },
          groom: {
            fullName: config.couple?.groom?.fullName,
            nickName: config.couple?.groom?.nickName,
            parents: config.couple?.groom?.parents,
            order: config.couple?.groom?.order,
            photoUrl: config.couple?.groom?.photoUrl,
          },
          displayOrder: config.couple?.displayOrder,
        }, copy.people)
      : portraits;
  const storedHonoureePortrait = ceremonyPortrait(
    invitation.eventType,
    {
      honoureeName: config.ceremonyProfile?.honoureeName,
      nickName: config.ceremonyProfile?.nickName,
      photoUrl: config.ceremonyProfile?.photoUrl,
      showPhoto: config.ceremonyProfile?.showPhoto,
    },
    portraitAudience,
    copy.people,
  );
  const honoureeSrc = childSlot === 'honouree' && storedHonoureePortrait ? childSrc(storedHonoureePortrait.src) : undefined;
  const honoureePortrait =
    childSlot === 'honouree' && storedHonoureePortrait ? (honoureeSrc ? { ...storedHonoureePortrait, src: honoureeSrc } : null) : storedHonoureePortrait;

  // B-029: the ceremony profile (aqiqah, khitanan, tasyakuran), render-when-filled; each type keeps only the fields its
  // editor tab offers. Passed field by field, like the programme, so the content contract sees exactly what is read.
  const ceremonyProfile = ceremonyProfileOf(invitation.eventType, {
    honoureeName: config.ceremonyProfile?.honoureeName,
    nickName: config.ceremonyProfile?.nickName,
    parents: config.ceremonyProfile?.parents,
    fatherName: config.ceremonyProfile?.fatherName,
    motherName: config.ceremonyProfile?.motherName,
    birthDate: config.ceremonyProfile?.birthDate,
    birthTime: config.ceremonyProfile?.birthTime,
    birthPlace: config.ceremonyProfile?.birthPlace,
    age: config.ceremonyProfile?.age,
    ceremonyNote: config.ceremonyProfile?.ceremonyNote,
    gender: config.ceremonyProfile?.gender,
    birthWeight: config.ceremonyProfile?.birthWeight,
    birthLength: config.ceremonyProfile?.birthLength,
    childOrder: config.ceremonyProfile?.childOrder,
    nameMeaning: config.ceremonyProfile?.nameMeaning,
    prayer: config.ceremonyProfile?.prayer,
    school: config.ceremonyProfile?.school,
    circumcisionDate: config.ceremonyProfile?.circumcisionDate,
    recoveryNote: config.ceremonyProfile?.recoveryNote,
    thanksgivingCategory: config.ceremonyProfile?.thanksgivingCategory,
    thanksgivingTitle: config.ceremonyProfile?.thanksgivingTitle,
    achievement: config.ceremonyProfile?.achievement,
  }, honoureePortrait, occasion, copy, dateLocale);
  // B-029: the wedding hashtag and filter link; the editor offers this module for weddings only.
  const share =
    invitation.eventType === 'wedding'
      ? shareOf({ enabled: config.instagramStory?.enabled, hashtag: config.instagramStory?.hashtag, filterUrl: config.instagramStory?.filterUrl })
      : null;

  // S22-K2 (s23r): a corporate headline is an event title (or the organisation), longer than the names the families'
  // display sizes were drawn for; families set it a step smaller so it does not wrap the greeting off the first screen.
  const headlineKind: 'people' | 'event' = invitation.eventType === 'corporate' ? 'event' : 'people';

  // B-009 (D-045): the host's background music. Only a playable source counts: every wedding preset stores
  // `music: { enabled: true }` without a URL, and that renders nothing. `autoplay` unset means "play when the guest opens
  // the invitation" (the editor's default), which is what the cover gate is for; `false` keeps only the music control.
  const musicSrc = isFlagOn('GUEST_MUSIC') && config.music?.enabled === true ? safeAudioSrc(config.music?.assetUrl) : undefined;
  const music = musicSrc ? { src: musicSrc, title: config.music?.title?.trim() || undefined, playOnOpen: config.music?.autoplay !== false } : null;

  // B-026 (D-047): the gift block. The loader has already removed what this audience may not see, so layouts render what
  // is here: the accounts, the host's QRIS image through the route for this audience (the host's preview keeps the
  // owner-only storage path), or, when details were withheld from the invitation link, a notice saying where they are.
  const giftOn = config.gift?.enabled === true;
  const qrisUpload = giftOn ? ownQrisUpload(config.gift?.qrisImageUrl, invitation.id) : undefined;
  const qrisSrc = !qrisUpload
    ? undefined
    : preview
      ? qrisUpload
      : guest
        ? guestGiftQrisPath(invitation.slug, guestLinkSegment(guest))
        : invitationGiftQrisPath(invitation.slug);
  // A scanner reads dark modules on a light field, so the code sits on the palette's lightest surface: the white form
  // field on light palettes, the near-white ink on dark ones (B-016: colours come from the palette).
  const qrisPlate = tone.style.colorScheme === 'dark' ? tone.inkFill : tone.field;
  const giftAccounts = giftOn ? (config.gift?.accounts ?? []) : [];
  const giftHeld = giftOn && giftWithheld;
  const gift = giftAccounts.length || qrisSrc || giftHeld ? { accounts: giftAccounts, qrisSrc, qrisPlate, withheld: giftHeld } : null;
  // B-019 / I-28: the WebP `srcset` of an uploaded image, or undefined (no variants: the original exactly as before).
  const imageSrcSet = (src: string | undefined) => variantSrcSet(imageVariants, src, saveData);

  // I-11: a quote that names a corpus entry shows only an approved entry with its provenance (`religious-text.ts`), never
  // the host's typed text in its place; without a reference it is the host's own words, as before. The design families
  // read this; the legacy layout keeps reading the stored quote (D-041).
  const quoteOn = config.quote?.enabled === true;
  const verse = quoteOn && config.quote?.corpusId ? verifiedBlockFor(config.quote.corpusId) : null;
  const quote = !quoteOn
    ? null
    : config.quote?.corpusId
      ? verse && { text: verse.text, author: verse.citation, provenance: provenanceLine(verse, copy.provenance) }
      : config.quote?.text
        ? { text: config.quote.text, author: config.quote?.author || undefined, provenance: undefined }
        : null;

  return {
    language,
    /**
     * G-018: the `lang` a layout puts on its own root. The document already carries the invitation's language (the proxy and
     * root layout); a layout repeats it only when it is not Indonesian, so English text stays marked on a build served
     * without the proxy (the measurement build) and an Indonesian page stays byte-identical to before G-018.
     */
    contentLang: language === 'id' ? undefined : language,
    copy,
    occasion,
    quote,
    headlineKind,
    music,
    gift,
    imageSrcSet,
    galleryLayout: galleryLayoutChoice,
    galleryVideos,
    tone, formatDate, formatTime, dateParts, names, events, primaryEvent, renderedAt, primaryStartMs, showCountdown, primaryCalendarEvent, gallery,
    canRespond, canRsvp, rsvpMaybe, rsvpQuestions, rsvpEvents, rsvpDeadlineText, rsvpClosedByDeadline, rsvpShown, guestbookShown, wishesListed, wishesModerated, coverImageSrc, coverText, programme,
    organiser, corporateMark, ceremonyProfile, share, portraits, profiles,
    // A pass belongs to one guest, so only a page that recognised its guest ever links one.
    guestPassHref: guest && guestPassHref ? guestPassHref : null,
    // G-035 (I-16): the footer's share actions; the invitation's public face only, the same on every link (no guest).
    inviteShare: inviteShareOf(invitation, config),
    // G-036 (I-05): the cover's large-text switch and the page's reading state (null: no switch, nothing changes).
    reading: readingModeOf(config, readingLarge),
  };
}

export type GuestView = ReturnType<typeof buildGuestView>;
export type InvitationEvent = GuestView['events'][number];
