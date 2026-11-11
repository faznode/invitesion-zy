// B-038 (G-058): the page CSP, its staged enforcement, the report collector and what a report may leave in the logs.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { getScriptNonceFromHeader, getScriptNonceFromHeaders } from 'next/dist/server/app-render/get-script-nonce-from-header';
import { POST } from '../app/api/csp-report/route';
import {
  clerkFrontendApiOrigin,
  contentSecurityPolicy,
  cspDisposition,
  cspHeaderName,
  CSP_REPORT_PATH,
  reportingEndpointsHeader,
} from '../lib/security/csp';
import { blockedOf, createLogBudget, MAX_REPORT_BYTES, parseCspReports, routeShape } from '../lib/security/csp-report';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const NONCE = '0123456789abcdef0123456789abcdef';
const directives = (policy: string) => new Map(policy.split('; ').map((entry) => [entry.split(' ')[0], entry.split(' ').slice(1)]));
const policyFor = (pathname: string, extra: Partial<Parameters<typeof contentSecurityPolicy>[0]> = {}) =>
  contentSecurityPolicy({ nonce: NONCE, pathname, secure: true, ...extra });
/** `pk_test_` / `pk_live_` + base64("<host>$"), the shape Clerk issues. */
const publishableKey = (kind: 'test' | 'live', host: string) => `pk_${kind}_${Buffer.from(`${host}$`).toString('base64')}`;

test('scripts run only with the request nonce: no inline or eval sources in production, and the rest of the policy is fixed', () => {
  const policy = policyFor('/i/budi-sari/budi-hartono');
  const map = directives(policy);
  assert.deepEqual(map.get('script-src'), ["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'", 'https:', 'http:']);
  assert.equal(policy.split(NONCE).length, 2, 'the nonce appears once, in script-src');
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.ok(!map.get('script-src')?.includes("'unsafe-inline'"));
  assert.deepEqual(map.get('default-src'), ["'self'"]);
  assert.deepEqual(map.get('object-src'), ["'none'"]);
  assert.deepEqual(map.get('base-uri'), ["'self'"]);
  assert.deepEqual(map.get('form-action'), ["'self'"]);
  assert.deepEqual(map.get('worker-src'), ["'self'", 'blob:']);
  assert.deepEqual(map.get('report-uri'), [CSP_REPORT_PATH]);
  assert.deepEqual(map.get('report-to'), ['csp-endpoint']);
  assert.ok(map.has('upgrade-insecure-requests'));
});

test("Next finds the policy's nonce for its own bootstrap scripts, under either header name", () => {
  const policy = policyFor('/dashboard');
  assert.equal(getScriptNonceFromHeader(policy), NONCE);
  assert.equal(getScriptNonceFromHeaders({ 'content-security-policy': policy }), NONCE);
  assert.equal(getScriptNonceFromHeaders({ 'content-security-policy-report-only': policy }), NONCE);
});

test("D-045: a host's own image and music addresses (any https origin) load; neither directive can run script", () => {
  const map = directives(policyFor('/i/budi-sari/budi-hartono'));
  assert.deepEqual(map.get('img-src'), ["'self'", 'data:', 'blob:', 'https:']);
  assert.deepEqual(map.get('media-src'), ["'self'", 'https:'], 'the music was refused under default-src before B-038');
  assert.deepEqual(map.get('font-src'), ["'self'", 'data:'], 'fonts are self-hosted (next/font)');
});

test("upgrade-insecure-requests only in an enforced policy over HTTPS; 'unsafe-eval' only for next dev", () => {
  assert.ok(directives(policyFor('/', { disposition: 'enforce' })).has('upgrade-insecure-requests'));
  assert.ok(!directives(policyFor('/', { secure: false })).has('upgrade-insecure-requests'));
  assert.ok(!directives(policyFor('/', { disposition: 'report-only' })).has('upgrade-insecure-requests'), 'ignored, with a console error, in a report-only policy');
  const enforced = directives(policyFor('/i/a/b', { disposition: 'enforce' }));
  const reported = directives(policyFor('/i/a/b', { disposition: 'report-only' }));
  enforced.delete('upgrade-insecure-requests');
  assert.deepEqual([...reported], [...enforced], 'otherwise the same policy in both dispositions');
  assert.deepEqual(directives(policyFor('/', { development: true })).get('script-src')?.at(-1), "'unsafe-eval'");
});

