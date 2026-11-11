import type { DetailConfig } from './detail-config';

/**
 * Invitation content contract (s11, `invitation-research/01-codebase-audit/template-editability-s11.md`).
 *
 * One shared, versioned schema for invitation-owned content (`detailConfigSchema`), plus this map of what the guest
 * page actually renders. The editor reads the map to label inputs the guest page does not show yet; a test keeps the
 * map and the renderer in agreement. A field moves from `storedOnly` to `rendered` in the same change that renders it.
 * Type-only import on purpose: the editor (a client component) uses this module without bundling zod; the lenient
 * read path that needs the schema lives in `content-read.ts`.
 */
/** 2 (D-036): every event carries a durable `id`. Migration on read: `content-read.ts`; stored backfill: migration 0013. */
export const CONTENT_SCHEMA_VERSION = 2;

type Label = { id: string; en: string };

export type SectionCapability = {
  /** Fields the guest page renders (dot paths inside the section; array items use the item field name). */
  rendered: readonly string[];
  /** Fields the editor can store that the guest page does not render. Shown to hosts as "not on the invitation yet". */
  storedOnly: readonly string[];
  /** Fields that are never guest-facing by design (host tools, operations, internal ids). */
  hostOnly?: readonly string[];
  /** Behaviour the editor offers but the product does not perform yet. */
  caveat?: Label;
};

