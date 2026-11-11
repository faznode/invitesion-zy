/**
 * B-035 end to end: the editor's save (`app/api/invitations/[id]/detail`, GET and PATCH, the routes the editor calls)
 * through both content writers, against a running Rust API and a scratch database, through the typed client and the
 * service signature. Only Next.js's request primitives and Clerk's session are stubbed; invitations are made by the
 * product's `createInvitation`, so every save starts from creation's version 1.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     npx tsx scripts/verify-content-api.ts
 *
 * It proves, through each writer: a save stores the config and the next version, and the editor's reload reads both back;
 * two saves from one version store one and refuse the other with the stored version; a stale edit writes nothing; a
 * protected image of another invitation and a Premium palette on a Standard invitation are refused; B-036: a switch to a
 * Standard catalog theme is stored with the content kept and `invitations.template_id` untouched, a Premium one is
 * refused; another customer, an administrator and a signed-out request are refused; a page loaded before B-035 (no
 * version sent) still saves. G-041: a family's section order and font pairing are stored, and returning to the defaults
 * (sent as their own ids since session 44) is stored and read back; choices outside the contract are refused with nothing
 * written; an unchanged retired order does not block another change; a family switch keeps the choices; a Standard
 * invitation's Premium palette is refused whole and a paid Premium one stores it; a config-only restore keeps every event
 * id and the guests' RSVP rows. G-046 through the restore route: an older version is stored whole as one new live version
 * and undone by restoring the version it replaced; only the config and its version rows change; a stale page, the current,
 * an unknown or malformed version, flag off, another customer, an administrator, a signed-out request, an unreadable
 * version, another invitation's protected image (D-040) and a Premium palette (B-041) write nothing; a repeated number
 * restores its latest row; the history pages through every version once. Across
 * writers: the same answers and the same stored rows. For the Rust writer: a lost answer is retried under its key and
 * replayed, written once and never reported as a conflict; two lost answers report "unconfirmed" and the next save from
 * the old version meets the conflict. Exactly one writer per call: with the API down under `rust` nothing is written,
 * and `next` never calls it; flipping the flag back and forth keeps one version sequence. Fixture rows are fictional,
 * tagged per run and removed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import Module from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';

const session = { clerkUserId: null as string | null, token: null as string | null };
const stubs: Record<string, unknown> = {
  'server-only': {},
  'next/navigation': { redirect: (url: string) => { throw new Error(`redirect ${url}`); }, notFound: () => { throw new Error('notFound'); } },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/headers': { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [] }) },
  '@clerk/nextjs/server': { auth: async () => ({ userId: session.clerkUserId, getToken: async () => session.token }), currentUser: async () => null },
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
const HEX = '0123456789abcdef01234567';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

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
const FORWARDED = ['content-type', 'accept', 'x-invitesion-signature', 'idempotency-key', 'authorization', 'x-request-id'];
type Seen = { key?: string; status: number; replayed: string | null };
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
    seen.push({ key: headers['idempotency-key'], status: upstream.status, replayed: upstream.headers.get('idempotent-replayed') });
    if (step === 'forward-drop') {
      req.socket.destroy();
      return;
    }
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(text);
  };
  return { seen, handler };
}

type Backend = 'next' | 'rust';

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const route = await import('../app/api/invitations/[id]/detail/route');
  const restoreRoute = await import('../app/api/invitations/[id]/versions/[versionNo]/restore/route');
  const { loadVersionHistory } = await import('../lib/invitation/content');
  const { createInvitation } = await import('../lib/invitation/create');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[], orders: [] as number[] };

  async function user(name: string, role: 'CUSTOMER' | 'ADMIN') {
    const clerk = `user_contentapi_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role) values (${`content-api-${name}-${tag}@example.invalid`}, ${clerk}, ${role}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  async function invitation(owner: number, name: string, eventType: 'wedding' | 'birthday' | 'tasyakuran' = 'wedding') {
    const made = await createInvitation({ userId: owner, eventType, title: `content api ${name} ${tag}` });
    created.invitations.push(made.id);
    return made.id;
  }
  /** What both writers must store alike: the config, and every version's number, live flag and config. */
  async function state(id: number) {
    const [row] = await sql`select config from invitations where id = ${id}`;
    const versions = await sql`select version_no, is_live, config from invitation_versions where invitation_id = ${id} order by version_no, id`;
    return {
      config: row.config as unknown,
      versions: versions.map((v) => [v.version_no as number, v.is_live as boolean]),
      live: versions.filter((v) => v.is_live).map((v) => v.config as unknown),
    };
  }
  type State = Awaited<ReturnType<typeof state>>;
  const coherent = (s: State) => s.live.length === 1 && same(s.live[0], s.config);

  // Owner tokens: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts share for this API
  // instance (named by a hash of its secret): the API refetches its JWKS for an unknown `kid` at most once per 30 s.
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `content-api-${tag}`;
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
  async function signIn(who: { clerk: string } | null) {
    session.clerkUserId = who?.clerk ?? null;
    session.token = who ? await tokenFor(who.clerk) : null;
  }

  type Answer = { status: number; body: any };
  async function call(backend: Backend, method: 'GET' | 'PATCH', id: number, body?: unknown, apiBase = API): Promise<Answer> {
    env.BACKEND_CONTENT = backend;
    env.API_BASE_URL = apiBase;
    try {
      const request = new Request(`http://app.test/api/invitations/${id}/detail`, method === 'PATCH'
        ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { method });
      const response = await (method === 'GET' ? route.GET : route.PATCH)(request, { params: Promise.resolve({ id: String(id) }) });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } finally {
      delete env.BACKEND_CONTENT;
      env.API_BASE_URL = API;
    }
  }
  /** An answer without what differs by construction between two fixtures: ids inside messages. */
  const answerOf = (a: Answer) => JSON.stringify(sorted({ status: a.status, body: a.body })).replace(/\/media\/protected\/\d+\//g, '/media/protected/<id>/');

  const owner = await user('owner', 'CUSTOMER');
  const other = await user('other', 'CUSTOMER');
  const admin = await user('admin', 'ADMIN');

  try {
    const results: Record<Backend, { answers: string[]; states: State[] }> = { next: { answers: [], states: [] }, rust: { answers: [], states: [] } };
    for (const backend of ['next', 'rust'] as const) {
      const record = (a: Answer) => (results[backend].answers.push(answerOf(a)), a);
      await signIn(owner);
      const id = await invitation(owner.id, `flow-${backend}`);

      const loaded = record(await call(backend, 'GET', id));
      check(`${backend}: the editor loads creation's config with version 1`, loaded.status === 200 && loaded.body.version === 1);
      const quote = { enabled: true, text: 'Dua hati, satu langkah.', author: 'Budi & Sari' };
      const saved = record(await call(backend, 'PATCH', id, { quote, expectedVersion: 1 }));
      const reload = record(await call(backend, 'GET', id));
      const afterSave = await state(id);
      results[backend].states.push(afterSave);
      check(`${backend}: a save stores the next version and the reload reads it back`,
        saved.status === 200 && saved.body.version === 2 && reload.body.version === 2 && same(reload.body.data.quote, quote) && same(afterSave.versions, [[1, false], [2, true]]) && coherent(afterSave),
        `${saved.status} v${saved.body?.version}`);

      const tabA = { quote: { ...quote, text: 'Tab A' }, expectedVersion: 2 };
      const tabB = { quote: { ...quote, text: 'Tab B' }, expectedVersion: 2 };
      const [a, b] = await Promise.all([call(backend, 'PATCH', id, tabA), call(backend, 'PATCH', id, tabB)]);
      const afterRace = await state(id);
      const winner = a.status === 200 ? tabA : tabB;
      const loser = a.status === 200 ? b : a;
      check(`${backend}: two saves from one version store exactly one, whole, and refuse the other with the stored version`,
        [a.status, b.status].sort().join() === '200,409' && loser.body?.error?.code === 'VERSION_CONFLICT' && loser.body.error.details.currentVersion === 3
          && same((afterRace.config as any).quote, winner.quote) && same(afterRace.versions, [[1, false], [2, false], [3, true]]) && coherent(afterRace),
        `${a.status}/${b.status}`);
      record({ status: loser.status, body: loser.body });
      results[backend].states.push({ ...afterRace, config: { ...(afterRace.config as object), quote: 'winner' }, live: [] });

      const stale = record(await call(backend, 'PATCH', id, { quote: { ...quote, text: 'Basi' }, expectedVersion: 2 }));
      check(`${backend}: a stale edit is refused and writes nothing`, stale.status === 409 && stale.body.error.details.currentVersion === 3 && same(await state(id), afterRace));

      const legacy = record(await call(backend, 'PATCH', id, { quote: { ...quote, text: 'Tanpa versi' } }));
      check(`${backend}: a page loaded before B-035 still saves`, legacy.status === 200 && legacy.body.version === 4);

      const invalid = record(await call(backend, 'PATCH', id, { quote: { enabled: 'ya' }, expectedVersion: 4 }));
      check(`${backend}: an invalid section is refused before any writer`, invalid.status === 422 && (await state(id)).versions.length === 4);

      const premium = record(await call(backend, 'PATCH', id, { theme: { paletteId: 'midnight' }, expectedVersion: 4 }));
      check(`${backend}: a Premium palette on a Standard invitation is refused (B-041)`,
        premium.status === 403 && premium.body.error.code === 'THEME_NOT_ENTITLED' && same(premium.body.error.details, [{ path: 'theme.paletteId', reason: 'premium-palette' }]) && (await state(id)).versions.length === 4);

      // B-036 (D-054): catalog ids (103 Sage Garden is free; 102 Rose Gold Romance is premium on a Standard palette).
      const switched = record(await call(backend, 'PATCH', id, { theme: { templateId: 103, paletteId: 'sage' }, expectedVersion: 4 }));
      const afterSwitch = await state(id);
      const [purchased] = await sql`select template_id from invitations where id = ${id}`;
      const switchedConfig = afterSwitch.config as { theme?: { templateId?: number; paletteId?: string }; quote?: { text?: string } };
      check(`${backend}: a switch to a Standard catalog theme is stored, the content kept and the purchased theme untouched (B-036)`,
        switched.status === 200 && switched.body.version === 5 && switchedConfig.theme?.templateId === 103 && switchedConfig.theme?.paletteId === 'sage'
          && switchedConfig.quote?.text === 'Tanpa versi' && purchased.template_id === null && coherent(afterSwitch),
        `${switched.status} v${switched.body?.version}`);
      const upgrade = record(await call(backend, 'PATCH', id, { theme: { templateId: 102, paletteId: 'rose-gold' }, expectedVersion: 5 }));
      check(`${backend}: a Premium catalog theme on a Standard invitation needs an upgrade and writes nothing (B-036)`,
        upgrade.status === 403 && upgrade.body.error.code === 'THEME_NOT_ENTITLED' && same(upgrade.body.error.details, [{ path: 'theme.templateId', reason: 'premium-template' }]) && (await state(id)).versions.length === 5);

      const birthday = await invitation(owner.id, `birthday-${backend}`, 'birthday');
      const foreign = record(await call(backend, 'PATCH', birthday, { birthdayPerson: { photoUrl: `/media/protected/${id}/${HEX}.png` }, expectedVersion: 1 }));
      const own = record(await call(backend, 'PATCH', birthday, { birthdayPerson: { photoUrl: `/media/protected/${birthday}/${HEX}.png` }, expectedVersion: 1 }));
      check(`${backend}: another invitation's protected photo is refused, this invitation's is stored (D-040)`,
        foreign.status === 400 && foreign.body.error.code === 'INVALID_MEDIA' && own.status === 200 && own.body.version === 2);

      // G-041: layout choices through the editor's real save. `call` serialises the body as `sendDetailSave` does, so an
      // `undefined` key is dropped exactly as in the browser. A separate invitation keeps the version arithmetic above.
      const g = await invitation(owner.id, `g041-${backend}`);
      let gv = 1;
      const themeOf = async () => ({ ...((await state(g)).config as { theme?: Record<string, unknown> }).theme });
      const saveTheme = async (theme: Record<string, unknown>, recorded = true) => {
        const answer = await call(backend, 'PATCH', g, { theme, expectedVersion: gv });
        if (recorded) record(answer);
        if (answer.status === 200) gv = answer.body.version;
        return answer;
      };
      const chosen = await saveTheme({ ...(await themeOf()), familyId: 'gapura', sectionOrder: 'story-first', fontPairing: 'sans' });
      const afterChoice = await themeOf();
      check(`${backend}: G-041 a family with its section order and font pairing is stored`,
        chosen.status === 200 && afterChoice.familyId === 'gapura' && afterChoice.sectionOrder === 'story-first' && afterChoice.fontPairing === 'sans', `${chosen.status}`);

      const reset = await saveTheme({ ...afterChoice, sectionOrder: 'standard', fontPairing: 'serif-display' });
      const resetReload = record(await call(backend, 'GET', g));
      const afterReset = await state(g);
      check(`${backend}: G-041 returning to the defaults is stored, read back by the editor's reload, one live version`,
        reset.status === 200 && (afterReset.config as any).theme.sectionOrder === 'standard' && (afterReset.config as any).theme.fontPairing === 'serif-display'
          && resetReload.body.data.theme.sectionOrder === 'standard' && resetReload.body.data.theme.fontPairing === 'serif-display' && coherent(afterReset),
        `${reset.status} ${JSON.stringify(resetReload.body?.data?.theme)}`);

      await saveTheme({ ...(await themeOf()), sectionOrder: 'photos-last' });
      const omitted = await saveTheme({ ...(await themeOf()), sectionOrder: undefined });
      check(`${backend}: G-041 a theme save that leaves a choice out keeps it (how the pre-fix editor sent a default, so it never reached storage)`,
        omitted.status === 200 && (await themeOf()).sectionOrder === 'photos-last');

      const beforeUnknown = await state(g);
      const unknown = await saveTheme({ ...(await themeOf()), sectionOrder: 'acak', fontPairing: 'Comic Sans' });
      check(`${backend}: G-041 an order and a pairing outside the contract are refused and nothing is written`,
        unknown.status === 403 && unknown.body.error.code === 'THEME_NOT_ENTITLED'
          && same(unknown.body.error.details, [{ path: 'theme.sectionOrder', reason: 'unknown-section-order' }, { path: 'theme.fontPairing', reason: 'unknown-font-pairing' }])
          && same(await state(g), beforeUnknown),
        `${unknown.status}`);

      // A value an older release stored (written past the writers, in the config and its live version alike).
      await sql`update invitations set config = jsonb_set(config, '{theme,sectionOrder}', '"lama"'::jsonb) where id = ${g}`;
      await sql`update invitation_versions set config = jsonb_set(config, '{theme,sectionOrder}', '"lama"'::jsonb) where invitation_id = ${g} and is_live`;
      const keptRetired = await saveTheme({ ...(await themeOf()), paletteId: 'sand' });
      const afterRetired = await themeOf();
      const replaced = await saveTheme({ ...afterRetired, sectionOrder: 'story-first' });
      check(`${backend}: G-041 an unchanged retired order does not block another theme change, and a valid order replaces it`,
        keptRetired.status === 200 && afterRetired.sectionOrder === 'lama' && afterRetired.paletteId === 'sand' && replaced.status === 200 && (await themeOf()).sectionOrder === 'story-first',
        `${keptRetired.status}/${replaced.status}`);

      const switchedFamily = await saveTheme({ ...(await themeOf()), familyId: 'kartu' });
      const afterFamily = await themeOf();
      check(`${backend}: G-041 a family switch keeps the choices, which every family declares`,
        switchedFamily.status === 200 && afterFamily.familyId === 'kartu' && afterFamily.sectionOrder === 'story-first' && afterFamily.fontPairing === 'serif-display');

      const beforePremium = await state(g);
      const premiumChoice = await saveTheme({ ...afterFamily, sectionOrder: 'photos-last', paletteId: 'midnight' });
      check(`${backend}: G-041 a Standard invitation's save with a Premium palette is refused whole, its valid order included`,
        premiumChoice.status === 403 && same(premiumChoice.body.error.details, [{ path: 'theme.paletteId', reason: 'premium-palette' }]) && same(await state(g), beforePremium));

      const [paid] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status, paid_at)
        values (${owner.id}, ${g}, 'premium', 249000, 'IDR', 'qris', ${`vne_g041_${backend}_${tag}`}, 'PAID', now() at time zone 'utc') returning id`;
      created.orders.push(paid.id);
      const paidChoice = await saveTheme({ ...afterFamily, sectionOrder: 'photos-last', fontPairing: 'sans', paletteId: 'midnight' });
      const afterPaid = await themeOf();
      check(`${backend}: G-041 a paid Premium invitation stores a valid change with a Premium palette`,
        paidChoice.status === 200 && afterPaid.sectionOrder === 'photos-last' && afterPaid.fontPairing === 'sans' && afterPaid.paletteId === 'midnight', `${paidChoice.status}`);

      // A config-only restore (what G-046 will send): an earlier version's theme and events saved back. Event ids are random
      // per run, so these answers stay out of the cross-writer comparison; the check compares within the writer.
      const withEvents = await call(backend, 'PATCH', g, {
        events: [{ title: 'Akad (fiktif)', startAt: '2027-03-14T09:00:00+07:00' }, { title: 'Resepsi (fiktif)', startAt: '2027-03-14T11:00:00+07:00' }],
        expectedVersion: gv,
      });
      gv = withEvents.body?.version ?? gv;
      const [liveVersion] = await sql`select config from invitation_versions where invitation_id = ${g} and is_live`;
      const savedConfig = liveVersion.config as { theme: Record<string, unknown>; events: Array<{ id: string }> };
      const eventIds = savedConfig.events.map((event) => event.id);
      const answers = Object.fromEntries(eventIds.map((eventId, i) => [eventId, { status: i === 0 ? 'CONFIRMED' : 'DECLINED', attending: i === 0 ? 2 : null }]));
      const [guest] = await sql`insert into guests (invitation_id, name, slug, rsvp_status, rsvp_event_answers)
        values (${g}, 'Budi Tamu (fiktif)', ${`budi-tamu-${backend}-${tag}`}, 'CONFIRMED', ${JSON.stringify(answers)}::text::jsonb) returning id`;
      const guestRow = async () => (await sql`select rsvp_status, rsvp_event_answers, rsvp_answers, guest_count from guests where id = ${guest.id}`)[0];
      const guestBefore = await guestRow();
      await saveTheme({ ...savedConfig.theme, sectionOrder: 'standard', fontPairing: 'serif-display' }, false);
      const restored = await call(backend, 'PATCH', g, { theme: savedConfig.theme, events: savedConfig.events, expectedVersion: gv });
      gv = restored.body?.version ?? gv;
      const afterRestore = await state(g);
      const restoredConfig = afterRestore.config as typeof savedConfig;
      check(`${backend}: G-041 restoring a saved version's theme and events keeps every event id and leaves the guest's RSVP untouched`,
        withEvents.status === 200 && eventIds.length === 2 && restored.status === 200 && same(restoredConfig.theme, savedConfig.theme)
          && same(restoredConfig.events.map((event) => event.id), eventIds) && same(await guestRow(), guestBefore) && coherent(afterRestore),
        `${withEvents.status}/${restored.status}`);
      results[backend].states.push({ config: { theme: restoredConfig.theme }, versions: afterRestore.versions, live: [] });

      // B-032 (G-060) and I-11 through the editor's real save, on their own invitation so the version arithmetic above is
      // unchanged: a memorial's occasion and countdown switch, and a corpus reference. The id `fiktif-entri-uji` is
      // fictional and test-only; the shipped corpus is empty, so no reference resolves on a page (the renders are pinned in
      // `tests/b032-memorial.test.ts`). The editor always sends the countdown as a boolean and clears a reference with ''.
      const m = await invitation(owner.id, `b032-${backend}`, 'tasyakuran');
      let mv = 1;
      const memorialConfig = async () => (await state(m)).config as { settings?: Record<string, unknown>; quote?: Record<string, unknown> };
      const saveMemorial = async (body: Record<string, unknown>, recorded = true) => {
        const answer = await call(backend, 'PATCH', m, { ...body, expectedVersion: mv });
        if (recorded) record(answer);
        if (answer.status === 200) mv = answer.body.version;
        return answer;
      };
      // A draft without a template is created with no settings at all, so the title and language are saved first: the
      // memorial save must keep them beside its own keys (the facade's deep merge).
      const titled = await saveMemorial({ settings: { title: 'Tahlilan Bapak Sutrisno (fiktif)', language: 'id' } });
      const marked = await saveMemorial({ settings: { occasion: 'memorial', countdown: false } });
      const markedReload = record(await call(backend, 'GET', m));
      const afterMarked = await state(m);
      const markedSettings = (afterMarked.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: B-032 a memorial's occasion and an explicit countdown off are stored, kept beside the other settings and read back by the reload`,
        titled.status === 200 && marked.status === 200 && markedSettings.occasion === 'memorial' && markedSettings.countdown === false
          && markedSettings.title === 'Tahlilan Bapak Sutrisno (fiktif)' && markedSettings.language === 'id'
          && markedReload.body.data.settings.occasion === 'memorial' && markedReload.body.data.settings.countdown === false
          && markedReload.body.data.settings.title === 'Tahlilan Bapak Sutrisno (fiktif)' && coherent(afterMarked),
        `${titled.status}/${marked.status} ${JSON.stringify(markedReload.body?.data?.settings)}`);

      const shown = await saveMemorial({ settings: { ...markedSettings, countdown: true } });
      const shownSettings = (await memorialConfig()).settings ?? {};
      check(`${backend}: B-032 switching the countdown back on stores an explicit true and keeps the occasion`,
        shown.status === 200 && shownSettings.countdown === true && shownSettings.occasion === 'memorial', `${shown.status}`);

      const beforeBad = await state(m);
      const badOccasion = await saveMemorial({ settings: { occasion: 'pesta' } });
      const badCountdown = await saveMemorial({ settings: { countdown: 'off' } });
      const badCorpus = await saveMemorial({ quote: { enabled: true, corpusId: 'Bukan Id!' } });
      check(`${backend}: B-032 / I-11 an unknown occasion, a countdown that is not a boolean and a malformed corpus id are refused before any writer, nothing written`,
        badOccasion.status === 422 && badCountdown.status === 422 && badCorpus.status === 422 && same(await state(m), beforeBad),
        `${badOccasion.status}/${badCountdown.status}/${badCorpus.status}`);

      const referenced = await saveMemorial({ quote: { enabled: true, corpusId: 'fiktif-entri-uji' } });
      const referencedReload = record(await call(backend, 'GET', m));
      const cleared = await saveMemorial({ quote: { enabled: true, corpusId: '' } });
      check(`${backend}: I-11 a corpus reference is stored as its id, read back by the reload and cleared by an empty id`,
        referenced.status === 200 && referencedReload.body.data.quote.corpusId === 'fiktif-entri-uji' && cleared.status === 200 && (await memorialConfig()).quote?.corpusId === '',
        `${referenced.status}/${cleared.status}`);

      const beforeStale = await state(m);
      const staleMemorial = record(await call(backend, 'PATCH', m, { settings: { countdown: false }, expectedVersion: mv - 1 }));
      check(`${backend}: B-032 a stale countdown save is refused with the stored version and writes nothing`,
        staleMemorial.status === 409 && staleMemorial.body.error.code === 'VERSION_CONFLICT' && staleMemorial.body.error.details.currentVersion === mv && same(await state(m), beforeStale),
        `${staleMemorial.status}`);

      // A config-only restore of a memorial (what G-046 will send). Event ids are random per run, so these answers stay out
      // of the cross-writer comparison, as G-041's do.
      const memorialEvents = await saveMemorial({
        settings: { countdown: false },
        events: [{ title: 'Tahlilan & Doa Bersama (fiktif)', startAt: '2027-04-02T19:30:00+07:00' }, { title: 'Doa 40 hari (fiktif)', startAt: '2027-05-05T19:30:00+07:00' }],
      }, false);
      const [memorialLive] = await sql`select config from invitation_versions where invitation_id = ${m} and is_live`;
      const savedMemorial = memorialLive.config as { settings: Record<string, unknown>; events: Array<{ id: string }> };
      const memorialEventIds = savedMemorial.events.map((event) => event.id);
      const memorialAnswers = Object.fromEntries(memorialEventIds.map((eventId, i) => [eventId, { status: i === 0 ? 'CONFIRMED' : 'DECLINED', attending: i === 0 ? 3 : null }]));
      const [mourner] = await sql`insert into guests (invitation_id, name, slug, rsvp_status, rsvp_event_answers)
        values (${m}, 'Sari Tamu (fiktif)', ${`sari-tamu-${backend}-${tag}`}, 'CONFIRMED', ${JSON.stringify(memorialAnswers)}::text::jsonb) returning id`;
      const mournerRow = async () => (await sql`select rsvp_status, rsvp_event_answers, rsvp_answers, guest_count from guests where id = ${mourner.id}`)[0];
      const mournerBefore = await mournerRow();
      await saveMemorial({ settings: { countdown: true } }, false);
      const memorialRestored = await saveMemorial({ settings: savedMemorial.settings, events: savedMemorial.events }, false);
      const afterMemorialRestore = await state(m);
      const memorialRestoredConfig = afterMemorialRestore.config as typeof savedMemorial & { quote?: unknown };
      check(`${backend}: B-032 restoring a saved version brings back its countdown off and the occasion, keeps every event id and leaves the guest's RSVP untouched`,
        memorialEvents.status === 200 && memorialRestored.status === 200 && memorialRestoredConfig.settings.countdown === false && memorialRestoredConfig.settings.occasion === 'memorial'
          && same(memorialRestoredConfig.events.map((event) => event.id), memorialEventIds) && same(await mournerRow(), mournerBefore) && coherent(afterMemorialRestore),
        `${memorialEvents.status}/${memorialRestored.status}`);
      results[backend].states.push({
        config: { settings: { occasion: memorialRestoredConfig.settings.occasion, countdown: memorialRestoredConfig.settings.countdown }, quote: memorialRestoredConfig.quote },
        versions: afterMemorialRestore.versions,
        live: [],
      });

      // G-018 (I-31) through the editor's real save, on its own invitation: the guest language ID → EN → ID beside the
      // other settings with a reload after each step, an unknown language refused before any writer, and a stale save
      // refused. The editor always sends the language explicitly ('id' to go back): the merge keeps a key a save leaves out.
      const l = await invitation(owner.id, `g018-${backend}`);
      let lv = 1;
      const saveLanguage = async (body: Record<string, unknown>) => {
        const answer = record(await call(backend, 'PATCH', l, { ...body, expectedVersion: lv }));
        if (answer.status === 200) lv = answer.body.version;
        return answer;
      };
      const seeded = await saveLanguage({ settings: { title: 'Budi & Sari (fiktif)', openingCopy: 'Dengan hormat (fiktif).', countdown: false } });
      const english = await saveLanguage({ settings: { language: 'en' } });
      const englishReload = record(await call(backend, 'GET', l));
      const afterEnglish = await state(l);
      const englishSettings = (afterEnglish.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-018 choosing English stores settings.language = en beside the other settings and the reload reads it`,
        seeded.status === 200 && english.status === 200 && englishSettings.language === 'en' && englishSettings.title === 'Budi & Sari (fiktif)'
          && englishSettings.openingCopy === 'Dengan hormat (fiktif).' && englishSettings.countdown === false
          && englishReload.body.data.settings.language === 'en' && englishReload.body.data.settings.title === 'Budi & Sari (fiktif)' && coherent(afterEnglish),
        `${seeded.status}/${english.status} ${JSON.stringify(englishReload.body?.data?.settings)}`);
      const back = await saveLanguage({ settings: { ...englishSettings, language: 'id' } });
      const backReload = record(await call(backend, 'GET', l));
      const afterBack = await state(l);
      const backSettings = (afterBack.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-018 going back to Indonesian stores an explicit id, keeps every other setting and the reload reads it`,
        back.status === 200 && backSettings.language === 'id' && backSettings.title === 'Budi & Sari (fiktif)' && backSettings.openingCopy === 'Dengan hormat (fiktif).'
          && backSettings.countdown === false && backReload.body.data.settings.language === 'id' && coherent(afterBack),
        `${back.status}`);
      const beforeUnknownLanguage = await state(l);
      const unknownLanguage = await saveLanguage({ settings: { language: 'fr' } });
      const booleanLanguage = await saveLanguage({ settings: { language: true } });
      check(`${backend}: G-018 an unknown language is refused before any writer and nothing is written`,
        unknownLanguage.status === 422 && booleanLanguage.status === 422 && same(await state(l), beforeUnknownLanguage), `${unknownLanguage.status}/${booleanLanguage.status}`);
      const beforeStaleLanguage = await state(l);
      const staleLanguage = record(await call(backend, 'PATCH', l, { settings: { language: 'en' }, expectedVersion: lv - 1 }));
      check(`${backend}: G-018 a stale language save is refused with the stored version and writes nothing`,
        staleLanguage.status === 409 && staleLanguage.body.error.code === 'VERSION_CONFLICT' && staleLanguage.body.error.details.currentVersion === lv
          && same(await state(l), beforeStaleLanguage),
        `${staleLanguage.status}`);
      results[backend].states.push({ config: { settings: backSettings }, versions: afterBack.versions, live: [] });

      // G-035 (I-16) through the editor's real save, on its own invitation: hiding the guest page's share actions stores
      // settings.guestShare = false beside the other settings (the merge keeps the rest) and the reload reads it; showing
      // them again stores an explicit true; a non-boolean is refused before any writer with nothing written.
      const sh = await invitation(owner.id, `g035-${backend}`);
      let shv = 1;
      const saveShare = async (body: Record<string, unknown>) => {
        const answer = record(await call(backend, 'PATCH', sh, { ...body, expectedVersion: shv }));
        if (answer.status === 200) shv = answer.body.version;
        return answer;
      };
      const shareSeeded = await saveShare({ settings: { title: 'Budi & Sari (fiktif)', language: 'en' } });
      const hidden = await saveShare({ settings: { guestShare: false } });
      const hiddenReload = record(await call(backend, 'GET', sh));
      const afterHidden = await state(sh);
      const hiddenSettings = (afterHidden.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-035 hiding the share actions stores settings.guestShare = false beside the other settings and the reload reads it`,
        shareSeeded.status === 200 && hidden.status === 200 && hiddenSettings.guestShare === false && hiddenSettings.title === 'Budi & Sari (fiktif)'
          && hiddenSettings.language === 'en' && hiddenReload.body.data.settings.guestShare === false && coherent(afterHidden),
        `${shareSeeded.status}/${hidden.status} ${JSON.stringify(hiddenReload.body?.data?.settings)}`);
      const shareShown = await saveShare({ settings: { ...hiddenSettings, guestShare: true } });
      const afterShareShown = await state(sh);
      const shareShownSettings = (afterShareShown.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-035 showing them again stores an explicit true and keeps every other setting`,
        shareShown.status === 200 && shareShownSettings.guestShare === true && shareShownSettings.title === 'Budi & Sari (fiktif)'
          && shareShownSettings.language === 'en' && coherent(afterShareShown),
        `${shareShown.status}`);
      const beforeBadShare = await state(sh);
      const badShare = await saveShare({ settings: { guestShare: 'no' } });
      check(`${backend}: G-035 a non-boolean share setting is refused before any writer and nothing is written`,
        badShare.status === 422 && same(await state(sh), beforeBadShare), `${badShare.status}`);
      results[backend].states.push({ config: { settings: shareShownSettings }, versions: afterShareShown.versions, live: [] });

      // G-055 (I-30) through the editor's real save, on its own invitation: opting in to printable cards stores
      // settings.cardExport = true beside the other settings (the merge keeps the rest) and the reload reads it; opting
      // out stores an explicit false; a non-boolean is refused before any writer with nothing written.
      const ce = await invitation(owner.id, `g055-${backend}`);
      let cev = 1;
      const saveCards = async (body: Record<string, unknown>) => {
        const answer = record(await call(backend, 'PATCH', ce, { ...body, expectedVersion: cev }));
        if (answer.status === 200) cev = answer.body.version;
        return answer;
      };
      const cardsSeeded = await saveCards({ settings: { title: 'Budi & Sari (fiktif)', guestShare: false } });
      const optedIn = await saveCards({ settings: { cardExport: true } });
      const optedInReload = record(await call(backend, 'GET', ce));
      const afterOptIn = await state(ce);
      const optInSettings = (afterOptIn.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-055 opting in to printable cards stores settings.cardExport = true beside the other settings and the reload reads it`,
        cardsSeeded.status === 200 && optedIn.status === 200 && optInSettings.cardExport === true && optInSettings.title === 'Budi & Sari (fiktif)'
          && optInSettings.guestShare === false && optedInReload.body.data.settings.cardExport === true && coherent(afterOptIn),
        `${cardsSeeded.status}/${optedIn.status} ${JSON.stringify(optedInReload.body?.data?.settings)}`);
      const optedOut = await saveCards({ settings: { ...optInSettings, cardExport: false } });
      const afterOptOut = await state(ce);
      const optOutSettings = (afterOptOut.config as { settings: Record<string, unknown> }).settings;
      check(`${backend}: G-055 opting out stores an explicit false and keeps every other setting`,
        optedOut.status === 200 && optOutSettings.cardExport === false && optOutSettings.title === 'Budi & Sari (fiktif)'
          && optOutSettings.guestShare === false && coherent(afterOptOut),
        `${optedOut.status}`);
      const beforeBadCards = await state(ce);
      const badCards = await saveCards({ settings: { cardExport: 'yes' } });
      check(`${backend}: G-055 a non-boolean card setting is refused before any writer and nothing is written`,
        badCards.status === 422 && same(await state(ce), beforeBadCards), `${badCards.status}`);
      results[backend].states.push({ config: { settings: optOutSettings }, versions: afterOptOut.versions, live: [] });

      // I-21 (D-070) through the editor's real save, on its own invitation: the post-event memory is content like any
      // section. Switched on with a message and photos, the section is stored and the reload reads it; a partial save
      // merges (photos off keeps the message); an over-long message and a non-boolean switch are refused before any writer
      // with nothing written; restoring the version from before the memory (G-046) removes the section as one new version
      // and leaves a guest photo's row as it is (photos are rows, never content).
      const pe = await invitation(owner.id, `i021-${backend}`);
      let pev = 1;
      const savePe = async (body: Record<string, unknown>) => {
        const answer = record(await call(backend, 'PATCH', pe, { ...body, expectedVersion: pev }));
        if (answer.status === 200) pev = answer.body.version;
        return answer;
      };
      const peSeeded = await savePe({ settings: { title: 'Laras & Dimas (fiktif)' } });
      const beforeMemory = pev;
      const memoryOn = { enabled: true, message: 'Terima kasih sudah hadir (fiktif)', photos: true };
      const peOn = await savePe({ postEvent: memoryOn });
      const peReload = record(await call(backend, 'GET', pe));
      const afterPeOn = await state(pe);
      const peConfig = afterPeOn.config as { postEvent?: Record<string, unknown>; settings: Record<string, unknown> };
      check(`${backend}: I-21 the post-event memory saves as a section beside the rest and the reload reads it`,
        peSeeded.status === 200 && peOn.status === 200 && same(peConfig.postEvent, memoryOn) && peConfig.settings.title === 'Laras & Dimas (fiktif)'
          && same(peReload.body?.data?.postEvent, memoryOn) && coherent(afterPeOn),
        `${peSeeded.status}/${peOn.status} ${JSON.stringify(peReload.body?.data?.postEvent)}`);
      const pePhotosOff = await savePe({ postEvent: { photos: false } });
      const afterPhotosOff = await state(pe);
      const photosOffSection = (afterPhotosOff.config as { postEvent?: unknown }).postEvent;
      check(`${backend}: I-21 a partial save merges: photos off keeps the switch and the message`,
        pePhotosOff.status === 200 && same(photosOffSection, { ...memoryOn, photos: false }) && coherent(afterPhotosOff), `${pePhotosOff.status} ${JSON.stringify(photosOffSection)}`);
      const beforeBadMemory = await state(pe);
      const longMessage = await savePe({ postEvent: { message: 'x'.repeat(1001) } });
      const badSwitch = await savePe({ postEvent: { enabled: 'yes' } });
      check(`${backend}: I-21 an over-long message and a non-boolean switch are refused before any writer and nothing is written`,
        longMessage.status === 422 && badSwitch.status === 422 && same(await state(pe), beforeBadMemory), `${longMessage.status}/${badSwitch.status}`);
      results[backend].states.push({ config: { postEvent: photosOffSection }, versions: afterPhotosOff.versions, live: [] });
      await sql`insert into media_assets (invitation_id, type, url, source, meta)
        values (${pe}, 'guest-photo', ${`/media/protected/${pe}/${'a'.repeat(24)}.jpg`}, 'guest', ${JSON.stringify({ guestId: 1, review: 'visible' })}::text::jsonb)`;
      const photoRows = async () => JSON.stringify(await sql`select id, type, url, source, meta from media_assets where invitation_id = ${pe} order by id`);
      const photosBefore = await photoRows();
      env.BACKEND_CONTENT = backend;
      let peRestore: Answer;
      try {
        const request = new Request(`http://app.test/api/invitations/${pe}/versions/${beforeMemory}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: pev }) });
        const response = await restoreRoute.POST(request, { params: Promise.resolve({ id: String(pe), versionNo: String(beforeMemory) }) });
        const text = await response.text();
        peRestore = { status: response.status, body: text ? JSON.parse(text) : null };
      } finally {
        delete env.BACKEND_CONTENT;
      }
      const afterPeRestore = await state(pe);
      check(`${backend}: I-21 restoring the version from before the memory removes the section as one new version; the guest photo row stays`,
        peRestore.status === 200 && !('postEvent' in (afterPeRestore.config as object)) && afterPeRestore.versions.length === afterPhotosOff.versions.length + 1
          && coherent(afterPeRestore) && (await photoRows()) === photosBefore,
        `${peRestore.status} ${afterPeRestore.versions.length}`);

      // G-046 through the real restore route, on its own invitation: an older version restored whole through this writer.
      // The config and one new version change; nothing else of the invitation does (guests and their RSVP answers, wishes,
      // orders and payments, gift log, media, members, the invitation's other columns). Event ids are random per run, so
      // the successful answers stay out of the cross-writer comparison; the refusals and id-free states join it.
      const hv = await invitation(owner.id, `g046-${backend}`);
      let hvv = 1;
      const saveH = async (body: Record<string, unknown>) => {
        const answer = await call(backend, 'PATCH', hv, { ...body, expectedVersion: hvv });
        if (answer.status === 200) hvv = answer.body.version;
        return answer;
      };
      const restoreH = async (versionNo: number | string, expectedVersion: unknown): Promise<Answer> => {
        env.BACKEND_CONTENT = backend;
        try {
          const request = new Request(`http://app.test/api/invitations/${hv}/versions/${versionNo}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion }) });
          const response = await restoreRoute.POST(request, { params: Promise.resolve({ id: String(hv), versionNo: String(versionNo) }) });
          const text = await response.text();
          return { status: response.status, body: text ? JSON.parse(text) : null };
        } finally {
          delete env.BACKEND_CONTENT;
        }
      };
      const versionConfig = async (versionNo: number) => (await sql`select config from invitation_versions where invitation_id = ${hv} and version_no = ${versionNo} order by id desc limit 1`)[0].config as Record<string, any>;
      const others = async () => {
        const [{ config: _config, ...invitationRow }] = await sql`select * from invitations where id = ${hv}`;
        return {
          invitation: invitationRow,
          guests: await sql`select * from guests where invitation_id = ${hv} order by id`,
          wishes: await sql`select * from guest_messages where invitation_id = ${hv} order by id`,
          orders: await sql`select * from orders where invitation_id = ${hv} order by id`,
          payments: await sql`select p.* from payments p join orders o on o.id = p.order_id where o.invitation_id = ${hv} order by p.id`,
          gifts: await sql`select * from gift_logs where invitation_id = ${hv} order by id`,
          media: await sql`select * from media_assets where invitation_id = ${hv} order by id`,
          members: await sql`select * from invitation_members where invitation_id = ${hv} order by id`,
        };
      };
      const akadH = { title: 'Akad (fiktif)', startAt: '2027-05-01T09:00:00+07:00' };
      const savedA = await saveH({ settings: { title: 'Versi lama (fiktif)' }, events: [akadH] });
      const versionA = hvv;
      const configA = await versionConfig(versionA);
      const akadId = configA.events[0].id as string;
      const savedB = await saveH({ settings: { title: 'Versi baru (fiktif)' }, quote: { enabled: true, text: 'Hanya di versi baru (fiktif)' },
        events: [{ ...akadH, id: akadId }, { title: 'Resepsi (fiktif)', startAt: '2027-05-01T19:00:00+07:00' }] });
      const versionB = hvv;
      const resepsiId = (await versionConfig(versionB)).events[1].id as string;
      const answersH = { [akadId]: { status: 'CONFIRMED', attending: 2 }, [resepsiId]: { status: 'DECLINED', attending: null } };
      const [guestH] = await sql`insert into guests (invitation_id, name, slug, rsvp_status, guest_count, rsvp_answers, rsvp_event_answers)
        values (${hv}, 'Sari Tamu (fiktif)', ${`sari-tamu-${backend}-${tag}`}, 'CONFIRMED', 2, ${JSON.stringify({ menu: 'vegetarian' })}::text::jsonb, ${JSON.stringify(answersH)}::text::jsonb) returning id`;
      await sql`insert into guest_messages (invitation_id, guest_id, name, message) values (${hv}, ${guestH.id}, 'Sari Tamu (fiktif)', 'Selamat menempuh hidup baru (fiktif)')`;
      const [orderH] = await sql`insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status, paid_at)
        values (${owner.id}, ${hv}, 'standard', 149000, 'IDR', 'qris', ${`vne_g046_${backend}_${tag}`}, 'PAID', now() at time zone 'utc') returning id`;
      created.orders.push(orderH.id);
      await sql`insert into payments (order_id, provider, transaction_id, status) values (${orderH.id}, 'qris', ${`trx_g046_${backend}_${tag}`}, 'PAID')`;
      // G-047 (D-069): a guest passcode on this invitation. Its columns belong to no content writer, so every restore below
      // must leave them as they are (they are inside `others().invitation`, and checked by name after the undo).
      const passcodeH = `scrypt$16384$8$1$${'A'.repeat(22)}$${'B'.repeat(43)}`;
      await sql`update invitations set guest_passcode_hash = ${passcodeH}, guest_passcode_set_at = now() at time zone 'utc' where id = ${hv}`;
      const othersBefore = await others();
      const beforeRefusals = await state(hv);

      const staleH = record(await restoreH(versionA, versionB - 1));
      const currentH = record(await restoreH(versionB, versionB));
      const unknownH = record(await restoreH(versionB + 50, versionB));
      const malformedH = record(await restoreH('abc', versionB));
      const noVersionH = record(await restoreH(versionA, 'v2'));
      env.FLAG_VERSION_HISTORY = 'off';
      const flagOffH = record(await restoreH(versionA, versionB));
      delete env.FLAG_VERSION_HISTORY;
      await signIn(other);
      const intruderH = record(await restoreH(versionA, versionB));
      await signIn(admin);
      const adminH = record(await restoreH(versionA, versionB));
      await signIn(null);
      const anonymousH = record(await restoreH(versionA, versionB));
      await signIn(owner);
      check(`${backend}: G-046 a stale page, the current version, an unknown or malformed one, flag off, another customer, an administrator and a signed-out request restore nothing`,
        savedA.status === 200 && savedB.status === 200 && staleH.status === 409 && staleH.body.error.code === 'VERSION_CONFLICT' && currentH.status === 409 && currentH.body.error.code === 'ALREADY_CURRENT'
          && unknownH.status === 404 && malformedH.status === 400 && noVersionH.status === 400 && flagOffH.status === 404 && intruderH.status === 404 && adminH.status === 403 && anonymousH.status === 401
          && same(await state(hv), beforeRefusals) && same(await others(), othersBefore),
        [staleH, currentH, unknownH, malformedH, noVersionH, flagOffH, intruderH, adminH, anonymousH].map((a) => a.status).join(','));

      const restoredA = await restoreH(versionA, versionB);
      const afterA = await state(hv);
      const configAfterA = afterA.config as Record<string, any>;
      check(`${backend}: G-046 restoring version A stores exactly A's config as a new live version; the newer section and event are gone, the kept event keeps its id`,
        restoredA.status === 200 && restoredA.body.version === versionB + 1 && restoredA.body.restoredFrom === versionA && same(configAfterA, configA)
          && configAfterA.quote === undefined && configAfterA.events.length === 1 && configAfterA.events[0].id === akadId && afterA.versions.length === beforeRefusals.versions.length + 1 && coherent(afterA),
        `${restoredA.status} ${JSON.stringify(restoredA.body?.error ?? restoredA.body?.version)}`);
      const othersAfter = await others();
      check(`${backend}: G-046 the restore changed the config only: guests and RSVP answers, wishes, orders and payments, gift log, media, members and the invitation's other columns are identical`,
        same(othersAfter, othersBefore) && same(othersAfter.guests[0].rsvp_event_answers, answersH), JSON.stringify(Object.keys(othersAfter)));
      const undo = await restoreH(versionB, restoredA.body?.version);
      const afterUndo = await state(hv);
      check(`${backend}: G-046 a restore is itself undone by restoring the version it replaced`,
        undo.status === 200 && same(afterUndo.config, await versionConfig(versionB)) && coherent(afterUndo) && same(await others(), othersBefore), `${undo.status}`);
      results[backend].states.push({ config: { settings: (afterUndo.config as any).settings, quote: (afterUndo.config as any).quote }, versions: afterUndo.versions, live: [] });
      const [passcodeRow] = await sql`select guest_passcode_hash, guest_passcode_set_at from invitations where id = ${hv}`;
      check(`${backend}: G-047 the guest passcode is untouched by restores through this writer (no content writer writes its columns)`,
        passcodeRow.guest_passcode_hash === passcodeH && passcodeRow.guest_passcode_set_at !== null, String(passcodeRow.guest_passcode_hash).slice(0, 12));

      // G-046 on versions written under earlier rules, added as rows under version A's number (rows written before B-035's
      // lock could repeat a number): a restore reads the latest row of a number. A restore replaces every section, so the
      // strict schema (422), D-040 (another invitation's protected image) and B-041 (a Premium palette on this Standard
      // invitation) judge all of them, and each refusal writes nothing.
      const liveAfterUndo = undo.body?.version as number;
      const legacyRow = async (config: Record<string, unknown>) => {
        await sql`insert into invitation_versions (invitation_id, version_no, config, created_by, is_live)
          values (${hv}, ${versionA}, ${JSON.stringify(config)}::text::jsonb, 'customer', false)`;
      };
      const refusedLegacy = async (config: Record<string, unknown>) => {
        await legacyRow(config);
        const before = { state: await state(hv), others: await others() };
        const answer = record(await restoreH(versionA, liveAfterUndo));
        return { answer, unchanged: same(await state(hv), before.state) && same(await others(), before.others) };
      };
      const unrestorable = await refusedLegacy({ ...configA, gift: 'tidak sah (fiktif)' });
      const foreignMedia = await refusedLegacy({ ...configA, gift: { ...(configA.gift ?? {}), enabled: true, qrisImageUrl: `/media/protected/${id}/${HEX}.png` } });
      const premiumTheme = await refusedLegacy({ ...configA, theme: { ...(configA.theme ?? {}), paletteId: 'midnight' } });
      check(`${backend}: G-046 an older version today's rules refuse is never restored and nothing is written: an unreadable section (422), another invitation's protected image (D-040) and a Premium palette on this Standard invitation (B-041)`,
        unrestorable.answer.status === 422 && unrestorable.answer.body.error.code === 'UNRESTORABLE' && unrestorable.unchanged
          && foreignMedia.answer.status === 400 && foreignMedia.answer.body.error.code === 'INVALID_MEDIA' && foreignMedia.unchanged
          && premiumTheme.answer.status === 403 && premiumTheme.answer.body.error.code === 'THEME_NOT_ENTITLED'
          && same(premiumTheme.answer.body.error.details, [{ path: 'theme.paletteId', reason: 'premium-palette' }]) && premiumTheme.unchanged,
        [unrestorable, foreignMedia, premiumTheme].map((r) => `${r.answer.status} ${r.answer.body?.error?.code}${r.unchanged ? '' : ' WROTE'}`).join(', '));

      // The latest row of a repeated number is that version: restoring A now stores it as one new live version, and the
      // history, in keyset pages of two, lists every number once, newest first, by that row, down to version 1.
      const latestA = { ...configA, settings: { ...(configA.settings ?? {}), title: 'Baris terakhir versi A (fiktif)' } };
      await legacyRow(latestA);
      const othersBeforeLatest = await others();
      const restoredLatest = await restoreH(versionA, liveAfterUndo);
      const afterLatest = await state(hv);
      check(`${backend}: G-046 a version number written more than once restores its latest row as one new live version, and the kept event keeps its id`,
        restoredLatest.status === 200 && restoredLatest.body.version === liveAfterUndo + 1 && (afterLatest.config as any).settings?.title === latestA.settings.title
          && same((afterLatest.config as any).events.map((event: { id: string }) => event.id), [akadId]) && coherent(afterLatest) && same(await others(), othersBeforeLatest),
        `${restoredLatest.status} ${JSON.stringify(restoredLatest.body?.error ?? restoredLatest.body?.version)}`);
      const pages: number[][] = [];
      const listed: Array<{ versionNo: number; config: unknown }> = [];
      let cursor: number | undefined;
      for (let page = 0; page < 20; page++) {
        const history = await loadVersionHistory(hv, owner.id, { before: cursor, limit: 2 });
        if (!history) break;
        pages.push(history.versions.map((version) => version.versionNo));
        listed.push(...history.versions);
        if (!history.more) break;
        cursor = history.versions.at(-1)?.versionNo;
      }
      const numbers = (await sql`select distinct version_no from invitation_versions where invitation_id = ${hv} order by version_no desc`).map((row) => row.version_no as number);
      const listedA = listed.find((version) => version.versionNo === versionA)?.config as { settings?: { title?: string } } | undefined;
      check(`${backend}: G-046 the history pages through every version once, newest first, each number by its latest row, down to version 1; another customer sees none`,
        same(listed.map((version) => version.versionNo), numbers) && numbers.at(-1) === 1 && pages.every((page) => page.length > 0 && page.length <= 2)
          && listedA?.settings?.title === latestA.settings.title && (await loadVersionHistory(hv, other.id, { limit: 2 })) === null,
        JSON.stringify(pages));
      results[backend].answers.push(JSON.stringify(pages));

      await signIn(other);
      const intruder = record(await call(backend, 'PATCH', id, { quote: { ...quote, text: 'Bukan milikmu' }, expectedVersion: 4 }));
      const peek = record(await call(backend, 'GET', id));
      await signIn(admin);
      const administrator = record(await call(backend, 'PATCH', id, { quote: { ...quote, text: 'Admin' }, expectedVersion: 4 }));
      await signIn(null);
      const anonymous = record(await call(backend, 'PATCH', id, { quote: { ...quote, text: 'Anonim' }, expectedVersion: 4 }));
      const afterRefusals = await state(id);
      check(`${backend}: another customer gets "not found", an administrator and a signed-out request are refused, nothing is written`,
        intruder.status === 404 && peek.status === 404 && administrator.status === 403 && anonymous.status === 401 && afterRefusals.versions.length === 5 && (afterRefusals.config as any).quote.text === 'Tanpa versi');
      results[backend].states.push(afterRefusals);
    }

    check('both writers give the same answers, step by step', same(results.next.answers, results.rust.answers),
      results.next.answers.map((answer, i) => (answer === results.rust.answers[i] ? '' : `#${i}: ${answer} ≠ ${results.rust.answers[i]}`)).filter(Boolean).join('; ').slice(0, 400));
    check('both writers store the same rows', same(results.next.states, results.rust.states));

    // The Rust writer's lost answers.
    await signIn(owner);
    const lost = await invitation(owner.id, 'lost');
    const once = proxy(['forward-drop']);
    const onceUrl = await listen(once.handler);
    const replayed = await call('rust', 'PATCH', lost, { quote: { enabled: true, text: 'Sekali' }, expectedVersion: 1 }, onceUrl);
    const afterOnce = await state(lost);
    check('rust: a lost answer is retried under its key and replayed, written once, never a conflict',
      replayed.status === 200 && replayed.body.version === 2 && once.seen.length === 2 && once.seen[0].key === once.seen[1].key && once.seen[1].replayed === 'true' && same(afterOnce.versions, [[1, false], [2, true]]),
      JSON.stringify(once.seen.map((s) => [s.status, s.replayed])));
    const twice = proxy(['forward-drop', 'forward-drop']);
    const twiceUrl = await listen(twice.handler);
    const unconfirmed = await call('rust', 'PATCH', lost, { quote: { enabled: true, text: 'Dua kali hilang' }, expectedVersion: 2 }, twiceUrl);
    const next = await call('rust', 'PATCH', lost, { quote: { enabled: true, text: 'Dari versi lama' }, expectedVersion: 2 });
    const afterTwice = await state(lost);
    check('rust: two lost answers report "unconfirmed"; the write committed once and the next save from the old version meets the conflict',
      unconfirmed.status === 503 && unconfirmed.body.error.code === 'SAVE_UNCONFIRMED' && afterTwice.versions.length === 3 && next.status === 409 && next.body.error.details.currentVersion === 3,
      `${unconfirmed.status} ${next.status}`);

    // Exactly one writer per call.
    const down = await call('rust', 'PATCH', lost, { quote: { enabled: true, text: 'API mati' }, expectedVersion: 3 }, 'http://127.0.0.1:9');
    check('rust with the API down writes nothing and never falls back to the TypeScript writer', down.status === 503 && (await state(lost)).versions.length === 3);
    const counter = proxy([]);
    const counterUrl = await listen(counter.handler);
    const viaNext = await call('next', 'PATCH', lost, { quote: { enabled: true, text: 'Lewat next' }, expectedVersion: 3 }, counterUrl);
    check('next never calls the API', viaNext.status === 200 && viaNext.body.version === 4 && counter.seen.length === 0);
    const flips: Answer[] = [];
    for (const [i, backend] of (['rust', 'next', 'rust'] as const).entries()) {
      flips.push(await call(backend, 'PATCH', lost, { quote: { enabled: true, text: `Balik ${i}` }, expectedVersion: 4 + i }));
    }
    const afterFlips = await state(lost);
    check('flipping BACKEND_CONTENT back and forth keeps one version sequence and one live row',
      flips.map((f) => f.body?.version).join() === '5,6,7' && afterFlips.versions.map(([n]) => n).join() === '1,2,3,4,5,6,7' && coherent(afterFlips) && (afterFlips.config as any).quote.text === 'Balik 2');
  } finally {
    const ids = created.invitations;
    await sql`delete from guest_messages where invitation_id = any(${ids}::int[])`;
    await sql`delete from guests where invitation_id = any(${ids}::int[])`;
    await sql`delete from payments where order_id = any(${created.orders}::int[])`;
    await sql`delete from orders where id = any(${created.orders}::int[])`;
    await sql`delete from invitation_versions where invitation_id = any(${ids}::int[])`;
    // I-21's planted guest photo is a media row; it goes before its invitation (the foreign key refuses otherwise).
    await sql`delete from media_assets where invitation_id = any(${ids}::int[])`;
    await sql`delete from invitations where id = any(${ids}::int[])`;
    await sql`delete from users where id = any(${created.users}::int[])`;
    await sql`delete from api_idempotency_keys where scope like 'content:%' and (string_to_array(scope, ':'))[3] = any(${ids.map(String)}::text[])`;
    const [left] = await sql`select (select count(*) from invitations where id = any(${ids}::int[]))::int as invitations,
      (select count(*) from users where clerk_user_id like ${`user_contentapi_%_${tag}`})::int as users,
      (select count(*) from api_idempotency_keys where scope like 'content:%' and (string_to_array(scope, ':'))[3] = any(${ids.map(String)}::text[]))::int as keys,
      (select count(*) from orders where id = any(${created.orders}::int[]))::int as orders,
      (select count(*) from guests where invitation_id = any(${ids}::int[]))::int as guests,
      (select count(*) from media_assets where invitation_id = any(${ids}::int[]))::int as media`;
    check('the fixture leaves no row behind',
      left.invitations === 0 && left.users === 0 && left.keys === 0 && left.orders === 0 && left.guests === 0 && left.media === 0, JSON.stringify(left));
    for (const server of servers) server.close();
    await sql.end();
  }
  console.log(failures ? `verify-content-api: ${failures} FAILED, ${passes} passed` : `verify-content-api: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
