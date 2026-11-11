/**
 * Host replay isolation (s29, before any Rust rollout): an `Idempotency-Key` recorded by a host's successful write
 * replays only to the same authorized owner, on the same invitation and the same guest or wish. Requests carry the real
 * service signature and valid owner tokens (RS256, served as a JWKS by this script; no Clerk credential) and go straight
 * to the running API with chosen keys, as any holder of the service secret could send them. The dashboard mints a random
 * key per host action, so isolation must not depend on keys staying secret.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… OWNER_TOKEN_JWKS_PORT=8091 \
 *     OWNER_TOKEN_ISSUER=https://clerk.invitesion.test OWNER_TOKEN_AUTHORIZED_PARTIES=http://127.0.0.1:3100 \
 *     npx tsx scripts/verify-host-replay-isolation.ts
 *
 * The API must run with the same OWNER_TOKEN_* values; scripts/ci/rust.sh starts it so. The owner-token key pair is the
 * one verify-rsvp-api.ts keeps for the same API instance (the API refetches its JWKS for an unknown `kid` at most once per
 * 30 s). Fixture rows are fictional, tagged per run and removed.
 *
 * For the RSVP override, wish moderation and wish reply it proves: after the owner's successful write under a key, the
 * same key with the same body is refused (404, no replay, no cached answer) for another customer, under that customer's
 * invitation and under the owner's other invitation; another customer's changed body is the same 404, never
 * `idempotency.key_reused`; no refusal changes a row, adds an analytics row or records a key; the owner's own retry
 * replays the committed answer (`Idempotent-Replayed: true`) without writing again. After a delete whose answer is lost,
 * the owner's retry replays the deletion, and every other reuse of its key is refused.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JWK } from 'jose';
import { SIGNATURE_HEADER, signServiceRequest } from '../lib/api/signature';

const env = process.env;
function need(name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} must be set (see the header of this script)`);
  return value;
}
const API = need('API_BASE_URL').replace(/\/+$/, '');
const SECRET = need('INTERNAL_API_SECRET');
const JWKS_PORT = Number(need('OWNER_TOKEN_JWKS_PORT'));
const ISSUER = need('OWNER_TOKEN_ISSUER');
const AZP = need('OWNER_TOKEN_AUTHORIZED_PARTIES').split(',')[0].trim();

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}
/** A replayed answer comes back from jsonb, which reorders keys; compare answers by content. */
function canonical(raw: string): string {
  try {
    return JSON.stringify(sortKeys(JSON.parse(raw)));
  } catch {
    return raw;
  }
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
const FORWARDED = ['content-type', 'accept', 'x-invitesion-signature', 'idempotency-key', 'authorization'];
/** Forwards one request to the API, lets it commit, then cuts the connection before the answer reaches the caller. */
function dropAnswer() {
  const seen: number[] = [];
  const handler: http.RequestListener = async (req) => {
    const body = await bodyOf(req);
    const headers: Record<string, string> = {};
    for (const name of FORWARDED) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name] as string;
    const upstream = await fetch(`${API}${req.url}`, { method: 'POST', headers, body });
    await upstream.text();
    seen.push(upstream.status);
    req.socket.destroy();
  };
  return { seen, handler };
}

type Answer = { status: number; replayed: string | null; code: string | null; raw: string };
async function post(path: string, body: unknown, token: string, key: string, base = API): Promise<Answer> {
  const text = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        'content-type': 'application/json',
        [SIGNATURE_HEADER]: signServiceRequest(SECRET, Math.floor(Date.now() / 1000), 'POST', path, text),
        authorization: `Bearer ${token}`,
        'idempotency-key': key,
      },
      body: text,
    });
  } catch {
    return { status: 0, replayed: null, code: 'transport.lost', raw: '' };
  }
  const raw = await response.text();
  let code: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { code?: unknown };
    if (typeof parsed.code === 'string') code = parsed.code;
  } catch {
    // A non-JSON body keeps no code; the checks then fail on it.
  }
  return { status: response.status, replayed: response.headers.get('idempotent-replayed'), code, raw };
}

