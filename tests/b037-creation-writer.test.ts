// B-037 (D-055): the creation facade and the Rust writer's client, without a database. The facade prepares the draft
// (the template's defaults, the new-invitation defaults, the typed content, the slug base, a key for every creation) and
// selects exactly one writer with `BACKEND_CONTENT`; the client resends an unknown outcome once with the same body (the
// same creation key) and maps every problem to the outcome the TypeScript writer returns. Source guards pin the writers'
// statements and order. The database flows run in `scripts/verify-creation-api.ts` (the rust job) and the Rust suites.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import './support/render-guest-page';
import type { DraftCreateRequest } from '../lib/invitation/creation-rules';
import { catalogDefaultConfig } from '../lib/invitation/template-defaults';
import { getTemplateBySlug } from '../lib/invitation/templates';
import { initialDraftConfig } from '../lib/invitation/trial';

const KEY = '3f9a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const sage = getTemplateBySlug('sage-garden')!;
const row = { id: 7, name: sage.name, category: sage.category, defaultConfig: catalogDefaultConfig(sage) };
const input = { first: 'Sari', second: 'Budi', date: '2027-02-14', time: '10:00', zone: 'Asia/Jakarta' as const };
const API_ENV = { API_BASE_URL: 'http://api.invalid', INTERNAL_API_SECRET: 's'.repeat(40), BACKEND_CONTENT: 'rust' };

test('the facade prepares the config creation stores, the slug base and a key for every creation', async () => {
  const { prepareDraftRequest } = await import('../lib/invitation/creation');
  const env = { FLAG_DEFAULT_FAMILY: 'on' };
  const withTrial = prepareDraftRequest({ eventType: 'wedding', template: row, trial: { input, key: KEY } }, env);
  assert.deepEqual(withTrial.config, initialDraftConfig(row.defaultConfig, 'wedding', { input, key: KEY }, env).config);
  assert.equal(withTrial.templateId, 7, 'the purchased row');
  assert.equal(withTrial.slugBase, 'sari-budi');
  assert.equal(withTrial.creationKey, KEY, "the wizard's draft key");

  const plain = prepareDraftRequest({ eventType: 'wedding', template: row, title: row.name }, env);
  assert.equal(plain.slugBase, 'sage-garden', 'without typed names, the theme name as before');
  assert.match(plain.creationKey ?? '', /^[0-9a-f-]{36}$/, 'a key minted for this creation');
  assert.equal(plain.config.couple, undefined, 'no typed content, no names');

  const none = prepareDraftRequest({ eventType: 'corporate', template: null, title: 'content api x' }, env);
  assert.equal(none.templateId, null);
  assert.equal(none.config.theme?.templateId, undefined, 'no template, no catalog id');
});

test('the facade selects exactly one writer; the Rust path without a session token answers sign-in', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('no request expected');
  });
  const { createDraftInvitation } = await import('../lib/invitation/creation');
  const outcome = await createDraftInvitation({ userId: 1, ownerToken: async () => null }, { eventType: 'wedding', template: row, trial: { input, key: KEY } }, API_ENV);
  assert.deepEqual(outcome, { kind: 'signin' });
  assert.equal(fetchMock.mock.callCount(), 0);

  const facade = source('lib/invitation/creation.ts');
  assert.match(facade, /if \(backendFor\('CONTENT', env\) === 'rust'\) \{[\s\S]*?return ownerToken \? api\.createDraftThroughApi\([\s\S]*?: \{ kind: 'signin' \};\n  \}\n  return next\.createDraftNext\(/, 'the rust branch returns; no fallback');
});

type Reply = { status: number; body: unknown } | 'transport';

async function throughApi(t: TestContext, replies: Reply[]) {
  const bodies: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const reply = replies.shift();
    if (!reply || reply === 'transport') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  const { createDraftThroughApi } = await import('../lib/invitation/create-api');
  const request: DraftCreateRequest = { templateId: 7, eventType: 'wedding', slugBase: 'sari-budi', config: { theme: { templateId: 103 } }, creationKey: KEY };
  let outcome: unknown;
  try {
    outcome = await createDraftThroughApi({ ...request, ownerToken: 'token' }, API_ENV);
  } catch (error) {
    outcome = { thrown: (error as Error).message };
  }
  return { outcome, bodies };
}

