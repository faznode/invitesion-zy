/**
 * I-22 end to end (D-060): the wishes book on a scratch database. Only Next.js's request primitives and Clerk's session are
 * stubbed; the wishes page, the download route, the access guard, the loader and the renderer are product code. Every PDF
 * is read back with zlib and the windows-1252 decoder, which share no code with pdf-lib's writer.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/scratch npx tsx scripts/verify-wishes-book.ts
 *
 * It proves, with the answer and the parsed attachment each time:
 *  1. the owner's book: VISIBLE wishes only (pending, hidden and deleted ones absent), oldest first with ties broken by
 *     id, replies under their wish, the cover's title, date and count; a private PDF attachment with a safe name; no
 *     phone, email, link, account number, config value or other invitation's wish anywhere in the file or its headers;
 *  2. the inclusion policy: a closed guestbook and a hosts-only one still print their visible wishes;
 *  3. the cap at the query: none (a readable cover), exactly 5,000, and 5,001 (the oldest 5,000, the cover saying so);
 *  4. the boundary: a signed-out request 401, an administrator (with a grant) 403, a co-host, an usher, a revoked
 *     member, an outsider and another invitation's owner 404, a malformed id 404; the wishes page shows the download to
 *     the owner only; a link rendered earlier answers 404 once access ends; nothing is written by any request;
 *  5. FLAG_WISHES_BOOK off: no download on the page and 404 from the route, for the owner too.
 * Fixture rows are fictional, tagged per run and removed.
 */
import { createHash, randomUUID } from 'node:crypto';
import Module from 'node:module';
import { inflateSync } from 'node:zlib';

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}

const session = { clerkUserId: null as string | null };
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
  'next/headers': { headers: async () => new Headers({ 'x-forwarded-proto': 'https', host: 'app.test' }), cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }) },
  '@clerk/nextjs/server': { auth: async () => ({ userId: session.clerkUserId, getToken: async () => null }), currentUser: async () => null },
};
const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (Object.hasOwn(stubs, request)) return stubs[request];
  return load.call(this, request, ...rest);
};

