// G-052 (D-067): reseller workspaces. The workspace section of `contracts/vectors/member-roles.json` against the
// TypeScript rules (the Rust writers run the same file: `services/api/tests/member_roles_vectors.rs`), the staff join
// cookie's attributes, the pure helpers, and source guards for what the database acceptance (`scripts/verify-workspaces.ts`
// in the database and rust jobs, `services/api/tests/workspace_access_database.rs`) proves end to end: every workspace
// entry sits behind FLAG_WORKSPACES and refuses administrators, one module writes each table, no product path writes the
// credit ledger yet, both writers carry the same workspace clause, and migration 0030 only adds.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;

// `app/gabung/ruang/session.ts` reads and writes the request's cookies through next/headers: a jar that records writes.
const cookieWrites: { name: string; value: string; options: Record<string, unknown> }[] = [];
const jar = new Map<string, string>();
let forwardedProto: string | null = 'https';
const headersModule = require.resolve('next/headers');
require.cache[headersModule] = {
  id: headersModule,
  filename: headersModule,
  loaded: true,
  exports: {
    headers: async () => new Headers(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        cookieWrites.push({ name, value, options });
        if (options.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      },
    }),
  },
} as unknown as NodeJS.Module;

const rules = () => require('../lib/invitation/members') as typeof import('../lib/invitation/members');
const flags = () => require('../lib/flags') as typeof import('../lib/flags');
const staffSession = () => require('../app/gabung/ruang/session') as typeof import('../app/gabung/ruang/session');

const ROOT = process.cwd();
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const vectors = JSON.parse(source('contracts/vectors/member-roles.json'));
const codeUnder = (dir: string) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file)).map((file) => join(dir, file).split('\\').join('/'));

test('vectors: the workspace roles, what each carries, the writers\' workspace clause and the ceiling', () => {
  const { WORKSPACE_ROLES, WORKSPACE_ROLE_AS_MEMBER, workspaceRolesFor, MAX_WORKSPACE_ROWS } = rules();
  assert.deepEqual(vectors.workspace.roles, [...WORKSPACE_ROLES]);
  assert.deepEqual(vectors.workspace.asMember, WORKSPACE_ROLE_AS_MEMBER);
  assert.deepEqual(vectors.workspace.limits, { maxWorkspaceRows: MAX_WORKSPACE_ROWS });
  assert.deepEqual(
    vectors.workspace.writers,
    ['checkin', 'guests', 'wishes'].map((capability) => ({ capability, workspaceRoles: [...workspaceRolesFor(capability as never)] })),
  );
  // Stated once more in words: the desk has check-in only; the manager the co-host's three writer capabilities.
  assert.deepEqual(vectors.workspace.writers, [
    { capability: 'checkin', workspaceRoles: ['manager', 'desk'] },
    { capability: 'guests', workspaceRoles: ['manager'] },
    { capability: 'wishes', workspaceRoles: ['manager'] },
  ]);
});

test('a workspace grant never reaches further than a team grant: manager is the co-host, desk the usher, neither manages', () => {
  const { CAPABILITIES, MEMBER_CAPABILITIES, WORKSPACE_ROLE_AS_MEMBER, workspaceRolesFor, can } = rules();
  for (const capability of CAPABILITIES) {
    for (const role of ['manager', 'desk'] as const) {
      assert.equal(workspaceRolesFor(capability).includes(role), MEMBER_CAPABILITIES[capability].includes(WORKSPACE_ROLE_AS_MEMBER[role]), `${role} / ${capability}`);
    }
  }
  assert.deepEqual(workspaceRolesFor('manage'), []);
  assert.equal(can(WORKSPACE_ROLE_AS_MEMBER.manager, 'manage'), false);
  assert.equal(can(WORKSPACE_ROLE_AS_MEMBER.desk, 'guests'), false);
  assert.deepEqual(workspaceRolesFor('insights'), ['manager']);
});

test('the broader of a team grant and a workspace grant, and the role guard', () => {
  const { broaderMemberRole, isWorkspaceRole } = rules();
  assert.equal(broaderMemberRole(null, null), null);
  assert.equal(broaderMemberRole('usher', null), 'usher');
  assert.equal(broaderMemberRole(null, 'usher'), 'usher');
  assert.equal(broaderMemberRole('usher', 'cohost'), 'cohost');
  assert.equal(broaderMemberRole('cohost', 'usher'), 'cohost');
  assert.equal(broaderMemberRole('usher', 'usher'), 'usher');
  for (const value of ['manager', 'desk']) assert.equal(isWorkspaceRole(value), true);
  for (const value of ['owner', 'cohost', 'usher', 'Manager', '', null, 1]) assert.equal(isWorkspaceRole(value), false, String(value));
});