test('framing: the owner preview and the wizard preview by this origin; every other page by none', () => {
  const frame = (pathname: string) => directives(policyFor(pathname)).get('frame-ancestors')?.join(' ');
  assert.equal(frame('/preview/42'), "'self'");
  assert.equal(frame('/buat/pratinjau'), "'self'");
  for (const pathname of ['/buat/pratinjau/x', '/buat/gapura', '/i/budi-sari/budi-hartono', '/i/budi-sari/budi-hartono/pass', '/dashboard', '/']) {
    assert.equal(frame(pathname), "'none'", pathname);
  }
});

test('staged enforcement: report-only unless CSP_ENFORCE is "guest" (guest pages) or "true" (everywhere)', () => {
  const cases: Array<[string | undefined, string, 'enforce' | 'report-only']> = [
    [undefined, '/i/a/b', 'report-only'],
    ['', '/i/a/b', 'report-only'],
    ['false', '/i/a/b', 'report-only'],
    ['1', '/i/a/b', 'report-only'],
    ['yes', '/dashboard', 'report-only'],
    ['guest', '/i/a', 'enforce'],
    ['guest', '/i/a/b', 'enforce'],
    ['guest', '/i/a/b/pass', 'enforce'],
    [' Guest ', '/i/a/b', 'enforce'],
    ['guest', '/dashboard/invitations/1/checkin', 'report-only'],
    ['guest', '/preview/1', 'report-only'],
    ['guest', '/', 'report-only'],
    ['guest', '/index', 'report-only'],
    ['true', '/dashboard', 'enforce'],
    ['TRUE', '/sign-in', 'enforce'],
  ];
  for (const [setting, pathname, expected] of cases) assert.equal(cspDisposition(pathname, setting), expected, `${setting} ${pathname}`);
  assert.equal(cspHeaderName('enforce'), 'Content-Security-Policy');
  assert.equal(cspHeaderName('report-only'), 'Content-Security-Policy-Report-Only');
});

test("a production Clerk instance's Frontend API host comes from the publishable key; shared development hosts are not repeated", () => {
  assert.equal(clerkFrontendApiOrigin(publishableKey('live', 'clerk.invitesion.example')), 'https://clerk.invitesion.example');
  const production = directives(policyFor('/sign-in', { clerkFrontendApi: 'https://clerk.invitesion.example' }));
  assert.deepEqual(production.get('connect-src'), ["'self'", 'https://*.clerk.accounts.dev', 'https://*.clerk.com', 'https://clerk.invitesion.example']);
  assert.ok(!production.get('script-src')?.includes('https://clerk.invitesion.example'), 'its script is admitted by strict-dynamic');
  const developmentHost = clerkFrontendApiOrigin(publishableKey('test', 'merry-lark-12.clerk.accounts.dev'));
  assert.equal(developmentHost, 'https://merry-lark-12.clerk.accounts.dev');
  assert.deepEqual(directives(policyFor('/sign-in', { clerkFrontendApi: developmentHost })).get('connect-src'), ["'self'", 'https://*.clerk.accounts.dev', 'https://*.clerk.com']);
  for (const key of [undefined, '', 'pk_test_...', 'sk_live_invalid_fixture', 'pk_live_%%%', publishableKey('live', 'clerk.example.com/x'), `pk_live_${Buffer.from('clerk.example.com').toString('base64')}`, publishableKey('live', 'localhost')]) {
    assert.equal(clerkFrontendApiOrigin(key), null, String(key));
  }
});

test('Reporting-Endpoints names the collector by an absolute address', () => {
  assert.equal(reportingEndpointsHeader('https://app.example'), 'csp-endpoint="https://app.example/api/csp-report"');
});

const SENTINELS = ['sentinel-invitation', 'sentinel-guest', 'sentinel-query', 'sentinel-path', 'sentinel-sig', 'sentinel-sample', 'sentinel-ref', 'sentinel-entry', NONCE];

test("a report-uri report keeps only the directive, the blocked origin, the route's shape and the disposition", () => {
  const page = 'https://app.example/i/sentinel-invitation/sentinel-guest?token=sentinel-query#frag';
  const [violation, ...rest] = parseCspReports(JSON.stringify({
    'csp-report': {
      'document-uri': page,
      referrer: 'https://ref.example/sentinel-ref',
      'violated-directive': 'media-src',
      'effective-directive': 'media-src',
      'original-policy': policyFor('/i/sentinel-invitation/sentinel-guest'),
      disposition: 'report',
      'blocked-uri': 'https://cdn.example.org/a/sentinel-path.mp3?sig=sentinel-sig',
      'source-file': page,
      'line-number': 1,
      'column-number': 2,
      'script-sample': 'sentinel-sample',
      'status-code': 200,
    },
  }));
  assert.deepEqual(rest, []);
  assert.deepEqual(violation, { directive: 'media-src', blocked: 'https://cdn.example.org', route: '/i/*/*', disposition: 'report', source: 'https://app.example', line: 1, column: 2 });
  for (const sentinel of SENTINELS) assert.ok(!JSON.stringify(violation).includes(sentinel), sentinel);
});

