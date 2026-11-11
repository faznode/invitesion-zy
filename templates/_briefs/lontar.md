<!-- SUMMARY (first 7 lines — greppable) -->
# lontar.md — design brief: Lontar, a programme-led family for formal and corporate events
> WHAT: Brief (s15) written before the layout to show the brief → prototype → review loop repeats beyond the first three families; built in s15 (`components/invitation/families/lontar.tsx`) on the B-029 programme blocks, binding redrawn after the first desktop render, reviewed with renders in s16.
> STATUS: kept for formal and corporate events (s16 review, 2026-11-04). Verdict in §Review.
> OWNER: template-system workstream
> DEPS: README.md, ../../invitation-research/01-codebase-audit/niche-coverage.md, ../../invitation-research/09-masterplan/06-backlog.md (B-029, B-030), ../../lib/invitation/content-contract.ts, ../../components/invitation/families/lontar.tsx, ../../invitation-research/_handoff/family-review-20261104-s16.md
> GREP: Lontar, corporate, seminar, agenda, programme, speakers, dress code, B-029
> UPDATED: 2026-11-04

## Identity
`lontar` · Lontar · status **kept** for formal and corporate events (built s15, reviewed s16).

## Use case
Seminars, conferences, company anniversaries, launches, inaugurations, gala and award nights, RUPS, trainings; also formal family events whose invitation is mainly a programme. Guests open it twice: once to decide, once on the day to find the session, the room and the dress code.

## Problem
- 16 registry templates use the corporate form, but corporate configs capture organisation, agenda, speakers, dress code and contact that no layout renders (`niche-coverage.md` rows "corporate…", §"Render what is already captured"; G-033 / B-029; `content-contract.ts` lists `agenda`, `speakers`, `dressCode`, `contact*` as `storedOnly`).
- The three current families compose around a couple or a celebrant (Gapura, Kartu) or play (Riang). None leads with a schedule.

## Principles (sources)
1. **Show what the host already typed.** The cheapest parity gain is rendering captured fields (`niche-coverage.md` §5 item 2, G-033).
2. **The programme is the hero.** On the day, the time and title of the next item matter more than ornament. Our own families put event facts below the cover, so a programme-first order is a genuinely different composition, not a re-skin (to be judged on renders).
3. **Legible at 360 px under stress.** Organisation names, session titles and speaker roles are long; up to 50 agenda rows are allowed by the schema. Rows must wrap, never truncate meaning or overflow (stress fixtures, `page-review.ts`).
4. **Local material as structure, not decoration.** The palm-leaf manuscript's long horizontal leaf, punched holes and binding cord give a band-and-cord grid drawn in CSS. No imitation of script, and no text from manuscripts or scripture (the verified corpus is empty, B-003).
5. **Calm.** Motion level 0; formal events read as trustworthy when nothing moves.

No competitor's page is a source for this brief. RSVPify, the owner's preferred reference for a modern, elegant frontend, has no rendered observation in the evidence (S-RSV-002: non-browser clients answered 403; no guest page identified), so no RSVPify specific is claimed.

## Recipe
- **Cover:** organisation name in muted small caps; event name in the display serif at the largest size that fits two lines at 360 px; one "leaf" band (soft surface, full width, `aria-hidden` CSS ornament) carrying date, time with zone label and venue. The ornament is two punched holes, each with a short cord leaving through the band's top edge; nothing crosses the band, because a cord drawn across it read as a range slider at 1280 px (s15, recorded as L2; s16 render S16-L1). Logo only when `logoUrl` is set, in a fixed-ratio frame with the organisation name as alt text (built in s16, E-021: a 160 × 64 frame above the headline, shared by every layout, from an upload or an http(s) URL; S16-L6).
- **Programme:** time | title + speaker rows; at ≥ 640 px a two-column grid, at 360 px time above title. Accent only for the time labels (accent on soft and on bg are verified token pairs); speakers muted.
- **Then:** speakers (name, role, organisation), practical information (dress code, contact as `tel:` / `mailto:` links, map link from the event), RSVP and guestbook through the shared blocks, footer.
- **Type:** the two self-hosted fonts; serif for event name and section titles, sans for everything a guest scans.
- **Palette:** tokens only (B-016); bands on `soft`, cards on `card`; no translucent surfaces.
- **Imagery:** none required. A cover photo, if set, is framed beside the leaf band and never under text.
- **Motion:** level 0.

