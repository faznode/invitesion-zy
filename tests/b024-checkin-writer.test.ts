// B-024 (D-056, ADR-A3): the check-in path without a database. The facade keeps every pass inert with the flag off and
// selects exactly one roster writer; the Rust client resends an unknown outcome once under the scanner's batch key and
// maps every answer; both writers run the same statements in the same order; the route refuses cross-site requests
// before it reads a session; the scanner's outbox resends a batch unchanged until it is answered. The database flows run
// in `scripts/verify-guest-pass-api.ts` (the rust job) and `services/api/tests/guest_pass_database.rs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import './support/render-guest-page';
import { sameOrigin } from '../lib/api/same-origin';
import { EMPTY_QUEUE, enqueue, nextBatch, parseStoredQueue, settle } from '../lib/invitation/checkin-queue';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const TOKEN = `IVP1.${'A'.repeat(48)}`;
const KEY = 'batch-3f9a2b1c-4d5e';
const API_ENV = { API_BASE_URL: 'http://api.invalid', INTERNAL_API_SECRET: 's'.repeat(40), BACKEND_ROSTER: 'rust', FLAG_GUEST_PASS: 'on' };

test('the facade: flag off answers disabled and calls no writer; Rust without a session answers sign-in; no secret, unconfigured', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('no request expected');
  });
  const { checkInWithPasses } = await import('../lib/invitation/roster');
  const caller = { userId: 1, ownerToken: async () => null };
  const input = { invitationId: 9, scans: [{ token: TOKEN }], key: KEY };
  assert.deepEqual(await checkInWithPasses(caller, input, { ...API_ENV, FLAG_GUEST_PASS: 'off' }), { kind: 'disabled' });
  assert.deepEqual(await checkInWithPasses(caller, input, API_ENV), { kind: 'signin' });
  assert.deepEqual(await checkInWithPasses(caller, input, { FLAG_GUEST_PASS: 'on', BACKEND_ROSTER: 'next' }), { kind: 'unconfigured' });
  assert.equal(fetchMock.mock.callCount(), 0);

  const facade = source('lib/invitation/roster.ts');
  assert.match(
    facade,
    /export async function checkInWithPasses\([\s\S]*?if \(!isFlagOn\('GUEST_PASS', env\)\) return \{ kind: 'disabled' \};\n  if \(rust\(env\)\) \{[\s\S]*?: \{ kind: 'signin' \};\n  \}\n  const secrets = passVerifySecrets\(env\);\n  if \(!secrets\.length\) return \{ kind: 'unconfigured' \};\n  return next\.passCheckinNext\(/,
    'the flag first, then one writer; the rust branch returns',
  );
});

type Reply = { status: number; body: unknown } | 'transport';

async function throughApi(t: TestContext, replies: Reply[]) {
  const requests: { body: string; key: string | null }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    requests.push({ body: String(init.body), key: new Headers(init.headers).get('idempotency-key') });
    const reply = replies.shift();
    if (!reply || reply === 'transport') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  const { passCheckinsThroughApi } = await import('../lib/invitation/roster-api');
  let outcome: unknown;
  try {
    outcome = await passCheckinsThroughApi({ invitationId: 9, scans: [{ token: TOKEN, scannedAt: '2026-11-07T11:30:00.000Z' }], key: KEY, ownerToken: 'token' }, API_ENV);
  } catch (error) {
    outcome = { thrown: (error as Error).message };
  }
  return { outcome, requests };
}

const problem = (status: number, code: string) => ({ status, body: { type: `x/${code}`, title: 'x', status, code } });
const checked = { status: 200, body: { results: [{ outcome: 'checked-in', name: 'Budi', checkedInAt: '2026-11-07T11:30:00.000Z' }] } };