const problem = (status: number, code: string, issues?: { path: string; reason: string }[]) => ({ status, body: { type: `x/${code}`, title: 'x', status, code, issues } });

test('the Rust client resends an unknown outcome once with the same key and maps every answer', async (t) => {
  const created = { status: 200, body: { invitationId: 41, slug: 'sari-budi', version: 1, replayed: false } };
  const cases: { name: string; replies: Reply[]; expect: unknown; calls: number }[] = [
    { name: 'created', replies: [created], expect: { kind: 'created', invitationId: 41, slug: 'sari-budi', replayed: false }, calls: 1 },
    { name: 'a 503, then the replayed draft', replies: [problem(503, 'internal'), { status: 200, body: { invitationId: 41, slug: 'sari-budi', version: 1, replayed: true } }], expect: { kind: 'created', invitationId: 41, slug: 'sari-budi', replayed: true }, calls: 2 },
    { name: 'unknown twice', replies: [problem(503, 'internal'), 'transport'], expect: { kind: 'unconfirmed' }, calls: 2 },
    { name: 'the template is missing', replies: [problem(422, 'creation.template_missing')], expect: { kind: 'template-missing' }, calls: 1 },
    { name: 'a creation refusal keeps known issues only', replies: [problem(422, 'creation.refused', [{ path: 'theme.templateId', reason: 'template-mismatch' }, { path: 'x', reason: 'y' }])], expect: { kind: 'creation', issues: [{ path: 'theme.templateId', reason: 'template-mismatch' }] }, calls: 1 },
    { name: 'a theme refusal', replies: [problem(422, 'content.theme_not_entitled', [{ path: 'theme.paletteId', reason: 'premium-palette' }])], expect: { kind: 'theme', issues: [{ path: 'theme.paletteId', reason: 'premium-palette' }] }, calls: 1 },
    { name: 'a media refusal', replies: [problem(422, 'content.media_refused', [{ path: 'couple.bride.photoUrl', reason: 'protected-outside-child-photo' }])], expect: { kind: 'media', issues: [{ path: 'couple.bride.photoUrl', reason: 'protected-outside-child-photo' }] }, calls: 1 },
    { name: 'no live customer behind the token', replies: [problem(403, 'owner.role_not_allowed')], expect: { kind: 'signin' }, calls: 1 },
  ];
  for (const { name, replies, expect, calls } of cases) {
    const { outcome, bodies } = await throughApi(t, replies);
    assert.deepEqual(outcome, expect, name);
    assert.equal(bodies.length, calls, `${name}: requests`);
    assert.ok(bodies.every((body) => body === bodies[0]), `${name}: a resend is the same body, so the same key`);
    assert.equal(JSON.parse(bodies[0]).creationKey, KEY);
    t.mock.restoreAll();
  }
  const malformed = await throughApi(t, [problem(400, 'request.invalid_body')]);
  assert.match(String((malformed.outcome as { thrown?: string }).thrown), /400/, 'a 400 is a programming error and propagates');
});

test("both writers issue the same statements in the same order", () => {
  const next = source('lib/invitation/create-next.ts');
  const rust = source('services/api/src/content/create.rs');
  const order = (text: string, marks: RegExp[]) => marks.map((mark) => text.search(mark));
  const increasing = (positions: number[]) => positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]));
  const nextOrder = order(next, [/priorCreation\(tx, input\.userId/, /from\(templates\)/, /creationDecision\(/, /inArray\(invitations\.slug, slugCandidates/, /onConflictDoNothing\(\)/, /versionNo: 1,/]);
  const rustOrder = order(rust, [/prior_creation\(&mut tx, owner\.user_id/, /from templates where id/, /creation_decision\(/, /where slug = any\(\$1\)/, /on conflict do nothing returning id, slug/, /values \(\$1, 1, \$2, 'customer', true\)/]);
  assert.ok(increasing(nextOrder), `TypeScript writer order ${nextOrder}`);
  assert.ok(increasing(rustOrder), `Rust writer order ${rustOrder}`);
  assert.match(next, /userId: input\.userId,/, 'the owner is the session user');
  assert.match(rust, /owner\.user_id,\n\s+request\.template_id,/, 'the owner is the verified token');
});
