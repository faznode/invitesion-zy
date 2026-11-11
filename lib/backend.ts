/**
 * Which implementation writes a migrated data domain (ADR-A2; masterplan 09 §8.3 and §8.8): `BACKEND_<DOMAIN>=next|rust`.
 * Every domain defaults to `next` until its slice has passed the rollout gates, and rollback is setting the variable
 * back to `next`. Callers use exactly one writer per call and never fall back to the other one on failure: a fallback
 * after a timeout could become a second writer for a request the first one already committed.
 */
const DEFAULTS = {
  /** R-02: invitation opens (`analytics_events` VIEW rows, `guests.opened_*`). */
  VIEWS: 'next',
  /**
   * R-03: RSVP answers, the guest's and the host's override (`guests.rsvp_status`, `attending_count`, `rsvp_answers`,
   * `rsvp_event_answers`, and the RSVP `analytics_events` row).
   */
  RSVP: 'next',
  /**
   * R-04: wishes and their moderation (`guest_messages`: the guest's wish with its GUESTBOOK `analytics_events` row, the
   * host's show / hide / delete and reply).
   */
  WISHES: 'next',
  /**
   * B-033: the guest roster (`guests`' roster columns and rows: name, slug, phone, category, guest_count, link_token,
   * invited_event_ids, sent_at, checked_in_at with its CHECKIN `analytics_events` row, import_batch_id; plus
   * `guest_registrations` and `guest_registration_links`): both lists' add and operations, invite-only events, imports
   * and their undo, self-registration and the host's decisions.
   */
  ROSTER: 'next',
  /**
   * B-035: the editor's content writes (`invitations.config` with its `invitation_versions` row: the live flag and the next
   * `version_no`, checked against the version the editor loaded). B-037 (D-055): creation too, so that column group has
   * one writer: the new draft row (`user_id`, `template_id`, `slug`, `event_type`, `config`, `status` DRAFT,
   * `creation_key`) with version 1, idempotent per owner and key. Publishing and payment write other columns (`status`,
   * `published_at`, `expires_at`) and stay where they are until U6.
   */
  CONTENT: 'next',
  /**
   * B-039 (U6): settlement, one verified event at a time (`payment_events`; `orders`' `status`, `paid_at` and the provider
   * id a settlement reports; `payments`; the activation of the order's invitation, guarded by B-031; the entitlement
   * outbox row in `jobs`), from the webhook route and the administrator's confirmation alike. Checkout creation (the
   * order row and the provider's handle) and publishing stay in Next.js.
   */
  PAYMENT: 'next',
} as const satisfies Record<string, Backend>;

export type Backend = 'next' | 'rust';
export type BackendDomain = keyof typeof DEFAULTS;

/** An unknown value selects the domain's default, never the other writer. */
export function backendFor(domain: BackendDomain, env: Record<string, string | undefined> = process.env): Backend {
  const raw = env[`BACKEND_${domain}`]?.trim().toLowerCase();
  return raw === 'rust' || raw === 'next' ? raw : DEFAULTS[domain];
}
