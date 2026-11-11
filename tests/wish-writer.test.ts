// R-04 (D-044): the Rust writer's wish call sites against a scripted API. Every write carries an Idempotency-Key; an
// unknown outcome is sent once more under the same key and nothing else; refusals map to the notices the TypeScript writer
// gives; the call sites pick exactly one writer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { signServiceRequest } from '../lib/api/signature';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
const writer = () => require('../lib/invitation/wish-writer') as typeof import('../lib/invitation/wish-writer');
const client = () => require('../lib/api/client') as typeof import('../lib/api/client');

const SECRET = 'wish-writer-test-secret-0123456789abcdef';
const ENV = { API_BASE_URL: 'http://api.test', INTERNAL_API_SECRET: SECRET };
const FORM_KEY = 'wish-key-0123456789abcdef';

type Sent = { url: string; headers: Record<string, string>; body: string };
type Scripted = { status: number; body?: unknown; headers?: Record<string, string> } | 'drop';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

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

const problem = (status: number, code: string, headers?: Record<string, string>) => ({
  status,
  body: { type: `https://invitesion.id/problems/${code}`, title: 'x', status, code },
  headers,
});
const stored = (state: 'VISIBLE' | 'PENDING') => ({ status: 200, body: { id: 41, state } });

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

const guest = (overrides: Partial<Parameters<ReturnType<typeof writer>['writeGuestWishThroughApi']>[0]> = {}) =>
  writer().writeGuestWishThroughApi(
    { slug: 'budi-sari', guestSlug: 'tok_AbC-123', message: ' Selamat! ', clientIp: '203.0.113.7', idempotencyKey: FORM_KEY, ...overrides },
    ENV,
  );

test('a guest wish sends the form key, the signed templated path and the raw message; VISIBLE is saved, PENDING pending', async () => {
  const sent = scriptApi(stored('VISIBLE'), stored('PENDING'));
  assert.deepEqual(await guest({ slug: 'budi sari/ñ', guestSlug: 'a?b#c' }), { kind: 'saved' });
  const path = '/v1/guest-links/budi%20sari%2F%C3%B1/a%3Fb%23c/wishes';
  assert.equal(sent[0].url, `http://api.test${path}`);
  assert.equal(new URL(sent[0].url).pathname, path, 'the URL parser keeps the signed path byte for byte');
  assert.equal(sent[0].headers['idempotency-key'], FORM_KEY);
  assert.deepEqual(JSON.parse(sent[0].body), { message: ' Selamat! ', clientIp: '203.0.113.7' }, 'the API trims, as the rules say');
  const t = Number(/^t=(\d+),/.exec(sent[0].headers['x-invitesion-signature'])?.[1]);
  assert.equal(sent[0].headers['x-invitesion-signature'], signServiceRequest(SECRET, t, 'POST', path, sent[0].body));
  assert.deepEqual(await guest(), { kind: 'pending' });
});

test('an unknown outcome is sent once more under the same key and bytes, then reported unconfirmed with the key', async () => {
  const sent = scriptApi('drop', stored('VISIBLE'));
  assert.deepEqual(await guest(), { kind: 'saved' });
  assert.equal(sent.length, 2);
  assert.deepEqual([sent[1].headers['idempotency-key'], sent[1].body], [sent[0].headers['idempotency-key'], sent[0].body]);

  const twice = scriptApi(problem(503, 'database.unavailable'), 'drop');
  const { value, logged } = await quietly(() => guest());
  assert.deepEqual(value, { kind: 'unconfirmed', key: FORM_KEY });
  assert.equal(twice.length, 2, 'exactly two sends, never a third or another writer');
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /budi|tok_|203\.0\.113|Selamat/, 'codes and status only');
});

