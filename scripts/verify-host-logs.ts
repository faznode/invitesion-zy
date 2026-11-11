/**
 * G-045 end to end (D-058): the owner's day-of logs (seating, souvenirs, gifts) on a scratch database. Only Next.js's
 * request primitives and Clerk's session are stubbed; the page, the server actions, the export route, the access guard
 * and the writer are product code.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/scratch npx tsx scripts/verify-host-logs.ts
 *
 * It proves, with the answer and the stored rows each time:
 *  1. the owner's flow: tables (added, duplicate names refused, renamed, the manage centre's planned tables copied once),
 *     seats (over capacity shown), souvenirs (the first hand-out kept, cleared, concurrent taps), gifts (recorded, a double
 *     submit replayed, a reused key refused, concurrent resends recorded once, corrected, deleted), a deleted table
 *     unseating its guests, and both CSV exports;
 *  1b. I-04 (D-059): a gift's family side on a wedding: recorded, an identical resend replayed and a changed side under
 *     the same key refused, any other value refused, a side refused on a birthday when recording and correcting, a later
 *     attribution, a correction without the field keeping it and an empty choice clearing it, the rendered totals per
 *     family in the couple's order, groom-first with fallback labels, and the export's `Pihak` column with no phone;
 *  2. the boundary at every entry (the page, each action, the export) for a signed-out visitor, an administrator holding
 *     a grant, an outsider, a co-host and an usher with live grants, and forged table, guest and gift ids from another
 *     invitation: refused under the established convention, nothing changed;
 *  3. FLAG_HOST_LOGS off: 404 at every entry, nothing written, the manage centre back to its placeholder, rows kept; on
 *     again, the same rows return;
 *  4. privacy: the guest page's payload (link and personal) and the check-in desk carry none of these values.
 * Fixture rows are fictional, tagged per run and removed.
 */
import { createHash, randomUUID } from 'node:crypto';
import Module from 'node:module';

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
const describe = (o: Outcome) => (o.kind === 'redirect' ? `redirect ${o.url}` : o.kind === 'returned' && o.value instanceof Response ? `status ${o.value.status}` : o.kind);

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

/** JSON of a rendered tree, skipping anything already seen (React's dev fields can cycle). */
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

/** The text a rendered tree shows: strings and numbers in document order (nested components are not called). */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const element = node as { props?: { children?: unknown } };
  return element.props ? textOf(element.props.children) : '';
}

