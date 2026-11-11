/**
 * B-031 end to end (D-063): the owner's deletion and restore on a scratch database, through product code. Only Next.js's
 * request primitives and Clerk's session are stubbed; the actions, pages, loaders, routes, access checks and writers are
 * the real ones. Durations are fixture values (a 30-day window), not policy.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/scratch npx tsx scripts/verify-retention.ts
 *   JOBS_BIN=…/invitesion-jobs POSTGRES_URL=… npx tsx scripts/verify-retention.ts   # plus the Rust purge, cross-language
 *   REQUIRE_JOBS_BIN=1 JOBS_BIN=… POSTGRES_URL=… npx tsx scripts/verify-retention.ts  # CI (scripts/ci/rust.sh): no skip
 *
 * It proves, with the answer and the stored rows each time:
 *  1. availability: flag off, or on without a window, refuses at the action with nothing written; the list offers the
 *     control only when both are set;
 *  2. the boundary: an outsider, a co-host holding a live grant and a post without the confirmation change nothing;
 *  3. the owner's deletion: one transaction writes `deleted_at`, `purge_after` and the purge job (payload, dedupe key,
 *     run time, attempts); a repeat answers `already`; two concurrent deletions write one deletion and one job;
 *  4. gone everywhere: the guest page, personal link and pass, the side routes, the owner preview, the manage page, the
 *     registration page, every access check, every writer (content, host logs, roster, team links, self-registration,
 *     publish, the guest's RSVP and wish forms, the dashboard's guest operation and wish moderation), no view or guest
 *     event recorded, the public media check; the list shows it deleted with its restore only. Each refused page and
 *     action is first shown working while the invitation is live. A pending order settled after a draft's deletion
 *     (an administrator's confirmation; a late webhook takes the same path) is recorded but never activates the draft,
 *     which a restore brings back exactly as it was, its payment counting for publishing;
 *  5. restore: refused to an outsider, allowed with the flag off, the invitation back exactly as it was;
 *  6. purged: restore and deletion refused, the tombstone off the list;
 *  7. with JOBS_BIN, the real binary under a configuration built from nothing (scratch database, disposable upload root,
 *     no S3, durations only in the sweep's own passes): the stale job of section 5's restore finishes without touching
 *     the invitation; the dry run is read-only (rows, money, invitation, job and files unchanged) and lists what the purge
 *     removes; with storage refusing deletions the rows and tombstone commit, the job records its objects and retries,
 *     and the retry removes them; a key another invitation uses is kept, and the order, payment and webhook event stay
 *     on the tombstone; the restore then answers "purged". The retention sweep does nothing without both durations,
 *     then deletes an expired invitation with the payload and dedupe key Next.js writes; Next.js lists it, its owner
 *     restores it, the next sweep deletes it again with a fresh full window (D-063's open question), and the stale
 *     sweep job purges nothing.
 *     Without JOBS_BIN section 7 is skipped; with REQUIRE_JOBS_BIN=1 a missing or non-executable binary FAILS, and the
 *     summary line names `rust section: ran` only when it ran.
 * Fixture rows are fictional, tagged per run and removed.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  'next/headers': {
    headers: async () => new Headers({ 'x-forwarded-proto': 'https', host: 'app.test' }),
    cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  },
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
const describe = (o: Outcome) =>
  o.kind === 'redirect' ? `redirect ${o.url}` : o.kind === 'returned' && o.value instanceof Response ? `status ${o.value.status}` : o.kind;
const redirectedTo = (o: Outcome, fragment: string) => o.kind === 'redirect' && o.url.includes(fragment);
const status = (o: Outcome) => (o.kind === 'returned' && o.value instanceof Response ? o.value.status : o.kind === 'notfound' ? 404 : -1);

/** Every element in a rendered tree whose component has this name (nested components are not called). */
function elementsOf(node: unknown, name: string, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, name, found);
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof element.type === 'function' && (element.type as { name?: string }).name === name && element.props) found.push(element.props);
  if (element.props) for (const value of Object.values(element.props)) elementsOf(value, name, found);
  return found;
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

