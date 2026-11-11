/**
 * G-052 end to end (D-067): reseller workspaces against a scratch database, through the Next.js writer and, with
 * `API_BASE_URL`, the Rust writer too. Only Next.js's request primitives and Clerk's session are stubbed; the pages, the
 * server actions, the route handlers, the access guard, the facades, both writers and the credit ledger are product code.
 *
 *   POSTGRES_URL=… npx tsx scripts/verify-workspaces.ts                                  (the database job: Next.js)
 *   POSTGRES_URL=… API_BASE_URL=… INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=… OWNER_TOKEN_ISSUER=… \
 *     OWNER_TOKEN_AUTHORIZED_PARTIES=… REQUIRE_RUST=1 npx tsx scripts/verify-workspaces.ts  (the rust job: both writers)
 *
 * Fixture rows are fictional, tagged per run and removed. Credit balances are synthetic: no price, pack or sale exists.
 *
 * It proves, with the answer and the stored rows each time:
 *  1. the workspace: FLAG_WORKSPACES off (the default) answers 404 at every workspace entry; on, one workspace per
 *     account (twice, and three times at once), names normalised, administrators and signed-out visitors refused;
 *  2. staff links: only the owner mints and revokes (role, label, 7 days, the 50-row ceiling under concurrency); the
 *     secret is shown once and only its hash is stored; the link pages and the `/gabung/ruang` cookie; acceptance by the
 *     right account only (owner, administrator, member, used, expired, revoked, repeated, two accounts racing one link,
 *     one account racing two links); revoking or leaving another workspace's rows changes nothing;
 *  3. client invitations: the owner assigns and takes back only their own live invitations; staff, other owners and a
 *     deleted invitation are refused; a forged `workspace_id` on another owner's invitation is not a client invitation;
 *  4. the role matrix with FLAG_TEAM_ACCESS off: a manager works as a co-host and a desk as an usher on client
 *     invitations at the pages, the actions, the export and through each writer; nothing on the owner's personal
 *     invitations, another workspace's, a forged one or the editor; an administrator holding a grant gets nothing;
 *     another invitation's guest or wish named under a client invitation's id changes nothing in either writer (s42);
 *     the workspace page in English with the dashboard's locale (s42);
 *  5. revocation, a disabled workspace, a taken-back or deleted invitation: refused at the next request in each writer
 *     with nothing written, while the owner keeps every surface;
 *  6. FLAG_WORKSPACES off with FLAG_TEAM_ACCESS on: staff hold nothing and a narrower team grant stays narrow in each
 *     writer; every workspace row is kept and switching the flag on again restores access;
 *  7. the credit ledger: one operation key per entry (replay, conflict), refusal on an insufficient balance with nothing
 *     written, concurrent debits that cannot overdraw or double-debit, a grant racing debits (s42), a failed operation taking its debit back, a
 *     replayed debit not running its operation twice, a disabled workspace and malformed requests refused, the
 *     database's own constraints, and the balance equal to the sum of the ledger throughout.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';

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
if (!env.POSTGRES_URL?.trim()) throw new Error('POSTGRES_URL must be set (see the header of this script)');
const RUST_VARS = ['API_BASE_URL', 'INTERNAL_API_SECRET', 'OWNER_TOKEN_JWKS_PORT', 'OWNER_TOKEN_ISSUER', 'OWNER_TOKEN_AUTHORIZED_PARTIES'] as const;
const rust = RUST_VARS.every((name) => Boolean(env[name]?.trim()));
if (env.REQUIRE_RUST === '1' && !rust) throw new Error(`REQUIRE_RUST=1 needs ${RUST_VARS.join(', ')}`);

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` (${detail})`}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Backend = 'next' | 'rust';
const BACKENDS: readonly Backend[] = rust ? ['next', 'rust'] : ['next'];
type Person = { id: number; clerk: string; name: string };
type Outcome = { kind: 'returned'; value: unknown } | { kind: 'redirect'; url: string } | { kind: 'notfound' };
const APP = 'http://app.test';
const PAGE = '/dashboard/workspace';
const OPTED_IN = { checkInSettings: { enabled: true } };
const BAD_TOKEN = 'A'.repeat(43);

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
const k = (o: Outcome) => (o.kind === 'redirect' ? o.url : o.kind);
const describeAll = (record: Record<string, Outcome>) => JSON.stringify(Object.fromEntries(Object.entries(record).map(([name, o]) => [name, describe(o)])));

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

async function rejection(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'resolved';
  } catch (error) {
    return error instanceof Error ? error.name : 'thrown';
  }
}

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const { eq } = await import('drizzle-orm');
  const { invitations: invitationsTable } = await import('../lib/db/schema');
  const access = await import('../lib/invitation/members-db');
  const workspaceDb = await import('../lib/workspace/workspace-db');
  const credits = await import('../lib/workspace/credits');
  const { joinTokenHash } = await import('../lib/invitation/join-token');
  const workspaceActions = await import('../app/(customer)/dashboard/workspace/actions');
  const { default: WorkspacePage } = await import('../app/(customer)/dashboard/workspace/page');
  const staffJoin = await import('../app/gabung/ruang/actions');
  const { default: StaffLinkPage } = await import('../app/gabung/ruang/[token]/page');
  const { default: StaffJoinConfirmPage } = await import('../app/gabung/ruang/terima/page');
  const guestActions = await import('../app/(customer)/dashboard/invitations/[id]/guests/actions');
  const globalGuestActions = await import('../app/(customer)/dashboard/guests/actions');
  const wishActions = await import('../app/(customer)/dashboard/invitations/[id]/wishes/actions');
  const { manualCheckIn } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/actions');
  const { GET: exportRoute } = await import('../app/(customer)/dashboard/invitations/[id]/analytics/route');
  const { default: GuestsPage } = await import('../app/(customer)/dashboard/invitations/[id]/guests/page');
  const { default: CheckinPage } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/page');
  const { default: InsightsPage } = await import('../app/(customer)/dashboard/invitations/[id]/insights/page');
  const { default: WishesPage } = await import('../app/(customer)/dashboard/invitations/[id]/wishes/page');
  const { default: ManagePage } = await import('../app/(customer)/dashboard/invitations/[id]/manage/page');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const saved = Object.fromEntries(
    ['FLAG_WORKSPACES', 'FLAG_TEAM_ACCESS', 'FLAG_GUEST_PASS', 'NEXT_PUBLIC_APP_URL', 'BACKEND_ROSTER', 'BACKEND_RSVP', 'BACKEND_WISHES'].map((name) => [name, env[name]]),
  );
  env.FLAG_TEAM_ACCESS = 'off';
  env.FLAG_GUEST_PASS = 'on';
  env.NEXT_PUBLIC_APP_URL = APP;
  delete env.FLAG_WORKSPACES;

  async function person(name: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER'): Promise<Person> {
    const clerk = `user_ws_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role, name) values (${`ws-${name}-${tag}@example.invalid`}, ${clerk}, ${role}, ${`Ruang ${name}`}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk, name };
  }
  async function invitation(owner: Person, name: string): Promise<number> {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner.id}, ${`ws-${name}-${tag}`}, 'wedding', 'PUBLISHED', ${JSON.stringify(OPTED_IN)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return row.id as number;
  }
  async function guest(invitationId: number, name: string, phone: string | null = null): Promise<number> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, phone, slug) values (${invitationId}, ${name}, ${phone}, ${slug}) returning id`;
    return row.id as number;
  }
  async function wish(invitationId: number, name: string): Promise<number> {
    const [row] = await sql`insert into guest_messages (invitation_id, name, message) values (${invitationId}, ${name}, 'Selamat menempuh hidup baru') returning id`;
    return row.id as number;
  }
  async function workspaceOf(owner: Person): Promise<number> {
    const [row] = await sql`select id from workspaces where owner_user_id = ${owner.id}`;
    return row?.id as number;
  }
  async function liveStaffRows(workspaceId: number): Promise<number> {
    const [row] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${workspaceId} and revoked_at is null and (user_id is not null or expires_at > now())`;
    return row.n as number;
  }
  async function guestNames(invitationIds: number[]): Promise<string[]> {
    return (await sql`select name from guests where invitation_id in ${sql(invitationIds)}`).map((r) => r.name as string);
  }
  /** Every workspace row this run made, to show that the flag and refusals keep them as they were. */
  async function workspaceState(): Promise<string> {
    const [row] = await sql`select json_build_object(
      'workspaces', (select coalesce(json_agg(json_build_array(w.id, w.name, w.credit_balance, w.disabled_at is not null) order by w.id), '[]') from workspaces w where w.owner_user_id in ${sql(created.users)}),
      'members', (select coalesce(json_agg(json_build_array(m.id, m.role, m.user_id, m.revoked_at is not null) order by m.id), '[]') from workspace_members m where m.workspace_id in (select id from workspaces where owner_user_id in ${sql(created.users)})),
      'clients', (select coalesce(json_agg(json_build_array(i.id, i.workspace_id, i.client_label) order by i.id), '[]') from invitations i where i.id in ${sql(created.invitations)}),
      'credits', (select count(*) from workspace_credit_entries e where e.workspace_id in (select id from workspaces where owner_user_id in ${sql(created.users)}))
    )::text as state`;
    return row.state as string;
  }

  // Owner tokens for the Rust writer: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts
  // share for this API instance (named by a hash of its secret), as scripts/verify-team-access-api.ts does.
  let jwksServer: http.Server | null = null;
  let tokenFor: (sub: string) => Promise<string | null> = async () => null;
  if (rust) {
    const jose = await import('jose');
    const SECRET = env.INTERNAL_API_SECRET as string;
    const ISSUER = env.OWNER_TOKEN_ISSUER as string;
    const AZP = (env.OWNER_TOKEN_AUTHORIZED_PARTIES as string).split(',')[0].trim();
    const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
    const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
    const kid = stored?.kid ?? `workspace-api-${tag}`;
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
    const server = http.createServer((req, res) => {
      if (req.url === '/.well-known/jwks.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(jwks);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(Number(env.OWNER_TOKEN_JWKS_PORT), '127.0.0.1', resolve));
    jwksServer = server;
    tokenFor = (sub: string) =>
      new jose.SignJWT({ azp: AZP, sid: `sess_${tag}` })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(ISSUER)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
        .sign(privateKey);
  } else {
    console.log('SKIP  the Rust writer: API_BASE_URL is unset, so this run covers the Next.js writer (the rust job runs both with REQUIRE_RUST=1)');
  }

  /** One call as `who` under one writer for every host domain (`BACKEND_*` is read per call). */
  async function as<T>(who: Person | null, backend: Backend, run: () => Promise<T>): Promise<T> {
    session.clerkUserId = who?.clerk ?? null;
    session.token = who ? await tokenFor(who.clerk) : null;
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
  const workspacePage = (who: Person | null, query: Record<string, string> = {}) => page(who, () => WorkspacePage({ searchParams: Promise.resolve(query) }));
  async function exportCsv(who: Person, invitationId: number): Promise<{ status: number; type: string | null; text: string }> {
    return as(who, 'next', async () => {
      const response = await exportRoute(new Request(`${APP}/dashboard/invitations/${invitationId}/analytics`), { params: Promise.resolve({ id: String(invitationId) }) });
      return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
    });
  }
  const addGuestAs = (who: Person, backend: Backend, invitationId: number, name: string) =>
    act(who, backend, () => guestActions.addScopedGuest(form({ invitationId, name, phone: '', category: '', guestCount: '1' })));
  const checkInAs = async (who: Person, backend: Backend, invitationId: number, guestId: number) => {
    const o = await act(who, backend, () => manualCheckIn(invitationId, guestId));
    return o.kind === 'returned' && (o.value as { ok?: boolean }).ok === true;
  };
  /** A staff link minted and accepted through the product's own functions; the row's id. */
  async function joinStaff(owner: Person, who: Person, role: 'manager' | 'desk'): Promise<number> {
    const link = await workspaceDb.createStaffLink(owner.id, { role, label: `Untuk ${who.name}` });
    if (link.kind !== 'created') throw new Error(`no staff link for ${who.name}: ${link.kind}`);
    const accepted = await workspaceDb.acceptStaffLink(who.id, link.token);
    if (accepted.kind !== 'joined') throw new Error(`${who.name} did not join: ${accepted.kind}`);
    const [row] = await sql`select id from workspace_members where token_hash = ${joinTokenHash(link.token)}`;
    return row.id as number;
  }

  try {
    const owner = await person('owner');
    const manager = await person('manager');
    const desk = await person('desk');
    const outsider = await person('outsider');
    const admin = await person('admin', 'ADMIN');
    const rival = await person('rival');
    const rivalStaff = await person('rivalstaff');
    const racers = [await person('racer1'), await person('racer2')];
    const joiner = await person('joiner');
    const dual = await person('dual');

    // ── 1. The workspace ──
    {
      const off = {
        page: await workspacePage(owner),
        create: await act(owner, 'next', () => workspaceActions.createWorkspaceAction(form({ name: 'Studio Mati' }))),
        link: await page(null, () => StaffLinkPage({ params: Promise.resolve({ token: BAD_TOKEN }) })),
        terima: await page(owner, () => StaffJoinConfirmPage({ searchParams: Promise.resolve({}) })),
        begin: await act(null, 'next', () => staffJoin.beginStaffJoin(form({ token: BAD_TOKEN }))),
        accept: await act(owner, 'next', () => staffJoin.acceptStaffJoin(form({ token: BAD_TOKEN }))),
      };
      check('FLAG_WORKSPACES unset (default off): the workspace page and action, the staff link page, terima and both join actions answer 404; no workspace is stored',
        Object.values(off).every((o) => o.kind === 'notfound') && (await workspaceOf(owner)) === undefined, describeAll(off));

      env.FLAG_WORKSPACES = 'on';
      const refused = {
        signedOut: await workspacePage(null),
        adminPage: await workspacePage(admin),
        adminCreate: await act(admin, 'next', () => workspaceActions.createWorkspaceAction(form({ name: 'Studio Admin' }))),
        controlName: await act(owner, 'next', () => workspaceActions.createWorkspaceAction(form({ name: ' \u0001 ' }))),
        longName: await act(owner, 'next', () => workspaceActions.createWorkspaceAction(form({ name: 'a'.repeat(81) }))),
      };
      check('on: signed out goes to sign-in; an administrator gets 404 at the page and the action; a blank or 81-character name is refused; nothing stored',
        k(refused.signedOut) === '/sign-in' && refused.adminPage.kind === 'notfound' && refused.adminCreate.kind === 'notfound'
          && k(refused.controlName) === `${PAGE}?error=name` && k(refused.longName) === `${PAGE}?error=name` && (await workspaceOf(owner)) === undefined
          && (await workspaceOf(admin)) === undefined,
        describeAll(refused));

      const made = await act(owner, 'next', () => workspaceActions.createWorkspaceAction(form({ name: '  Studio   Melati \u0007 ' })));
      const again = await act(owner, 'next', () => workspaceActions.createWorkspaceAction(form({ name: 'Studio Kedua' })));
      const rows = await sql`select name, credit_balance, disabled_at from workspaces where owner_user_id = ${owner.id}`;
      check('the owner creates one workspace (name normalised, balance 0); a second create answers "exists" and changes nothing',
        k(made) === `${PAGE}?created=1` && k(again) === `${PAGE}?error=exists` && rows.length === 1 && rows[0].name === 'Studio Melati'
          && rows[0].credit_balance === 0 && rows[0].disabled_at === null,
        JSON.stringify({ made: describe(made), again: describe(again), rows }));

      const racing = await Promise.all(['Rival Satu', 'Rival Dua', 'Rival Tiga'].map((name) => workspaceDb.createWorkspace(rival.id, name)));
      const [{ n: rivalRows }] = await sql`select count(*)::int as n from workspaces where owner_user_id = ${rival.id}`;
      check('three creates at once for one account: exactly one workspace, the others answered "exists"',
        racing.filter((r) => r.kind === 'created').length === 1 && racing.filter((r) => r.kind === 'exists').length === 2 && rivalRows === 1, JSON.stringify(racing.map((r) => r.kind)));
    }
    const W = await workspaceOf(owner);
    const RW = await workspaceOf(rival);

    // ── 2. Staff links ──
    let managerRow = 0;
    {
      const createdLink = await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'manager', label: '  Rina   (koordinator) ' })));
      const state = createdLink.kind === 'returned' ? (createdLink.value as { status: string; url?: string; label?: string; whatsapp?: string; role?: string }) : null;
      const token = state?.url?.split('/gabung/ruang/')[1] ?? '';
      const [row] = token ? await sql`select m.*, row_to_json(m)::text as json from workspace_members m where token_hash = ${joinTokenHash(token)}` : [];
      const days = row ? (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000 : 0;
      check('the owner mints a manager link: shown once with a 43-character secret under /gabung/ruang/, label normalised, expiring in 7 days, with a WhatsApp share',
        state?.status === 'created' && /^[A-Za-z0-9_-]{43}$/.test(token) && state.url === `${APP}/gabung/ruang/${token}` && row?.label === 'Rina (koordinator)'
          && row?.role === 'manager' && row?.workspace_id === W && row?.user_id === null && days > 6.99 && days <= 7 && (state.whatsapp ?? '').startsWith('https://wa.me/?text='),
        JSON.stringify({ state, label: row?.label, days }));
      check('only the SHA-256 of the secret is stored: no column of the row holds the secret',
        Boolean(row) && row.token_hash === createHash('sha256').update(token).digest('hex') && !String(row.json).includes(token));

      const before = await sql`select count(*)::int as n from workspace_members`;
      const refused = {
        ownerRole: await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'owner', label: 'X' }))),
        cohostRole: await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'cohost', label: 'X' }))),
        emptyLabel: await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'desk', label: ' \u0001 ' }))),
        longLabel: await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'desk', label: 'a'.repeat(61) }))),
        noWorkspace: await act(outsider, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'manager', label: 'Saya' }))),
        admin: await act(admin, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'manager', label: 'Saya' }))),
      };
      const after = await sql`select count(*)::int as n from workspace_members`;
      const errored = (o: Outcome) => o.kind === 'returned' && (o.value as { status?: string }).status === 'error';
      check('a role outside manager and desk, a blank or 61-character label and an account without a workspace are refused; an administrator gets 404; no row',
        errored(refused.ownerRole) && errored(refused.cohostRole) && errored(refused.emptyLabel) && errored(refused.longLabel) && errored(refused.noWorkspace)
          && refused.admin.kind === 'notfound' && before[0].n === after[0].n,
        describeAll(refused));

      // Signed out: the page offers sign-in; the secret goes into the /gabung/ruang cookie and the sign-in URL names terima only.
      const signedOutPage = await page(null, () => StaffLinkPage({ params: Promise.resolve({ token }) }));
      const begin = await act(null, 'next', () => staffJoin.beginStaffJoin(form({ token })));
      const set = cookieSets.at(-1);
      check('signed out, the link page shows the workspace and role, and "Masuk untuk bergabung" keeps the secret in an HttpOnly, SameSite=Lax, Secure cookie scoped to /gabung/ruang for an hour',
        signedOutPage.kind === 'returned' && same(propsOf(signedOutPage.value, 'StaffRoleSummary'), { role: 'manager', workspaceName: 'Studio Melati' })
          && begin.kind === 'redirect' && begin.url === '/sign-in?redirect_url=%2Fgabung%2Fruang%2Fterima' && !begin.url.includes(token)
          && set?.name === 'inv_ws_join' && set.value === token && same(set.options, { httpOnly: true, sameSite: 'lax', secure: true, path: '/gabung/ruang', maxAge: 3600 }),
        JSON.stringify({ page: describe(signedOutPage), begin: describe(begin), set }));
      const confirm = await page(manager, () => StaffJoinConfirmPage({ searchParams: Promise.resolve({}) }));
      const accepted = await act(manager, 'next', () => staffJoin.acceptStaffJoin(form({})));
      const cleared = cookieSets.at(-1);
      const [managerLink] = await sql`select id, user_id, accepted_at from workspace_members where token_hash = ${joinTokenHash(token)}`;
      managerRow = managerLink?.id as number;
      check('after sign-in, terima shows the role again and the manager accepts from the cookie (a POST): the grant is theirs, the cookie is cleared, the workspace page welcomes them',
        confirm.kind === 'returned' && treeJson(confirm.value).includes('Terima peran ini?') && accepted.kind === 'redirect' && accepted.url === `${PAGE}?joined=${W}`
          && managerLink?.user_id === manager.id && managerLink.accepted_at !== null && cleared?.name === 'inv_ws_join' && cleared.options.maxAge === 0 && !jar.has('inv_ws_join'),
        JSON.stringify({ confirm: describe(confirm), accepted: describe(accepted), cleared }));

      const againTap = await act(manager, 'next', () => staffJoin.acceptStaffJoin(form({ token })));
      const stranger = await act(outsider, 'next', () => staffJoin.acceptStaffJoin(form({ token })));
      const ownLink = await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Untuk diri sendiri' });
      const ownToken = ownLink.kind === 'created' ? ownLink.token : '';
      const ownerTry = await act(owner, 'next', () => staffJoin.acceptStaffJoin(form({ token: ownToken })));
      jar.set('inv_ws_join', ownToken);
      const adminTry = await act(admin, 'next', () => staffJoin.acceptStaffJoin(form({})));
      const adminCleared = !jar.has('inv_ws_join');
      const second = await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Peran kedua' });
      const memberTry = second.kind === 'created' ? await act(manager, 'next', () => staffJoin.acceptStaffJoin(form({ token: second.token }))) : null;
      const [{ n: managerGrants }] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${W} and user_id = ${manager.id} and revoked_at is null`;
      check('a second tap by the same account lands as joined; another account is told the link is invalid; the owner and an administrator cannot join; a member cannot take a second role',
        k(againTap) === `${PAGE}?joined=${W}` && k(stranger) === '/gabung/ruang/terima?status=invalid' && k(ownerTry) === '/gabung/ruang/terima?status=owner'
          && k(adminTry) === '/gabung/ruang/terima?status=admin' && adminCleared && memberTry !== null && k(memberTry) === '/gabung/ruang/terima?status=member' && managerGrants === 1,
        JSON.stringify({ again: describe(againTap), stranger: describe(stranger), owner: describe(ownerTry), admin: describe(adminTry), member: memberTry && describe(memberTry) }));

      const expiring = await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Kedaluwarsa' });
      const revoking = await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Dicabut' });
      if (expiring.kind !== 'created' || revoking.kind !== 'created') throw new Error('links for the expiry checks');
      await sql`update workspace_members set expires_at = now() - interval '1 second' where token_hash = ${joinTokenHash(expiring.token)}`;
      const [revRow] = await sql`select id from workspace_members where token_hash = ${joinTokenHash(revoking.token)}`;
      const revokedNow = await act(owner, 'next', () => workspaceActions.revokeStaffAction(form({ rowId: revRow.id })));
      const previews = [
        await workspaceDb.staffJoinPreview(token, outsider.id),
        await workspaceDb.staffJoinPreview(expiring.token, outsider.id),
        await workspaceDb.staffJoinPreview(revoking.token, outsider.id),
        await workspaceDb.staffJoinPreview(BAD_TOKEN, outsider.id),
        await workspaceDb.staffJoinPreview('not-a-token', null),
      ];
      const accepts = [await workspaceDb.acceptStaffLink(outsider.id, expiring.token), await workspaceDb.acceptStaffLink(outsider.id, revoking.token)];
      const invalidPage = await page(outsider, () => StaffLinkPage({ params: Promise.resolve({ token: expiring.token }) }));
      check('a used, expired, revoked, unknown or malformed link previews and accepts as the same "invalid", and its page renders the same refusal',
        k(revokedNow) === `${PAGE}?revoked=1` && previews.every((p) => p.state === 'invalid') && accepts.every((a) => a.kind === 'invalid')
          && invalidPage.kind === 'returned' && treeJson(invalidPage.value).includes('Tautan ini tidak berlaku') && !treeJson(invalidPage.value).includes('Studio Melati'),
        JSON.stringify({ previews, accepts, revokedNow: describe(revokedNow) }));

      const raced = await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Satu tautan' });
      if (raced.kind !== 'created') throw new Error('race link');
      const results = await Promise.all(racers.map((r) => workspaceDb.acceptStaffLink(r.id, raced.token)));
      const [racedRow] = await sql`select user_id from workspace_members where token_hash = ${joinTokenHash(raced.token)}`;
      check('two accounts racing for one link: exactly one joins, the other is told it is invalid, and the row names the winner',
        same(results.map((r) => r.kind).sort(), ['invalid', 'joined']) && racers[results.findIndex((r) => r.kind === 'joined')]?.id === racedRow.user_id, JSON.stringify(results));
      const two = [await workspaceDb.createStaffLink(owner.id, { role: 'manager', label: 'Dua A' }), await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Dua B' })];
      if (two.some((l) => l.kind !== 'created')) throw new Error('two links');
      const both = await Promise.all(two.map((l) => workspaceDb.acceptStaffLink(joiner.id, (l as { token: string }).token)));
      const [{ n: joinerGrants }] = await sql`select count(*)::int as n from workspace_members where workspace_id = ${W} and user_id = ${joiner.id} and revoked_at is null`;
      check('one account racing two links of one workspace: one grant, the other answered "member"; the partial unique index holds one live grant',
        same(both.map((r) => r.kind).sort(), ['joined', 'member']) && joinerGrants === 1, JSON.stringify(both));

      const live = await liveStaffRows(W);
      for (let i = live; i < 48; i++) await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: `Meja ${i + 1}` });
      const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => workspaceDb.createStaffLink(owner.id, { role: 'desk', label: `Serbu ${i}` })));
      const full = await act(owner, 'next', () => workspaceActions.createStaffLinkAction({ status: 'idle' }, form({ role: 'desk', label: 'Satu lagi' })));
      check('five links made at once with 48 live rows: exactly two are made and three refused as full; the action then says the workspace is full; 50 live rows',
        burst.filter((b) => b.kind === 'created').length === 2 && burst.filter((b) => b.kind === 'full').length === 3 && (await liveStaffRows(W)) === 50
          && full.kind === 'returned' && (full.value as { status?: string; message?: string }).status === 'error' && String((full.value as { message?: string }).message).includes('50'),
        JSON.stringify({ burst: burst.map((b) => b.kind), full: full.kind === 'returned' ? full.value : describe(full) }));
      await sql`update workspace_members set revoked_at = now() where workspace_id = ${W} and user_id is null and revoked_at is null`;
      const released: number[] = [...racers.map((r) => r.id), joiner.id];
      await sql`update workspace_members set revoked_at = now() where workspace_id = ${W} and user_id in ${sql(released)} and revoked_at is null`;

      const tamper = {
        rivalRevoke: await workspaceDb.revokeStaffRow(rival.id, managerRow),
        rivalRevokeAction: k(await act(rival, 'next', () => workspaceActions.revokeStaffAction(form({ rowId: managerRow })))),
        outsiderLeave: await workspaceDb.leaveWorkspace(outsider.id, W),
        outsiderLeaveAction: k(await act(outsider, 'next', () => workspaceActions.leaveWorkspaceAction(form({ workspaceId: W })))),
        malformedRow: await workspaceDb.revokeStaffRow(owner.id, -1),
      };
      const [stillLive] = await sql`select revoked_at from workspace_members where id = ${managerRow}`;
      check("another workspace's owner revoking this workspace's grant, an outsider leaving it and a malformed row id change nothing",
        tamper.rivalRevoke === false && tamper.rivalRevokeAction === `${PAGE}?error=notfound` && tamper.outsiderLeave === false
          && tamper.outsiderLeaveAction === `${PAGE}?error=notfound` && tamper.malformedRow === false && stillLive.revoked_at === null,
        JSON.stringify(tamper));
    }

    // ── 3. Client invitations ──
    const CLIENT = await invitation(owner, 'client');
    const CLIENT2 = await invitation(owner, 'client2');
    const PERSONAL = await invitation(owner, 'personal');
    const FOREIGN = await invitation(rival, 'foreign');
    const RIVAL_CLIENT = await invitation(rival, 'rivalclient');
    const DELETED = await invitation(owner, 'deleted');
    {
      await sql`update invitations set deleted_at = now(), purge_after = now() + interval '30 days' where id = ${DELETED}`;
      const assigned = await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: CLIENT, clientLabel: '  Budi   & Sari ' })));
      const second = await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: CLIENT2, clientLabel: 'Dimas & Ayu' })));
      const refused = {
        shortLabel: k(await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: PERSONAL, clientLabel: 'x' })))),
        notTheirs: k(await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: FOREIGN, clientLabel: 'Bukan Milik' })))),
        deleted: k(await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: DELETED, clientLabel: 'Sudah Dihapus' })))),
        staff: k(await act(manager, 'next', () => workspaceActions.assignClientAction(form({ invitationId: PERSONAL, clientLabel: 'Staf Mencoba' })))),
        rivalSteal: k(await act(rival, 'next', () => workspaceActions.assignClientAction(form({ invitationId: CLIENT, clientLabel: 'Curian' })))),
        rivalUnassign: k(await act(rival, 'next', () => workspaceActions.unassignClientAction(form({ invitationId: CLIENT })))),
        malformed: k(await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: 'abc', clientLabel: 'Tanpa Nomor' })))),
      };
      const rows = await sql`select id, workspace_id, client_label from invitations where id in ${sql([CLIENT, CLIENT2, PERSONAL, FOREIGN, DELETED])} order by id`;
      const byId = new Map(rows.map((r) => [r.id as number, r]));
      check('the owner makes two of their live invitations client invitations (client name normalised); a short name, another owner\'s, a deleted one, staff, another workspace\'s owner and a malformed id are refused and change nothing',
        k(assigned) === `${PAGE}?assigned=1` && k(second) === `${PAGE}?assigned=1` && byId.get(CLIENT)?.workspace_id === W && byId.get(CLIENT)?.client_label === 'Budi & Sari'
          && byId.get(CLIENT2)?.workspace_id === W && refused.shortLabel === `${PAGE}?error=client` && refused.notTheirs === `${PAGE}?error=notfound`
          && refused.deleted === `${PAGE}?error=notfound` && refused.staff === `${PAGE}?error=notfound` && refused.rivalSteal === `${PAGE}?error=notfound`
          && refused.rivalUnassign === `${PAGE}?error=notfound` && refused.malformed === `${PAGE}?error=notfound`
          && byId.get(PERSONAL)?.workspace_id === null && byId.get(FOREIGN)?.workspace_id === null && byId.get(DELETED)?.workspace_id === null,
        JSON.stringify({ assigned: describe(assigned), refused, rows }));

      if (!(await workspaceDb.assignClientInvitation(rival.id, RIVAL_CLIENT, 'Klien Rival'))) throw new Error('rival client');
      await sql`update invitations set workspace_id = ${W}, client_label = 'Palsu' where id = ${FOREIGN}`;
      const listed = (await workspaceDb.clientInvitations(W)).map((c) => c.invitationId).sort((a, b) => a - b);
      const assignable = (await workspaceDb.assignableInvitations(owner.id)).map((c) => c.invitationId);
      check("a forged workspace_id on another owner's invitation is not a client invitation: the workspace lists only its owner's two; the owner's assignable list holds the personal one only",
        same(listed, [CLIENT, CLIENT2].sort((a, b) => a - b)) && same(assignable, [PERSONAL]), JSON.stringify({ listed, assignable }));
    }

    // ── 4. The role matrix, FLAG_TEAM_ACCESS off ──
    const deskRow = await joinStaff(owner, desk, 'desk');
    await joinStaff(rival, rivalStaff, 'manager');
    await sql`insert into workspace_members (workspace_id, role, label, token_hash, expires_at, user_id, accepted_at)
      values (${W}, 'manager', 'Dulu pelanggan', ${createHash('sha256').update(`ws-admin-${tag}`).digest('hex')}, now() + interval '7 days', ${admin.id}, now())`;
    const budi = await guest(CLIENT, 'Budi Hartono', '081234567890');
    await guest(CLIENT, 'Citra Dewi', '081298765432');
    const personalGuest = await guest(PERSONAL, 'Pribadi Pemilik', '081211112222');
    const foreignGuest = await guest(FOREIGN, 'Tamu Rival', '081233334444');
    const foreignWish = await wish(FOREIGN, 'Ucapan Rival');
    {
      const acc = {
        manager: await access.invitationAccess(manager.id, CLIENT),
        desk: await access.invitationAccess(desk.id, CLIENT),
        outsider: await access.invitationAccess(outsider.id, CLIENT),
        rivalStaff: await access.invitationAccess(rivalStaff.id, CLIENT),
        admin: await access.invitationAccess(admin.id, CLIENT),
        managerPersonal: await access.invitationAccess(manager.id, PERSONAL),
        managerForged: await access.invitationAccess(manager.id, FOREIGN),
        rivalStaffOwn: await access.invitationAccess(rivalStaff.id, RIVAL_CLIENT),
        managerDeleted: await access.invitationAccess(manager.id, DELETED),
      };
      const brief = Object.fromEntries(Object.entries(acc).map(([name, a]) => [name, a ? `${a.role}/${a.via ?? '-'}` : null]));
      check('the guard with FLAG_TEAM_ACCESS off: a manager is a co-host and a desk an usher, through the workspace; an outsider, another workspace\'s staff, an administrator holding a grant, the owner\'s personal invitation, a forged one and a deleted one give nothing',
        same(brief, { manager: 'cohost/workspace', desk: 'usher/workspace', outsider: null, rivalStaff: null, admin: null, managerPersonal: null, managerForged: null, rivalStaffOwn: 'cohost/workspace', managerDeleted: null }),
        JSON.stringify(brief));
      const shared = { manager: await access.sharedInvitations(manager.id), desk: await access.sharedInvitations(desk.id), outsider: await access.sharedInvitations(outsider.id) };
      check('the dashboard lists each staff member\'s client invitations with their role (both clients, never the personal or the forged one); an outsider sees none',
        same(shared.manager.map((s) => [s.invitationId, s.role]).sort(), [[CLIENT, 'cohost'], [CLIENT2, 'cohost']].sort())
          && same(shared.desk.map((s) => [s.invitationId, s.role]).sort(), [[CLIENT, 'usher'], [CLIENT2, 'usher']].sort()) && shared.outsider.length === 0,
        JSON.stringify(shared));

      const views = {
        guests: { manager: k(await page(manager, () => GuestsPage(params(CLIENT)))), desk: k(await page(desk, () => GuestsPage(params(CLIENT)))), outsider: k(await page(outsider, () => GuestsPage(params(CLIENT)))), admin: k(await page(admin, () => GuestsPage(params(CLIENT)))), personal: k(await page(manager, () => GuestsPage(params(PERSONAL)))) },
        insights: { manager: k(await page(manager, () => InsightsPage(params(CLIENT)))), desk: k(await page(desk, () => InsightsPage(params(CLIENT)))) },
        wishes: { manager: k(await page(manager, () => WishesPage(params(CLIENT)))), desk: k(await page(desk, () => WishesPage(params(CLIENT)))) },
        checkin: { desk: k(await page(desk, () => CheckinPage(params(CLIENT)))), manager: k(await page(manager, () => CheckinPage(params(CLIENT)))), outsider: k(await page(outsider, () => CheckinPage(params(CLIENT)))), forged: k(await page(desk, () => CheckinPage(params(FOREIGN)))) },
        editor: { manager: k(await page(manager, () => ManagePage(params(CLIENT)))), desk: k(await page(desk, () => ManagePage(params(CLIENT)))), owner: k(await page(owner, () => ManagePage(params(CLIENT)))) },
      };
      check('pages: guests, insights and wishes open for a manager only; the desk for both roles; the editor for the owner only; outsiders, the personal and the forged invitation get 404 and an administrator sign-in',
        same(views, {
          guests: { manager: 'returned', desk: 'notfound', outsider: 'notfound', admin: '/sign-in', personal: 'notfound' },
          insights: { manager: 'returned', desk: 'notfound' },
          wishes: { manager: 'returned', desk: 'notfound' },
          checkin: { desk: 'returned', manager: 'returned', outsider: 'notfound', forged: 'notfound' },
          editor: { manager: 'notfound', desk: 'notfound', owner: 'returned' },
        }),
        JSON.stringify(views));
      const deskView = await page(desk, () => CheckinPage(params(CLIENT)));
      const scanner = deskView.kind === 'returned' ? propsOf(deskView.value, 'CheckinScanner') : null;
      const roster = (scanner?.roster ?? []) as Record<string, unknown>[];
      check("the desk's check-in carries each guest's display name, a one-way pass key and the arrival only: no phone, RSVP or wish",
        roster.length === 2 && roster.every((e) => same(Object.keys(e).sort(), ['checkedInAt', 'id', 'key', 'name'])) && !treeJson(scanner).includes('0812') && !treeJson(scanner).includes('Selamat'),
        treeJson(scanner).slice(0, 400));

      const ownerPage = await workspacePage(owner);
      const deskPage = await workspacePage(desk);
      const deskTree = deskPage.kind === 'returned' ? treeJson(deskPage.value) : '';
      check("the workspace page: the owner gets the client, assignment and staff sections; the desk gets this workspace's two clients, each opening the desk, and none of the owner's sections",
        ownerPage.kind === 'returned' && propsOf(ownerPage.value, 'OwnerSections') !== null && deskPage.kind === 'returned' && propsOf(deskPage.value, 'OwnerSections') === null
          && deskTree.includes(`/dashboard/invitations/${CLIENT}/checkin`) && deskTree.includes(`/dashboard/invitations/${CLIENT2}/checkin`) && deskTree.includes('Studio Melati')
          && !deskTree.includes(`/dashboard/invitations/${PERSONAL}/`) && !deskTree.includes(`/dashboard/invitations/${FOREIGN}/`),
        JSON.stringify({ owner: describe(ownerPage), desk: describe(deskPage) }));

      // s42: the page follows the dashboard's locale (the `locale` cookie when no middleware header is present).
      jar.set('locale', 'en');
      const deskPageEn = await workspacePage(desk);
      jar.delete('locale');
      const deskTreeEn = deskPageEn.kind === 'returned' ? treeJson(deskPageEn.value) : '';
      check('the workspace page in English: the desk sees the English headings, action and role name and no Indonesian heading; Indonesian stays the default',
        deskTreeEn.includes('Workspaces you staff') && deskTreeEn.includes('Open the check-in desk') && deskTreeEn.includes('Guest desk staff')
          && !deskTreeEn.includes('Ruang kerja tempat Anda bertugas') && deskTree.includes('Ruang kerja tempat Anda bertugas') && deskTree.includes('Staf meja tamu'),
        deskTreeEn.slice(0, 300));

      const csv = { manager: await exportCsv(manager, CLIENT), desk: await exportCsv(desk, CLIENT), outsider: await exportCsv(outsider, CLIENT), personal: await exportCsv(manager, PERSONAL), admin: await exportCsv(admin, CLIENT) };
      check('the guest export: a manager gets the CSV; a desk, an outsider and the personal invitation are 404; an administrator is 403',
        csv.manager.status === 200 && (csv.manager.type ?? '').startsWith('text/csv') && csv.manager.text.includes('Budi Hartono')
          && csv.desk.status === 404 && csv.outsider.status === 404 && csv.personal.status === 404 && csv.admin.status === 403,
        JSON.stringify(Object.fromEntries(Object.entries(csv).map(([name, r]) => [name, r.status]))));

      for (const backend of BACKENDS) {
        const added = {
          manager: await addGuestAs(manager, backend, CLIENT, `Tamu Manager ${backend}`),
          globalManager: await act(manager, backend, () => globalGuestActions.addGuest(form({ invitationId: CLIENT, name: `Global Manager ${backend}`, phone: '', category: '', guestCount: '1' }))),
          desk: await addGuestAs(desk, backend, CLIENT, `Tamu Desk ${backend}`),
          outsider: await addGuestAs(outsider, backend, CLIENT, `Tamu Luar ${backend}`),
          rivalStaff: await addGuestAs(rivalStaff, backend, CLIENT, `Tamu Rival ${backend}`),
          personal: await addGuestAs(manager, backend, PERSONAL, `Pribadi ${backend}`),
          forged: await addGuestAs(manager, backend, FOREIGN, `Palsu ${backend}`),
        };
        const names = await guestNames([CLIENT, PERSONAL, FOREIGN]);
        check(`${backend}: adding a guest: a manager writes on a client invitation (its list and the global list); a desk, an outsider, another workspace's staff, the personal and the forged invitation are refused with nothing stored`,
          k(added.manager).includes('added=1') && names.includes(`Tamu Manager ${backend}`) && k(added.globalManager).includes('added=1') && names.includes(`Global Manager ${backend}`)
            && k(added.desk) === '/dashboard/invitations' && added.outsider.kind === 'redirect' && added.rivalStaff.kind === 'redirect' && added.personal.kind === 'redirect' && added.forged.kind === 'redirect'
            && !names.some((n) => [`Tamu Desk ${backend}`, `Tamu Luar ${backend}`, `Tamu Rival ${backend}`, `Pribadi ${backend}`, `Palsu ${backend}`].includes(n)),
          describeAll(added));

        const w = await wish(CLIENT, `Ucapan ${backend}`);
        const moderation = {
          hide: await act(manager, backend, () => wishActions.moderateWish(form({ invitationId: CLIENT, wishId: w, action: 'hide' }))),
          reply: await act(manager, backend, () => wishActions.replyToWish(form({ invitationId: CLIENT, wishId: w, reply: 'Terima kasih' }))),
          desk: await act(desk, backend, () => wishActions.moderateWish(form({ invitationId: CLIENT, wishId: w, action: 'delete' }))),
          forged: await act(manager, backend, () => wishActions.moderateWish(form({ invitationId: FOREIGN, wishId: foreignWish, action: 'hide' }))),
        };
        const [wRow] = await sql`select is_hidden, host_reply from guest_messages where id = ${w}`;
        const [fRow] = await sql`select is_hidden from guest_messages where id = ${foreignWish}`;
        check(`${backend}: wishes: a manager hides and replies; a desk cannot delete; the forged invitation's wish is untouched`,
          wRow?.is_hidden === true && wRow.host_reply === 'Terima kasih' && k(moderation.desk) === '/dashboard/invitations' && fRow.is_hidden === false, describeAll(moderation));

        const g = await guest(CLIENT, `Meja ${backend}`);
        const g2 = await guest(CLIENT, `Meja Dua ${backend}`);
        const desks = {
          desk: await checkInAs(desk, backend, CLIENT, g),
          manager: await checkInAs(manager, backend, CLIENT, g2),
          outsider: await checkInAs(outsider, backend, CLIENT, budi),
          personal: await checkInAs(desk, backend, PERSONAL, personalGuest),
          forged: await checkInAs(desk, backend, FOREIGN, foreignGuest),
        };
        const arrived = await sql`select id from guests where checked_in_at is not null and id in ${sql([g, g2, budi, personalGuest, foreignGuest])} order by id`;
        check(`${backend}: the desk: a desk and a manager check guests in by hand; an outsider, the personal and the forged invitation are refused with no arrival recorded`,
          same(desks, { desk: true, manager: true, outsider: false, personal: false, forged: false }) && same(arrived.map((r) => r.id), [g, g2].sort((a, b) => a - b)),
          JSON.stringify({ desks, arrived }));

        // s42: forged row ids. Staff who may act on the client invitation name another invitation's guest or wish under
        // the client invitation's id: the access check passes on the invitation, so only each writer's row scope (the
        // guest's and the wish's `invitation_id` under their row locks) stands between the request and the other rows.
        const crossRows = {
          checkinPersonal: await checkInAs(desk, backend, CLIENT, personalGuest),
          checkinForeign: await checkInAs(manager, backend, CLIENT, foreignGuest),
          sentPersonal: await act(manager, backend, () => guestActions.updateGuestOperation(form({ invitationId: CLIENT, guestId: personalGuest, operation: 'sent' }))),
          hideForeign: await act(manager, backend, () => wishActions.moderateWish(form({ invitationId: CLIENT, wishId: foreignWish, action: 'hide' }))),
          replyForeign: await act(manager, backend, () => wishActions.replyToWish(form({ invitationId: CLIENT, wishId: foreignWish, reply: 'Palsu' }))),
        };
        const crossGuests = await sql`select id, checked_in_at, sent_at from guests where id in ${sql([personalGuest, foreignGuest])}`;
        const [crossWish] = await sql`select is_hidden, host_reply from guest_messages where id = ${foreignWish}`;
        check(`${backend}: forged row ids: a client invitation's staff naming another invitation's guest or wish under the client invitation's id change nothing (check-in, mark sent, hide, reply)`,
          crossRows.checkinPersonal === false && crossRows.checkinForeign === false
            && crossGuests.length === 2 && crossGuests.every((row) => row.checked_in_at === null && row.sent_at === null)
            && crossWish.is_hidden === false && crossWish.host_reply === null,
          JSON.stringify({ checkinPersonal: crossRows.checkinPersonal, checkinForeign: crossRows.checkinForeign, sent: describe(crossRows.sentPersonal), hide: describe(crossRows.hideForeign), reply: describe(crossRows.replyForeign), crossGuests, crossWish }));
      }
    }

    // ── 5. Revocation, a disabled workspace, a taken-back or deleted invitation ──
    {
      const revoked = await act(owner, 'next', () => workspaceActions.revokeStaffAction(form({ rowId: managerRow })));
      const afterRevoke: Record<string, unknown> = { revoke: k(revoked), access: await access.invitationAccess(manager.id, CLIENT), page: k(await page(manager, () => GuestsPage(params(CLIENT)))) };
      for (const backend of BACKENDS) {
        afterRevoke[`add-${backend}`] = k(await addGuestAs(manager, backend, CLIENT, `Dicabut ${backend}`));
        afterRevoke[`checkin-${backend}`] = await checkInAs(manager, backend, CLIENT, budi);
      }
      const names = await guestNames([CLIENT]);
      const [budiRow] = await sql`select checked_in_at from guests where id = ${budi}`;
      check('a revoked manager: the guard, the guests page and each writer refuse at the next request; no guest added, no arrival recorded; the desk keeps its access',
        afterRevoke.revoke === `${PAGE}?revoked=1` && afterRevoke.access === null && afterRevoke.page === 'notfound' && !names.some((n) => n.startsWith('Dicabut'))
          && BACKENDS.every((b) => afterRevoke[`add-${b}`] !== undefined && String(afterRevoke[`add-${b}`]).startsWith('/') && afterRevoke[`checkin-${b}`] === false)
          && budiRow.checked_in_at === null && (await access.invitationAccess(desk.id, CLIENT))?.role === 'usher',
        JSON.stringify(afterRevoke));

      const pending = await workspaceDb.createStaffLink(owner.id, { role: 'manager', label: 'Menunggu' });
      if (pending.kind !== 'created') throw new Error('pending link');
      await sql`update workspaces set disabled_at = now() where id = ${W}`;
      const disabled: Record<string, unknown> = {
        access: await access.invitationAccess(desk.id, CLIENT),
        ownerAccess: (await access.invitationAccess(owner.id, CLIENT))?.role ?? null,
        deskPage: k(await page(desk, () => CheckinPage(params(CLIENT)))),
        shared: (await access.sharedInvitations(desk.id)).length,
        link: (await workspaceDb.createStaffLink(owner.id, { role: 'desk', label: 'Saat nonaktif' })).kind,
        assign: await workspaceDb.assignClientInvitation(owner.id, PERSONAL, 'Saat Nonaktif'),
        preview: (await workspaceDb.staffJoinPreview(pending.token, outsider.id)).state,
        join: (await workspaceDb.acceptStaffLink(outsider.id, pending.token)).kind,
      };
      for (const backend of BACKENDS) disabled[`checkin-${backend}`] = await checkInAs(desk, backend, CLIENT, budi);
      const ownerView = await workspacePage(owner);
      const ownerTree = ownerView.kind === 'returned' ? treeJson(ownerView.value) : '';
      const ownerAdd = await addGuestAs(owner, BACKENDS.at(-1) as Backend, CLIENT, 'Pemilik Saat Nonaktif');
      check('a disabled workspace: its staff hold nothing (the guard, the desk, the dashboard, each writer); no link, assignment or join; the owner keeps the invitation and sees the disabled notice',
        disabled.access === null && disabled.ownerAccess === 'owner' && disabled.deskPage === 'notfound' && disabled.shared === 0 && disabled.link === 'notfound'
          && disabled.assign === false && disabled.preview === 'invalid' && disabled.join === 'invalid' && BACKENDS.every((b) => disabled[`checkin-${b}`] === false)
          && ownerView.kind === 'returned' && ownerTree.includes('sedang dinonaktifkan') && propsOf(ownerView.value, 'OwnerSections') === null && k(ownerAdd).includes('added=1'),
        JSON.stringify({ disabled, ownerAdd: describe(ownerAdd) }));
      await sql`update workspaces set disabled_at = null where id = ${W}`;
      check('enabled again: the desk works again', (await checkInAs(desk, 'next', CLIENT, budi)) === true);
      await sql`update guests set checked_in_at = null where id = ${budi}`;

      const unassigned = await act(owner, 'next', () => workspaceActions.unassignClientAction(form({ invitationId: CLIENT2 })));
      const taken: Record<string, unknown> = { unassign: k(unassigned), access: await access.invitationAccess(desk.id, CLIENT2), listed: (await access.sharedInvitations(desk.id)).map((s) => s.invitationId) };
      const g3 = await guest(CLIENT2, 'Tamu Diambil');
      for (const backend of BACKENDS) taken[`checkin-${backend}`] = await checkInAs(desk, backend, CLIENT2, g3);
      const reassigned = await act(owner, 'next', () => workspaceActions.assignClientAction(form({ invitationId: CLIENT2, clientLabel: 'Dimas & Ayu' })));
      taken.reassign = k(reassigned);
      taken.back = (await access.invitationAccess(desk.id, CLIENT2))?.role ?? null;
      check('an invitation taken back: its staff lose it at once in the guard, the dashboard and each writer; assigned again, they have it back',
        taken.unassign === `${PAGE}?unassigned=1` && taken.access === null && same(taken.listed, [CLIENT]) && BACKENDS.every((b) => taken[`checkin-${b}`] === false)
          && taken.reassign === `${PAGE}?assigned=1` && taken.back === 'usher',
        JSON.stringify(taken));

      await sql`update invitations set deleted_at = now(), purge_after = now() + interval '30 days' where id = ${CLIENT2}`;
      const gone: Record<string, unknown> = { desk: await access.invitationAccess(desk.id, CLIENT2), owner: await access.invitationAccess(owner.id, CLIENT2), listed: (await workspaceDb.clientInvitations(W)).map((c) => c.invitationId) };
      for (const backend of BACKENDS) gone[`checkin-${backend}`] = await checkInAs(desk, backend, CLIENT2, g3);
      check('a deleted client invitation grants nothing to its staff (or its owner until restored) and leaves the workspace list',
        gone.desk === null && gone.owner === null && same(gone.listed, [CLIENT]) && BACKENDS.every((b) => gone[`checkin-${b}`] === false), JSON.stringify(gone));
    }

    // ── 6. FLAG_WORKSPACES off with FLAG_TEAM_ACCESS on ──
    {
      const team = await access.createJoinLink(owner.id, CLIENT, { role: 'usher', label: 'Dual meja' });
      if (team.kind !== 'created' || (await access.acceptJoinLink(dual.id, team.token)).kind !== 'joined') throw new Error('dual team grant');
      await joinStaff(owner, dual, 'manager');
      env.FLAG_TEAM_ACCESS = 'on';
      const both = await access.invitationAccess(dual.id, CLIENT);
      const bothShared = await access.sharedInvitations(dual.id);
      check('both flags on: an account holding a team usher grant and a workspace manager grant works with the broader (co-host, via the workspace), listed once',
        both?.role === 'cohost' && both.via === 'workspace' && bothShared.filter((s) => s.invitationId === CLIENT).length === 1 && bothShared.find((s) => s.invitationId === CLIENT)?.role === 'cohost',
        JSON.stringify({ both, bothShared }));

      const stateBefore = await workspaceState();
      env.FLAG_WORKSPACES = 'off';
      const off: Record<string, unknown> = {
        dual: (await access.invitationAccess(dual.id, CLIENT))?.role ?? null,
        desk: await access.invitationAccess(desk.id, CLIENT),
        deskShared: (await access.sharedInvitations(desk.id)).length,
        deskPage: k(await page(desk, () => CheckinPage(params(CLIENT)))),
        dualGuests: k(await page(dual, () => GuestsPage(params(CLIENT)))),
        workspacePage: k(await workspacePage(owner)),
        staffAction: k(await act(owner, 'next', () => workspaceActions.revokeStaffAction(form({ rowId: deskRow })))),
        link: k(await page(null, () => StaffLinkPage({ params: Promise.resolve({ token: BAD_TOKEN }) }))),
      };
      for (const backend of BACKENDS) {
        off[`dual-add-${backend}`] = k(await addGuestAs(dual, backend, CLIENT, `Mati Dual ${backend}`));
        off[`desk-checkin-${backend}`] = await checkInAs(desk, backend, CLIENT, budi);
        off[`dual-checkin-${backend}`] = await checkInAs(dual, backend, CLIENT, budi);
        await sql`update guests set checked_in_at = null where id = ${budi}`;
      }
      const names = await guestNames([CLIENT]);
      const stateOff = await workspaceState();
      check('flag off: workspace staff hold nothing (the guard, the dashboard, the desk, each writer) and an account\'s team usher grant stays an usher grant (the guests page and both writers refuse its add); the workspace entries are 404',
        off.dual === 'usher' && off.desk === null && off.deskShared === 0 && off.deskPage === 'notfound' && off.dualGuests === 'notfound' && off.workspacePage === 'notfound'
          && off.staffAction === 'notfound' && off.link === 'notfound' && !names.some((n) => n.startsWith('Mati Dual'))
          && BACKENDS.every((b) => off[`dual-add-${b}`] === '/dashboard/invitations' && off[`desk-checkin-${b}`] === false && off[`dual-checkin-${b}`] === true),
        JSON.stringify(off));
      check('flag off keeps every workspace, membership, client assignment and ledger entry as it was', stateOff === stateBefore, `${stateBefore} → ${stateOff}`);
      env.FLAG_WORKSPACES = 'on';
      const back = { desk: (await access.invitationAccess(desk.id, CLIENT))?.role ?? null, dual: (await access.invitationAccess(dual.id, CLIENT))?.role ?? null };
      check('flag on again: the stored memberships work again with no other change', same(back, { desk: 'usher', dual: 'cohost' }) && (await workspaceState()) === stateBefore, JSON.stringify(back));
      env.FLAG_TEAM_ACCESS = 'off';
    }

    // ── 7. The credit ledger (synthetic balances) ──
    {
      const key = (name: string) => `test:${tag}:${name}`;
      const balance = async () => credits.creditBalance(W);
      const entriesUnder = async (name: string) => (await sql`select count(*)::int as n from workspace_credit_entries where workspace_id = ${W} and operation_key = ${key(name)}`)[0].n as number;

      const granted = await credits.recordCredit({ workspaceId: W, operationKey: key('grant-1'), kind: 'grant', amount: 3, actorUserId: owner.id, note: 'Saldo uji sintetis' });
      const replayed = await credits.recordCredit({ workspaceId: W, operationKey: key('grant-1'), kind: 'grant', amount: 3, actorUserId: owner.id, note: 'Saldo uji sintetis' });
      const conflict = await rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('grant-1'), kind: 'grant', amount: 4 }));
      const asDebit = await rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('grant-1'), kind: 'debit', amount: 3 }));
      const afterGrant = await balance();
      check('a grant writes one entry and the balance (3); the same operation again replays that entry; another amount or kind under its key is a conflict',
        !granted.replayed && granted.entry.balanceAfter === 3 && granted.entry.delta === 3 && replayed.replayed && replayed.entry.id === granted.entry.id
          && conflict === 'CreditConflictError' && asDebit === 'CreditConflictError' && same(afterGrant, { balance: 3, ledgerSum: 3, entries: 1 }),
        JSON.stringify({ granted: granted.entry, replayed: replayed.replayed, conflict, asDebit, afterGrant }));

      const debited = await credits.recordCredit({ workspaceId: W, operationKey: key('debit-1'), kind: 'debit', amount: 1, invitationId: CLIENT, actorUserId: owner.id });
      const insufficient = await rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('debit-2'), kind: 'debit', amount: 5, invitationId: CLIENT }));
      check('a debit takes 1 (balance 2, linked to its invitation); a debit of 5 is refused as insufficient with no entry under its key and the balance unchanged',
        !debited.replayed && debited.entry.delta === -1 && debited.entry.balanceAfter === 2 && debited.entry.invitationId === CLIENT
          && insufficient === 'InsufficientCreditsError' && (await entriesUnder('debit-2')) === 0 && same(await balance(), { balance: 2, ledgerSum: 2, entries: 2 }),
        JSON.stringify({ debited: debited.entry, insufficient, balance: await balance() }));

      const race = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => credits.recordCredit({ workspaceId: W, operationKey: key(`race-${i}`), kind: 'debit', amount: 1 })));
      const refusedRace = race.filter((r) => r.status === 'rejected').map((r) => ((r as PromiseRejectedResult).reason as Error).name);
      check('six debits of 1 at once on a balance of 2: exactly two are written, four refused as insufficient; the balance is 0 and equals the ledger',
        race.filter((r) => r.status === 'fulfilled').length === 2 && refusedRace.length === 4 && refusedRace.every((n) => n === 'InsufficientCreditsError')
          && same(await balance(), { balance: 0, ledgerSum: 0, entries: 4 }),
        JSON.stringify({ refusedRace, balance: await balance() }));

      await credits.recordCredit({ workspaceId: W, operationKey: key('grant-2'), kind: 'grant', amount: 2 });
      const twins = await Promise.all(Array.from({ length: 5 }, () => credits.recordCredit({ workspaceId: W, operationKey: key('twin'), kind: 'debit', amount: 1, invitationId: CLIENT })));
      check('five copies of one debit at once (a retry storm): one entry, written once and replayed four times; 1 credit taken, not 5',
        twins.filter((t) => !t.replayed).length === 1 && new Set(twins.map((t) => t.entry.id)).size === 1 && (await entriesUnder('twin')) === 1
          && same(await balance(), { balance: 1, ledgerSum: 1, entries: 6 }),
        JSON.stringify({ twins: twins.map((t) => [t.entry.id, t.replayed]), balance: await balance() }));

      const [{ client_label: labelBefore }] = await sql`select client_label from invitations where id = ${CLIENT}`;
      const failed = await rejection(() =>
        credits.debitWith({ workspaceId: W, operationKey: key('op-fail'), amount: 1, invitationId: CLIENT }, async (tx) => {
          await tx.update(invitationsTable).set({ clientLabel: 'Tidak tersimpan' }).where(eq(invitationsTable.id, CLIENT));
          throw new Error('the paid operation failed');
        }),
      );
      const [{ client_label: labelAfterFail }] = await sql`select client_label from invitations where id = ${CLIENT}`;
      check("an operation that fails after its debit takes the debit back with its own write: no entry under its key, the balance and the invitation unchanged",
        failed === 'Error' && (await entriesUnder('op-fail')) === 0 && labelAfterFail === labelBefore && same(await balance(), { balance: 1, ledgerSum: 1, entries: 6 }),
        JSON.stringify({ failed, labelAfterFail, balance: await balance() }));

      let runs = 0;
      const paid = await credits.debitWith({ workspaceId: W, operationKey: key('op-ok'), amount: 1, invitationId: CLIENT }, async (tx) => {
        runs++;
        await tx.update(invitationsTable).set({ clientLabel: 'Budi & Sari (lunas)' }).where(eq(invitationsTable.id, CLIENT));
        return 'done';
      });
      const paidAgain = await credits.debitWith({ workspaceId: W, operationKey: key('op-ok'), amount: 1, invitationId: CLIENT }, async () => {
        runs++;
        throw new Error('must not run on a replay');
      });
      const [{ client_label: labelPaid }] = await sql`select client_label from invitations where id = ${CLIENT}`;
      check('a debit and its operation commit together (balance 0, the write kept); the same operation again replays the debit without running the operation',
        !paid.replayed && paid.result === 'done' && paidAgain.replayed && paidAgain.entry.id === paid.entry.id && runs === 1
          && labelPaid === 'Budi & Sari (lunas)' && same(await balance(), { balance: 0, ledgerSum: 0, entries: 7 }),
        JSON.stringify({ paid: paid.replayed, paidAgain: paidAgain.replayed, runs, labelPaid, balance: await balance() }));
      await sql`update invitations set client_label = 'Budi & Sari' where id = ${CLIENT}`;

      await sql`update workspaces set disabled_at = now() where id = ${W}`;
      const onDisabled = await rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('disabled'), kind: 'grant', amount: 1 }));
      await sql`update workspaces set disabled_at = null where id = ${W}`;
      const unknownWorkspace = await rejection(() => credits.recordCredit({ workspaceId: 2_000_000_000, operationKey: key('unknown'), kind: 'grant', amount: 1 }));
      const malformed = await Promise.all([
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: 'ab', kind: 'grant', amount: 1 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: 'kunci dengan spasi', kind: 'grant', amount: 1 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: `-${key('dash')}`, kind: 'grant', amount: 1 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('zero'), kind: 'grant', amount: 0 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('half'), kind: 'grant', amount: 1.5 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('negative'), kind: 'debit', amount: -1 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('huge'), kind: 'grant', amount: credits.MAX_CREDITS_PER_ENTRY + 1 })),
        rejection(() => credits.recordCredit({ workspaceId: 0, operationKey: key('noworkspace'), kind: 'grant', amount: 1 })),
        rejection(() => credits.recordCredit({ workspaceId: W, operationKey: key('note'), kind: 'grant', amount: 1, note: 'n'.repeat(201) })),
      ]);
      check('a disabled or unknown workspace is refused; malformed keys, amounts (0, 1.5, -1, above the ceiling), workspace ids and notes are refused before any database work; nothing written',
        onDisabled === 'WorkspaceUnavailableError' && unknownWorkspace === 'WorkspaceUnavailableError' && malformed.every((m) => m === 'CreditRequestError')
          && same(await balance(), { balance: 0, ledgerSum: 0, entries: 7 }),
        JSON.stringify({ onDisabled, unknownWorkspace, malformed }));

      const negative = await rejection(() => sql`update workspaces set credit_balance = -1 where id = ${W}`.then(() => undefined));
      const wrongSign = await rejection(() => sql`insert into workspace_credit_entries (workspace_id, operation_key, kind, delta, balance_after) values (${W}, ${key('sign')}, 'debit', 1, 1)`.then(() => undefined));
      const duplicate = await rejection(() => sql`insert into workspace_credit_entries (workspace_id, operation_key, kind, delta, balance_after) values (${W}, ${key('grant-1')}, 'grant', 1, 1)`.then(() => undefined));
      const otherWorkspaceSameKey = await credits.recordCredit({ workspaceId: RW, operationKey: key('grant-1'), kind: 'grant', amount: 1 });
      check("the database refuses a negative balance, a debit with a positive delta and a reused key in one workspace; another workspace's ledger is its own (the same key is a fresh entry there)",
        negative !== 'resolved' && wrongSign !== 'resolved' && duplicate !== 'resolved' && !otherWorkspaceSameKey.replayed && otherWorkspaceSameKey.entry.workspaceId === RW
          && same(await balance(), { balance: 0, ledgerSum: 0, entries: 7 }) && same(await credits.creditBalance(RW), { balance: 1, ledgerSum: 1, entries: 1 }),
        JSON.stringify({ negative, wrongSign, duplicate }));

      // s42: a grant racing debits on an empty balance. Whatever order the row lock imposes, each debit is either written
      // after the grant or refused as insufficient before it; the balance never goes negative and always equals the ledger.
      const mixed = await Promise.allSettled([
        credits.recordCredit({ workspaceId: W, operationKey: key('mixed-grant'), kind: 'grant', amount: 2 }),
        ...Array.from({ length: 3 }, (_, i) => credits.recordCredit({ workspaceId: W, operationKey: key(`mixed-debit-${i}`), kind: 'debit', amount: 1 })),
      ]);
      const [grantResult, ...debitResults] = mixed;
      const debitsWritten = debitResults.filter((r) => r.status === 'fulfilled').length;
      const debitsRefused = debitResults.flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error).name] : []));
      const afterMixed = await balance();
      check('a grant of 2 racing three debits of 1 on an empty balance: the grant is written; each debit is written or refused as insufficient (at most two written); the balance equals the ledger and is never negative',
        grantResult.status === 'fulfilled' && debitsWritten <= 2 && debitsRefused.every((name) => name === 'InsufficientCreditsError')
          && debitsWritten + debitsRefused.length === 3 && same(afterMixed, { balance: 2 - debitsWritten, ledgerSum: 2 - debitsWritten, entries: 8 + debitsWritten }),
        JSON.stringify({ debitsWritten, debitsRefused, afterMixed }));
    }
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    if (created.invitations.length) {
      for (const id of created.invitations) {
        await sql`delete from api_idempotency_keys where scope like ${`%:${id}:%`}`;
        await sql`delete from analytics_events where invitation_id = ${id}`;
        await sql`delete from guest_messages where invitation_id = ${id}`;
        await sql`delete from guest_registrations where invitation_id = ${id}`;
        await sql`delete from guest_registration_links where invitation_id = ${id}`;
        await sql`delete from guests where invitation_id = ${id}`;
        await sql`delete from invitation_members where invitation_id = ${id}`;
      }
    }
    if (created.users.length) {
      const owned = sql`(select id from workspaces where owner_user_id in ${sql(created.users)})`;
      await sql`delete from workspace_credit_entries where workspace_id in ${owned}`;
      await sql`delete from workspace_members where workspace_id in ${owned} or user_id in ${sql(created.users)}`;
      if (created.invitations.length) await sql`delete from invitations where id in ${sql(created.invitations)}`;
      await sql`delete from workspaces where owner_user_id in ${sql(created.users)}`;
      await sql`delete from invitation_members where user_id in ${sql(created.users)}`;
      await sql`delete from users where id in ${sql(created.users)}`;
    }
    if (jwksServer) await new Promise<void>((resolve) => (jwksServer as http.Server).close(() => resolve()));
    await sql.end();
  }
  console.log(`\n${passes} passed, ${failures} failed (writers: ${BACKENDS.join(', ')})`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
