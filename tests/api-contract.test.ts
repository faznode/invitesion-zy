// R-01 / R-02 / R-03: the TypeScript side of the Rust API boundary. The signature vectors are shared with
// services/api/tests/contract_vectors.rs; the client must send exactly the bytes it signed, templated paths included;
// BACKEND_VIEWS, BACKEND_RSVP and BACKEND_WISHES each select exactly one writer and never fall back to the other.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { backendFor } from '../lib/backend';
import { SIGNATURE_HEADER, canonicalMessage, signServiceRequest } from '../lib/api/signature';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
const client = () => require('../lib/api/client') as typeof import('../lib/api/client');

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
type SignCase = { name: string; timestamp: number; method: string; pathAndQuery: string; body: string; header: string };
const vectors = JSON.parse(source('contracts/vectors/service-signature.json')) as {
  secret: string;
  maxSkewSeconds: number;
  signs: SignCase[];
};
const SECRET = 'api-contract-test-secret-0123456789abcdef';

test('R-01: the signer reproduces every shared vector byte for byte', () => {
  assert.ok(vectors.signs.length >= 5);
  for (const c of vectors.signs) {
    assert.equal(signServiceRequest(vectors.secret, c.timestamp, c.method, c.pathAndQuery, c.body), c.header, c.name);
  }
  assert.equal(SIGNATURE_HEADER, 'x-invitesion-signature');
  assert.match(canonicalMessage(1, 'GET', '/v1/health/ready', ''), /^1\.GET\.\/v1\/health\/ready\.e3b0c44298fc1c149afbf4c8996fb924/);
});

test('R-02: BACKEND_VIEWS selects one writer; anything unknown keeps the default', () => {
  assert.equal(backendFor('VIEWS', {}), 'next', 'Next.js until the slice passes its gates');
  assert.equal(backendFor('VIEWS', { BACKEND_VIEWS: 'rust' }), 'rust');
  assert.equal(backendFor('VIEWS', { BACKEND_VIEWS: ' RUST ' }), 'rust');
  assert.equal(backendFor('VIEWS', { BACKEND_VIEWS: 'next' }), 'next');
  for (const odd of ['', 'both', 'rsut', 'true', '1']) assert.equal(backendFor('VIEWS', { BACKEND_VIEWS: odd }), 'next', odd);
});

test('R-01: the client configuration fails closed', () => {
  const { apiConfigFromEnv, ApiConfigError } = client();
  assert.throws(() => apiConfigFromEnv({}), ApiConfigError);
  assert.throws(() => apiConfigFromEnv({ API_BASE_URL: 'http://127.0.0.1:8080' }), ApiConfigError, 'no secret');
  assert.throws(() => apiConfigFromEnv({ API_BASE_URL: 'http://127.0.0.1:8080', INTERNAL_API_SECRET: 'short' }), ApiConfigError);
  assert.throws(() => apiConfigFromEnv({ API_BASE_URL: 'ftp://x', INTERNAL_API_SECRET: SECRET }), ApiConfigError);
  assert.deepEqual(apiConfigFromEnv({ API_BASE_URL: 'https://api.example.invalid//', INTERNAL_API_SECRET: SECRET }), {
    baseUrl: 'https://api.example.invalid',
    secret: SECRET,
  });
});

type Captured = { url: string; method: string; headers: Record<string, string>; body: string };
function fakeFetch(status: number, responseBody: string, captured: Captured[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: String(init?.body ?? '') });
    return new Response(responseBody, { status, headers: { 'content-type': status < 400 ? 'application/json' : 'application/problem+json' } });
  }) as typeof fetch;
}

test('R-01: the client signs exactly the method, path and bytes it sends', async () => {
  const { apiPost, apiGet } = client();
  const captured: Captured[] = [];
  const config = { baseUrl: 'http://api.test', secret: SECRET, fetch: fakeFetch(200, '{"recorded":true}', captured) };
  assert.deepEqual(await apiPost(config, '/v1/views', { invitationId: 7, guestId: 42 }, { requestId: 'req-1' }), { recorded: true });
  await apiGet({ ...config, fetch: fakeFetch(200, '{"userId":1,"role":"CUSTOMER"}', captured) }, '/v1/me', { ownerToken: 'tok' });
  const [post, get] = captured;
  assert.equal(post.url, 'http://api.test/v1/views');
  assert.equal(post.body, '{"invitationId":7,"guestId":42}');
  assert.equal(post.headers['x-request-id'], 'req-1');
  const t = Number(/^t=(\d+),v1=[0-9a-f]{64}$/.exec(post.headers[SIGNATURE_HEADER])?.[1]);
  assert.ok(Math.abs(t - Date.now() / 1000) < 5, 'signed now');
  assert.equal(post.headers[SIGNATURE_HEADER], signServiceRequest(SECRET, t, 'POST', '/v1/views', post.body));
  assert.equal(get.method, 'GET');
  assert.equal(get.body, '');
  assert.equal(get.headers.authorization, 'Bearer tok');
  const tGet = Number(/^t=(\d+),/.exec(get.headers[SIGNATURE_HEADER])?.[1]);
  assert.equal(get.headers[SIGNATURE_HEADER], signServiceRequest(SECRET, tGet, 'GET', '/v1/me', ''));
});