const env = process.env;
if (!env.POSTGRES_URL?.trim()) throw new Error('POSTGRES_URL must be set (see the header of this script)');

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` (${detail})`}`);
}

type Outcome = { kind: 'returned'; value: unknown } | { kind: 'redirect'; url: string } | { kind: 'notfound' };
async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: 'returned', value: await run() };
  } catch (error) {
    if (error instanceof Redirect) return { kind: 'redirect', url: error.url };
    if (error instanceof NotFound) return { kind: 'notfound' };
    throw error;
  }
}

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

/** Every `Tj` string of a PDF, page by page, decoded as WinAnsi (zlib and TextDecoder only). */
function pdfText(pdf: Uint8Array): string[][] {
  const raw = Buffer.from(pdf).toString('latin1');
  const decoder = new TextDecoder('windows-1252');
  const pages: string[][] = [];
  for (const match of raw.matchAll(/<<([^]*?)>>\s*stream\r?\n/g)) {
    if (!/\/FlateDecode/.test(match[1])) continue;
    const length = Number(/\/Length (\d+)/.exec(match[1])?.[1]);
    const start = (match.index ?? 0) + match[0].length;
    const content = inflateSync(Buffer.from(raw.slice(start, start + length), 'latin1')).toString('latin1');
    pages.push([...content.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((op) => decoder.decode(Buffer.from(op[1], 'hex'))));
  }
  return pages;
}

/** Whether `items` appear in `list` in this order (not necessarily adjacent). */
function inOrder(list: string[], items: string[]): boolean {
  let from = 0;
  for (const item of items) {
    const found = list.indexOf(item, from);
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
}

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const { loadWishesBook } = await import('../lib/invitation/wishes-book-db');
  const { WISHES_BOOK_MAX } = await import('../lib/invitation/wishes-book');
  const { GET: bookRoute } = await import('../app/(customer)/dashboard/invitations/[id]/wishes/book/route');
  const { default: WishesPage } = await import('../app/(customer)/dashboard/invitations/[id]/wishes/page');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const saved = Object.fromEntries(['FLAG_WISHES_BOOK', 'FLAG_TEAM_ACCESS'].map((name) => [name, env[name]]));
  env.FLAG_WISHES_BOOK = 'on';
  env.FLAG_TEAM_ACCESS = 'on';

  type Person = { id: number; clerk: string; email: string };
  async function person(name: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER'): Promise<Person> {
    const clerk = `user_book_${name}_${tag}`;
    const email = `book-${name}-${tag}@example.invalid`;
    const [row] = await sql`insert into users (email, clerk_user_id, role, name) values (${email}, ${clerk}, ${role}, ${`Uji ${name}`}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk, email };
  }
  const as = (who: Person | null) => {
    session.clerkUserId = who?.clerk ?? null;
  };
  async function invitation(owner: Person, name: string, config: unknown): Promise<{ id: number; slug: string }> {
    const slug = `book-${name}-${tag}`;
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner.id}, ${slug}, 'wedding', 'PUBLISHED', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return { id: row.id as number, slug };
  }
  async function guest(invitationId: number, name: string, phone: string): Promise<{ id: number; slug: string }> {
    const slug = `tamu-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, phone, slug) values (${invitationId}, ${name}, ${phone}, ${slug}) returning id`;
    return { id: row.id as number, slug };
  }
  async function wishRow(invitationId: number, w: { name: string; message: string; at: string; state?: 'visible' | 'pending' | 'hidden'; reply?: string; guestId?: number }) {
    const hidden = w.state === 'pending' || w.state === 'hidden';
    const reviewed = w.state === 'hidden' ? w.at : null;
    const [row] = await sql`insert into guest_messages (invitation_id, guest_id, name, message, is_hidden, created_at, reviewed_at, host_reply, replied_at)
      values (${invitationId}, ${w.guestId ?? null}, ${w.name}, ${w.message}, ${hidden}, ${w.at}::timestamp, ${reviewed}::timestamp, ${w.reply ?? null}, ${w.reply ? w.at : null}::timestamp) returning id`;
    return row.id as number;
  }
  async function grant(invitationId: number, who: Person, role: 'cohost' | 'usher', revoked = false) {
    const hash = createHash('sha256').update(`${tag}-${who.id}-${role}-${revoked}`).digest('hex');
    await sql`insert into invitation_members (invitation_id, role, label, token_hash, expires_at, user_id, accepted_at, revoked_at)
      values (${invitationId}, ${role}, ${`Uji ${role}`}, ${hash}, now() + interval '7 days', ${who.id}, now(), ${revoked ? sql`now()` : null})`;
    return hash;
  }
  const download = async (id: number | string) => (await bookRoute(new Request(`http://app.test/dashboard/invitations/${id}/wishes/book`), { params: Promise.resolve({ id: String(id) }) })) as Response;
  const page = (id: number) => WishesPage({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) });
  /** Every wish of these invitations as stored, to show that a download changed nothing. */
  const snapshot = async (ids: number[]) =>
    JSON.stringify(await sql`select id, invitation_id, name, message, is_hidden, reviewed_at, host_reply, replied_at from guest_messages where invitation_id in ${sql(ids)} order by id`);

  try {
    const owner = await person('owner');
    const cohost = await person('cohost');
    const usher = await person('usher');
    const former = await person('former');
    const outsider = await person('outsider');
    const admin = await person('admin', 'ADMIN');

    const config = {
      settings: { title: 'Judul-Settings-Rahasia' },
      couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
      events: [{ id: 'e1', title: 'Akad', startAt: '2026-11-21T09:00:00+07:00' }],
      gift: { enabled: true, accounts: [{ bank: 'BCA', accountNumber: '9988776655', accountName: 'Rekening-Rahasia' }] },
      guestbook: { enabled: true, moderation: true, visibility: 'public' },
    };
    const mine = await invitation(owner, 'mine', config);
    const theirs = await invitation(outsider, 'theirs', { couple: { bride: { nickName: 'Lain' } } });
    const budiGuest = await guest(mine.id, 'Budi Hartono', '0812-5555-0101');
    await guest(theirs.id, 'Tamu Lain', '0812-9999-0202');
    await grant(mine.id, cohost, 'cohost');
    await grant(mine.id, usher, 'usher');
    const formerHash = await grant(mine.id, former, 'cohost', true);
    await grant(mine.id, admin, 'cohost');

    const T0 = '2026-11-21 05:00:00';
    await wishRow(mine.id, { name: 'Dewi Lestari', message: 'Ucapan-Terlama VIS-GAMMA', at: '2026-11-20 05:00:00' });
    await wishRow(mine.id, { name: 'Budi Hartono', message: 'Selamat ya! VIS-ALPHA', at: T0, reply: 'Terima kasih REPLY-ALPHA', guestId: budiGuest.id });
    await wishRow(mine.id, { name: 'Sari Wulandari', message: 'Bahagia selalu VIS-BETA', at: T0 });
    await wishRow(mine.id, { name: 'Penunggu', message: 'PENDING-SECRET', at: '2026-11-21 06:00:00', state: 'pending' });
    await wishRow(mine.id, { name: 'Tersembunyi', message: 'HIDDEN-SECRET', at: '2026-11-21 07:00:00', state: 'hidden', reply: 'HIDDEN-REPLY' });
    const deleted = await wishRow(mine.id, { name: 'Terhapus', message: 'DELETED-SECRET', at: '2026-11-21 08:00:00' });
    await sql`delete from guest_messages where id = ${deleted}`;
    await wishRow(theirs.id, { name: 'Orang Lain', message: 'OTHER-INVITATION-SECRET', at: T0 });

    // ── 1. The owner's book ──────────────────────────────────────────────────────────────────────────────────────────────
    as(owner);
    const before = await snapshot([mine.id, theirs.id]);
    let response = await download(mine.id);
    let bytes = new Uint8Array(await response.arrayBuffer());
    const pages = pdfText(bytes);
    const all = pages.flat();
    check('the owner downloads a PDF attachment, private and never cached, with a safe name and its exact length',
      response.status === 200 && response.headers.get('content-type') === 'application/pdf' && response.headers.get('cache-control') === 'private, no-store' &&
        response.headers.get('content-disposition') === `attachment; filename="buku-ucapan-${mine.slug}.pdf"` && response.headers.get('content-length') === String(bytes.byteLength),
      `${response.status} ${[...response.headers].map(([k, v]) => `${k}=${v}`).join('; ')}`);
    check('it is a real PDF: header, trailer and two pages', Buffer.from(bytes.slice(0, 5)).toString('latin1') === '%PDF-' && /%%EOF\s*$/.test(Buffer.from(bytes.slice(-16)).toString('latin1')) && pages.length === 2, `${pages.length} pages`);
    check('the cover names the couple, the first event\u2019s date and the three visible wishes', inOrder(pages[0], ['BUKU UCAPAN & DOA', 'Sari & Budi', 'Sabtu, 21 November 2026', '3 ucapan dari tamu']), pages[0].join(' | '));
    check('the visible wishes, oldest first, a tie broken by id, the reply under its wish',
      inOrder(all, ['Dewi Lestari', 'Ucapan-Terlama VIS-GAMMA', 'Budi Hartono', 'Selamat ya! VIS-ALPHA', 'Balasan tuan rumah', 'Terima kasih REPLY-ALPHA', 'Sari Wulandari', 'Bahagia selalu VIS-BETA']), all.join(' | '));
    const raw = Buffer.from(bytes).toString('latin1');
    const headers = [...response.headers].join(' ');
    const secrets = ['PENDING-SECRET', 'HIDDEN-SECRET', 'HIDDEN-REPLY', 'DELETED-SECRET', 'OTHER-INVITATION-SECRET', '0812', budiGuest.slug, owner.email, owner.clerk, '9988776655', 'Rekening-Rahasia', 'Judul-Settings-Rahasia', formerHash];
    const found = secrets.filter((secret) => all.some((text) => text.includes(secret)) || raw.includes(secret) || headers.includes(secret));
    check('pending, hidden and deleted wishes, phones, emails, links, the account, config values and the other invitation are nowhere in the file or headers', found.length === 0, found.join(', '));
    check('a download writes nothing', (await snapshot([mine.id, theirs.id])) === before);

    // ── 2. The inclusion policy: the moderation state, not the guestbook's current settings ───────────────────────────
    for (const [label, guestbook] of [
      ['closed', { enabled: false, moderation: true, visibility: 'public' }],
      ['hosts-only', { enabled: true, moderation: false, visibility: 'host' }],
    ] as const) {
      await sql`update invitations set config = ${JSON.stringify({ ...config, guestbook })}::text::jsonb where id = ${mine.id}`;
      response = await download(mine.id);
      const text = pdfText(new Uint8Array(await response.arrayBuffer())).flat();
      check(`a ${label} guestbook still prints its three visible wishes and nothing else`, response.status === 200 && text.includes('3 ucapan dari tamu') && text.includes('Bahagia selalu VIS-BETA') && !text.some((t) => t.includes('SECRET')), text.slice(0, 6).join(' | '));
    }
    await sql`update invitations set config = ${JSON.stringify(config)}::text::jsonb where id = ${mine.id}`;

    // ── 3. The cap at the query: none, exactly 5,000, and one more ─────────────────────────────────────────────────────
    const quiet = await invitation(owner, 'quiet', { couple: { bride: { nickName: 'Rina' }, groom: { nickName: 'Andi' } } });
    await wishRow(quiet.id, { name: 'P', message: 'PENDING-ONLY', at: T0, state: 'pending' });
    await wishRow(quiet.id, { name: 'H', message: 'HIDDEN-ONLY', at: T0, state: 'hidden' });
    response = await download(quiet.id);
    let text = pdfText(new Uint8Array(await response.arrayBuffer()));
    check('no visible wish: a one-page book that says so', response.status === 200 && text.length === 1 && text[0].includes('Belum ada ucapan berstatus Tampil.') && !text[0].some((t) => t.includes('ONLY')), text.flat().join(' | '));

    const big = await invitation(owner, 'big', { couple: { bride: { nickName: 'Maya' }, groom: { nickName: 'Raka' } } });
    await sql`insert into guest_messages (invitation_id, name, message, is_hidden, created_at)
      select ${big.id}, 'Tamu ' || n, 'Ucapan nomor ' || n, false, ${T0}::timestamp from generate_series(1, ${WISHES_BOOK_MAX}) as n order by n`;
    await sql`insert into guest_messages (invitation_id, name, message, is_hidden, created_at) values (${big.id}, 'Penunggu Besar', 'PENDING-BIG', true, ${T0}::timestamp)`;
    let loaded = await loadWishesBook(big.id);
    check('exactly 5,000 visible wishes (one timestamp for all): all of them, in id order, the pending one not counted',
      loaded.wishes.length === WISHES_BOOK_MAX && loaded.total === WISHES_BOOK_MAX && loaded.wishes[0].name === 'Tamu 1' && loaded.wishes.at(-1)?.name === 'Tamu 5000', `${loaded.wishes.length} / ${loaded.total}`);
    let started = performance.now();
    response = await download(big.id);
    bytes = new Uint8Array(await response.arrayBuffer());
    text = pdfText(bytes);
    check('the route prints all 5,000', response.status === 200 && text[0].includes('5.000 ucapan dari tamu') && text.flat().includes('Tamu 5000'), `${text[0].slice(0, 5).join(' | ')} (${Math.round(performance.now() - started)} ms, ${bytes.byteLength} bytes, ${text.length} pages)`);
    console.log(`      5,000 wishes: ${Math.round(performance.now() - started)} ms, ${bytes.byteLength} bytes, ${text.length} pages`);
    await sql`insert into guest_messages (invitation_id, name, message, is_hidden, created_at) values (${big.id}, 'Tamu 5001', 'Ucapan terbaru', false, '2026-11-22 05:00:00'::timestamp)`;
    loaded = await loadWishesBook(big.id);
    check('5,001 visible wishes: the oldest 5,000 and the true total', loaded.wishes.length === WISHES_BOOK_MAX && loaded.total === WISHES_BOOK_MAX + 1 && loaded.wishes.at(-1)?.name === 'Tamu 5000', `${loaded.wishes.length} / ${loaded.total}`);
    started = performance.now();
    response = await download(big.id);
    text = pdfText(new Uint8Array(await response.arrayBuffer()));
    check('the cover says 5,000 of 5,001 and that the newest one is not included',
      text[0].includes('5.000 dari 5.001 ucapan') && text[0].some((t) => t.includes('Buku ini memuat 5.000 ucapan paling awal; 1 ucapan')) && !text.flat().includes('Tamu 5001'), `${text[0].join(' | ')} (${Math.round(performance.now() - started)} ms)`);

    // ── 4. The boundary ────────────────────────────────────────────────────────────────────────────────────────────────
    const callers: [string, Person | null, number][] = [
      ['a signed-out request', null, 401],
      ['an administrator holding a grant', admin, 403],
      ['a co-host', cohost, 404],
      ['an usher', usher, 404],
      ['a member whose grant was revoked', former, 404],
      ['an outsider (another invitation\u2019s owner)', outsider, 404],
    ];
    for (const [label, who, status] of callers) {
      as(who);
      const answer = await download(mine.id);
      const body = new Uint8Array(await answer.arrayBuffer());
      check(`${label}: ${status}, no PDF`, answer.status === status && answer.headers.get('content-type') !== 'application/pdf' && !Buffer.from(body).toString('latin1').startsWith('%PDF'), `${answer.status}`);
    }
    as(owner);
    check('the owner asking for another invitation\u2019s book: 404', (await download(theirs.id)).status === 404);
    for (const id of ['abc', '0', '-1', '1.5', '99999999999']) check(`a malformed or unknown id (${id}): 404`, (await download(id)).status === 404);
    as(outsider);
    response = await download(theirs.id);
    text = pdfText(new Uint8Array(await response.arrayBuffer()));
    check('the other owner\u2019s own book holds their wish only', response.status === 200 && text.flat().includes('OTHER-INVITATION-SECRET') && !text.flat().some((t) => /VIS-|REPLY-ALPHA/.test(t)));

    as(owner);
    const ownerPage = await outcome(() => page(mine.id));
    const card = propsOf(ownerPage.kind === 'returned' ? ownerPage.value : null, 'WishesBookCard');
    check('the wishes page offers the owner the download, counting the three visible wishes', card?.invitationId === mine.id && card?.visible === 3, JSON.stringify(card));
    as(cohost);
    const cohostPage = await outcome(() => page(mine.id));
    check('a co-host moderates on the same page but is offered no download', cohostPage.kind === 'returned' && propsOf(cohostPage.value, 'WishesBookCard') === null);

    as(owner);
    await sql`update invitations set user_id = ${outsider.id} where id = ${mine.id}`;
    const afterTransfer = await download(mine.id);
    await sql`update invitations set user_id = ${owner.id} where id = ${mine.id}`;
    check('a link rendered while the owner had access answers 404 once the invitation is no longer theirs', afterTransfer.status === 404, String(afterTransfer.status));
    check('nothing was written by any request', (await snapshot([mine.id, theirs.id])) === before);

    // ── 5. FLAG_WISHES_BOOK off ────────────────────────────────────────────────────────────────────────────────────────
    env.FLAG_WISHES_BOOK = 'off';
    const offPage = await outcome(() => page(mine.id));
    check('flag off: the owner\u2019s wishes page has no download', offPage.kind === 'returned' && propsOf(offPage.value, 'WishesBookCard') === null);
    check('flag off: the route answers 404 to the owner, including a link rendered before', (await download(mine.id)).status === 404);
    as(null);
    check('flag off: a signed-out request is still 401', (await download(mine.id)).status === 401);
    env.FLAG_WISHES_BOOK = 'on';
    as(owner);
    check('flag on again: the same book returns', (await download(mine.id)).status === 200);
  } finally {
    as(null);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    if (created.invitations.length) {
      await sql`delete from guest_messages where invitation_id in ${sql(created.invitations)}`;
      await sql`delete from invitation_members where invitation_id in ${sql(created.invitations)}`;
      await sql`delete from guests where invitation_id in ${sql(created.invitations)}`;
      await sql`delete from invitations where id in ${sql(created.invitations)}`;
    }
    if (created.users.length) await sql`delete from users where id in ${sql(created.users)}`;
    await sql.end();
  }
  console.log(failures ? `verify-wishes-book: ${failures} FAILED, ${passes} passed` : `verify-wishes-book: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
