<!-- SUMMARY (first 7 lines — greppable) -->
# templates/_briefs — structured design briefs for guest-page design families (B-030)
> WHAT: One brief per design family: the problem it answers, the principles it draws on (with evidence IDs), its recipe, controlled variation, assets, review state and open findings. Briefs guide generation; renders and reviews decide.
> STATUS: ACTIVE (s16, 2026-11-04). Gapura, Kartu, Riang written as-built from code (s15); Lontar written as a brief first and then built (s15). All four reviewed with renders in s16 (the s15 review record was never saved).
> OWNER: template-system workstream (Operator), reviewed under ADR-O09
> DEPS: ../../.agents/skills/invitesion-template-harness/SKILL.md, ../../lib/invitation/families.ts, ../../invitation-research/_handoff/family-review-20261104-s16.md
> GREP: brief, design family, recipe, variation, taste, review, Gapura, Kartu, Riang, Lontar
> UPDATED: 2026-11-04

## Why briefs
Invitesion has no established taste yet. Gapura, Kartu and Riang are first experiments, not a house style. A brief makes each experiment explicit enough to be critiqued against its own intent, compared with the others, and repeated by a later session without guessing. A family is kept, revised or retired on rendered evidence, never because a brief exists.

## Format (every field required; write "none" rather than omit)
| Field | Content |
|---|---|
| Identity | `id` (lowercase, = `FAMILY_IDS` entry), name, status: `brief` → `prototype` → `reviewed` → `kept` / `revise` / `retired` |
| Use case | Event types and audience it is designed around; every family must still render every event type |
| Problem | What guests or hosts lack today, with evidence IDs (QA-, G-, S-, C-, style-observations) |
| Principles | 3–5 transferable principles, each with its source (our renders, research evidence ID). Never a competitor's layout, component combination, asset or wording; no claim about a site we have not observed |
| Recipe | Composition (cover, section rhythm, alignment), type scale and roles (two self-hosted fonts only), palette roles (tokens only, B-016), ornament (CSS only, decorative = `aria-hidden`), imagery rule (text never straight over a photo except names in ink; small text via `coverText()`), motion level 0–1 with the reduced-motion behaviour |
| Controlled variation | What a host may vary without breaking the family (palette, cover photo, sections on / off, names length, event count) and what stays fixed |
| Assets | Every asset with provenance and licence; "none" is a valid answer |
| Validation | The checks it must pass: `pnpm test` (rendered tests iterate every family automatically), `page-review.ts` at 360 / 390 / 412 / 1280 + reduced motion, stress guests, `rendered-contrast.ts`, legacy unchanged |
| Review | Date, viewports and fixtures actually inspected, findings with IDs, verdict. Technical PASS and visual approval are separate lines |
| Open | Findings not yet fixed, with the next action |

## Index
| Brief | Use case | Status |
|---|---|---|
| [gapura.md](gapura.md) | Weddings, ceremonial | revise (s16: photo treatment, phone rhythm) |
| [kartu.md](kartu.md) | Weddings, modern stationery | kept (s16) |
| [riang.md](riang.md) | Birthdays, thanksgivings, aqiqah, khitanan, company celebrations | kept for celebrations (s16) |
| [lontar.md](lontar.md) | Formal and corporate events, programme-led | kept for formal / corporate (s16) |

Review record: `../../invitation-research/_handoff/family-review-20261104-s16.md`. Rendered contrast: `../../invitation-research/_handoff/contrast-sweep-20261104-s16.md`.