/** Every file under `root`, as sorted keys relative to it. */
function listFiles(root: string, dir = ''): string[] {
  const here = join(root, dir);
  if (!existsSync(here)) return [];
  return readdirSync(here, { withFileTypes: true })
    .flatMap((entry) => {
      const key = dir ? `${dir}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(root, key) : [key];
    })
    .sort();
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const DAY = 86_400_000;

async function main() {
  const { client: sql } = await import('../lib/db/drizzle');
  const deletion = await import('../lib/invitation/deletion-db');
  const actions = await import('../app/(customer)/dashboard/invitations/actions');
  const { default: ListPage } = await import('../app/(customer)/dashboard/invitations/page');
  const { default: GuestPage } = await import('../app/i/[slug]/page');
  const { default: PersonalPage } = await import('../app/i/[slug]/[guestSlug]/page');
  const { GET: calendarRoute } = await import('../app/i/[slug]/calendar.ics/route');
  const { GET: ogRoute } = await import('../app/i/[slug]/og.png/route');
  const { default: PreviewPage } = await import('../app/preview/[id]/page');
  const { default: ManagePage } = await import('../app/(customer)/dashboard/invitations/[id]/manage/page');
  const { default: RegistrationPage } = await import('../app/daftar/[token]/page');
  const { submitRsvp, submitGuestMessage } = await import('../app/i/[slug]/actions');
  const { default: PassPage } = await import('../app/i/[slug]/[guestSlug]/pass/page');
  const { updateGuestOperation } = await import('../app/(customer)/dashboard/invitations/[id]/guests/actions');
  const { moderateWish } = await import('../app/(customer)/dashboard/invitations/[id]/wishes/actions');
  const publicLoaders = await import('../lib/invitation/public');
  const members = await import('../lib/invitation/members-db');
  const { requireOwnedInvitation, OwnershipError } = await import('../lib/invitation/service');
  const { writeContentNext } = await import('../lib/invitation/content-next');
  const { addTable } = await import('../lib/invitation/host-logs-db');
  const { addGuestNext, registerNext } = await import('../lib/invitation/roster-next');
  const { PURGE_JOB_KIND, PURGE_MAX_ATTEMPTS } = await import('../lib/invitation/retention');
  const paymentService = await import('../lib/payment/service');

  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const created = { users: [] as number[], invitations: [] as number[] };
  const names = [
    'FLAG_INVITATION_DELETION', 'INVITATION_DELETION_WINDOW_DAYS', 'INVITATION_RETENTION_DAYS_AFTER_EXPIRY', 'FLAG_TEAM_ACCESS',
    'FLAG_SELF_REGISTRATION', 'FLAG_GUEST_CALENDAR', 'FLAG_GUEST_PASS', 'GUEST_PASS_SECRET', 'GUEST_PASS_SECRET_PREVIOUS',
    'FLAG_RSVP_PER_EVENT', 'FLAG_INVITE_ONLY_EVENTS', 'BACKEND_RSVP', 'BACKEND_CONTENT', 'BACKEND_ROSTER', 'BACKEND_WISHES',
  ];
  const saved = Object.fromEntries(names.map((name) => [name, env[name]]));
  for (const name of names) delete env[name];
  env.FLAG_TEAM_ACCESS = 'on';
  env.FLAG_SELF_REGISTRATION = 'on';
  env.FLAG_GUEST_CALENDAR = 'on';
  env.FLAG_GUEST_PASS = 'on';
  env.GUEST_PASS_SECRET = randomBytes(32).toString('hex');
  const uploads = join(tmpdir(), `invitesion-b031-verify-${tag}`);
  let rustRan = false;

  type Person = { id: number; clerk: string };
  async function person(name: string): Promise<Person> {
    const clerk = `user_b031v_${name}_${tag}`;
    const [row] = await sql`insert into users (email, clerk_user_id, name) values (${`b031v-${name}-${tag}@example.invalid`}, ${clerk}, ${`Uji ${name}`}) returning id`;
    created.users.push(row.id);
    return { id: row.id as number, clerk };
  }
  const as = (who: Person | null) => {
    session.clerkUserId = who?.clerk ?? null;
  };
  const config = {
    settings: { title: 'Budi & Sari' },
    events: [{ id: 'akad', title: 'Akad Nikah', startAt: '2027-02-14T09:00:00+07:00', venueName: 'Masjid Raya Contoh', address: 'Jl. Contoh 1' }],
    checkInSettings: { enabled: true },
  };
  /** A published wedding; `expiredDaysAgo` puts its active period that far in the past instead of 300 days ahead. */
  async function invitation(owner: Person, name: string, content: object = config, expiredDaysAgo?: number): Promise<{ id: number; slug: string }> {
    const slug = `b031v-${name}-${tag}`;
    const expiresIn = `${expiredDaysAgo === undefined ? 300 : -expiredDaysAgo} days`;
    const [row] = await sql`insert into invitations (user_id, slug, event_type, status, config, published_at, expires_at)
      values (${owner.id}, ${slug}, 'wedding', 'PUBLISHED', ${JSON.stringify(content)}::text::jsonb, now(), now() + ${expiresIn}::interval) returning id`;
    created.invitations.push(row.id);
    return { id: row.id as number, slug };
  }
  async function guest(invitationId: number, name: string): Promise<{ id: number; slug: string }> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
    const [row] = await sql`insert into guests (invitation_id, name, slug) values (${invitationId}, ${name}, ${slug}) returning id`;
    return { id: row.id as number, slug };
  }
  const rowOf = async (id: number) =>
    (await sql`select status, config, published_at, expires_at, deleted_at, purge_after, purged_at from invitations where id = ${id}`)[0];
  const jobsOf = async (id: number) =>
    sql`select kind, payload, dedupe_key, run_at, max_attempts from jobs where kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int = ${id} order by id`;
  const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value), searchParams: Promise.resolve({}) });

  try {
    const owner = await person('owner');
    const outsider = await person('outsider');
    const cohost = await person('cohost');
    const mine = await invitation(owner, 'mine');
    const budi = await guest(mine.id, 'Budi Hartono');
    await sql`insert into invitation_members (invitation_id, user_id, role, label, token_hash, expires_at, accepted_at)
      values (${mine.id}, ${cohost.id}, 'cohost', 'Ipar', ${`cohost-${tag}`}, now() + interval '7 days', now())`;
    const teamLink = await members.createJoinLink(owner.id, mine.id, { role: 'usher', label: 'Pintu' });
    const joinToken = teamLink.kind === 'created' ? teamLink.token : '';
    const regToken = `r${tag}${randomUUID().replaceAll('-', '').slice(0, 19)}`;
    await sql`insert into guest_registration_links (invitation_id, token) values (${mine.id}, ${regToken})`;
    const [wish] = await sql`insert into guest_messages (invitation_id, guest_id, name, message) values (${mine.id}, ${budi.id}, 'Budi', 'Selamat berbahagia') returning id`;
    const wishId = wish.id as number;
    const before = await rowOf(mine.id);
    check('fixture: the invitation is live for guests, its owner and its co-host', Boolean(await publicLoaders.loadPublicInvitation(mine.slug, budi.slug)) && Boolean(await members.accessFor(cohost.id, mine.id, 'guests')) && joinToken !== '');
    // Positive controls: each page and action that must refuse the deleted invitation works while it is live.
    as(null);
    const livePass = await outcome(() => PassPage(params({ slug: mine.slug, guestSlug: budi.slug }) as never));
    check('control: the guest pass renders while the invitation is live', livePass.kind === 'returned', describe(livePass));
    as(owner);
    const liveModeration = await outcome(() => moderateWish(form({ invitationId: mine.id, wishId, action: 'show' })));
    check('control: the owner moderates a wish while the invitation is live', redirectedTo(liveModeration, 'done=show'), describe(liveModeration));
    const liveOperation = await outcome(() => updateGuestOperation(form({ invitationId: mine.id, guestId: budi.id, operation: 'CONFIRMED' })));
    const confirmed = (await sql`select rsvp_status from guests where id = ${budi.id}`)[0].rsvp_status;
    check('control: the dashboard\u2019s guest operation writes while the invitation is live', liveOperation.kind === 'returned' && confirmed === 'CONFIRMED', `${describe(liveOperation)} ${confirmed}`);

    // ── 1. Availability.
    as(owner);
    let o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    check('flag off: the action refuses and writes nothing', redirectedTo(o, 'error=deletion-off') && (await rowOf(mine.id)).deleted_at === null && (await jobsOf(mine.id)).length === 0, describe(o));
    let page = await ListPage({ searchParams: Promise.resolve({}) });
    check('flag off: no delete control on the list', elementsOf(page, 'DeleteControl').length === 0);
    env.FLAG_INVITATION_DELETION = 'on';
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    check('flag on without a window: still refused, nothing written', redirectedTo(o, 'error=deletion-off') && (await rowOf(mine.id)).deleted_at === null, describe(o));
    env.INVITATION_DELETION_WINDOW_DAYS = '30';
    page = await ListPage({ searchParams: Promise.resolve({}) });
    const controls = elementsOf(page, 'DeleteControl');
    check('flag on with a window: the card offers deletion with the window', controls.length === 1 && controls[0].id === mine.id && controls[0].windowDays === 30);

    // ── 2. The boundary.
    as(outsider);
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    check('an outsider is refused as "not found", nothing written', redirectedTo(o, 'error=notfound') && (await rowOf(mine.id)).deleted_at === null, describe(o));
    as(cohost);
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    check('a co-host with a live grant cannot delete (owner only)', redirectedTo(o, 'error=notfound') && (await rowOf(mine.id)).deleted_at === null, describe(o));
    as(owner);
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id })));
    check('a post without the confirmation changes nothing', redirectedTo(o, 'error=unconfirmed') && (await rowOf(mine.id)).deleted_at === null, describe(o));
    as(null);
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    check('signed out: sent to sign in', redirectedTo(o, '/sign-in'), describe(o));

    // ── 3. The owner's deletion.
    as(owner);
    const t = Date.now();
    o = await outcome(() => actions.deleteInvitation(form({ invitationId: mine.id, confirm: 'yes' })));
    const deleted = await rowOf(mine.id);
    const jobs = await jobsOf(mine.id);
    const deletedAt = ms(deleted.deleted_at);
    check('the owner deletes: redirected with the notice', redirectedTo(o, `deleted=${mine.id}`), describe(o));
    check('deleted_at now, purge_after 30 days later, status and content untouched',
      Math.abs(deletedAt - t) < 60_000 && ms(deleted.purge_after) - deletedAt === 30 * DAY && deleted.status === 'PUBLISHED' && JSON.stringify(deleted.config) === JSON.stringify(before.config));
    check('one purge job in the same transaction: payload, dedupe key, run time, attempts',
      jobs.length === 1 && jobs[0].payload.invitationId === mine.id && jobs[0].payload.deletedAt === new Date(deletedAt).toISOString() &&
        jobs[0].dedupe_key === `invitation:${mine.id}:${deletedAt}` && ms(jobs[0].run_at) === ms(deleted.purge_after) && jobs[0].max_attempts === PURGE_MAX_ATTEMPTS,
      JSON.stringify(jobs));
    const again = await deletion.scheduleInvitationDeletion(owner.id, mine.id);
    check('a repeated deletion answers "already" with the original date, no second job', again.kind === 'already' && again.purgeAfter.getTime() === ms(deleted.purge_after) && (await jobsOf(mine.id)).length === 1);
    const racing = await invitation(owner, 'racing');
    const both = await Promise.all([deletion.scheduleInvitationDeletion(owner.id, racing.id), deletion.scheduleInvitationDeletion(owner.id, racing.id)]);
    check('two concurrent deletions: one scheduled, one already, one job', both.map((r) => r.kind).sort().join() === 'already,scheduled' && (await jobsOf(racing.id)).length === 1, JSON.stringify(both));

    // ── 4. Gone everywhere.
    check('guest loaders: the page, a personal link, the owner preview\u2019s load, the side-route loaders all answer nothing',
      !(await publicLoaders.loadPublicInvitation(mine.slug)) && !(await publicLoaders.loadPublicInvitation(mine.slug, budi.slug)) &&
        !(await publicLoaders.loadPublicInvitation(mine.slug, undefined, true)) && !(await publicLoaders.loadPublishedInvitationSummary(mine.slug)) &&
        !(await publicLoaders.loadInvitationForGiftAudience(mine.slug)) && !(await publicLoaders.loadInvitationForGiftAudience(mine.slug, budi.slug)));
    const guestEvents = async () => (await sql`select count(*)::int as n from analytics_events where invitation_id = ${mine.id}`)[0].n as number;
    const eventsBefore = await guestEvents();
    as(null);
    o = await outcome(() => GuestPage(params({ slug: mine.slug }) as never));
    check('the guest page is a 404', o.kind === 'notfound', describe(o));
    o = await outcome(() => PersonalPage(params({ slug: mine.slug, guestSlug: budi.slug }) as never));
    check('the personal link is a 404', o.kind === 'notfound', describe(o));
    o = await outcome(() => calendarRoute(new Request('https://app.test/'), { params: Promise.resolve({ slug: mine.slug }) }));
    check('the calendar file is a 404', status(o) === 404, describe(o));
    o = await outcome(() => ogRoute(new Request('https://app.test/'), { params: Promise.resolve({ slug: mine.slug }) } as never));
    check('the link-preview image is a 404', status(o) === 404, describe(o));
    o = await outcome(() => RegistrationPage({ params: Promise.resolve({ token: regToken }), searchParams: Promise.resolve({}) }));
    check('the self-registration page is a 404', o.kind === 'notfound', describe(o));
    const registered = await registerNext({ token: regToken, row: { name: 'Dewi Lestari' } });
    check('a self-registration post is refused (closed)', registered.kind === 'closed', JSON.stringify(registered));
    const rsvpBefore = (await sql`select rsvp_status from guests where id = ${budi.id}`)[0].rsvp_status;
    o = await outcome(() => submitRsvp(form({ slug: mine.slug, guestSlug: budi.slug, status: 'attending', attendingCount: 1 })));
    const rsvpAfter = (await sql`select rsvp_status from guests where id = ${budi.id}`)[0].rsvp_status;
    check('an old RSVP form posted after the deletion is refused, nothing written', redirectedTo(o, 'rsvp=closed') && rsvpAfter === rsvpBefore, `${describe(o)} ${rsvpBefore}->${rsvpAfter}`);
    o = await outcome(() => PassPage(params({ slug: mine.slug, guestSlug: budi.slug }) as never));
    check('the guest pass is a 404', o.kind === 'notfound', describe(o));
    const wishCount = async () => (await sql`select count(*)::int as n from guest_messages where invitation_id = ${mine.id}`)[0].n as number;
    const wishesBefore = await wishCount();
    o = await outcome(() => submitGuestMessage(form({ slug: mine.slug, guestSlug: budi.slug, message: 'Selamat menempuh hidup baru' })));
    check('an old wish form posted after the deletion is refused, nothing written', redirectedTo(o, 'wish=closed') && (await wishCount()) === wishesBefore, describe(o));
    check('no view or other guest event was recorded for the refused visits and posts', (await guestEvents()) === eventsBefore);

    as(owner);
    o = await outcome(() => PreviewPage(params({ id: String(mine.id) }) as never));
    check('the owner preview is a 404', o.kind === 'notfound', describe(o));
    o = await outcome(() => ManagePage({ params: Promise.resolve({ id: String(mine.id) }), searchParams: Promise.resolve({}) }));
    check('the manage page is a 404', o.kind === 'notfound', describe(o));
    const ownerError = await requireOwnedInvitation(mine.id, owner.id).then(() => null, (e: unknown) => e);
    check('access checks: owner and co-host hold nothing, requireOwnedInvitation refuses, the shared list drops it',
      !(await members.invitationAccess(owner.id, mine.id)) && !(await members.accessFor(cohost.id, mine.id, 'guests')) && ownerError instanceof OwnershipError &&
        !(await members.sharedInvitations(cohost.id)).some((s) => s.invitationId === mine.id));
    const contentBefore = JSON.stringify((await rowOf(mine.id)).config);
    const written = await writeContentNext({ userId: owner.id, invitationId: mine.id, baseVersion: 0, config: { settings: { title: 'Diubah' } } as never, touchedSections: ['settings'] });
    check('the content writer refuses ("not found"), the config unchanged', written.kind === 'notfound' && JSON.stringify((await rowOf(mine.id)).config) === contentBefore, JSON.stringify(written));
    check('the host-logs writer refuses', (await addTable(owner.id, mine.id, { name: 'Meja 9', capacity: null })).kind === 'notfound');
    const guestsBefore = (await sql`select count(*)::int as n from guests where invitation_id = ${mine.id}`)[0].n;
    const added = await addGuestNext({ userId: owner.id, invitationId: mine.id, row: { name: 'Tamu Baru' }, invitedEventIds: [], flags: { opaqueLinks: true, inviteOnlyEvents: false } });
    const guestsAfter = (await sql`select count(*)::int as n from guests where invitation_id = ${mine.id}`)[0].n;
    check('the roster writer refuses, no guest added', added.kind === 'notfound' && guestsAfter === guestsBefore, JSON.stringify(added));
    check('team links: a new one refused, an issued one shows nothing and cannot be accepted',
      (await members.createJoinLink(owner.id, mine.id, { role: 'usher', label: 'Lagi' })).kind === 'notfound' &&
        (await members.joinPreview(joinToken, outsider.id)).state === 'invalid' && (await members.acceptJoinLink(outsider.id, joinToken)).kind === 'invalid');
    o = await outcome(() => actions.publish(form({ invitationId: mine.id })));
    check('publishing is refused as "not found"', redirectedTo(o, 'error=notfound'), describe(o));
    const answerOf = async () => (await sql`select rsvp_status from guests where id = ${budi.id}`)[0].rsvp_status as string;
    const heldAnswer = await answerOf();
    o = await outcome(() => updateGuestOperation(form({ invitationId: mine.id, guestId: budi.id, operation: 'DECLINED' })));
    check('the dashboard\u2019s guest operation is refused (back to the list), the answer unchanged', o.kind === 'redirect' && o.url === '/dashboard/invitations' && (await answerOf()) === heldAnswer, describe(o));
    o = await outcome(() => moderateWish(form({ invitationId: mine.id, wishId, action: 'hide' })));
    const hidden = (await sql`select is_hidden from guest_messages where id = ${wishId}`)[0].is_hidden;
    check('wish moderation is refused (back to the list), the wish unchanged', o.kind === 'redirect' && o.url === '/dashboard/invitations' && hidden === false, `${describe(o)} hidden=${hidden}`);
    check('the public media check refuses this invitation\u2019s uploads; an unknown id behaves as before', (await deletion.invitationMediaGone(mine.id)) && !(await deletion.invitationMediaGone(2_000_000_000)));

    page = await ListPage({ searchParams: Promise.resolve({}) });
    const deletedCards = elementsOf(page, 'DeletedCard');
    const mineCard = deletedCards.find((card) => card.id === mine.id);
    check('the list shows it deleted, with the purge date, and no delete control or other link for it',
      Boolean(mineCard) && (mineCard?.purgeAfter as Date).getTime() === ms(deleted.purge_after) && !elementsOf(page, 'DeleteControl').some((c) => c.id === mine.id) && !elementsOf(page, 'PublishControl').some((c) => c.id === mine.id));

    // ── 4b. A payment that settles after the deletion: a draft's pending QRIS order, confirmed by an administrator once the
    //        owner has deleted the draft (a late webhook takes the same settlement path). The money is recorded; the
    //        deleted draft is not activated, and restored it is exactly as it was, its payment counting for publishing.
    const [draftRow] = await sql`insert into invitations (user_id, slug, event_type, status, config)
      values (${owner.id}, ${`b031v-draft-${tag}`}, 'wedding', 'DRAFT', ${JSON.stringify(config)}::text::jsonb) returning id`;
    created.invitations.push(draftRow.id);
    const draftId = draftRow.id as number;
    const pendingRef = `b031v-pending-${tag}`;
    await sql`insert into orders (user_id, invitation_id, amount, rail, reference, status) values (${owner.id}, ${draftId}, 149000, 'qris', ${pendingRef}, 'PENDING')`;
    const draftDeletion = await deletion.scheduleInvitationDeletion(owner.id, draftId);
    const draftDeleted = await rowOf(draftId);
    const settlement = await paymentService.confirmManually({ reference: pendingRef, adminUserId: outsider.id, note: 'b031v' });
    const draftAfter = await rowOf(draftId);
    const [paidOrder] = await sql`select o.status, (select count(*) from payments p where p.order_id = o.id)::int as payments,
      (select count(*) from payment_events e where e.order_id = o.id)::int as events from orders o where o.reference = ${pendingRef}`;
    check('a payment settling after the deletion is recorded (order PAID, its payment and event) and never activates the deleted draft',
      draftDeletion.kind === 'scheduled' && settlement.applied && settlement.invitationActivated === false && paidOrder.status === 'PAID' && paidOrder.payments === 1 &&
        paidOrder.events === 1 && draftAfter.status === 'DRAFT' && draftAfter.published_at === null && draftAfter.expires_at === null &&
        ms(draftAfter.deleted_at) === ms(draftDeleted.deleted_at),
      JSON.stringify({ draftDeletion, settlement, paidOrder, draftAfter }));
    const draftRestore = await deletion.restoreDeletedInvitation(owner.id, draftId);
    const draftRestored = await rowOf(draftId);
    check('restored, the draft is exactly as it was and its payment counts for publishing',
      draftRestore.kind === 'restored' && draftRestored.status === 'DRAFT' && draftRestored.published_at === null && draftRestored.deleted_at === null &&
        (await paymentService.hasPaidOrder(draftId, null)),
      JSON.stringify({ draftRestore, draftRestored }));

    // ── 5. Restore.
    as(outsider);
    o = await outcome(() => actions.restoreInvitation(form({ invitationId: mine.id })));
    check('an outsider cannot restore', redirectedTo(o, 'error=notfound') && (await rowOf(mine.id)).deleted_at !== null, describe(o));
    as(owner);
    delete env.FLAG_INVITATION_DELETION;
    o = await outcome(() => actions.restoreInvitation(form({ invitationId: mine.id })));
    const restored = await rowOf(mine.id);
    check('the owner restores with the flag off', redirectedTo(o, `restored=${mine.id}`) && restored.deleted_at === null && restored.purge_after === null, describe(o));
    check('it returns exactly as it was (status, dates, content)',
      restored.status === before.status && ms(restored.published_at) === ms(before.published_at) && ms(restored.expires_at) === ms(before.expires_at) && JSON.stringify(restored.config) === JSON.stringify(before.config));
    check('guests, the co-host and its public uploads have it back',
      Boolean(await publicLoaders.loadPublicInvitation(mine.slug, budi.slug)) && Boolean(await members.accessFor(cohost.id, mine.id, 'guests')) && !(await deletion.invitationMediaGone(mine.id)));
    check('the earlier job stays, naming the earlier deletion (the purge finds a different deleted_at and does nothing)', (await jobsOf(mine.id))[0]?.payload.deletedAt === new Date(deletedAt).toISOString());
    const restoreLive = await deletion.restoreDeletedInvitation(owner.id, mine.id);
    check('restoring a live invitation answers "live"', restoreLive.kind === 'live');

    // ── 6. Purged (the columns the Rust job leaves): no restore, no deletion, off the list.
    env.FLAG_INVITATION_DELETION = 'on';
    await sql`update invitations set config = null, purged_at = now() where id = ${racing.id}`;
    o = await outcome(() => actions.restoreInvitation(form({ invitationId: racing.id })));
    check('a purged invitation cannot be restored', redirectedTo(o, 'error=purged'), describe(o));
    check('nor deleted again', (await deletion.scheduleInvitationDeletion(owner.id, racing.id)).kind === 'notfound');
    page = await ListPage({ searchParams: Promise.resolve({}) });
    check('the tombstone is off the owner\u2019s list', !elementsOf(page, 'DeletedCard').some((c) => c.id === racing.id) && !elementsOf(page, 'PublishControl').some((c) => c.id === racing.id));

    // ��─ 7. Cross-language: the Rust runner consumes the jobs Next.js wrote, and Next.js reads what the Rust sweep wrote.
    const jobsBin = env.JOBS_BIN?.trim() ?? '';
    const rustRequired = env.REQUIRE_JOBS_BIN === '1';
    if (!jobsBin || !isExecutableFile(jobsBin)) {
      if (rustRequired) {
        check('7: JOBS_BIN names an executable invitesion-jobs (REQUIRE_JOBS_BIN=1: the Rust section must run)', false, jobsBin ? `not an executable file: ${jobsBin}` : 'JOBS_BIN is not set');
      } else {
        console.log('SKIP  7 (set JOBS_BIN to the invitesion-jobs binary to run the Rust purge against these jobs)');
      }
    } else {
      rustRan = true;
      // A configuration built from nothing: the scratch database, the disposable upload root, no S3 and no retention
      // durations except in the sweep's own passes. Nothing else from the caller's environment reaches the binary.
      const jobsEnv = (extra: Record<string, string> = {}): Record<string, string | undefined> => ({
        PATH: env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
        DATABASE_URL: env.POSTGRES_URL as string,
        UPLOAD_ROOT: uploads,
        JOBS_BATCH: '200',
        RUST_LOG: 'warn',
        ...extra,
      });
      const lastLine = (out: string) => out.trim().split('\n').pop() ?? '{}';
      const runJobs = (args: string[] = [], extra?: Record<string, string>) =>
        // Next 16's types require NODE_ENV on ProcessEnv; this environment is deliberately built without it.
        JSON.parse(lastLine(execFileSync(jobsBin, args, { env: jobsEnv(extra) as NodeJS.ProcessEnv, encoding: 'utf8' }))) as Record<string, any>;
      const makeDue = (jobId: number) => sql`update jobs set run_at = (now() at time zone 'utc') - interval '1 minute' where id = ${jobId}`;
      const jobRow = async (id: number) => (await sql`select payload, attempts, done_at, last_error from jobs where id = ${id}`)[0];
      const purgeJobIds = async (invitationId: number) =>
        (await sql`select id from jobs where kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int = ${invitationId} order by id`).map((r) => r.id as number);
      const rowsOf = async (id: number) => (await sql`select (select count(*) from guests where invitation_id = ${id})::int as guests,
        (select count(*) from guest_messages where invitation_id = ${id})::int as wishes,
        (select count(*) from media_assets where invitation_id = ${id})::int as media`)[0];
      const moneyOf = async (id: number) => (await sql`select (select count(*) from orders where invitation_id = ${id})::int as orders,
        (select count(*) from payments p join orders o on o.id = p.order_id where o.invitation_id = ${id})::int as payments,
        (select count(*) from payment_events e join orders o on o.id = e.order_id where o.invitation_id = ${id})::int as events,
        (select string_agg(status, ',') from orders where invitation_id = ${id}) as statuses`)[0];

      // 7a. The job of section 5's restored deletion comes due; the invitation is live.
      const [staleJob] = await purgeJobIds(mine.id);
      await makeDue(staleJob);
      const mineLive = await rowOf(mine.id);

      // 7b. An invitation with a wish, an order with its payment and webhook event, and five uploads: one its media row
      //     refers to, an orphan, a protected child photo, one another live invitation also uses, and a guest photo
      //     (I-21, D-070: a `guest-photo` media row whose file is under the protected prefix).
      const doomed = await invitation(owner, 'doomed');
      // G-047 (D-069, R-X10): a passcode-protected invitation; its hash and time must not outlive the purge.
      await sql`update invitations set guest_passcode_hash = ${`scrypt$16384$8$1$${'a'.repeat(22)}$${'b'.repeat(43)}`}, guest_passcode_set_at = now() where id = ${doomed.id}`;
      const passcodeOf = async (id: number) =>
        (await sql`select guest_passcode_hash is not null as hash, guest_passcode_set_at is not null as set from invitations where id = ${id}`)[0];
      const protectedBefore = await passcodeOf(doomed.id);
      const sari = await guest(doomed.id, 'Sari Wulandari');
      await sql`insert into guest_messages (invitation_id, guest_id, name, message) values (${doomed.id}, ${sari.id}, 'Sari', 'Bahagia selalu')`;
      const key = (prefix: string, n: string, ext: string) => `${prefix}/${tag}${n.padStart(12, '0')}.${ext}`;
      const keys = {
        referenced: key(String(doomed.id), 'a', 'jpg'),
        orphan: key(String(doomed.id), 'b', 'jpg'),
        child: key(`protected/${doomed.id}`, 'c', 'png'),
        shared: key(String(doomed.id), 'd', 'jpg'),
        guestPhoto: key(`protected/${doomed.id}`, 'e', 'jpg'),
      };
      const withShared = { ...config, gallery: [`/media/${keys.shared}`] };
      await sql`update invitations set config = ${JSON.stringify(withShared)}::text::jsonb where id = ${doomed.id}`;
      const sharing = await invitation(owner, 'sharing', withShared);
      await sql`insert into media_assets (invitation_id, type, url) values (${doomed.id}, 'image', ${`/media/${keys.referenced}`})`;
      await sql`insert into media_assets (invitation_id, type, url, source, meta)
        values (${doomed.id}, 'guest-photo', ${`/media/${keys.guestPhoto}`}, 'guest', ${JSON.stringify({ guestId: sari.id, review: 'visible' })}::text::jsonb)`;
      for (const k of Object.values(keys)) {
        mkdirSync(join(uploads, k, '..'), { recursive: true });
        writeFileSync(join(uploads, k), 'bytes');
      }
      const [order] = await sql`insert into orders (user_id, invitation_id, amount, rail, reference, status)
        values (${owner.id}, ${doomed.id}, 149000, 'qris', ${`b031v-${tag}`}, 'PAID') returning id`;
      await sql`insert into payments (order_id, provider) values (${order.id}, 'qris')`;
      await sql`insert into payment_events (rail, event_id, order_id) values ('qris', ${`b031v-ev-${tag}`}, ${order.id})`;

      const o7 = await outcome(() => actions.deleteInvitation(form({ invitationId: doomed.id, confirm: 'yes' })));
      // The window passes: a zero-length window is the only shortening the check constraint allows (purge_after >= deleted_at).
      await sql`update invitations set purge_after = deleted_at where id = ${doomed.id}`;
      const [doomedJob] = await purgeJobIds(doomed.id);
      await sql`update jobs set run_at = (select deleted_at from invitations where id = ${doomed.id}) where id = ${doomedJob}`;

      const snapshot = async () =>
        JSON.stringify({ rows: await rowsOf(doomed.id), money: await moneyOf(doomed.id), invitation: await rowOf(doomed.id), job: await jobRow(doomedJob), files: listFiles(uploads) });
      const beforePlan = await snapshot();
      const plan = runJobs(['--plan-purge', String(doomed.id)]);
      const own = [keys.referenced, keys.orphan, keys.child, keys.guestPhoto].sort();
      const retained = (table: string) => plan.retained?.find((r: { table: string }) => r.table === table)?.rows;
      check('the dry run (Rust) sees the deletion due, its rows and own objects, keeps the shared key, counts the money it keeps',
        redirectedTo(o7, `deleted=${doomed.id}`) && plan.state === 'due' && JSON.stringify(plan.objects) === JSON.stringify(own) &&
          JSON.stringify(plan.keptShared) === JSON.stringify([keys.shared]) && plan.rows?.find((r: { table: string }) => r.table === 'guest_messages')?.rows === 1 &&
          retained('orders') === 1 && retained('payments') === 1 && retained('payment_events') === 1,
        JSON.stringify(plan));
      check('the dry run changed nothing: rows, money, the invitation, its job and every file', (await snapshot()) === beforePlan);

      // Storage refuses one deletion for one pass, as an outage would: the referenced object's path is briefly a directory,
      // which no unlink removes whatever the process may do (permission bits would not stop a process holding
      // CAP_DAC_OVERRIDE, as the v0 sandbox's user does).
      const blocked = join(uploads, keys.referenced);
      rmSync(blocked);
      mkdirSync(blocked);
      const firstPass = runJobs();
      const left = await rowsOf(doomed.id);
      const tomb = await rowOf(doomed.id);
      const waiting = await jobRow(doomedJob);
      check('storage refusing: the rows Next.js deleted are purged and the tombstone written all the same',
        left.guests === 0 && left.wishes === 0 && left.media === 0 && tomb.purged_at !== null && tomb.config === null, `${JSON.stringify(firstPass)} ${JSON.stringify(left)}`);
      const protectedAfter = await passcodeOf(doomed.id);
      check('the tombstone keeps no G-047 passcode: its hash and time were set before and are cleared by the purge (R-X10)',
        protectedBefore.hash && protectedBefore.set && !protectedAfter.hash && !protectedAfter.set, `${JSON.stringify(protectedBefore)} → ${JSON.stringify(protectedAfter)}`);
      check('the job records its objects, keeps its error and waits to retry; the refused object stays, the other three went (the guest photo too)',
        waiting.done_at === null && /^1 of 4 objects not deleted/.test(String(waiting.last_error)) && JSON.stringify(waiting.payload.objects) === JSON.stringify(own) &&
          existsSync(blocked) && !existsSync(join(uploads, keys.orphan)) && !existsSync(join(uploads, keys.child)) && !existsSync(join(uploads, keys.guestPhoto)),
        JSON.stringify(waiting));
      // The outage ends with the object still in place, for the retry to delete.
      rmSync(blocked, { recursive: true });
      writeFileSync(blocked, 'bytes');
      const stale = await jobRow(staleJob);
      const mineAfter = await rowOf(mine.id);
      check('the stale job of the restored deletion finished without touching it (live, same content, its guest link works)',
        stale.done_at !== null && stale.last_error === null && mineAfter.deleted_at === null && mineAfter.purged_at === null &&
          JSON.stringify(mineAfter.config) === JSON.stringify(mineLive.config) && Boolean(await publicLoaders.loadPublicInvitation(mine.slug, budi.slug)),
        JSON.stringify(stale));

      await makeDue(doomedJob);
      const secondPass = runJobs();
      const retried = await jobRow(doomedJob);
      const sharingRow = await rowOf(sharing.id);
      check('the retry removes exactly the recorded objects; the shared key and the invitation using it are untouched',
        retried.done_at !== null && retried.last_error === null && own.every((k) => !existsSync(join(uploads, k))) && existsSync(join(uploads, keys.shared)) &&
          sharingRow.deleted_at === null && JSON.stringify(sharingRow.config).includes(keys.shared),
        `${JSON.stringify(secondPass)} ${JSON.stringify(retried)}`);
      const money = await moneyOf(doomed.id);
      check('the order, its payment and its webhook event are kept, still pointing at the tombstone',
        money.orders === 1 && money.payments === 1 && money.events === 1 && money.statuses === 'PAID', JSON.stringify(money));
      o = await outcome(() => actions.restoreInvitation(form({ invitationId: doomed.id })));
      check('after the purge the owner\u2019s restore answers "purged" and its public media stays refused', redirectedTo(o, 'error=purged') && (await deletion.invitationMediaGone(doomed.id)), describe(o));

      // 7c. The retention sweep (Rust) deletes an expired invitation as its owner would; Next.js reads that deletion.
      const expired = await invitation(owner, 'expired', config, 3640);
      const sweep = { INVITATION_DELETION_WINDOW_DAYS: '30', INVITATION_RETENTION_DAYS_AFTER_EXPIRY: '3600' };
      runJobs();
      runJobs([], { INVITATION_DELETION_WINDOW_DAYS: '30' });
      check('the sweep does nothing without both durations (neither unset nor with the window alone)', (await rowOf(expired.id)).deleted_at === null && (await purgeJobIds(expired.id)).length === 0);
      const sweptPass = runJobs([], sweep);
      const swept = await rowOf(expired.id);
      const sweptAt = ms(swept.deleted_at);
      const [sweptJob] = await jobsOf(expired.id);
      check('the sweep (Rust) opens the window and queues the job exactly as Next.js does: payload, dedupe key, run time, attempts',
        Number(sweptPass.swept) >= 1 && Number.isFinite(sweptAt) && ms(swept.purge_after) - sweptAt === 30 * DAY && (await jobsOf(expired.id)).length === 1 &&
          sweptJob.payload.invitationId === expired.id && sweptJob.payload.deletedAt === new Date(sweptAt).toISOString() &&
          Object.keys(sweptJob.payload).sort().join() === 'deletedAt,invitationId' && sweptJob.dedupe_key === `invitation:${expired.id}:${sweptAt}` &&
          ms(sweptJob.run_at) === sweptAt + 30 * DAY && sweptJob.max_attempts === PURGE_MAX_ATTEMPTS,
        `${JSON.stringify(sweptPass)} ${JSON.stringify(sweptJob)}`);
      page = await ListPage({ searchParams: Promise.resolve({}) });
      check('Next.js reads the Rust deletion: the owner\u2019s list shows it deleted with its purge date and its restore',
        elementsOf(page, 'DeletedCard').some((card) => card.id === expired.id && (card.purgeAfter as Date).getTime() === sweptAt + 30 * DAY));
      o = await outcome(() => actions.restoreInvitation(form({ invitationId: expired.id })));
      check('its owner restores it through Next.js', redirectedTo(o, `restored=${expired.id}`) && (await rowOf(expired.id)).deleted_at === null, describe(o));
      // D-063's open question: while both durations stay set, retention outranks the restore. The next pass deletes the
      // expired invitation again with a fresh full window and the earlier job turns stale; nothing is purged sooner than
      // a whole window after the latest deletion.
      runJobs([], sweep);
      const again = await rowOf(expired.id);
      const sweepJobs = await purgeJobIds(expired.id);
      check('while retention stays configured, the next sweep deletes it again with a fresh full window (open question, D-063)',
        again.deleted_at !== null && ms(again.deleted_at) > sweptAt && ms(again.purge_after) - ms(again.deleted_at) === 30 * DAY && sweepJobs.length === 2);
      await makeDue(sweepJobs[0]);
      runJobs();
      const settled = await rowOf(expired.id);
      check('the earlier sweep job, now stale, finishes and purges nothing: the invitation keeps its latest window and content',
        (await jobRow(sweepJobs[0])).done_at !== null && settled.purged_at === null && ms(settled.deleted_at) === ms(again.deleted_at) && settled.config !== null);
    }
  } finally {
    as(null);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    if (created.invitations.length) {
      const ids = sql(created.invitations);
      await sql`delete from jobs where kind = ${PURGE_JOB_KIND} and (payload->>'invitationId')::int in ${ids}`;
      await sql`delete from analytics_events where invitation_id in ${ids}`;
      await sql`delete from payment_events where order_id in (select id from orders where invitation_id in ${ids})`;
      // G-050: a runner pass issues the receipt of a settled fixture order (section 4b); it references the order.
      await sql`delete from receipts where order_id in (select id from orders where invitation_id in ${ids})`;
      await sql`delete from payments where order_id in (select id from orders where invitation_id in ${ids})`;
      await sql`delete from orders where invitation_id in ${ids}`;
      await sql`delete from guest_messages where invitation_id in ${ids}`;
      await sql`delete from media_assets where invitation_id in ${ids}`;
      await sql`delete from guest_registrations where invitation_id in ${ids}`;
      await sql`delete from guest_registration_links where invitation_id in ${ids}`;
      await sql`delete from invitation_members where invitation_id in ${ids}`;
      await sql`delete from guests where invitation_id in ${ids}`;
      await sql`delete from invitations where id in ${ids}`;
    }
    if (created.users.length) await sql`delete from users where id in ${sql(created.users)}`;
    rmSync(uploads, { recursive: true, force: true });
    await sql.end();
  }
  const rust = `rust section: ${rustRan ? 'ran' : 'skipped'}`;
  console.log(failures ? `verify-retention: ${failures} FAILED, ${passes} passed (${rust})` : `verify-retention: all ${passes} checks passed (${rust})`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
