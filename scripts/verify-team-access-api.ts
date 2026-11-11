/**
 * G-044 end to end (D-057, ADR-A3): an invitation's team (co-hosts and ushers) against a running Rust API and a scratch
 * database, through both writers. Only Next.js's request primitives and Clerk's session are stubbed; the pages, the
 * server actions, the route handlers, the access guard, the facades, both writers and the binary are product code.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     GUEST_PASS_SECRET=… npx tsx scripts/verify-team-access-api.ts
 *
 * The API runs with the same guest-pass secret. scripts/ci/rust.sh runs this after the guest-pass acceptance. Fixture
 * rows are fictional, tagged per run and removed.
 *
 * It proves, with the answer and the stored rows each time:
 *  1. the join lifecycle: only the owner mints and revokes links (role, label, 7 days, the 20-row ceiling under
 *     concurrency); the secret is shown once and only its hash is stored; the link pages and the `/gabung` cookie;
 *     acceptance by the right account only (owner, administrator, member, used, expired, revoked, repeated, two accounts
 *     racing one link, one account racing two links); leaving; cross-invitation tampering;
 *  2. the capability matrix at every entry (pages, actions, routes, the export) for the owner, a co-host, an usher, an
 *     outsider and an administrator holding a grant, through both writers; the usher's desk carries names only;
 *  3. FLAG_TEAM_ACCESS off: owner-only again at every entry, the global guest list included, with the grants kept;
 *  4. a revoked member's replay: the Rust API (signed requests, the member's own token, the same key) and the TypeScript
 *     writer refuse the stored answer and a changed request alike and write nothing; the check-in route too; a caller
 *     who still has access replays; another member's request under the same key is judged afresh;
 *  5. concurrency: a twin batch under one key is answered once through each writer, and two desks record one arrival.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import Module from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';
import { SIGNATURE_HEADER, signServiceRequest } from '../lib/api/signature';

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}

const session = { clerkUserId: null as string | null, token: null as string | null };
type CookieSet = { name: string; value: string; options: Record<string, unknown> };
const jar = new Map<string, string>();
const cookieSets: CookieSet[] = [];
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  has: (name: string) => jar.has(name),
  set: (name: string, value: string, options: Record<string, unknown> = {}) => {
    cookieSets.push({ name, value, options });
    if (options.maxAge === 0) jar.delete(name);
    else jar.set(name, value);
  },
  delete: (name: string) => jar.delete(name),
};
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
  'next/headers': { headers: async () => new Headers({ 'x-forwarded-proto': 'https', host: 'app.test' }), cookies: async () => cookieStore },
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
const PASS_SECRET = need('GUEST_PASS_SECRET');
need('POSTGRES_URL');

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` (${detail})`}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Backend = 'next' | 'rust';
const BACKENDS: readonly Backend[] = ['next', 'rust'];
type Person = { id: number; clerk: string; name: string };
type Outcome = { kind: 'returned'; value: unknown } | { kind: 'redirect'; url: string } | { kind: 'notfound' };
const APP = 'http://app.test';
const SAME_ORIGIN: Record<string, string> = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const ROSTER_FLAGS = { opaqueLinks: false, inviteOnlyEvents: true };
const OPTED_IN = { checkInSettings: { enabled: true }, events: [{ id: 'akad', title: 'Akad', inviteOnly: true }] };

/** Runs a page, action or route as Next.js would and says how it ended. */
async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: 'returned', value: await run() };
  } catch (error) {
    if (error instanceof Redirect) return { kind: 'redirect', url: error.url };
    if (error instanceof NotFound) return { kind: 'notfound' };
    throw error;
  }
}
const describe = (o: Outcome) => (o.kind === 'redirect' ? `redirect ${o.url}` : o.kind);

/** The props of the first element in a rendered tree whose component has this name. */
function propsOf(node: unknown, name: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf(child, name);
      if (found) return found;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof element.type === 'function' && element.type.name === name) return element.props ?? {};
  return element.props ? propsOf(element.props.children, name) : null;
}

/** JSON of a rendered tree, skipping functions, symbols and anything already seen (React's dev fields can cycle). */
function treeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return undefined;
        seen.add(item);
      }
      return item;
    }) ?? ''
  );
}

