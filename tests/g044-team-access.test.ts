// G-044 (D-057): an invitation's team. Every vector in `contracts/vectors/member-roles.json` against the TypeScript rules
// (the Rust writers run the same file: `services/api/tests/member_roles_vectors.rs`), the join cookie's attributes, and
// source guards for what the database acceptance (`scripts/verify-team-access-api.ts`, the rust job) proves end to end:
// every entry that can serve a member asks the flag-aware guard and refuses administrators, the team surfaces sit behind
// FLAG_TEAM_ACCESS, and both writers read a stored idempotent answer only after the caller's current access is known.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;

// `join-session.ts` reads and writes the request's cookies through next/headers: a jar that records every write.
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
const tokens = () => require('../lib/invitation/join-token') as typeof import('../lib/invitation/join-token');
const joinSession = () => require('../app/gabung/join-session') as typeof import('../app/gabung/join-session');

const ROOT = process.cwd();
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const vectors = JSON.parse(source('contracts/vectors/member-roles.json'));
const codeUnder = (dir: string) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file)).map((file) => join(dir, file).split('\\').join('/'));

test('vectors: the generator is current', () => {
  assert.match(execFileSync('npx', ['tsx', 'scripts/api/member-roles-vectors.ts', '--check'], { encoding: 'utf8' }), /member-roles vectors current/);
});

test('vectors: every role against every capability, the writer table, the operations and the homes', () => {
  const { can, memberHome, memberRolesFor, MEMBER_ROLES, operationCapability, LABEL_MAX_CHARS, MAX_TEAM_ROWS, JOIN_LINK_TTL_DAYS } = rules();
  assert.deepEqual(vectors.roles, [...MEMBER_ROLES]);
  assert.deepEqual(vectors.limits, { maxTeamRows: MAX_TEAM_ROWS, labelMaxChars: LABEL_MAX_CHARS, joinLinkTtlDays: JOIN_LINK_TTL_DAYS, tokenChars: 43 });
  for (const row of vectors.matrix) {
    for (const [capability, expected] of Object.entries(row.capabilities)) assert.equal(can(row.role, capability as never), expected, `${row.role} / ${capability}`);
  }
  // The intended matrix, stated once more in words: the usher has the desk only; manage is the owner's alone.
  assert.deepEqual(vectors.matrix.find((r: { role: string }) => r.role === 'usher').capabilities, { checkin: true, guests: false, wishes: false, insights: false, manage: false });
  assert.deepEqual(vectors.matrix.find((r: { role: string }) => r.role === 'cohost').capabilities, { checkin: true, guests: true, wishes: true, insights: true, manage: false });
  for (const writer of vectors.writers) assert.deepEqual([...memberRolesFor(writer.capability)], writer.memberRoles);
  for (const op of vectors.operations) assert.equal(operationCapability(op.operation), op.capability);
  for (const home of vectors.homes) assert.equal(memberHome(home.invitationId, home.role), home.path);
});

test('vectors: labels, tokens and their hashes', () => {
  const { normalizeLabel, JOIN_TOKEN_PATTERN } = rules();
  for (const label of vectors.labels) assert.equal(normalizeLabel(label.raw), label.expect, label.name);
  for (const token of vectors.tokens) assert.equal(JOIN_TOKEN_PATTERN.test(token.token), token.valid, token.name);
  for (const { token, hash } of vectors.hashes) assert.equal(tokens().joinTokenHash(token), hash);
  const minted = new Set(Array.from({ length: 50 }, () => tokens().newJoinToken()));
  assert.equal(minted.size, 50, 'fresh randomness each time');
  for (const token of minted) assert.match(token, JOIN_TOKEN_PATTERN);
});

test('vectors: join decisions, row states and the link expiry', () => {
  const { decideJoin, teamRowState, joinLinkExpiry } = rules();
  for (const c of vectors.joins) {
    const row = c.row && { ...c.row, revokedAt: c.row.revokedAt ? new Date(c.row.revokedAt) : null, expiresAt: new Date(c.row.expiresAt) };
    assert.equal(decideJoin(row, c.userId, c.holdsLiveGrant, new Date(c.now)), c.expect, c.name);
  }
  for (const s of vectors.rowStates) assert.equal(teamRowState({ userId: s.userId, expiresAt: new Date(s.expiresAt) }, new Date(s.now)), s.expect, s.name);
  assert.equal(joinLinkExpiry(new Date(vectors.expiry.now)).toISOString(), vectors.expiry.expect);
});