test('workspace and client names: control characters dropped, spaces collapsed, 2 to 80 characters counted as code points', () => {
  const { normalizeWorkspaceText, WORKSPACE_NAME_MAX_CHARS, CLIENT_LABEL_MAX_CHARS } = rules();
  assert.equal(WORKSPACE_NAME_MAX_CHARS, 80);
  assert.equal(CLIENT_LABEL_MAX_CHARS, 80);
  assert.equal(normalizeWorkspaceText('  Studio   Melati \u0007 ', 80), 'Studio Melati');
  assert.equal(normalizeWorkspaceText('Budi\n&\tSari', 80), 'Budi & Sari');
  assert.equal(normalizeWorkspaceText('ab', 80), 'ab');
  assert.equal(normalizeWorkspaceText('a', 80), null);
  assert.equal(normalizeWorkspaceText(' \u0001 ', 80), null);
  assert.equal(normalizeWorkspaceText('a'.repeat(80), 80), 'a'.repeat(80));
  assert.equal(normalizeWorkspaceText('a'.repeat(81), 80), null);
  assert.equal(normalizeWorkspaceText('\u{1F338}'.repeat(80), 80), '\u{1F338}'.repeat(80));
  assert.equal(normalizeWorkspaceText(42, 80), null);
  assert.equal(normalizeWorkspaceText(null, 80), null);
});

test('the staff link message names the person, the role, the workspace, the link and its terms, and no phone number', () => {
  const { staffLinkMessage, WORKSPACE_ROLE_COPY, JOIN_LINK_TTL_DAYS } = rules();
  const url = 'https://invitesion.test/gabung/ruang/' + 'A'.repeat(43);
  const text = staffLinkMessage({ label: 'Rina', role: 'desk', workspaceName: 'Studio Melati', url });
  for (const part of ['Halo Rina', WORKSPACE_ROLE_COPY.desk.name, 'Studio Melati', url, `${JOIN_LINK_TTL_DAYS} hari`, 'satu akun']) assert.ok(text.includes(part), part);
  assert.doesNotMatch(text, /\+?62\d{6,}|08\d{6,}/);
  assert.notEqual(WORKSPACE_ROLE_COPY.manager.name, WORKSPACE_ROLE_COPY.desk.name);
});

test('the English role copy mirrors the Indonesian line for line, and the locale picks between them (s42)', () => {
  const { WORKSPACE_ROLE_COPY, WORKSPACE_ROLE_COPY_EN, WORKSPACE_ROLES, workspaceRoleCopy } = rules();
  for (const role of WORKSPACE_ROLES) {
    const id = WORKSPACE_ROLE_COPY[role];
    const en = WORKSPACE_ROLE_COPY_EN[role];
    assert.equal(en.can.length, id.can.length, `${role} can`);
    assert.equal(en.cannot.length, id.cannot.length, `${role} cannot`);
    for (const line of [en.name, en.summary, ...en.can, ...en.cannot]) assert.ok(line.trim().length > 0 && !id.can.includes(line), line);
    assert.notEqual(en.name, id.name);
  }
  assert.equal(workspaceRoleCopy('en'), WORKSPACE_ROLE_COPY_EN);
  assert.equal(workspaceRoleCopy('id'), WORKSPACE_ROLE_COPY);
});

