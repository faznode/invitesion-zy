// B-035: the Rust content writer's side (`lib/invitation/content-api.ts`) against a scripted API, and source guards that
// keep every content write behind one facade (`lib/invitation/content.ts`, `BACKEND_CONTENT`) with exactly one writer
// per call, the writer inventory (creation's first row, the editor's writers, nothing else), the detail route's answers,
// the editor's single-statement read of config and version, and the preview frame's scope. The behaviour of both
// writers against a database is in `services/api/tests/content_database.rs` and `scripts/verify-content-api.ts`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { signServiceRequest } from '../lib/api/signature';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
process.env.POSTGRES_URL ??= 'postgres://nobody@127.0.0.1:9/none';
const writer = () => require('../lib/invitation/content-api') as typeof import('../lib/invitation/content-api');

const SECRET = 'content-writer-test-secret-0123456789abcdef';
const ENV = { API_BASE_URL: 'http://api.test', INTERNAL_API_SECRET: SECRET };
const OWNER = 'owner-session-token';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST = { invitationId: 12, baseVersion: 4, config: { quote: { enabled: true, text: 'Budi & Sari' } }, touchedSections: ['quote'], ownerToken: OWNER };

type Sent = { url: string; headers: Record<string, string>; body: string };
type Scripted = { status: number; body?: unknown } | 'drop';

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
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as typeof fetch;
  return sent;
}

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { type: `https://invitesion.id/problems/${code}`, title: 'x', status, code, ...extra },
});

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

test('a save is one signed POST with the owner token, an idempotency key, the base version and the sections sent', async () => {
  const sent = scriptApi({ status: 200, body: { version: 5 } });
  assert.deepEqual(await writer().writeContentThroughApi(REQUEST, ENV), { kind: 'saved', version: 5 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'http://api.test/v1/invitations/12/content');
  assert.equal(sent[0].headers.authorization, `Bearer ${OWNER}`);
  assert.match(sent[0].headers['idempotency-key'], UUID);
  assert.deepEqual(JSON.parse(sent[0].body), { baseVersion: 4, config: REQUEST.config, touchedSections: ['quote'] });
  const signature = sent[0].headers['x-invitesion-signature'];
  const timestamp = Number(/^t=(\d+),/.exec(signature)?.[1]);
  assert.equal(signature, signServiceRequest(SECRET, timestamp, 'POST', '/v1/invitations/12/content', sent[0].body));
});

test("the API's refusals map to the outcomes the TypeScript writer returns", async () => {
  const cases: [Scripted, unknown][] = [
    [problem(409, 'content.version_conflict', { currentVersion: 6 }), { kind: 'conflict', currentVersion: 6 }],
    [problem(404, 'content.not_found'), { kind: 'notfound' }],
    [problem(403, 'owner.unknown_user'), { kind: 'signin' }],
    [problem(403, 'owner.role_not_allowed'), { kind: 'signin' }],
    [
      problem(422, 'content.media_refused', { issues: [{ path: 'couple.bride.photoUrl', reason: 'protected-outside-child-photo' }, { path: 'x', reason: 'made-up' }, 'junk'] }),
      { kind: 'media', issues: [{ path: 'couple.bride.photoUrl', reason: 'protected-outside-child-photo' }] },
    ],
    [
      problem(422, 'content.theme_not_entitled', { issues: [{ path: 'theme.paletteId', reason: 'premium-palette' }, { path: 'theme.other', reason: 'premium-palette' }] }),
      { kind: 'theme', issues: [{ path: 'theme.paletteId', reason: 'premium-palette' }] },
    ],
    // G-041 (session 44): the layout-choice rules reach the editor through the Rust writer as through Next.js.
    [
      problem(422, 'content.theme_not_entitled', {
        issues: [{ path: 'theme.sectionOrder', reason: 'unknown-section-order' }, { path: 'theme.fontPairing', reason: 'unknown-font-pairing' }, { path: 'theme.fontPairing', reason: 'made-up' }],
      }),
      { kind: 'theme', issues: [{ path: 'theme.sectionOrder', reason: 'unknown-section-order' }, { path: 'theme.fontPairing', reason: 'unknown-font-pairing' }] },
    ],
  ];
  for (const [reply, expected] of cases) {
    const sent = scriptApi(reply);
    assert.deepEqual(await writer().writeContentThroughApi(REQUEST, ENV), expected, JSON.stringify(reply));
    assert.equal(sent.length, 1, 'a refusal is not retried');
  }
});

test('an unknown outcome is sent once more under the same key, then reported unconfirmed with codes only', async () => {
  let sent = scriptApi('drop', { status: 200, body: { version: 5 } });
  assert.deepEqual(await writer().writeContentThroughApi(REQUEST, ENV), { kind: 'saved', version: 5 });
  assert.equal(sent[0].headers['idempotency-key'], sent[1].headers['idempotency-key']);

  sent = scriptApi(problem(503, 'internal'), problem(409, 'content.version_conflict', { currentVersion: 5 }));
  assert.deepEqual(await writer().writeContentThroughApi(REQUEST, ENV), { kind: 'conflict', currentVersion: 5 });
  assert.equal(sent[0].headers['idempotency-key'], sent[1].headers['idempotency-key']);

  sent = scriptApi('drop', problem(502, 'transport.unexpected_status'));
  const { value, logged } = await quietly(() => writer().writeContentThroughApi(REQUEST, ENV));
  assert.deepEqual(value, { kind: 'unconfirmed' });
  assert.equal(sent.length, 2, 'never a third attempt, never a new key');
  assert.equal(sent[0].headers['idempotency-key'], sent[1].headers['idempotency-key']);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /Budi|Sari|quote/, 'the log carries codes, not content');
});

