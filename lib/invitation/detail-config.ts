import { z } from 'zod';
import { FAMILY_IDS } from './families';
import { isAbsoluteUrl, isProtectedMediaPath, isUploadedMediaPath } from './image-url';
import { OCCASIONS } from './occasion';

/**
 * Typed contract for the invitation detail editor.
 *
 * Every module observed in the reference flow maps to one optional section.
 * All sections are optional so the config extends additively (see
 * api-and-interface-design: prefer addition over modification). The invitation
 * `config` JSON column stays the renderer's source of truth; this schema is the
 * validation + typing boundary in front of it.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional();
const idText = trimmed(80).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, underscores, and hyphens are allowed');
const dateTime = z.string().datetime({ offset: true });

/**
 * An image field the editor fills with `ImageUpload`. The upload route answers with the relative `/media/<key>` path,
 * which `.url()` refused, so every save after an upload failed. This takes that path plus everything `.url()` took, and
 * reports anything else with the same issue as before.
 */
const imageUrlField = (options: { protectedUpload?: boolean } = {}) =>
  z
    .string()
    .max(500)
    .superRefine((value, ctx) => {
      if (isUploadedMediaPath(value) || isAbsoluteUrl(value)) return;
      if (options.protectedUpload && isProtectedMediaPath(value)) return;
      ctx.addIssue({ code: z.ZodIssueCode.invalid_string, validation: 'url', message: 'Invalid url' });
    })
    .optional();

/**
 * D-040: the child-photo fields also take a protected upload path. The schema has no invitation, so the service checks
 * that the path names this invitation and that the field is this event type's child photo (`media-ownership.ts`).
 */
const childImageUrlField = () => imageUrlField({ protectedUpload: true });

/**
 * B-026 (D-047): the host's static QRIS image is a protected upload only (`purpose=gift-qris`), never a typed URL, so guests
 * reach it through the route for their audience and nothing else can point at it. `''` is the editor's "removed". The
 * service checks that the path names this invitation (`media-ownership.ts`).
 */
const qrisImageField = () =>
  z
    .string()
    .max(500)
    .superRefine((value, ctx) => {
      if (value === '' || isProtectedMediaPath(value)) return;
      ctx.addIssue({ code: z.ZodIssueCode.invalid_string, validation: 'url', message: 'Upload the QRIS image' });
    })
    .optional();

const conditionalSchema = z.object({
  questionId: idText,
  equals: trimmed(200).optional(),
  in: z.array(trimmed(200)).min(1).max(20).optional(),
}).strict().refine((value) => value.equals !== undefined || value.in !== undefined, {
  message: 'A condition must specify equals or in',
});

export const customQuestionSchema = z.object({
  id: idText,
  label: trimmed(200),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'radio', 'checkbox', 'number']),
  required: z.boolean().default(false),
  options: z.array(trimmed(120)).min(1).max(50).optional(),
  conditional: conditionalSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const optionTypes = ['select', 'multiselect', 'radio', 'checkbox'];
  if (optionTypes.includes(value.type) && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Options are required for this question type' });
  }
  if (!optionTypes.includes(value.type) && value.options) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Options are only valid for choice question types' });
  }
});

const registrationFormBase = z.object({
  enabled: z.boolean().default(false),
  deadline: dateTime.optional(),
  capacity: z.number().int().min(1).max(100000).optional(),
  allowPlusOne: z.boolean().default(false),
  confirmationMessage: optionalText(1000),
  customQuestions: z.array(customQuestionSchema).max(50).optional(),
}).strict();

