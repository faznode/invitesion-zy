/**
 * B-033 end to end: every roster call site (both guest lists' add and operations, invite-only events, the import with
 * its preview and undo, the self-registration link, the public form and the host's decisions) against a running Rust
 * API and a scratch database, through the typed client and the service signature. Only Next.js's request primitives
 * (`redirect`, `notFound`, `revalidatePath`, `headers`) and Clerk's session are stubbed; everything after them is product
 * code, and the redirect an action ends in is the notice the host or the registrant sees.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     npx tsx scripts/verify-roster-api.ts
 *
 * The API runs with the same OWNER_TOKEN_* values and the default registration limits (20 per link and 5 per address in
 * 600 s), which the TypeScript writer reads too; scripts/ci/rust.sh starts it so. Fixture rows are fictional, tagged per
 * run and removed.
 *
 * It proves: both writers give the same notice and store the same rows, scenario by scenario; exactly one writer per call
 * (nothing is written when the API is down under `rust`; `next` never calls it); a lost answer is retried under the same
 * key and replayed, never written twice; two imports at once, one per writer, never interleave on one roster; the
 * registration limits count across a flip of the flag; ownership and role come from the database in both writers.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import Module from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}

const session = { clerkUserId: null as string | null, token: null as string | null, headers: new Headers() };
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
  'next/headers': { headers: async () => session.headers, cookies: async () => ({ get: () => undefined, getAll: () => [] }) },
  '@clerk/nextjs/server': {
    auth: async () => ({ userId: session.clerkUserId, getToken: async () => session.token }),
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
const AZP = need('OWNER_TOKEN_AUTHORIZED_PARTIES').split(',')[0].trim();
// The registration limits both writers apply unless RATE_LIMIT_REGISTRATION_* overrides them (it must not here).
const PER_LINK = 20;
const PER_ADDRESS = 5;
const WINDOW = 600;
for (const name of ['RATE_LIMIT_REGISTRATION_LINK', 'RATE_LIMIT_REGISTRATION_IP']) {
  if (env[name]) throw new Error(`${name} must be unset: the API runs with the default registration limits`);
}

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}

/** The limiter's bucket for an address (services/api/src/limits.rs `ip_bucket`), so cleanup can find it. */
const addressBucket = (address: string) =>
  `registration:ip:${createHmac('sha256', SECRET).update('invitesion rate-limit address v1\0').update(address).digest('hex').slice(0, 32)}`;

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
type Seen = { path: string; key?: string; status?: number; replayed?: string | null };
const FORWARDED = ['content-type', 'accept', 'x-invitesion-signature', 'idempotency-key', 'authorization', 'x-request-id'];
/** Forwards to the real API; `forward-drop` lets the API commit, then cuts the connection before the answer. */
function proxy(plan: Array<'forward' | 'forward-drop'>) {
  const seen: Seen[] = [];
  const handler: http.RequestListener = async (req, res) => {
    const body = await bodyOf(req);
    const step = plan.shift() ?? 'forward';
    const headers: Record<string, string> = {};
    for (const name of FORWARDED) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name] as string;
    const upstream = await fetch(`${API}${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? body : undefined });
    const text = await upstream.text();
    seen.push({ path: req.url ?? '', key: headers['idempotency-key'], status: upstream.status, replayed: upstream.headers.get('idempotent-replayed') });
    if (step === 'forward-drop') {
      req.socket.destroy();
      return;
    }
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
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

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return '(no redirect)';
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    if (error instanceof NotFound) return '(not found)';
    throw error;
  }
}

/** A notice without what differs by construction between two fixtures: ids, link tokens, batch ids, form keys. */
const DIFFERS = new Set(['invitation', 'batch', 'k']);
function noticeOf(url: string): string {
  if (!url.startsWith('/')) return url;
  const parsed = new URL(url, 'http://app.test');
  const path = parsed.pathname.replace(/^\/daftar\/[^/]+/, '/daftar/<token>').replace(/\/\d+(?=\/|$)/g, '/<id>');
  const query = new URLSearchParams([...parsed.searchParams].filter(([name]) => !DIFFERS.has(name)));
  return query.size ? `${path}?${query}` : path;
}

/** Waits for a fresh limiter window when fewer than `margin` seconds remain, so a boundary never splits a count. */
async function freshWindow(margin: number) {
  const left = WINDOW - (Math.floor(Date.now() / 1000) % WINDOW);
  if (left < margin) await new Promise((resolve) => setTimeout(resolve, (left + 1) * 1000));
}

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const scoped = await import('../app/(customer)/dashboard/invitations/[id]/guests/actions');
  const global = await import('../app/(customer)/dashboard/guests/actions');
  const imports = await import('../app/(customer)/dashboard/invitations/[id]/guests/import/actions');
  const registration = await import('../app/(customer)/dashboard/invitations/[id]/guests/registration-actions');
  const publicForm = await import('../app/daftar/[token]/actions');
  const roster = await import('../lib/invitation/roster');
  const { inviteField } = await import('../lib/invitation/event-eligibility');
  const { ApiProblem } = await import('../lib/api/client');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const addresses = new Set<string>();

  async function user(name: string, role: 'CUSTOMER' | 'ADMIN') {
    const clerk = `user_rosterapi_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role) values (${`roster-api-${name}-${tag}@example.invalid`}, ${clerk}, ${role}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  type Invitation = { id: number; slug: string };
  async function invitation(owner: number, name: string, config: unknown = {}): Promise<Invitation> {
    const slug = `roster-api-${name}-${tag}`;
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner}, ${slug}, 'wedding', 'PUBLISHED', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return { id: row.id as number, slug };
  }

  /** What both writers must store alike: values, and for random values (link token, batch id) only their presence. */
  async function state(invitationId: number) {
    const guests = await sql`select name, phone, category, guest_count, slug, link_token, invited_event_ids, sent_at, checked_in_at,
      import_batch_id, rsvp_status, attending_count from guests where invitation_id = ${invitationId} order by id`;
    const events = await sql`select event_type from analytics_events where invitation_id = ${invitationId} order by id`;
    const queue = await sql`select name, phone, guest_count from guest_registrations where invitation_id = ${invitationId} order by id`;
    const link = await sql`select token from guest_registration_links where invitation_id = ${invitationId}`;
    return {
      guests: guests.map((g) => ({
        name: g.name, phone: g.phone, category: g.category, guestCount: g.guest_count, slug: g.slug,
        token: g.link_token === null ? null : String(g.link_token).length, invited: g.invited_event_ids,
        sent: g.sent_at !== null, checkedIn: g.checked_in_at !== null, batch: g.import_batch_id !== null,
        rsvp: g.rsvp_status, attending: g.attending_count,
      })),
      events: events.map((e) => e.event_type as string),
      queue: queue.map((q) => ({ name: q.name, phone: q.phone, guestCount: q.guest_count })),
      link: link.map((l) => String(l.token).length),
    };
  }
  type State = Awaited<ReturnType<typeof state>>;
  const guestIds = async (invitationId: number) => (await sql`select id from guests where invitation_id = ${invitationId} order by id`).map((r) => r.id as number);
  const queueIds = async (invitationId: number) => (await sql`select id from guest_registrations where invitation_id = ${invitationId} order by id`).map((r) => r.id as number);
  const linkToken = async (invitationId: number) => ((await sql`select token from guest_registration_links where invitation_id = ${invitationId}`)[0]?.token as string | undefined) ?? 'none';
  const batchOf = async (invitationId: number) =>
    ((await sql`select distinct import_batch_id from guests where invitation_id = ${invitationId} and import_batch_id is not null`)[0]?.import_batch_id as string | undefined) ?? randomUUID();

  const form = (fields: Record<string, string | number>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, String(value));
    return data;
  };

  // Owner tokens: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts share for this API
  // instance (named by a hash of its secret): the API refetches its JWKS for an unknown `kid` at most once per 30 s.
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `roster-api-${tag}`;
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
  const stranger = await jose.generateKeyPair('RS256');
  await listen((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jwks);
    } else {
      res.writeHead(404);
      res.end();
    }
  }, JWKS_PORT);
  const tokenFor = (sub: string, key: CryptoKey = privateKey) =>
    new jose.SignJWT({ azp: AZP, sid: `sess_${tag}` })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 120)
      .sign(key);

  let signedInAt = 0;
  async function signIn(who: { clerk: string } | null) {
    session.clerkUserId = who?.clerk ?? null;
    session.token = who ? await tokenFor(who.clerk) : null;
    signedInAt = Date.now();
  }
  /** One call site under one writer, as the host's (or registrant's) browser would reach it; its notice. */
  async function act(backend: 'next' | 'rust', run: () => Promise<unknown>): Promise<string> {
    if (session.clerkUserId && Date.now() - signedInAt > 60_000) await signIn({ clerk: session.clerkUserId });
    env.BACKEND_ROSTER = backend;
    try {
      return noticeOf(await redirectOf(run));
    } finally {
      delete env.BACKEND_ROSTER;
    }
  }
  type Backend = 'next' | 'rust';
  type Pair = Record<Backend, Invitation>;
  /** Runs the same steps once per writer on its own invitation; both must give the same notices and leave the same state. */
  async function parity(label: string, pair: Pair, run: (inv: Invitation, backend: Backend) => Promise<string[]>, flags: Record<string, string> = {}) {
    const [a, b] = await withEnv(flags, async () => [await run(pair.next, 'next'), await run(pair.rust, 'rust')]);
    const [sa, sb] = [await state(pair.next.id), await state(pair.rust.id)];
    const agree = same(a, b) && same(sa, sb);
    if (!agree) check(`writers agree: ${label}`, false, `next ${JSON.stringify(a)} ${JSON.stringify(sa)} | rust ${JSON.stringify(b)} ${JSON.stringify(sb)}`);
    return { agree, notices: b, state: sb };
  }

  try {
    const owner = await user('owner', 'CUSTOMER');
    const other = await user('other', 'CUSTOMER');
    const admin = await user('admin', 'ADMIN');
    await signIn(owner);
    const pairOf = async (name: string, config: unknown = {}): Promise<Pair> => ({
      next: await invitation(owner.id, `${name}-n`, config),
      rust: await invitation(owner.id, `${name}-r`, config),
    });
    const INVITE_ONLY = { events: [{ id: 'akad', title: 'Akad' }, { id: 'resepsi', title: 'Resepsi', inviteOnly: true }] };

    // ── 1. Adds through the per-invitation list: the same notice and the same stored row, case by case ──
    type AddCase = { name: string; fields: Record<string, string>; invites?: string[]; config?: unknown; flags?: Record<string, string>; times?: number; expect: (s: State, notices: string[]) => boolean };
    const added = '/dashboard/invitations/<id>/guests?added=1';
    const addCases: AddCase[] = [
      { name: 'a full row', fields: { name: 'Budi Hartono', phone: '0812-3456-7890', category: 'Keluarga', guestCount: '3' }, expect: (s, n) => n[0] === added && s.guests[0]?.guestCount === 3 && s.guests[0]?.category === 'Keluarga' },
      { name: 'only a name (one seat)', fields: { name: 'Sari Wulandari' }, expect: (s) => s.guests[0]?.guestCount === 1 && s.guests[0]?.phone === null },
      { name: '+62 with spaces', fields: { name: 'Dewi Lestari', phone: '+62 813 1111 2222' }, expect: (s) => s.guests.length === 1 },
      { name: 'an invalid number', fields: { name: 'Eko', phone: '12345' }, expect: (s, n) => n[0].endsWith('?error=phone') && s.guests.length === 0 },
      { name: 'no name', fields: { name: '   ', phone: '0812 3456 7890' }, expect: (s, n) => n[0].endsWith('?error=name') && s.guests.length === 0 },
      { name: 'seats above the ceiling', fields: { name: 'Fajar', guestCount: '51' }, expect: (s, n) => n[0].endsWith('?error=seats') && s.guests.length === 0 },
      { name: 'seats in words', fields: { name: 'Gita', guestCount: 'dua' }, expect: (_s, n) => n[0].endsWith('?error=seats') },
      { name: 'a category over 50 characters', fields: { name: 'Hadi', category: 'k'.repeat(51) }, expect: (_s, n) => n[0].endsWith('?error=category') },
      { name: 'one name three times takes the next free slug', fields: { name: 'Indah Permata' }, times: 3, expect: (s) => same(s.guests.map((g) => g.slug), ['indah-permata', 'indah-permata-2', 'indah-permata-3']) },
      { name: 'opaque links off', fields: { name: 'Joko' }, flags: { FLAG_OPAQUE_GUEST_LINKS: 'off' }, expect: (s) => s.guests[0]?.token === null },
      { name: 'opaque links on', fields: { name: 'Kartika' }, flags: { FLAG_OPAQUE_GUEST_LINKS: 'on' }, expect: (s) => s.guests[0]?.token === 22 },
      { name: 'ticked events: only current invite-only ones are kept', fields: { name: 'Lina' }, invites: ['resepsi', 'akad', 'hilang'], config: INVITE_ONLY, flags: { FLAG_INVITE_ONLY_EVENTS: 'on' }, expect: (s) => same(s.guests[0]?.invited, ['resepsi']) },
      { name: 'invite-only events off ignores the ticks', fields: { name: 'Maya' }, invites: ['resepsi'], config: INVITE_ONLY, flags: { FLAG_INVITE_ONLY_EVENTS: 'off' }, expect: (s) => s.guests[0]?.invited === null },
    ];
    let addAgreed = 0;
    for (const [index, item] of addCases.entries()) {
      const pair = await pairOf(`add-${index}`, item.config ?? {});
      const result = await parity(`add: ${item.name}`, pair, async (inv, backend) => {
        const notices: string[] = [];
        for (let i = 0; i < (item.times ?? 1); i++) {
          const data = form({ invitationId: inv.id, ...item.fields });
          for (const id of item.invites ?? []) data.set(inviteField(id), 'on');
          notices.push(await act(backend, () => scoped.addScopedGuest(data)));
        }
        return notices;
      }, item.flags);
      const expected = item.expect(result.state, result.notices);
      if (result.agree && expected) addAgreed++;
      else if (result.agree) check(`add: ${item.name}: the expected outcome`, false, `${JSON.stringify(result.notices)} ${JSON.stringify(result.state.guests)}`);
    }
    check(`both writers give the same notice and row in all ${addCases.length} add cases, each as expected`, addAgreed === addCases.length, `${addAgreed} / ${addCases.length}`);

    // ── 2. The global list's add and sent, and the per-invitation operations with their CHECKIN rows ──
    {
      const pair = await pairOf('operations');
      const result = await parity('operations', pair, async (inv, backend) => {
        const notices = [
          await act(backend, () => global.addGuest(form({ invitationId: inv.id, name: 'Nina Global', phone: '0812 7777 8888', category: 'Kantor', guestCount: '2' }))),
          await act(backend, () => global.addGuest(form({ invitationId: inv.id, name: 'Oki', phone: 'bukan nomor' }))),
        ];
        const [guestId] = await guestIds(inv.id);
        for (const operation of ['sent', 'checkin', 'undo-checkin', 'checkin']) {
          notices.push(await act(backend, () => scoped.updateGuestOperation(form({ invitationId: inv.id, guestId, operation }))));
        }
        notices.push(await act(backend, () => global.markGuestSent(form({ invitationId: inv.id, guestId }))));
        notices.push(await act(backend, () => scoped.updateGuestOperation(form({ invitationId: inv.id, guestId: guestId + 1_000_000, operation: 'sent' }))));
        return notices;
      });
      const g = result.state.guests[0];
      check('global add, sent, check-in (with its CHECKIN row), undo, check-in again and a foreign guest agree through both writers',
        result.agree && same(result.notices, ['/dashboard/guests?added=1', '/dashboard/guests?error=phone', '(no redirect)', '(no redirect)', '(no redirect)', '(no redirect)', '(no redirect)', '/dashboard/invitations/<id>/guests?error=notfound'])
          && g?.sent === true && g?.checkedIn === true && same(result.state.events, ['CHECKIN', 'CHECKIN']),
        `${JSON.stringify(result.notices)} ${JSON.stringify(result.state.events)}`);
    }

    // ── 3. Invite-only events: one guest's row, then a whole category in one UPDATE ──
    {
      const pair = await pairOf('invites', INVITE_ONLY);
      const result = await parity('invites', pair, async (inv, backend) => {
        const notices: string[] = [];
        for (const [name, category] of [['Keluarga Satu', 'Keluarga'], ['Keluarga Dua', 'Keluarga'], ['Tanpa Kategori', '']]) {
          notices.push(await act(backend, () => scoped.addScopedGuest(form({ invitationId: inv.id, name, category }))));
        }
        const [, , loose] = await guestIds(inv.id);
        const tick = form({ invitationId: inv.id, guestId: loose });
        tick.set(inviteField('resepsi'), 'on');
        notices.push(await act(backend, () => scoped.setGuestInvitedEvents(tick)));
        const category = (eventId: string, name: string, mode: string) => act(backend, () => scoped.setCategoryInvitation(form({ invitationId: inv.id, eventId, category: name, mode })));
        notices.push(await category('resepsi', ' Keluarga ', 'add'));
        notices.push(await category('resepsi', 'Keluarga', 'add'));
        notices.push(await category('akad', 'Keluarga', 'add'));
        notices.push(await category('resepsi', 'Keluarga', 'remove'));
        notices.push(await category('resepsi', '', 'add'));
        notices.push(await act(backend, () => scoped.setGuestInvitedEvents(form({ invitationId: inv.id, guestId: loose }))));
        return notices;
      }, { FLAG_INVITE_ONLY_EVENTS: 'on' });
      const path = '/dashboard/invitations/<id>/guests';
      check('a guest\'s invite-only events and category invitations (add, again, an open event, remove, no category, untick) agree',
        result.agree && same(result.notices.slice(3), [`${path}?invites=1`, `${path}?invites=2`, `${path}?invites=0`, `${path}?error=invalid`, `${path}?invites=2`, `${path}?invites=0`, `${path}?invites=1`])
          && same(result.state.guests.map((g) => g.invited), [null, null, null]),
        JSON.stringify(result.notices.slice(3)));
    }

    // ── 4. The import: preview, commit as one batch, undo keeps a touched guest, refusals ──
    {
      const pair = await pairOf('import');
      const text = [
        '\ufeffnama;nomor;kategori;jumlah',
        'Budi Hartono;0812-3456-7890;Keluarga;2',
        'Sari Wulandari;12345;;',
        'Budi H.;+62 812 3456 7890;;',
        '"Dewi; Putri";+62 813 1111 2222;Teman;3',
        'Eko Prasetyo;;Kantor;51',
        'Fajar;;;1',
      ].join('\r\n');
      const result = await parity('import', pair, async (inv, backend) => {
        const notices = [await act(backend, () => scoped.addScopedGuest(form({ invitationId: inv.id, name: 'Fajar' })))];
        env.BACKEND_ROSTER = backend;
        const preview = await imports.previewGuestImport(inv.id, text);
        delete env.BACKEND_ROSTER;
        notices.push(JSON.stringify(preview.ok ? preview.summary : preview));
        notices.push(await act(backend, () => imports.commitGuestImport(form({ invitationId: inv.id, text }))));
        const batchId = await batchOf(inv.id);
        const [, budi] = await guestIds(inv.id);
        notices.push(await act(backend, () => scoped.updateGuestOperation(form({ invitationId: inv.id, guestId: budi, operation: 'sent' }))));
        notices.push(await act(backend, () => imports.undoGuestImport(form({ invitationId: inv.id, batchId }))));
        notices.push(await act(backend, () => imports.undoGuestImport(form({ invitationId: inv.id, batchId }))));
        notices.push(await act(backend, () => imports.undoGuestImport(form({ invitationId: inv.id, batchId: randomUUID() }))));
        notices.push(await act(backend, () => imports.commitGuestImport(form({ invitationId: inv.id, text: 'nama;nomor\nTanpa Nomor Sah;123' }))));
        notices.push(await act(backend, () => imports.commitGuestImport(form({ invitationId: inv.id, text: '"tanpa penutup' }))));
        return notices;
      });
      const path = '/dashboard/invitations/<id>/guests';
      const preview = JSON.parse(result.notices[1]) as { ok: number; invalid: number; duplicate: number; verdicts: { status: string; of?: string }[] };
      check('the import agrees through both writers: preview, one batch, undo (a touched guest kept), unknown batch, refusals',
        result.agree && preview.ok === 2 && preview.invalid === 2 && preview.duplicate === 2
          && same(preview.verdicts.map((v) => v.of ?? v.status), ['ok', 'invalid', 'file', 'ok', 'invalid', 'roster'])
          && same(result.notices.slice(2), ['/dashboard/invitations/<id>/guests?imported=2&skipped=4', '(no redirect)', `${path}?undone=1&kept=1`, `${path}?undone=0&kept=1`, `${path}?error=import`, `${path}/import?error=nothing_to_import`, `${path}/import?error=unterminated_quote`])
          && same(result.state.guests.map((g) => [g.name, g.batch, g.sent]), [['Fajar', false, false], ['Budi Hartono', true, true]]),
        `${JSON.stringify(result.notices)} ${JSON.stringify(result.state.guests)}`);
    }

    // ── 5. Self-registration: the link, the public form, the host's decisions, rotation and closing ──
    {
      const pair = await pairOf('registration');
      session.headers = new Headers();
      const result = await parity('registration', pair, async (inv, backend) => {
        const notices = [await act(backend, () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'open' })))];
        const submit = (token: string, fields: Record<string, string>) =>
          act(backend, () => publicForm.submitRegistration(form({ token, key: randomUUID(), ...fields })));
        let token = await linkToken(inv.id);
        notices.push(await act(backend, () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'open' }))));
        notices.push(String(token === (await linkToken(inv.id))));
        notices.push(await submit(token, { name: 'Rina Kartika', phone: '0812 1111 0001', guestCount: '2' }));
        notices.push(await submit(token, { name: 'Rina K.', phone: '+62 812 1111 0001' }));
        notices.push(await submit(token, { name: 'Sinta', guestCount: '6' }));
        notices.push(await submit(token, { name: '', phone: '' }));
        notices.push(await submit(token, { name: 'Tono', phone: '0812 1111 0002' }));
        notices.push(await submit(token, { name: 'Umar' }));
        notices.push(await act(backend, () => scoped.addScopedGuest(form({ invitationId: inv.id, name: 'Umar' }))));
        const [rina, tono, umar] = await queueIds(inv.id);
        const decide = (registrationId: number, decision: string) =>
          act(backend, () => registration.registrationDecisionAction(form({ invitationId: inv.id, registrationId, decision })));
        notices.push(await decide(rina, 'approve'), await decide(tono, 'reject'), await decide(umar, 'approve'), await decide(rina, 'approve'));
        notices.push(await act(backend, () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'rotate' }))));
        notices.push(await submit(token, { name: 'Vina Lama' }));
        token = await linkToken(inv.id);
        notices.push(await submit(token, { name: 'Vina' }));
        notices.push(await act(backend, () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'close' }))));
        notices.push(await submit(token, { name: 'Wawan' }));
        notices.push(await submit(`Zz${tag}`.padEnd(22, 'z'), { name: 'Xena' }));
        return notices;
      }, { FLAG_SELF_REGISTRATION: 'on' });
      const host = '/dashboard/invitations/<id>/guests';
      const form_ = '/daftar/<token>';
      check('self-registration agrees through both writers: link, form (a duplicate thanked, not stored), decisions, rotation, closing',
        result.agree && same(result.notices, [
          `${host}?registration=open`, `${host}?registration=open`, 'true',
          `${form_}?daftar=ok`, `${form_}?daftar=ok`, `${form_}?daftar=invalid&field=seats`, `${form_}?daftar=invalid&field=name`, `${form_}?daftar=ok`, `${form_}?daftar=ok`,
          `${host}?added=1`, `${host}?approved=1`, `${host}?rejected=1`, `${host}?error=duplicate`, `${host}?error=notfound`,
          `${host}?registration=rotate`, `${form_}?daftar=closed`, `${form_}?daftar=ok`, `${host}?registration=close`, `${form_}?daftar=closed`, `${form_}?daftar=closed`,
        ]) && same(result.state.guests.map((g) => [g.name, g.guestCount]), [['Umar', 1], ['Rina Kartika', 2]])
          && same(result.state.queue.map((q) => q.name), ['Umar', 'Vina']) && result.state.link.length === 0,
        `${JSON.stringify(result.notices)} ${JSON.stringify(result.state)}`);
    }

    // ── 6. The registration limits count across a flip of BACKEND_ROSTER (one shared table, one bucket name) ──
    {
      await freshWindow(90);
      const inv = await invitation(owner.id, 'limits');
      await withEnv({ FLAG_SELF_REGISTRATION: 'on', TRUSTED_PROXY_HOPS: '1' }, async () => {
        await act('next', () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'open' })));
        const token = await linkToken(inv.id);
        const address = `203.0.113.${1 + (parseInt(tag.slice(0, 2), 16) % 254)}`;
        addresses.add(address);
        const writers: Backend[] = ['next', 'rust', 'next', 'rust', 'next', 'rust', 'next'];
        session.headers = new Headers({ 'x-forwarded-for': address });
        const byAddress: string[] = [];
        for (const [i, backend] of writers.entries()) {
          byAddress.push(await act(backend, () => publicForm.submitRegistration(form({ token, key: randomUUID(), name: `Alamat ${i + 1}` }))));
        }
        session.headers = new Headers();
        const okCount = byAddress.filter((n) => n.endsWith('daftar=ok')).length;
        check(`${PER_ADDRESS} registrations per address, then busy, counted across both writers`,
          okCount === PER_ADDRESS && byAddress.slice(PER_ADDRESS).every((n) => /\?daftar=busy&r=\d+$/.test(n)), byAddress.join(', '));
        const byLink: string[] = [];
        for (let i = 0; i < PER_LINK - writers.length + 1; i++) {
          byLink.push(await act(i % 2 ? 'rust' : 'next', () => publicForm.submitRegistration(form({ token, key: randomUUID(), name: `Tautan ${i + 1}` }))));
        }
        check(`${PER_LINK} requests per link (refused ones count), then busy, across both writers`,
          byLink.slice(0, -1).every((n) => n.endsWith('daftar=ok')) && /daftar=busy/.test(byLink.at(-1) ?? ''), byLink.slice(-2).join(', '));
        const [{ count }] = await sql`select count(*)::int as count from guest_registrations where invitation_id = ${inv.id}`;
        check('only the allowed registrations were stored', count === PER_ADDRESS + PER_LINK - writers.length, String(count));
      });
    }

    // ── 7. Exactly one writer per call, and a lost answer replayed under the same key ──
    {
      const inv = await invitation(owner.id, 'down');
      const down = { API_BASE_URL: 'http://127.0.0.1:9' };
      const rustAdd = await withEnv(down, () => act('rust', () => scoped.addScopedGuest(form({ invitationId: inv.id, name: 'Saat Mati' }))));
      const rustImport = await withEnv(down, () => act('rust', () => imports.commitGuestImport(form({ invitationId: inv.id, text: 'nama\nAnis\nBagas' }))));
      await withEnv({ FLAG_SELF_REGISTRATION: 'on' }, () => act('next', () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'open' }))));
      const token = await linkToken(inv.id);
      const rustForm = await withEnv({ ...down, FLAG_SELF_REGISTRATION: 'on' }, () => act('rust', () => publicForm.submitRegistration(form({ token, key: randomUUID(), name: 'Cahya' }))));
      const before = await state(inv.id);
      const nextAdd = await withEnv(down, () => act('next', () => scoped.addScopedGuest(form({ invitationId: inv.id, name: 'Tanpa API' }))));
      const after = await state(inv.id);
      check('under rust with the API down: "unconfirmed" and nothing written; under next the API is never needed',
        rustAdd.endsWith('?error=unconfirmed') && rustImport.endsWith('/import?error=unconfirmed') && rustForm === '/daftar/<token>?daftar=retry'
          && before.guests.length === 0 && before.queue.length === 0 && nextAdd.endsWith('?added=1') && after.guests.length === 1,
        `${rustAdd}; ${rustImport}; ${rustForm}; ${nextAdd}`);

      const replay = async (run: () => Promise<unknown>) => {
        const plan = proxy(['forward-drop', 'forward']);
        const url = await listen(plan.handler);
        const notice = await withEnv({ API_BASE_URL: url, FLAG_SELF_REGISTRATION: 'on' }, () => act('rust', run));
        return { notice, seen: plan.seen };
      };
      const replayed = (seen: Seen[]) => seen.length === 2 && !!seen[0].key && seen[0].key === seen[1].key && seen[1].replayed === 'true';
      const add = await replay(() => scoped.addScopedGuest(form({ invitationId: inv.id, name: 'Kirim Ulang' })));
      const batch = await replay(() => imports.commitGuestImport(form({ invitationId: inv.id, text: 'nama\nDanu\nElsa\nFikri' })));
      const key = randomUUID();
      const reg = await replay(() => publicForm.submitRegistration(form({ token, key, name: 'Gilang' })));
      const s = await state(inv.id);
      const [{ batches }] = await sql`select count(distinct import_batch_id)::int as batches from guests where invitation_id = ${inv.id}`;
      check('a committed write whose answer was lost is sent once more under the same key and replayed: one guest, one batch, one request',
        add.notice.endsWith('?added=1') && replayed(add.seen) && batch.notice.includes('imported=3') && replayed(batch.seen)
          && reg.notice === '/daftar/<token>?daftar=ok' && replayed(reg.seen) && reg.seen[0].key === key
          && s.guests.filter((g) => g.name === 'Kirim Ulang').length === 1 && batches === 1 && same(s.queue.map((q) => q.name), ['Gilang']),
        JSON.stringify({ add: add.seen, batch: batch.seen, reg: reg.seen }));
    }

    // ── 8. Two writers at once on one roster: the advisory lock serialises them ──
    {
      const caller = { userId: owner.id, ownerToken: () => tokenFor(owner.clerk) };
      const envFor = (backend: Backend) => ({ ...env, BACKEND_ROSTER: backend });
      const race = await invitation(owner.id, 'race');
      const rows = ['Ayu', 'Bayu', 'Citra', 'Dimas', 'Eka'].map((name) => ({ name }));
      const both = await Promise.all((['next', 'rust'] as const).map((b) => roster.importRosterGuests(caller, { invitationId: race.id, rows, dryRun: false }, envFor(b))));
      const kinds = both.map((o) => o.kind).sort();
      const refused = both.find((o) => o.kind === 'refused');
      const raced = await state(race.id);
      check('two imports of the same rows at once, one per writer: one batch of 5, the other refused as all duplicates',
        same(kinds, ['imported', 'refused']) && refused?.kind === 'refused' && refused.summary.refusal === 'nothing_to_import' && refused.summary.duplicate === 5 && raced.guests.length === 5,
        `${JSON.stringify(both.map((o) => o.kind))} ${raced.guests.length}`);
      const names = await invitation(owner.id, 'race-names');
      const adds = await Promise.all(Array.from({ length: 6 }, (_, i) => roster.addRosterGuest(caller, { invitationId: names.id, row: { name: 'Nama Sama' }, invitedEventIds: [] }, envFor(i % 2 ? 'rust' : 'next'))));
      const slugs = (await state(names.id)).guests.map((g) => g.slug).sort();
      check('six adds of one name at once across both writers: six rows, each slug claimed once',
        adds.every((o) => o.kind === 'saved') && same(slugs, ['nama-sama', 'nama-sama-2', 'nama-sama-3', 'nama-sama-4', 'nama-sama-5', 'nama-sama-6']), slugs.join(', '));
    }

    // ── 9. Ownership and role come from the database, in both writers, for every owner write ──
    {
      const victim = await invitation(owner.id, 'tenancy', INVITE_ONLY);
      const elsewhere = await invitation(other.id, 'elsewhere');
      const ownerCaller = { userId: owner.id, ownerToken: () => tokenFor(owner.clerk) };
      const envFor = (backend: Backend) => ({ ...env, BACKEND_ROSTER: backend, FLAG_INVITE_ONLY_EVENTS: 'on' });
      await roster.importRosterGuests(ownerCaller, { invitationId: victim.id, rows: [{ name: 'Milik Pemilik' }], dryRun: false }, envFor('next'));
      await roster.addRosterGuest({ userId: other.id, ownerToken: () => tokenFor(other.clerk) }, { invitationId: elsewhere.id, row: { name: 'Tamu Lain' }, invitedEventIds: [] }, envFor('next'));
      await sql`insert into guest_registrations (invitation_id, name) values (${victim.id}, ${'Menunggu (fiktif)'})`;
      const [guestId] = await guestIds(victim.id);
      const [foreignGuest] = await guestIds(elsewhere.id);
      const [registrationId] = await queueIds(victim.id);
      const batchId = await batchOf(victim.id);
      const snapshot = await state(victim.id);
      type Caller = Parameters<typeof roster.addRosterGuest>[0];
      const writes = (caller: Caller, envOf: Record<string, string | undefined>) => ({
        add: () => roster.addRosterGuest(caller, { invitationId: victim.id, row: { name: 'Penyusup' }, invitedEventIds: [] }, envOf),
        preview: () => roster.importRosterGuests(caller, { invitationId: victim.id, rows: [{ name: 'Penyusup' }], dryRun: true }, envOf),
        import: () => roster.importRosterGuests(caller, { invitationId: victim.id, rows: [{ name: 'Penyusup' }], dryRun: false }, envOf),
        undo: () => roster.undoRosterImport(caller, { invitationId: victim.id, batchId }, envOf),
        operation: () => roster.rosterOperation(caller, { invitationId: victim.id, guestId, operation: 'checkin' }, envOf),
        invited: () => roster.setRosterInvitedEvents(caller, { invitationId: victim.id, guestId, ticked: ['resepsi'] }, envOf),
        category: () => roster.setRosterCategoryInvitation(caller, { invitationId: victim.id, eventId: 'resepsi', category: '', mode: 'add' }, envOf),
        link: () => roster.setRegistrationLink(caller, { invitationId: victim.id, action: 'rotate' }, envOf),
        decision: () => roster.decideRosterRegistration(caller, { invitationId: victim.id, registrationId, decision: 'approve' }, envOf),
      });
      const kindsOf = async (caller: Caller, envOf: Record<string, string | undefined>) => {
        const result: Record<string, string> = {};
        for (const [name, write] of Object.entries(writes(caller, envOf))) {
          try {
            result[name] = (await write()).kind;
          } catch (error) {
            result[name] = error instanceof ApiProblem ? `${error.status} ${error.code}` : String(error);
          }
        }
        return result;
      };
      const everyIs = (result: Record<string, string>, kind: string) => Object.values(result).length === 9 && Object.values(result).every((k) => k === kind);
      const otherCaller = { userId: other.id, ownerToken: () => tokenFor(other.clerk) };
      const byOther = { next: await kindsOf(otherCaller, envFor('next')), rust: await kindsOf(otherCaller, envFor('rust')) };
      check('another customer gets "not found" from all nine owner writes, in both writers', everyIs(byOther.next, 'notfound') && everyIs(byOther.rust, 'notfound'), JSON.stringify(byOther));
      const foreign = {
        next: (await roster.rosterOperation(ownerCaller, { invitationId: victim.id, guestId: foreignGuest, operation: 'sent' }, envFor('next'))).kind,
        rust: (await roster.rosterOperation(ownerCaller, { invitationId: victim.id, guestId: foreignGuest, operation: 'sent' }, envFor('rust'))).kind,
      };
      check('another customer\'s guest named under the owner\'s invitation is "not found" in both writers', foreign.next === 'notfound' && foreign.rust === 'notfound', JSON.stringify(foreign));
      const byAdmin = await kindsOf({ userId: admin.id, ownerToken: () => tokenFor(admin.clerk) }, envFor('rust'));
      const byStranger = await kindsOf({ userId: 0, ownerToken: () => tokenFor(`user_unknown_${tag}`) }, envFor('rust'));
      const forged = await kindsOf({ userId: owner.id, ownerToken: () => tokenFor(owner.clerk, stranger.privateKey) }, envFor('rust'));
      check('the API refuses an administrator and an unknown account (sign-in) and a forged token (401, propagated) on every owner write',
        everyIs(byAdmin, 'signin') && everyIs(byStranger, 'signin') && everyIs(forged, '401 owner.token_invalid'), JSON.stringify({ byAdmin, byStranger, forged }));
      check('no refused write changed the owner\'s roster, queue or link', same(await state(victim.id), snapshot));
    }

    // ── 10. The flags: the import off refuses before any writer; self-registration off closes the form and the link ──
    {
      const inv = await invitation(owner.id, 'flags');
      const offImport = await withEnv({ FLAG_GUEST_IMPORT: 'off' }, async () => [
        JSON.stringify(await imports.previewGuestImport(inv.id, 'nama\nHani')),
        await act('next', () => imports.commitGuestImport(form({ invitationId: inv.id, text: 'nama\nHani' }))),
        await act('rust', () => imports.commitGuestImport(form({ invitationId: inv.id, text: 'nama\nHani' }))),
      ]);
      await withEnv({ FLAG_SELF_REGISTRATION: 'on' }, () => act('next', () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'open' }))));
      const token = await linkToken(inv.id);
      const offRegistration = await withEnv({ FLAG_SELF_REGISTRATION: 'off' }, async () => [
        await act('rust', () => registration.registrationLinkAction(form({ invitationId: inv.id, action: 'rotate' }))),
        await act('rust', () => publicForm.submitRegistration(form({ token, key: randomUUID(), name: 'Indra' }))),
        await act('next', () => publicForm.submitRegistration(form({ token, key: randomUUID(), name: 'Indra' }))),
      ]);
      const s = await state(inv.id);
      check('import off: preview "not found", commit refused, nothing written; self-registration off: link and form refused, nothing written',
        same(offImport, ['{"ok":false,"error":"notfound"}', '/dashboard/invitations', '/dashboard/invitations'])
          && same(offRegistration, ['/dashboard/invitations/<id>/guests?error=invalid', '/daftar/<token>', '/daftar/<token>'])
          && s.guests.length === 0 && s.queue.length === 0 && token === (await linkToken(inv.id)),
        JSON.stringify({ offImport, offRegistration }));
    }
  } finally {
    await signIn(null);
    session.headers = new Headers();
    // postgres.js binds a JS array as a bare list, so ids go as array literals.
    const ids = (values: number[]) => `{${values.join(',')}}`;
    const invitationIds = ids(created.invitations);
    const buckets = [...created.invitations.map((id) => `registration:link:${id}`), ...[...addresses].map(addressBucket)];
    const texts = (values: string[]) => `{${values.map((value) => `"${value}"`).join(',')}}`;
    await sql`delete from analytics_events where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from guests where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from guest_registrations where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from guest_registration_links where invitation_id = any(${invitationIds}::int[])`;
    await sql`delete from invitations where id = any(${invitationIds}::int[])`;
    await sql`delete from users where id = any(${ids(created.users)}::int[])`;
    // Owner scopes end in `<owner>:<invitation>:<resource>`; registration scopes are `registration:link:<invitation>`.
    const ownedScope = sql`(scope like 'roster:%' and (string_to_array(scope, ':'))[cardinality(string_to_array(scope, ':')) - 1] = any(${invitationIds}::text[]))
      or scope = any(${texts(created.invitations.map((id) => `registration:link:${id}`))}::text[])`;
    await sql`delete from api_idempotency_keys where ${ownedScope}`;
    await sql`delete from api_rate_limits where bucket = any(${texts(buckets)}::text[])`;
    const [left] = await sql`select (select count(*) from invitations where slug like ${`roster-api-%-${tag}`})::int as invitations,
      (select count(*) from users where clerk_user_id like ${`user_rosterapi_%_${tag}`})::int as users,
      (select count(*) from api_idempotency_keys where ${ownedScope})::int as keys,
      (select count(*) from api_rate_limits where bucket = any(${texts(buckets)}::text[]))::int as buckets`;
    check('the fixture leaves no row behind', left.invitations === 0 && left.users === 0 && left.keys === 0 && left.buckets === 0, JSON.stringify(left));
    for (const server of servers) server.close();
    await sql.end();
  }
  console.log(failures ? `verify-roster-api: ${failures} FAILED, ${passes} passed` : `verify-roster-api: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