export const RENDER_CAPABILITIES = {
  schemaVersion: { rendered: [], storedOnly: [], hostOnly: ['schemaVersion'] },
  // B-032 (G-060): `occasion` keeps a memorial's own labels sober (`occasion.ts`); `countdown: false` hides the countdown.
  // G-018 (I-31): `language` picks the guest page's own words, dates and document language on the design families
  // (`guestPageLanguage` in guest-copy.ts); the classic layout stays Indonesian whatever is stored (D-041).
  // G-035 (I-16): `guestShare: false` hides the design families' share actions and Story image (`invite-share.ts`).
  // G-055 (I-30): `cardExport` is the host's opt-in to export printable cards; the guest page never reads it.
  settings: { rendered: ['title', 'openingCopy', 'occasion', 'countdown', 'language', 'guestShare'], storedOnly: ['fontFamily'], hostOnly: ['linkSlug', 'cardExport'] },
  // s20 (D-038, `lib/invitation/portraits.ts`): a couple's photos open a "Mempelai" section with each name and parents line.
  // B-023 (D-049): on the design families the full names, parents lines and child order render without a photo too
  // (`coupleProfiles`); the legacy layout shows them with a photo only (D-041).
  couple: {
    rendered: [
      'bride.fullName', 'bride.nickName', 'groom.fullName', 'groom.nickName', 'displayOrder',
      'bride.photoUrl', 'bride.parents', 'bride.order', 'groom.photoUrl', 'groom.parents', 'groom.order',
    ],
    storedOnly: ['bride.instagram', 'groom.instagram'],
  },
  // D-038: the celebrant's photo by the children's privacy rule (the host's switch, personal links only).
  birthdayPerson: { rendered: ['fullName', 'nickName', 'photoUrl', 'showPhoto'], storedOnly: ['birthDate', 'age', 'parents', 'instagram', 'message'] },
  ceremonyProfile: {
    // B-029 (s17): each ceremony type renders the fields its editor tab offers (`lib/invitation/ceremony-profile.ts`);
    // s20 (D-038): the photo too, by the children's privacy rule for aqiqah and khitanan.
    rendered: [
      'honoureeName', 'nickName', 'parents', 'fatherName', 'motherName', 'birthDate', 'birthTime', 'birthPlace', 'age', 'ceremonyNote',
      'gender', 'birthWeight', 'birthLength', 'childOrder', 'nameMeaning', 'prayer', 'school', 'circumcisionDate', 'recoveryNote',
      'thanksgivingCategory', 'thanksgivingTitle', 'achievement', 'photoUrl', 'showPhoto',
    ],
    storedOnly: [],
  },
  corporateProfile: {
    // B-029: the programme renders when filled (`lib/invitation/programme.ts`); logo (an upload or an http(s) URL,
    // `lib/invitation/image-url.ts`) and category above the headline (`lib/invitation/corporate-mark.ts`).
    rendered: [
      'organizationName', 'eventName', 'description', 'agenda', 'speakers', 'dressCode', 'contactName', 'contactPhone', 'contactEmail',
      'eventCategory', 'logoUrl',
    ],
    storedOnly: [],
  },
  // G-041: the design families apply `sectionOrder` and `fontPairing` (`familyChoices` in family-manifest.ts); the legacy
  // layout ignores both (D-041), like `familyId` itself.
  theme: { rendered: ['paletteId', 'familyId', 'sectionOrder', 'fontPairing', 'cover.imageUrl', 'cover.headline'], storedOnly: [], hostOnly: ['templateId'] },
  // D-037: `inviteOnly` decides who sees an event (`lib/invitation/event-eligibility.ts`) and is never shown itself, like `id`.
  events: { rendered: ['title', 'startAt', 'endAt', 'venueName', 'address', 'mapUrl', 'note'], storedOnly: [], hostOnly: ['id', 'inviteOnly'] },
  // B-009 (D-045): a playable http(s) source plays from the "Buka Undangan" cover (`autoplay` unset or on) or from the
  // music control (`autoplay` off); the title names the control for screen readers.
  music: { rendered: ['enabled', 'assetUrl', 'title', 'autoplay'], storedOnly: [] },
  greetings: { rendered: ['enabled', 'prayer'], storedOnly: [] },
  // I-21 (D-070): the design families render the memory once the event is over (`post-event.ts`); the legacy layout
  // ignores the section (D-041), like `familyId`.
  postEvent: { rendered: ['enabled', 'message', 'photos'], storedOnly: [] },
  // B-026 (D-047): the QRIS image renders through the route for the page's audience; `personalOnly` decides who sees the
  // details (`lib/invitation/gift-privacy.ts`) and is never shown itself.
  gift: { rendered: ['enabled', 'accounts', 'label', 'number', 'holder', 'note', 'qrisImageUrl'], storedOnly: ['kind'], hostOnly: ['personalOnly'] },
  // B-027: the deadline is shown in the event's wall clock and closes the form and the action from that instant on.
  // B-027 slice 2c (D-036): `perEvent` turns the single answer into one answer per event (two or more events).
  rsvp: { rendered: ['enabled', 'deadline', 'perEvent'], storedOnly: ['maxGuestsPerRsvp'] },
  // B-025 (G-028): the design families arrange the photos as `layout` says (`lib/invitation/gallery.ts`; unset = each
  // family's own grid); the legacy layout keeps its grid whatever is stored (D-041).
  gallery: { rendered: ['enabled', 'layout'], storedOnly: [], hostOnly: ['assetIds'] },
  streaming: { rendered: ['enabled', 'url'], storedOnly: ['platform', 'scheduledAt'] },
  story: { rendered: ['enabled', 'items', 'date', 'title', 'body'], storedOnly: [] },
  // B-029 (s17): weddings show the hashtag and an http(s) filter link once switched on (`lib/invitation/share.ts`).
  instagramStory: { rendered: ['enabled', 'hashtag', 'filterUrl'], storedOnly: [] },
  // I-11: `corpusId` renders an approved corpus entry with its provenance on the design families (`religious-text.ts`);
  // the legacy layout keeps rendering the host's own text only (D-041).
  quote: { rendered: ['enabled', 'text', 'author', 'corpusId'], storedOnly: [] },
  // R-04 (D-044): moderation holds new wishes for the host (the form says so) and `visibility: 'host'` lists none.
  guestbook: { rendered: ['enabled', 'heading', 'prompt', 'moderation', 'visibility'], storedOnly: [] },
  eventPlanner: { rendered: [], storedOnly: [], hostOnly: ['enabled', 'eventName', 'coordinatorName', 'coordinatorPhone', 'notes', 'checklist'] },
  // B-027 (D-034, s17): the questions render inside the RSVP form once the host switches the form on; its own deadline,
  // capacity, plus-one and message are not shown, so the page never announces a second deadline the action ignores.
  registrationForm: {
    rendered: ['enabled', 'customQuestions', 'id', 'label', 'type', 'required', 'options', 'conditional'],
    storedOnly: ['deadline', 'capacity', 'allowPlusOne', 'confirmationMessage'],
  },
  mealPreferences: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  communications: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  checkInSettings: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  seatingPlan: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  secondaryEvents: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  ticketing: { rendered: [], storedOnly: [], hostOnly: ['*'] },
  eventOperations: { rendered: ['timezone'], storedOnly: [], hostOnly: ['enabled', 'venueContactName', 'venueContactPhone', 'staffNotes', 'maxCheckInsPerMinute'] },
  whatsappTemplate: { rendered: [], storedOnly: [], hostOnly: ['whatsappTemplate'] },
} as const satisfies Record<keyof DetailConfig, SectionCapability>;

export type ContentSection = keyof typeof RENDER_CAPABILITIES;

