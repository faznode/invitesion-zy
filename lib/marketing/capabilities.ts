/**
 * B-022: what the product does today, for marketing claims. Every claim in `app/marketing-registry.ts` and
 * `app/marketing-copy.ts` names the capabilities it relies on, and `tests/b022-claims.test.ts` cross-checks them
 * against this map, the feature flags (`lib/flags.ts`) and the guest page's render map (`RENDER_CAPABILITIES`).
 *
 *   available    built, and its flag (if any) is on in this deployment
 *   conditional  built but its flag is off here: never presented as generally available, only with a label
 *   roadmap      a backlog row exists but nothing is built: only on roadmap surfaces, labelled
 *   unsupported  not built and not planned: never claimed; a page that names it says so
 *
 * Sandbox completion is not public availability: a default-off flag stays `conditional` until the owner switches it on
 * for everyone (the rollout steps in `invitation-research/09-masterplan/06-backlog.md`).
 */
import { isFlagOn, type FlagName } from '@/lib/flags';
import type { ContentSection } from '@/lib/invitation/content-contract';

export type ClaimStatus = 'available' | 'conditional' | 'roadmap' | 'unsupported';

export type CapabilityDefinition = {
  built: 'yes' | 'roadmap' | 'no';
  /** Where it lives: a repository path for built capabilities, the backlog row for roadmap ones. */
  evidence: string;
  /** The flag that gates the entry point. Off makes a built capability `conditional`. */
  flag?: FlagName;
  /** A rollout prerequisite the owner clears before switching the flag on for everyone (documentation only). */
  rollout?: string;
  /** Guest-page sections the claim depends on; each must render at least one field to guests. */
  sections?: readonly ContentSection[];
};

