<!-- SUMMARY (first 7 lines — greppable) -->
# SKILLS-LOCK.md — vetted third-party agent skills
> WHAT: Every third-party skill installed in `.agents/skills/` (Claude Code reads them via `.claude/skills/` symlinks): source, pinned commit, license, why, vetting result, local modifications.
> STATUS: ACTIVE (research-harness run)
> OWNER: Architect (vetting by the research agent, 2026-10-29 WIB)
> DEPS: AGENTS.md, skills-lock.json (CLI state), docs/skills-registry.md, invitation-research/00-setup/skill-vetting-report.md
> GREP: skills, lock, vetting, license, sha, supply-chain
> UPDATED: 2026-10-29

## Rules

1. **Precedence:** `AGENTS.md` > custom `invitesion-*` skills > third-party skills. No third-party skill may override repository rules (no copying competitors, no git push, no global config edits).
2. **Do not run `npx skills update` blindly.** Three skills carry local security modifications (marked MODIFIED below); an update silently restores upstream behaviour. Re-run the vetting protocol, then update this file in the same change.
3. **Active set cap:** 20 third-party skills. Everything else lives in `docs/skills-registry.md` and is installed on demand.
4. **Install command used** (project scope, non-interactive, both agent types used in this repo):
   `npx -y skills@1.7.4 add <owner/repo> --skill <name> -a claude-code codex -y`
   The CLI writes the canonical copy to `.agents/skills/<name>` (Codex/universal) and a symlink in `.claude/skills/<name>` (Claude Code), and records upstream content hashes in `skills-lock.json`.

## Vetting protocol (applied to every skill below)

1. Open the source repo; confirm license, recent maintenance, and that the catalog link points at the files actually installed. Catalog entries marked "Unverified link" on skill-issue.in were treated as untrusted until checked here.
2. Static scan of every shipped file (`invitation-research/_tools/setup/vet-skills.py`) for: code download/execution, environment/secret access, global agent-config edits, hidden unicode / instruction-override text, large encoded blobs. Every flagged line was then read in context, together with the full `SKILL.md`.
3. Strip or reject anything that downloads and runs remote code without a pin, reads or sends env vars/secrets, edits global agent config, disables safety checks, or hides instructions.
4. Pin the upstream commit; verify the installed files are byte-identical to the vetted clone (all 20 matched before modifications); record post-modification hashes.

Full per-skill evidence (file counts, flagged lines, domains referenced): `invitation-research/00-setup/skill-vetting-report.md`.

## Core set (20 active)

