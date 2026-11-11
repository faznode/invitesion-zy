/**
 * Database-backed check of the atomic view dedupe (B-017a) against a scratch database.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion npx tsx scripts/verify-view-dedupe.ts
 *
 * Proves what a unit test cannot: concurrent first opens of one link write exactly one VIEW row and add exactly one
 * to `opened_count`; a repeat inside the window writes nothing; an open after the window counts again; anonymous
 * opens are serialised per invitation. For contrast it also runs the pre-B-017a select-then-insert sequence under the
 * same load and reports how many duplicates that produces. It also runs the shared contract vectors
 * (`contracts/vectors/view-dedupe.json`), which `services/api/tests/database.rs` runs against the Rust writer (R-02).
 * Temporary rows are removed at the end.
 */
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { join } from 'node:path';

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
  const { and, eq, gte, inArray, isNull, sql } = await import('drizzle-orm');
  const { client, db } = await import('../lib/db/drizzle');
  const { analyticsEvents, guests, invitations } = await import('../lib/db/schema');
  const { recordInvitationView, VIEW_DEDUPE_WINDOW_MS } = await import('../lib/invitation/view-tracking');

  const [invitation] = await db.select({ id: invitations.id }).from(invitations).limit(1);
  if (!invitation) throw new Error('No invitation in this database: run local-stack.sh db first');
  const suffix = `${Date.now()}`;
  const tempGuests = await db
    .insert(guests)
    .values([
      { invitationId: invitation.id, name: 'Dedupe Check A', slug: `dedupe-a-${suffix}` },
      { invitationId: invitation.id, name: 'Dedupe Check B', slug: `dedupe-b-${suffix}` },
      { invitationId: invitation.id, name: 'Dedupe Check C', slug: `dedupe-c-${suffix}` },
    ])
    .returning({ id: guests.id });
  const [guestA, guestB, guestC] = tempGuests.map((g) => g.id);
  const anonymousAt = new Date(Date.UTC(2100, 0, 1) + Math.floor(Math.random() * 1e9));

  const views = (guestId: number) =>
    db.select({ id: analyticsEvents.id }).from(analyticsEvents).where(and(eq(analyticsEvents.guestId, guestId), eq(analyticsEvents.eventType, 'VIEW')));
  const openedCount = async (guestId: number) =>
    (await db.select({ n: guests.openedCount }).from(guests).where(eq(guests.id, guestId)))[0]?.n;

  try {
    const now = new Date();
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => recordInvitationView(db, invitation.id, guestA, now)));
    check(`${CONCURRENCY} concurrent first opens write one VIEW row`, (await views(guestA)).length === 1, `${(await views(guestA)).length} rows`);
    check('exactly one call reports a write', results.filter(Boolean).length === 1, `${results.filter(Boolean).length} true`);
    check('opened_count rises by one', (await openedCount(guestA)) === 1, `opened_count ${await openedCount(guestA)}`);

    await Promise.all(Array.from({ length: 5 }, () => recordInvitationView(db, invitation.id, guestA, new Date(now.getTime() + 60_000))));
    check('repeat opens inside the window write nothing', (await views(guestA)).length === 1);

    const later = new Date(now.getTime() + VIEW_DEDUPE_WINDOW_MS + 60_000);
    await Promise.all(Array.from({ length: 5 }, () => recordInvitationView(db, invitation.id, guestA, later)));
    check('an open after the window counts once more', (await views(guestA)).length === 2 && (await openedCount(guestA)) === 2,
      `${(await views(guestA)).length} rows, opened_count ${await openedCount(guestA)}`);

    await Promise.all(Array.from({ length: CONCURRENCY }, () => recordInvitationView(db, invitation.id, null, anonymousAt)));
    const anonymous = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.invitationId, invitation.id), isNull(analyticsEvents.guestId), eq(analyticsEvents.createdAt, anonymousAt)));
    check(`${CONCURRENCY} concurrent anonymous opens write one VIEW row`, anonymous.length === 1, `${anonymous.length} rows`);

    const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/view-dedupe.json'), 'utf8')) as {
      windowMinutes: number;
      opens: { atMinute: number; recorded: boolean }[];
      finalOpenedCount: number;
    };
    check('shared vectors: the window matches', vectors.windowMinutes * 60_000 === VIEW_DEDUPE_WINDOW_MS);
    const t0 = Date.UTC(2101, 0, 1) + Math.floor(Math.random() * 1e9);
    const mismatches: number[] = [];
    for (const open of vectors.opens) {
      const written = await recordInvitationView(db, invitation.id, guestC, new Date(t0 + open.atMinute * 60_000));
      if (written !== open.recorded) mismatches.push(open.atMinute);
    }
    check(`shared vectors: ${vectors.opens.length} opens as specified`, mismatches.length === 0, mismatches.length ? `minutes ${mismatches.join(', ')}` : '');
    check('shared vectors: final opened_count', (await openedCount(guestC)) === vectors.finalOpenedCount, `opened_count ${await openedCount(guestC)}`);

    // Contrast: the pre-B-017a sequence (separate check, insert and update statements, no lock) under the same load.
    const naive = async () => {
      const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);
      const [recent] = await db
        .select({ id: analyticsEvents.id })
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.invitationId, invitation.id), eq(analyticsEvents.eventType, 'VIEW'), eq(analyticsEvents.guestId, guestB), gte(analyticsEvents.createdAt, since)))
        .limit(1);
      if (recent) return;
      await db.insert(analyticsEvents).values({ invitationId: invitation.id, guestId: guestB, eventType: 'VIEW' });
      await db.update(guests).set({ openedCount: sql`${guests.openedCount} + 1` }).where(eq(guests.id, guestB));
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, naive));
    const naiveRows = (await views(guestB)).length;
    console.log(`INFO  pre-B-017a sequence under the same load: ${naiveRows} VIEW rows, opened_count ${await openedCount(guestB)} ` +
      `(${naiveRows > 1 ? 'race reproduced' : 'race not reproduced in this run'})`);
  } finally {
    await db.delete(analyticsEvents).where(inArray(analyticsEvents.guestId, [guestA, guestB, guestC]));
    await db.delete(analyticsEvents).where(and(eq(analyticsEvents.invitationId, invitation.id), isNull(analyticsEvents.guestId), eq(analyticsEvents.createdAt, anonymousAt)));
    await db.delete(guests).where(inArray(guests.id, [guestA, guestB, guestC]));
    await client.end();
  }
  console.log(failures ? `verify-view-dedupe: ${failures} FAILED` : 'verify-view-dedupe: all checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
