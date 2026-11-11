# archive/

Retired files that are no longer part of the product but are kept for reference and provenance. Nothing in the app, its build, its tests or the research tooling imports or runs anything from here; archived files may cross-reference other archived files. First moves in session 06 (2026-10-29), redoing the session-05 reorganisation that never reached the branch (`invitation-research/_open-questions.md` Q-D15/Q-D16).

Before a file is moved here it is checked for: code imports, build / test / tooling / CI use, links from active documents, support for a current research conclusion, need for reproducibility, migrations, licensing or audit, and whether a real replacement exists. Contents are moved unchanged (byte-identical); secrets, customer data, prompts, raw agent transcripts, dependencies, build output and caches never belong here.

| Archived file | Original path | Replacement | Archived | Why archived · references |
|---|---|---|---|---|
| `README-nextjs-saas-starter.md` | root `README.md` | `README.md` (project README) | 2026-10-29 (s06) | Boilerplate of the `nextjs/saas-starter` template (Stripe subscriptions, teams); describes a different product |
| `tokens-old-brand.css` | root `tokens.css` | `app/globals.css` (live tokens) | 2026-10-29 (s06) | Design tokens of an earlier "Vienne" brand; no page or stylesheet ever imported it. Referenced as history in `invitation-research/01-codebase-audit/style-observations.md` |
| `make-handoff-zips.sh` | `invitation-research/_tools/ops/make-handoff-zips.sh` | `invitation-research/_tools/ops/make-handoff-patch.sh` (patch + manifest) | 2026-11-04 (s10) | Built the per-phase handoff ZIPs; a later owner revision removed the ZIP requirement (`invitation-research/_handoff/prompt-map.md` header, acceptance-matrix row RQ-ORIG-04). No script, package command, CI or active document calls it; its usage comment still shows the original path. The `.gitignore` entries for the two ZIP names stay so a stray archive is never committed |