function form(values: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, String(value));
  return data;
}

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const members = await import('../lib/invitation/members-db');
  const { signGuestPass } = await import('../lib/invitation/guest-pass');
  const { joinTokenHash } = await import('../lib/invitation/join-token');
  const roster = await import('../lib/invitation/roster');
  const { POST: checkinRoute } = await import('../app/api/invitations/[id]/checkins/route');
  const { GET: exportRoute } = await import('../app/(customer)/dashboard/invitations/[id]/analytics/route');
  const { manualCheckIn } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/actions');
  const guestActions = await import('../app/(customer)/dashboard/invitations/[id]/guests/actions');
  const globalGuestActions = await import('../app/(customer)/dashboard/guests/actions');
  const importActions = await import('../app/(customer)/dashboard/invitations/[id]/guests/import/actions');
  const registrationActions = await import('../app/(customer)/dashboard/invitations/[id]/guests/registration-actions');
  const wishActions = await import('../app/(customer)/dashboard/invitations/[id]/wishes/actions');
  const teamActions = await import('../app/(customer)/dashboard/invitations/[id]/team/actions');
  const { leaveTeamAction } = await import('../app/(customer)/dashboard/team-actions');
  const joinActions = await import('../app/gabung/actions');
  const { default: JoinLinkPage } = await import('../app/gabung/[token]/page');
  const { default: GuestsPage } = await import('../app/(customer)/dashboard/invitations/[id]/guests/page');
  const { default: CheckinPage } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/page');
  const { default: InsightsPage } = await import('../app/(customer)/dashboard/invitations/[id]/insights/page');
  const { default: WishesPage } = await import('../app/(customer)/dashboard/invitations/[id]/wishes/page');
  const { default: TeamPage } = await import('../app/(customer)/dashboard/invitations/[id]/team/page');
  const { default: ImportPage } = await import('../app/(customer)/dashboard/invitations/[id]/guests/import/page');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const saved = Object.fromEntries(['FLAG_TEAM_ACCESS', 'FLAG_GUEST_PASS', 'FLAG_SELF_REGISTRATION', 'NEXT_PUBLIC_APP_URL'].map((name) => [name, env[name]]));
  env.FLAG_TEAM_ACCESS = 'on';
  env.FLAG_GUEST_PASS = 'on';
  env.FLAG_SELF_REGISTRATION = 'on';
  env.NEXT_PUBLIC_APP_URL = APP;

  async function person(name: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER'): Promise<Person> {
    const clerk = `user_team_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role, name) values (${`team-${name}-${tag}@example.invalid`}, ${clerk}, ${role}, ${`Tim ${name}`}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk, name };
  }
  async function invitation(owner: Person, name: string, config: unknown = OPTED_IN): Promise<number> {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner.id}, ${`team-${name}-${tag}`}, 'wedding', 'PUBLISHED', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return row.id as number;
  }
  async function guest(invitationId: number, name: string, phone: string | null = null): Promise<{ id: number; passId: string }> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, phone, slug) values (${invitationId}, ${name}, ${phone}, ${slug}) returning id, pass_id`;
    return { id: row.id as number, passId: row.pass_id as string };
  }
  async function wish(invitationId: number, name: string): Promise<number> {
    const [row] = await sql`insert into guest_messages (invitation_id, name, message) values (${invitationId}, ${name}, 'Selamat menempuh hidup baru') returning id`;
    return row.id as number;
  }
  async function liveGrants(invitationId: number): Promise<number> {
    const [row] = await sql`select count(*)::int as n from invitation_members where invitation_id = ${invitationId} and user_id is not null and revoked_at is null`;
    return row.n as number;
  }
  /** Everything a host write can change on one invitation, to show that a refusal changed nothing. */
  async function snapshot(invitationId: number) {
    const [row] = await sql`select json_build_object(
      'guests', (select coalesce(json_agg(json_build_array(g.id, g.name, g.sent_at is not null, g.rsvp_status, g.checked_in_at is not null, g.invited_event_ids) order by g.id), '[]') from guests g where g.invitation_id = ${invitationId}),
      'wishes', (select coalesce(json_agg(json_build_array(w.id, w.is_hidden, w.host_reply) order by w.id), '[]') from guest_messages w where w.invitation_id = ${invitationId}),
      'registrations', (select count(*) from guest_registrations r where r.invitation_id = ${invitationId}),
      'link', (select token from guest_registration_links l where l.invitation_id = ${invitationId}),
      'events', (select coalesce(json_agg(json_build_array(a.event_type, a.guest_id) order by a.id), '[]') from analytics_events a where a.invitation_id = ${invitationId})
    )::text as state`;
    return row.state as string;
  }

  // Owner tokens: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts share for this API
  // instance (named by a hash of its secret): the API refetches its JWKS for an unknown `kid` at most once per 30 s.
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `team-api-${tag}`;
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
  const jwksServer = http.createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jwks);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => jwksServer.listen(JWKS_PORT, '127.0.0.1', resolve));
  void (jwksServer.address() as AddressInfo).port;
  const tokenFor = (sub: string) =>
    new jose.SignJWT({ azp: AZP, sid: `sess_${tag}` })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey);

  async function signIn(who: Person | null) {
    session.clerkUserId = who?.clerk ?? null;
    session.token = who ? await tokenFor(who.clerk) : null;
  }
  /** One call as `who` under one writer for every domain (`BACKEND_*` is read per call). */
  async function as<T>(who: Person | null, backend: Backend, run: () => Promise<T>): Promise<T> {
    await signIn(who);
    env.BACKEND_ROSTER = backend;
    env.BACKEND_RSVP = backend;
    env.BACKEND_WISHES = backend;
    try {
      return await run();
    } finally {
      delete env.BACKEND_ROSTER;
      delete env.BACKEND_RSVP;
      delete env.BACKEND_WISHES;
    }
  }
  const act = (who: Person | null, backend: Backend, run: () => Promise<unknown>) => as(who, backend, () => outcome(run));
  const page = (who: Person | null, render: () => Promise<unknown>) => act(who, 'next', render);
  const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) });

  type RouteAnswer = { status: number; code: string | null; raw: unknown; text: string };
  async function postCheckins(who: Person | null, backend: Backend, invitationId: number, body: unknown): Promise<RouteAnswer> {
    return as(who, backend, async () => {
      const response = await checkinRoute(new Request(`${APP}/api/invitations/${invitationId}/checkins`, { method: 'POST', headers: SAME_ORIGIN, body: JSON.stringify(body) }), {
        params: Promise.resolve({ id: String(invitationId) }),
      });
      const text = await response.text();
      const raw: unknown = text ? JSON.parse(text) : null;
      return { status: response.status, code: (raw as { error?: { code?: string } } | null)?.error?.code ?? null, raw, text };
    });
  }
  async function exportCsv(who: Person, invitationId: number): Promise<{ status: number; type: string | null; text: string }> {
    return as(who, 'next', async () => {
      const response = await exportRoute(new Request(`${APP}/dashboard/invitations/${invitationId}/analytics`), { params: Promise.resolve({ id: String(invitationId) }) });
      return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
    });
  }

  type ApiAnswer = { status: number; replayed: boolean; code: string | null; text: string };
  /** A signed request straight to the API, as `who`, under `key`: the private service path without any Next.js guard. */
  async function api(who: Person, path: string, body: unknown, key: string): Promise<ApiAnswer> {
    const text = body === undefined ? '' : JSON.stringify(body);
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        [SIGNATURE_HEADER]: signServiceRequest(SECRET, Math.floor(Date.now() / 1000), 'POST', path, text),
        authorization: `Bearer ${await tokenFor(who.clerk)}`,
        'idempotency-key': key,
      },
      body: body === undefined ? undefined : text,
    });
    const raw = await response.text();
    let code: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { code?: unknown };
      if (typeof parsed.code === 'string') code = parsed.code;
    } catch {
      // not JSON: the checks fail on the status instead
    }
    return { status: response.status, replayed: response.headers.get('idempotent-replayed') === 'true', code, text: raw };
  }

  const pass = (passId: string) => signGuestPass(Buffer.from(PASS_SECRET), passId, Math.floor(Date.now() / 1000) + 7 * 86_400);
  /** Mints a link as the owner and has `who` accept it, through the product's own functions. */
  async function joinTeam(owner: Person, invitationId: number, who: Person, role: 'cohost' | 'usher'): Promise<number> {
    const link = await members.createJoinLink(owner.id, invitationId, { role, label: `Untuk ${who.name}` });
    if (link.kind !== 'created') throw new Error(`no link for ${who.name}: ${link.kind}`);
    const accepted = await members.acceptJoinLink(who.id, link.token);
    if (accepted.kind !== 'joined') throw new Error(`${who.name} did not join: ${accepted.kind}`);
    const [row] = await sql`select id from invitation_members where token_hash = ${joinTokenHash(link.token)}`;
    return row.id as number;
  }

  try {
    const owner = await person('owner');
    const cohost = await person('cohost');
    const cohost2 = await person('cohost2');
    const usher = await person('usher');
    const outsider = await person('outsider');
    const admin = await person('admin', 'ADMIN');
    const elsewhere = await person('elsewhere');
    const racers = [await person('racer1'), await person('racer2')];
    const joiner = await person('joiner');
    const A = await invitation(owner, 'a');
    const B = await invitation(elsewhere, 'b');

    // ── 1. The join lifecycle ──
    {
      const created1 = await act(owner, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'usher', label: '  Rina   (meja pria) ' })));
      const state = created1.kind === 'returned' ? (created1.value as { status: string; url?: string; label?: string; whatsapp?: string }) : null;
      const token = state?.url?.split('/gabung/')[1] ?? '';
      const [row] = token ? await sql`select m.*, row_to_json(m)::text as json from invitation_members m where token_hash = ${joinTokenHash(token)}` : [];
      const days = row ? (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000 : 0;
      check('the owner mints a usher link: shown once with a 43-character secret, label normalised, expiring in 7 days',
        state?.status === 'created' && /^[A-Za-z0-9_-]{43}$/.test(token) && state.url === `${APP}/gabung/${token}` && row?.label === 'Rina (meja pria)'
          && row?.role === 'usher' && days > 6.99 && days <= 7 && (state.whatsapp ?? '').startsWith('https://wa.me/?text='),
        JSON.stringify({ state, label: row?.label, days }));
      check('only the SHA-256 of the secret is stored: no column of the row holds the secret',
        Boolean(row) && row.token_hash === createHash('sha256').update(token).digest('hex') && !String(row.json).includes(token));

      const before = await sql`select count(*)::int as n from invitation_members where invitation_id = ${A}`;
      const refused = {
        cohostRole: await act(owner, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'owner', label: 'X' }))),
        emptyLabel: await act(owner, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'cohost', label: ' \u0001 ' }))),
        longLabel: await act(owner, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'cohost', label: 'a'.repeat(61) }))),
        outsider: await act(outsider, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'cohost', label: 'Saya' }))),
        elsewhereOwner: await act(elsewhere, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'cohost', label: 'Saya' }))),
        admin: await act(admin, 'next', () => teamActions.createTeamLink({ status: 'idle' }, form({ invitationId: A, role: 'cohost', label: 'Saya' }))),
      };
      const after = await sql`select count(*)::int as n from invitation_members where invitation_id = ${A}`;
      const errored = (o: Outcome) => o.kind === 'returned' && (o.value as { status?: string }).status === 'error';
      check('a role outside the two, an empty or 61-character label, another customer and another owner are refused; an admin is sent to sign-in; no row',
        errored(refused.cohostRole) && errored(refused.emptyLabel) && errored(refused.longLabel) && errored(refused.outsider) && errored(refused.elsewhereOwner)
          && refused.admin.kind === 'redirect' && refused.admin.url === '/sign-in' && before[0].n === after[0].n,
        JSON.stringify(Object.fromEntries(Object.entries(refused).map(([k, v]) => [k, describe(v)]))));

      // Signed out: the page offers sign-in; the secret goes into the /gabung cookie and the sign-in URL names /gabung/terima only.
      const signedOutPage = await page(null, () => JoinLinkPage({ params: Promise.resolve({ token }) }));
      const begin = await act(null, 'next', () => joinActions.beginJoin(form({ token })));
      const set = cookieSets.at(-1);
      check('signed out, the link page renders and "Masuk untuk bergabung" keeps the secret in an HttpOnly, SameSite=Lax, Secure cookie scoped to /gabung for an hour',
        signedOutPage.kind === 'returned' && begin.kind === 'redirect' && begin.url === '/sign-in?redirect_url=%2Fgabung%2Fterima' && !begin.url.includes(token)
          && set?.name === 'inv_join' && set.value === token && same(set.options, { httpOnly: true, sameSite: 'lax', secure: true, path: '/gabung', maxAge: 3600 }),
        JSON.stringify({ page: describe(signedOutPage), begin: describe(begin), set }));
      const accepted = await act(usher, 'next', () => joinActions.acceptJoin(form({})));
      const cleared = cookieSets.at(-1);
      const [usherRow] = await sql`select user_id, accepted_at from invitation_members where token_hash = ${joinTokenHash(token)}`;
      check('after sign-in the usher accepts from the cookie (a POST): the grant is theirs, the cookie is cleared, the dashboard welcomes them',
        accepted.kind === 'redirect' && accepted.url === `/dashboard?bergabung=${A}` && usherRow?.user_id === usher.id && usherRow.accepted_at !== null
          && cleared?.name === 'inv_join' && cleared.options.maxAge === 0 && !jar.has('inv_join'),
        JSON.stringify({ accepted: describe(accepted), cleared }));

      const again = await act(usher, 'next', () => joinActions.acceptJoin(form({ token })));
      const stranger = await act(outsider, 'next', () => joinActions.acceptJoin(form({ token })));
      const ownLink = await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Untuk diri sendiri' });
      const ownerTry = ownLink.kind === 'created' ? await act(owner, 'next', () => joinActions.acceptJoin(form({ token: ownLink.token }))) : null;
      jar.set('inv_join', ownLink.kind === 'created' ? ownLink.token : '');
      const adminTry = ownLink.kind === 'created' ? await act(admin, 'next', () => joinActions.acceptJoin(form({ token: ownLink.token }))) : null;
      const adminCleared = !jar.has('inv_join');
      const second = await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Link kedua' });
      const memberTry = second.kind === 'created' ? await act(usher, 'next', () => joinActions.acceptJoin(form({ token: second.token }))) : null;
      check('a second tap by the same account lands as joined; another account is told the link is invalid; the owner and an admin cannot join; a member cannot take a second role',
        again.kind === 'redirect' && again.url === `/dashboard?bergabung=${A}` && stranger.kind === 'redirect' && stranger.url === '/gabung/terima?status=invalid'
          && ownerTry?.kind === 'redirect' && ownerTry.url === '/gabung/terima?status=owner' && adminTry?.kind === 'redirect' && adminTry.url === '/gabung/terima?status=admin'
          && adminCleared && memberTry?.kind === 'redirect' && memberTry.url === '/gabung/terima?status=member' && (await liveGrants(A)) === 1,
        JSON.stringify({ again: describe(again), stranger: describe(stranger), owner: ownerTry && describe(ownerTry), admin: adminTry && describe(adminTry), member: memberTry && describe(memberTry) }));

      const expiring = await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Kedaluwarsa' });
      const revoking = await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Dicabut' });
      if (expiring.kind !== 'created' || revoking.kind !== 'created') throw new Error('links for the expiry checks');
      await sql`update invitation_members set expires_at = now() - interval '1 second' where token_hash = ${joinTokenHash(expiring.token)}`;
      const [revRow] = await sql`select id from invitation_members where token_hash = ${joinTokenHash(revoking.token)}`;
      const revokedNow = await act(owner, 'next', () => teamActions.revokeTeamMember(form({ invitationId: A, rowId: revRow.id })));
      const previews = [
        await members.joinPreview(token, outsider.id),
        await members.joinPreview(expiring.token, outsider.id),
        await members.joinPreview(revoking.token, outsider.id),
        await members.joinPreview('A'.repeat(43), outsider.id),
        await members.joinPreview('not-a-token', null),
      ];
      const accepts = [await members.acceptJoinLink(outsider.id, expiring.token), await members.acceptJoinLink(outsider.id, revoking.token)];
      const invalidPage = await page(outsider, () => JoinLinkPage({ params: Promise.resolve({ token: expiring.token }) }));
      check('a used, expired, revoked, unknown or malformed link previews and accepts as the same "invalid", and its page renders the same refusal',
        revokedNow.kind === 'redirect' && revokedNow.url.endsWith('revoked=1') && previews.every((p) => p.state === 'invalid') && accepts.every((a) => a.kind === 'invalid')
          && invalidPage.kind === 'returned',
        JSON.stringify({ previews, accepts, revokedNow: describe(revokedNow) }));

      // Races, on links of their own.
      const raced = await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Satu tautan' });
      if (raced.kind !== 'created') throw new Error('race link');
      const results = await Promise.all(racers.map((r) => members.acceptJoinLink(r.id, raced.token)));
      const [racedRow] = await sql`select user_id from invitation_members where token_hash = ${joinTokenHash(raced.token)}`;
      check('two accounts racing for one link: exactly one joins, the other is told it is invalid, and the row names the winner',
        same(results.map((r) => r.kind).sort(), ['invalid', 'joined']) && racers[results.findIndex((r) => r.kind === 'joined')]?.id === racedRow.user_id,
        JSON.stringify(results));
      const two = [await members.createJoinLink(owner.id, A, { role: 'cohost', label: 'Dua A' }), await members.createJoinLink(owner.id, A, { role: 'usher', label: 'Dua B' })];
      if (two.some((l) => l.kind !== 'created')) throw new Error('two links');
      const both = await Promise.all(two.map((l) => members.acceptJoinLink(joiner.id, (l as { token: string }).token)));
      const [{ n: joinerGrants }] = await sql`select count(*)::int as n from invitation_members where invitation_id = ${A} and user_id = ${joiner.id} and revoked_at is null`;
      check('one account racing two links for one invitation: one grant, the other answered "member"; the partial unique index holds one live grant',
        same(both.map((r) => r.kind).sort(), ['joined', 'member']) && joinerGrants === 1, JSON.stringify(both));

      // The ceiling under concurrency, on an invitation of its own.
      const C = await invitation(owner, 'c');
      for (let i = 0; i < 18; i++) await members.createJoinLink(owner.id, C, { role: 'usher', label: `Meja ${i + 1}` });
      const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => members.createJoinLink(owner.id, C, { role: 'usher', label: `Serbu ${i}` })));
      const [{ n: liveC }] = await sql`select count(*)::int as n from invitation_members where invitation_id = ${C} and revoked_at is null and (user_id is not null or expires_at > now())`;
      check('five links made at once with 18 live rows: exactly two are made and three refused as full; 20 live rows',
        burst.filter((b) => b.kind === 'created').length === 2 && burst.filter((b) => b.kind === 'full').length === 3 && liveC === 20, JSON.stringify(burst.map((b) => b.kind)));

      // Revocation and leaving cannot reach another invitation's rows.
      const aRow = (await sql`select id from invitation_members where invitation_id = ${A} and user_id = ${racedRow.user_id} and revoked_at is null`)[0];
      const tamper = [await members.revokeTeamRow(elsewhere.id, B, aRow.id), await members.revokeTeamRow(elsewhere.id, A, aRow.id), await members.leaveTeam(outsider.id, A)];
      const [stillLive] = await sql`select revoked_at from invitation_members where id = ${aRow.id}`;
      check('another owner revoking a row of this invitation through theirs or this one, and an outsider leaving, change nothing',
        tamper.every((t) => t === false) && stillLive.revoked_at === null, JSON.stringify(tamper));
      await members.revokeTeamRow(owner.id, A, aRow.id);
      await sql`update invitation_members set revoked_at = now() where invitation_id = ${A} and user_id = ${joiner.id} and revoked_at is null`;
    }

    // Team for the matrix: a co-host and a second co-host by links; the usher joined above; an administrator holding a
    // live grant (a customer who accepted a link and was later made an administrator: the product refuses an admin's join).
    const cohostRow = await joinTeam(owner, A, cohost, 'cohost');
    await joinTeam(owner, A, cohost2, 'cohost');
    await sql`insert into invitation_members (invitation_id, role, label, token_hash, expires_at, user_id, accepted_at)
      values (${A}, 'cohost', 'Dulu pelanggan', ${createHash('sha256').update(`admin-${tag}`).digest('hex')}, now() + interval '7 days', ${admin.id}, now())`;
    const usherRow = (await sql`select id from invitation_members where invitation_id = ${A} and user_id = ${usher.id} and revoked_at is null`)[0].id as number;
    const budi = await guest(A, 'Budi Hartono', '081234567890');
    const citra = await guest(A, 'Citra Dewi', '081298765432');
    const elseGuest = await guest(B, 'Gita Elsewhere', '081200000000');
    const wishA = await wish(A, 'Tamu Pertama');
    const wishB = await wish(B, 'Tamu Lain');

    // ── 2. The capability matrix at every entry, flag on ──
    {
      const views = {
        guests: { owner: await page(owner, () => GuestsPage(params(A))), cohost: await page(cohost, () => GuestsPage(params(A))), usher: await page(usher, () => GuestsPage(params(A))), outsider: await page(outsider, () => GuestsPage(params(A))), admin: await page(admin, () => GuestsPage(params(A))) },
        insights: { cohost: await page(cohost, () => InsightsPage(params(A))), usher: await page(usher, () => InsightsPage(params(A))), admin: await page(admin, () => InsightsPage(params(A))) },
        wishes: { cohost: await page(cohost, () => WishesPage(params(A))), usher: await page(usher, () => WishesPage(params(A))), admin: await page(admin, () => WishesPage(params(A))) },
        team: { owner: await page(owner, () => TeamPage(params(A))), cohost: await page(cohost, () => TeamPage(params(A))), usher: await page(usher, () => TeamPage(params(A))) },
        importPage: { cohost: await page(cohost, () => ImportPage(params(A))), usher: await page(usher, () => ImportPage(params(A))) },
        checkin: { usher: await page(usher, () => CheckinPage(params(A))), cohost: await page(cohost, () => CheckinPage(params(A))), outsider: await page(outsider, () => CheckinPage(params(A))), admin: await page(admin, () => CheckinPage(params(A))) },
      };
      const k = (o: Outcome) => (o.kind === 'redirect' ? o.url : o.kind);
      check('pages: guests, insights, wishes and import open for the owner and a co-host only; the team page for the owner only; the desk for all three roles; outsiders get 404 and an admin sign-in',
        k(views.guests.owner) === 'returned' && k(views.guests.cohost) === 'returned' && k(views.guests.usher) === 'notfound' && k(views.guests.outsider) === 'notfound' && k(views.guests.admin) === '/sign-in'
          && k(views.insights.cohost) === 'returned' && k(views.insights.usher) === 'notfound' && k(views.insights.admin) === '/sign-in'
          && k(views.wishes.cohost) === 'returned' && k(views.wishes.usher) === 'notfound' && k(views.wishes.admin) === '/sign-in'
          && k(views.team.owner) === 'returned' && k(views.team.cohost) === 'notfound' && k(views.team.usher) === 'notfound'
          && k(views.importPage.cohost) === 'returned' && k(views.importPage.usher) === 'notfound'
          && k(views.checkin.usher) === 'returned' && k(views.checkin.cohost) === 'returned' && k(views.checkin.outsider) === 'notfound' && k(views.checkin.admin) === '/sign-in',
        JSON.stringify(Object.fromEntries(Object.entries(views).map(([name, v]) => [name, Object.fromEntries(Object.entries(v).map(([who, o]) => [who, k(o)]))]))));
      const scanner = views.checkin.usher.kind === 'returned' ? propsOf(views.checkin.usher.value, 'CheckinScanner') : null;
      const rosterEntries = (scanner?.roster ?? []) as Record<string, unknown>[];
      check("the usher's desk carries each guest's display name, a one-way pass key and the arrival only: no phone, RSVP, pass id or wish",
        rosterEntries.length === 2 && rosterEntries.every((e) => same(Object.keys(e).sort(), ['checkedInAt', 'id', 'key', 'name']))
          && !treeJson(scanner).includes('0812') && !treeJson(scanner).includes(budi.passId) && !treeJson(scanner).includes('Selamat'),
        treeJson(scanner));
      const backTo = views.checkin.usher.kind === 'returned' ? treeJson(views.checkin.usher.value) : '';
      check("the usher's way back is the dashboard, not the guest list", backTo.includes('"href":"/dashboard"') && !backTo.includes(`/dashboard/invitations/${A}/guests"`));

      const csv = { cohost: await exportCsv(cohost, A), usher: await exportCsv(usher, A), outsider: await exportCsv(outsider, A), admin: await exportCsv(admin, A), cross: await exportCsv(cohost, B) };
      check('the guest export: a co-host gets the CSV; an usher, an outsider and another invitation are 404; an admin is 403 before the invitation is read',
        csv.cohost.status === 200 && (csv.cohost.type ?? '').startsWith('text/csv') && csv.cohost.text.includes('Budi Hartono')
          && csv.usher.status === 404 && csv.outsider.status === 404 && csv.cross.status === 404 && csv.admin.status === 403,
        JSON.stringify(Object.fromEntries(Object.entries(csv).map(([n, r]) => [n, r.status]))));
      check('the guard: an admin holding a live grant has no access, as a member or otherwise', (await members.invitationAccess(admin.id, A)) === null);

      for (const backend of BACKENDS) {
        const added = {
          cohost: await act(cohost, backend, () => guestActions.addScopedGuest(form({ invitationId: A, name: `Tamu Cohost ${backend}`, phone: '', category: '', guestCount: '1' }))),
          usher: await act(usher, backend, () => guestActions.addScopedGuest(form({ invitationId: A, name: `Tamu Usher ${backend}`, phone: '', category: '', guestCount: '1' }))),
          outsider: await act(outsider, backend, () => guestActions.addScopedGuest(form({ invitationId: A, name: `Tamu Luar ${backend}`, phone: '', category: '', guestCount: '1' }))),
          admin: await act(admin, backend, () => guestActions.addScopedGuest(form({ invitationId: A, name: `Tamu Admin ${backend}`, phone: '', category: '', guestCount: '1' }))),
          globalCohost: await act(cohost, backend, () => globalGuestActions.addGuest(form({ invitationId: A, name: `Global Cohost ${backend}`, phone: '', category: '', guestCount: '1' }))),
          globalUsher: await act(usher, backend, () => globalGuestActions.addGuest(form({ invitationId: A, name: `Global Usher ${backend}`, phone: '', category: '', guestCount: '1' }))),
          crossCohost: await act(cohost, backend, () => guestActions.addScopedGuest(form({ invitationId: B, name: `Lintas ${backend}`, phone: '', category: '', guestCount: '1' }))),
        };
        const names = (await sql`select name from guests where invitation_id in (${A}, ${B})`).map((r) => r.name as string);
        check(`${backend}: adding a guest (the invitation's list and the global list): a co-host writes; an usher, an outsider, an admin and another invitation are refused with nothing stored`,
          added.cohost.kind === 'redirect' && added.cohost.url.includes('added=1') && names.includes(`Tamu Cohost ${backend}`)
            && added.globalCohost.kind === 'redirect' && added.globalCohost.url.includes('added=1') && names.includes(`Global Cohost ${backend}`)
            && added.usher.kind === 'redirect' && added.usher.url === '/dashboard/invitations' && added.outsider.kind === 'redirect' && added.admin.kind === 'redirect' && added.admin.url === '/sign-in'
            && added.globalUsher.kind === 'redirect' && added.globalUsher.url.includes('error=') && added.crossCohost.kind === 'redirect'
            && !names.some((n) => [`Tamu Usher ${backend}`, `Tamu Luar ${backend}`, `Tamu Admin ${backend}`, `Global Usher ${backend}`, `Lintas ${backend}`].includes(n)),
          JSON.stringify(Object.fromEntries(Object.entries(added).map(([n, o]) => [n, describe(o)]))));

        const g = await guest(A, `Operasi ${backend}`);
        const ops = {
          sent: await act(cohost, backend, () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: g.id, operation: 'sent' }))),
          rsvp: await act(cohost, backend, () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: g.id, operation: 'CONFIRMED' }))),
          usherRsvp: await act(usher, backend, () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: g.id, operation: 'DECLINED' }))),
          usherListCheckin: await act(usher, backend, () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: g.id, operation: 'checkin' }))),
          crossGuest: await act(cohost, backend, () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: elseGuest.id, operation: 'CONFIRMED' }))),
        };
        const [gRow] = await sql`select sent_at, rsvp_status, checked_in_at from guests where id = ${g.id}`;
        const [elseRow] = await sql`select rsvp_status from guests where id = ${elseGuest.id}`;
        check(`${backend}: the guest list's operations and the RSVP override: a co-host marks sent and confirms; an usher cannot override or check in from the list; another invitation's guest is untouched`,
          gRow.sent_at !== null && gRow.rsvp_status === 'CONFIRMED' && gRow.checked_in_at === null && elseRow.rsvp_status === 'PENDING'
            && ops.usherRsvp.kind === 'redirect' && ops.usherRsvp.url === '/dashboard/invitations' && ops.usherListCheckin.kind === 'redirect',
          JSON.stringify({ ops: Object.fromEntries(Object.entries(ops).map(([n, o]) => [n, describe(o)])), gRow }));

        const imported = await act(cohost, backend, () => importActions.commitGuestImport(form({ invitationId: A, text: `Nama\tTelepon\nImpor ${backend}\t\n` })));
        const batch = imported.kind === 'redirect' ? new URL(imported.url, APP).searchParams.get('batch') : null;
        const usherImport = await act(usher, backend, () => importActions.commitGuestImport(form({ invitationId: A, text: `Nama\nImpor Usher ${backend}\n` })));
        const undone = batch ? await act(cohost, backend, () => importActions.undoGuestImport(form({ invitationId: A, batchId: batch }))) : null;
        const link = await act(cohost, backend, () => registrationActions.registrationLinkAction(form({ invitationId: A, action: 'open' })));
        const usherLink = await act(usher, backend, () => registrationActions.registrationLinkAction(form({ invitationId: A, action: 'rotate' })));
        const leftover = (await sql`select name from guests where invitation_id = ${A} and name like ${`Impor%${backend}`}`).map((r) => r.name);
        check(`${backend}: import, undo and the registration link: a co-host imports, undoes and opens the link; an usher is refused`,
          Boolean(batch) && undone?.kind === 'redirect' && undone.url.includes('undone=1') && leftover.length === 0
            && usherImport.kind === 'redirect' && usherImport.url === '/dashboard/invitations' && link.kind === 'redirect' && link.url.includes('registration=open')
            && usherLink.kind === 'redirect' && usherLink.url === '/dashboard/invitations',
          JSON.stringify({ imported: describe(imported), undone: undone && describe(undone), usherImport: describe(usherImport), link: describe(link), usherLink: describe(usherLink), leftover }));

        const w = await wish(A, `Ucapan ${backend}`);
        const moderation = {
          hide: await act(cohost, backend, () => wishActions.moderateWish(form({ invitationId: A, wishId: w, action: 'hide' }))),
          reply: await act(cohost, backend, () => wishActions.replyToWish(form({ invitationId: A, wishId: w, reply: 'Terima kasih' }))),
          usher: await act(usher, backend, () => wishActions.moderateWish(form({ invitationId: A, wishId: w, action: 'delete' }))),
          cross: await act(cohost, backend, () => wishActions.moderateWish(form({ invitationId: A, wishId: wishB, action: 'hide' }))),
        };
        const [wRow] = await sql`select is_hidden, host_reply from guest_messages where id = ${w}`;
        const [wbRow] = await sql`select is_hidden from guest_messages where id = ${wishB}`;
        check(`${backend}: wishes: a co-host hides and replies; an usher cannot delete; another invitation's wish is untouched`,
          wRow?.is_hidden === true && wRow.host_reply === 'Terima kasih' && moderation.usher.kind === 'redirect' && moderation.usher.url === '/dashboard/invitations' && wbRow.is_hidden === false,
          JSON.stringify(Object.fromEntries(Object.entries(moderation).map(([n, o]) => [n, describe(o)]))));

        const desk = await guest(A, `Meja ${backend}`);
        const scan = { key: `team-${backend}-${randomUUID()}`, scans: [{ token: pass(desk.passId) }] };
        const answers = {
          usher: await postCheckins(usher, backend, A, scan),
          outsider: await postCheckins(outsider, backend, A, { key: `out-${randomUUID()}`, scans: [{ token: pass(desk.passId) }] }),
          admin: await postCheckins(admin, backend, A, { key: `adm-${randomUUID()}`, scans: [{ token: pass(desk.passId) }] }),
          cross: await postCheckins(usher, backend, B, { key: `x-${randomUUID()}`, scans: [{ token: pass(elseGuest.passId) }] }),
        };
        const first = (answers.usher.raw as { results?: Record<string, unknown>[] } | null)?.results?.[0];
        const manualGuest = await guest(A, `Manual ${backend}`);
        const manual = await act(usher, backend, () => manualCheckIn(A, manualGuest.id));
        check(`${backend}: the desk: an usher checks a pass in (name and time only) and checks in by hand; an outsider and another invitation are 404, an admin 403`,
          answers.usher.status === 200 && first?.outcome === 'checked-in' && first?.name === `Meja ${backend}` && same(Object.keys(first ?? {}).sort(), ['checkedInAt', 'name', 'outcome'])
            && answers.outsider.status === 404 && answers.cross.status === 404 && answers.admin.status === 403
            && manual.kind === 'returned' && (manual.value as { ok?: boolean }).ok === true,
          JSON.stringify({ usher: answers.usher.raw, outsider: answers.outsider.status, cross: answers.cross.status, admin: answers.admin.status, manual: manual.kind === 'returned' ? manual.value : describe(manual) }));
      }
    }

    // ── 3. FLAG_TEAM_ACCESS off: owner-only again, grants kept ──
    {
      const grantsBefore = await liveGrants(A);
      env.FLAG_TEAM_ACCESS = 'off';
      try {
        const g = await guest(A, 'Saat Mati');
        const refused = {
          scopedAdd: await act(cohost, 'next', () => guestActions.addScopedGuest(form({ invitationId: A, name: 'Mati Scoped', phone: '', category: '', guestCount: '1' }))),
          globalAdd: await act(cohost, 'next', () => globalGuestActions.addGuest(form({ invitationId: A, name: 'Mati Global', phone: '', category: '', guestCount: '1' }))),
          globalSent: await act(cohost, 'rust', () => globalGuestActions.markGuestSent(form({ invitationId: A, guestId: g.id }))),
          rsvp: await act(cohost, 'rust', () => guestActions.updateGuestOperation(form({ invitationId: A, guestId: g.id, operation: 'CONFIRMED' }))),
          wish: await act(cohost, 'next', () => wishActions.moderateWish(form({ invitationId: A, wishId: wishA, action: 'hide' }))),
          manual: await act(usher, 'next', () => manualCheckIn(A, g.id)),
          guestsPage: await page(cohost, () => GuestsPage(params(A))),
          deskPage: await page(usher, () => CheckinPage(params(A))),
          teamPage: await page(owner, () => TeamPage(params(A))),
          joinPage: await page(outsider, () => JoinLinkPage({ params: Promise.resolve({ token: 'A'.repeat(43) }) })),
          accept: await act(outsider, 'next', () => joinActions.acceptJoin(form({ token: 'A'.repeat(43) }))),
        };
        const route = { next: await postCheckins(usher, 'next', A, { key: `off-${randomUUID()}`, scans: [{ token: pass(g.passId) }] }), rust: await postCheckins(usher, 'rust', A, { key: `off-${randomUUID()}`, scans: [{ token: pass(g.passId) }] }) };
        const csv = await exportCsv(cohost, A);
        const shared = await members.sharedInvitations(cohost.id);
        const [gRow] = await sql`select sent_at, rsvp_status, checked_in_at from guests where id = ${g.id}`;
        const names = (await sql`select name from guests where invitation_id = ${A} and name like 'Mati %'`).length;
        check('flag off: every member entry is refused (both lists, the RSVP override, wishes, the desk and its route in both writers, pages, the export, the join pages) and nothing is written',
          refused.scopedAdd.kind === 'redirect' && refused.globalAdd.kind === 'redirect' && refused.globalAdd.url.includes('error=') && refused.globalSent.kind === 'redirect'
            && refused.rsvp.kind === 'redirect' && refused.wish.kind === 'redirect' && refused.manual.kind === 'returned' && (refused.manual.value as { ok: boolean }).ok === false
            && refused.guestsPage.kind === 'notfound' && refused.deskPage.kind === 'notfound' && refused.teamPage.kind === 'notfound' && refused.joinPage.kind === 'notfound' && refused.accept.kind === 'notfound'
            && route.next.status === 404 && route.rust.status === 404 && csv.status === 404 && shared.length === 0
            && names === 0 && gRow.sent_at === null && gRow.rsvp_status === 'PENDING' && gRow.checked_in_at === null,
          JSON.stringify({ refused: Object.fromEntries(Object.entries(refused).map(([n, o]) => [n, describe(o)])), route: [route.next.status, route.rust.status], csv: csv.status, shared }));
        const ownerStill = {
          add: await act(owner, 'rust', () => guestActions.addScopedGuest(form({ invitationId: A, name: 'Pemilik Saat Mati', phone: '', category: '', guestCount: '1' }))),
          route: await postCheckins(owner, 'next', A, { key: `own-${randomUUID()}`, scans: [{ token: pass(g.passId) }] }),
          csv: await exportCsv(owner, A),
        };
        check('flag off: the owner keeps every surface (add, the desk, the export) and the stored grants are kept',
          ownerStill.add.kind === 'redirect' && ownerStill.add.url.includes('added=1') && ownerStill.route.status === 200 && ownerStill.csv.status === 200 && (await liveGrants(A)) === grantsBefore,
          JSON.stringify({ add: describe(ownerStill.add), route: ownerStill.route.status, csv: ownerStill.csv.status }));
      } finally {
        env.FLAG_TEAM_ACCESS = 'on';
      }
      const back = await page(cohost, () => GuestsPage(params(A)));
      check('flag back on: the kept grant works again without a new link', back.kind === 'returned');
    }

    // ── 4. A revoked member's replay, on the private API, the TypeScript writer and the route ──
    {
      const gSent = await guest(A, 'Replay Sent');
      const gDesk = await guest(A, 'Replay Desk');
      const gInvited = await guest(A, 'Replay Undangan');
      const gRsvp = await guest(A, 'Replay RSVP');
      const gPass = await guest(A, 'Replay Pass Rahasia');
      const gNext = await guest(A, 'Replay Pass Next');
      const wHide = await wish(A, 'Replay Moderasi');
      const wReply = await wish(A, 'Replay Balasan');
      const [reg] = await sql`insert into guest_registrations (invitation_id, name, phone, guest_count) values (${A}, 'Replay Daftar', '081211112222', 1) returning id`;
      const base = `/v1/invitations/${A}`;
      type Op = { name: string; who: Person; path: string; body: unknown; changed?: unknown; key: string };
      const k = (name: string) => `replay-${name}-${tag}`;
      const ops: Op[] = [
        { name: 'add', who: cohost, path: `${base}/guests`, body: { guest: { name: 'Replay Tambah' }, invitedEventIds: [], flags: ROSTER_FLAGS }, changed: { guest: { name: 'Replay Lain' }, invitedEventIds: [], flags: ROSTER_FLAGS }, key: k('add') },
        { name: 'sent', who: cohost, path: `${base}/guests/${gSent.id}/operation`, body: { operation: 'SENT' }, changed: { operation: 'UNDO_CHECKIN' }, key: k('sent') },
        { name: 'checkin', who: usher, path: `${base}/guests/${gDesk.id}/operation`, body: { operation: 'CHECKIN' }, changed: { operation: 'SENT' }, key: k('checkin') },
        { name: 'invited', who: cohost, path: `${base}/guests/${gInvited.id}/invited-events`, body: { ticked: ['akad'], flags: ROSTER_FLAGS }, changed: { ticked: [], flags: ROSTER_FLAGS }, key: k('invited') },
        { name: 'category', who: cohost, path: `${base}/category-invitations`, body: { eventId: 'akad', category: 'Keluarga', mode: 'ADD', flags: ROSTER_FLAGS }, changed: { eventId: 'akad', category: 'Kantor', mode: 'ADD', flags: ROSTER_FLAGS }, key: k('category') },
        { name: 'link', who: cohost, path: `${base}/registration-link`, body: { action: 'ROTATE' }, changed: { action: 'CLOSE' }, key: k('link') },
        { name: 'decision', who: cohost, path: `${base}/registrations/${reg.id}/decision`, body: { decision: 'REJECT', flags: ROSTER_FLAGS }, changed: { decision: 'APPROVE', flags: ROSTER_FLAGS }, key: k('decision') },
        { name: 'import', who: cohost, path: `${base}/guest-imports`, body: { rows: [{ name: 'Replay Impor' }], dryRun: false, flags: ROSTER_FLAGS }, changed: { rows: [{ name: 'Replay Impor Lain' }], dryRun: false, flags: ROSTER_FLAGS }, key: k('import') },
        { name: 'pass', who: usher, path: `${base}/guest-pass-checkins`, body: { scans: [{ token: pass(gPass.passId) }] }, changed: { scans: [{ token: pass(gDesk.passId) }] }, key: k('pass') },
        { name: 'rsvp', who: cohost, path: `${base}/guests/${gRsvp.id}/rsvp-override`, body: { status: 'CONFIRMED', flags: { perEvent: false, inviteOnlyEvents: true } }, changed: { status: 'DECLINED', flags: { perEvent: false, inviteOnlyEvents: true } }, key: k('rsvp') },
        { name: 'moderation', who: cohost, path: `${base}/wishes/${wHide}/moderation`, body: { action: 'HIDE' }, changed: { action: 'DELETE' }, key: k('moderation') },
        { name: 'reply', who: cohost, path: `${base}/wishes/${wReply}/reply`, body: { reply: 'Terima kasih banyak' }, changed: { reply: 'Lain' }, key: k('reply') },
      ];
      const firsts: Record<string, ApiAnswer> = {};
      for (const op of ops) firsts[op.name] = await api(op.who, op.path, op.body, op.key);
      const batchId = (JSON.parse(firsts.import.text || '{}') as { batchId?: string }).batchId ?? '';
      const undo: Op = { name: 'undo', who: cohost, path: `${base}/guest-imports/${batchId}/undo`, body: undefined, key: k('undo') };
      firsts.undo = await api(undo.who, undo.path, undo.body, undo.key);
      ops.push(undo);
      check('rust, granted: a co-host and an usher make every host write of their roles straight to the API under their own keys (13 writes, all 200)',
        Object.values(firsts).every((a) => a.status === 200) && firsts.pass.text.includes('Replay Pass Rahasia'),
        JSON.stringify(Object.fromEntries(Object.entries(firsts).map(([n, a]) => [n, `${a.status} ${a.code ?? ''}`]))));

      // The TypeScript writer and the route, while granted.
      const nextBatch = { key: `replay-next-${tag}`, scans: [{ token: pass(gNext.passId) }] };
      const nextFirst = await as(usher, 'next', () => roster.checkInWithPasses({ userId: usher.id, ownerToken: () => tokenFor(usher.clerk) }, { invitationId: A, ...nextBatch }));
      const routeBatch = { key: `replay-route-${tag}`, scans: [{ token: pass(gNext.passId) }] };
      const routeFirst = { next: await postCheckins(usher, 'next', A, routeBatch), rust: await postCheckins(usher, 'rust', A, { ...routeBatch, key: `${routeBatch.key}-r` }) };

      const retry = await api(cohost, ops[0].path, ops[0].body, ops[0].key);
      const ownerFirst = await api(owner, `${base}/guests`, { guest: { name: 'Replay Pemilik' }, invitedEventIds: [], flags: ROSTER_FLAGS }, k('owner'));
      const ownerReuse = await api(owner, `${base}/guests`, { guest: { name: 'Replay Pemilik Lain' }, invitedEventIds: [], flags: ROSTER_FLAGS }, k('owner'));
      check('granted: a retry replays its stored answer (Idempotent-Replayed) and a reused key with another request is 422, as before',
        retry.status === 200 && retry.replayed && retry.text === firsts.add.text && ownerFirst.status === 200 && ownerReuse.status === 422 && ownerReuse.code === 'idempotency.key_reused',
        JSON.stringify({ retry: [retry.status, retry.replayed], ownerReuse: [ownerReuse.status, ownerReuse.code] }));

      // Revoke both members, then replay everything.
      await members.revokeTeamRow(owner.id, A, cohostRow);
      await members.revokeTeamRow(owner.id, A, usherRow);
      const before = await snapshot(A);
      const replays: Record<string, ApiAnswer> = {};
      const changed: Record<string, ApiAnswer> = {};
      for (const op of ops) {
        replays[op.name] = await api(op.who, op.path, op.body, op.key);
        if (op.changed !== undefined) changed[op.name] = await api(op.who, op.path, op.changed, op.key);
      }
      const after = await snapshot(A);
      const leaked = Object.values(replays).filter((a) => a.text.includes('Replay')).length;
      check('rust, revoked: the identical request under the same key is refused for every write (404, not a replay) and no stored answer leaks',
        Object.values(replays).every((a) => a.status === 404 && !a.replayed) && leaked === 0,
        JSON.stringify(Object.fromEntries(Object.entries(replays).map(([n, a]) => [n, `${a.status} ${a.code ?? ''}${a.replayed ? ' replayed' : ''}`]))));
      check('rust, revoked: a changed request under the same key is 404 too (never 422, which would reveal the key)',
        Object.values(changed).every((a) => a.status === 404), JSON.stringify(Object.fromEntries(Object.entries(changed).map(([n, a]) => [n, `${a.status} ${a.code ?? ''}`]))));
      check('rust, revoked: the refused replays and requests wrote nothing', before === after, `${before} != ${after}`);

      const nextReplay = await as(usher, 'next', () => roster.checkInWithPasses({ userId: usher.id, ownerToken: () => tokenFor(usher.clerk) }, { invitationId: A, ...nextBatch }));
      const nextChanged = await as(usher, 'next', () => roster.checkInWithPasses({ userId: usher.id, ownerToken: () => tokenFor(usher.clerk) }, { invitationId: A, key: nextBatch.key, scans: [{ token: pass(gDesk.passId) }] }));
      const routeReplay = { next: await postCheckins(usher, 'next', A, routeBatch), rust: await postCheckins(usher, 'rust', A, { ...routeBatch, key: `${routeBatch.key}-r` }) };
      check('next writer and the route, revoked: the stored batch is not replayed (notfound / 404 in both writers) and names no guest',
        nextFirst.kind === 'checked' && nextReplay.kind === 'notfound' && nextChanged.kind === 'notfound'
          && routeFirst.next.status === 200 && routeFirst.rust.status === 200 && routeReplay.next.status === 404 && routeReplay.rust.status === 404
          && !routeReplay.next.text.includes('Replay') && !routeReplay.rust.text.includes('Replay'),
        JSON.stringify({ nextFirst: nextFirst.kind, nextReplay, nextChanged, route: [routeReplay.next.status, routeReplay.rust.status] }));

      const otherActor = await api(cohost2, ops[0].path, ops[0].body, ops[0].key);
      const [{ n: twice }] = await sql`select count(*)::int as n from guests where invitation_id = ${A} and name = 'Replay Tambah'`;
      check('another co-host sending the same key and request is judged afresh under their own scope: a new write, not a replay',
        otherActor.status === 200 && !otherActor.replayed && twice === 2, JSON.stringify({ status: otherActor.status, replayed: otherActor.replayed, twice }));

      // Restore the members for the next section with fresh links (a revoked grant stays revoked).
      await joinTeam(owner, A, cohost, 'cohost');
      await joinTeam(owner, A, usher, 'usher');
    }

    // ── 5. Concurrency under one key, and two desks ──
    {
      for (const backend of BACKENDS) {
        const g = await guest(A, `Kembar ${backend}`);
        const twin = { key: `twin-${backend}-${tag}`, scans: [{ token: pass(g.passId) }] };
        const [a1, a2] = await Promise.all([postCheckins(cohost, backend, A, twin), postCheckins(cohost, backend, A, twin)]);
        const [{ n: events }] = await sql`select count(*)::int as n from analytics_events where guest_id = ${g.id} and event_type = 'CHECKIN'`;
        check(`${backend}: a co-host's batch sent twice at once under one key is answered once: the same answer twice, one arrival, one CHECKIN row`,
          a1.status === 200 && a2.status === 200 && a1.text === a2.text && events === 1, JSON.stringify({ a1: a1.raw, a2: a2.raw, events }));
      }
      const g = await guest(A, 'Dua Meja');
      const [d1, d2] = await Promise.all([
        postCheckins(usher, 'next', A, { key: `desk1-${tag}`, scans: [{ token: pass(g.passId) }] }),
        postCheckins(owner, 'rust', A, { key: `desk2-${tag}`, scans: [{ token: pass(g.passId) }] }),
      ]);
      const outcomes = [d1, d2].map((d) => (d.raw as { results?: { outcome: string; checkedInAt?: string }[] }).results?.[0]);
      const [{ n: events }] = await sql`select count(*)::int as n from analytics_events where guest_id = ${g.id} and event_type = 'CHECKIN'`;
      check('an usher (TypeScript writer) and the owner (Rust writer) scanning one guest at once: one "checked-in", one "already" with the same first time, one CHECKIN row',
        same(outcomes.map((o) => o?.outcome).sort(), ['already', 'checked-in']) && outcomes[0]?.checkedInAt === outcomes[1]?.checkedInAt && events === 1,
        JSON.stringify({ outcomes, events }));

      // Leaving: the member's own grant only, and it ends their access at once.
      const left = await act(usher, 'next', () => leaveTeamAction(form({ invitationId: A })));
      const leftAgain = await act(usher, 'next', () => leaveTeamAction(form({ invitationId: A })));
      const afterLeave = await page(usher, () => CheckinPage(params(A)));
      const shared = await members.sharedInvitations(usher.id);
      check('an usher leaves: their grant ends, a second leave changes nothing, the desk is 404 and the dashboard no longer lists it',
        left.kind === 'redirect' && left.url === '/dashboard?keluar=1' && leftAgain.kind === 'redirect' && leftAgain.url === '/dashboard' && afterLeave.kind === 'notfound'
          && !shared.some((s) => s.invitationId === A) && (await members.invitationAccess(cohost.id, A))?.role === 'cohost',
        JSON.stringify({ left: describe(left), leftAgain: describe(leftAgain), afterLeave: describe(afterLeave), shared }));
    }
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    for (const id of created.invitations) {
      await sql`delete from api_idempotency_keys where scope like ${`%:${id}:%`}`;
      await sql`delete from analytics_events where invitation_id = ${id}`;
      await sql`delete from guest_messages where invitation_id = ${id}`;
      await sql`delete from guest_registrations where invitation_id = ${id}`;
      await sql`delete from guest_registration_links where invitation_id = ${id}`;
      await sql`delete from guests where invitation_id = ${id}`;
      await sql`delete from invitation_members where invitation_id = ${id}`;
      await sql`delete from invitations where id = ${id}`;
    }
    if (created.users.length) {
      await sql`delete from invitation_members where user_id in ${sql(created.users)}`;
      await sql`delete from users where id in ${sql(created.users)}`;
    }
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    await sql.end();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