/** Readable names for stored-only fields, used in the editor notice. Unlisted fields fall back to their key. */
const FIELD_LABELS: Record<string, Label> = {
  fontFamily: { id: 'jenis huruf', en: 'font' },
  parents: { id: 'nama orang tua', en: 'parents' },
  photoUrl: { id: 'foto', en: 'photo' },
  instagram: { id: 'Instagram', en: 'Instagram' },
  order: { id: 'urutan anak', en: 'child order' },
  birthDate: { id: 'tanggal lahir', en: 'birth date' },
  age: { id: 'usia', en: 'age' },
  message: { id: 'pesan', en: 'message' },
  fatherName: { id: 'nama ayah', en: "father's name" },
  motherName: { id: 'nama ibu', en: "mother's name" },
  birthTime: { id: 'jam lahir', en: 'birth time' },
  birthPlace: { id: 'tempat lahir', en: 'birthplace' },
  ceremonyNote: { id: 'catatan acara', en: 'ceremony note' },
  gender: { id: 'jenis kelamin', en: 'gender' },
  birthWeight: { id: 'berat lahir', en: 'birth weight' },
  birthLength: { id: 'panjang lahir', en: 'birth length' },
  childOrder: { id: 'anak ke-', en: 'child order' },
  nameMeaning: { id: 'arti nama', en: 'name meaning' },
  prayer: { id: 'doa', en: 'prayer' },
  school: { id: 'sekolah', en: 'school' },
  circumcisionDate: { id: 'tanggal khitan', en: 'circumcision date' },
  recoveryNote: { id: 'catatan pemulihan', en: 'recovery note' },
  thanksgivingCategory: { id: 'jenis syukuran', en: 'thanksgiving type' },
  thanksgivingTitle: { id: 'judul syukuran', en: 'thanksgiving title' },
  achievement: { id: 'pencapaian', en: 'achievement' },
  eventCategory: { id: 'kategori acara', en: 'event category' },
  contactName: { id: 'nama PIC', en: 'contact name' },
  contactPhone: { id: 'telepon PIC', en: 'contact phone' },
  contactEmail: { id: 'email PIC', en: 'contact email' },
  logoUrl: { id: 'logo', en: 'logo' },
  description: { id: 'deskripsi', en: 'description' },
  dressCode: { id: 'dress code', en: 'dress code' },
  agenda: { id: 'agenda', en: 'agenda' },
  speakers: { id: 'pembicara', en: 'speakers' },
  kind: { id: 'jenis rekening', en: 'account type' },
  deadline: { id: 'batas waktu RSVP', en: 'RSVP deadline' },
  maxGuestsPerRsvp: { id: 'maksimal tamu per RSVP', en: 'max guests per RSVP' },
  layout: { id: 'tata letak galeri', en: 'gallery layout' },
  platform: { id: 'platform', en: 'platform' },
  scheduledAt: { id: 'jadwal siaran', en: 'stream time' },
  // Section-qualified keys win over the leaf name (`storedOnlyNotice`): this deadline is not the RSVP deadline.
  'registrationForm.deadline': { id: 'batas registrasi', en: 'registration deadline' },
  capacity: { id: 'kapasitas', en: 'capacity' },
  allowPlusOne: { id: 'pendamping', en: 'plus-one' },
  confirmationMessage: { id: 'pesan konfirmasi', en: 'confirmation message' },
};

/** Section of the config that an editor tab edits, per event type (the profile tab differs by event type). */
export function sectionForEditorTab(tab: string, eventType: string): ContentSection | null {
  if (tab === 'couple') {
    if (eventType === 'wedding') return 'couple';
    if (eventType === 'birthday') return 'birthdayPerson';
    if (eventType === 'corporate') return 'corporateProfile';
    return 'ceremonyProfile';
  }
  if (tab === 'whatsapp') return 'whatsappTemplate';
  return tab in RENDER_CAPABILITIES ? (tab as ContentSection) : null;
}

export type StoredOnlyNotice = { wholeSection: boolean; fields: string[]; caveat?: string };

/** What the editor must tell the host about a section: fields saved but not shown to guests, and behaviour caveats. */
export function storedOnlyNotice(section: ContentSection, locale: 'id' | 'en'): StoredOnlyNotice | null {
  const capability: SectionCapability = RENDER_CAPABILITIES[section];
  const labels = [...new Set(capability.storedOnly.map((path) => {
    const leaf = path.split('.').pop() ?? path;
    return (FIELD_LABELS[`${section}.${leaf}`] ?? FIELD_LABELS[leaf])?.[locale] ?? leaf;
  }))];
  const wholeSection = capability.rendered.length === 0 && capability.storedOnly.length > 0;
  if (!labels.length && !capability.caveat) return null;
  return { wholeSection, fields: wholeSection ? [] : labels, caveat: capability.caveat?.[locale] };
}