test('the join cookie: HttpOnly, SameSite=Lax, scoped to /gabung, one hour, Secure over HTTPS, and cleared', async () => {
  const session = joinSession();
  const token = vectors.hashes[0].token as string;
  forwardedProto = 'https';
  await session.writeJoinToken(token);
  assert.deepEqual(cookieWrites.at(-1), { name: 'inv_join', value: token, options: { httpOnly: true, sameSite: 'lax', secure: true, path: '/gabung', maxAge: 3600 } });
  assert.equal(await session.readJoinToken(), token);
  await session.clearJoinToken();
  assert.deepEqual(cookieWrites.at(-1)?.options, { httpOnly: true, sameSite: 'lax', secure: true, path: '/gabung', maxAge: 0 });
  assert.equal(await session.readJoinToken(), null);

  forwardedProto = null;
  const vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    await session.writeJoinToken(token);
    assert.equal(cookieWrites.at(-1)?.options.secure, false, 'plain HTTP in development');
  } finally {
    if (vercel !== undefined) process.env.VERCEL = vercel;
  }
  jar.set('inv_join', 'not a token');
  assert.equal(await session.readJoinToken(), null, 'a tampered cookie is no token');
  assert.equal(session.SIGN_IN_TO_JOIN, '/sign-in?redirect_url=%2Fgabung%2Fterima', 'the sign-in URL never carries the secret');
});

