/**
 * R-02 end to end: the guest page's call site (`writeInvitationView`) against a running Rust API and a scratch
 * database, through the generated client and the service signature.
 *
 *   POSTGRES_URL=… API_BASE_URL=http://127.0.0.1:8090 INTERNAL_API_SECRET=… npx tsx scripts/verify-views-api.ts
 *
 * With BACKEND_VIEWS=rust it repeats verify-view-dedupe's scenarios over HTTP: concurrent first opens write once, a
 * repeat inside the window writes nothing, an open after the window counts again (time moves by shifting this run's
 * own rows back, since the API stamps opens with its own clock), and concurrent anonymous opens write once. It then
 * proves the one-writer rule: with BACKEND_VIEWS=rust and the API unreachable nothing is written (no fallback to the
 * TypeScript writer), and with BACKEND_VIEWS=next the API is never called. Its own fictional fixture is removed.
 */
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

const CONCURRENCY = 20;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  const { and, eq, inArray, isNull, sql } = await import('drizzle-orm');
  const { client, db } = await import('../lib/db/drizzle');
  const { analyticsEvents, guests, invitations, users } = await import('../lib/db/schema');
  const { writeInvitationView } = await import('../lib/invitation/view-writer');
  const { ApiProblem } = await import('../lib/api/client');

  const rust: Record<string, string | undefined> = { ...process.env, BACKEND_VIEWS: 'rust' };
  if (!rust.API_BASE_URL || !rust.INTERNAL_API_SECRET) throw new Error('API_BASE_URL and INTERNAL_API_SECRET must name a running API');
  const tag = `${Date.now()}`;
  const [user] = await db.insert(users).values({ email: `views-api-${tag}@example.invalid` }).returning({ id: users.id });
  const [invitation] = await db
    .insert(invitations)
    .values({ userId: user.id, slug: `views-api-${tag}`, eventType: 'wedding' })
    .returning({ id: invitations.id });
  const [guestA, guestB] = (
    await db
      .insert(guests)
      .values([
        { invitationId: invitation.id, name: 'Views API A', slug: `views-api-a-${tag}` },
        { invitationId: invitation.id, name: 'Views API B', slug: `views-api-b-${tag}` },
      ])
      .returning({ id: guests.id })
  ).map((g) => g.id);

  const rows = async (guestId: number | null) =>
    (
      await db
        .select({ id: analyticsEvents.id })
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.invitationId, invitation.id), eq(analyticsEvents.eventType, 'VIEW'), guestId ? eq(analyticsEvents.guestId, guestId) : isNull(analyticsEvents.guestId)))
    ).length;
  const opened = async (guestId: number) => (await db.select({ n: guests.openedCount }).from(guests).where(eq(guests.id, guestId)))[0]?.n;
  const shiftBack = (minutes: number) =>
    db.update(analyticsEvents).set({ createdAt: sql`${analyticsEvents.createdAt} - make_interval(mins => ${minutes})` }).where(eq(analyticsEvents.invitationId, invitation.id));

  try {
    const first = await Promise.all(Array.from({ length: CONCURRENCY }, () => writeInvitationView(invitation.id, guestA, rust)));
    check(`${CONCURRENCY} concurrent first opens through the API write one VIEW row`, (await rows(guestA)) === 1, `${await rows(guestA)} rows`);
    check('exactly one API call reports a write', first.filter(Boolean).length === 1, `${first.filter(Boolean).length} true`);
    check('opened_count rises by one', (await opened(guestA)) === 1, `opened_count ${await opened(guestA)}`);

    await Promise.all(Array.from({ length: 5 }, () => writeInvitationView(invitation.id, guestA, rust)));
    check('repeat opens inside the window write nothing', (await rows(guestA)) === 1);

    await shiftBack(31);
    await Promise.all(Array.from({ length: 5 }, () => writeInvitationView(invitation.id, guestA, rust)));
    check('an open after the window counts once more', (await rows(guestA)) === 2 && (await opened(guestA)) === 2,
      `${await rows(guestA)} rows, opened_count ${await opened(guestA)}`);

    await Promise.all(Array.from({ length: CONCURRENCY }, () => writeInvitationView(invitation.id, null, rust)));
    check(`${CONCURRENCY} concurrent anonymous opens through the API write one VIEW row`, (await rows(null)) === 1, `${await rows(null)} rows`);

    const unknownGuest = await writeInvitationView(invitation.id, 2_147_483_000, rust).then(() => null, (e: unknown) => e);
    check('an unknown guest is a 404 problem, not a write', unknownGuest instanceof ApiProblem && unknownGuest.status === 404 && unknownGuest.code === 'invitation_or_guest.not_found');

    const unreachable = { ...rust, API_BASE_URL: 'http://127.0.0.1:9' };
    const failed = await writeInvitationView(invitation.id, guestB, unreachable).then(() => null, (e: unknown) => e);
    check('BACKEND_VIEWS=rust with the API down fails without writing (no fallback writer)',
      failed instanceof ApiProblem && failed.code.startsWith('transport.') && (await rows(guestB)) === 0, `${await rows(guestB)} rows`);

    const viaNext = await writeInvitationView(invitation.id, guestB, { ...unreachable, BACKEND_VIEWS: 'next' });
    check('BACKEND_VIEWS=next writes through Next.js without calling the API', viaNext && (await rows(guestB)) === 1);
  } finally {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.invitationId, invitation.id));
    await db.delete(guests).where(inArray(guests.id, [guestA, guestB]));
    await db.delete(invitations).where(eq(invitations.id, invitation.id));
    await db.delete(users).where(eq(users.id, user.id));
    await client.end();
  }
  console.log(failures ? `verify-views-api: ${failures} FAILED` : 'verify-views-api: all checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