test('the Rust client resends an unknown outcome once under the batch key and maps every answer', async (t) => {
  const cases: { name: string; replies: Reply[]; expect: unknown; calls: number }[] = [
    { name: 'checked in', replies: [checked], expect: { kind: 'checked', results: [{ outcome: 'checked-in', name: 'Budi', checkedInAt: '2026-11-07T11:30:00.000Z' }] }, calls: 1 },
    { name: 'a 503, then the replayed answer', replies: [problem(503, 'internal'), checked], expect: { kind: 'checked', results: [{ outcome: 'checked-in', name: 'Budi', checkedInAt: '2026-11-07T11:30:00.000Z' }] }, calls: 2 },
    { name: 'unknown twice', replies: [problem(503, 'internal'), 'transport'], expect: { kind: 'unconfirmed' }, calls: 2 },
    { name: 'refusals carry no name', replies: [{ status: 200, body: { results: [{ outcome: 'expired' }, { outcome: 'unknown' }, { outcome: 'invalid', name: 'x' }] } }], expect: { kind: 'checked', results: [{ outcome: 'expired' }, { outcome: 'unknown' }, { outcome: 'invalid' }] }, calls: 1 },
    { name: 'not opted in', replies: [problem(409, 'guest_pass.not_enabled')], expect: { kind: 'disabled' }, calls: 1 },
    { name: 'no secret on the API', replies: [problem(503, 'guest_pass.not_configured')], expect: { kind: 'unconfigured' }, calls: 1 },
    { name: 'the key answered another batch', replies: [problem(422, 'idempotency.key_reused')], expect: { kind: 'key-reused' }, calls: 1 },
    { name: 'not this owner', replies: [problem(404, 'roster.not_found')], expect: { kind: 'notfound' }, calls: 1 },
    { name: 'no live customer behind the token', replies: [problem(403, 'owner.role_not_allowed')], expect: { kind: 'signin' }, calls: 1 },
  ];
  for (const { name, replies, expect, calls } of cases) {
    const { outcome, requests } = await throughApi(t, replies);
    assert.deepEqual(outcome, expect, name);
    assert.equal(requests.length, calls, `${name}: requests`);
    assert.ok(requests.every(({ body, key }) => body === requests[0].body && key === KEY), `${name}: a resend is the same batch under the scanner's key`);
    assert.deepEqual(JSON.parse(requests[0].body), { scans: [{ token: TOKEN, scannedAt: '2026-11-07T11:30:00.000Z' }] });
    t.mock.restoreAll();
  }
});

test('both writers run the same statements in the same order', () => {
  const ts = source('lib/invitation/roster-next.ts');
  const writer = ts.slice(ts.indexOf('export async function passCheckinNext'), ts.indexOf('/** D-037: one guest'));
  // G-044 (D-057, s35): the caller's current access comes before any stored answer, and a twin's record is read in the
  // same checked transaction, so a revoked member never replays a batch.
  const order = [/passCheckinScope\(input\.userId, input\.invitationId\)/, /passCheckinHash\(scans\)/, /accessibleInvitation\(tx, input\.invitationId, input\.userId, 'checkin'\)/, /lookupIdempotent\(tx, input\.scope, input\.key, input\.hash, input\.now\)/, /passCheckInEnabled\(invitation\.config\)/, /lockRoster\(tx,/, /readGuestPass\(scan\.token, input\.secrets, nowSeconds\)/, /eq\(guests\.passId, read\.passId\)\)\)\n\s*\.for\('update'\)/, /checkInTime\(scan\.scannedAt, now\)/, /\.update\(guests\)\.set\(\{ checkedInAt: at \}\)/, /eventType: 'CHECKIN', meta: \{ source: 'pass' \}/, /recordIdempotent\(tx, input\.scope, input\.key, input\.hash, 200, \{ results \}, now\)/, /lookupIdempotent\(tx, input\.scope, input\.key, input\.hash, now\)/, /throw new TwinCommitted\(recordedPassCheckin\(twin\)\)/];
  let at = 0;
  for (const step of order) {
    const found = writer.slice(at).search(step);
    assert.ok(found >= 0, `TypeScript writer: ${step}`);
    at += found;
  }
  const rs = source('services/api/src/roster/http.rs');
  const handler = rs.slice(rs.indexOf('pub async fn pass_checkins'));
  const rustOrder = [/idempotency::host_scope\("roster:pass-checkins", owner\.user_id, invitation_id, 0\)/, /idempotency::request_hash\(&request\)/, /accessible_invitation\(&mut tx, &owner, invitation_id, Capability::Checkin\)/, /replay_for\(&mut tx, &headers, &scope, &hash\)/, /pass::check_in_enabled\(&config\)/, /lock_roster\(&mut tx, invitation_id\)/, /pass::read\(&scan\.token, &state\.guest_pass_secrets, now_seconds\)/, /select id, name, checked_in_at from guests where invitation_id = \$1 and pass_id = \$2 for update/, /pass::check_in_time\(scan\.scanned_at\.as_deref\(\), now\)/, /update guests set checked_in_at = \$1 where id = \$2/, /'CHECKIN', \$3\)",[\s\S]*?json!\(\{ "source": "pass" \}\)/, /commit_with\(&headers, tx, &scope, &hash, &answer, now\)/];
  at = 0;
  for (const step of rustOrder) {
    const found = handler.slice(at).search(step);
    assert.ok(found >= 0, `Rust writer: ${step}`);
    at += found;
  }
});

