<!-- SUMMARY (first 7 lines — greppable) -->
# template-editability-s11.md — what is editable, what reaches the guest page, and the content-contract decision
> WHAT: Code-level answer to "are templates editable?" at `e873680`: data ownership, editor → published-page coverage, catalog / editor / preview / renderer agreement, limits, and the architecture chosen (shared versioned content contract + render-capability map + trusted design families).
> STATUS: s11 (2026-11-04). Investigation verified against code; the implementation status of the decision is tracked in `../_handoff/IMPLEMENTATION-LOG.md`.
> OWNER: Architect (decision) · Operator (implementation)
> DEPS: ../../lib/invitation/detail-config.ts, ../../lib/invitation/templates.ts, ../../lib/invitation/template-defaults.ts, ../../components/invitation/public-renderer.tsx, ../../app/(customer)/dashboard/invitations/[id]/edit/editor.tsx, ../../lib/invitation/public.ts
> GREP: editability, template, schema, content contract, renderer, editor, unsupported field, family, versioning, compatibility
> UPDATED: 2026-11-04

## 1. Ownership of the data (as built)
| Owner | Where it lives | What it holds |
|---|---|---|
| **Template** | `lib/invitation/templates.ts` (64 entries) → seeded into `templates` (`template-sync.ts`, `default_config`) | name, category (27), style tags, motif, tier, `paletteId`, `font`, catalog sample copy, `preset` (a starting `DetailConfig`), and `art` (cover + gallery photo pool, template-owned per ADR-O01, `template-defaults.ts` `TEMPLATE_OWNED_KEYS`) |
| **Invitation** | `invitations.config` (JSONB), validated by `detailConfigSchema` (strict zod) on write | every content section: profiles per event type, events, theme (template id, palette, cover), music, greetings, gift, RSVP, gallery, streaming, story, quote, guestbook, operations, WhatsApp template; plus `media_assets` rows (gallery order) |
| **Guest** | `guests`, `guest_messages`, `analytics_events` | name, slug / link token, seat allowance, RSVP answer, attending count, opened count, check-in; wishes; events |

The guest name never enters the config: `loadPublicInvitation()` injects it per request, so one config serves every guest. That boundary is correct and must stay.

## 2. Which editor inputs reach the published page
The editor (`editor.tsx`) writes the whole config through `PATCH /api/invitations/[id]/detail` (merge + strict validation). The only published renderer is `PublicInvitationRenderer`, which the owner preview (`app/preview/[id]`) also uses, so the editor preview and the published page agree. The renderer reads:

- **Rendered:** headline names (`couple.*.nickName / fullName`, `birthdayPerson`, `ceremonyProfile`, `corporateProfile` event / organisation name via `headline.ts`), `settings.title`, `settings.openingCopy`, `theme.paletteId`, `theme.cover.{imageUrl, headline}`, `greetings.{enabled, prayer}`, `quote.*`, `events[]` (with countdown / calendar for a future first event), `eventOperations.timezone`, `gift.{enabled, accounts}`, `rsvp.enabled`, `gallery.enabled` + photo assets, `streaming.{enabled, url}`, `story.{enabled, items}`, `guestbook.{enabled, heading, prompt}`.
- **Stored but never shown to guests**, although the editor offers them: `music.*` (a whole tab; 4+ catalog presets also start with `music.enabled: true`), `instagramStory.*` (a whole tab), couple `parents / photoUrl / instagram / order`, birthday `age / birthDate / parents / photoUrl / message`, most `ceremonyProfile` fields (parents, birth data, meaning, prayer, school…), corporate `agenda / speakers / dressCode / logoUrl / contact* / description`, `rsvp.deadline`, `rsvp.maxGuestsPerRsvp`, `gallery.layout`, `settings.fontFamily / language`, `streaming.platform / scheduledAt`.
- **Misleading control:** `guestbook.moderation`. The toggle is saved, but `submitGuestMessage()` always inserts visible messages (`is_hidden` defaults to false) and no host screen ever sets `is_hidden`. A host who turns moderation on believes wishes wait for approval. They do not.

## 3. Hardcoded sections and behaviour
Section order, headings ("Rangkaian Acara", "Kepada Yth."), layout, typography (`font-serif` everywhere) and motion are fixed in one component for all 64 templates and all event types. The only per-template variable on the guest page is the palette (and the cover image the host uploads). The template's `font`, `motif`, `styleTags` and the presets' `gallery.layout` do nothing there.

