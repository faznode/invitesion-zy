<!-- SUMMARY (first 7 lines — greppable) -->
# docs/skills-registry.md — optional skills (install on demand)
> WHAT: Skills that are useful for Invitesion but NOT active, with install command, pinned source, license and a "use when" note.
> STATUS: ACTIVE
> OWNER: Architect
> DEPS: SKILLS-LOCK.md (active set + vetting protocol), invitation-research/00-setup/skill-issue-catalog-2026-10-29.json
> GREP: skills, registry, optional, install, motion, research, 3d
> UPDATED: 2026-10-29

**Before installing anything here:** run the vetting protocol in `SKILLS-LOCK.md`, pin the commit, add a row there, and keep the active third-party set at 20 or fewer (remove one if needed). "Vetted" below means the exact pinned commit already passed the static scan + manual review in this run; "Not vetted" means only the source, license and pin were checked.

Install shape (project scope, both agents): `npx -y skills@1.7.4 add <source> --skill <name> -a claude-code codex -y`

## Design

| Skill | Source @ pin | License | Status | Use when… |
|---|---|---|---|---|
| `emil-design-eng` | emilkowalski/skills @ `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | MIT | Vetted | Polishing editor/dashboard micro-details and component feel |
| `make-interfaces-feel-better` | jakubkrehel/make-interfaces-feel-better @ `35545ea1512ad59fa463e6b1f95ca9c052981fe6` | MIT | Not vetted | Tightening interaction feel of RSVP/wishes/gift UI |
| `mono-color-skill` | yanliudesign/mono-color-skill @ `c8ff70597ddedcd65f21a0b528f6a70c35690b0a` | MIT | Not vetted | One-ink print/keepsake cards and souvenir PDFs |
| `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui` | Leonxlnx/taste-skill (catalog links point to skillselion.com mirrors; not present as separate skills in the repo at `12af471f62`) | MIT | Covered by `design-taste-frontend` | Style references; brutalist only for non-wedding niches (launch, tech events) |
| `design-system-patterns` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | MIT | Not vetted (catalog: unverified link; path exists at this commit) | Token architecture work on the renderer |

## Frontend

| Skill | Source @ pin | License | Status | Use when… |
|---|---|---|---|---|
| `tailwind-design-system` | wshobson/agents @ `0874a27b17` | MIT | Not vetted | Moving the renderer's hard-coded palette classes to Tailwind v4 tokens |
| `typescript-advanced-types` | wshobson/agents @ `0874a27b17` | MIT | Not vetted | Typing the template manifest/section registry |
| `nextjs-app-router-patterns` | wshobson/agents @ `0874a27b17` | MIT | Not vetted (catalog: unverified link) | ISR/caching changes on `/i/[slug]` |
| `composition-patterns` | vercel-labs/agent-skills @ `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | MIT (README) | Not vetted | Refactoring the monolithic public renderer into section components |
| `modern-web-guidance` | GoogleChrome/modern-web-guidance @ `4f2b13e25c5815b3f080ca0d983e828d96561a0f` | Apache-2.0 | Not vetted | Browser capability checks (View Transitions, scroll-driven animations) |
| `threejs-react-three-fiber`, `threejs-animation`, `threejs-loaders`, `threejs-shaders` | CloudAI-X/threejs-skills @ `0e181866f095b5f06d005133876e926515390d95` | MIT | Not vetted (siblings of vetted skills) | Signature-tier 3D scenes beyond the fundamentals |

## Backend

