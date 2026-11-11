// B-033: the Rust roster writer's side (`lib/invitation/roster-api.ts`) against a scripted API, the facade's choice of
// exactly one writer (`lib/invitation/roster.ts`, `BACKEND_ROSTER`), and source guards that keep every roster write in
// the app behind that facade. Every owner write carries an Idempotency-Key; an unknown outcome is sent exactly once more
// under the same key and then reported unconfirmed; problems map to the outcomes the TypeScript writer returns.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { signServiceRequest } from '../lib/api/signature';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
// The facade loads the TypeScript writer, whose database client is built (not connected) at import. Nothing here may
// reach it: without a configured database, an address nothing listens on makes an accidental query fail at once.
process.env.POSTGRES_URL ??= 'postgres://nobody@127.0.0.1:9/none';
const writer = () => require('../lib/invitation/roster-api') as typeof import('../lib/invitation/roster-api');
const facade = () => require('../lib/invitation/roster') as typeof import('../lib/invitation/roster');
const client = () => require('../lib/api/client') as typeof import('../lib/api/client');
const flags = () => require('../lib/flags') as typeof import('../lib/flags');

const SECRET = 'roster-writer-test-secret-0123456789abcdef';
const ENV = { API_BASE_URL: 'http://api.test', INTERNAL_API_SECRET: SECRET };
const FLAGS = { opaqueLinks: true, inviteOnlyEvents: true };
const OWNER = 'owner-session-token';
const BATCH = '0b9a7c1e-2f43-4d5a-8e6b-9c0d1e2f3a4b';
const FORM_KEY = '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const LINK = 'AbCdEfGhIjKlMnOpQrStUv';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Sent = { url: string; method: string; headers: Record<string, string>; body: string };
type Scripted = { status: number; body?: unknown; headers?: Record<string, string> } | 'drop';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers each request with the next scripted reply ('drop' = the connection fails) and records what was sent. */
function scriptApi(...replies: Scripted[]): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      method: String(init?.method ?? 'GET'),
      headers: { ...(init?.headers as Record<string, string>) },
      body: String(init?.body ?? ''),
    });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    if (reply === 'drop') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: reply.headers });
  }) as typeof fetch;
  return sent;
}

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { type: `https://invitesion.id/problems/${code}`, title: 'x', status, code, ...extra },
});

function assertSigned(request: Sent, path: string) {
  const header = request.headers['x-invitesion-signature'];
  const timestamp = Number(/^t=(\d+),/.exec(header)?.[1]);
  assert.equal(header, signServiceRequest(SECRET, timestamp, 'POST', path, request.body));
}

/** Codes and status only reach the log, never a name, a number, a slug or an address. */
async function quietly<T>(run: () => Promise<T>): Promise<{ value: T; logged: string[] }> {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
  try {
    return { value: await run(), logged };
  } finally {
    console.error = original;
  }
}

const addInput = () => ({
  ownerToken: OWNER,
  invitationId: 7,
  row: { name: 'Budi & Sari', phone: '', category: 'Keluarga', guestCount: '' },
  invitedEventIds: ['akad'],
  flags: FLAGS,
});

