/**
 * B-037 + I-08 end to end (D-055): the wizard's server actions (`app/buat/actions.ts`: the typed preview's update, the save,
 * the save after signing in) and the catalog's creation path through both content writers, against a running Rust API and
 * a scratch database, through the typed client and the service signature. Only Next.js's request primitives (a cookie jar
 * stands in for the browser's) and Clerk's session are stubbed.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     npx tsx scripts/verify-creation-api.ts
 *
 * It proves, through each writer: typing stores nothing on the server (the content is in the visitor's cookie only); a
 * signed-out save keeps the content and sends the visitor to sign in with the way back; after signing in, the save makes
 * exactly one DRAFT for the signed-in owner with the purchased theme row, the event type, the new-invitation defaults,
 * the typed names and date, version 1 and the draft key, and clears the cookie; a lost answer resent with the same key, a
 * double tap and two concurrent saves all find that one draft, and so do saves queued behind a signed-in save after it
 * cleared the cookie (they carry only the wizard's key: s33's browser defect); a save without a valid key is refused;
 * a Premium theme is created on its Premium row; hostile,
 * right-to-left and long names are stored as text and render escaped; the trial preview equals the owner preview of the
 * stored draft; an administrator is refused. Across writers: the same stored rows, and a key used through one writer
 * finds its draft through the other. Exactly one writer per call: with the API down under `rust` nothing is written and
 * the outcome is "unconfirmed", and `next` never calls it. Flag off: the wizard's actions refuse. Fixture rows are
 * fictional, tagged per run and removed.
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
const jar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string, options?: { maxAge?: number }) => {
    if (options?.maxAge === 0 || value === '') jar.delete(name);
    else jar.set(name, value);
  },
};
const stubs: Record<string, unknown> = {
  'server-only': {},
  'next/navigation': { redirect: (url: string) => { throw new Error(`redirect ${url}`); }, notFound: () => { throw new Error('notFound'); } },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/headers': { headers: async () => new Headers(), cookies: async () => cookieStore },
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
const DOWN = 'http://127.0.0.1:9';

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

/** Renders with the clock held at `fixed`, so two renders differ only by what they are given (the countdown reads the time). */
function atFixedTime<T>(fixed: number, render: () => T): T {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [fixed]) as [number]));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  try {
    return render();
  } finally {
    globalThis.Date = RealDate;
  }
}

