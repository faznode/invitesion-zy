<!-- SUMMARY (first 7 lines — greppable) -->
# 10-data-privacy-security-payments.md — privacy, abuse prevention, input safety, tenancy, money, WhatsApp, professional review
> WHAT: Rules and planned controls for guest data, host data, payments and messaging; open questions that need professional (legal / compliance) review, which this research does not answer.
> STATUS: **s26 (2026-11-06): the target ownership of each data domain, owner-token and guest-link verification, the internal service signature, payment idempotency and the job table are specified in `09-backend-and-frontend-architecture.md` §8.3–§8.6 (ADR-A2); this chapter's current-state body is unchanged (no product code changed in s26).** **s25 (2026-11-06): body brought to current code.** §1 adds person photos and the children's-photo access contract (D-038, D-040) and the RSVP data added since s17; the gaps that did not move are restated at s25 (gift accounts, tracking notice, retention, rate limits, CSP report-only, theme entitlement); §4 records the implemented rails with no acquirer; DA-01 / DA-02 are deferred acceptance, not passed. Professional reviews remain external (§7). Earlier: verified s10 (v1 s08).
> OWNER: Research agent
> DEPS: ../01-codebase-audit/{quality-audit.md,revalidation-s10.md}, ../00-setup/privacy-hygiene.md, 12-decision-log.md (ADR-O03, ADR-O04, ADR-O07), 06-backlog.md
> GREP: privacy, security, pdp, abuse, rate limit, tenancy, payments, qris, whatsapp, compliance, children's photos, D-040, protected media
> UPDATED: 2026-11-06

## 1. Data we hold and how we protect it
| Data | Where | Today (s25) | Plan |
|---|---|---|---|
| Guest names, phones, RSVP, wishes | `guests`, `guest_messages` | Owner-scoped queries and React escaping. Unknown guests get a real 404 (s09). Opaque guest tokens exist behind `OPAQUE_GUEST_LINKS`, default **off** by owner decision, so the guessable slug stays the default credential (QA-003 mitigated, B-011). **Since s17:** answers to custom questions and per-event answers (migrations 0012–0014), and invited event ids per guest (0015, D-037). Hidden wishes are filtered from the guest page (baseline) | Decide when to turn opaque links on for new guests while legacy slug links keep working; rate limits (B-013), host moderation and reply (B-028), deletion and retention (B-031) |
| Person and children's photos | storage driver; invitation `config` | Adults' photos once uploaded (D-038). **Children's photos follow an access contract (D-040, E-047):** stored under `protected/<invitation>/…`; `/media/protected/*` is for the signed-in owner only (any failed check is a private 404); guests get the photo through their personal link's photo route, checked on every request (link valid, slot, the host's switch, the file belongs to this invitation). Limits: bytes already served publicly cannot be recalled, and a forwarded link works for its holder. Older uploads move with `scripts/migrate-child-photos.ts` (byte-verified, rollback) | Run the migration per real environment at deployment, after confirming the bucket has no public reads (DA-02). The owner's signed-in read with real keys is DA-01 (deferred, not run) |
| Open / view events | `analytics_events`, `guests.opened_*` | Still collected silently (QA-023); counts are atomic since B-017a | Guest notice and host disclosure (B-021); no third-party analytics on guest pages (keep FM-179 at 0) |
| Gift account numbers, addresses | invitation `config` | **Unchanged at s25.** The account list renders on all five layouts for anyone with the invitation link; no personal-link gating was found in code (QA-022, G-021) | Personal-link-only by default (B-026 with G-021); copy buttons and the host's own QRIS image |
| Media | storage driver | Sandboxed `/media`, no SVG; no resize step and no metadata stripping | An image pipeline that strips metadata (EXIF location) at upload (B-019) |
| Hosts | Clerk identity + local `users` | Roles in the DB; `ClerkProvider` only in the signed-in route groups (E-042) | Co-host and usher roles with least privilege (G-044) |

Indonesia's Personal Data Protection law (UU PDP) obligations (lawful basis, notices, retention, breach handling, cross-border transfer) need **professional review**; this plan only makes the product capable of notices, deletion and minimisation.

## 2. Abuse prevention and input safety
- Rate limits per guest and per IP on RSVP and wishes; message length limits kept (1,000 chars); moderation flag honoured (B-013, B-028).
- Hostile-input cases in the harness: long names, Arabic / RTL, emoji, HTML / script payloads in names and wishes (brief 03 §21.3); CSV formula neutralisation (B-006, shipped s09).
- Reverse-trial or free-publish experiments only after rate limits exist (spam invitations risk).
- No external scripts on guest pages beyond an allowlist (harness gate); CSP enforced after a report-only period (B-038).
- **State at s25:**
  - No rate limits exist on RSVP or wishes. The `moderation` flag is stored and not honoured (B-013, B-028).
  - The nonce CSP from `middleware.ts` is still report-only (B-038).
  - Hostile names, RTL and emoji are exercised by the review fixture's stress guests on all five layouts (E-050 design acceptance; review R1 is still open for legacy's bidi isolation).
  - **B-041 fixed s26 (E-054; D-042):** the config writer refuses a changed Premium palette without a Premium entitlement, an unregistered palette, and a `theme.templateId` other than the invitation's own (403 `THEME_NOT_ENTITLED`, paths only). Until then the PATCH stored any positive `theme.templateId` and palette, and only publishing checked orders: an authorization and revenue defect, not a data leak.

