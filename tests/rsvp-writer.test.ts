// R-03 (D-043): the Rust writer's call sites against a scripted API. Every write carries an Idempotency-Key; an unknown
// outcome is sent once more under the same key and nothing else; refusals map to the notices the TypeScript writer gives.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { signServiceRequest } from '../lib/api/signature';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
const writer = () => require('../lib/invitation/rsvp-writer') as typeof import('../lib/invitation/rsvp-writer');
const client = () => require('../lib/api/client') as typeof import('../lib/api/client');

const SECRET = 'rsvp-writer-test-secret-0123456789abcdef';
const ENV = { API_BASE_URL: 'http://api.test', INTERNAL_API_SECRET: SECRET };
const FLAGS = { maybe: true, perEvent: true, inviteOnlyEvents: true, questions: true };
const SUBMISSION = { status: 'CONFIRMED', guestCount: '2', events: {}, answers: {} };
const FORM_KEY = 'form-key-0123456789abcdef';

type Sent = { url: string; headers: Record<string, string>; body: string };
type Scripted = { status: number; body?: unknown; headers?: Record<string, string> } | 'drop';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers each request with the next scripted reply ('drop' = the connection fails) and records what was sent. */
function scriptApi(...replies: Scripted[]): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body ?? '') });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    if (reply === 'drop') throw new TypeError('fetch failed');
    const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(body, { status: reply.status, headers: reply.headers });
  }) as typeof fetch;
  return sent;
}

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { type: `https://invitesion.id/problems/${code}`, title: 'x', status, code, ...extra },
});
const ok = { status: 200, body: { status: 'CONFIRMED', attendingCount: 2 } };

/** Codes and status only reach the log, never the slug, link or address. */
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

const guest = (overrides: Partial<Parameters<ReturnType<typeof writer>['writeGuestRsvpThroughApi']>[0]> = {}) =>
  writer().writeGuestRsvpThroughApi(
    { slug: 'budi-sari', guestSlug: 'tok_AbC-123', submission: SUBMISSION, flags: FLAGS, clientIp: '203.0.113.7', idempotencyKey: FORM_KEY, ...overrides },
    ENV,
  );

test('a guest write sends the form key, the signed templated path and the body, and is saved on 200', async () => {
  const sent = scriptApi(ok);
  assert.deepEqual(await guest({ slug: 'budi sari/ñ', guestSlug: 'a?b#c' }), { kind: 'saved' });
  assert.equal(sent.length, 1);
  const path = '/v1/guest-links/budi%20sari%2F%C3%B1/a%3Fb%23c/rsvp';
  assert.equal(sent[0].url, `http://api.test${path}`);
  assert.equal(new URL(sent[0].url).pathname, path, 'the URL parser keeps the signed path byte for byte');
  assert.equal(sent[0].headers['idempotency-key'], FORM_KEY);
  assert.deepEqual(JSON.parse(sent[0].body), { submission: SUBMISSION, flags: FLAGS, clientIp: '203.0.113.7' });
  const t = Number(/^t=(\d+),/.exec(sent[0].headers['x-invitesion-signature'])?.[1]);
  assert.equal(sent[0].headers['x-invitesion-signature'], signServiceRequest(SECRET, t, 'POST', path, sent[0].body));
});