## 4. Do catalog, editor, preview and renderer agree?
- Editor ↔ owner preview ↔ published page: **yes** (same renderer, same parsed config).
- Catalog preview (`app/templates/[slug]/preview-client.tsx`, 649 lines with its own CSS module) ↔ published page: **no**. The catalog shows a richer art-directed page (music control, parents, dress code, distinct composition per motif) that the product renderer cannot produce. A buyer sees one design in the catalog and receives another.

## 5. Limits that block meaningful template variation
1. One composition for every template. Variation is recolouring, which the owner and the s09 research both reject as "families".
2. No capability map, so the editor cannot tell which fields render, and nothing tests that it stays true.
3. No content version in `config`: a stored config is reparsed with today's strict schema, and on any failure `loadPublicInvitation()` silently falls back to `{}`, so a guest sees an empty invitation instead of a degraded one.
4. Template defaults are copied once at creation (correct), but the template's design properties (font, motif) are not resolved at render time.

## 6. Editing invitation data ≠ editing layout or code
Hosts edit **invitation data** inside a typed schema. They do not edit layout or code, and should not be able to: customer- or AI-generated HTML / JS is never executed (AGENTS hard rules, ADR on deterministic rendering). Design variation comes from **trusted, reviewed template code** (design families) that consumes the same data. "Editable templates" therefore means: every supported field a template offers renders correctly in that template, unsupported fields are not presented as working, and the family decides composition.

## 7. Decision (s11)
**One shared, versioned content contract, plus a render-capability map, plus trusted design families.** No per-template JSON schema.

- **Why not one schema per template:** the 64 templates differ by category, palette, art and preset, not by data shape. Data needs differ by **event type** (wedding / birthday / ceremony / corporate), which the shared schema already models with separate profile sections. One file per template would multiply validation and migration work without a verified need.
- **Content contract** (`lib/invitation/content-contract.ts`): `CONTENT_SCHEMA_VERSION`, and per field or section the event types it applies to and its render status (`rendered` | `stored-only`). The editor reads it to label stored-only fields "not shown on the invitation yet". A renderer test proves every `rendered` field appears in the HTML and that the map has no stale entries. Fields move to `rendered` only when a family renders them.
- **Lenient read path:** the published page normalises a stored config section by section: a section that fails today's schema is dropped and logged, and the others still render. A legacy config never blanks the page. The strict schema stays on the write path.
- **Design families** (template-owned `family` key in the catalog entry, resolved at render time): reviewed React compositions that read the same contract-checked data and palette tokens. A family may render more sections than another. The capability map is per family, so the editor shows exactly what the chosen template renders.
- **Versioning and compatibility:** `config.schemaVersion` absent = v1 (every existing invitation). Migrations are pure functions `vN → vN+1`, applied on read and on the next save, and tested against fixtures of every legacy shape we know of. Existing invitations keep their palette IDs and links. A template without `family` renders with the current layout (the `classic` family), so nothing changes visually until a template opts in.
- **Security:** families are code in the repository, reviewed and covered by the harness gates. Hosts supply text, URLs from our upload endpoint and enum choices; React escapes text; URLs are schema-validated (`z.string().url()`); no `dangerouslySetInnerHTML` on customer content.

## 8. Evidence used
File reads and greps at `e873680`: `detail-config.ts` (schema, merge), `editor.tsx` (tabs, `HIDDEN_MODULES_BY_TYPE`, `moduleVisible`), `public-renderer.tsx` (every `config.` read), `headline.ts`, `templates.ts` (`InvitationTemplate`, presets), `template-defaults.ts` (ADR-O01 fix), `public.ts` (loader, `safeParse` → `{}` fallback), `app/i/[slug]/actions.ts` (message insert), `schema.ts` (`guest_messages.is_hidden`), `app/templates/[slug]/preview-client.tsx`.

## 9. Follow-up (appended s17; the observations above describe `e873680`)
§2's stored-only list has shrunk since: the corporate programme, logo and category render (B-029, s15–s16); the ceremony profile renders per event type except its photo, and the wedding hashtag and filter link render once switched on (B-029 slice 3, s17, `IMPLEMENTATION-LOG.md` E-026). The live list is `RENDER_CAPABILITIES` in `lib/invitation/content-contract.ts`, which the content-contract test keeps in agreement with the renderer; `music.*`, couple `parents / photoUrl / instagram / order` and the birthday extras were still stored-only at s17.
