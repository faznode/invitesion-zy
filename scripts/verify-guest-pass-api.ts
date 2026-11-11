/**
 * B-024 end to end (D-056, ADR-A3): the scanner's check-in route and its manual fallback against a running Rust API and
 * a scratch database, through both roster writers, the typed client and the service signature. Only Next.js's request
 * primitives and Clerk's session are stubbed; the route handler, the server action, the facade, both writers and the
 * binary are product code.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     GUEST_PASS_SECRET=… GUEST_PASS_SECRET_PREVIOUS=… API_BIN=…/debug/invitesion-api \
 *     npx tsx scripts/verify-guest-pass-api.ts
 *
 * The API runs with the same two guest-pass secrets; API_BIN is its binary, which this script starts once more without
 * them. scripts/ci/rust.sh does both. Fixture rows are fictional, tagged per run and removed.
 *
 * It proves: both writers answer one batch of every kind of scan alike and store the same rows; a guest arrives once
 * across scans, desks, writers, the manual fallback and the guest list; a resent batch replays its first answer through
 * either writer, and a used key refuses another batch; exactly one writer per call; a missing secret is a definite answer
 * in both writers; the route's exposure rules (ADR-A3) and rate limit; with the flag off every pass is inert and stored
 * check-ins stay.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import Module from 'node:module';
import net, { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}

/** `authCalls` counts session reads, so a refusal can be shown to come before the session is read. */
const session = { clerkUserId: null as string | null, token: null as string | null, authCalls: 0 };
const stubs: Record<string, unknown> = {
  'server-only': {},
  'next/navigation': {
    redirect: (url: string) => {
      throw new Redirect(url);
    },
    notFound: () => {
      throw new NotFound('notFound');
    },
  },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/headers': { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [] }) },
  '@clerk/nextjs/server': {
    auth: async () => {
      session.authCalls++;
      return { userId: session.clerkUserId, getToken: async () => session.token };
    },
    currentUser: async () => null,
  },
};
const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (Object.hasOwn(stubs, request)) return stubs[request];
  return load.call(this, request, ...rest);
};