test('without a form key the writer still sends one, so its own retry can never write twice', async () => {
  const sent = scriptApi('drop', ok);
  assert.deepEqual(await guest({ idempotencyKey: null, clientIp: null }), { kind: 'saved' });
  assert.match(sent[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
  assert.equal('clientIp' in JSON.parse(sent[0].body), false, 'no address, no per-address limit');
});

test('an unknown outcome is sent exactly once more under the same key, with the same bytes', async () => {
  for (const first of ['drop', problem(503, 'database.unavailable'), { status: 502, body: '<html>bad gateway</html>' }, problem(504, 'request.timeout'), problem(500, 'internal')] as Scripted[]) {
    const sent = scriptApi(first, ok);
    assert.deepEqual(await guest(), { kind: 'saved' }, JSON.stringify(first));
    assert.equal(sent.length, 2);
    assert.equal(sent[1].headers['idempotency-key'], FORM_KEY);
    assert.equal(sent[1].body, sent[0].body);
    assert.equal(sent[1].url, sent[0].url);
  }
});

test('two unknown outcomes are "unconfirmed" with the key to send again; nothing else is tried', async () => {
  const sent = scriptApi('drop', problem(503, 'database.unavailable'));
  const { value, logged } = await quietly(() => guest());
  assert.deepEqual(value, { kind: 'unconfirmed', key: FORM_KEY });
  assert.equal(sent.length, 2);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /503 database\.unavailable/);
  for (const secret of ['budi-sari', 'tok_AbC-123', '203.0.113.7', FORM_KEY]) assert.ok(!logged[0].includes(secret), secret);
});

test('the form key with a changed answer is re-sent once under a fresh key, which a lost answer then reports', async () => {
  const reused = problem(422, 'idempotency.key_reused');
  let sent = scriptApi(reused, ok);
  assert.deepEqual(await guest(), { kind: 'saved' });
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].headers['idempotency-key'], FORM_KEY);
  assert.equal(sent[1].body, sent[0].body);

  sent = scriptApi(reused, 'drop', 'drop');
  const { value } = await quietly(() => guest());
  assert.equal(value.kind, 'unconfirmed');
  const fresh = sent[1].headers['idempotency-key'];
  assert.deepEqual(value, { kind: 'unconfirmed', key: fresh }, 'the key to send again is the fresh one');
  assert.equal(sent[2].headers['idempotency-key'], fresh);
});

test('refusals map to the guest page notices, with the event, question and retry time they name', async () => {
  const cases: [Scripted, unknown][] = [
    [problem(404, 'rsvp.link_not_found'), { kind: 'closed' }],
    [problem(409, 'rsvp.closed', { detail: 'deadline' }), { kind: 'closed' }],
    [problem(422, 'rsvp.status_invalid'), { kind: 'invalid' }],
    [problem(422, 'rsvp.event_answer_missing', { eventId: 'resepsi' }), { kind: 'events', eventId: 'resepsi' }],
    [problem(422, 'rsvp.event_answer_missing'), { kind: 'invalid' }],
    [problem(422, 'rsvp.answer_invalid', { questionId: 'menu' }), { kind: 'answers', questionId: 'menu' }],
    [problem(422, 'rsvp.answer_invalid'), { kind: 'invalid' }],
    [{ ...problem(429, 'rate_limit.exceeded'), headers: { 'retry-after': '137' } }, { kind: 'busy', retryAfter: 137 }],
    [{ ...problem(429, 'rate_limit.exceeded'), headers: { 'retry-after': 'soon' } }, { kind: 'busy' }],
  ];
  for (const [reply, expected] of cases) {
    const sent = scriptApi(reply);
    assert.deepEqual(await guest(), expected, JSON.stringify(reply));
    assert.equal(sent.length, 1, 'a refusal is final: nothing was written and nothing is retried');
  }
});

test('a 400 or 401 is a deployment error: it propagates without a retry', async () => {
  const { ApiProblem } = client();
  for (const reply of [problem(401, 'auth.signature_invalid'), problem(400, 'request.invalid_body'), { status: 404, body: '<html>no route</html>' }] as Scripted[]) {
    const sent = scriptApi(reply);
    await assert.rejects(guest(), (e: unknown) => e instanceof ApiProblem, JSON.stringify(reply));
    assert.equal(sent.length, 1);
  }
});

test('segments URL parsing would rewrite name no link, and a missing configuration fails before any request', async () => {
  const sent = scriptApi();
  for (const guestSlug of ['', '.', '..']) assert.deepEqual(await guest({ guestSlug }), { kind: 'closed' }, guestSlug);
  assert.deepEqual(await guest({ slug: '..' }), { kind: 'closed' });
  assert.equal(sent.length, 0);
  const { ApiConfigError } = client();
  await assert.rejects(
    writer().writeGuestRsvpThroughApi({ slug: 's', guestSlug: 'g', submission: SUBMISSION, flags: FLAGS }, {}),
    (e: unknown) => e instanceof ApiConfigError,
  );
});