export const CAPABILITIES = {
  // ── Guest page ───────────────────────────────────────────────────────────────
  invitationPage: { built: 'yes', evidence: 'app/i/[slug]/page.tsx', sections: ['settings', 'theme'] },
  personalLinks: { built: 'yes', evidence: 'app/i/[slug]/[guestSlug]/page.tsx' },
  unlistedPages: { built: 'yes', evidence: 'app/i/[slug]/page.tsx' },
  themeCatalog: { built: 'yes', evidence: 'app/templates/page.tsx', sections: ['theme'] },
  themeSwitch: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/edit/editor-theme.tsx' },
  eventDetails: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['events'] },
  mapLink: { built: 'yes', evidence: 'components/invitation/guest-blocks.tsx', sections: ['events'] },
  countdownCalendar: { built: 'yes', evidence: 'app/i/[slug]/calendar.ics/route.ts', flag: 'GUEST_CALENDAR', sections: ['events'] },
  music: { built: 'yes', evidence: 'components/invitation/cover-audio.tsx', flag: 'GUEST_MUSIC', sections: ['music'] },
  gallery: { built: 'yes', evidence: 'lib/invitation/gallery.ts', sections: ['gallery'] },
  videoEmbeds: { built: 'yes', evidence: 'lib/invitation/gallery.ts', sections: ['gallery'] },
  loveStory: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['story'] },
  coupleProfiles: { built: 'yes', evidence: 'lib/invitation/portraits.ts', sections: ['couple'] },
  ceremonyProfiles: { built: 'yes', evidence: 'lib/invitation/ceremony-profile.ts', sections: ['ceremonyProfile'] },
  corporateProgramme: { built: 'yes', evidence: 'lib/invitation/programme.ts', sections: ['corporateProfile'] },
  openingWords: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['greetings', 'quote', 'settings'] },
  livestreamLink: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['streaming'] },
  wishes: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/wishes/page.tsx', sections: ['guestbook'] },
  giftAccounts: { built: 'yes', evidence: 'lib/invitation/gift-privacy.ts', sections: ['gift'] },
  rsvp: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['rsvp'] },
  rsvpDeadline: { built: 'yes', evidence: 'lib/invitation/detail-config.ts', sections: ['rsvp'] },
  rsvpMaybe: { built: 'yes', evidence: 'lib/flags.ts', flag: 'RSVP_MAYBE', sections: ['rsvp'] },
  rsvpQuestions: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/manage/question-editor.tsx', flag: 'RSVP_QUESTIONS', sections: ['registrationForm'] },
  rsvpPerEvent: { built: 'yes', evidence: 'lib/flags.ts', flag: 'RSVP_PER_EVENT', sections: ['rsvp'] },
  inviteOnlyEvents: { built: 'yes', evidence: 'lib/invitation/event-eligibility.ts', flag: 'INVITE_ONLY_EVENTS', sections: ['events'] },
  guestPass: { built: 'yes', evidence: 'app/i/[slug]/[guestSlug]/pass/page.tsx', flag: 'GUEST_PASS', rollout: 'B-024 phone, camera, handheld scanner and desk timing acceptance' },
  checkInScanner: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/checkin/page.tsx', flag: 'GUEST_PASS', rollout: 'B-024 phone, camera, handheld scanner and desk timing acceptance' },
  selfRegistration: { built: 'yes', evidence: 'app/daftar/[token]/page.tsx', flag: 'SELF_REGISTRATION', rollout: 'B-021 owner-approved privacy notice' },
  interfaceBilingual: { built: 'yes', evidence: 'lib/i18n.ts' },
  // G-018 (I-31): Indonesian or English on the four design families, chosen per invitation; the classic layout stays
  // Indonesian (D-041), so claims say "design" and never promise English on every layout.
  guestPageBilingual: { built: 'yes', evidence: 'lib/invitation/guest-copy.ts', flag: 'GUEST_LANGUAGE', sections: ['settings'] },

  // ── Host tools ───────────────────────────────────────────────────────────────
  draftPreview: { built: 'yes', evidence: 'app/preview/[id]/page.tsx' },
  liveEdits: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/edit/page.tsx' },
  guestList: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/guests/page.tsx' },
  guestImport: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/guests/import/page.tsx', flag: 'GUEST_IMPORT' },
  guestCategory: { built: 'yes', evidence: 'lib/db/schema.ts' },
  whatsappLinks: { built: 'yes', evidence: 'lib/invitation/whatsapp.ts' },
  followUpLists: { built: 'yes', evidence: 'lib/invitation/host-analytics.ts' },
  openTracking: { built: 'yes', evidence: 'lib/invitation/host-analytics.ts' },
  insights: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/insights/page.tsx' },
  guestCsvExport: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/analytics/route.ts' },
  answerSummary: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/guests/answer-summary.tsx', flag: 'RSVP_QUESTIONS' },
  eventPlanner: { built: 'yes', evidence: 'app/(customer)/dashboard/planner/page.tsx' },
  seatingLog: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/logs/page.tsx', flag: 'HOST_LOGS', rollout: 'DA-01 item 9 with real sign-in' },
  giftLog: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/logs/page.tsx', flag: 'HOST_LOGS', rollout: 'DA-01 item 9 with real sign-in' },
  teamAccess: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/team/page.tsx', flag: 'TEAM_ACCESS', rollout: 'DA-01 item 8 with real sign-in' },
  wishesBook: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/wishes/book/route.ts', flag: 'WISHES_BOOK', rollout: 'DA-01 item 10 with real sign-in' },
  supportEmail: { built: 'yes', evidence: 'app/marketing-footer.tsx' },
  resellerWorkspace: { built: 'yes', evidence: 'app/(customer)/dashboard/workspace/page.tsx', flag: 'WORKSPACES', rollout: 'DA-01 item 13 with real sign-in' },
  receipts: { built: 'yes', evidence: 'app/(customer)/dashboard/receipts/page.tsx', flag: 'RECEIPTS', rollout: 'DA-01 item 12 (G-050 extension) with real sign-in' },
  coupons: { built: 'yes', evidence: 'app/(customer)/dashboard/invitations/[id]/checkout/page.tsx', flag: 'COUPONS', rollout: 'DA-01 item 12 (G-053 extension) with real sign-in' },
  // G-061: the help centre is always on; each article publishes only while the capabilities it describes are available.
  helpArticles: { built: 'yes', evidence: 'app/resources/help-center/page.tsx' },

  // ── Roadmap (a backlog row, nothing built) ─────────────────────────────────────
  whatsappAutomation: { built: 'roadmap', evidence: 'G-038 WhatsApp workflow (official API, reminders)' },
  // G-052's ledger mechanics exist, but nothing sells, grants or spends a credit until the owner sets prices and packs.
  workspaceCredits: { built: 'roadmap', evidence: 'B-040 Entry-tier / reverse-trial experiment (credit prices, packs and top-ups are owner decisions)' },

  // ── Not built, not planned ───────────────────────────────────────────────────
  emailSending: { built: 'no', evidence: 'no email provider in package.json; `communications` is host-only config' },
  cashlessCollection: { built: 'no', evidence: 'guests never pay through Invitesion; the gift section only shows accounts' },
  ticketing: { built: 'no', evidence: '`ticketing` is host-only config (RENDER_CAPABILITIES)' },
  registrationCapacity: { built: 'no', evidence: '`registrationForm.capacity` is stored only (RENDER_CAPABILITIES)' },
  seatingChartEditor: { built: 'no', evidence: '`seatingPlan` is host-only config; no backlog row for a drag-and-drop chart' },
  crmIntegrations: { built: 'no', evidence: 'no Salesforce or HubSpot client' },
  automationIntegrations: { built: 'no', evidence: 'no Zapier app or outbound webhooks' },
  thirdPartyAnalytics: { built: 'no', evidence: 'no Google Analytics; opens are counted first-party' },
  publicApi: { built: 'no', evidence: 'no public API; the Rust service is private (ADR-A2)' },
  badgePrinting: { built: 'no', evidence: 'no badge layout or print route' },
  appointmentScheduling: { built: 'no', evidence: 'no booking model' },
  embeddableForms: { built: 'no', evidence: 'pages refuse framing (frame-ancestors, B-038)' },
} as const satisfies Record<string, CapabilityDefinition>;

export type CapabilityId = keyof typeof CAPABILITIES;

const RANK: Record<ClaimStatus, number> = { available: 0, conditional: 1, roadmap: 2, unsupported: 3 };

export function capabilityStatus(id: CapabilityId, env: Record<string, string | undefined> = process.env): ClaimStatus {
  const capability: CapabilityDefinition = CAPABILITIES[id];
  if (capability.built === 'no') return 'unsupported';
  if (capability.built === 'roadmap') return 'roadmap';
  return capability.flag && !isFlagOn(capability.flag, env) ? 'conditional' : 'available';
}

/** A claim is only as available as the least available capability it relies on. */
export function claimStatus(needs: readonly CapabilityId[], env: Record<string, string | undefined> = process.env): ClaimStatus {
  return needs.reduce<ClaimStatus>((worst, id) => {
    const status = capabilityStatus(id, env);
    return RANK[status] > RANK[worst] ? status : worst;
  }, 'available');
}

export function worseStatus(a: ClaimStatus, b: ClaimStatus): ClaimStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

export const STATUS_LABEL: Record<Exclude<ClaimStatus, 'available'>, { id: string; en: string }> = {
  conditional: { id: 'Uji terbatas', en: 'Limited trial' },
  roadmap: { id: 'Rencana', en: 'Planned' },
  unsupported: { id: 'Belum tersedia', en: 'Not available' },
};
