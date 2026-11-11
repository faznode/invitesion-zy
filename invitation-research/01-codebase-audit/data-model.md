<!-- SUMMARY (first 7 lines — greppable) -->
# data-model.md — entities, relations, tenancy, niche modelling, personal data
> WHAT: The 18-table schema at 22ed99e, how invitations/templates/guests/RSVP/wishes/gifts/payments/users relate, what is modelled in JSON vs columns, and the defects that matter for the roadmap.
> STATUS: DONE (Phase 1)
> OWNER: Oracle (research)
> DEPS: lib/db/schema.ts, lib/invitation/detail-config.ts, module-map.md (M-009, M-035)
> GREP: data model, schema, erd, tenancy, niche, guests, rsvp, gift, pdp, index
> UPDATED: 2026-10-29

## 1. ERD (columns abridged)
```mermaid
erDiagram
  users ||--o{ invitations : owns
  users ||--o{ orders : pays
  users ||--o| customer_memory : has
  templates ||--o{ invitations : "template_id"
  templates ||--o{ orders : "entitlement per theme"
  invitations ||--o{ invitation_versions : "append-only"
  invitations ||--o{ media_assets : "ordered photos"
  invitations ||--o{ guests : invites
  invitations ||--o{ guest_messages : "wishes"
  invitations ||--o{ analytics_events : tracks
  invitations ||--o{ orders : activates
  guests ||--o{ guest_messages : writes
  guests ||--o{ analytics_events : "VIEW/RSVP/GUESTBOOK/CHECKIN"
  orders ||--o{ payments : ""
  orders ||--o{ payment_events : "webhook log UNIQUE(rail,event_id)"
  conversations ||--o{ messages : ""
  users { serial id PK; varchar clerk_user_id UK; varchar email UK; varchar phone UK; varchar role }
  invitations { serial id PK; int user_id FK; int template_id FK; varchar slug UK; varchar event_type; jsonb config; varchar status; timestamp expires_at }
  guests { serial id PK; int invitation_id FK; varchar name; varchar slug; varchar phone; varchar rsvp_status; int guest_count; timestamp opened_at; int opened_count; timestamp checked_in_at }
  guest_messages { serial id PK; int invitation_id FK; int guest_id FK; varchar name; text message; bool is_hidden }
  templates { serial id PK; varchar name; varchar category; jsonb default_config; text thumbnail; bool is_premium }
  orders { serial id PK; int invitation_id FK; int template_id FK; int amount; varchar currency; varchar rail; varchar reference UK; varchar status }
```

## 2. Where data lives
| Concept | Storage | Notes |
|---|---|---|
| Invitation content (names, events, gift accounts, story, quote, music, theme, RSVP settings) | `invitations.config` JSONB, validated by `detailConfigSchema` (strict) | Renderer source of truth; every save writes a full copy to `invitation_versions` |
| Template | Code registry (64) → `templates` row (identity) via sync by **name** | Renaming a template in code creates a new row and orphans the old one |
| Guest identity | `guests` row; URL credential = `slug` derived from the name | No secret token |
| RSVP | `guests.rsvp_status` + `guests.guest_count` | `guest_count` is both the **allowance** and the **attending count** (see §4 D-03) |
| Wishes | `guest_messages` (copy of guest name) | `is_hidden` exists; nothing ever sets it |
| Gifts | `config.gift.accounts[]` (bank/e-wallet/address: label, holder, number) | Public to anyone with `/i/:slug` — no guest link needed |
| Payments | `orders` (minor units, rail, reference) + `payments` + `payment_events` | Entitlement per (invitation, template) |
| Analytics | `analytics_events` rows + `guests.opened_count/opened_at` | No aggregation tables |
| Operational modules (registration form, meals, seating, ticketing, check-in settings) | config JSON only | No guest-facing UI and no response tables |