test('add: one signed request under a fresh key with the owner token; empty fields stay out of the body', async () => {
  const sent = scriptApi({ status: 200, body: { id: 41, slug: 'budi-sari' } });
  assert.deepEqual(await writer().addGuestThroughApi(addInput(), ENV), { kind: 'saved', id: 41, slug: 'budi-sari' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/7/guests');
  assert.equal(sent[0].headers.authorization, `Bearer ${OWNER}`);
  assert.match(sent[0].headers['idempotency-key'], UUID);
  assert.deepEqual(JSON.parse(sent[0].body), { guest: { name: 'Budi & Sari', category: 'Keluarga' }, invitedEventIds: ['akad'], flags: FLAGS });
  assertSigned(sent[0], '/v1/invitations/7/guests');
});

test('add: refusals map to the TypeScript writer\'s outcomes; a 400 is a programming error and propagates', async () => {
  const cases: [Scripted, unknown][] = [
    [problem(422, 'roster.row_invalid', { reason: 'phone' }), { kind: 'invalid', reason: 'phone' }],
    [problem(422, 'roster.row_invalid', { reason: 'not-a-field' }), { kind: 'invalid', reason: 'name' }],
    [problem(409, 'roster.full'), { kind: 'full' }],
    [problem(404, 'roster.not_found'), { kind: 'notfound' }],
    [problem(403, 'owner.not_customer'), { kind: 'signin' }],
  ];
  for (const [reply, expected] of cases) {
    scriptApi(reply);
    assert.deepEqual(await writer().addGuestThroughApi(addInput(), ENV), expected, JSON.stringify(reply));
  }
  scriptApi(problem(400, 'request.invalid'));
  await assert.rejects(writer().addGuestThroughApi(addInput(), ENV), (error: unknown) => error instanceof client().ApiProblem && error.status === 400);
});

test('an unknown outcome is sent exactly once more under the same key, then reported unconfirmed with codes only logged', async () => {
  let sent = scriptApi('drop', { status: 200, body: { id: 5, slug: 'budi-sari' } });
  assert.deepEqual(await writer().addGuestThroughApi(addInput(), ENV), { kind: 'saved', id: 5, slug: 'budi-sari' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
  const earlierKey = sent[0].headers['idempotency-key'];

  sent = scriptApi(problem(503, 'service.unavailable'), 'drop');
  const { value, logged } = await quietly(() => writer().addGuestThroughApi(addInput(), ENV));
  assert.deepEqual(value, { kind: 'unconfirmed' });
  assert.equal(sent.length, 2, 'no third attempt');
  assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
  assert.notEqual(sent[0].headers['idempotency-key'], earlierKey, 'a new submission is a new key');
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /Budi|Sari|Keluarga|budi-sari|akad/);
});

const verdicts = [{ status: 'ok', slug: 'budi' }, { status: 'invalid', reason: 'phone' }, { status: 'duplicate', of: 'file' }];
const summary = { verdicts, ok: 1, invalid: 1, duplicate: 1, refusal: null };
const importReply = (overrides: Record<string, unknown> = {}) => ({ status: 200, body: { ...summary, imported: 0, ...overrides } });
const importRows = [{ name: 'Budi', phone: '0812 3456 7890' }, { name: 'Sari', phone: '12' }, { name: 'Budi' }];
const importInput = (dryRun: boolean) => ({ ownerToken: OWNER, invitationId: 7, rows: importRows, dryRun, flags: FLAGS });

test('import: a preview is "planned" and carries no key; the import is one keyed request; a refusal writes nothing', async () => {
  let sent = scriptApi(importReply());
  assert.deepEqual(await writer().importGuestsThroughApi(importInput(true), ENV), { kind: 'planned', summary });
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/7/guest-imports');
  assert.equal(sent[0].headers['idempotency-key'], undefined, 'a preview writes nothing, so it needs no key');
  assert.deepEqual(JSON.parse(sent[0].body), { rows: importRows, dryRun: true, flags: FLAGS });

  sent = scriptApi(importReply({ imported: 1, batchId: BATCH }));
  assert.deepEqual(await writer().importGuestsThroughApi(importInput(false), ENV), { kind: 'imported', batchId: BATCH, imported: 1, summary });
  assert.match(sent[0].headers['idempotency-key'], UUID);
  assert.equal(JSON.parse(sent[0].body).dryRun, false);

  const refused = { verdicts: [], ok: 0, invalid: 0, duplicate: 0, refusal: 'too_many_rows' };
  scriptApi({ status: 200, body: { ...refused, imported: 0 } });
  assert.deepEqual(await writer().importGuestsThroughApi(importInput(false), ENV), { kind: 'refused', summary: refused });
});

test('undo: an empty signed POST naming the batch; the answer counts what was deleted and what was kept', async () => {
  const sent = scriptApi({ status: 200, body: { deleted: 3, kept: 1 } });
  const input = { ownerToken: OWNER, invitationId: 7, batchId: BATCH };
  assert.deepEqual(await writer().undoImportThroughApi(input, ENV), { kind: 'undone', deleted: 3, kept: 1 });
  const path = `/v1/invitations/7/guest-imports/${BATCH}/undo`;
  assert.equal(sent[0].url, `http://api.test${path}`);
  assert.equal(sent[0].body, '');
  assert.match(sent[0].headers['idempotency-key'], UUID);
  assertSigned(sent[0], path);
  scriptApi(problem(404, 'roster.not_found'));
  assert.deepEqual(await writer().undoImportThroughApi(input, ENV), { kind: 'notfound' });
});

test('operations, invite-only events, category invitations, the link and decisions send the API\'s wire values', async () => {
  const owner = { ownerToken: OWNER, invitationId: 7 };
  for (const [operation, wire] of [['sent', 'SENT'], ['checkin', 'CHECKIN'], ['undo-checkin', 'UNDO_CHECKIN']] as const) {
    const sent = scriptApi({ status: 200, body: {} });
    assert.deepEqual(await writer().guestOperationThroughApi({ ...owner, guestId: 3, operation }, ENV), { kind: 'saved' });
    assert.equal(sent[0].url, 'http://api.test/v1/invitations/7/guests/3/operation');
    assert.deepEqual(JSON.parse(sent[0].body), { operation: wire });
  }

  let sent = scriptApi({ status: 200, body: {} });
  assert.deepEqual(await writer().setInvitedEventsThroughApi({ ...owner, guestId: 3, ticked: ['akad'], flags: FLAGS }, ENV), { kind: 'saved' });
  assert.deepEqual(JSON.parse(sent[0].body), { ticked: ['akad'], flags: FLAGS });
  scriptApi(problem(422, 'roster.invite_invalid'));
  assert.deepEqual(await writer().setInvitedEventsThroughApi({ ...owner, guestId: 3, ticked: [], flags: FLAGS }, ENV), { kind: 'invalid' });

  sent = scriptApi({ status: 200, body: { changed: 4 } });
  const category = { ...owner, eventId: 'akad', category: 'Keluarga', mode: 'remove' as const, flags: FLAGS };
  assert.deepEqual(await writer().setCategoryInvitationThroughApi(category, ENV), { kind: 'saved', changed: 4 });
  assert.deepEqual(JSON.parse(sent[0].body), { eventId: 'akad', category: 'Keluarga', mode: 'REMOVE', flags: FLAGS });

  sent = scriptApi({ status: 200, body: { token: LINK } }, { status: 200, body: { token: null } });
  assert.deepEqual(await writer().registrationLinkThroughApi({ ...owner, action: 'rotate' }, ENV), { kind: 'saved', token: LINK });
  assert.deepEqual(await writer().registrationLinkThroughApi({ ...owner, action: 'close' }, ENV), { kind: 'saved', token: null });
  assert.deepEqual(sent.map((request) => JSON.parse(request.body)), [{ action: 'ROTATE' }, { action: 'CLOSE' }]);

  const decide = (decision: 'approve' | 'reject') =>
    writer().decideRegistrationThroughApi({ ...owner, registrationId: 9, decision, flags: FLAGS }, ENV);
  sent = scriptApi({ status: 200, body: { status: 'APPROVED', guestId: 12 } }, { status: 200, body: { status: 'REJECTED', guestId: null } });
  assert.deepEqual(await decide('approve'), { kind: 'approved', guestId: 12 });
  assert.deepEqual(await decide('reject'), { kind: 'rejected' });
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/7/registrations/9/decision');
  assert.deepEqual(sent.map((request) => JSON.parse(request.body).decision), ['APPROVE', 'REJECT']);
  const refusals: [Scripted, unknown][] = [
    [problem(409, 'roster.duplicate'), { kind: 'duplicate' }],
    [problem(409, 'roster.full'), { kind: 'full' }],
    [problem(422, 'roster.row_invalid', { reason: 'seats' }), { kind: 'invalid', reason: 'seats' }],
  ];
  for (const [reply, expected] of refusals) {
    scriptApi(reply);
    assert.deepEqual(await decide('approve'), expected, JSON.stringify(reply));
  }
});

const registration = (overrides: Record<string, unknown> = {}) => ({
  token: LINK,
  row: { name: 'Eka Putri', phone: '0812 0000 0000', guestCount: '2' },
  clientIp: '203.0.113.7',
  idempotencyKey: FORM_KEY,
  ...overrides,
});

test('registration: no owner token; the form key makes a double submit one write; a reused key with other values resubmits under a fresh key', async () => {
  let sent = scriptApi({ status: 200, body: { status: 'RECEIVED' } });
  assert.deepEqual(await writer().registerThroughApi(registration(), ENV), { kind: 'received' });
  const path = `/v1/registration-links/${LINK}/registrations`;
  assert.equal(sent[0].url, `http://api.test${path}`);
  assert.equal(sent[0].headers.authorization, undefined);
  assert.equal(sent[0].headers['idempotency-key'], FORM_KEY);
  assert.deepEqual(JSON.parse(sent[0].body), { name: 'Eka Putri', phone: '0812 0000 0000', guestCount: '2', clientIp: '203.0.113.7' });
  assertSigned(sent[0], path);

  sent = scriptApi(problem(409, 'idempotency.key_reused'), { status: 200, body: { status: 'RECEIVED' } });
  assert.deepEqual(await writer().registerThroughApi(registration(), ENV), { kind: 'received' });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].headers['idempotency-key'], FORM_KEY);
  assert.match(sent[1].headers['idempotency-key'], UUID);
  assert.notEqual(sent[1].headers['idempotency-key'], FORM_KEY);
});

test('registration: refusals reach the registrant as closed, full, invalid or busy; an unknown outcome returns the key to resubmit', async () => {
  const cases: [Scripted, unknown][] = [
    [problem(404, 'registration.link_not_found'), { kind: 'closed' }],
    [problem(404, 'registration.closed'), { kind: 'closed' }],
    [problem(409, 'registration.full'), { kind: 'full' }],
    [problem(422, 'roster.row_invalid', { reason: 'seats' }), { kind: 'invalid', reason: 'seats' }],
    [{ ...problem(429, 'rate_limit.exceeded'), headers: { 'retry-after': '120' } }, { kind: 'busy', retryAfter: 120 }],
    [problem(429, 'rate_limit.exceeded'), { kind: 'busy' }],
  ];
  for (const [reply, expected] of cases) {
    scriptApi(reply);
    assert.deepEqual(await writer().registerThroughApi(registration(), ENV), expected, JSON.stringify(reply));
  }

  const sent = scriptApi('drop', 'drop');
  const { value, logged } = await quietly(() => writer().registerThroughApi(registration(), ENV));
  assert.deepEqual(value, { kind: 'unconfirmed', key: FORM_KEY });
  assert.equal(sent.length, 2);
  assert.doesNotMatch(logged.join('\n'), /Eka|0812|203\.0\.113\.7/);

  const none = scriptApi();
  for (const token of ['', '.', '..']) {
    assert.deepEqual(await writer().registerThroughApi(registration({ token }), ENV), { kind: 'closed' });
  }
  assert.equal(none.length, 0, 'a dot segment never reaches the API');
});

test('the facade: BACKEND_ROSTER=rust answers from the API alone; no session is sign-in without a request; flags come from the environment', async () => {
  const env = { ...ENV, BACKEND_ROSTER: 'rust' };
  const caller = { userId: 1, ownerToken: async () => OWNER };
  let sent = scriptApi('drop', 'drop');
  const { value } = await quietly(() => facade().rosterOperation(caller, { invitationId: 7, guestId: 3, operation: 'checkin' }, env));
  assert.deepEqual(value, { kind: 'unconfirmed' }, 'an unknown outcome is never retried through the other writer');
  assert.equal(sent.length, 2);

  sent = scriptApi();
  const signedOut = { userId: 1, ownerToken: async () => null };
  assert.deepEqual(await facade().addRosterGuest(signedOut, { invitationId: 7, row: { name: 'Budi' }, invitedEventIds: [] }, env), { kind: 'signin' });
  assert.equal(sent.length, 0);

  sent = scriptApi({ status: 200, body: { id: 1, slug: 'budi' } });
  const flagged = { ...env, FLAG_OPAQUE_GUEST_LINKS: 'off', FLAG_INVITE_ONLY_EVENTS: 'on' };
  await facade().addRosterGuest(caller, { invitationId: 7, row: { name: 'Budi' }, invitedEventIds: [] }, flagged);
  assert.deepEqual(JSON.parse(sent[0].body).flags, { opaqueLinks: false, inviteOnlyEvents: true });

  sent = scriptApi({ status: 200, body: { status: 'RECEIVED' } });
  assert.deepEqual(await facade().registerRosterGuest(registration(), env), { kind: 'received' });
  assert.equal(sent.length, 1);
});

const ROOT = process.cwd();
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const codeUnder = (dir: string) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => join(dir, file).split('\\').join('/'));