const host = (overrides: Partial<Parameters<ReturnType<typeof writer>['writeHostRsvpThroughApi']>[0]> = {}) =>
  writer().writeHostRsvpThroughApi(
    { invitationId: 7, guestId: 42, status: 'CONFIRMED', flags: { perEvent: true, inviteOnlyEvents: true }, ownerToken: 'owner.jwt', ...overrides },
    ENV,
  );

test('a host override forwards the owner token under a key of its own and retries an unknown outcome once', async () => {
  let sent = scriptApi(ok);
  assert.deepEqual(await host({ eventId: 'akad', status: 'DECLINED' }), { kind: 'saved' });
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/7/guests/42/rsvp-override');
  assert.equal(sent[0].headers.authorization, 'Bearer owner.jwt');
  assert.match(sent[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.deepEqual(JSON.parse(sent[0].body), { status: 'DECLINED', flags: { perEvent: true, inviteOnlyEvents: true }, eventId: 'akad' });

  sent = scriptApi(problem(503, 'database.unavailable'), ok);
  assert.deepEqual(await host(), { kind: 'saved' });
  assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
  assert.equal(sent[1].body, sent[0].body);

  sent = scriptApi('drop', 'drop');
  const { value } = await quietly(() => host());
  assert.deepEqual(value, { kind: 'unconfirmed' });
  assert.equal(sent.length, 2);
});

test('host refusals map to the dashboard: invalid, not found, sign-in; a refused token propagates', async () => {
  const cases: [Scripted, unknown][] = [
    [problem(422, 'rsvp.override_invalid'), { kind: 'invalid' }],
    [problem(404, 'invitation_or_guest.not_found'), { kind: 'notfound' }],
    [problem(403, 'owner.unknown_user'), { kind: 'signin' }],
    [problem(403, 'owner.role_not_allowed'), { kind: 'signin' }],
  ];
  for (const [reply, expected] of cases) {
    const sent = scriptApi(reply);
    assert.deepEqual(await host(), expected, JSON.stringify(reply));
    assert.equal(sent.length, 1);
  }
  const { ApiProblem } = client();
  for (const reply of [problem(401, 'owner.token_invalid'), problem(401, 'owner.token_missing')]) {
    scriptApi(reply);
    await assert.rejects(host(), (e: unknown) => e instanceof ApiProblem && e.status === 401);
  }
});

test('the call sites keep one writer per call and the action maps every outcome to a notice', () => {
  const action = readFileSync(join(process.cwd(), 'app/i/[slug]/actions.ts'), 'utf8');
  const rust = action.slice(action.indexOf("if (backendFor('RSVP') === 'rust') {"), action.indexOf('const context = await openInvitationFor('));
  assert.match(rust, /idempotencyKey: isRsvpFormKey\(key\) \? key : null/);
  assert.match(rust, /redirect\(`\$\{guestPath\(slug, guestSlug\)\}\?rsvp=saved`\);\s*\}\s*$/, 'the Rust branch always ends in a redirect');
  assert.doesNotMatch(rust, /db\./, 'the Rust branch never touches the database itself');
  assert.match(action, /rsvp=busy&rsvpr=\$\{refusal\.retryAfter\}/);
  assert.match(action, /rsvp=retry&rsvpk=\$\{encodeURIComponent\(refusal\.key\)\}/);
  const page = readFileSync(join(process.cwd(), 'app/i/[slug]/[guestSlug]/page.tsx'), 'utf8');
  assert.match(page, /rsvpKey=\{rsvpFormKey\(status\.rsvp === 'retry' \? status\.rsvpk : undefined\)\}/, 'only a retry notice carries its key back');
  const host = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/invitations/[id]/guests/actions.ts'), 'utf8');
  assert.match(host, /if \(outcome\.kind === 'signin'\) redirect\('\/sign-in'\);/);
});