## 3. Tenancy and niche modelling
- **Tenancy:** single-owner. Every domain row hangs off `users.id`; ownership is checked per query (`requireOwnedInvitation`). There is no organisation, team, reseller, or white-label tenant — a wedding organiser or reseller cannot manage many clients' invitations under one account with sub-users, branding, or wholesale pricing.
- **Niche:** two parallel taxonomies. `invitations.event_type` (6 core values: wedding, birthday, aqiqah, tasyakuran, khitanan, corporate; varchar 20) drives profile fields, publish rules and editor modules; `templates.category` (27 values; varchar 30) drives the catalog. `templateEventTypes` maps 27 → 6 (e.g. *reunion → corporate*, *graduation → tasyakuran*, *tahlilan → ?* via the same table). Consequence: a tahlilan or graduation invitation is edited with a ceremony/corporate form that does not fit its culture (no almarhum/almarhumah fields, no graduate/campus profile).
- **Multi-event:** `config.events[]` (≤ 20 items: title, start/end with offset, venue, address, mapUrl, note) covers akad/resepsi/ngunduh mantu, but there is no per-event guest eligibility on the guest page (`secondaryEvents.eligibleGuestIds` exists in config only).

## 4. Defects that shape the roadmap
| ID | Severity | Defect | Evidence |
|---|---|---|---|
| D-01 | P0 | Template `default_config` carries `art`; strict schema rejects it; `createInvitation` falls back to `{}` → chosen theme and preset sections lost | probe: 64/64 rows fail with `unrecognized_keys: art` [OBSERVED 2026-10-29 05:43 WIB]; `lib/invitation/create.ts:44-48`, `template-sync.ts:101-111` |
| D-02 | P0 | Guest slug = slugify(name); it is the only credential for RSVP/wishes and for seeing the personalised page | `lib/invitation/slug.ts`, `app/(customer)/dashboard/guests/actions.ts:34-40`, `app/i/[slug]/actions.ts:16-31` |
| D-03 | P1 | `guest_count` overwritten by the RSVP answer: a decline sets 0, after which the guest can only re-confirm for 1 person; the host loses the original allowance | `app/i/[slug]/actions.ts:44-48` |
| D-04 | P1 | No indexes on `guest_messages(invitation_id, created_at)` or `analytics_events(invitation_id, event_type, guest_id, created_at)`; the per-view dedupe query scans the table | migrations contain only 2 composite unique indexes |
| D-05 | P1 | Event timezone not modelled per event (only `eventOperations.timezone`, unused); renderer prints server-local time + "WIB" | H-INV-002 |
| D-06 | P2 | `invitation_versions` grows by one full config copy per save, never pruned | `lib/invitation/service.ts:52-75` |
| D-07 | P2 | `templates` matched by name during sync (rename = duplicate row) | `template-sync.ts` header |
| D-08 | P2 | Status columns are free varchar (no enum/check constraint): `DRAFT|PUBLISHED|EXPIRED`, `PENDING|CONFIRMED|DECLINED` | schema.ts |
| D-09 | P2 | No "maybe" RSVP state (Indonesian competitors offer hadir / tidak hadir / ragu-ragu) | schema.ts, renderer |

## 5. Indexes present
PKs; UNIQUE on `users.email`, `users.clerk_user_id`, `users.phone`, `invitations.slug`, `orders.reference`, `customer_memory.user_id`; `guests(invitation_id, slug)`; `media_assets(invitation_id, upload_sequence)`; `payment_events(rail, event_id)`. Missing for hot paths: see D-04.

## 6. Personal data inventory (UU PDP lens — risk flags, not legal advice)
| Data | Where | Exposure today | Flag |
|---|---|---|---|
| Customer email, phone, WhatsApp, Instagram, X | `users` | Owner + admin | Retention undefined; soft delete only |
| Guest name | `guests.name`, copied into `guest_messages.name` | Shown on the guest's page; **enumerable** via guessable slugs | Minimise exposure; unguessable tokens |
| Guest phone | `guests.phone` | Owner; CSV export | Retention after event undefined |
| Wishes | `guest_messages.message` | Public on the invitation page to anyone with the link | Moderation exists only as a flag |
| Bank / e-wallet account + holder name | `invitations.config.gift.accounts` | Public on `/i/:slug` without a guest link | Consider guest-link-only display, copy button instead of plain text in the RSC payload |
| View/RSVP telemetry per guest | `analytics_events`, `guests.opened_*` | Owner | Disclose to guests (privacy notice) |
| Payment payloads | `payments.raw_payload`, `payment_events.raw_payload` | Admin | May contain payer PII from providers; define retention |

No deletion/retention job exists; invitations expire to read-only after 12 months and "guest data is retained" (`lib/invitation/public.ts` comment).