## Controlled variation
Hosts vary palette, logo (present or absent), agenda length (0–50), speakers (0–50), one or several events, and which sections are on. Fixed: programme-first order, the leaf band, no motion, left alignment.

## Assets
None (CSS ornament only).

## Validation
B-029 first: shared agenda / speakers / dress-code / contact blocks with contract and renderer tests (long, hostile, RTL, empty renders nothing). Then the family: registry entry, layout file, `pnpm test` (rendered tests iterate every family), `page-review.ts` at 360 / 390 / 412 / 1280 + reduced motion with a corporate stress fixture (long organisation, 30 agenda rows, missing logo, expired), `rendered-contrast.ts`, legacy output unchanged.

## Review
s16 (2026-11-04), `../../invitation-research/_handoff/family-review-20261104-s16.md`: full, photo, corporate (30 agenda rows, long organisation, RTL speaker), birthday (emoji guest), sparse (RTL guest), expired and dark (hostile guest) at 360 / 390 / 412 / 1280 + 390 reduced motion; hostile, RTL, emoji and opaque-link guests at 360. First render of the final two-cord binding.
- **Technical:** PASS for layout (0 px overflow on all 35 + 4 shots; reduced motion identical, motion level 0). Rendered contrast: `contrast-sweep-20261104-s16.md`. Tests: `tests/design-families.test.ts` ("Lontar: the programme leads …") and the rendered tests that iterate every family.
- **Visual:** keep for formal and corporate events. The corporate page is clearly programme-led (cover → about → one divided agenda card → speakers → guest information → time and place → RSVP; S16-L2); the binding reads as tie points, not a control, at every width (S16-L1); the photo is framed beside or below the band (S16-L3). A wedding reads as a calm formal letter, spare; a child's birthday reads stiff (S16-L5), so Lontar stays labelled `formal` and is not offered as a children's-party design.

## Open
- S16-L6: **code complete in s16, browser-accepted in s17.** s16 (code and unit tests only): the logo renders when `logoUrl` is set (E-021: fixed 160 × 64 frame, the organisation's name as alt text, an upload or an http(s) URL), `logoUrl` is `rendered` in the content contract, and an uploaded logo can be saved at all (E-022: the schema had refused the upload path); its browser check was still pending at the end of s16. s17, on the unmodified checkpoint build: logos stored through the upload route's storage call load from `/media/…` in all five layouts, square / wide / tall logos stay inside the frame, an Arabic organisation name and a broken upload path neither clip nor overflow (50 pages at 360 and 1280, 554 / 554 checks; `family-review-20261104-s16.md` §9). Signed-in editor upload and save remain unverified (P-INV-010).
- S17-L1 (s17, found while writing E-023 tests): Lontar frames the cover photo beside the date band, so an invitation whose primary event has no date, time or venue shows no cover photo at all, although the host saved one. Decide whether the photo needs a band-independent place before more hosts use Lontar with a photo. **Resolved s18 (E-032):** the photo has a band-independent place. With a band it stays beside it, unchanged. Without one it is framed on its own under the names: 4 : 3, full width on phones, 24 rem from 640 px, no empty band column and no cord. Rendered with the high- and low-contrast covers at 360 and 1280, with the guest name in the first viewport at both widths (IMPLEMENTATION-LOG E-032).
- S17-M3 (s17): an RTL organisation name follows its own start edge (right) under the left-aligned mark and headline. Bidi-correct; whether a start-aligned family should align host text to the page's edge instead is a design decision, open like legacy R1.
- S16-L7: the phone and email links in Informasi Tamu sit far apart (two 44 px targets); keep unless a denser pattern keeps the target size.
- s15 F7: **closed in s16** by B-027 slice 1 (E-020): the RSVP name is wrapping text in every layout.