test('a malformed request is a programming error and propagates', async () => {
  scriptApi(problem(400, 'request.invalid_body'));
  await assert.rejects(() => writer().writeContentThroughApi(REQUEST, ENV), /request\.invalid_body/);
});

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function filesUnder(dir: string, pattern = /\.(ts|tsx)$/): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const APP_FILES = [...filesUnder('app'), ...filesUnder('lib'), ...filesUnder('components')];

/** A top-level function's source, from its declaration to its closing brace at column 0. */
function topLevelFunction(text: string, declaration: string): string {
  const start = text.indexOf(declaration);
  assert.ok(start >= 0, `missing ${declaration}`);
  const end = text.indexOf('\n}\n', start);
  assert.ok(end > start, `unterminated ${declaration}`);
  return text.slice(start, end + 2);
}

test('the facade selects exactly one writer and never falls back', () => {
  const facade = source('lib/invitation/content.ts');
  // The dispatcher is the only place a writer is chosen and called; a fallback would have to live here.
  const dispatch = topLevelFunction(facade, 'async function writeContent(');
  assert.match(dispatch, /if \(backendFor\('CONTENT', env\) === 'rust'\) \{/);
  const rustBranch = dispatch.slice(dispatch.indexOf("=== 'rust') {"), dispatch.indexOf('} else {'));
  assert.match(rustBranch, /api\.writeContentThroughApi\(/);
  assert.doesNotMatch(rustBranch, /next\./, 'the Rust branch never reaches the TypeScript writer');
  assert.match(dispatch.slice(dispatch.indexOf('} else {')), /next\.writeContentNext\(/);
  assert.doesNotMatch(dispatch, /\b(?:try|catch)\b|\.catch\(/, 'no fallback after a failed or unknown Rust answer');
  assert.equal(facade.match(/api\.writeContentThroughApi\(/g)?.length, 1, 'the Rust writer is called from the dispatcher only');
  assert.equal(facade.match(/next\.writeContentNext\(/g)?.length, 1, 'the TypeScript writer is called from the dispatcher only');
  // Save and restore (G-046) reach the writers through that same dispatcher, once each, and never directly.
  for (const entry of ['export async function saveInvitationContent(', 'export async function restoreInvitationVersion(']) {
    const body = topLevelFunction(facade, entry);
    assert.equal(body.match(/\bwriteContent\(/g)?.length, 1, `${entry} dispatches once`);
    assert.doesNotMatch(body, /\bapi\.|\bnext\.write/, `${entry} never calls a writer itself`);
  }
  const save = topLevelFunction(facade, 'export async function saveInvitationContent(');
  assert.doesNotMatch(save, /\b(?:try|catch)\b/);
  assert.match(save, /const validated: DetailConfig = prepareConfigWrite\(state\.config, input\.patch\);/, 'the content contract runs once, in the facade');
  // G-046: restore's one `catch` turns a version today's strict schema refuses into 422 before any writer is chosen; it
  // never wraps a write, so it cannot become a second writer's fallback.
  const restore = topLevelFunction(facade, 'export async function restoreInvitationVersion(');
  const guarded = restore.slice(restore.indexOf('try {'), restore.indexOf('} catch'));
  assert.match(guarded, /config = prepareRestoreWrite\(state\.config, row\.config\);/);
  assert.doesNotMatch(guarded, /writeContent|\bapi\.|\bnext\./, 'the guarded statement is the preparation alone');
  assert.ok(restore.indexOf('} catch') < restore.indexOf('writeContent('), 'the write follows the guarded preparation');
  assert.equal(facade.match(/\bcatch\b/g)?.length, 1, "the facade's only catch is restore's validation");
  assert.match(source('lib/backend.ts'), /CONTENT: 'next',/);
});

test('only the facade loads a content writer', () => {
  for (const path of APP_FILES) {
    if (path === 'lib/invitation/content.ts') continue;
    assert.doesNotMatch(source(path), /from ['"](?:@\/lib\/invitation|\.)\/content-(?:next|api)['"]/, path);
  }
});

test('the writer inventory: the version table is written by creation and the content writers only, the config by the writers', () => {
  const versionWriters = APP_FILES.filter((path) => /\.(?:insert|update|delete)\(invitationVersions\)/.test(source(path)));
  // B-037 (D-055): creation's TypeScript writer is `create-next.ts` behind the creation facade (`create.ts` only wraps it).
  assert.deepEqual(versionWriters.sort(), ['lib/invitation/content-next.ts', 'lib/invitation/create-next.ts']);
  const configWriters = APP_FILES.filter((path) => /\.update\(invitations\)\s*\.set\(\{\s*config\b/.test(source(path)));
  assert.deepEqual(configWriters, ['lib/invitation/content-next.ts']);
  // Publishing and payment write the lifecycle columns, never the content.
  for (const path of ['lib/invitation/publish.ts', 'lib/payment/service.ts']) {
    for (const block of source(path).split('.update(invitations)').slice(1)) {
      assert.doesNotMatch(block.slice(0, block.indexOf('.where(')), /\bconfig\b/, path);
    }
  }
  const rust = filesUnder('services/api/src', /\.rs$/).filter((path) => /(?:update invitations set config|insert into invitation_versions|update invitation_versions)/i.test(source(path)));
  // B-037 (D-055): the Rust creation writer (`POST /v1/invitations`) writes version 1 beside the editor's saves. B-031
  // (D-063): the purge clears a purged invitation's config and nothing else of its content (s39 added it here).
  assert.deepEqual(rust.sort(), ['services/api/src/content/create.rs', 'services/api/src/content/http.rs', 'services/api/src/retention.rs']);
  const purge = source('services/api/src/retention.rs');
  // G-052 (D-067): the purge also clears the tombstone's `client_label` (a client's name); G-047 (D-069, R-X10): and the
  // guest passcode's hash and time. Nothing else of the invitation is written (s52 R-X11: this pin had kept the
  // statement from before R-X10).
  assert.match(purge, /"update invitations set config = null, creation_key = null, client_label = null, guest_passcode_hash = null, guest_passcode_set_at = null, purged_at = \$2 where id = \$1"/);
  assert.equal(purge.match(/update invitations set config/g)?.length, 1, 'the purge is the only config write in retention.rs');
  assert.doesNotMatch(purge, /(?:insert into|update) invitation_versions/i, 'the purge never writes a version');
});

/** Each needle after the previous one, from `start`; -1 marks the first one missing in that order. */
function inOrder(text: string, needles: string[], start = 0): number[] {
  const found: number[] = [];
  let from = start;
  for (const needle of needles) {
    const at = from < 0 ? -1 : text.indexOf(needle, from);
    found.push(at);
    from = at < 0 ? -1 : at + needle.length;
  }
  return found;
}

test('both writers lock the row, check the version, judge the content, then write the same three statements', () => {
  const next = source('lib/invitation/content-next.ts');
  const order = ["for('update')", 'max(invitationVersions.versionNo)', 'contentDecision(', '.update(invitations).set({ config', 'eq(invitationVersions.isLive, true)', '.insert(invitationVersions)'];
  const at = inOrder(next, order, next.indexOf('export async function writeContentNext'));
  assert.ok(at.every((index) => index > 0), `TypeScript order ${at}`);
  const rust = source('services/api/src/content/http.rs');
  // The replay after the lock: a retry that queued behind its own first attempt answers with that attempt's result.
  const rustOrder = ['for update', 'replay(&state.pool', 'max(version_no)', 'content_decision(', 'update invitations set config', 'and is_live', 'insert into invitation_versions'];
  const rustAt = inOrder(rust, rustOrder, rust.indexOf('pub async fn write_content'));
  assert.ok(rustAt.every((index) => index > 0), `Rust order ${rustAt}`);
  // B-041: the theme check precedes the config write in both writers.
  assert.ok(next.indexOf('contentNeedsTier(') < next.indexOf('.update(invitations)'));
  assert.ok(rust.indexOf('content_needs_tier(') < rust.indexOf('update invitations set config'));
});

test('the detail route sends the loaded version and answers each outcome', () => {
  const route = source('app/api/invitations/[id]/detail/route.ts');
  assert.match(route, /const \{ expectedVersion, \.\.\.sections \} = body/);
  assert.match(route, /saveInvitationContent\(/);
  assert.match(route, /case 'conflict':\s*return apiError\(409, 'VERSION_CONFLICT', [^,]+, \{ currentVersion: outcome\.currentVersion \}\)/);
  assert.match(route, /case 'media':\s*return apiError\(400, 'INVALID_MEDIA'/);
  assert.match(route, /case 'theme':\s*return apiError\(403, 'THEME_NOT_ENTITLED'/);
  assert.match(route, /return Response\.json\(\{ data: content\.config, version: content\.version \}\)/, 'GET returns the version with the config');
  assert.doesNotMatch(route, /updateDetailConfig/, 'the route writes through the facade');
});

test('the editor loads config and version from one statement and saves with the version', () => {
  const facade = source('lib/invitation/content.ts');
  const load = facade.slice(facade.indexOf('export function contentStateQuery'), facade.indexOf('export async function loadEditorContent'));
  assert.equal(load.match(/\bdb\b/g)?.length, 1, 'one query');
  assert.match(load, /const \[row\] = await contentStateQuery\(invitationId, userId\);/);
  // The statement as PostgreSQL receives it: the version subquery is bound to this invitation's id. A correlated
  // `= ${invitations.id}` renders as an unqualified `"id"`, which the subquery resolves to its own `invitation_versions.id`.
  const content = require('../lib/invitation/content') as typeof import('../lib/invitation/content');
  const { sql, params } = content.contentStateQuery(41, 7).toSQL();
  const version = /\(select max\("version_no"\) from "invitation_versions" where "invitation_id" = \$(\d+)\), 0\)/.exec(sql);
  assert.ok(version, sql);
  assert.equal(params[Number(version[1]) - 1], 41, 'the subquery reads the requested invitation');
  assert.match(
    sql,
    /from "invitations" where \("invitations"\."id" = \$\d+ and "invitations"\."user_id" = \$\d+ and "invitations"\."deleted_at" is null\)/,
    'owner-scoped, live rows only (B-031)',
  );
  const page = source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx');
  assert.match(page, /const invitation = await loadContentState\(id, user\.id\);/);
  assert.match(page, /initialVersion=\{invitation\.version\}/);
  assert.match(page, /autosave=\{isFlagOn\('EDITOR_AUTOSAVE'\)\}/);
  const save = source('app/(customer)/dashboard/invitations/[id]/edit/editor-save.tsx');
  assert.match(save, /JSON\.stringify\(\{ \.\.\.request\.config, expectedVersion: request\.expectedVersion \}\)/);
  assert.doesNotMatch(save, /setConfig/, 'a save answer never replaces the editor config');
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.equal(editor.match(/setConfig\(/g)?.length, 1, 'only the field patch changes the config');
  assert.match(editor, /useEditorSave\(\{ invitationId, config, initialVersion, auto: autosave, en \}\)/);
  const flags = source('lib/flags.ts');
  assert.match(flags, /EDITOR_AUTOSAVE: false,/, 'off until the signed-in check with real keys');
});

test('only the owner preview (and since B-037 the wizard preview) may be framed, by this origin, and its embedded form renders the invitation unchanged', () => {
  // B-038 moved the page policy from proxy.ts to lib/security/csp.ts; proxy.ts only builds it per request.
  const policy = source('lib/security/csp.ts');
  // Exactly two framed surfaces, both form-free renders: `/preview/<id>` and the one path `/buat/pratinjau` (D-055).
  assert.match(policy, /pathname\.startsWith\('\/preview\/'\) \|\| pathname === '\/buat\/pratinjau' \? "frame-ancestors 'self'" : "frame-ancestors 'none'"/);
  assert.match(policy, /frameAncestorsFor\(pathname\)/);
  assert.doesNotMatch(policy, /"frame-ancestors 'none'",/, 'no page-wide frame rule remains');
  assert.match(source('proxy.ts'), /contentSecurityPolicy\(\{\s*nonce,\s*pathname,/);
  const preview = source('app/preview/[id]/page.tsx');
  assert.equal(preview.match(/<PublicInvitationRenderer/g)?.length, 1);
  assert.match(preview, /\{!embedded && \(/, 'embedding drops only the owner banner');
  assert.match(preview, /if \(!owned\) notFound\(\);/, 'the owner check is unchanged');
});
