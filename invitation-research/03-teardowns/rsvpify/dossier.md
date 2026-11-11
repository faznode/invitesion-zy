# RSVPify (RSV): Tier A teardown dossier (international, US)

> **Status: v1, session 08 (2026-11-03). No guest-page measurement.** Evidence level **C** (one vendor fact sheet; `../../_handoff/review-20261101.md` §2). RSVPify is in Tier A as the **event-operations depth benchmark**. Its `robots.txt` is an LLM-oriented vendor fact sheet with no directives (S-RSV-001); its pricing page answered with a Cloudflare challenge, which is **never bypassed**: the reader-tool read of that page (S-RSV-002) is a recorded process deviation, excluded from evidence and not cited here. Monthly plan prices therefore stay **[UNKNOWN]**.
>
> Evidence used (times UTC): longlist row (Tranco 56,208; non-browser probes got HTTP 403, 2026-10-27); **S-RSV-001** `rsvpify.com/robots.txt` (13.7 KB fact sheet, 2026-11-01 17:11Z, re-read 17:36Z). All statements below are vendor claims unless tagged otherwise.

## 1. Snapshot
| Item | Finding | Evidence |
|---|---|---|
| Positioning | Event operations: registration/RSVP forms, ticketing and donations, invitations, event websites, guest lists, seating charts, email/SMS, a **QR check-in app with badge printing**, dashboards | [CLAIMED S-RSV-001] |
| Scale claims | 150,000+ event teams, 1 M+ events, ≈ 30 % of the Fortune 500 | [CLAIMED S-RSV-001] |
| Plans | **Free up to 100 invitees or registrations**; paid Starter, Plus, Professional, Enterprise (custom); monthly prices **[UNKNOWN]** | [CLAIMED S-RSV-001] |
| Ticketing fees | 1.95 % + $0.90 per ticket without a monthly fee; payouts within 48 h | [CLAIMED S-RSV-001] |
| Trust | SOC 2 Type II, GDPR/CCPA, SAML SSO, AWS US-East, Stripe; states it neither sells guest data nor uses it for AI training | [CLAIMED S-RSV-001] |
| AI surface | An MCP server for Claude, ChatGPT and Cursor; the "Cue" assistant on Enterprise | [CLAIMED S-RSV-001] |
| Size signal | Tranco 56,208 | [ESTIMATE 2026-10-27] |

## 2. Funnel and flows
```mermaid
flowchart LR
  F[Free plan: up to 100 invitees] --> E[Event website + registration/RSVP form]
  E --> T[Ticketing or donations]
  E --> I[Invitations by email/SMS]
  I --> G[Guest RSVPs / registers, custom questions]
  G --> S[Seating chart]
  S --> Q[Event day: QR check-in app + badge printing]
  Q --> D[Dashboards and exports]
```
All steps [CLAIMED S-RSV-001]; nothing was created or used.

## 3. Builder / editor
Form builder for registration/RSVP, event websites, seating-chart tool. [CLAIMED] Details: [UNKNOWN].

## 4. Guest invitation: no guest-page measurement
No vendor sample event page was identified on the evidence available; nothing was captured. [UNKNOWN]

## 5. Tech fingerprint
| Layer | Finding | Confidence |
|---|---|---|
| Hosting, payments, identity | AWS US-East, Stripe, SAML SSO | [CLAIMED S-RSV-001] |
| Edge | Cloudflare challenge on the pricing page; non-browser clients blocked (403) | [OBSERVED S-RSV-002 status only; longlist] |
| AI integration | MCP server | [CLAIMED] |

## 6. Public API surface
No endpoints observed. The MCP server is a claimed integration surface, not observed. See `api-observed.md`.

## 7. Mobile app
A QR check-in app with badge printing is claimed; store metadata not read. [CLAIMED] / details [UNKNOWN]

## 8. Growth and SEO
- **robots.txt as a machine-readable sales sheet** aimed at LLM assistants. [OBSERVED S-RSV-001]
- MCP integration as distribution inside AI assistants. [CLAIMED]
- Free plan up to 100 guests as the entry point. [CLAIMED]

## 9. Monetization and pricing psychology
Freemium by guest count (100), tiered plans up to custom Enterprise, and transaction fees on ticketing (1.95 % + $0.90). [CLAIMED S-RSV-001] Plan prices [UNKNOWN].

## 10. Strengths, weaknesses, public complaints
- **Strengths:** the deepest operations stack in the set (forms, ticketing, seating, check-in with badges, dashboards); enterprise trust signals; an AI/MCP surface. [CLAIMED]
- **Weaknesses:** generic corporate-event focus rather than culturally specific invitations; pricing hidden behind bot protection. [OBSERVED access] / focus [INFERRED, medium]
- **Public complaints:** s14: the homepage answered 403 (S-RSV-003, origin stopped, no other client) and Trustpilot is restricted under D-030 (S-RSV-004); no public review source is reachable within the research boundaries. [UNKNOWN]

## 11. Patterns to learn, to avoid, and our counter-move
| Learn (principle) | Avoid | Our counter-move |
|---|---|---|
| Check-in as a first-class app with badges and live counts | — | QR pass (F-026) + phone scanner (F-055) + on-site guestbook (F-057) |
| Guest-count freemium that grows into paid tiers | Hiding prices from visitors | Published prices (F-085) |
| A machine-readable product sheet for AI assistants | — | An `llms.txt`-style public fact sheet next to our marketing pages (M-002) |
| Webhooks / MCP for partners | — | Partner API and webhooks (F-091) once reseller workspaces exist (F-079) |

## 12. Mapping to our modules and features
| RSVPify capability | Ours | Modules | Verdict |
|---|---|---|---|
| Registration/RSVP form builder | F-013 full, F-017 config-only | M-014, M-021 | partial |
| Ticketing and donations | F-041 config-only | M-009, M-021 | gap |
| Seating charts | F-042 config-only | M-021 | gap |
| Email/SMS invitations and reminders | F-051 missing, F-052 config-only | M-040 | gap |
| QR check-in app + badges | F-026, F-055 missing; F-056 manual full | M-019 | gap |
| Dashboards | F-053 partial, F-059 partial | M-019 | partial |
| Team access, SSO | F-076 missing | M-030 | gap |
| API / MCP | F-091 missing | — | gap |
| Data-use promises, retention | F-044 missing (guest privacy notice), F-099 missing | M-012 | gap |
| Guest-page weight | C-INV-005 | M-012, M-013 | **not comparable** (RSV unmeasured) |