test('a guest wish without a form key mints one; the form key with another message goes once under a fresh key', async () => {
  const minted = scriptApi(stored('VISIBLE'));
  await guest({ idempotencyKey: null });
  assert.match(minted[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);

  const sent = scriptApi(problem(422, 'idempotency.key_reused'), stored('VISIBLE'));
  assert.deepEqual(await guest(), { kind: 'saved' });
  assert.equal(sent[0].headers['idempotency-key'], FORM_KEY);
  assert.notEqual(sent[1].headers['idempotency-key'], FORM_KEY);
  assert.equal(sent[1].body, sent[0].body);
});

test('guest refusals map to the notices; deployment errors propagate without a retry', async () => {
  const cases: Array<[Scripted, unknown]> = [
    [problem(404, 'wish.link_not_found'), { kind: 'closed' }],
    [problem(409, 'wish.closed'), { kind: 'closed' }],
    [problem(422, 'wish.message_invalid'), { kind: 'invalid' }],
    [problem(429, 'rate_limit.exceeded', { 'retry-after': '120' }), { kind: 'busy', retryAfter: 120 }],
    [problem(429, 'rate_limit.exceeded'), { kind: 'busy' }],
  ];
  for (const [reply, expected] of cases) {
    scriptApi(reply);
    assert.deepEqual(await guest(), expected, JSON.stringify(reply));
  }
  for (const status of [400, 401]) {
    const sent = scriptApi(problem(status, status === 400 ? 'request.invalid_body' : 'auth.signature_invalid'));
    await assert.rejects(guest(), client().ApiProblem);
    assert.equal(sent.length, 1);
  }
  for (const segment of ['', '.', '..']) {
    scriptApi();
    assert.deepEqual(await guest({ guestSlug: segment }), { kind: 'closed' }, `segment ${JSON.stringify(segment)} never reaches the API`);
  }
});

test('host moderation and replies: owner token, one key per action, the outcome mapping', async () => {
  const host = writer();
  const sent = scriptApi('drop', { status: 200, body: { id: 7, state: 'DELETED' } });
  assert.deepEqual(await host.moderateWishThroughApi({ invitationId: 3, wishId: 7, action: 'delete', ownerToken: 'tok' }, ENV), { kind: 'saved' });
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/3/wishes/7/moderation');
  assert.deepEqual(JSON.parse(sent[0].body), { action: 'DELETE' });
  assert.equal(sent[0].headers.authorization, 'Bearer tok');
  assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key'], 'a retried delete replays');

  const reply = scriptApi({ status: 200, body: { id: 7, hostReply: 'Terima kasih' } });
  assert.deepEqual(await host.replyToWishThroughApi({ invitationId: 3, wishId: 7, reply: ' Terima kasih ', ownerToken: 'tok' }, ENV), { kind: 'saved' });
  assert.equal(reply[0].url, 'http://api.test/v1/invitations/3/wishes/7/reply');
  assert.deepEqual(JSON.parse(reply[0].body), { reply: ' Terima kasih ' });

  const cases: Array<[Scripted, unknown]> = [
    [problem(404, 'invitation_or_wish.not_found'), { kind: 'notfound' }],
    [problem(403, 'owner.role_not_allowed'), { kind: 'signin' }],
    [problem(403, 'owner.unknown_user'), { kind: 'signin' }],
    [problem(422, 'wish.reply_invalid'), { kind: 'invalid' }],
  ];
  for (const [answer, expected] of cases) {
    scriptApi(answer);
    assert.deepEqual(await host.replyToWishThroughApi({ invitationId: 3, wishId: 7, reply: 'x', ownerToken: 'tok' }, ENV), expected);
  }
  scriptApi(problem(502, 'transport.unexpected_status'), 'drop');
  const { value } = await quietly(() => host.moderateWishThroughApi({ invitationId: 3, wishId: 7, action: 'hide', ownerToken: 'tok' }, ENV));
  assert.deepEqual(value, { kind: 'unconfirmed' });
  scriptApi(problem(401, 'owner.token_invalid'));
  await assert.rejects(host.moderateWishThroughApi({ invitationId: 3, wishId: 7, action: 'show', ownerToken: 'tok' }, ENV), client().ApiProblem);
});

test('call sites: exactly one writer per call, the form key travels, the dashboard sends no administrator through', () => {
  const actions = readFileSync(join(process.cwd(), 'app/i/[slug]/actions.ts'), 'utf8');
  const wish = actions.slice(actions.indexOf('export async function submitGuestMessage'));
  const rustBranch = wish.slice(wish.indexOf("backendFor('WISHES') === 'rust'"), wish.indexOf('const context = await openInvitationFor'));
  assert.match(rustBranch, /redirect\(`\$\{guestPath\(slug, guestSlug\)\}\?\$\{wishQuery\(outcome\)\}`\);\n\s*\}/, 'the Rust branch always ends in a redirect');
  assert.match(rustBranch, /isFormKey\(key\) \? key : null/);
  const page = readFileSync(join(process.cwd(), 'app/i/[slug]/[guestSlug]/page.tsx'), 'utf8');
  assert.match(page, /wishKey=\{formKey\(status\.wish === 'retry' \? status\.wishk : undefined\)\}/);
  const blocks = readFileSync(join(process.cwd(), 'components/invitation/guest-blocks.tsx'), 'utf8');
  assert.match(blocks, /name="wishKey" value=\{props\.wishKey\}/);

  const host = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/invitations/[id]/wishes/actions.ts'), 'utf8');
  assert.match(host, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);/);
  assert.equal(host.match(/backendFor\('WISHES'\) === 'rust'/g)?.length, 2, 'both host actions choose one writer');
  assert.equal(host.match(/finish\(await /g)?.length, 2, 'and the Rust branch never falls through (finish returns never)');
  assert.match(host, /function finish\([^)]*\): never/);
});
