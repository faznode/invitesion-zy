<!-- SUMMARY (first 7 lines — greppable) -->
# riang.md — design brief (as built): Riang, bands and bunting for celebrations
> WHAT: As-built brief for the Riang family (B-030 slice 1, code s14), written in s15 from `components/invitation/families/riang.tsx`; review state from the s16 rendered review (the s15 review record was never saved). The non-wedding family the B-030 acceptance requires.
> STATUS: reviewed (s16): keep for celebrations. Verdict in §Review.
> OWNER: template-system workstream
> DEPS: README.md, ../../components/invitation/families/riang.tsx, ../../lib/invitation/families.ts, ../../invitation-research/_handoff/family-review-20261104-s16.md
> GREP: Riang, birthday, celebration, bunting, umbul-umbul, bands, calendar tile, aqiqah, khitanan
> UPDATED: 2026-11-04

## Identity
`riang` · Riang · status **kept** for celebrations (reviewed s16).

## Use case
Birthdays, thanksgivings (syukuran), aqiqah, khitanan and informal company events: invitations whose guests mostly need when and where.

## Problem
The registry's non-wedding categories (birthday, aqiqah, khitanan, corporate) render the same wedding-shaped page (`01-codebase-audit/niche-coverage.md`); a celebration needs a different emotional register and leads with practical facts.

## Principles (sources)
1. **When and where first.** The date is a large calendar tile on the cover, time and venue are chips next to it, and the events band comes before the greeting.
2. **Local festive vernacular, drawn in CSS.** Umbul-umbul (pennant bunting) opens the cover; no imagery is required.
3. **Rhythm independent of content.** Sections alternate plain and tinted full-width bands, so the page keeps its rhythm whichever sections the host turns on.

## Recipe
- **Cover:** tinted (`soft`) header; bunting row (13 pennants alternating accent and ink); optional round photo; headline (default "Kamu diundang"); names serif 5xl / 7xl on one line where they fit; date tile card (weekday, day in accent serif 6xl, month and year) with time and venue chips; guest chip ("Untuk" + name in `<bdi>`).
- **Bands:** events (2-column grid from 640 px, each with a small date tile), greeting, quote, story (accent dots), gallery, streaming, gifts, RSVP, guestbook; each band title is a serif 4xl / 5xl with an accent bar.
- **Type:** serif display, sans body; larger body copy (base) than the wedding families.
- **Palette:** tokens only; photo framed as a round avatar, never behind text.
- **Motion:** level 1 (`inv-rise` on headline, date tile row, guest chip), off under reduced motion.

## Controlled variation
Palette, avatar photo, sections on / off, name length, event count. Fixed: bunting, band rhythm, events-first order.

## Assets
None (CSS ornament only).

## Validation
As Gapura; birthday fixture (`review-riang-birthday`) in addition to the wedding fixtures.

## Review
s16 (2026-11-04), `../../invitation-research/_handoff/family-review-20261104-s16.md`: full, photo, corporate, birthday, sparse (RTL), expired and dark (hostile) at 360 / 390 / 412 / 1280 + 390 reduced motion; hostile, RTL, emoji and opaque-link guests at 360.
- **Technical:** PASS for layout (0 px overflow on every shot; s15 F2 organiser, F5 centred chips and F8 single-event width verified). Rendered contrast: `contrast-sweep-20261104-s16.md`.
- **Visual:** keep for celebrations. Bunting, the date tile and centred chips read playful for birthdays and thanksgivings; on the corporate conference fixture the bunting is off-tone (S16-X3), although everything renders correctly.

## Open
- S16-X3: the editor names Riang's intended use but does not flag a formal event; a mismatch hint is a product follow-up, not a layout change.
- s15 F7 (shared RSVP name input clips long names) belongs to B-027.