const env = process.env;
function need(name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} must be set (see the header of this script)`);
  return value;
}
const API = need('API_BASE_URL');
const SECRET = need('INTERNAL_API_SECRET');
const JWKS_PORT = Number(need('OWNER_TOKEN_JWKS_PORT'));
const ISSUER = need('OWNER_TOKEN_ISSUER');
const PARTIES = need('OWNER_TOKEN_AUTHORIZED_PARTIES');
const AZP = PARTIES.split(',')[0].trim();
const PASS_SECRET = need('GUEST_PASS_SECRET');
const PASS_PREVIOUS = need('GUEST_PASS_SECRET_PREVIOUS');
const API_BIN = need('API_BIN');
const DATABASE = need('POSTGRES_URL');
const LIMIT_WINDOW = 600;

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` (${detail})`}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}

const servers: http.Server[] = [];
async function listen(handler: http.RequestListener, port = 0): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function bodyOf(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
type Seen = { key?: string; status: number; replayed: string | null };
const FORWARDED = ['content-type', 'accept', 'x-invitesion-signature', 'idempotency-key', 'authorization', 'x-request-id'];
/** Forwards to `upstream`; `forward-drop` lets the API commit, then cuts the connection before the answer. */
function proxy(upstream: string, plan: Array<'forward' | 'forward-drop'>) {
  const seen: Seen[] = [];
  const handler: http.RequestListener = async (req, res) => {
    const body = await bodyOf(req);
    const step = plan.shift() ?? 'forward';
    const headers: Record<string, string> = {};
    for (const name of FORWARDED) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name] as string;
    const answer = await fetch(`${upstream}${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? body : undefined });
    const text = await answer.text();
    seen.push({ key: headers['idempotency-key'], status: answer.status, replayed: answer.headers.get('idempotent-replayed') });
    if (step === 'forward-drop') {
      req.socket.destroy();
      return;
    }
    res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' });
    res.end(text);
  };
  return { seen, handler };
}

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(values).map((name) => [name, env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
  }
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** The same binary without guest-pass secrets, for the definite 503. */
async function startBareApi(children: ChildProcess[]): Promise<string> {
  const port = await freePort();
  const child = spawn(API_BIN, [], {
    env: {
      NODE_ENV: 'test',
      PATH: env.PATH ?? '',
      DATABASE_URL: DATABASE,
      INTERNAL_API_SECRET: SECRET,
      PORT: String(port),
      RUST_LOG: 'warn',
      OWNER_TOKEN_ISSUER: ISSUER,
      OWNER_TOKEN_JWKS_URL: `http://127.0.0.1:${JWKS_PORT}/.well-known/jwks.json`,
      OWNER_TOKEN_AUTHORIZED_PARTIES: PARTIES,
    },
    stdio: 'ignore',
  });
  children.push(child);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`the API without guest-pass secrets exited (${child.exitCode})`);
    try {
      if ((await fetch(`${url}/v1/health`)).ok) return url;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('the API without guest-pass secrets did not answer /v1/health');
}

/** Waits for a fresh limiter window when fewer than `margin` seconds remain, so a boundary never splits a count. */
async function freshWindow(margin: number) {
  const left = LIMIT_WINDOW - (Math.floor(Date.now() / 1000) % LIMIT_WINDOW);
  if (left < margin) await new Promise((resolve) => setTimeout(resolve, (left + 1) * 1000));
}

type Backend = 'next' | 'rust';
const BACKENDS: readonly Backend[] = ['next', 'rust'];
type Result = { outcome: string; name?: string; checkedInAt?: string };
type Answer = { status: number; code: string | null; results: Result[]; headers: Headers; raw: unknown };
type Scan = { token: string; scannedAt?: string };
type Guest = { id: number; name: string; passId: string };
const OPTED_IN = { checkInSettings: { enabled: true } };
const APP = 'http://app.test';
const SAME_ORIGIN: Record<string, string> = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const { POST } = await import('../app/api/invitations/[id]/checkins/route');
  const { manualCheckIn } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/actions');
  const roster = await import('../lib/invitation/roster');
  const { signGuestPass } = await import('../lib/invitation/guest-pass');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const children: ChildProcess[] = [];
  const savedFlag = env.FLAG_GUEST_PASS;
  env.FLAG_GUEST_PASS = 'on';

  async function user(name: string, role: 'CUSTOMER' | 'ADMIN') {
    const clerk = `user_passapi_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role) values (${`pass-api-${name}-${tag}@example.invalid`}, ${clerk}, ${role}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  async function invitation(owner: number, name: string, config: unknown = OPTED_IN): Promise<number> {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner}, ${`pass-api-${name}-${tag}`}, 'wedding', 'PUBLISHED', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return row.id as number;
  }
  async function guest(invitationId: number, name: string): Promise<Guest> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, slug) values (${invitationId}, ${name}, ${slug}) returning id, pass_id`;
    return { id: row.id as number, name, passId: row.pass_id as string };
  }
  async function guestsOf(invitationId: number, names: string[]): Promise<Guest[]> {
    const rows: Guest[] = [];
    for (const name of names) rows.push(await guest(invitationId, name));
    return rows;
  }

  /** What both writers must store alike: who is checked in, and each CHECKIN event with its meta. */
  async function state(invitationId: number) {
    const rows = await sql`select name, checked_in_at from guests where invitation_id = ${invitationId} order by id`;
    const events = await sql`select g.name, e.meta from analytics_events e join guests g on g.id = e.guest_id
      where e.invitation_id = ${invitationId} and e.event_type = 'CHECKIN' order by e.id`;
    return {
      guests: rows.map((r) => ({ name: r.name as string, checkedIn: r.checked_in_at !== null })),
      checkins: events.map((e) => ({ name: e.name as string, meta: e.meta as unknown })),
    };
  }
  /** The stored check-in time as the answers carry it: milliseconds, truncated, UTC. */
  async function storedTime(g: Guest): Promise<string | null> {
    const [row] = await sql`select to_char(checked_in_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at from guests where id = ${g.id}`;
    return (row?.at as string | null) ?? null;
  }

  // Owner tokens: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts share for this API
  // instance (named by a hash of its secret): the API refetches its JWKS for an unknown `kid` at most once per 30 s.
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `pass-api-${tag}`;
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;
  if (stored) {
    privateKey = (await jose.importJWK(stored.privateJwk as JWK, 'RS256')) as CryptoKey;
    publicJwk = stored.publicJwk;
  } else {
    const pair = await jose.generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await jose.exportJWK(pair.publicKey);
    writeFileSync(keyFile, JSON.stringify({ kid, privateJwk: await jose.exportJWK(pair.privateKey), publicJwk }), { mode: 0o600 });
  }
  const jwks = JSON.stringify({ keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] });
  await listen((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jwks);
    } else {
      res.writeHead(404);
      res.end();
    }
  }, JWKS_PORT);
  const tokenFor = (sub: string) =>
    new jose.SignJWT({ azp: AZP, sid: `sess_${tag}` })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 120)
      .sign(privateKey);

  let signedInAt = 0;
  async function signIn(who: { clerk: string } | null) {
    session.clerkUserId = who?.clerk ?? null;
    session.token = who ? await tokenFor(who.clerk) : null;
    signedInAt = Date.now();
  }
  /** One call under one writer, as the host's scanner reaches it (`BACKEND_ROSTER` is read per call). */
  async function as<T>(backend: Backend, run: () => Promise<T>): Promise<T> {
    if (session.clerkUserId && Date.now() - signedInAt > 60_000) await signIn({ clerk: session.clerkUserId });
    env.BACKEND_ROSTER = backend;
    try {
      return await run();
    } finally {
      delete env.BACKEND_ROSTER;
    }
  }
  /** A POST to the check-in route, as the scanner's outbox sends it unless `headers` says otherwise. */
  function post(backend: Backend, invitationId: number, body: unknown, headers: Record<string, string> = SAME_ORIGIN): Promise<Answer> {
    return as(backend, async () => {
      const request = new Request(`${APP}/api/invitations/${invitationId}/checkins`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const response = await POST(request, { params: Promise.resolve({ id: String(invitationId) }) });
      const text = await response.text();
      const raw: unknown = text ? JSON.parse(text) : null;
      const parsed = raw as { results?: Result[]; error?: { code?: string } } | null;
      return { status: response.status, code: parsed?.error?.code ?? null, results: parsed?.results ?? [], headers: response.headers, raw };
    });
  }
  const batch = (scans: Scan[], key = `scan-${randomUUID()}`) => ({ key, scans });

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const current = Buffer.from(PASS_SECRET);
  const previous = Buffer.from(PASS_PREVIOUS);
  const stranger = Buffer.from(randomBytes(32).toString('hex'));
  const passOf = (g: Guest, secret: Buffer = current, expiresAt = nowSeconds() + 7 * 86_400) => signGuestPass(secret, g.passId, expiresAt);

  try {
    const owner = await user('owner', 'CUSTOMER');
    const other = await user('other', 'CUSTOMER');
    const admin = await user('admin', 'ADMIN');
    await signIn(owner);
    const caller = { userId: owner.id, ownerToken: () => tokenFor(owner.clerk) };
    const envFor = (backend: Backend) => ({ ...env, BACKEND_ROSTER: backend });

    // ── 1. One batch of every kind of scan: the same answers and the same rows in both writers ──
    const first = {} as Record<Backend, { inv: number; ayu: Guest; time: string }>;
    {
      const answers = {} as Record<Backend, Answer>;
      const states = {} as Record<Backend, Awaited<ReturnType<typeof state>>>;
      const scannedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
      for (const backend of BACKENDS) {
        const inv = await invitation(owner.id, `mix-${backend}`);
        const elsewhere = await invitation(owner.id, `mix-elsewhere-${backend}`);
        const [ayu, bima, citra, eka] = await guestsOf(inv, ['Ayu Lestari', 'Bima Sakti', 'Citra Dewi', 'Eka Putri']);
        const dodi = await guest(elsewhere, 'Dodi Pratama');
        const answer = await post(backend, inv, batch([
          { token: passOf(ayu) },
          { token: passOf(bima), scannedAt },
          { token: passOf(ayu, stranger) },
          { token: passOf(citra, current, nowSeconds() - 60) },
          { token: passOf(dodi) },
          { token: 'IVP1.bukan-pass' },
          { token: passOf(ayu) },
          { token: passOf(eka, previous) },
        ]));
        answers[backend] = answer;
        states[backend] = await state(inv);
        const r = answer.results;
        check(`${backend}: a pass, an offline scan, a forged, an expired, another invitation's, a malformed, a repeated and a previous-secret pass, answered in order`,
          answer.status === 200
            && same(r.map((x) => x.outcome), ['checked-in', 'checked-in', 'invalid', 'expired', 'unknown', 'invalid', 'already', 'checked-in'])
            && r[0].name === 'Ayu Lestari' && r[1].name === 'Bima Sakti' && r[6].name === 'Ayu Lestari' && r[7].name === 'Eka Putri'
            && r[1].checkedInAt === scannedAt && r[6].checkedInAt === r[0].checkedInAt && r[0].checkedInAt === (await storedTime(ayu)),
          JSON.stringify(r));
        const unnamed = [2, 3, 4, 5].every((i) => same(Object.keys(r[i] ?? {}), ['outcome']));
        const named = [0, 1, 6, 7].every((i) => same(Object.keys(r[i] ?? {}).sort(), ['checkedInAt', 'name', 'outcome']));
        check(`${backend}: a refused scan names no one, an answered one carries only the name and the time, and the answer is not cached`,
          unnamed && named && answer.headers.get('cache-control') === 'no-store', JSON.stringify(r));
        first[backend] = { inv, ayu, time: r[0]?.checkedInAt ?? '' };
      }
      const timeless = (a: Answer) => a.results.map(({ checkedInAt, ...rest }) => ({ ...rest, timed: checkedInAt !== undefined }));
      check('both writers give the same answers (times aside) and store the same rows: three arrivals, one CHECKIN event each with source "pass"',
        same(timeless(answers.next), timeless(answers.rust)) && same(states.next, states.rust)
          && states.rust.checkins.length === 3 && states.rust.checkins.every((c) => same(c.meta, { source: 'pass' })),
        JSON.stringify(states));
    }

    // ── 2. A guest checked in by one writer is `already` in the other, with the first time ──
    {
      const nextThenRust = await post('rust', first.next.inv, batch([{ token: passOf(first.next.ayu) }]));
      const rustThenNext = await post('next', first.rust.inv, batch([{ token: passOf(first.rust.ayu) }]));
      const events = (await state(first.next.inv)).checkins.length + (await state(first.rust.inv)).checkins.length;
      check('a pass scanned again in another batch through the other writer is "already" with the first time to the millisecond; nothing written',
        nextThenRust.results[0]?.outcome === 'already' && nextThenRust.results[0]?.checkedInAt === first.next.time
          && rustThenNext.results[0]?.outcome === 'already' && rustThenNext.results[0]?.checkedInAt === first.rust.time && events === 6,
        JSON.stringify({ nextThenRust: nextThenRust.raw, rustThenNext: rustThenNext.raw, first }));
    }

    // ── 3. A resent batch replays its first answer through either writer; a used key refuses another batch ──
    {
      const inv = await invitation(owner.id, 'resend');
      const g = await guestsOf(inv, ['Fajar', 'Gita', 'Hadi', 'Intan', 'Joko', 'Kirana']);
      const plan = proxy(API, ['forward-drop', 'forward']);
      const url = await listen(plan.handler);
      const lostBatch = batch([{ token: passOf(g[0]) }]);
      const lost = await withEnv({ API_BASE_URL: url }, () => post('rust', inv, lostBatch));
      check('rust: an answer lost after the commit is resent once under the batch key and replayed as "checked-in", not "already"',
        lost.status === 200 && lost.results[0]?.outcome === 'checked-in' && plan.seen.length === 2
          && plan.seen.every((s) => s.key === lostBatch.key) && plan.seen[1].replayed === 'true',
        JSON.stringify({ lost: lost.raw, seen: plan.seen }));

      const resend = async (writers: [Backend, Backend], target: Guest) => {
        const sent = batch([{ token: passOf(target) }]);
        return { sent, a1: await post(writers[0], inv, sent), a2: await post(writers[1], inv, sent) };
      };
      const pairs = {
        'next then next': await resend(['next', 'next'], g[1]),
        'rust then rust': await resend(['rust', 'rust'], g[2]),
        'next then rust': await resend(['next', 'rust'], g[3]),
        'rust then next': await resend(['rust', 'next'], g[4]),
      };
      const s = await state(inv);
      check('a batch the scanner resends under its key replays the first answer exactly, to the same writer and across writers; one arrival each',
        Object.values(pairs).every(({ a1, a2 }) => a1.status === 200 && a1.results[0]?.outcome === 'checked-in' && a2.status === 200 && same(a2.raw, a1.raw))
          && same(s.checkins.map((c) => c.name).sort(), ['Fajar', 'Gita', 'Hadi', 'Intan', 'Joko']),
        JSON.stringify(Object.fromEntries(Object.entries(pairs).map(([name, p]) => [name, [p.a1.raw, p.a2.raw]]))));

      const reuse = {
        next: await post('next', inv, { key: pairs['rust then rust'].sent.key, scans: [{ token: passOf(g[5]) }] }),
        rust: await post('rust', inv, { key: pairs['next then next'].sent.key, scans: [{ token: passOf(g[5]) }] }),
      };
      check('a key that answered one batch refuses another in both writers (422 KEY_REUSED), whichever writer recorded it; nothing written',
        reuse.next.status === 422 && reuse.next.code === 'KEY_REUSED' && reuse.rust.status === 422 && reuse.rust.code === 'KEY_REUSED'
          && (await storedTime(g[5])) === null,
        JSON.stringify({ next: reuse.next.raw, rust: reuse.rust.raw }));
    }

    // ── 4. Two desks scan one guest at the same moment: one arrival, whichever writers they use ──
    {
      const inv = await invitation(owner.id, 'desks');
      const pairs: [Backend, Backend][] = [['next', 'rust'], ['rust', 'next'], ['rust', 'rust'], ['next', 'next'], ['next', 'rust']];
      const outcomes: string[] = [];
      let sameTime = true;
      for (const [i, writers] of pairs.entries()) {
        const target = await guest(inv, `Meja ${i + 1}`);
        const both = await Promise.all(writers.map((backend) =>
          roster.checkInWithPasses(caller, { invitationId: inv, scans: [{ token: passOf(target) }], key: `desk-${randomUUID()}` }, envFor(backend))));
        const results = both.map((o) => (o.kind === 'checked' ? o.results[0] : { outcome: o.kind }));
        outcomes.push(results.map((r) => r.outcome).sort().join(' + '));
        const at = await storedTime(target);
        sameTime &&= results.every((r) => 'checkedInAt' in r && r.checkedInAt === at);
      }
      const s = await state(inv);
      check('two desks scanning one guest at once (five pairs of writers): one "checked-in", one "already", one stored time, one CHECKIN event each',
        outcomes.every((o) => o === 'already + checked-in') && sameTime && s.checkins.length === pairs.length,
        `${outcomes.join(', ')}; events ${s.checkins.length}`);
    }

    // ── 5. The manual fallback, the guest list and a pass for one guest: one arrival ──
    {
      const inv = await invitation(owner.id, 'manual');
      const [hana, indra, joko, kirana, lestari] = await guestsOf(inv, ['Hana', 'Indra', 'Joko', 'Kirana', 'Lestari']);
      const scanned = await post('rust', inv, batch([{ token: passOf(hana) }]));
      const manualAfterScan = await as('next', () => manualCheckIn(inv, hana.id));
      const manualFirst = await as('rust', () => manualCheckIn(inv, indra.id));
      const scanAfterManual = await post('next', inv, batch([{ token: passOf(indra) }]));
      check('a scan, then the manual fallback through the other writer: "already" with the scan\'s time; the manual fallback, then a scan: "already" with its time',
        scanned.results[0]?.outcome === 'checked-in' && manualAfterScan.ok && manualAfterScan.already
          && manualAfterScan.checkedInAt === scanned.results[0]?.checkedInAt
          && manualFirst.ok && !manualFirst.already && manualFirst.checkedInAt === (await storedTime(indra))
          && scanAfterManual.results[0]?.outcome === 'already' && scanAfterManual.results[0]?.checkedInAt === manualFirst.checkedInAt,
        JSON.stringify({ scanned: scanned.raw, manualAfterScan, manualFirst, scanAfterManual: scanAfterManual.raw }));

      const operation = (backend: Backend, op: 'checkin' | 'undo-checkin') =>
        as(backend, async () => (await roster.rosterOperation(caller, { invitationId: inv, guestId: joko.id, operation: op })).kind);
      const kinds = [await operation('next', 'checkin')];
      const firstListTime = await storedTime(joko);
      await new Promise((resolve) => setTimeout(resolve, 25));
      kinds.push(await operation('rust', 'checkin'));
      const afterSecond = await storedTime(joko);
      const jokoOnce = (await state(inv)).checkins.filter((c) => c.name === 'Joko').length;
      kinds.push(await operation('rust', 'undo-checkin'), await operation('next', 'checkin'));
      const jokoAgain = (await state(inv)).checkins.filter((c) => c.name === 'Joko').length;
      check('the guest list\'s check-in from two stale lists (one per writer) keeps the first time and one event; after an undo a check-in counts again',
        kinds.every((k) => k === 'saved') && firstListTime !== null && afterSecond === firstListTime && jokoOnce === 1 && jokoAgain === 2,
        JSON.stringify({ kinds, firstListTime, afterSecond, jokoOnce, jokoAgain }));

      const kiranaBoth = await Promise.all(BACKENDS.map((backend) =>
        roster.rosterOperation(caller, { invitationId: inv, guestId: kirana.id, operation: 'checkin' }, envFor(backend))));
      const [scan, listed] = await Promise.all([
        roster.checkInWithPasses(caller, { invitationId: inv, scans: [{ token: passOf(lestari) }], key: `race-${randomUUID()}` }, envFor('rust')),
        roster.rosterOperation(caller, { invitationId: inv, guestId: lestari.id, operation: 'checkin' }, envFor('next')),
      ]);
      const s = await state(inv);
      const eventsOf = (name: string) => s.checkins.filter((c) => c.name === name).length;
      const scanResult = scan.kind === 'checked' ? scan.results[0] : null;
      check('two desks\' manual check-ins at once, and a scan racing the list\'s check-in: one event each, and the scan answers with the stored time',
        kiranaBoth.every((o) => o.kind === 'saved') && eventsOf('Kirana') === 1 && listed.kind === 'saved' && eventsOf('Lestari') === 1
          && !!scanResult && 'checkedInAt' in scanResult && scanResult.checkedInAt === (await storedTime(lestari)),
        JSON.stringify({ kiranaBoth, scan, listed, events: s.checkins }));

      const requireQr = await invitation(owner.id, 'require-qr', { checkInSettings: { enabled: true, requireQr: true } });
      const noManual = await invitation(owner.id, 'no-manual', { checkInSettings: { enabled: true, allowManual: false } });
      const maya = await guest(requireQr, 'Maya');
      const nanda = await guest(noManual, 'Nanda');
      const refusals = [await as('next', () => manualCheckIn(requireQr, maya.id)), await as('rust', () => manualCheckIn(noManual, nanda.id))];
      check('the manual fallback is refused where the host requires the QR or turned manual check-in off; nothing written',
        refusals.every((r) => !r.ok && r.reason === 'manual-off') && (await storedTime(maya)) === null && (await storedTime(nanda)) === null,
        JSON.stringify(refusals));
    }

    // ── 6. Exactly one writer per call ──
    {
      const inv = await invitation(owner.id, 'down');
      const [ola, putu, rani] = await guestsOf(inv, ['Ola', 'Putu', 'Rani']);
      const down = { API_BASE_URL: 'http://127.0.0.1:9' };
      const rustScan = await withEnv(down, () => post('rust', inv, batch([{ token: passOf(ola) }])));
      const rustManual = await withEnv(down, () => as('rust', () => manualCheckIn(inv, putu.id)));
      const before = await state(inv);
      const nextScan = await withEnv(down, () => post('next', inv, batch([{ token: passOf(rani) }])));
      check('under rust with the API down: the scan answers 503 CHECKIN_UNCONFIRMED (the outbox keeps it) and the manual fallback "unconfirmed", nothing written; next never needs the API',
        rustScan.status === 503 && rustScan.code === 'CHECKIN_UNCONFIRMED' && !rustManual.ok && rustManual.reason === 'unconfirmed'
          && before.checkins.length === 0 && before.guests.every((g) => !g.checkedIn)
          && nextScan.status === 200 && nextScan.results[0]?.outcome === 'checked-in',
        JSON.stringify({ rustScan: rustScan.raw, rustManual, nextScan: nextScan.raw }));
    }

    // ── 7. A missing guest-pass secret is a definite answer in both writers, never resent ──
    {
      const inv = await invitation(owner.id, 'unconfigured');
      const sari = await guest(inv, 'Sari');
      const token = passOf(sari);
      const nextBare = await withEnv({ GUEST_PASS_SECRET: undefined, GUEST_PASS_SECRET_PREVIOUS: undefined }, () => post('next', inv, batch([{ token }])));
      const bare = await startBareApi(children);
      const plan = proxy(bare, ['forward']);
      const url = await listen(plan.handler);
      const rustBare = await withEnv({ API_BASE_URL: url }, () => post('rust', inv, batch([{ token }])));
      check('no guest-pass secret: 503 GUEST_PASS_UNCONFIGURED in both writers; the API is asked once (not resent, not "unconfirmed"); nothing written',
        nextBare.status === 503 && nextBare.code === 'GUEST_PASS_UNCONFIGURED' && rustBare.status === 503 && rustBare.code === 'GUEST_PASS_UNCONFIGURED'
          && plan.seen.length === 1 && plan.seen[0].status === 503 && (await storedTime(sari)) === null,
        JSON.stringify({ next: nextBare.raw, rust: rustBare.raw, seen: plan.seen }));
    }

    // ── 8. The opt-in, the owner and the role, in both writers ──
    {
      const optedOut = await invitation(owner.id, 'opted-out', {});
      const theirs = await invitation(other.id, 'theirs');
      const tari = await guest(optedOut, 'Tari');
      const umar = await guest(theirs, 'Umar');
      const off = { next: await post('next', optedOut, batch([{ token: passOf(tari) }])), rust: await post('rust', optedOut, batch([{ token: passOf(tari) }])) };
      const foreign = { next: await post('next', theirs, batch([{ token: passOf(umar) }])), rust: await post('rust', theirs, batch([{ token: passOf(umar) }])) };
      await signIn(admin);
      const asAdmin = await post('rust', optedOut, batch([{ token: passOf(tari) }]));
      await signIn(null);
      const signedOut = await post('next', optedOut, batch([{ token: passOf(tari) }]));
      await signIn(owner);
      check('not opted in: 409 GUEST_PASS_OFF; another owner\'s invitation: 404; an administrator: 403; signed out: 401 (both writers where one is reached); nothing written',
        off.next.status === 409 && off.next.code === 'GUEST_PASS_OFF' && off.rust.status === 409 && off.rust.code === 'GUEST_PASS_OFF'
          && foreign.next.status === 404 && foreign.rust.status === 404 && asAdmin.status === 403 && signedOut.status === 401
          && (await storedTime(tari)) === null && (await storedTime(umar)) === null,
        JSON.stringify({ off: [off.next.raw, off.rust.raw], foreign: [foreign.next.raw, foreign.rust.raw], admin: asAdmin.raw, signedOut: signedOut.raw }));
    }

    // ── 9. The exposure rules (ADR-A3) ──
    {
      const inv = await invitation(owner.id, 'exposure');
      const vina = await guest(inv, 'Vina');
      const body = batch([{ token: passOf(vina) }]);
      const json = { 'content-type': 'application/json' };
      await signIn(null);
      const reads = session.authCalls;
      const crossSite = await post('next', inv, body, { ...json, 'sec-fetch-site': 'cross-site' });
      const sameSite = await post('rust', inv, body, { ...json, 'sec-fetch-site': 'same-site' });
      const foreignOrigin = await post('next', inv, body, { ...json, origin: 'https://evil.example', host: 'app.test' });
      const neither = await post('rust', inv, body, json);
      const sessionReads = session.authCalls - reads;
      await signIn(owner);
      check('cross-site, same-site, a foreign Origin, and neither header: 403 CROSS_SITE, before the session is read',
        [crossSite, sameSite, foreignOrigin, neither].every((a) => a.status === 403 && a.code === 'CROSS_SITE') && sessionReads === 0,
        `${[crossSite, sameSite, foreignOrigin, neither].map((a) => a.status).join(', ')}; session reads ${sessionReads}`);

      const textPlain = await post('next', inv, JSON.stringify(body), { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' });
      const form = await post('rust', inv, 'key=x', { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' });
      const malformed = await post('next', inv, '{"key":');
      const refused = [
        await post('rust', inv, { ...body, guestId: vina.id }),
        await post('next', inv, batch([{ token: 'IVP1.\u00f1' }])),
        await post('rust', inv, batch(Array.from({ length: 51 }, () => ({ token: passOf(vina) })))),
        await post('next', inv, { key: 'short', scans: body.scans }),
        await post('rust', inv, { key: body.key, scans: [] }),
      ];
      check('a simple request (text/plain, a form): 415; malformed JSON: 400; an unknown field, a non-ASCII token, 51 scans, a short key, no scans: 422; nothing written',
        textPlain.status === 415 && form.status === 415 && malformed.status === 400
          && refused.every((a) => a.status === 422 && a.code === 'VALIDATION_ERROR') && (await storedTime(vina)) === null,
        [textPlain, form, malformed, ...refused].map((a) => a.status).join(', '));

      const sameHost = await post('rust', inv, body, { ...json, origin: APP, host: 'app.test' });
      check('a browser that sends no Sec-Fetch-Site but this host\'s Origin is admitted', sameHost.status === 200 && sameHost.results[0]?.outcome === 'checked-in', JSON.stringify(sameHost.raw));

      const answers = [crossSite, sameSite, foreignOrigin, neither, textPlain, form, malformed, ...refused, sameHost];
      const path = `${API}/v1/invitations/${inv}/guest-pass-checkins`;
      const preflight = await fetch(path, { method: 'OPTIONS', headers: { origin: AZP, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
      const unsigned = await fetch(path, { method: 'POST', headers: { origin: AZP, 'content-type': 'application/json' }, body: JSON.stringify({ scans: body.scans }) });
      check('no CORS anywhere: no Access-Control-Allow-Origin from the route or the API, and the API refuses a browser\'s unsigned request (401)',
        answers.every((a) => a.headers.get('access-control-allow-origin') === null) && preflight.headers.get('access-control-allow-origin') === null
          && unsigned.status === 401 && unsigned.headers.get('access-control-allow-origin') === null,
        `preflight ${preflight.status}, unsigned ${unsigned.status}`);
    }

    // ── 10. The rate limit: per host and invitation, before any writer, counted across both writers ──
    {
      const inv = await invitation(owner.id, 'limit');
      const g = await guestsOf(inv, ['Wawan', 'Xena', 'Yogi', 'Zahra', 'Abdi']);
      await freshWindow(30);
      const answers = await withEnv({ RATE_LIMIT_CHECKIN: `4/${LIMIT_WINDOW}` }, async () => {
        const out: Answer[] = [];
        for (const [i, target] of g.entries()) out.push(await post(i % 2 ? 'rust' : 'next', inv, batch([{ token: passOf(target) }])));
        return out;
      });
      const last = answers[4];
      check('4 batches per window, then 429 RATE_LIMITED with Retry-After, counted across both writers; the refused batch writes nothing',
        answers.slice(0, 4).every((a) => a.status === 200) && last.status === 429 && last.code === 'RATE_LIMITED'
          && Number(last.headers.get('retry-after')) > 0 && (await storedTime(g[4])) === null,
        answers.map((a) => a.status).join(', '));
    }

    // ── 11. Flag off: every pass is inert, the manual fallback is off, stored check-ins stay ──
    {
      const inv = first.next.inv;
      const before = await state(inv);
      const newcomer = await guest(inv, 'Baru Datang');
      const off = await withEnv({ FLAG_GUEST_PASS: 'off' }, async () => ({
        next: await post('next', inv, batch([{ token: passOf(newcomer) }])),
        rust: await post('rust', inv, batch([{ token: passOf(newcomer) }])),
        manual: await as('next', () => manualCheckIn(inv, newcomer.id)),
      }));
      const after = await state(inv);
      check('flag off: the route answers 404 under both writers and the manual fallback "off"; earlier check-ins stay; nothing written',
        off.next.status === 404 && off.rust.status === 404 && !off.manual.ok && off.manual.reason === 'off'
          && same(after.checkins, before.checkins) && after.guests.filter((x) => x.checkedIn).length === before.guests.filter((x) => x.checkedIn).length
          && (await storedTime(newcomer)) === null,
        JSON.stringify({ next: off.next.raw, rust: off.rust.raw, manual: off.manual }));
    }
  } finally {
    await signIn(null);
    for (const child of children) child.kill();
    if (savedFlag === undefined) delete env.FLAG_GUEST_PASS;
    else env.FLAG_GUEST_PASS = savedFlag;
    // postgres.js binds a JS array as a bare list, so ids go as array literals.
    const ids = (values: number[]) => `{${values.join(',')}}`;
    const texts = (values: string[]) => `{${values.map((value) => `"${value}"`).join(',')}}`;
    const invitationIds = ids(created.invitations);
    const buckets = created.invitations.flatMap((inv) => created.users.map((owner) => `checkin:${owner}:${inv}`));
    await sql`delete from analytics_events where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from guests where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from invitations where id = any(${invitationIds}::int[])`;
    await sql`delete from users where id = any(${ids(created.users)}::int[])`;
    // Pass check-in scopes are `roster:pass-checkins:<owner>:<invitation>:0`.
    const ownedScope = sql`scope like 'roster:pass-checkins:%' and (string_to_array(scope, ':'))[4] = any(${invitationIds}::text[])`;
    await sql`delete from api_idempotency_keys where ${ownedScope}`;
    await sql`delete from api_rate_limits where bucket = any(${texts(buckets)}::text[])`;
    const [left] = await sql`select (select count(*) from invitations where slug like ${`pass-api-%-${tag}`})::int as invitations,
      (select count(*) from users where clerk_user_id like ${`user_passapi_%_${tag}`})::int as users,
      (select count(*) from api_idempotency_keys where ${ownedScope})::int as keys,
      (select count(*) from api_rate_limits where bucket = any(${texts(buckets)}::text[]))::int as buckets`;
    check('the fixture leaves no row behind', left.invitations === 0 && left.users === 0 && left.keys === 0 && left.buckets === 0, JSON.stringify(left));
    for (const server of servers) server.close();
    await sql.end();
  }
  console.log(failures ? `verify-guest-pass-api: ${failures} FAILED, ${passes} passed` : `verify-guest-pass-api: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