test('R-01: problems and transport failures surface as ApiProblem with a stable code', async () => {
  const { apiPost, ApiProblem } = client();
  const problem = JSON.stringify({ type: 'https://invitesion.id/problems/invitation_or_guest.not_found', title: 'Not found', status: 404, code: 'invitation_or_guest.not_found' });
  const notFound = { baseUrl: 'http://api.test', secret: SECRET, fetch: fakeFetch(404, problem, []) };
  await assert.rejects(apiPost(notFound, '/v1/views', { invitationId: 7 }), (e: unknown) => e instanceof ApiProblem && e.status === 404 && e.code === 'invitation_or_guest.not_found');
  const html = { baseUrl: 'http://api.test', secret: SECRET, fetch: fakeFetch(502, '<html>bad gateway</html>', []) };
  await assert.rejects(apiPost(html, '/v1/views', { invitationId: 7 }), (e: unknown) => e instanceof ApiProblem && e.status === 502 && e.code === 'transport.unexpected_status');
  const down = { baseUrl: 'http://127.0.0.1:9', secret: SECRET, timeoutMs: 2000 };
  await assert.rejects(apiPost(down, '/v1/views', { invitationId: 7 }), (e: unknown) => e instanceof ApiProblem && e.status === 0 && e.code.startsWith('transport.'));
});