test('the workspace page and its staff form carry both locales with the same keys (s42)', () => {
  const page = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/workspace/page.tsx'), 'utf8');
  const form = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/workspace/staff-link-form.tsx'), 'utf8');
  for (const source of [page, form]) {
    assert.match(source, /const COPY = \{\s*id: \{/);
    assert.match(source, /\n  en: \{/);
  }
  assert.match(page, /getLocale\(\)/);
  assert.match(page, /'joined'/, 'the joined notice key is English');
  assert.doesNotMatch(page, /'bergabung'/);
});

test('the staff join cookie: HttpOnly, SameSite=Lax, scoped to /gabung/ruang, one hour, Secure over HTTPS, and cleared', async () => {
  const { STAFF_JOIN_COOKIE, STAFF_JOIN_COOKIE_PATH, SIGN_IN_TO_JOIN_WORKSPACE, writeStaffJoinToken, readStaffJoinToken, clearStaffJoinToken } = staffSession();
  const token = 'B'.repeat(43);
  assert.equal(STAFF_JOIN_COOKIE, 'inv_ws_join');
  assert.notEqual(STAFF_JOIN_COOKIE, 'inv_join', 'a team link and a staff link in one browser keep separate secrets');
  assert.equal(STAFF_JOIN_COOKIE_PATH, '/gabung/ruang');
  assert.equal(SIGN_IN_TO_JOIN_WORKSPACE, '/sign-in?redirect_url=%2Fgabung%2Fruang%2Fterima');

  forwardedProto = 'https';
  await writeStaffJoinToken(token);
  assert.deepEqual(cookieWrites.at(-1), { name: 'inv_ws_join', value: token, options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/gabung/ruang', maxAge: 3600 } });
  assert.equal(await readStaffJoinToken(), token);
  await clearStaffJoinToken();
  assert.equal(cookieWrites.at(-1)?.options.maxAge, 0);
  assert.equal(await readStaffJoinToken(), null);

  const savedVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  forwardedProto = null;
  await writeStaffJoinToken(token);
  assert.equal(cookieWrites.at(-1)?.options.secure, false, 'plain HTTP in local development');
  if (savedVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedVercel;
  forwardedProto = 'https';

  jar.set('inv_ws_join', 'not-a-token');
  assert.equal(await readStaffJoinToken(), null, 'a tampered cookie is not a token');
  jar.delete('inv_ws_join');
});

test('the flag is off by default and every workspace entry asks it; the pages and actions refuse administrators', () => {
  assert.equal(flags().isFlagOn('WORKSPACES', {}), false);
  assert.equal(flags().isFlagOn('WORKSPACES', { FLAG_WORKSPACES: 'on' }), true);
  const entries = [...codeUnder('app/(customer)/dashboard/workspace'), ...codeUnder('app/gabung/ruang')].filter((file) => /(page|actions)\.tsx?$/.test(file));
  assert.ok(entries.length >= 5, entries.join(', '));
  for (const file of entries) {
    const text = source(file);
    assert.match(text, /isFlagOn\('WORKSPACES'\)/, `${file} asks FLAG_WORKSPACES`);
    assert.match(text, /'ADMIN'/, `${file} refuses administrators`);
  }
  // The link page carries its secret in the path: never indexed, never sent on as a referrer.
  const linkPage = source('app/gabung/ruang/[token]/page.tsx');
  assert.match(linkPage, /robots: \{ index: false, follow: false \}/);
  assert.match(linkPage, /referrer: 'no-referrer'/);
  // Opening a link never accepts it: acceptance is a server action (a POST) only.
  assert.doesNotMatch(linkPage, /acceptStaffLink\(/);
  assert.match(source('app/gabung/ruang/actions.ts'), /^'use server';/);
  assert.match(source('app/(customer)/dashboard/workspace/actions.ts'), /^'use server';/);
});

test('one writer per table: workspace-db.ts writes workspaces, staff and assignments; credits.ts alone writes the ledger, and no product path calls it yet', () => {
  const code = [...codeUnder('app'), ...codeUnder('lib'), ...codeUnder('components')];
  const writes = (pattern: RegExp) => code.filter((file) => pattern.test(source(file)));
  assert.deepEqual(writes(/\.(insert|update|delete)\(workspaceMembers\)/), ['lib/workspace/workspace-db.ts']);
  assert.deepEqual(writes(/\.insert\(workspaces\)/), ['lib/workspace/workspace-db.ts']);
  assert.deepEqual(writes(/\.update\(workspaces\)/), ['lib/workspace/credits.ts']);
  assert.deepEqual(writes(/\.(insert|update|delete)\(workspaceCreditEntries\)/), ['lib/workspace/credits.ts']);
  assert.deepEqual(writes(/workspaceId:\s*sql`/), ['lib/workspace/workspace-db.ts'], 'only the owner\'s assignment sets invitations.workspace_id');
  assert.deepEqual(
    code.filter((file) => /from '@\/lib\/workspace\/credits'/.test(source(file))),
    [],
    'B-040/G-049 hold what a credit buys: no page, action or route debits or grants yet',
  );
  // Workspace rows are never deleted: revocation and disabling are timestamps.
  assert.doesNotMatch(source('lib/workspace/workspace-db.ts'), /\.delete\(/);
});

test('each writer has one access check: no other query carries its own copy of the grant predicate', () => {
  // s41 pre-check: the Rust guest and wish row locks each inlined G-044's predicate, so under BACKEND_ROSTER and
  // BACKEND_WISHES=rust they refused workspace staff the check-in and moderation that the shared check allowed. Every
  // host access now goes through `members::caller_may` (Rust) or the fragment in `roster-next.ts` (TypeScript).
  const rust = (readdirSync(join(ROOT, 'services/api/src'), { recursive: true }) as string[])
    .filter((file) => file.endsWith('.rs'))
    .map((file) => join('services/api/src', file).split('\\').join('/'));
  const inlining = (files: string[]) => files.filter((file) => /from invitation_members\b/.test(source(file)));
  assert.deepEqual(inlining(rust), ['services/api/src/members.rs']);
  assert.deepEqual(inlining([...codeUnder('lib'), ...codeUnder('app')]), ['lib/invitation/roster-next.ts']);
  const roster = source('services/api/src/roster/http.rs');
  const guestLock = roster.slice(roster.indexOf('async fn accessible_guest('), roster.indexOf('async fn lock_roster('));
  assert.ok(guestLock.indexOf('accessible_invitation(') >= 0 && guestLock.indexOf('accessible_invitation(') < guestLock.indexOf('for update'));
  const wishes = source('services/api/src/wishes/http.rs');
  const wishLock = wishes.slice(wishes.indexOf('async fn lock_owned_wish('), wishes.indexOf('#[utoipa::path', wishes.indexOf('async fn lock_owned_wish(')));
  assert.ok(wishLock.indexOf('members::caller_may(') >= 0 && wishLock.indexOf('members::caller_may(') < wishLock.indexOf('for update'));
});

test('both writers carry the same workspace clause: the workspace is the invitation owner\'s, not disabled, and the live grant\'s role is allowed', () => {
  const ts = source('lib/invitation/roster-next.ts');
  const rs = source('services/api/src/members.rs');
  const guard = source('lib/invitation/members-db.ts');
  for (const fragment of ['w.id = i.workspace_id', 'w.owner_user_id = i.user_id', 'w.disabled_at is null', 'wm.user_id = ', 'wm.revoked_at is null']) {
    assert.ok(ts.includes(fragment), `roster-next.ts: ${fragment}`);
    assert.ok(rs.includes(fragment), `members.rs: ${fragment}`);
  }
  assert.match(ts, /workspaceRolesFor\(capability\)/);
  assert.match(rs, /wm\.role = any\(\$4\)/);
  // The guard (and the dashboard list) apply the same conditions and refuse administrators and deleted accounts.
  for (const fragment of ['eq(workspaces.ownerUserId, ownerId)', 'isNull(workspaces.disabledAt)', 'isNull(workspaceMembers.revokedAt)', "ne(users.role, 'ADMIN')", 'isNull(users.deletedAt)']) {
    assert.ok(guard.includes(fragment), `members-db.ts: ${fragment}`);
  }
  assert.match(guard, /isFlagOn\('WORKSPACES', env\)/);
});

test('migration 0030 only adds: new tables, nullable columns on invitations, indexes and constraints; nothing dropped or tightened', () => {
  const migration = source('lib/db/migrations/0030_workspaces.sql');
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /ALTER COLUMN/i);
  // No data statement: every statement starts with CREATE or ALTER (a foreign key's `ON DELETE` / `ON UPDATE` is not one).
  const statements = migration.split('--> statement-breakpoint').map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.length >= 10, `${statements.length} statements`);
  for (const statement of statements) assert.match(statement, /^(CREATE (TABLE|UNIQUE INDEX|INDEX)|ALTER TABLE) /, statement.slice(0, 80));
  const added = [...migration.matchAll(/ALTER TABLE "invitations" ADD COLUMN "(\w+)" ([^;]+);/g)].map((m) => [m[1], m[2].replace(/--> statement-breakpoint/, '').trim()]);
  assert.deepEqual(added, [
    ['workspace_id', 'integer'],
    ['client_label', 'varchar(80)'],
  ]);
  for (const table of ['workspaces', 'workspace_members', 'workspace_credit_entries']) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(migration, /"workspaces_credit_balance_check" CHECK \("workspaces"\."credit_balance" >= 0\)/);
  // Registered under its own index; later migrations (G-047's 0031) follow it and never replace it.
  const journal = JSON.parse(source('lib/db/migrations/meta/_journal.json')) as { entries: { idx: number; tag: string }[] };
  assert.equal(journal.entries.find((entry) => entry.idx === 30)?.tag, '0030_workspaces');
  assert.ok(journal.entries.every((entry) => entry.idx <= 30 || Number(entry.tag.slice(0, 4)) > 30), 'only later migrations follow');
});

test('the database job runs the workspace acceptance for Next.js and the rust job runs it for both writers', () => {
  assert.match(source('scripts/ci/database.sh'), /npx tsx scripts\/verify-workspaces\.ts/);
  const rustJob = source('scripts/ci/rust.sh');
  assert.match(rustJob, /REQUIRE_RUST=1 npx tsx scripts\/verify-workspaces\.ts/);
  assert.match(rustJob, /step "workspaces end to end \(G-052/);
});
