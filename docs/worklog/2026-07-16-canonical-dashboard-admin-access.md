<!-- SUMMARY (first 7 lines - greppable) -->
# worklog - 2026-07-16 - canonical dashboard and private admin access
> WHAT: Customer uses canonical dashboard; admin is non-discoverable and authorized server-side.
> STATUS: DONE
> OWNER: Architect
> DEPS: middleware.ts, lib/auth/admin-access.ts, .env.example
> GREP: dashboard, admin, private entry, session, 404
> UPDATED: 2026-07-16

## Changes
- Customer canonical routes: `/dashboard`, `/dashboard/invitations`, `/dashboard/guests`, `/dashboard/templates`.
- Legacy `/dashboard/customer/*` returns 404.
- Admin routes live under `/admin/[entry]`; `[entry]` must match `ADMIN_ENTRY_PATH` from environment.
- Admin requires session role `ADMIN`; `ADMIN_ALLOWED_EMAILS` can optionally restrict trusted admins further.
- `/admin` and unknown admin entries return 404; valid private entry redirects unauthenticated users to sign-in.
- Removed hardcoded default admin seed credentials. Seed now requires `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`.

## Verification
- `rm -rf .next && pnpm build`: PASS.
- Production HTTP check: `/dashboard` -> 307 sign-in; `/dashboard/customer` -> 404; `/admin` and wrong entry -> 404; valid entry -> 307 sign-in; private login -> 200 and no sign-up UI.

## Follow-up
- Next 15 warns that `middleware.ts` is deprecated; migrate to `proxy.ts` separately.
- Worktree has no `.git`, so no branch or commit was made.