test('R-02: the guest page records opens through the writer selection, with no fallback writer', () => {
  const writer = source('lib/invitation/view-writer.ts');
  assert.match(writer, /if \(backendFor\('VIEWS', env\) === 'rust'\) \{[\s\S]*?apiPost\(apiConfigFromEnv\(env\), '\/v1\/views', body\);\s*return recorded;\s*\}\s*return recordInvitationView\(db, invitationId, guestId\);/);
  assert.doesNotMatch(writer, /catch/, 'errors propagate to the best-effort caller instead of reaching the other writer');
  const loader = source('lib/invitation/public.ts');
  assert.match(loader, /await writeInvitationView\(invitationId, guestId\);/);
  assert.doesNotMatch(loader, /recordInvitationView\(/, 'the TypeScript writer is reached only through the selection');
  for (const page of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx']) assert.match(source(page), /after\(\(\) => trackInvitationView\(/, page);
});

test('R-03: BACKEND_RSVP selects one writer by the same rule as views', () => {
  assert.equal(backendFor('RSVP', {}), 'next');
  assert.equal(backendFor('RSVP', { BACKEND_RSVP: 'rust' }), 'rust');
  assert.equal(backendFor('RSVP', { BACKEND_RSVP: 'rust', BACKEND_VIEWS: 'next' }), 'rust', 'domains switch independently');
  assert.equal(backendFor('VIEWS', { BACKEND_RSVP: 'rust' }), 'next');
  for (const odd of ['', 'both', 'Rust,next']) assert.equal(backendFor('RSVP', { BACKEND_RSVP: odd }), 'next', odd);
});

test('R-03: a templated path encodes each parameter as exactly one segment, which the URL parser leaves alone', () => {
  const { expandPath, ApiConfigError } = client();
  const path = expandPath('/v1/guest-links/{slug}/{guest}/rsvp', { slug: 'a b/c?d#e%f', guest: 'ñ..\\x' });
  assert.equal(path, '/v1/guest-links/a%20b%2Fc%3Fd%23e%25f/%C3%B1..%5Cx/rsvp');
  assert.equal(new URL(`http://api.test${path}`).pathname, path, 'what is signed is what is sent');
  assert.equal(expandPath('/v1/invitations/{invitation}/guests/{guest}/rsvp-override', { invitation: 7, guest: 42 }), '/v1/invitations/7/guests/42/rsvp-override');
  assert.throws(() => expandPath('/v1/guest-links/{slug}/{guest}/rsvp', { slug: 'x' }), ApiConfigError);
});

test('R-03: apiPostTo signs the expanded path and the exact body, and sends the key and owner token', async () => {
  const { apiPostTo } = client();
  const captured: Captured[] = [];
  const config = { baseUrl: 'http://api.test', secret: SECRET, fetch: fakeFetch(200, '{"status":"PENDING","attendingCount":null}', captured) };
  const body = { status: 'PENDING' as const, flags: { perEvent: false, inviteOnlyEvents: false } };
  await apiPostTo(config, '/v1/invitations/{invitation}/guests/{guest}/rsvp-override', { invitation: 3, guest: 9 }, body, { ownerToken: 'tok', idempotencyKey: 'key-0123456789abcdef' });
  const [sent] = captured;
  assert.equal(sent.url, 'http://api.test/v1/invitations/3/guests/9/rsvp-override');
  assert.equal(sent.body, JSON.stringify(body));
  assert.equal(sent.headers.authorization, 'Bearer tok');
  assert.equal(sent.headers['idempotency-key'], 'key-0123456789abcdef');
  const t = Number(/^t=(\d+),/.exec(sent.headers[SIGNATURE_HEADER])?.[1]);
  assert.equal(sent.headers[SIGNATURE_HEADER], signServiceRequest(SECRET, t, 'POST', '/v1/invitations/3/guests/9/rsvp-override', sent.body));
});

test('R-03: a problem carries the event or question it names and the Retry-After of a 429', async () => {
  const { apiPostTo, ApiProblem } = client();
  const params = { slug: 's', guest: 'g' };
  const body = { submission: { status: 'CONFIRMED', guestCount: null, events: {}, answers: {} }, flags: { maybe: true, perEvent: true, inviteOnlyEvents: true, questions: true } };
  const answer = async (status: number, problem: object, headers: Record<string, string> = {}) => {
    const fetch = (async () => new Response(JSON.stringify(problem), { status, headers })) as unknown as typeof globalThis.fetch;
    return apiPostTo({ baseUrl: 'http://api.test', secret: SECRET, fetch }, '/v1/guest-links/{slug}/{guest}/rsvp', params, body).then(
      () => null,
      (e: unknown) => e,
    );
  };
  const event = await answer(422, { code: 'rsvp.event_answer_missing', eventId: 'resepsi' });
  assert.ok(event instanceof ApiProblem && event.extras.eventId === 'resepsi' && event.extras.questionId === undefined);
  const question = await answer(422, { code: 'rsvp.answer_invalid', questionId: 'menu' });
  assert.ok(question instanceof ApiProblem && question.extras.questionId === 'menu');
  const limited = await answer(429, { code: 'rate_limit.exceeded' }, { 'retry-after': '42' });
  assert.ok(limited instanceof ApiProblem && limited.status === 429 && limited.extras.retryAfter === 42);
  for (const odd of ['0', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
    const e = await answer(429, { code: 'rate_limit.exceeded' }, { 'retry-after': odd });
    assert.ok(e instanceof ApiProblem && e.extras.retryAfter === undefined, odd);
  }
  const wrongTypes = await answer(422, { code: 'rsvp.answer_invalid', questionId: 7, eventId: ['x'] });
  assert.ok(wrongTypes instanceof ApiProblem && wrongTypes.extras.questionId === undefined && wrongTypes.extras.eventId === undefined);
});

test('R-04: BACKEND_WISHES selects one writer by the same rule, independently of the other domains', () => {
  assert.equal(backendFor('WISHES', {}), 'next');
  assert.equal(backendFor('WISHES', { BACKEND_WISHES: ' Rust ' }), 'rust');
  assert.equal(backendFor('WISHES', { BACKEND_RSVP: 'rust', BACKEND_VIEWS: 'rust' }), 'next', 'domains switch independently');
  assert.equal(backendFor('RSVP', { BACKEND_WISHES: 'rust' }), 'next');
  for (const odd of ['', 'both', 'rust next']) assert.equal(backendFor('WISHES', { BACKEND_WISHES: odd }), 'next', odd);
});

test('R-04: the wish paths expand, sign and type like the RSVP ones', async () => {
  const { apiPostTo, expandPath } = client();
  assert.equal(expandPath('/v1/guest-links/{slug}/{guest}/wishes', { slug: 'a/b', guest: '%2e%2e' }), '/v1/guest-links/a%2Fb/%252e%252e/wishes');
  const captured: Captured[] = [];
  const config = { baseUrl: 'http://api.test', secret: SECRET, fetch: fakeFetch(200, '{"id":5,"hostReply":null}', captured) };
  await apiPostTo(config, '/v1/invitations/{invitation}/wishes/{wish}/reply', { invitation: 3, wish: 5 }, { reply: '' }, { ownerToken: 'tok', idempotencyKey: 'key-0123456789abcdef' });
  const [sent] = captured;
  assert.equal(sent.url, 'http://api.test/v1/invitations/3/wishes/5/reply');
  const t = Number(/^t=(\d+),/.exec(sent.headers[SIGNATURE_HEADER])?.[1]);
  assert.equal(sent.headers[SIGNATURE_HEADER], signServiceRequest(SECRET, t, 'POST', '/v1/invitations/3/wishes/5/reply', '{"reply":""}'));
  const schema = source('lib/api/schema.d.ts');
  for (const name of ['GuestWishRequest', 'WishSaved', 'WishModerationRequest', 'WishReplied']) assert.match(schema, new RegExp(`${name}: \\{`));
  assert.match(schema, /WishAction: "SHOW" \| "HIDE" \| "DELETE"/);
});

test('R-01: the generated client types describe the committed OpenAPI document', () => {
  const doc = JSON.parse(source('services/api/openapi.json')) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(doc.openapi, '3.1.0');
  const schema = source('lib/api/schema.d.ts');
  for (const path of Object.keys(doc.paths)) assert.ok(schema.includes(`"${path}": {`), `${path} in schema.d.ts`);
  assert.match(schema, /RecordView: \{/);
});