const ROSTER_COLUMNS = /\.update\(guests\)\s*\.set\(\{[^}]*\b(?:name|phone|category|guestCount|slug|linkToken|invitedEventIds|sentAt|checkedInAt|importBatchId)\s*:/;

test('guards: only the facade loads a roster writer, and no roster row or column is written outside the TypeScript writer', () => {
  const files = [...codeUnder('app'), ...codeUnder('components'), ...codeUnder('lib')];
  assert.ok(files.length > 100, 'the walk found the app');
  for (const file of files) {
    const text = source(file);
    if (file !== 'lib/invitation/roster.ts') {
      assert.doesNotMatch(text, /['"](?:@\/lib\/invitation\/|\.\/)roster-(?:next|api)['"]/, `${file} loads a roster writer`);
    }
    if (file === 'lib/invitation/roster-next.ts') continue;
    assert.doesNotMatch(text, /\.(?:insert|delete)\((?:guests|guestRegistrations|guestRegistrationLinks)\)/, `${file} writes roster rows`);
    assert.doesNotMatch(text, ROSTER_COLUMNS, `${file} writes roster columns`);
  }
});

test('guards: each facade write picks one writer with no fallback, and every call site goes through the facade', () => {
  const roster = source('lib/invitation/roster.ts');
  // B-024 (D-056) added the tenth write, the scanner's pass check-ins (`checkInWithPasses`).
  assert.equal(roster.match(/^export async function \w+/gm)?.length, 10);
  assert.equal(roster.match(/if \(rust\(env\)\)/g)?.length, 10, 'one choice per write');
  assert.equal(roster.match(/return next\.\w+\(/g)?.length, 10, 'the TypeScript writer runs only when the Rust branch was not taken');
  assert.doesNotMatch(roster, /\bcatch\b/, 'no fallback from one writer to the other');

  const callSites: Record<string, string[]> = {
    'app/(customer)/dashboard/guests/actions.ts': ['addRosterGuest', 'rosterOperation'],
    'app/(customer)/dashboard/invitations/[id]/guests/actions.ts': ['addRosterGuest', 'rosterOperation', 'setRosterInvitedEvents', 'setRosterCategoryInvitation'],
    'app/(customer)/dashboard/invitations/[id]/guests/import/actions.ts': ['importRosterGuests', 'undoRosterImport'],
    'app/(customer)/dashboard/invitations/[id]/guests/registration-actions.ts': ['setRegistrationLink', 'decideRosterRegistration'],
    'app/daftar/[token]/actions.ts': ['registerRosterGuest'],
    'app/api/invitations/[id]/checkins/route.ts': ['checkInWithPasses'],
    'app/(customer)/dashboard/invitations/[id]/checkin/actions.ts': ['rosterOperation'],
  };
  for (const [file, calls] of Object.entries(callSites)) {
    for (const call of calls) assert.match(source(file), new RegExp(`\\b${call}\\(`), `${file} → ${call}`);
  }

  // The per-invitation actions keep one direct write: the host's RSVP override (R-03's writer, RSVP columns only).
  const scoped = source('app/(customer)/dashboard/invitations/[id]/guests/actions.ts');
  assert.deepEqual(scoped.match(/\.update\(guests\)\.set\(\w+\)/g), ['.update(guests).set(update)']);
  assert.match(scoped, /const update = decideHostRsvp\(/);
  assert.doesNotMatch(source('app/(customer)/dashboard/guests/actions.ts'), /@\/lib\/db\/(?:drizzle|schema)/, 'the global list writes nothing itself');
});

test('guards: the import and self-registration stay behind their flags (self-registration off by default)', () => {
  assert.equal(flags().isFlagOn('GUEST_IMPORT', {}), true);
  assert.equal(flags().isFlagOn('SELF_REGISTRATION', {}), false, 'the public form waits on B-021\'s approved notice');
  const importActions = source('app/(customer)/dashboard/invitations/[id]/guests/import/actions.ts');
  assert.equal(importActions.match(/!isFlagOn\('GUEST_IMPORT'\)/g)?.length, 2, 'the preview and the import');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/guests/registration-actions.ts'), /if \(!isFlagOn\('SELF_REGISTRATION'\)\) redirect/);
  assert.match(source('app/daftar/[token]/actions.ts'), /if \(!isFlagOn\('SELF_REGISTRATION'\)\) redirect\(path\);/);
  assert.match(source('app/daftar/[token]/page.tsx'), /if \(!isFlagOn\('SELF_REGISTRATION'\)\) notFound\(\);/);
});