test('the route refuses cross-site requests before reading a session, keeps passes inert with the flag off, and limits the rate', () => {
  const route = source('app/api/invitations/[id]/checkins/route.ts');
  const order = [/if \(!sameOrigin\(req\.headers\)\)/, /startsWith\('application\/json'\)/, /await getUser\(\)/, /if \(!isFlagOn\('GUEST_PASS'\)\) return apiError\(404/, /bodySchema\.safeParse/, /await hit\(`checkin:\$\{user\.id\}:\$\{id\}`/, /checkInWithPasses\(/];
  let at = 0;
  for (const step of order) {
    const found = route.slice(at).search(step);
    assert.ok(found >= 0, `route: ${step}`);
    at += found;
  }
  assert.doesNotMatch(route, /@\/lib\/db\/(?:drizzle|schema)|roster-(?:next|api)/, 'the route writes only through the facade');

  const headers = (entries: Record<string, string>) => new Headers(entries);
  assert.equal(sameOrigin(headers({ 'sec-fetch-site': 'same-origin', origin: 'https://invitesion.id', host: 'invitesion.id' })), true);
  assert.equal(sameOrigin(headers({ origin: 'https://invitesion.id', host: 'invitesion.id' })), true, 'a browser without Fetch Metadata');
  assert.equal(sameOrigin(headers({ origin: 'https://app.invitesion.id', 'x-forwarded-host': 'app.invitesion.id', host: 'internal:3000' })), true, 'behind the proxy');
  assert.equal(sameOrigin(headers({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example', host: 'invitesion.id' })), false);
  assert.equal(sameOrigin(headers({ 'sec-fetch-site': 'same-site', origin: 'https://sub.invitesion.id', host: 'invitesion.id' })), false);
  assert.equal(sameOrigin(headers({ origin: 'https://evil.example', host: 'invitesion.id' })), false);
  assert.equal(sameOrigin(headers({ origin: 'null', host: 'invitesion.id' })), false);
  assert.equal(sameOrigin(headers({ host: 'invitesion.id' })), false, 'neither header');
});

test("the outbox: one arrival per token, a batch resent unchanged under its key, and a device's stored queue read leniently", () => {
  let state = EMPTY_QUEUE;
  for (let i = 0; i < 55; i += 1) state = enqueue(state, { id: `s${i}`, token: `IVP1.${String(i).padStart(48, 'A')}`, scannedAt: '2026-11-07T11:30:00.000Z' });
  state = enqueue(state, { id: 'dup', token: state.scans[0].token, scannedAt: '2026-11-07T11:31:00.000Z' });
  assert.equal(state.scans.length, 55, 'a token already waiting is one arrival');

  let keys = 0;
  const mint = () => `key-${(keys += 1)}`;
  const first = nextBatch(state, mint)!;
  assert.equal(first.scans.length, 50);
  assert.equal(first.key, 'key-1');
  const resent = nextBatch(first.state, mint)!;
  assert.equal(resent.key, 'key-1', 'unanswered: the same key');
  assert.deepEqual(resent.scans, first.scans, 'unanswered: the same scans');
  state = settle(resent.state, 'key-1');
  assert.equal(state.scans.length, 5);
  assert.equal(settle(state, 'key-1'), state, 'a stale answer changes nothing');
  const second = nextBatch(state, mint)!;
  assert.equal(second.key, 'key-2');
  assert.equal(nextBatch(settle(second.state, 'key-2'), mint), null);

  assert.deepEqual(parseStoredQueue(null), EMPTY_QUEUE);
  assert.deepEqual(parseStoredQueue('{not json'), EMPTY_QUEUE);
  assert.deepEqual(parseStoredQueue(JSON.stringify({ scans: [{ id: 'a', token: TOKEN, scannedAt: 'x' }, { id: 1 }, null], batch: { key: 'k', ids: ['gone'] } })), {
    scans: [{ id: 'a', token: TOKEN, scannedAt: 'x' }],
    batch: null,
  });
  const scanner = source('app/(customer)/dashboard/invitations/[id]/checkin/checkin-scanner.tsx');
  assert.doesNotMatch(scanner, /localStorage\.setItem\([^)]*name/, 'names never reach the device store');
  assert.match(scanner, /localStorage\.setItem\(storageKey, JSON\.stringify\(next\)\)/);
});

test('the scanner page hands out one-way keys, never pass ids, and the flag and opt-in gate every entry', () => {
  const page = source('app/(customer)/dashboard/invitations/[id]/checkin/page.tsx');
  assert.match(page, /key: passLookupKey\(row\.passId\)/);
  assert.doesNotMatch(page, /passId: row\.passId|passId=\{/, 'the pass id stays on the server');
  assert.match(page, /if \(!Number\.isInteger\(id\) \|\| !isFlagOn\('GUEST_PASS'\)\) notFound\(\);/);
  const actions = source('app/(customer)/dashboard/invitations/[id]/checkin/actions.ts');
  // G-044 (D-057): the invitation comes from the flag-aware access check (`checkin`), which an usher passes too.
  assert.match(actions, /const access = await accessFor\(user\.id, invitationId, 'checkin'\);\s*if \(!access\) return \{ ok: false, reason: 'notfound' \};/);
  assert.match(actions, /if \(!passManualAllowed\(access\.invitation\.config\)\) return \{ ok: false, reason: 'manual-off' \};/);
  assert.match(source('lib/flags.ts'), /GUEST_PASS: false,/);
});

test("the TypeScript writer's idempotency record is the API's: same table, statements, scope, conflict rule and retention", () => {
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const ts = flat(source('lib/idempotency.ts'));
  const rs = flat(source('services/api/src/idempotency.rs'));
  for (const fragment of [
    'select request_hash, response_status, response_body from api_idempotency_keys',
    'insert into api_idempotency_keys (scope, key, request_hash, response_status, response_body, created_at)',
    'on conflict (scope, key) do update set request_hash = excluded.request_hash, response_status = excluded.response_status, response_body = excluded.response_body, created_at = excluded.created_at',
    'where api_idempotency_keys.created_at <',
    'returning true',
    'delete from api_idempotency_keys where (scope, key) in',
    'order by created_at limit 100)',
  ]) {
    assert.ok(ts.includes(fragment), `TypeScript: ${fragment}`);
    assert.ok(rs.includes(fragment), `Rust: ${fragment}`);
  }
  assert.match(ts, /where scope = \$\{scope\} and key = \$\{key\} and created_at >= /);
  assert.match(rs, /where scope = \$1 and key = \$2 and created_at >= \$3/);
  assert.match(ts, /IDEMPOTENCY_RETENTION_MS = 24 \* 3_600_000/);
  assert.match(rs, /RETENTION: Duration = Duration::hours\(24\)/);
  assert.match(ts, /::text::jsonb/, 'the answer is stored as a JSON object, never a JSON string');
  const next = source('lib/invitation/roster-next.ts');
  assert.match(next, /if \(prior\.kind === 'mismatch'\) return \{ kind: 'key-reused' \};/);
  assert.match(next, /const twin = await lookupIdempotent\(tx, input\.scope, input\.key, input\.hash, now\);[\s\S]*?throw new TwinCommitted\(recordedPassCheckin\(twin\)\);/, 'a twin that committed first is answered from its record, read in the checked transaction');
  assert.match(next, /if \(error instanceof TwinCommitted\) return error\.outcome;/, 'and this transaction rolls back');
});

test('a guest checks in once: both writers keep the first time and write one CHECKIN row, and the manual fallback says already', () => {
  const next = source('lib/invitation/roster-next.ts');
  const operation = next.slice(next.indexOf('export async function guestOperationNext'), next.indexOf('/** Raised inside a pass check-in'));
  assert.match(operation, /\.set\(\{ checkedInAt: new Date\(\) \}\)\.where\(and\(where, isNull\(guests\.checkedInAt\)\)\)\.returning\(\{ id: guests\.id \}\);\n\s*if \(first\.length\) await tx\.insert\(analyticsEvents\)/);
  const rust = source('services/api/src/roster/http.rs');
  const checkin = rust.slice(rust.indexOf('GuestOperation::Checkin => {'), rust.indexOf('GuestOperation::UndoCheckin => {'));
  assert.match(checkin, /"update guests set checked_in_at = \$1 where id = \$2 and invitation_id = \$3 and checked_in_at is null"/);
  assert.match(checkin, /\.rows_affected\(\)\s*== 1;\s*if first \{\s*sqlx::query!\(\s*"insert into analytics_events \(invitation_id, guest_id, event_type\) values \(\$1, \$2, 'CHECKIN'\)"/);

  const actions = source('app/(customer)/dashboard/invitations/[id]/checkin/actions.ts');
  const already = actions.indexOf("if (guest.checkedInAt) return { ok: true, checkedInAt: guest.checkedInAt.toISOString(), already: true };");
  assert.ok(already > 0 && already < actions.indexOf('rosterOperation({'), 'an arrival already stored is answered before any write');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/checkin/checkin-scanner.tsx'), /outcome: result\.already \? 'already' : 'checked-in'/);
});

test('the route admits printable ASCII only, so both writers hash a batch to the same bytes', () => {
  const route = source('app/api/invitations/[id]/checkins/route.ts');
  assert.match(route, /const PRINTABLE = \/\^\[\\x20-\\x7e\]\*\$\/;/);
  assert.match(route, /token: z\.string\(\)\.max\(MAX_TOKEN_CHARS\)\.regex\(PRINTABLE\), scannedAt: z\.string\(\)\.max\(40\)\.regex\(PRINTABLE\)\.optional\(\)/);
  assert.match(route, /case 'key-reused':\n\s*return apiError\(422, 'KEY_REUSED'/);
});

test('a stored batch is resent only when every scan of it survived, so a key never travels with other scans', () => {
  const scan = (id: string) => ({ id, token: `IVP1.${id.padStart(48, 'A')}`, scannedAt: '2026-11-07T11:30:00.000Z' });
  const whole = parseStoredQueue(JSON.stringify({ scans: [scan('a'), scan('b'), scan('c')], batch: { key: 'k-1', ids: ['a', 'b'] } }));
  assert.deepEqual(whole.batch, { key: 'k-1', ids: ['a', 'b'] });
  assert.deepEqual(nextBatch(whole, () => 'fresh')?.scans.map((s) => s.id), ['a', 'b'], 'the same batch under the same key');
  const partial = parseStoredQueue(JSON.stringify({ scans: [scan('a'), { id: 'b' }, scan('c')], batch: { key: 'k-1', ids: ['a', 'b'] } }));
  assert.equal(partial.batch, null, 'a damaged batch gets a new key');
  assert.equal(nextBatch(partial, () => 'fresh')?.key, 'fresh');
  assert.equal(parseStoredQueue(JSON.stringify({ scans: [scan('a')], batch: { key: 'k', ids: [] } })).batch, null);
});

test('only the scanner may use the camera, and both entries (guest list, manage centre) open it by a full load', async () => {
  const { default: config } = await import('../next.config');
  const entries = (await config.headers?.()) ?? [];
  const policyOf = (path: string) => entries.find((entry) => entry.source === path)?.headers.find((header) => header.key === 'Permissions-Policy')?.value;
  assert.match(policyOf('/:path*') ?? '', /^camera=\(\), /, 'denied everywhere else');
  assert.equal(policyOf('/dashboard/invitations/:id/checkin'), 'camera=(self), microphone=(), geolocation=(), payment=()', 'the scanner, for this origin only');
  const index = (path: string) => entries.findIndex((entry) => entry.source === path);
  assert.ok(index('/dashboard/invitations/:id/checkin') > index('/:path*'), 'the later entry overrides the site-wide one');
  const guests = source('app/(customer)/dashboard/invitations/[id]/guests/page.tsx');
  assert.match(guests, /<a href=\{`\/dashboard\/invitations\/\$\{id\}\/checkin`\}/, "next/link would keep the guest list's policy, which denies the camera");
  assert.doesNotMatch(guests, /<Link href=\{`\/dashboard\/invitations\/\$\{id\}\/checkin`\}/);
  const manage = source('app/(customer)/dashboard/invitations/[id]/manage/manage-center.tsx');
  assert.match(manage, /href: 'checkin', fullLoad: true \}/, 'the manage centre names its scanner card a full load');
  assert.match(manage, /const CardLink: ElementType = item\.fullLoad \? 'a' : Link;/, 'and renders it as a plain anchor');
  assert.doesNotMatch(manage, /href: 'checkin'(?!, fullLoad: true)/, 'no scanner entry without a full load');
});