const overridePath = (invitation: number, guest: number) => `/v1/invitations/${invitation}/guests/${guest}/rsvp-override`;
const moderationPath = (invitation: number, wish: number) => `/v1/invitations/${invitation}/wishes/${wish}/moderation`;
const replyPath = (invitation: number, wish: number) => `/v1/invitations/${invitation}/wishes/${wish}/reply`;
const RSVP_FLAGS = { perEvent: false, inviteOnlyEvents: false };

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const jose = await import('jose');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const keyOf = (name: string) => `replay-${tag}-${name}`;
  const created = { users: [] as number[], invitations: [] as number[] };

  // Owner tokens: the RS256 key pair verify-rsvp-api.ts keeps for this API instance (named by a hash of its secret).
  const keyFile = join(tmpdir(), `invitesion-rsvp-acceptance-${createHash('sha256').update(SECRET).digest('hex').slice(0, 16)}.json`);
  const stored = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, 'utf8')) as { kid: string; privateJwk: JsonWebKey; publicJwk: JsonWebKey }) : null;
  const kid = stored?.kid ?? `rsvp-api-${tag}`;
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
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(privateKey);

  async function user(name: string) {
    const clerk = `user_replay_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role) values (${`replay-${name}-${tag}@example.invalid`}, ${clerk}, 'CUSTOMER') returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  let invitationCount = 0;
  async function invitation(owner: number) {
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner}, ${`replay-${++invitationCount}-${tag}`}, 'wedding', 'PUBLISHED', '{}'::jsonb) returning id`;
    created.invitations.push(row.id);
    return row.id as number;
  }
  async function guest(invitationId: number, name: string) {
    const [row] = await sql`insert into guests (invitation_id, name, slug, guest_count)
      values (${invitationId}, ${`${name} (fiktif)`}, ${`${name}-${tag}`}, 2) returning id`;
    return row.id as number;
  }
  async function wish(invitationId: number, guestId: number, message: string) {
    const [row] = await sql`insert into guest_messages (invitation_id, guest_id, name, message, is_hidden)
      values (${invitationId}, ${guestId}, 'Tamu (fiktif)', ${message}, false) returning id`;
    return row.id as number;
  }
  const guestRow = async (id: number) =>
    (await sql`select rsvp_status, attending_count, rsvp_event_answers from guests where id = ${id}`)[0] ?? null;
  const rsvpEvents = async (id: number) =>
    (await sql`select count(*)::int as n from analytics_events where guest_id = ${id} and event_type = 'RSVP'`)[0].n as number;
  const wishRow = async (id: number) =>
    (await sql`select message, is_hidden, reviewed_at is not null as reviewed, host_reply, replied_at is not null as replied
      from guest_messages where id = ${id}`)[0] ?? null;
  const keyRows = async (key: string) => (await sql`select count(*)::int as n from api_idempotency_keys where key = ${key}`)[0].n as number;

  try {
    const owner = await user('owner');
    const other = await user('other');
    const ownInvitation = await invitation(owner.id);
    const ownOtherInvitation = await invitation(owner.id);
    const foreignInvitation = await invitation(other.id);
    const ownGuest = await guest(ownInvitation, 'tamu');
    const foreignGuest = await guest(foreignInvitation, 'tamu-lain');
    const foreignWish = await wish(foreignInvitation, foreignGuest, 'Ucapan pelanggan lain');
    const ownerToken = await tokenFor(owner.clerk);
    const otherToken = await tokenFor(other.clerk);

    // Both tokens are valid: each customer writes to their own invitation.
    const ownerControl = await post(overridePath(ownOtherInvitation, await guest(ownOtherInvitation, 'kontrol')), { status: 'CONFIRMED', flags: RSVP_FLAGS }, ownerToken, keyOf('owner-control'));
    const otherControl = await post(moderationPath(foreignInvitation, foreignWish), { action: 'HIDE' }, otherToken, keyOf('other-control'));
    check('both owner tokens are valid: each customer\u2019s write to their own invitation succeeds',
      ownerControl.status === 200 && otherControl.status === 200, `${ownerControl.status} ${otherControl.status}`);
    const foreignWishBefore = await wishRow(foreignWish);

    type Operation = {
      name: string;
      label: string;
      path: (invitation: number, resource: number) => string;
      resource: number;
      body: unknown;
      changedBody: unknown;
      notFound: string;
      snapshot: () => Promise<unknown>;
    };
    const wishForModeration = await wish(ownInvitation, ownGuest, 'Ucapan untuk disembunyikan');
    const wishForReply = await wish(ownInvitation, ownGuest, 'Ucapan untuk dibalas');
    const operations: Operation[] = [
      {
        name: 'RSVP override',
        label: 'rsvp-override',
        path: overridePath,
        resource: ownGuest,
        body: { status: 'CONFIRMED', flags: RSVP_FLAGS },
        changedBody: { status: 'DECLINED', flags: RSVP_FLAGS },
        notFound: 'invitation_or_guest.not_found',
        snapshot: async () => ({ row: await guestRow(ownGuest), events: await rsvpEvents(ownGuest) }),
      },
      {
        name: 'wish moderation',
        label: 'moderation',
        path: moderationPath,
        resource: wishForModeration,
        body: { action: 'HIDE' },
        changedBody: { action: 'DELETE' },
        notFound: 'invitation_or_wish.not_found',
        snapshot: () => wishRow(wishForModeration),
      },
      {
        name: 'wish reply',
        label: 'reply',
        path: replyPath,
        resource: wishForReply,
        body: { reply: 'Terima kasih atas doanya.' },
        changedBody: { reply: 'Balasan lain.' },
        notFound: 'invitation_or_wish.not_found',
        snapshot: () => wishRow(wishForReply),
      },
    ];

    for (const op of operations) {
      const key = keyOf(op.label);
      const first = await post(op.path(ownInvitation, op.resource), op.body, ownerToken, key);
      check(`${op.name}: the owner\u2019s write succeeds and is not a replay`, first.status === 200 && first.replayed === null, `${first.status} ${first.code ?? ''}`);
      const after = await op.snapshot();
      const reuses: Array<[string, Answer]> = [
        ['another customer, same body', await post(op.path(ownInvitation, op.resource), op.body, otherToken, key)],
        ['another customer, changed body', await post(op.path(ownInvitation, op.resource), op.changedBody, otherToken, key)],
        ['another customer, under their own invitation', await post(op.path(foreignInvitation, op.resource), op.body, otherToken, key)],
        ['the owner, under another of their invitations', await post(op.path(ownOtherInvitation, op.resource), op.body, ownerToken, key)],
      ];
      for (const [who, answer] of reuses) {
        check(`${op.name}: the owner\u2019s key reused by ${who} is refused (404 ${op.notFound}) with no replay and no cached answer`,
          answer.status === 404 && answer.code === op.notFound && answer.replayed === null && canonical(answer.raw) !== canonical(first.raw),
          `${answer.status} ${answer.code ?? ''} replayed=${answer.replayed ?? 'no'}`);
      }
      check(`${op.name}: no refusal changed the row, added an analytics row or recorded a key`,
        same(await op.snapshot(), after) && (await keyRows(key)) === 1, JSON.stringify(await op.snapshot()));
      const retry = await post(op.path(ownInvitation, op.resource), op.body, ownerToken, key);
      check(`${op.name}: the owner\u2019s own retry replays the committed answer without writing again`,
        retry.status === 200 && retry.replayed === 'true' && canonical(retry.raw) === canonical(first.raw) && same(await op.snapshot(), after) && (await keyRows(key)) === 1,
        `${retry.status} replayed=${retry.replayed ?? 'no'}`);
    }

    // A delete whose answer is lost: the API commits, the connection is cut before the answer arrives.
    const doomed = await wish(ownInvitation, ownGuest, 'Ucapan untuk dihapus');
    const deleteKey = keyOf('delete');
    const lost = dropAnswer();
    const lostBase = await listen(lost.handler);
    const lostAnswer = await post(moderationPath(ownInvitation, doomed), { action: 'DELETE' }, ownerToken, deleteKey, lostBase);
    check('delete: the API committed the owner\u2019s delete and the answer was lost on the way',
      lostAnswer.status === 0 && same(lost.seen, [200]) && (await wishRow(doomed)) === null, `${lostAnswer.code} ${JSON.stringify(lost.seen)}`);
    const deleteReuses: Array<[string, Answer]> = [
      ['another customer', await post(moderationPath(ownInvitation, doomed), { action: 'DELETE' }, otherToken, deleteKey)],
      ['another customer, under their own invitation', await post(moderationPath(foreignInvitation, doomed), { action: 'DELETE' }, otherToken, deleteKey)],
      ['the owner, under another of their invitations', await post(moderationPath(ownOtherInvitation, doomed), { action: 'DELETE' }, ownerToken, deleteKey)],
    ];
    for (const [who, answer] of deleteReuses) {
      check(`delete: the lost delete\u2019s key reused by ${who} is refused (404 invitation_or_wish.not_found) with no replay`,
        answer.status === 404 && answer.code === 'invitation_or_wish.not_found' && answer.replayed === null && !answer.raw.includes('DELETED'),
        `${answer.status} ${answer.code ?? ''} replayed=${answer.replayed ?? 'no'}`);
    }
    const ownerRetry = await post(moderationPath(ownInvitation, doomed), { action: 'DELETE' }, ownerToken, deleteKey);
    check('delete: the owner\u2019s retry after the lost answer replays the deletion instead of answering "not found"',
      ownerRetry.status === 200 && ownerRetry.replayed === 'true' && canonical(ownerRetry.raw) === canonical(JSON.stringify({ id: doomed, state: 'DELETED' })) && (await keyRows(deleteKey)) === 1,
      `${ownerRetry.status} ${ownerRetry.code ?? ''} replayed=${ownerRetry.replayed ?? 'no'}`);
    check('no refusal touched the other customer\u2019s wish', same(await wishRow(foreignWish), foreignWishBefore));
  } finally {
    const ids = `{${created.invitations.join(',')}}`;
    await sql`delete from analytics_events where invitation_id = any(${ids}::int[])`;
    await sql`delete from guest_messages where invitation_id = any(${ids}::int[])`;
    await sql`delete from guests where invitation_id = any(${ids}::int[])`;
    await sql`delete from invitations where id = any(${ids}::int[])`;
    await sql`delete from users where id = any(${`{${created.users.join(',')}}`}::int[])`;
    await sql`delete from api_idempotency_keys where key like ${`replay-${tag}-%`}`;
    const [left] = await sql`select (select count(*) from invitations where slug like ${`replay-%-${tag}`})::int as invitations,
      (select count(*) from api_idempotency_keys where key like ${`replay-${tag}-%`})::int as keys`;
    check('the fixture leaves no row behind', left.invitations === 0 && left.keys === 0, JSON.stringify(left));
    for (const server of servers) server.close();
    await sql.end();
  }
  console.log(failures ? `verify-host-replay-isolation: ${failures} FAILED, ${passes} passed` : `verify-host-replay-isolation: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