test('guards: every entry that writes for a member asks the flag-aware guard first and refuses administrators', () => {
  // The writers check the grant but not FLAG_TEAM_ACCESS: without `accessFor` an entry would still let a member write
  // with the flag off (the s35 finding on the global guest list).
  const writes = /from '@\/lib\/invitation\/roster'|\b(?:writeHostRsvpThroughApi|moderateWishThroughApi|replyToWishThroughApi|createJoinLink|revokeTeamRow)\(/;
  const publicEntries = new Set(['app/daftar/[token]/actions.ts']);
  const writers = codeUnder('app').filter((file) => writes.test(source(file)) && !publicEntries.has(file));
  assert.ok(writers.length >= 8, `found ${writers.length} writing entries`);
  for (const file of writers) assert.match(source(file), /\baccessFor\(/, `${file} must ask accessFor (flag-aware) before writing`);

  const guarded = codeUnder('app').filter((file) => /\b(?:accessFor|invitationAccess)\(/.test(source(file)));
  assert.ok(guarded.length >= 15, `found ${guarded.length} guarded entries`);
  for (const file of guarded) assert.match(source(file), /role\s*===\s*'ADMIN'/, `${file} must refuse administrators`);

  const guard = source('lib/invitation/members-db.ts');
  // G-052 (D-067) restructured the guard: a team grant is read only while FLAG_TEAM_ACCESS is on, a workspace grant only
  // while FLAG_WORKSPACES is on, and with both off a member holds nothing.
  assert.match(guard, /const teamOn = isFlagOn\('TEAM_ACCESS', env\);/, 'team grants only while the flag is on');
  assert.match(guard, /const direct = teamOn \? await directGrantRole\(/, 'the team grant is not read with the flag off');
  assert.match(guard, /if \(!teamOn && !workspaceOn\) return null;/, 'members only while a flag is on');
  assert.match(guard, /ne\(users\.role, 'ADMIN'\)/, 'a grant counts only for a customer account');
  assert.match(guard, /isNull\(users\.deletedAt\)/, 'and only for a live one');
});

test('guards: the team surfaces sit behind FLAG_TEAM_ACCESS, and the link pages are never indexed or sent on as a referrer', () => {
  assert.match(source('app/(customer)/dashboard/invitations/[id]/team/page.tsx'), /if \(!isFlagOn\('TEAM_ACCESS'\)\) notFound\(\);/);
  assert.match(source('app/(customer)/dashboard/invitations/[id]/team/actions.ts'), /if \(!isFlagOn\('TEAM_ACCESS'\)\) return null;/);
  for (const file of ['app/gabung/[token]/page.tsx', 'app/gabung/terima/page.tsx']) {
    assert.match(source(file), /if \(!isFlagOn\('TEAM_ACCESS'\)\) notFound\(\);/, file);
    assert.match(source(file), /robots: \{ index: false, follow: false \}/, file);
  }
  assert.match(source('app/gabung/[token]/page.tsx'), /referrer: 'no-referrer'/);
  assert.equal(source('app/gabung/actions.ts').match(/if \(!isFlagOn\('TEAM_ACCESS'\)\) notFound\(\);/g)?.length, 2, 'both join actions');
  assert.match(source('app/gabung/actions.ts'), /if \(user\.role === 'ADMIN'\) \{\s*await clearJoinToken\(\);/, 'an administrator leaves no join secret behind');
});

/** The text of one Rust handler: from its signature to the next handler's OpenAPI attribute (or the end). */
function handler(text: string, name: string): string {
  const start = text.indexOf(`pub async fn ${name}(`);
  assert.ok(start >= 0, name);
  const end = text.indexOf('#[utoipa::path', start);
  return text.slice(start, end < 0 ? undefined : end);
}

test('guards: both writers read a stored idempotent answer only after the caller\'s current access, twins included', () => {
  const ts = source('lib/invitation/roster-next.ts');
  const entry = ts.slice(ts.indexOf('export async function passCheckinNext('), ts.indexOf('function passCheckinTransaction('));
  assert.doesNotMatch(entry, /lookupIdempotent\(/, 'no stored answer before the transaction that checks access');
  const transaction = ts.slice(ts.indexOf('function passCheckinTransaction('), ts.indexOf('/** D-037: one guest'));
  assert.ok(transaction.indexOf('accessibleInvitation(') >= 0 && transaction.indexOf('accessibleInvitation(') < transaction.indexOf('lookupIdempotent('));
  assert.equal(transaction.match(/lookupIdempotent\(tx,/g)?.length, 2, 'the replay and the twin, both in the checked transaction');

  const files = {
    'services/api/src/roster/http.rs': ['add_guest', 'import_guests', 'undo_import', 'guest_operation', 'set_invited_events', 'set_category_invitation', 'registration_link', 'decide', 'pass_checkins'],
    'services/api/src/rsvp/http.rs': ['host_rsvp_override'],
    'services/api/src/wishes/http.rs': ['moderate_wish', 'reply_to_wish'],
  };
  let checked = 0;
  for (const [file, names] of Object.entries(files)) {
    const text = source(file);
    for (const name of names) {
      const body = handler(text, name);
      const access = Math.min(...['accessible_invitation(', 'members::caller_may(', 'authorized_replay('].map((call) => body.indexOf(call)).filter((at) => at >= 0));
      const replay = Math.min(...['replay_for(&mut tx', 'replay(&mut *tx', 'authorized_replay('].map((call) => body.indexOf(call)).filter((at) => at >= 0));
      assert.ok(Number.isFinite(access) && Number.isFinite(replay) && access <= replay, `${file} ${name}: access before the stored answer`);
      assert.doesNotMatch(body, /replay\(&state\.pool/, `${file} ${name}: a host's stored answer is read in its checked transaction`);
      checked++;
    }
  }
  assert.equal(checked, 12, 'every host write in the API');
  const wishes = source('services/api/src/wishes/http.rs');
  const authorized = wishes.slice(wishes.indexOf('async fn authorized_replay('), wishes.indexOf('async fn lock_owned_wish('));
  assert.ok(authorized.indexOf('members::caller_may(') < authorized.indexOf('replay(&mut **tx'), 'the wish check comes first inside the helper too');
});

test('the desk: a stored batch refused after revocation leaves the outbox and says access ended, without saying which cause', () => {
  // s35 browser acceptance: an usher offline, revoked by the owner, back online. The route's 404 also covers passes
  // switched off, so the notice names both; 409 is the invitation's own opt-in and keeps its own words.
  const scanner = source('app/(customer)/dashboard/invitations/[id]/checkin/checkin-scanner.tsx');
  assert.match(scanner, /response\.status === 409\s*\?\s*'QR pass sedang dinonaktifkan untuk undangan ini\.'/);
  assert.match(scanner, /response\.status === 404\s*\?\s*'Check-in tidak terkirim: akses Anda ke undangan ini sudah berakhir, atau QR pass sedang dinonaktifkan\.'/);
  assert.match(scanner, /batch\.scans\.forEach\(\(scan\) => updateLine\(scan\.id, \{ outcome: 'refused' \}\)\);\s*setQueue\(settle\(queueRef\.current, batch\.key\)\);/);
});

test('the rust job runs the team acceptance after the guest-pass acceptance, against the same binary and secrets', () => {
  const job = source('scripts/ci/rust.sh');
  assert.match(job, /team_access_end_to_end\(\) \{[^}]*GUEST_PASS_SECRET=\$PASS_SECRET[^}]*npx tsx scripts\/verify-team-access-api\.ts/);
  assert.ok(job.indexOf('step "guest passes end to end') < job.indexOf('step "team access end to end'), 'after the guest-pass step');
});