## 3. Tenancy and authorization
Single-owner invitations with ownership checks on every query (good). Additions: invitation members (co-host, usher) with scoped permissions; reseller workspaces later with tenant IDs on invitations and per-tenant quotas (G-052). Admin entry stays private (M-031).

## 4. Payments (ADR-O03)
- Keep the rail interface and idempotent webhooks; **no acquirer chosen, no credential created by the agent**; manual confirmation stays the production fallback.
- Selection criteria for a PJP: Bank Indonesia licence, dynamic QRIS + VA + e-wallets, signed webhooks, idempotency, refunds and settlement APIs, sandbox, transparent fees.
- **Gift money:** the safe first step is the host's own static QRIS image and accounts (no custody, idea I-03). Platform-processed gifts with payouts (BRN-style) need a licensed partner and a legal review of fund custody, refunds and tax before any money is held.
- International: Stripe for non-IDR stays; verify against a real account before claiming it works (F-083).
- **State at s25** (`docs/systems/payment.md`: "LIVE (implemented; acquirer QRIS belum dipilih)"):
  - Both rails are implemented without SDKs (REST plus our own signing, tested against official vectors).
  - `scripts/verify-payment.ts` passes 10 / 10 against a local database (s24).
  - No acquirer is contracted and no live payment has been run (B-039, EXT).
  - The gift block still has no host QRIS image (B-026).

## 5. WhatsApp
- **Now:** `wa.me` links with an editable message and the guest's personal link; normalise numbers to `62…` (B-018); nothing is sent automatically.
- **Bulk sending:** only through the official WhatsApp Business Platform via a provider the owner contracts, with opt-in, templates and rate limits. Unofficial gateways (session-based "blast" tools) risk number bans and policy violations; the plan does not use them (the planned Fonnte integration in AGENTS.md is an owner decision with this risk recorded).

## 6. Religious text (ADR-O04)
Only owner-approved entries in `content/verified-religious-texts/` with source, translation edition, licence / permission, verifier and date; the harness blocks anything else; no agent writes scripture from memory. Since s09 (B-003) presets ship without religious text and the corpus is **empty**, so no quotation renders until the owner approves entries. Re-checked s25: `corpus.json` has 0 entries.

## 7. Questions for professional review (not answered here)
These are external dependencies (EXT in `../_handoff/acceptance-matrix.md`, RQ-ANL-10): B-031 waits for the legal review, B-039 and platform-processed gifts wait for a PJP contract (ADR-O03). Nothing below is resolved by this research.
1. UU PDP: notices, consent for tracking opens, retention periods, deletion SLAs, processor agreements (Clerk, storage, hosting region).
2. Holding or routing guests' gift money: licence requirements, custody, refunds, tax treatment.
3. Consumer-protection rules for discounts and "free" claims.
4. Image rights for template art and guest-uploaded photos; licences for fonts and music.
5. WhatsApp Business policy compliance for reminders and blasts.
