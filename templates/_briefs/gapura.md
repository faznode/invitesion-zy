<!-- SUMMARY (first 7 lines — greppable) -->
# gapura.md — design brief (as built): Gapura, symmetric and ceremonial
> WHAT: As-built brief for the Gapura family (B-030 slice 1, code s14), written in s15 from `components/invitation/families/gapura.tsx`; review state from the s16 rendered review (the s15 review record was never saved).
> STATUS: reviewed (s16): keep, revise photo treatment and phone rhythm. Revision coded s17 (E-027); its rendered check: §Open. Verdict in §Review.
> OWNER: template-system workstream
> DEPS: README.md, ../../components/invitation/families/gapura.tsx, ../../lib/invitation/families.ts, ../../invitation-research/_handoff/family-review-20261104-s16.md
> GREP: Gapura, gate, arch, ceremonial, wedding, symmetric
> UPDATED: 2026-11-04

## Identity
`gapura` · Gapura · status **revise** (reviewed s16; keep the family, revise two findings).

## Use case
Weddings with a ceremonial tone (akad, pemberkatan, resepsi). Renders every event type.

## Problem
Every invitation used one centred layout; choosing a template changed the palette only, so templates looked alike to guests (`01-codebase-audit/style-observations.md` §7, "Palette-only templates").

## Principles (sources)
1. **Frame, then name.** A threshold shape around the couple's names gives the cover a sense of entering, using only CSS (style-observations §8: ornament as code, authored in-repo).
2. **Repeat one motif.** The same arch carries events, gifts and forms, so sections belong together without extra ornament (to be judged on renders).
3. **Names paint first.** No entrance animation on the names; ornaments and date rise in once (manifest motion level 1, `inv-rise`).

## Recipe
- **Cover:** ≥ 90 vh from 640 px, centred; on a phone the cover ends with its content, so the first section follows at the section rhythm (S16-X2, s17). Double gate arch (outer line border, inner accent border, both `rounded-t-full`); an optional cover photo fills the inner arch's window at full strength (square, clipped by the arch) above the text, never behind it (S16-X1, s17); diamond, headline, names (serif 4xl / 5xl, ampersand between two short rules), date. Guest greeting below the arch on `soft`.
- **Sections:** centred, max-w-lg; each opens with a diamond and a serif title in accent. Events, gifts and forms sit in arch-topped cards (`rounded-t-[3rem]`); the story is a centred vertical sequence; gallery images are arch-topped (3 : 4).
- **Type:** serif for names and titles, sans for facts and forms.
- **Palette:** tokens only; accent for titles, ornaments and small labels. No cover text meets the photo since s17, so the cover needs no `coverText()` chips.
- **Motion:** level 1 (`inv-rise` on diamond, headline, date, guest block), off under reduced motion.

## Controlled variation
Palette, cover photo, which sections are on, name length, event count. Fixed: symmetry, the arch motif, centred alignment.

## Assets
None (CSS ornament only).

## Validation
`pnpm test` (rendered tests over every family), `page-review.ts` (360 / 390 / 412 / 1280 + reduced motion), stress guests, `rendered-contrast.ts`, text-over-photo bound in `tests/palette-contrast.test.ts`.

## Review
s16 (2026-11-04), `../../invitation-research/_handoff/family-review-20261104-s16.md`: full, photo, corporate, birthday, sparse (RTL), expired and dark (hostile) at 360 / 390 / 412 / 1280 + 390 reduced motion; hostile, RTL, emoji and opaque-link guests at 360.
- **Technical:** PASS for layout (0 px overflow on every shot; s15 F2 organiser and F4 venue-pin fixes verified). Rendered contrast: `contrast-sweep-20261104-s16.md`.
- **Visual:** keep, revise. The arch reads ceremonial and suits weddings; on the corporate fixture it reads ceremonial rather than business-formal. S16-X1: the cover photo at 20 % opacity behind the text becomes a grey veil with a high-contrast photo. S16-X2: about 180 px of empty page between the guest card and the opening copy at 360 px.

## Open
- S16-X1: frame the photo inside the arch at full strength instead of fading it behind text (keep names in ink and the chips only where text still meets the photo); re-render with a low-contrast photo too. **Coded s17 (E-027):** the photo fills the gate's window above the text, no chips. Rendered check with the high- and low-contrast covers: session 17 record; open until then.
- S16-X2: tighten the gap after the cover on phones to the section rhythm. **Coded s17 (E-027):** full height and bottom padding only from 640 px. Measured gap at 360 px: session 17 record; open until then.
- s15 F7 (shared RSVP name input clips long names) belongs to B-027.