function uniqueQuestionIds(value: z.infer<typeof registrationFormBase>, ctx: z.RefinementCtx): Set<string> {
  const ids = new Set<string>();
  for (const [index, question] of (value.customQuestions ?? []).entries()) {
    if (ids.has(question.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customQuestions', index, 'id'], message: 'Question IDs must be unique' });
    ids.add(question.id);
  }
  return ids;
}

/**
 * Read rules for a stored form (S18-Q4, D-035), never used to accept a write: ids stay unique, but a condition naming a
 * missing question, or its own, is kept. D-034 already treats such a question as never applying (the guest page hides it,
 * the action drops its answers), and keeping it leaves its stored answers in the export and lets the host fix it.
 */
export const registrationFormReadSchema = registrationFormBase.superRefine((value, ctx) => {
  uniqueQuestionIds(value, ctx);
});

const registrationFormSchema = registrationFormBase.superRefine((value, ctx) => {
  const ids = uniqueQuestionIds(value, ctx);
  for (const [index, question] of (value.customQuestions ?? []).entries()) {
    if (question.conditional?.questionId === question.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customQuestions', index, 'conditional', 'questionId'], message: 'A question cannot be conditional on itself' });
    }
  }
  for (const [index, question] of (value.customQuestions ?? []).entries()) {
    if (question.conditional && !ids.has(question.conditional.questionId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customQuestions', index, 'conditional', 'questionId'], message: 'Conditional questionId must reference a configured question' });
    }
  }
});

const mealPreferencesSchema = z.object({
  enabled: z.boolean().default(false),
  options: z.array(trimmed(120)).min(1).max(50).optional(),
  collectAllergies: z.boolean().default(false),
}).strict();

const communicationsSchema = z.object({
  senderLabel: optionalText(120),
  replyTo: z.string().email().max(254).optional(),
  reminderEnabled: z.boolean().default(false),
  reminderAt: dateTime.optional(),
  reminderMessage: optionalText(1000),
}).strict();

const checkInSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  allowManual: z.boolean().default(true),
  requireQr: z.boolean().default(false),
}).strict();

const seatingPlanSchema = z.object({
  tables: z.array(z.object({ id: idText, name: trimmed(120), capacity: z.number().int().min(1).max(1000), guestIds: z.array(idText).max(1000) }).strict()).max(1000),
}).strict();

const secondaryEventSchema = z.object({
  id: idText,
  title: trimmed(160),
  startAt: dateTime,
  venueName: optionalText(160),
  eligibleGuestIds: z.array(idText).max(100000).optional(),
}).strict();

const ticketingSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['free', 'paid', 'donation']).default('free'),
  currency: z.literal('IDR').default('IDR'),
  tiers: z.array(z.object({ id: idText, name: trimmed(120), price: z.number().int().min(0).max(100000000000), capacity: z.number().int().min(1).max(1000000).optional() }).strict()).max(50).optional(),
}).strict();

const eventOperationsSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: trimmed(64).optional(),
  venueContactName: optionalText(160),
  venueContactPhone: optionalText(30),
  staffNotes: optionalText(2000),
  maxCheckInsPerMinute: z.number().int().min(1).max(10000).optional(),
}).strict();

// A single scheduled event (akad, resepsi, etc.). `id` (B-027 slice 2c, D-036) is the event's durable identity: per-event
// answers name it, so it survives edits and reordering. Optional in the schema because older configs and writers omit it;
// the read path and the write path give every event one (`lib/invitation/event-ids.ts`).
export const eventItemSchema = z.object({
  id: idText.optional(),
  title: trimmed(120),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  venueName: optionalText(160),
  address: optionalText(400),
  mapUrl: z.string().url().max(500).optional(),
  note: optionalText(500),
  // D-037: shown only to guests invited to it (`guests.invited_event_ids`); absent = open to every guest, as before.
  inviteOnly: z.boolean().optional(),
});

export const coupleSideSchema = z.object({
  fullName: optionalText(160),
  nickName: optionalText(80),
  parents: optionalText(300),
  order: z.number().int().min(0).max(50).optional(), // child order (anak ke-)
  instagram: optionalText(100),
  photoUrl: imageUrlField(),
});

export const giftAccountSchema = z.object({
  kind: z.enum(['bank', 'ewallet', 'address']),
  label: trimmed(80),
  holder: optionalText(160),
  number: optionalText(80),
  note: optionalText(300),
});