test('a report-to batch: only csp-violation reports, a Next chunk keeps its path, the admin entry never appears', () => {
  const violations = parseCspReports(JSON.stringify([
    { type: 'deprecation', url: 'https://app.example/i/sentinel-invitation', body: { id: 'x', message: 'sentinel-sample' } },
    {
      type: 'csp-violation',
      url: 'https://app.example/admin/sentinel-entry/orders',
      body: {
        documentURL: 'https://app.example/admin/sentinel-entry/orders?q=sentinel-query',
        effectiveDirective: 'script-src-elem',
        blockedURL: 'inline',
        disposition: 'enforce',
        sourceFile: 'https://app.example/_next/static/chunks/app-0f3a.js',
        lineNumber: 3,
        columnNumber: 40,
        sample: 'sentinel-sample',
        originalPolicy: policyFor('/admin/sentinel-entry/orders'),
      },
    },
    { type: 'csp-violation', body: { documentURL: 'https://app.example/dashboard/invitations/42/checkin', effectiveDirective: 'img-src', blockedURL: 'data:image/png;base64,AAAA', disposition: 'report' } },
  ]));
  assert.deepEqual(violations, [
    { directive: 'script-src-elem', blocked: 'inline', route: '/admin/*/orders', disposition: 'enforce', source: '/_next/static/chunks/app-0f3a.js', line: 3, column: 40 },
    { directive: 'img-src', blocked: 'data', route: '/dashboard/invitations/*/checkin', disposition: 'report' },
  ]);
  for (const sentinel of SENTINELS) assert.ok(!JSON.stringify(violations).includes(sentinel), sentinel);
});

test('malformed reports yield nothing; repeats collapse; at most 20 distinct violations per post', () => {
  for (const text of ['', 'not json', '{}', '[]', 'null', '{"csp-report": "x"}', '[{"type":"csp-violation"}]', '[1, "a", null]']) assert.deepEqual(parseCspReports(text), [], text);
  const same = { type: 'csp-violation', body: { documentURL: 'https://app.example/', effectiveDirective: 'img-src', blockedURL: 'https://x.example/a.png', disposition: 'report' } };
  assert.equal(parseCspReports(JSON.stringify([same, same, same])).length, 1);
  const many = Array.from({ length: 60 }, (_, index) => ({ ...same, body: { ...same.body, blockedURL: `https://host-${index}.example/a.png` } }));
  assert.equal(parseCspReports(JSON.stringify(many)).length, 20);
  assert.deepEqual(parseCspReports(JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src; drop table', 'blocked-uri': 'javascript:alert(1)' } })), [
    { directive: 'unknown', blocked: 'javascript', route: 'unknown', disposition: 'unknown' },
  ]);
});

test("the route's shape hides every slug, id and token, and the two always-private positions", () => {
  const cases: Array<[unknown, string]> = [
    ['https://app.example/', '/'],
    ['https://app.example/templates/gapura', '/templates/*'],
    ['https://app.example/dashboard/invitations/42/wishes/book', '/dashboard/invitations/*/wishes/book'],
    ['https://app.example/i/budi-sari/budi-hartono/pass', '/i/*/*/pass'],
    ['https://app.example/i/edit/pricing', '/i/*/*', ],
    ['https://app.example/i/budi-sari', '/i/*'],
    ['https://app.example/admin/templates/orders', '/admin/*/orders'],
    ['https://app.example/buat/pratinjau', '/buat/pratinjau'],
    ['https://app.example/gabung/0123abcd', '/gabung/*'],
    ['/dashboard/invitations/7/checkin', '/dashboard/invitations/*/checkin'],
    ['', 'unknown'],
    [undefined, 'unknown'],
    [42, 'unknown'],
  ];
  for (const [address, expected] of cases) assert.equal(routeShape(address), expected, String(address));
  assert.equal(blockedOf('wss://socket.example/x?y'), 'wss://socket.example');
  assert.equal(blockedOf('chrome-extension://abcdef/x.js'), 'chrome-extension');
  assert.equal(blockedOf('eval'), 'eval');
});