type Backend = 'next' | 'rust';

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const actions = await import('../app/buat/actions');
  const { createDraftInvitation, prepareDraftRequest } = await import('../lib/invitation/creation');
  const { getTemplateRowBySlug } = await import('../lib/invitation/template-sync');
  const { getTemplateBySlug } = await import('../lib/invitation/templates');
  const { decodeTrialState, initialDraftConfig } = await import('../lib/invitation/trial');
  const { trialPreviewProps } = await import('../lib/invitation/trial-preview');
  const { loadPublicInvitation } = await import('../lib/invitation/public');
  const { PublicInvitationRenderer } = await import('../components/invitation/public-renderer');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 10);
  const created = { users: [] as number[] };

  async function user(name: string, role: 'CUSTOMER' | 'ADMIN') {
    const clerk = `user_creationapi_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role) values (${`creation-api-${name}-${tag}@example.invalid`}, ${clerk}, ${role}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  const draftsOf = async (owner: number) =>
    sql`select id, slug, template_id, event_type, status, creation_key, config from invitations where user_id = ${owner} order by id`;
  const versionsOf = async (id: number) => sql`select version_no, is_live, config from invitation_versions where invitation_id = ${id} order by version_no, id`;
  const invitationCount = async () => Number((await sql`select count(*)::int as n from invitations`)[0].n);

  // Owner tokens: RS256 keys served as the API's JWKS, from the key file the other acceptance scripts share for this API
  // instance (named by a hash of its secret): the API refetches its JWKS for an unknown `kid` at most once per 30 s.
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `creation-api-${tag}`;
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

  /** Runs a server action under a writer; a redirect is an answer, not a failure. */
  async function act<T>(backend: Backend, run: () => Promise<T>, apiBase = API): Promise<{ result?: T; redirect?: string }> {
    env.BACKEND_CONTENT = backend;
    env.API_BASE_URL = apiBase;
    try {
      return { result: await run() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('redirect ')) return { redirect: message.slice('redirect '.length) };
      throw error;
    } finally {
      delete env.BACKEND_CONTENT;
      env.API_BASE_URL = API;
    }
  }
  const editorId = (redirect?: string) => Number(/^\/dashboard\/invitations\/(\d+)\/edit$/.exec(redirect ?? '')?.[1] ?? NaN);
  const values = (slug: string, first: string, second: string) => ({ slug, first, second, date: '2027-02-14', time: '10:30', zone: 'Asia/Makassar' as const });
  /** The owner preview of a stored draft exactly as `/preview/[id]` renders it, and its row as the renderer receives it. */
  const ownerPreview = async (slug: string, at: number) => {
    const data = await loadPublicInvitation(slug, undefined, true);
    if (!data) return { html: '', invitation: null };
    const html = atFixedTime(at, () =>
      renderToStaticMarkup(
        createElement(PublicInvitationRenderer, {
          invitation: data.invitation, config: data.config, guest: null, preview: true, media: data.media, messages: data.messages,
          totalMessages: data.totalMessages, hiddenMessageCount: data.hiddenMessageCount, readOnly: data.readOnly, status: {}, imageVariants: data.imageVariants,
        }),
      ),
    );
    return { html, invitation: data.invitation };
  };

  env.FLAG_CREATION_WIZARD = 'on';
  const owner = await user('owner', 'CUSTOMER');
  const other = await user('other', 'CUSTOMER');
  const admin = await user('admin', 'ADMIN');
  const sage = getTemplateBySlug('sage-garden')!;
  const ivory = getTemplateBySlug('eternal-ivory')!;

  try {
    const rows: Record<Backend, unknown[]> = { next: [], rust: [] };
    for (const backend of ['next', 'rust'] as const) {
      jar.clear();
      await signIn(null);
      const typed = values(sage.slug, `Sari ${backend} ${tag}`, 'Budi');
      const wizardKey = randomUUID();

      const before = await invitationCount();
      const update = await act(backend, () => actions.updateTrial(typed, wizardKey));
      const state = decodeTrialState(jar.get('inv_trial'));
      check(`${backend}: typing updates the preview and stores nothing on the server`,
        update.result?.ok === true && (await invitationCount()) === before && state?.first === typed.first && state?.key === wizardKey);

      const signedOut = await act(backend, () => actions.saveTrial(typed, wizardKey));
      check(`${backend}: a signed-out save keeps the content and asks to sign in with the way back`,
        signedOut.redirect === '/sign-in?redirect_url=%2Fbuat%2Fsimpan' && decodeTrialState(jar.get('inv_trial'))?.key === state?.key && (await invitationCount()) === before);

      await signIn(owner);
      const kept = jar.get('inv_trial') as string;
      const saved = await act(backend, () => actions.confirmTrialSave());
      const id = editorId(saved.redirect);
      check(`${backend}: after signing in, the save creates the draft and opens the editor`, Number.isInteger(id), saved.redirect);
      check(`${backend}: the cookie is cleared after the save`, !jar.has('inv_trial'));

      const [draft] = await sql`select id, user_id, slug, template_id, event_type, status, creation_key, config from invitations where id = ${id}`;
      const templateRow = await getTemplateRowBySlug(sage.slug);
      const expected = initialDraftConfig(templateRow?.defaultConfig, 'wedding', { input: typed, key: state!.key }).config;
      const versions = await versionsOf(id);
      check(`${backend}: the draft is the owner's, on the purchased theme row, a DRAFT wedding with the draft key`,
        draft?.user_id === owner.id && draft.template_id === templateRow?.id && draft.event_type === 'wedding' && draft.status === 'DRAFT' && draft.creation_key === state!.key);
      check(`${backend}: the stored config is the preview's (defaults, names, date)`, same(draft?.config, expected),
        `${(draft?.config as { couple?: { bride?: { nickName?: string } } })?.couple?.bride?.nickName}`);
      check(`${backend}: version 1, live, with the same config`, versions.length === 1 && versions[0].version_no === 1 && versions[0].is_live === true && same(versions[0].config, draft?.config));
      check(`${backend}: the slug comes from the typed names`, String(draft?.slug).startsWith(`sari-${backend}-${tag}-budi`), draft?.slug);
      rows[backend].push(sorted({ template: draft?.template_id, type: draft?.event_type, status: draft?.status, config: draft?.config === null ? null : 'set', versions: versions.length }));

      // A lost answer: the browser still holds the cookie and saves again; a double tap; two concurrent saves.
      jar.set('inv_trial', kept);
      const again = await act(backend, () => actions.confirmTrialSave());
      jar.set('inv_trial', kept);
      const [a, b] = await Promise.all([act(backend, () => actions.confirmTrialSave()), act(backend, () => actions.confirmTrialSave())]);
      const keyed = await sql`select id from invitations where user_id = ${owner.id} and creation_key = ${state!.key}`;
      check(`${backend}: a resend, a double tap and concurrent saves find the one draft`,
        editorId(again.redirect) === id && editorId(a.redirect) === id && editorId(b.redirect) === id && keyed.length === 1);

      const at = Date.now();
      const owned = await ownerPreview(draft?.slug as string, at);
      const trialHtml = owned.invitation
        ? atFixedTime(at, () => renderToStaticMarkup(createElement(PublicInvitationRenderer, trialPreviewProps(owned.invitation, expected))))
        : '';
      check(`${backend}: the trial preview equals the owner preview of the stored draft`, trialHtml.length > 1000 && trialHtml === owned.html, `${trialHtml.length} / ${owned.html.length}`);

      // Hostile, right-to-left and long names: stored as text, rendered escaped.
      jar.clear();
      const hostile = values(sage.slug, '<script>alert(1)</script>', `"><img src=x onerror=alert(1)> ${tag}`);
      await act(backend, () => actions.updateTrial(hostile, randomUUID()));
      const hostileId = editorId((await act(backend, () => actions.confirmTrialSave())).redirect);
      const [hostileRow] = await sql`select slug, config from invitations where id = ${hostileId}`;
      const hostileHtml = (await ownerPreview(hostileRow.slug, Date.now())).html;
      check(`${backend}: hostile names are stored verbatim and render escaped`,
        (hostileRow.config as { couple: { bride: { nickName: string } } }).couple.bride.nickName === '<script>alert(1)</script>' &&
          !hostileHtml.includes('<script>alert(1)') && !/<img[^>]*onerror=/i.test(hostileHtml) && hostileHtml.includes('&lt;script&gt;'),
        hostileRow.slug);
      jar.clear();
      const rtl = values(sage.slug, 'سارة', `محمد ${'ن'.repeat(40)}`);
      await act(backend, () => actions.updateTrial(rtl, randomUUID()));
      const rtlId = editorId((await act(backend, () => actions.confirmTrialSave())).redirect);
      const [rtlRow] = await sql`select slug, config from invitations where id = ${rtlId}`;
      check(`${backend}: right-to-left and long names are stored intact; the slug falls back to the theme name`,
        (rtlRow.config as { couple: { groom: { nickName: string } } }).couple.groom.nickName === rtl.second && String(rtlRow.slug).startsWith('sage-garden'), rtlRow.slug);

      // A Premium theme is created on its Premium row (the price anchor of checkout).
      jar.clear();
      await act(backend, () => actions.updateTrial(values(ivory.slug, `Alya ${backend} ${tag}`, 'Raka'), randomUUID()));
      const premiumId = editorId((await act(backend, () => actions.confirmTrialSave())).redirect);
      const [premiumRow] = await sql`select i.config, t.is_premium from invitations i join templates t on t.id = i.template_id where i.id = ${premiumId}`;
      check(`${backend}: a Premium theme is created on its Premium row with its catalog id`,
        premiumRow?.is_premium === true && (premiumRow.config as { theme: { templateId: number } }).theme.templateId === ivory.id);

      // s33's browser defect at the action level: signed in, the wizard saves directly; taps queued behind that save
      // arrive after it cleared the cookie and carry only the wizard's key. They must find its draft, not mint new ones.
      jar.clear();
      const tapKey = randomUUID();
      const tapped = values(sage.slug, `Tap ${backend} ${tag}`, 'Tiga');
      const firstTap = await act(backend, () => actions.saveTrial(tapped, tapKey));
      const clearedByFirst = !jar.has('inv_trial');
      const queued = [await act(backend, () => actions.saveTrial(tapped, tapKey)), await act(backend, () => actions.saveTrial(tapped, tapKey))];
      const tappedRows = await sql`select id from invitations where user_id = ${owner.id} and creation_key = ${tapKey}`;
      check(`${backend}: signed in, saves queued behind the first (its cookie cleared) carry the wizard's key and find the one draft`,
        clearedByFirst && Number.isInteger(editorId(firstTap.redirect)) && queued.every((tap) => editorId(tap.redirect) === editorId(firstTap.redirect)) && tappedRows.length === 1,
        `${tappedRows.length} row(s)`);
    }
    check('both writers store the same rows', same(rows.next, rows.rust));

    // A key used through one writer finds its draft through the other (the key is on the row, not in either writer).
    jar.clear();
    await signIn(other);
    await act('next', () => actions.updateTrial(values(sage.slug, `Lintas ${tag}`, 'Writer'), randomUUID()));
    const crossKept = jar.get('inv_trial') as string;
    const viaNext = editorId((await act('next', () => actions.confirmTrialSave())).redirect);
    jar.set('inv_trial', crossKept);
    const viaRust = editorId((await act('rust', () => actions.confirmTrialSave())).redirect);
    check('a key used through the TypeScript writer finds its draft through the Rust writer', Number.isInteger(viaNext) && viaNext === viaRust);

    // Another owner holding the same cookie gets a draft of their own, never the first owner's.
    jar.set('inv_trial', crossKept);
    await signIn(owner);
    const ownersOwn = editorId((await act('rust', () => actions.confirmTrialSave())).redirect);
    check("a key is scoped to its owner: another owner's save makes their own draft", Number.isInteger(ownersOwn) && ownersOwn !== viaNext);

    // Exactly one writer: the API down under `rust` writes nothing and reports "unconfirmed"; `next` never calls it.
    jar.clear();
    await act('next', () => actions.updateTrial(values(sage.slug, `Mati ${tag}`, 'Api'), randomUUID()));
    const downKept = jar.get('inv_trial') as string;
    const countBefore = (await draftsOf(owner.id)).length;
    const down = await act('rust', () => actions.confirmTrialSave(), DOWN);
    check('rust with the API down: nothing written, "unconfirmed", the content kept',
      down.result?.ok === false && /belum terkonfirmasi/.test(down.result.message ?? '') && (await draftsOf(owner.id)).length === countBefore && jar.get('inv_trial') === downKept);
    const viaNextDown = await act('next', () => actions.confirmTrialSave(), DOWN);
    check('next with the API down creates the draft without calling it', Number.isInteger(editorId(viaNextDown.redirect)));

    // An administrator is refused; the flag off refuses the wizard's actions.
    jar.clear();
    await signIn(admin);
    const adminSave = await act('next', () => actions.saveTrial(values(sage.slug, `Admin ${tag}`, 'X'), randomUUID()));
    check('an administrator is refused and nothing is written', adminSave.result?.ok === false && (await draftsOf(admin.id)).length === 0);
    jar.clear();
    await signIn(owner);
    const ownerDrafts = (await draftsOf(owner.id)).length;
    const keyless = await act('next', () => actions.saveTrial(values(sage.slug, `Kunci ${tag}`, 'Hilang'), 'not-a-key'));
    check('a save without a valid draft key is refused: no cookie, nothing written',
      keyless.result?.ok === false && !jar.has('inv_trial') && (await draftsOf(owner.id)).length === ownerDrafts);
    env.FLAG_CREATION_WIZARD = 'off';
    jar.clear();
    const off = await act('next', () => actions.updateTrial(values(sage.slug, 'Flag', 'Off'), randomUUID()));
    check('flag off: the wizard refuses and sets no cookie', off.result?.ok === false && !jar.has('inv_trial'));
    env.FLAG_CREATION_WIZARD = 'on';

    // The catalog's creation path without the wizard (flag off): an empty draft from the theme, version 1, a key.
    await signIn(owner);
    for (const backend of ['next', 'rust'] as const) {
      const row = await getTemplateRowBySlug(sage.slug);
      env.BACKEND_CONTENT = backend;
      const outcome = await createDraftInvitation({ userId: owner.id, ownerToken: async () => session.token }, { eventType: 'wedding', template: row, title: row!.name });
      delete env.BACKEND_CONTENT;
      const plain = outcome.kind === 'created' ? (await sql`select config, creation_key from invitations where id = ${outcome.invitationId}`)[0] : null;
      const expectedPlain = prepareDraftRequest({ eventType: 'wedding', template: row, title: row!.name }).config;
      check(`${backend}: the catalog path creates an empty draft from the theme with version 1 and a key`,
        outcome.kind === 'created' && same(plain?.config, expectedPlain) && typeof plain?.creation_key === 'string' && (await versionsOf(outcome.invitationId)).length === 1);
    }

    // B-032 (G-060, I-13): a memorial theme through the wizard and the catalog path on both writers. Both store the
    // occasion with the countdown, music and gift off; with F-02 on they start on Gapura, and the wizard stores the one
    // remembered under a sober first event. A celebration on the same core event type (tasyakuran) is created exactly as
    // before: no occasion, no countdown switch, its own family. With F-02 off no family is chosen, as for every theme.
    type Created = { settings?: { occasion?: string; countdown?: boolean }; music?: { enabled?: boolean }; gift?: { enabled?: boolean }; theme?: { familyId?: string }; events?: Array<{ title?: string }>; ceremonyProfile?: { nickName?: string } } | null;
    const sober = (c: Created) => c?.settings?.occasion === 'memorial' && c.settings.countdown === false && c.music?.enabled === false && c.gift?.enabled === false;
    const shape = (c: Created) => ({ occasion: c?.settings?.occasion ?? null, countdown: c?.settings?.countdown ?? null, music: c?.music?.enabled ?? null, gift: c?.gift?.enabled ?? null, family: c?.theme?.familyId ?? null, first: c?.events?.[0]?.title ?? null });
    const configOf = async (outcome: Awaited<ReturnType<typeof createDraftInvitation>>) =>
      outcome.kind === 'created' ? ((await sql`select config from invitations where id = ${outcome.invitationId}`)[0].config as Created) : null;
    const memorialRow = await getTemplateRowBySlug('doa-khusyuk');
    const celebrationRow = await getTemplateRowBySlug('syukur-hangat');
    const memorialRows: Record<Backend, unknown[]> = { next: [], rust: [] };
    await signIn(owner);
    try {
      for (const backend of ['next', 'rust'] as const) {
        env.FLAG_DEFAULT_FAMILY = 'on';
        jar.clear();
        const remembered = values('doa-khusyuk', `Alm. Soedirman ${backend} ${tag}`, '');
        await act(backend, () => actions.updateTrial(remembered, randomUUID()));
        const trial = decodeTrialState(jar.get('inv_trial'));
        const wizardId = editorId((await act(backend, () => actions.confirmTrialSave())).redirect);
        const [wizardRow] = await sql`select event_type, config from invitations where id = ${wizardId}`;
        const wizardConfig = (wizardRow?.config ?? null) as Created;
        const expectedMemorial = initialDraftConfig(memorialRow?.defaultConfig, 'tasyakuran', { input: remembered, key: trial!.key }).config;
        check(`${backend}: B-032 the wizard creates a memorial from the one remembered: the preview's config, sober, on Gapura, under a sober first event`,
          wizardRow?.event_type === 'tasyakuran' && same(wizardConfig, expectedMemorial) && sober(wizardConfig) && wizardConfig?.theme?.familyId === 'gapura'
            && wizardConfig?.events?.[0]?.title === 'Tahlilan & Doa Bersama' && wizardConfig?.ceremonyProfile?.nickName === remembered.first,
          JSON.stringify({ type: wizardRow?.event_type, ...shape(wizardConfig) }));

        env.BACKEND_CONTENT = backend;
        const create = (row: typeof memorialRow) => createDraftInvitation({ userId: owner.id, ownerToken: async () => session.token }, { eventType: 'tasyakuran', template: row, title: row!.name });
        const catalog = await create(memorialRow);
        const celebration = await create(celebrationRow);
        env.FLAG_DEFAULT_FAMILY = 'off';
        const catalogOff = await create(memorialRow);
        delete env.BACKEND_CONTENT;
        const catalogConfig = await configOf(catalog);
        const celebrationConfig = await configOf(celebration);
        const catalogOffConfig = await configOf(catalogOff);
        env.FLAG_DEFAULT_FAMILY = 'on';
        const requestFor = (row: typeof memorialRow) => prepareDraftRequest({ eventType: 'tasyakuran', template: row, title: row!.name }).config;
        check(`${backend}: B-032 the catalog path creates the memorial's sober draft on Gapura, the creation request's config exactly`,
          same(catalogConfig, requestFor(memorialRow)) && sober(catalogConfig) && catalogConfig?.theme?.familyId === 'gapura', JSON.stringify(shape(catalogConfig)));
        check(`${backend}: B-032 a celebration on the same event type is created as before: no occasion, no countdown switch, Riang`,
          same(celebrationConfig, requestFor(celebrationRow)) && celebrationConfig?.settings?.occasion === undefined && celebrationConfig?.settings?.countdown === undefined
            && celebrationConfig?.theme?.familyId === 'riang',
          JSON.stringify(shape(celebrationConfig)));
        env.FLAG_DEFAULT_FAMILY = 'off';
        const offRequest = requestFor(memorialRow);
        env.FLAG_DEFAULT_FAMILY = 'on';
        check(`${backend}: B-032 with F-02 off the memorial stays sober and no family is chosen for it`,
          same(catalogOffConfig, offRequest) && sober(catalogOffConfig) && catalogOffConfig?.theme?.familyId === undefined, JSON.stringify(shape(catalogOffConfig)));
        memorialRows[backend].push(sorted({ wizard: shape(wizardConfig), catalog: shape(catalogConfig), celebration: shape(celebrationConfig), off: shape(catalogOffConfig) }));
      }
      check('B-032: both writers create the same memorial and celebration drafts', same(memorialRows.next, memorialRows.rust), JSON.stringify(memorialRows).slice(0, 400));
    } finally {
      delete env.FLAG_DEFAULT_FAMILY;
    }
  } finally {
    await sql`delete from invitation_versions where invitation_id in (select id from invitations where user_id = any(${created.users}))`;
    await sql`delete from invitations where user_id = any(${created.users})`;
    await sql`delete from users where id = any(${created.users})`;
    for (const server of servers) server.close();
    await sql.end({ timeout: 5 });
  }

  console.log(failures ? `verify-creation-api: ${failures} of ${passes + failures} checks FAILED` : `verify-creation-api: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