export const streamingSchema = z.object({
  enabled: z.boolean().default(false),
  platform: z.enum(['youtube', 'instagram', 'zoom', 'other']).optional(),
  url: z.string().url().max(500).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export const storyItemSchema = z.object({
  date: optionalText(80),
  title: optionalText(160),
  body: optionalText(1000),
});

export const detailConfigSchema = z
  .object({
    // Content contract version (lib/invitation/content-contract.ts). Absent = 1, which covers every config written
    // before the field existed; later versions are migrated on read.
    schemaVersion: z.number().int().min(1).optional(),

    // Control center / settings
    settings: z
      .object({
        title: optionalText(160),
        linkSlug: optionalText(120),
        fontFamily: optionalText(80),
        openingCopy: optionalText(600),
        language: z.enum(['id', 'en']).optional(),
        // B-032 (G-060): the occasion a preset declares when the core event type is broader (`occasion.ts`); absent = the
        // event type's own, so stored invitations read as before.
        occasion: z.enum(OCCASIONS).optional(),
        // B-032: `false` hides the countdown (the add-to-calendar links stay); absent = shown, as before.
        countdown: z.boolean().optional(),
        // G-035 (I-16): `false` hides the guest page's share actions and Story image; absent = shown on the design families.
        guestShare: z.boolean().optional(),
        // G-055 (I-30): `true` lets the host export printable cards and a public e-card with a QR code (`print-card.ts`);
        // absent = off, so no stored invitation gains a card it did not ask for.
        cardExport: z.boolean().optional(),
      })
      .partial()
      .optional(),

    // Wedding-only profile. Kept separate from birthday so fields never leak
    // into the wrong invitation experience.
    couple: z
      .object({
        bride: coupleSideSchema.optional(),
        groom: coupleSideSchema.optional(),
        displayOrder: z.enum(['bride-first', 'groom-first']).optional(),
      })
      .optional(),

    // Birthday-only profile. A birthday has one celebrant, not two spouses.
    birthdayPerson: z
      .object({
        fullName: optionalText(160),
        nickName: optionalText(80),
        birthDate: z.string().date().optional(),
        age: z.number().int().min(1).max(120).optional(),
        parents: optionalText(300),
        photoUrl: childImageUrlField(),
        // D-038: the celebrant may be a child, so the photo shows only when the host switches it on (personal links only).
        showPhoto: z.boolean().optional(),
        instagram: optionalText(100),
        message: optionalText(600),
      })
      .optional(),

    // Ceremony profile for aqiqah, tasyakuran, and khitanan. Each event type
    // reads a different subset of these fields (see editor allowlist); the
    // schema is a superset so a single stored config can round-trip safely.
    ceremonyProfile: z
      .object({
        honoureeName: optionalText(160),
        nickName: optionalText(80),
        parents: optionalText(300),
        fatherName: optionalText(160),
        motherName: optionalText(160),
        birthDate: z.string().date().optional(),
        birthTime: optionalText(20),
        birthPlace: optionalText(160),
        age: z.number().int().min(0).max(120).optional(),
        ceremonyNote: optionalText(800),
        photoUrl: childImageUrlField(),
        // D-038: an aqiqah or khitanan honouree is a child: the photo shows only when the host switches it on.
        showPhoto: z.boolean().optional(),
        // Aqiqah-specific
        gender: z.enum(['male', 'female']).optional(),
        birthWeight: optionalText(20), // e.g. "3.2 kg"
        birthLength: optionalText(20), // e.g. "49 cm"
        childOrder: z.number().int().min(1).max(30).optional(), // anak ke-
        nameMeaning: optionalText(500),
        prayer: optionalText(1000),
        // Khitanan-specific
        school: optionalText(160),
        circumcisionDate: z.string().date().optional(),
        recoveryNote: optionalText(500),
        // Tasyakuran-specific
        thanksgivingCategory: z
          .enum(['housewarming', 'promotion', 'graduation', 'new_business', 'hajj_umrah', 'other'])
          .optional(),
        thanksgivingTitle: optionalText(160),
        achievement: optionalText(300), // kampus/jabatan/alamat baru/nama usaha
      })
      .optional(),

    // Corporate events are represented by the organising company/contact.
    corporateProfile: z
      .object({
        organizationName: optionalText(160),
        eventName: optionalText(160),
        eventCategory: z
          .enum(['gathering', 'product_launch', 'seminar', 'conference', 'webinar', 'gala_award', 'rups', 'training', 'other'])
          .optional(),
        contactName: optionalText(160),
        contactPhone: optionalText(30),
        contactEmail: optionalText(160),
        logoUrl: imageUrlField(),
        description: optionalText(1000),
        dressCode: optionalText(120),
        agenda: z
          .array(z.object({ time: optionalText(40), title: trimmed(160), speaker: optionalText(160) }))
          .max(50)
          .optional(),
        speakers: z
          .array(z.object({ name: trimmed(160), role: optionalText(160), org: optionalText(160) }))
          .max(50)
          .optional(),
      })
      .optional(),

    theme: z
      .object({
        templateId: z.number().int().positive().optional(),
        paletteId: optionalText(50),
        // B-030 design family. `.catch` instead of a hard failure: the read path drops a whole section that fails, so a
        // retired family id must fall back to the legacy layout without taking the palette and cover with it.
        familyId: z.enum(FAMILY_IDS).optional().catch(undefined),
        // G-041: the host's choices inside the family's contract (`family-manifest.ts`). Plain strings like `paletteId`:
        // the writers refuse an id outside the contract when a save changes it (`theme-entitlement.ts`), and the renderer
        // draws the family's default for any other stored value, so saved data always reads and legacy ignores both.
        sectionOrder: optionalText(40),
        fontPairing: optionalText(40),
        cover: z
          .object({
            imageUrl: imageUrlField(),
            headline: optionalText(200),
          })
          .optional(),
      })
      .optional(),

    events: z
      .array(eventItemSchema)
      .max(20)
      .superRefine((events, ctx) => {
        const ids = new Set<string>();
        for (const [index, event] of events.entries()) {
          if (event.id === undefined) continue;
          if (ids.has(event.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: 'Event IDs must be unique' });
          ids.add(event.id);
        }
      })
      .optional(),

    music: z
      .object({
        enabled: z.boolean().default(false),
        assetUrl: z.string().url().max(500).optional(),
        title: optionalText(160),
        autoplay: z.boolean().optional(),
      })
      .optional(),

    greetings: z
      .object({
        enabled: z.boolean().default(true),
        prayer: optionalText(1000),
      })
      .optional(),

    // I-21 (D-070): the post-event memory, the host's opt-in. The design families show the thank-you message once the
    // last event the page's audience may see is over (`post-event.ts`); `photos` lets guests share photos from their
    // personal links, each shown after the host approves it. The legacy layout never shows it (D-041). Both switches are
    // optional rather than defaulted (absent = off): a default would be applied to a partial save before the merge and
    // switch off what the stored section has on.
    postEvent: z
      .object({
        enabled: z.boolean().optional(),
        message: optionalText(1000),
        photos: z.boolean().optional(),
      })
      .optional(),

    gift: z
      .object({
        enabled: z.boolean().default(false),
        accounts: z.array(giftAccountSchema).max(10).optional(),
        // B-026 / G-021 (D-047): gift details only on personal guest links. Absent = off, so invitations created before
        // B-026 keep today's visibility until their host changes it; `createInvitation` starts new ones with it on.
        personalOnly: z.boolean().optional(),
        // B-026: the host's static QRIS image (no payment passes through Invitesion).
        qrisImageUrl: qrisImageField(),
      })
      .optional(),

    rsvp: z
      .object({
        enabled: z.boolean().default(true),
        deadline: z.string().datetime({ offset: true }).optional(),
        maxGuestsPerRsvp: z.number().int().min(1).max(50).optional(),
        // B-027 slice 2c (D-036): guests answer each event on its own once there are two or more events.
        perEvent: z.boolean().optional(),
      })
      .optional(),

    // Gallery references ordered media assets by id; the array order here is a
    // display hint, but the persisted media sortOrder is authoritative.
    gallery: z
      .object({
        enabled: z.boolean().default(true),
        layout: z.enum(['grid', 'masonry', 'carousel']).optional(),
        assetIds: z.array(z.number().int().positive()).max(200).optional(),
      })
      .optional(),

    streaming: streamingSchema.optional(),

    story: z
      .object({
        enabled: z.boolean().default(false),
        items: z.array(storyItemSchema).max(30).optional(),
      })
      .optional(),

    instagramStory: z
      .object({
        enabled: z.boolean().default(false),
        hashtag: optionalText(80),
        filterUrl: z.string().url().max(500).optional(),
      })
      .optional(),

    quote: z
      .object({
        enabled: z.boolean().default(false),
        text: optionalText(600),
        author: optionalText(120),
        // I-11: an owner-approved corpus entry (`religious-text.ts`). The page renders that entry's text, citation and
        // provenance, and nothing at all when the id is not an approved entry. `''` = no reference: a save clears one with
        // it, because the merge keeps every key a save leaves out (`mergeDetailConfig`).
        corpusId: z.union([z.literal(''), z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]).optional(),
      })
      .optional(),

    guestbook: z
      .object({
        enabled: z.boolean().default(true),
        heading: optionalText(160),
        prompt: optionalText(500),
        /** R-04 (D-044): new wishes wait for the host's approval before the page lists them. */
        moderation: z.boolean().default(false),
        /**
         * R-04 (D-044): `host` keeps the wishes for the hosts only; the page shows the form and no list. Absent = `public`
         * (optional rather than defaulted, so existing configs are not rewritten on their next save).
         */
        visibility: z.enum(['public', 'host']).optional(),
      })
      .optional(),

    eventPlanner: z
      .object({
        enabled: z.boolean().default(false),
        eventName: optionalText(160),
        coordinatorName: optionalText(160),
        coordinatorPhone: optionalText(30),
        notes: optionalText(2000),
        checklist: z.array(z.object({ title: trimmed(160), done: z.boolean().default(false) })).max(100).optional(),
      })
      .optional(),

    // Operational modules are configuration only. Live guest responses,
    // check-ins, delivery/provider state, and analytics remain DB-owned.
    registrationForm: registrationFormSchema.optional(),
    mealPreferences: mealPreferencesSchema.optional(),
    communications: communicationsSchema.optional(),
    checkInSettings: checkInSettingsSchema.optional(),
    seatingPlan: seatingPlanSchema.optional(),
    secondaryEvents: z.array(secondaryEventSchema).max(50).optional(),
    ticketing: ticketingSchema.optional(),
    eventOperations: eventOperationsSchema.optional(),

    whatsappTemplate: optionalText(1000),
  })
  .strict();

export type DetailConfig = z.infer<typeof detailConfigSchema>;

/**
 * Deep-merge a partial detail update into an existing config. Objects merge
 * recursively; arrays and scalars replace wholesale (arrays represent an
 * ordered set the caller owns, so partial array merges would be ambiguous).
 * Preserves any unrelated keys already present on the stored config.
 */
export function mergeDetailConfig(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = base[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      base[key] = mergeDetailConfig(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      base[key] = value;
    }
  }
  return base;
}