| # | Skill (installed name) | Source repo @ commit | Upstream date | License | Why this mission needs it | Vetting result | Content hash (sha256 of sorted file hashes, 16) |
|---|---|---|---|---|---|---|---|
| 1 | `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill @ `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03` | 2026-10-26 | MIT | Searchable style/palette/font-pairing data incl. Google Font license table (feeds the LICENSE gate) | APPROVED. Python search scripts read local CSVs only; `subprocess` appears only in its own tests | `6020955ee30385ed` |
| 2 | `hallmark` | nutlope/hallmark @ `8f6969f8922caabde9de1784959eae11ddf68073` | 2026-10-28 | MIT | Deliberate art direction and "anti-slop" lint for template design | **MODIFIED** (see below) | `6ac4745d5f858c38` |
| 3 | `frontend-design` | anthropics/skills @ `ca45fc496a3436251f191354091d557da31c15b5` | 2026-10-28 | Apache-2.0 (skill `LICENSE.txt`) | Distinctive, non-generic UI direction | APPROVED. Instructions only | `53e4dd2ca42141e3` |
| 4 | `design-taste-frontend` | Leonxlnx/taste-skill @ `12af471f627f866411b4bd785b19646d3672784c` | 2026-10-25 | MIT | Taste rules + "redesign existing projects" guidance for upgrading current templates | APPROVED with note: `scripts/draw.mjs` keeps history in `~/.taste-skill/history.json` (user home, not agent config); `scripts/lib/cdp.mjs` drives a local Chrome only | `d4e3421de987f471` |
| 5 | `web-design-guidelines` | vercel-labs/agent-skills @ `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | 2026-10-27 | MIT (repo README; no LICENSE file) | Web Interface Guidelines audit (a11y, forms, UX) | **MODIFIED** (see below) | `f02f0c47a8c9cf87` |
| 6 | `vercel-react-best-practices` | vercel-labs/agent-skills @ `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | 2026-10-27 | MIT (repo README) | Repo is Next.js 15 App Router + React 19: waterfalls, bundle size, re-renders | APPROVED. Markdown rules only | `76ebdb746bc7826a` |
| 7 | `accessibility-compliance` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | 2026-10-17 | MIT | WCAG 2.2 / ARIA for invitation pages and the editor | APPROVED | `72a3a3ec62838913` |
| 8 | `web-quality-audit` | addyosmani/web-quality-skills @ `afa8da942115f2961fdbfa80807ea0b232ff6c00` | 2026-08-24 | MIT | Lighthouse-style quality audit used by the template QA gates | APPROVED | `a5d16ad62b7f63c5` |
| 9 | `core-web-vitals` | addyosmani/web-quality-skills @ `afa8da942115f2961fdbfa80807ea0b232ff6c00` | 2026-08-24 | MIT | LCP/CLS/INP fixes; "tiny first load" is a planned brand promise | APPROVED | `8ec0147efd9cc7c0` |
| 10 | `threejs-fundamentals` | CloudAI-X/threejs-skills @ `0e181866f095b5f06d005133876e926515390d95` | 2026-10-19 | MIT | Signature-tier 3D cover scenes | APPROVED | `d01b28208ada8a07` |
| 11 | `threejs-performance` | CloudAI-X/threejs-skills @ `0e181866f095b5f06d005133876e926515390d95` | 2026-10-19 | MIT | 3D on mid/low-end Android with fallbacks | APPROVED | `d763384c4b3fb6f6` |
| 12 | `api-design-principles` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | 2026-10-17 | MIT | Rust strangler-fig API contract (Phase 8) | APPROVED | `2567f689ec2f007c` |
| 13 | `postgresql-table-design` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | 2026-10-17 | MIT | Schema review for guests/RSVP/wishes/gifts (Postgres + Drizzle today) | APPROVED | `c286d73910256398` |
| 14 | `auth-implementation-patterns` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | 2026-10-17 | MIT | Multi-tenant authz, guest-link credentials | APPROVED. Catalog marked it "Unverified link"; link verified here. `process.env.*` appears only inside illustrative code samples | `7ced4b870e9b546f` |
| 15 | `hyperframes` | heygen-com/hyperframes @ `81959201f0acb2e265e4d8c30daa89ffc1c9607d` | 2026-10-28 | Apache-2.0 | Pre-rendered invitation intro videos and share cards (HTML → video) | APPROVED with note: `scripts/plugin-cli.mjs` runs `npx --yes hyperframes@<pinned version>`; renders need local Chrome + ffmpeg. Never run renders in CI without review | `bce202a9af468762` |
| 16 | `gsap-core` | greensock/gsap-skills @ `aed9cfd3277740755f6bfc1155c7aa645403b760` | 2026-04-21 | MIT (skill text) | Reading competitor GSAP timelines; authoring pre-built template motion | APPROVED with **license warning**: the GSAP *library* is free but proprietary; its no-charge license restricts use in visual animation builders that compete with Webflow. Invitesion must not expose GSAP-powered motion *authoring* to end users without written consent. Default template motion uses CSS/WAAPI (see `invitesion-motion-system`) | `c6cac6cd84472022` |
| 17 | `animate` | emilkowalski/skills @ `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | 2026-10-28 | MIT | Building UI motion to a high craft bar | APPROVED | `432c98d247afabc8` |
| 18 | `review-animations` | emilkowalski/skills @ `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | 2026-10-28 | MIT | Motion review step of the template QA loop | APPROVED | `82d3b3e4eb443dff` |
| 19 | `research` | Weizhena/Deep-Research-skills @ `6ce38f60e3f8b22502c29873f96503a4e0c5addb` (`skills/research-en/research`) | 2026-08-23 | MIT | Structured outline → items → fields research used for competitor discovery | APPROVED. Ships `validate_json.py` (local JSON validation only) | `9f987fe56a054b2b` |
| 20 | `reverse-engineer-anything` | morluto/rea @ `21b192706d2d273baa9dd9de29c2afb77bd5955e` | 2026-10-29 | MIT | REA routing/evidence discipline for competitor teardowns | **MODIFIED** (see below) | `978ca757f72a1ebd` |

## Local modifications (MODIFIED skills)

| Skill | Change | Reason (protocol step 3) |
|---|---|---|
| `hallmark` | Deleted `scripts/install-hook.mjs`, `scripts/install.mjs`, `scripts/lint-hook.mjs`; annotated `references/flow.md` | They write agent configuration (`~/.claude/settings.json` or `.claude/settings.json` PostToolUse hook) and probe home-directory agent installs |
| `hallmark` | Deleted `scripts/imagegen.mjs`; disabled `references/comp.md`; annotated `references/flow.md` | Reads `TOGETHER_API_KEY` from the environment and sends prompts to `api.together.xyz` |
| `web-design-guidelines` | `SKILL.md` now reads `references/web-interface-guidelines.md`, vendored from vercel-labs/web-interface-guidelines @ `434b7f91364665f2f733b310ec54809bf8f37937` (MIT) | Upstream fetched live instructions from an unpinned `main` branch on every run (remote-instruction / supply-chain vector) |
| `reverse-engineer-anything` | `npx -y rea-agents@latest` → `npx -y rea-agents@6.8.0` (2 places in `SKILL.md`) | Unpinned remote code execution; version pinned to the one documented in `invitation-research/_rea-playbook.md` |

## Considered and not activated

| Skill | Decision | Reason |
|---|---|---|
| `last30days` (mvanhorn/last30days-skill @ `7efc0ef764765ed9ceff5ce1204462b35b89d680`, MIT) | Registry only, **not installed** | 17 MB, 132 scripts, needs third-party API keys and reads many env vars; social-listening scope can be covered by manual, dated searches. Re-vet before any use |
| `sql-optimization-patterns`, `gsap-scrolltrigger`, `emil-design-eng` | Registry (vetted clean, same pinned commits as their siblings above) | Kept out to respect the 20-skill cap; install on demand |
| Rust/Axum/Tokio skills | None found in the catalog (searched names/descriptions for rust, axum, tokio on 2026-10-29) | Custom `invitesion-rust-backend` skill is authored instead (Phase 7) |

## Footprint

`.agents/skills/` is ~16 MB (hallmark 7.2 MB incl. 56 small reference images, ui-ux-pro-max 3.7 MB of CSV/JSON data, taste 2.5 MB, hyperframes 1.3 MB). If the owner prefers a lighter repo, keep this file + `skills-lock.json` and restore with `npx skills experimental_install`, then re-apply the modifications above.