test('the logging budget: at most max lines per window, the overflow counted and reported once the next window opens', () => {
  let clock = 0;
  const take = createLogBudget(2, 1000, () => clock);
  assert.deepEqual([take(), take(), take(), take()].map((verdict) => verdict.log), [true, true, false, false]);
  clock = 1000;
  assert.deepEqual(take(), { log: true, droppedInLastWindow: 2 });
  assert.deepEqual(take(), { log: true, droppedInLastWindow: 0 });
});

const post = (body: string, headers: Record<string, string>) =>
  POST(new Request('http://127.0.0.1/api/csp-report', { method: 'POST', body, headers }));

test('the collector: 415 for other types, 413 past 16 KiB (declared or streamed), otherwise 204 and one minimized log line', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal((await post('{}', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('{}', { 'content-type': 'application/csp-report', 'content-length': String(MAX_REPORT_BYTES + 1) })).status, 413);
  assert.equal((await post('x'.repeat(MAX_REPORT_BYTES + 1), { 'content-type': 'application/csp-report' })).status, 413);
  assert.equal(warn.mock.callCount(), 0);
  const response = await post(JSON.stringify({ 'csp-report': {
    'document-uri': 'https://app.example/i/sentinel-invitation/sentinel-guest',
    'effective-directive': 'img-src',
    'blocked-uri': 'https://photos.example/sentinel-path.jpg',
    disposition: 'enforce',
  } }), { 'content-type': 'application/csp-report' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(warn.mock.callCount(), 1);
  const line = String(warn.mock.calls[0].arguments[0]);
  assert.equal(line, '[csp-report] {"directive":"img-src","blocked":"https://photos.example","route":"/i/*/*","disposition":"enforce"}');
  assert.equal((await post('not json', { 'content-type': 'application/reports+json' })).status, 204);
  assert.equal(warn.mock.callCount(), 1, 'nothing logged for a malformed post');
});

test('wiring: proxy.ts builds the policy per request, sends it on the request and the response, and names the collector', () => {
  const proxy = source('proxy.ts');
  assert.match(proxy, /from '@\/lib\/security\/csp'/);
  assert.match(proxy, /const disposition = cspDisposition\(pathname\);/);
  assert.match(proxy, /contentSecurityPolicy\(\{[^}]*\bdisposition,\s*\}\);/, 'the policy knows the header it goes under');
  assert.match(proxy, /const headerName = cspHeaderName\(disposition\);/);
  assert.match(proxy, /requestHeaders\.set\(headerName, policy\);/, 'Next reads the nonce from the request header');
  assert.match(proxy, /res\.headers\.set\(headerName, policy\);/);
  assert.match(proxy, /res\.headers\.set\('Reporting-Endpoints', reportingEndpointsHeader\(publicUrl\.origin\)\);/);
  assert.match(proxy, /secure: publicUrl\.protocol === 'https:'/);
  assert.doesNotMatch(proxy, /"default-src|"img-src|frame-ancestors/, 'no directive is written in proxy.ts any more');
  assert.match(source('.env.example'), /^# CSP_ENFORCE=guest$/m, 'the staged switch is documented');
});

test('the private admin sign-in renders signed out: proxy.ts leaves it public and no layout above it asks for an administrator', () => {
  assert.match(source('proxy.ts'), /const isPrivateAdminLogin = pathname === `\$\{adminRoot\}\/\$\{privateAdminEntry\}\/login`;/);
  const login = 'app/(admin)/admin/[entry]/login/page.tsx';
  assert.match(source(login), /assertPrivateAdminEntry\(entry\);/, 'a guessed entry still answers 404');
  const layoutsAbove: string[] = [];
  for (let dir = dirname(login); dir !== '.'; dir = dirname(dir)) {
    if (existsSync(join(process.cwd(), dir, 'layout.tsx'))) layoutsAbove.push(join(dir, 'layout.tsx'));
  }
  assert.ok(layoutsAbove.length > 0);
  for (const layout of layoutsAbove) assert.doesNotMatch(source(layout), /assertAuthorizedAdmin/, layout);
  assert.match(source('app/(admin)/admin/[entry]/(console)/layout.tsx'), /assertAuthorizedAdmin\(await getUser\(\)\);/, 'the console keeps its guard');
});