/** A `timestamp` column as milliseconds: the raw client returns its text (UTC, no zone), Drizzle a Date. */
function ms(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(/[zZ]|[+-]\d\d(:?\d\d)?$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}

function form(values: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, String(value));
  return data;
}

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const writer = await import('../lib/invitation/host-logs-db');
  const { accessFor } = await import('../lib/invitation/members-db');
  const { loadPublicInvitation } = await import('../lib/invitation/public');
  const actions = await import('../app/(customer)/dashboard/invitations/[id]/logs/actions');
  const { default: LogsPage } = await import('../app/(customer)/dashboard/invitations/[id]/logs/page');
  const { GET: exportRoute } = await import('../app/(customer)/dashboard/invitations/[id]/logs/export/route');
  const { GiftsSection } = await import('../app/(customer)/dashboard/invitations/[id]/logs/gifts-section');
  const { default: ManagePage } = await import('../app/(customer)/dashboard/invitations/[id]/manage/page');
  const { default: CheckinPage } = await import('../app/(customer)/dashboard/invitations/[id]/checkin/page');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const saved = Object.fromEntries(['FLAG_HOST_LOGS', 'FLAG_TEAM_ACCESS', 'FLAG_GUEST_PASS'].map((name) => [name, env[name]]));
  env.FLAG_HOST_LOGS = 'on';
  env.FLAG_TEAM_ACCESS = 'on';
  env.FLAG_GUEST_PASS = 'on';

  type Person = { id: number; clerk: string };
  async function person(name: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER'): Promise<Person> {
    const clerk = `user_logs_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, role, name) values (${`logs-${name}-${tag}@example.invalid`}, ${clerk}, ${role}, ${`Uji ${name}`}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  const as = (who: Person | null) => {
    session.clerkUserId = who?.clerk ?? null;
  };
  async function invitation(owner: Person, name: string, config: unknown, eventType = 'wedding'): Promise<{ id: number; slug: string }> {
    const slug = `logs-${name}-${tag}`;
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner.id}, ${slug}, ${eventType}, 'PUBLISHED', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(row.id);
    return { id: row.id as number, slug };
  }
  async function guest(invitationId: number, name: string, phone: string | null = null): Promise<{ id: number; slug: string }> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tamu'}-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, phone, slug) values (${invitationId}, ${name}, ${phone}, ${slug}) returning id`;
    return { id: row.id as number, slug };
  }
  async function grant(invitationId: number, who: Person, role: 'cohost' | 'usher') {
    const hash = createHash('sha256').update(`${tag}-${who.id}-${role}`).digest('hex');
    await sql`insert into invitation_members (invitation_id, role, label, token_hash, expires_at, user_id, accepted_at)
      values (${invitationId}, ${role}, ${`Uji ${role}`}, ${hash}, now() + interval '7 days', ${who.id}, now())`;
  }
  /** Everything a log write can change on one invitation, to show that a refusal changed nothing. */
  async function snapshot(invitationId: number): Promise<string> {
    const tables = await sql`select id, name, capacity from seating_tables where invitation_id = ${invitationId} order by id`;
    const seats = await sql`select guest_id, table_id, seat, souvenir_at from guest_logs where invitation_id = ${invitationId} order by guest_id`;
    const gifts = await sql`select id, guest_id, giver_name, kind, amount, note, request_key, family_side from gift_logs where invitation_id = ${invitationId} order by id`;
    return JSON.stringify({ tables, seats, gifts });
  }
  const tableId = async (invitationId: number, name: string) => ((await sql`select id from seating_tables where invitation_id = ${invitationId} and name = ${name}`)[0]?.id as number) ?? null;
  const seatOf = async (guestId: number) => (await sql`select table_id, seat, souvenir_at from guest_logs where guest_id = ${guestId}`)[0] ?? null;
  const giftRows = async (invitationId: number, requestKey?: string) =>
    requestKey
      ? await sql`select id, guest_id, giver_name, kind, amount, note from gift_logs where invitation_id = ${invitationId} and request_key = ${requestKey}`
      : await sql`select id, guest_id, giver_name, kind, amount, note from gift_logs where invitation_id = ${invitationId} order by id`;

  try {
    const owner = await person('owner');
    const outsider = await person('outsider');
    const cohost = await person('cohost');
    const usher = await person('usher');
    const admin = await person('admin', 'ADMIN');

    const config = {
      settings: { title: 'Budi & Sari' },
      couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
      checkInSettings: { enabled: true },
      seatingPlan: { tables: [{ id: 'table-1', name: 'Mawar Rahasia', capacity: 8, guestIds: [] }, { id: 'table-2', name: 'Melati Rahasia', capacity: 6, guestIds: [] }] },
    };
    const mine = await invitation(owner, 'mine', config);
    const theirs = await invitation(outsider, 'theirs', { settings: { title: 'Lain' } });
    const budi = await guest(mine.id, 'Budi Hartono', '0812-7777-0001');
    const sari = await guest(mine.id, 'Sari Wulandari', '0812-7777-0002');
    const hostile = await guest(mine.id, '=HYPERLINK("https://evil.example","klik")');
    const stranger = await guest(theirs.id, 'Rahasia Tamu Lain', '0812-9999-0000');
    await grant(mine.id, cohost, 'cohost');
    await grant(mine.id, usher, 'usher');
    await grant(mine.id, admin, 'cohost');

    const path = `/dashboard/invitations/${mine.id}/logs`;
    const page = (id: number, searchParams: Record<string, string> = {}) => LogsPage({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve(searchParams) });
    const exportOf = (id: number, kind: string) => exportRoute(new Request(`http://app.test/dashboard/invitations/${id}/logs/export?kind=${kind}`), { params: Promise.resolve({ id: String(id) }) });
    const act = async (action: (data: FormData) => Promise<unknown>, values: Record<string, string | number>) => outcome(() => action(form(values)));
    const redirectedTo = (o: Outcome, query: string, anchor: string) => o.kind === 'redirect' && o.url === `${path}?${query}#${anchor}`;

    // ── 1. The owner's flow ────────────────────────────────────────────────────────────────────────────────────────────
    as(owner);
    const first = await outcome(() => page(mine.id));
    check('the owner opens the logs page', first.kind === 'returned', describe(first));
    check('before any table exists the page offers both planned tables', propsOf(first.kind === 'returned' ? first.value : null, 'TablesSection')?.planPending === 2);

    let o = await act(actions.addTableAction, { invitationId: mine.id, name: '  Mawar   Rahasia ', capacity: '2' });
    check('a table is added, its name cleaned', redirectedTo(o, 'notice=table-added', 'meja') && (await tableId(mine.id, 'Mawar Rahasia')) !== null, describe(o));
    o = await act(actions.addTableAction, { invitationId: mine.id, name: 'Mawar Rahasia', capacity: '' });
    check('the same name again is refused as a duplicate', redirectedTo(o, 'error=table-duplicate', 'meja'), describe(o));
    o = await act(actions.addTableAction, { invitationId: mine.id, name: 'Kenanga', capacity: '0' });
    check('a capacity outside 1–100 is refused', redirectedTo(o, 'error=table-invalid', 'meja') && (await tableId(mine.id, 'Kenanga')) === null, describe(o));

    o = await act(actions.importPlanTablesAction, { invitationId: mine.id });
    const mawar = await tableId(mine.id, 'Mawar Rahasia');
    const melati = await tableId(mine.id, 'Melati Rahasia');
    const mawarCapacity = (await sql`select capacity from seating_tables where id = ${mawar}`)[0]?.capacity;
    check('the planned tables are copied from the stored invitation: only the missing one, an existing one untouched', redirectedTo(o, 'notice=tables-imported&added=1', 'meja') && melati !== null && mawarCapacity === 2, describe(o));
    o = await act(actions.importPlanTablesAction, { invitationId: mine.id });
    check('copying again adds nothing', redirectedTo(o, 'notice=tables-imported&added=0', 'meja') && Number((await sql`select count(*)::int as n from seating_tables where invitation_id = ${mine.id}`)[0].n) === 2, describe(o));
    const afterImport = await outcome(() => page(mine.id));
    check('the page then offers nothing to copy', propsOf(afterImport.kind === 'returned' ? afterImport.value : null, 'TablesSection')?.planPending === 0);

    o = await act(actions.updateTableAction, { invitationId: mine.id, tableId: melati, name: 'Mawar Rahasia', capacity: '6' });
    check('renaming onto another table\u2019s name is refused', redirectedTo(o, 'error=table-duplicate', 'meja') && (await tableId(mine.id, 'Melati Rahasia')) === melati, describe(o));
    o = await act(actions.updateTableAction, { invitationId: mine.id, tableId: melati, name: 'Melati Rahasia', capacity: '3' });
    check('a table\u2019s capacity is saved', redirectedTo(o, 'notice=table-saved', 'meja') && (await sql`select capacity from seating_tables where id = ${melati}`)[0]?.capacity === 3, describe(o));

    for (const [who, seat] of [
      [budi, 'Kursi-77Q'],
      [sari, 'A2'],
      [hostile, ''],
    ] as const) {
      o = await act(actions.assignSeatAction, { invitationId: mine.id, guestId: who.id, tableId: mawar, seat });
      check(`a guest is seated at Mawar${seat ? ` (${seat})` : ''}`, redirectedTo(o, `notice=seat-saved&guest=${who.id}`, 'tamu'), describe(o));
    }
    const seated = await outcome(() => page(mine.id));
    const tablesShown = (propsOf(seated.kind === 'returned' ? seated.value : null, 'TablesSection')?.tables ?? []) as { id: number; assigned: number; over: boolean }[];
    check('three guests at a table for two are shown over capacity', tablesShown.find((t) => t.id === mawar)?.assigned === 3 && tablesShown.find((t) => t.id === mawar)?.over === true);
    o = await act(actions.assignSeatAction, { invitationId: mine.id, guestId: sari.id, tableId: mawar, seat: 'A2' });
    check('saving the same seat again changes nothing', redirectedTo(o, `notice=seat-saved&guest=${sari.id}`, 'tamu') && (await seatOf(sari.id))?.seat === 'A2', describe(o));

    o = await act(actions.souvenirAction, { invitationId: mine.id, guestId: budi.id, given: '1' });
    const givenAt = ms((await seatOf(budi.id))?.souvenir_at);
    check('a souvenir is marked handed out', redirectedTo(o, `notice=souvenir-given&guest=${budi.id}`, 'tamu') && Number.isFinite(givenAt), describe(o));
    await new Promise((resolve) => setTimeout(resolve, 15));
    o = await act(actions.souvenirAction, { invitationId: mine.id, guestId: budi.id, given: '1' });
    check('marking it again keeps the first time', redirectedTo(o, `notice=souvenir-already&guest=${budi.id}`, 'tamu') && ms((await seatOf(budi.id))?.souvenir_at) === givenAt, describe(o));
    o = await act(actions.souvenirAction, { invitationId: mine.id, guestId: budi.id, given: '0' });
    check('a souvenir mark can be cleared', redirectedTo(o, `notice=souvenir-cleared&guest=${budi.id}`, 'tamu') && (await seatOf(budi.id))?.souvenir_at === null, describe(o));
    const base = Date.parse('2026-12-12T12:00:00Z');
    const taps = await Promise.all(Array.from({ length: 8 }, (_, i) => writer.setSouvenir(owner.id, mine.id, sari.id, true, new Date(base + i * 1000))));
    const firsts = taps.filter((t) => t.kind === 'given' && t.first);
    const storedSari = ms((await seatOf(sari.id))?.souvenir_at);
    check('eight concurrent taps record one hand-out, the first kept', firsts.length === 1 && firsts[0].kind === 'given' && storedSari === firsts[0].at.getTime(), `${firsts.length} firsts, stored ${storedSari}`);
    check('the seat survives the souvenir writes', (await seatOf(sari.id))?.seat === 'A2' && (await seatOf(sari.id))?.table_id === mawar);

    const k1 = randomUUID();
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k1, guestId: budi.id, giverName: '', kind: 'envelope', amount: 'Rp 500.000', note: '' });
    const k1Rows = await giftRows(mine.id, k1);
    check('a gift from a listed guest is recorded under the guest\u2019s name', redirectedTo(o, 'notice=gift-recorded', 'kado') && k1Rows.length === 1 && k1Rows[0].giver_name === 'Budi Hartono' && Number(k1Rows[0].amount) === 500_000, describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k1, guestId: budi.id, giverName: '', kind: 'envelope', amount: '500.000', note: '' });
    check('the same submission again is answered as already recorded, one row', redirectedTo(o, 'notice=gift-replayed', 'kado') && (await giftRows(mine.id, k1)).length === 1, describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k1, guestId: budi.id, giverName: '', kind: 'envelope', amount: '600.000', note: '' });
    check('the same key with a different amount is refused, the first entry unchanged', redirectedTo(o, 'error=gift-key-reused', 'kado') && Number((await giftRows(mine.id, k1))[0].amount) === 500_000, describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: randomUUID(), guestId: '', giverName: '', kind: 'present', amount: '', note: '' });
    check('a gift with neither a guest nor a giver is refused', redirectedTo(o, 'error=gift-giver', 'kado'), describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: randomUUID(), guestId: '', giverName: 'Pemberi', kind: 'cash', amount: '', note: '' });
    check('an unknown gift kind is refused', redirectedTo(o, 'error=gift-invalid', 'kado'), describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: randomUUID(), guestId: '', giverName: 'Pemberi', kind: 'envelope', amount: '1.5', note: '' });
    check('an amount that is not whole rupiah is refused', redirectedTo(o, 'error=gift-invalid', 'kado'), describe(o));
    const k4 = randomUUID();
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k4, guestId: '', giverName: '+Pemberi Rahasia', kind: 'present', amount: '', note: '@Catatan-Rahasia-Kado' });
    check('a gift from a typed giver with a note and no amount is recorded', redirectedTo(o, 'notice=gift-recorded', 'kado') && (await giftRows(mine.id, k4))[0]?.amount === null, describe(o));
    const k5 = randomUUID();
    const resends = await Promise.all(
      Array.from({ length: 6 }, () => writer.recordGift(owner.id, mine.id, { requestKey: k5, guestId: sari.id, giverName: null, kind: 'transfer', amount: 1_000_000, note: null, side: null })),
    );
    check('six concurrent resends of one gift record one entry', (await giftRows(mine.id, k5)).length === 1 && resends.filter((r) => r.kind === 'recorded').length === 1 && resends.filter((r) => r.kind === 'replayed').length === 5,
      resends.map((r) => r.kind).join(','));
    const k4Id = (await giftRows(mine.id, k4))[0].id as number;
    o = await act(actions.updateGiftAction, { invitationId: mine.id, giftId: k4Id, giverName: '+Pemberi Rahasia', kind: 'present', amount: '250.000', note: '@Catatan-Rahasia-Kado' });
    check('a gift entry is corrected', redirectedTo(o, 'notice=gift-saved', 'kado') && Number((await giftRows(mine.id, k4))[0].amount) === 250_000, describe(o));

    // ── 2. The exports ─────────────────────────────────────────────────────────────────────────────────────────────────
    let response = (await exportOf(mine.id, 'seating')) as Response;
    let body = await response.text();
    const seatingLines = body.split('\n');
    check('the seating export downloads as private CSV', response.status === 200 && response.headers.get('content-type') === 'text/csv; charset=utf-8' && response.headers.get('cache-control') === 'private, no-store' &&
      response.headers.get('content-disposition') === `attachment; filename="${mine.slug}-meja-suvenir.csv"`, `${response.status} ${response.headers.get('content-disposition')}`);
    check('it lists every guest of this invitation once, with table, seat and souvenir', seatingLines.length === 4 && body.includes('"Budi Hartono","","Mawar Rahasia","Kursi-77Q","Belum"') && body.includes('"Sari Wulandari","","Mawar Rahasia","A2","Ya"'), body);
    check('the seating export neutralises a formula name and carries no phone or other invitation', body.includes(`"'=HYPERLINK(""https://evil.example"",""klik"")"`) && !body.includes('0812') && !body.includes('Rahasia Tamu Lain'));
    response = (await exportOf(mine.id, 'gifts')) as Response;
    body = await response.text();
    check('the gift export lists the three entries, neutralised, none attributed yet', response.status === 200 && body.split('\n').length === 4 && body.includes(`"'+Pemberi Rahasia","","Tidak","Kado","250000","'@Catatan-Rahasia-Kado"`) && body.includes('"Budi Hartono","","Ya","Amplop","500000"'),
      body);
    response = (await exportOf(mine.id, 'everything')) as Response;
    check('an unknown export kind is refused', response.status === 400);

    // ── 2b. I-04: a gift's family side on a wedding ──────────────────────────────────────────────────────────────────
    const party = await invitation(owner, 'party', { settings: { title: 'Ulang tahun Dewi' } }, 'birthday');
    /** The stored side for a request key: null when unattributed, undefined when no such entry exists. */
    const sideOf = async (requestKey: string): Promise<string | null | undefined> => {
      const [row] = await sql`select family_side from gift_logs where request_key = ${requestKey}`;
      return row ? (row.family_side as string | null) : undefined;
    };
    const k6 = randomUUID();
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k6, guestId: '', giverName: 'Keluarga Pak RT', kind: 'envelope', amount: '300.000', note: '', side: 'groom' });
    check('I-04: a gift on a wedding is attributed to the groom\u2019s family', redirectedTo(o, 'notice=gift-recorded', 'kado') && (await sideOf(k6)) === 'groom', describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k6, guestId: '', giverName: 'Keluarga Pak RT', kind: 'envelope', amount: '300.000', note: '', side: 'bride' });
    check('I-04: the same key with the other family is a reused key; the side stays', redirectedTo(o, 'error=gift-key-reused', 'kado') && (await sideOf(k6)) === 'groom', describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: k6, guestId: '', giverName: 'Keluarga Pak RT', kind: 'envelope', amount: '300.000', note: '', side: 'groom' });
    check('I-04: the identical resend is answered as already recorded', redirectedTo(o, 'notice=gift-replayed', 'kado') && (await giftRows(mine.id, k6)).length === 1, describe(o));
    o = await act(actions.recordGiftAction, { invitationId: mine.id, requestKey: randomUUID(), guestId: '', giverName: 'Sepupu', kind: 'envelope', amount: '', note: '', side: 'cousin' });
    check('I-04: a value other than bride or groom is refused', redirectedTo(o, 'error=gift-invalid', 'kado'), describe(o));
    const partyPath = `/dashboard/invitations/${party.id}/logs`;
    const kParty = randomUUID();
    o = await act(actions.recordGiftAction, { invitationId: party.id, requestKey: kParty, guestId: '', giverName: 'Om Hadi', kind: 'present', amount: '', note: '', side: 'bride' });
    check('I-04: a family side on a birthday is refused by the writer, nothing stored', o.kind === 'redirect' && o.url === `${partyPath}?error=gift-side#kado` && (await sideOf(kParty)) === undefined, describe(o));
    o = await act(actions.recordGiftAction, { invitationId: party.id, requestKey: kParty, guestId: '', giverName: 'Om Hadi', kind: 'present', amount: '', note: '' });
    const partyGift = (await giftRows(party.id))[0];
    check('I-04: the same gift without a side is recorded on the birthday', o.kind === 'redirect' && o.url === `${partyPath}?notice=gift-recorded#kado` && partyGift !== undefined && (await sideOf(kParty)) === null, describe(o));
    const k1Gift = (await giftRows(mine.id, k1))[0].id as number;
    const updateValues = (side?: string) => ({ invitationId: mine.id, giftId: k1Gift, giverName: 'Budi Hartono', kind: 'envelope', amount: '500.000', note: '', ...(side === undefined ? {} : { side }) });
    o = await act(actions.updateGiftAction, updateValues('bride'));
    check('I-04: an entry recorded before is attributed later', redirectedTo(o, 'notice=gift-saved', 'kado') && (await sideOf(k1)) === 'bride', describe(o));
    o = await act(actions.updateGiftAction, updateValues());
    check('I-04: a correction from a form without the field keeps the side', redirectedTo(o, 'notice=gift-saved', 'kado') && (await sideOf(k1)) === 'bride', describe(o));
    o = await act(actions.updateGiftAction, updateValues(''));
    check('I-04: choosing "not decided" clears it', redirectedTo(o, 'notice=gift-saved', 'kado') && (await sideOf(k1)) === null, describe(o));
    o = await act(actions.updateGiftAction, { invitationId: party.id, giftId: partyGift.id as number, giverName: 'Om Hadi', kind: 'present', amount: '', note: '', side: 'groom' });
    check('I-04: a correction adding a side on a birthday is refused, the entry unchanged', o.kind === 'redirect' && o.url === `${partyPath}?error=gift-side#kado` && (await sideOf(kParty)) === null, describe(o));
    const weddingPage = await outcome(() => page(mine.id));
    const weddingSides = propsOf(weddingPage.kind === 'returned' ? weddingPage.value : null, 'GiftsSection')?.sides as { applies: boolean; labels: Record<string, string>; order: string[] } | undefined;
    const partyPage = await outcome(() => page(party.id));
    const partySides = propsOf(partyPage.kind === 'returned' ? partyPage.value : null, 'GiftsSection')?.sides as { applies: boolean } | undefined;
    check('I-04: the wedding\u2019s page offers both families by the couple\u2019s names; the birthday\u2019s offers none',
      weddingSides?.applies === true && weddingSides.labels.bride === 'Keluarga Sari (mempelai wanita)' && weddingSides.labels.groom === 'Keluarga Budi (mempelai pria)' && partySides?.applies === false,
      JSON.stringify({ weddingSides, partySides }));
    const weddingGifts = propsOf(weddingPage.kind === 'returned' ? weddingPage.value : null, 'GiftsSection');
    const totalsText = weddingGifts ? textOf(GiftsSection(weddingGifts as Parameters<typeof GiftsSection>[0])) : '';
    check('I-04: the rendered totals: each family in the couple\u2019s order, then the unattributed entries with their noted sum',
      totalsText.includes('Keluarga Sari (mempelai wanita)0 catatanKeluarga Budi (mempelai pria)1 catatan · Rp 300.000Belum ditentukan3 catatan · Rp 1.750.000'), totalsText.slice(0, 400));
    const ordered = await invitation(owner, 'order', { settings: { title: 'Tanpa nama' }, couple: { displayOrder: 'groom-first' } });
    const orderedPage = await outcome(() => page(ordered.id));
    const orderedSides = propsOf(orderedPage.kind === 'returned' ? orderedPage.value : null, 'GiftsSection')?.sides as { order: string[]; labels: Record<string, string> } | undefined;
    check('I-04: groom-first puts the groom\u2019s family first; without names the labels fall back to the roles',
      orderedSides?.order.join(',') === 'groom,bride' && orderedSides.labels.groom === 'Keluarga mempelai pria' && orderedSides.labels.bride === 'Keluarga mempelai wanita', JSON.stringify(orderedSides));
    body = await ((await exportOf(mine.id, 'gifts')) as Response).text();
    check('I-04: the gift export names the family; entries recorded before stay unattributed',
      body.includes('"Keluarga Pak RT","Keluarga Budi (mempelai pria)","Tidak","Amplop","300000"') && body.includes(`"'+Pemberi Rahasia","","Tidak","Kado"`) && body.includes('"Budi Hartono","","Ya","Amplop","500000"'), body);
    check('I-04: the gift export carries no phone and no other invitation\u2019s entry', !body.includes('0812') && !body.includes('Om Hadi'), body);
    check('I-04: the side never reaches the guest page\u2019s payload', !JSON.stringify((await loadPublicInvitation(mine.slug))?.config ?? {}).includes('Pak RT'));

    // ── 3. The boundary at every entry ─────────────────────────────────────────────────────────────────────────────────
    const theirTable = (await writer.addTable(outsider.id, theirs.id, { name: 'Meja Lain', capacity: null })).kind === 'saved' ? await tableId(theirs.id, 'Meja Lain') : null;
    await writer.recordGift(outsider.id, theirs.id, { requestKey: randomUUID(), guestId: stranger.id, giverName: null, kind: 'envelope', amount: 100_000, note: null, side: null });
    const theirGift = (await giftRows(theirs.id))[0]?.id as number;
    check('control: co-host and usher grants are live (they reach their own surfaces)', (await accessFor(cohost.id, mine.id, 'guests')) !== null && (await accessFor(usher.id, mine.id, 'checkin')) !== null);

    const mineBefore = await snapshot(mine.id);
    const theirsBefore = await snapshot(theirs.id);
    const everyAction: [string, (data: FormData) => Promise<unknown>, Record<string, string | number>][] = [
      ['add a table', actions.addTableAction, { invitationId: mine.id, name: 'Meja Penyusup', capacity: '' }],
      ['copy planned tables', actions.importPlanTablesAction, { invitationId: mine.id }],
      ['rename a table', actions.updateTableAction, { invitationId: mine.id, tableId: mawar, name: 'Diubah', capacity: '' }],
      ['delete a table', actions.deleteTableAction, { invitationId: mine.id, tableId: mawar }],
      ['seat a guest', actions.assignSeatAction, { invitationId: mine.id, guestId: budi.id, tableId: '', seat: '' }],
      ['mark a souvenir', actions.souvenirAction, { invitationId: mine.id, guestId: budi.id, given: '1' }],
      ['record a gift', actions.recordGiftAction, { invitationId: mine.id, requestKey: randomUUID(), guestId: '', giverName: 'Penyusup', kind: 'envelope', amount: '', note: '' }],
      ['correct a gift', actions.updateGiftAction, { invitationId: mine.id, giftId: k4Id, giverName: 'Diubah', kind: 'other', amount: '', note: '' }],
      ['delete a gift', actions.deleteGiftAction, { invitationId: mine.id, giftId: k4Id }],
    ];
    const callers: [string, Person | null, 'signin' | 'refused'][] = [
      ['a signed-out visitor', null, 'signin'],
      ['an administrator holding a grant', admin, 'signin'],
      ['an outsider', outsider, 'refused'],
      ['a co-host', cohost, 'refused'],
      ['an usher', usher, 'refused'],
    ];
    for (const [label, who, expected] of callers) {
      as(who);
      const shown = await outcome(() => page(mine.id));
      check(`${label}: the page is ${expected === 'signin' ? 'sent to sign-in' : '404'}`, expected === 'signin' ? shown.kind === 'redirect' && shown.url === '/sign-in' : shown.kind === 'notfound', describe(shown));
      const refusedActions = [];
      for (const [name, action, values] of everyAction) {
        const result = await act(action, values);
        const ok = result.kind === 'redirect' && result.url === (expected === 'signin' ? '/sign-in' : '/dashboard/invitations');
        if (!ok) refusedActions.push(`${name}: ${describe(result)}`);
      }
      check(`${label}: all nine actions are refused`, refusedActions.length === 0, refusedActions.join('; '));
      for (const kind of ['seating', 'gifts']) {
        const answer = (await exportOf(mine.id, kind)) as Response;
        const status = who === null ? 401 : who === admin ? 403 : 404;
        check(`${label}: the ${kind} export answers ${status}`, answer.status === status, String(answer.status));
      }
    }
    check('nothing changed on the owner\u2019s invitation after every refused call', (await snapshot(mine.id)) === mineBefore);

    as(outsider);
    const forged: [string, (data: FormData) => Promise<unknown>, Record<string, string | number>, string, string][] = [
      ['the owner\u2019s table renamed through the outsider\u2019s invitation', actions.updateTableAction, { invitationId: theirs.id, tableId: mawar, name: 'Dicuri', capacity: '' }, 'error=table-notfound', 'meja'],
      ['the owner\u2019s table deleted through the outsider\u2019s invitation', actions.deleteTableAction, { invitationId: theirs.id, tableId: mawar }, 'error=table-notfound', 'meja'],
      ['the owner\u2019s guest seated at the outsider\u2019s table', actions.assignSeatAction, { invitationId: theirs.id, guestId: budi.id, tableId: theirTable ?? 0, seat: '' }, 'error=guest-notfound', 'tamu'],
      ['the outsider\u2019s guest seated at the owner\u2019s table', actions.assignSeatAction, { invitationId: theirs.id, guestId: stranger.id, tableId: mawar, seat: '' }, 'error=guest-notfound', 'tamu'],
      ['a souvenir marked for the owner\u2019s guest', actions.souvenirAction, { invitationId: theirs.id, guestId: budi.id, given: '1' }, 'error=guest-notfound', 'tamu'],
      ['a gift recorded against the owner\u2019s guest', actions.recordGiftAction, { invitationId: theirs.id, requestKey: randomUUID(), guestId: budi.id, giverName: '', kind: 'envelope', amount: '', note: '' }, 'error=gift-notfound', 'kado'],
      ['the owner\u2019s gift corrected', actions.updateGiftAction, { invitationId: theirs.id, giftId: k4Id, giverName: 'Dicuri', kind: 'other', amount: '', note: '' }, 'error=gift-notfound', 'kado'],
      ['the owner\u2019s gift deleted', actions.deleteGiftAction, { invitationId: theirs.id, giftId: k4Id }, 'error=gift-notfound', 'kado'],
    ];
    for (const [label, action, values, query, anchor] of forged) {
      const result = await act(action, values);
      check(`forged id: ${label} is not found`, result.kind === 'redirect' && result.url === `/dashboard/invitations/${theirs.id}/logs?${query}#${anchor}`, describe(result));
    }
    check('nothing changed on either invitation after the forged ids', (await snapshot(mine.id)) === mineBefore && (await snapshot(theirs.id)) === theirsBefore);
    as(owner);
    o = await act(actions.updateGiftAction, { invitationId: mine.id, giftId: theirGift, giverName: 'Dicuri', kind: 'other', amount: '', note: '' });
    check('the owner cannot correct the outsider\u2019s gift through their own invitation', redirectedTo(o, 'error=gift-notfound', 'kado') && (await snapshot(theirs.id)) === theirsBefore, describe(o));
    o = await act(actions.deleteTableAction, { invitationId: mine.id, tableId: theirTable ?? 0 });
    check('nor delete the outsider\u2019s table', redirectedTo(o, 'error=table-notfound', 'meja') && (await snapshot(theirs.id)) === theirsBefore, describe(o));

    // ── 4. Flag off: owner-only surfaces gone, rows kept ───────────────────────────────────────────────────────────────
    env.FLAG_HOST_LOGS = 'off';
    const hidden = await outcome(() => page(mine.id));
    check('flag off: the owner\u2019s page is 404', hidden.kind === 'notfound', describe(hidden));
    const offActions = [];
    for (const [name, action, values] of everyAction) {
      const result = await act(action, values);
      if (!(result.kind === 'redirect' && result.url === '/dashboard/invitations')) offActions.push(`${name}: ${describe(result)}`);
    }
    check('flag off: all nine actions are refused for the owner', offActions.length === 0, offActions.join('; '));
    check('flag off: both exports answer 404', ((await exportOf(mine.id, 'seating')) as Response).status === 404 && ((await exportOf(mine.id, 'gifts')) as Response).status === 404);
    const centreOff = await outcome(() => ManagePage({ params: Promise.resolve({ id: String(mine.id) }), searchParams: Promise.resolve({}) } as never));
    check('flag off: the manage centre is back to its seating placeholder', propsOf(centreOff.kind === 'returned' ? centreOff.value : null, 'ManageCenter')?.hostLogsOn === false, describe(centreOff));
    check('flag off: every stored row is kept', (await snapshot(mine.id)) === mineBefore);
    env.FLAG_HOST_LOGS = 'on';
    const back = await outcome(() => page(mine.id));
    const backGifts = (propsOf(back.kind === 'returned' ? back.value : null, 'GiftsSection')?.gifts ?? []) as unknown[];
    check('flag on again: the same tables, seats and gifts return', back.kind === 'returned' && backGifts.length === (await giftRows(mine.id)).length && backGifts.length === 4 && (await snapshot(mine.id)) === mineBefore);
    const centreOn = await outcome(() => ManagePage({ params: Promise.resolve({ id: String(mine.id) }), searchParams: Promise.resolve({}) } as never));
    check('flag on: the manage centre opens the logs', propsOf(centreOn.kind === 'returned' ? centreOn.value : null, 'ManageCenter')?.hostLogsOn === true);

    // ── 5. Privacy of the guest-facing surfaces ────────────────────────────────────────────────────────────────────────
    // I-04: the attributed giver and the side's stored name join G-045's values.
    const secrets = ['Mawar Rahasia', 'Melati Rahasia', 'Kursi-77Q', 'Pemberi Rahasia', 'Catatan-Rahasia-Kado', '250000', '1000000', 'seatingPlan', 'Pak RT', 'family_side', 'familySide'];
    const leaks = (text: string) => secrets.filter((secret) => text.includes(secret));
    const linkPayload = await loadPublicInvitation(mine.slug);
    const personalPayload = await loadPublicInvitation(mine.slug, budi.slug);
    check('the guest page\u2019s payload (link) carries no table, seat, souvenir or gift', linkPayload !== null && leaks(JSON.stringify(linkPayload.config)).length === 0, leaks(JSON.stringify(linkPayload?.config)).join(', '));
    check('the guest page\u2019s payload (personal link) carries none either', personalPayload?.guest?.id === budi.id && leaks(JSON.stringify({ ...personalPayload, invitation: undefined })).length === 0,
      leaks(JSON.stringify({ ...personalPayload, invitation: undefined })).join(', '));
    for (const [label, who] of [
      ['the owner', owner],
      ['an usher', usher],
    ] as const) {
      as(who);
      const desk = await outcome(() => CheckinPage({ params: Promise.resolve({ id: String(mine.id) }) }));
      const json = desk.kind === 'returned' ? treeJson(desk.value) : '';
      check(`the check-in desk for ${label} lists guests without any table, seat, souvenir or gift`, desk.kind === 'returned' && json.includes('Budi Hartono') && leaks(json).length === 0, `${describe(desk)} ${leaks(json).join(', ')}`);
    }

    // ── 6. A deleted table and a deleted gift ──────────────────────────────────────────────────────────────────────────
    as(owner);
    o = await act(actions.deleteGiftAction, { invitationId: mine.id, giftId: k4Id });
    check('a gift entry is deleted', redirectedTo(o, 'notice=gift-deleted', 'kado') && (await giftRows(mine.id, k4)).length === 0, describe(o));
    o = await act(actions.deleteTableAction, { invitationId: mine.id, tableId: mawar });
    const unseated = await sql`select guest_id from guest_logs where invitation_id = ${mine.id} and (table_id is not null or seat is not null)`;
    check('a deleted table leaves its guests unseated with no stale seat label, the souvenir kept', redirectedTo(o, 'notice=table-deleted', 'meja') && unseated.length === 0 && ms((await seatOf(sari.id))?.souvenir_at) === storedSari,
      `${describe(o)} ${unseated.length} still seated`);
    check('the outsider\u2019s rows were never touched', (await snapshot(theirs.id)) === theirsBefore);
  } finally {
    as(null);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    if (created.invitations.length) {
      await sql`delete from guests where invitation_id in ${sql(created.invitations)}`;
      await sql`delete from invitations where id in ${sql(created.invitations)}`;
    }
    if (created.users.length) await sql`delete from users where id in ${sql(created.users)}`;
    await sql.end();
  }
  console.log(failures ? `verify-host-logs: ${failures} FAILED, ${passes} passed` : `verify-host-logs: all ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