| Skill | Source @ pin | License | Status | Use when… |
|---|---|---|---|---|
| `sql-optimization-patterns` | wshobson/agents @ `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | MIT | Vetted | EXPLAIN-driven tuning of guest/RSVP/wishes queries |
| `openapi-spec-generation` | wshobson/agents @ `0874a27b17` | MIT | Not vetted (catalog: unverified link) | Generating the API-compat contract for the Rust strangler layer |
| `error-handling-patterns` | wshobson/agents @ `0874a27b17` | MIT | Not vetted (catalog: unverified link) | Result-type error design in the Rust service |
| `architecture-patterns` | wshobson/agents @ `0874a27b17` | MIT | Not vetted | Hexagonal boundaries for the Rust service |
| `microservices-patterns` | wshobson/agents @ `0874a27b17` | MIT | Not vetted (use with caution) | Only if the strangler grows past 3 services |
| `stripe-integration` | wshobson/agents @ `0874a27b17` | MIT | Not vetted | Stripe rail changes (international payments) |

## Motion, video, 3D

| Skill | Source @ pin | License | Status | Use when… |
|---|---|---|---|---|
| `gsap-scrolltrigger` | greensock/gsap-skills @ `aed9cfd3277740755f6bfc1155c7aa645403b760` | MIT (skill text; GSAP library license restricts visual-builder use) | Vetted | Scroll-scrubbed journeys in pre-built signature templates only |
| `animation-vocabulary`, `improve-animations`, `find-animation-opportunities` | emilkowalski/skills @ `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | MIT | Not vetted (siblings of vetted skills) | Translating "make it more elegant" briefs into motion specs; motion audits |
| `scroll-world` | oso95/scroll-world @ `71cc36d3bb150248ae36a2c552f9cbf88802a79c` | MIT | Not vetted | Camera-flight 3D scroll journeys (signature tier) |
| `design-motion-principles` | kylezantos/design-motion-principles @ `4a9ca879f24a361f4dca4174fe2da0f67b5ddee3` | MIT | Not vetted | Motion audit rubric for the Beyond score |
| `lottie` | diffusionstudio/lottie @ `3c72912fad543897f90045ed4d355813837927fc` | MIT | Not vetted | Lightweight vector ornaments (ketupat, wayang, floral) instead of video |
| `oil-motion` | oil-oil/oil-motion @ `07e31f2265f80caa8f2c1df825d85ac24a46307c` | MIT | Not vetted | Pointer/drag/touch-driven motion on the cover |
| `remotion-best-practices` | remotion-dev/skills @ `30d4553ecd46fbc5212fd0ff006ae43af522158b` | NONE declared in repo metadata (Remotion itself has a company license) | Not vetted | Alternative renderer to HyperFrames; check Remotion licensing first |
| `ffmpeg-skill` | kajisho5/ffmpeg-skill @ `1ae1bdf1ca0adbb1606fbca493948b1bbb2f83ff` | MIT | Not vetted | Compressing intro videos / WhatsApp status cuts |
| `video-shotcraft` | Vincentwei1021/video-shotcraft @ `5a2e98daade313c4f376120f38427eb19a108e8c` | Apache-2.0 | Not vetted | Cinematic shot recipes for intro videos |
| `hyperframes-animation` | heygen-com/hyperframes (catalog points to a skillselion mirror; no such skill dir in the repo at `81959201f0`) | Apache-2.0 | Not found | Use `hyperframes` (active) instead |

## Research

| Skill | Source @ pin | License | Status | Use when… |
|---|---|---|---|---|
| `last30days` | mvanhorn/last30days-skill @ `7efc0ef764765ed9ceff5ce1204462b35b89d680` | MIT | Vetted: **rejected for activation** (API keys, 132 scripts, env access) | Only in an isolated sandbox with throwaway keys, for social listening on competitor complaints |
| `research-deep`, `research-report`, `research-add-items`, `research-add-fields` | Weizhena/Deep-Research-skills @ `6ce38f60e3f8b22502c29873f96503a4e0c5addb` (`skills/research-en/…`) | MIT | Not vetted (siblings of vetted `research`) | Multi-agent deep dives per competitor item |
| `x-research-skill` | rohunvora/x-research-skill @ `623cca7f41f2fb859bdd01dd7328b7b15da110ed` | NONE declared | Not vetted | X/Twitter complaint mining (needs API access) |
| `anysearch-skill` | anysearch-ai/anysearch-skill @ `9b91ee215164de60d61c7d63789c891a1948b039` | Apache-2.0 | Not vetted | Unified search; obey R8 politeness |
| `autoresearch` | uditgoenka/autoresearch @ `050e30dc4ba0974b03f2873111b9901ec3211390` | MIT | Not vetted | Iterative research loops |
| `just-scrape`, `firecrawl-build-scrape` | catalog links to skillselion.com mirrors only (no install command) | ? | Not vetted | Avoid for competitor sites; REA browser observation is the sanctioned path (R8) |
