<!-- SUMMARY (first 7 lines — greppable) -->
# 00-setup — environment, clone, baseline
> WHAT: How the research workspace was created, what the baseline commands returned, and environment caveats.
> STATUS: DONE (Step 0)
> OWNER: research agent
> DEPS: _rea-playbook.md, SKILLS-LOCK.md, scripts/
> GREP: setup, clone, baseline, typecheck, build, env, postgres, clerk
> UPDATED: 2026-10-29

## Date check
`date -u` → `Wed Oct 28 21:58:46 UTC 2026` = **2026-10-29 04:58 WIB** (UTC+7). All observations are dated in WIB.

## Clone
| Item | Value |
|---|---|
| Source | `https://github.com/faznode/invitesion.git` (public, MIT, default branch `main`; GitHub created 2026-10-28T20:43Z) |
| Branch cloned | `develop` → local branch **`agent/research-harness`** |
| Base commit | **`22ed99ec04274d7aaf2ce4a554cbf971486d3d14`** — "chore: daftarkan migrasi 0008 (journal + snapshot) untuk widen templates.category" (2026-07-28 03:30 +0700, author Whyme) |
| Other remote branches | `main`, `staging` (same SHA as develop), `feat/template-catalog` (`8020fa7412`) |
| Size | 216 tracked files, 3.3 MB working tree, 1.7 MB `.git` |
| History note | Commit dates are July 2026 although the GitHub repo was created on 2026-10-28; merge commits reference `nodexone/feat/template-catalog`, so history was imported from an earlier `nodexone` repo [OBSERVED git log] |

Workspace layout in this sandbox: the working tree is the v0 project directory; git metadata lives outside it (`core.worktree` pointing at the project) so the hosting platform never sees a nested repository and can never push it. Local commits are allowed; `git push` is never run (R7).

## Stack detection [OBSERVED package.json, lockfile, configs]
| Layer | Detected |
|---|---|
| Package manager | pnpm (lockfile v9; install ran with pnpm 10.34.3) |
| Framework | Next.js **15.6.0-canary.59** (App Router, Turbopack dev), React 19.1.4, TypeScript 5.8 |
| Styling | Tailwind CSS 4.1.7 + Radix/shadcn primitives + CSS Modules for marketing/catalog pages, `tokens.css` |
| Data | PostgreSQL via `postgres` (postgres.js) + Drizzle ORM 0.43 / drizzle-kit 0.31; 9 migrations (0000–0008) |
| Auth | Clerk (`@clerk/nextjs` 7) with a local `users` table mapped by `clerk_user_id`; roles in DB |
| Payments | QRIS (self-built EMVCo payload + provider adapter) and Stripe (REST + own signature check), no SDKs |
| Storage | Local disk (dev) or S3-compatible with a hand-written SigV4 signer |
| Tests | `tsx --test tests/*.test.ts` (node:test) |
| Run / build / test | `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm typecheck` · `pnpm test` · `pnpm verify` |

## Baseline (no product changes)
| Command | Result | Time |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | ✔ (a stale scaffold `node_modules` had to be purged non-interactively) | 14 s |
| `pnpm typecheck` | ✔ exit 0 | 9 s |
| `pnpm test` | ✔ 49 passed, 0 failed | 1 s |
| `pnpm build` (no env) | ✘ exit 1 — `EnvError: POSTGRES_URL is not set` while collecting page data for `/dashboard/invitations/[id]/analytics` (route evaluates the DB client at build time) | 31 s |
| `pnpm build` with local Postgres 16 + placeholder Clerk keys | see `01-codebase-audit/quality-audit.md` §Run log | — |

Failures were recorded, not fixed (scope guard).

## Local run environment (audit only)
- PostgreSQL 16.15 from AL2023 packages, cluster in the sandbox, port 5433, trust auth on a Unix socket + localhost; database `invitesion`.
- `pnpm db:migrate` ✔ (all migrations applied), `pnpm db:seed:templates` ✔ (`created=64`), fixture seed `_tools/setup/seed-local-demo.ts` ✔ (2 invitations, 5 stress-test guests each, 2 wishes).
- Clerk: no real keys exist for this sandbox. A syntactically valid placeholder pair is passed on the command line only (never written to a file). Effect: public pages render; sign-in/dashboard flows are untestable here → [UNKNOWN] for live auth behaviour.

## Tools installed (outside the repo)
Node 24.22.2 (for REA), REA 6.8.0, Chrome for Testing 156.0.8078.4 + system libraries, Lighthouse 12.8.2, PostgreSQL 16.15, skills CLI 1.7.4. Versions and commands: `_rea-playbook.md` §1.

## Secrets hygiene (R6)
`.gitignore` rule for `_private/` was added and verified with `git check-ignore` **before** anything was written there. Scanner: `_tools/safety/secrets-scan.py` (tree + full history). Result: 2 low-risk findings (a local-dev credential in an example file, a test-fixture signing secret); no cloud keys, private keys, live Stripe/Clerk keys, tokens or JWTs. Details (file/line/fingerprint, no values): `_private/secrets-report.md`.

## Skills (Step 0.3)
20 third-party skills vetted and installed project-scoped for Claude Code + Codex; 3 modified for security. See `SKILLS-LOCK.md`, `docs/skills-registry.md`, `skill-vetting-report.md`, catalog snapshot `skill-issue-catalog-2026-10-29.json`.
