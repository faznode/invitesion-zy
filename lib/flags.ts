/**
 * Server-side feature flags without a vendor: `FLAG_<NAME>=on|off` (also 1/0, true/false) overrides the default.
 * Defaults: additive guest-page features ship on; changes to how links are minted ship off until the owner opts in.
 * Rollback for a flagged backlog item = set its variable to `off` and redeploy.
 */
const DEFAULTS = {
  /** B-008: countdown and add-to-calendar on guest pages. */
  GUEST_CALENDAR: true,
  /** B-011: new guests receive an opaque link token instead of a name-derived slug. */
  OPAQUE_GUEST_LINKS: false,
  /** B-027: guests may answer "mungkin" (maybe). Off hides the choice and refuses it; stored answers stay readable. */
  RSVP_MAYBE: true,
  /** B-027 (D-034): the host's custom questions in the RSVP form. Off hides them and stores no answers; stored ones stay. */
  RSVP_QUESTIONS: true,
  /**
   * B-027 slice 2c (D-036): an answer per event once the host switches it on for two or more events. Off restores the
   * single answer exactly as before, and the stored per-event answers are neither read nor written.
   */
  RSVP_PER_EVENT: true,
  /**
   * D-037: events a host marks invite-only are shown only to the guests invited to them. Off shows every event to every
   * guest exactly as before; stored invitations (`guests.invited_event_ids`) are neither read nor written.
   */
  INVITE_ONLY_EVENTS: true,
  /**
   * B-009 (D-045): the host's background music, with the "Buka Undangan" cover that starts it on the guest's tap. Off
   * renders every page exactly as before; the stored music settings are neither read nor removed.
   */
  GUEST_MUSIC: true,
  /**
   * F-02 (D-041 (3)): a new invitation starts on the design family chosen for its event type. Off starts new invitations
   * on the legacy layout exactly as before; invitations already created keep whatever layout they have.
   */
  DEFAULT_FAMILY: true,
  /**
   * G-018 (I-31): a guest page speaks its invitation's language (`settings.language`, Indonesian by default): the design
   * families' labels, dates and notices, the document language, metadata, the link preview and the guest pass. Off
   * renders every guest page in Indonesian exactly as before (the rollback); the legacy layout is Indonesian either way
   * (D-041) and the stored setting is neither read nor removed.
   */
  GUEST_LANGUAGE: true,
  /**
   * G-035 (I-16): a published invitation's design-family page offers its guests the invitation link (the device's share
   * sheet, a copy fallback and WhatsApp) and a 9:16 Status / Story image made from the link preview's public data
   * (`invite-share.ts`, `/i/<slug>/story.png`), never a guest's. A host can hide both (`settings.guestShare = false`).
   * Off hides them on every page and the image answers 404 (the rollback); the legacy layout never shows them (D-041).
   */
  GUEST_SHARE: true,
  /**
   * G-036 (I-05): a design-family page offers a large-text switch on its cover: larger text, the palette's own ink for
   * muted text and no motion, chosen per guest device and kept in a cookie (`reading-mode.ts`). Off shows no switch on any
   * page and ignores the cookie, so every page renders as before (the rollback); the legacy layout never offers it (D-041).
   */
  GUEST_READING: true,
  /**
   * G-055 (I-30): a host who opts in (`settings.cardExport = true`, Tema & Cover) can print A6 cards whose QR code opens the
   * live invitation: a public e-card from the link preview's data (`/i/<slug>/card.png`, never a guest's) and, for the
   * owner only, a card per guest whose code opens that guest's personal link (`print-card.ts`). Off: every card answers 404
   * and the editor offers no switch; a stored opt-in is neither read nor removed (the rollback).
   */
  CARD_EXPORT: true,
  /**
   * G-029: a design-family page shows an event's map in place, but only after the guest asks for it (`map-embed.ts`): no
   * map request is made before the tap, and the static location link stays as it was. Off renders the static link alone,
   * exactly as before (the rollback); the legacy layout never shows the map (D-041).
   */
  GUEST_MAP: true,
  /**
   * G-046: the owner's version history (`/dashboard/invitations/<id>/history`): every saved version listed, and any older
   * one restored as a new version through the selected content writer (`restoreInvitationVersion`). A restore changes the
   * config only: guests, RSVP answers, wishes, media and payments are never touched. Off: the page and the restore route
   * answer 404 and the editor shows no link; the versions themselves are kept as before (the rollback).
   */
  VERSION_HISTORY: true,
  /**
   * G-047 (D-069): a host may set a guest passcode (`guest-passcode.ts`). Until a visitor enters it, the invitation's
   * pages show the cover alone and every surface holding its content refuses (`guest-gate.ts`). Off: no page or route
   * asks for a passcode and the editor offers none, so every protected invitation is public to its link again, exactly
   * as before G-047 (the rollback); the stored hashes are kept, so turning it back on restores each gate unchanged.
   */
  GUEST_PASSCODE: true,
  /**
   * I-21 (D-070): the host's post-event memory on the invitation's own link: a thank-you message and, if the host
   * allows it, photos guests share from their personal links, shown once the host approves each one (`post-event.ts`).
   * Off by default until the guest-photo privacy notice (B-021 copy) and the retention review (B-031, D-063) are settled.
   * Off: no memory on any page, no upload, every photo route 404 and the editor offers none; stored photos are kept.
   */
  POST_EVENT_MEMORY: false,
  /**
   * B-019 (I-28): a public upload queues WebP variants (made by the Rust jobs), and the design families offer them in a
   * `srcset` (the lite ladder under `Save-Data: on`). Off queues nothing and renders every image as its original exactly
   * as before; stored variants are neither read nor removed.
   */
  IMAGE_VARIANTS: true,
  /**
   * B-033: the host's guest import (a paste from a spreadsheet or a CSV file, previewed, then written as one batch that
   * can be undone). Off hides the import and refuses it; imported guests stay.
   */
  GUEST_IMPORT: true,
  /**
   * B-033: self-registration links (`/daftar/<token>`) and the host's queue of requests. Off until the owner opts in:
   * the public form collects names and numbers, and its privacy notice waits on B-021's owner-approved text. Off closes
   * every link (404) and hides the queue; stored requests stay.
   */
  SELF_REGISTRATION: false,
  /**
   * B-035: the editor saves by itself shortly after the host stops typing and shows the invitation beside the fields (the
   * owner preview, reloaded after each save). Off until the owner's signed-in check with real keys (06 rollout; DA-01):
   * off is the manual "Simpan" button and the preview in a new tab, exactly as before. Every save carries the loaded
   * version either way, so a stale tab is refused instead of overwriting another tab's edits.
   */
  EDITOR_AUTOSAVE: false,
  /**
   * B-037 (I-08): the catalog's "Pakai tema" opens the wizard (`/buat/<tema>`): names, date and theme, rendered by the real
   * invitation renderer before anything is stored, and saved as a draft after sign-in. Off until the owner's signed-in
   * check with real keys (DA-01: the sign-in and sign-up round trip that must keep the typed draft): off is the old path,
   * exactly as before (sign in, then an empty draft from the theme), and `/buat/*` answers 404.
   */
  CREATION_WIZARD: false,
  /**
   * B-024 (I-01 / I-27, D-056): the guest pass (a signed QR on the guest's personal link, `/i/<slug>/<guest>/pass`) and
   * the host's scanner (`/dashboard/invitations/<id>/checkin`, camera or a handheld scanner, an offline queue, the
   * greeting screen and a manual fallback). Each invitation still opts in (`config.checkInSettings.enabled`). Off: no
   * pass, no scanner, and every pass is inert (the check-in route answers 404); stored check-ins are kept.
   */
  GUEST_PASS: false,
  /**
   * G-044 (D-057): co-hosts and ushers. The owner makes a join link for one role on the invitation's team page
   * (`/dashboard/invitations/<id>/team`); a signed-in customer accepts it at `/gabung/<token>`. A co-host works on the
   * guest list, check-in, wishes and insights; an usher only at the check-in desk. Off until the owner's signed-in check
   * with real keys (DA-01 item 8): off, the team page and the join links answer 404 and every member is refused at the
   * next request, so the invitation is owner-only again; stored grants are kept.
   */
  TEAM_ACCESS: false,
  /**
   * G-045 (D-058): the owner's day-of logs, `/dashboard/invitations/<id>/logs`: seating tables and each guest's table and
   * seat, souvenirs handed out, and a gift log, with CSV exports. Owner-only (no member role holds it). Never read by a
   * guest page, a public payload or the check-in desk. Off: the page, its actions and its exports answer 404 and the
   * manage centre shows seating as before; stored rows are kept and return when it is switched back on.
   */
  HOST_LOGS: false,
  /**
   * I-22 (D-060): the wishes book, `/dashboard/invitations/<id>/wishes/book`: a PDF of the invitation's visible wishes, oldest
   * first with the host's replies, made on request and never stored. Owner only (`manage`; a co-host moderates wishes but
   * does not export them). Off: the wishes page shows no download and the route answers 404.
   */
  WISHES_BOOK: false,
  /**
   * B-031 (D-063): the owner deletes an invitation from its card on the invitations list: every guest link and writer
   * treats it as gone at once, the owner may restore it during `INVITATION_DELETION_WINDOW_DAYS`, and the
   * `invitation_purge` job then removes its guests, wishes, analytics, versions and media. Off until the owner sets the
   * window (counsel's retention review, EXT): off hides the control and refuses the action; invitations already deleted
   * stay gone, keep their restore, and their jobs run.
   */
  INVITATION_DELETION: false,
  /**
   * G-050: the owner's receipts, `/dashboard/receipts` and one printable page per receipt, plus the link from a paid
   * checkout. The jobs runner issues a receipt for every new payment whatever this says; earlier payments get theirs on
   * the owner's request. Off: the pages and the request answer 404 and no link shows; issued receipts are kept.
   */
  RECEIPTS: false,
  /**
   * G-053 (D-066): the checkout's coupon field. Coupons are created by an administrator (`/admin/<entry>/coupons`),
   * always inactive until activated there; the discount is computed on the server and recorded on the order. Off: the
   * field is hidden and a submitted code is refused with a notice (never silently charged in full); orders already made
   * keep their discounted amount and stay payable; coupons and their redemptions are kept.
   */
  COUPONS: false,
  /**
   * G-052 (D-067): reseller workspaces. A customer creates one workspace, assigns their own invitations to it as client
   * invitations and invites staff by one-time links: `manager` (the co-host's desk, guests, wishes and insights) or
   * `desk` (check-in only), on every live client invitation of that workspace, never content, payment or the team. Off:
   * `/dashboard/workspace` and `/gabung/ruang/*` answer 404 and staff hold nothing at any entry; workspaces, memberships,
   * assignments and the credit ledger are kept.
   */
  WORKSPACES: false,
} as const;

export type FlagName = keyof typeof DEFAULTS;

export function isFlagOn(name: FlagName, env: Record<string, string | undefined> = process.env): boolean {
  const raw = env[`FLAG_${name}`]?.trim().toLowerCase();
  if (raw === 'on' || raw === '1' || raw === 'true') return true;
  if (raw === 'off' || raw === '0' || raw === 'false') return false;
  return DEFAULTS[name];
}
