/**
 * Database-backed proof of migration 0013 (B-027 slice 2c, D-036) on a populated database.
 *
 *   POSTGRES_URL=… npx tsx scripts/verify-event-ids.ts before --out <file>   # database migrated to 0012 and seeded
 *   POSTGRES_URL=… pnpm db:migrate                                           # applies 0013
 *   POSTGRES_URL=… npx tsx scripts/verify-event-ids.ts after --out <file>
 *
 * `before` adds fictional edge-case invitations (legacy events, a partial id, a repeated id, a malformed id, a minted-id
 * collision, a non-object element, no config, no events, all ids present) plus a pre-0013 saved version, and records every
 * invitation's raw config and what the read path makes of its events. `after` proves: every reader sees the same event
 * ids and content as before the backfill; rewritten configs gained ids and version 2 and nothing else; tie-break configs
 * are byte-identical; saved versions and guest rows are untouched; a second run of the SQL changes nothing. It then
 * removes its own rows. Exit code 1 on any failure.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { normalizeStoredConfig } from '../lib/invitation/content-read';

type Row = { id: number; slug: string; raw: string | null };
type Snapshot = { rows: Array<Row & { read: unknown }>; versions: string; guests: string; crafted: Record<string, number> };

const PREFIX = 'evid-check-';
const akad = { title: 'Akad Contoh', startAt: '2026-08-01T08:00:00+07:00', venueName: 'Masjid Contoh' };
const resepsi = { title: 'Resepsi Contoh', startAt: '2026-08-01T11:00:00+07:00', venueName: 'Gedung Contoh' };
const CRAFTED: Record<string, unknown> = {
  legacy: { events: [akad, resepsi] },
  partial: { events: [{ ...akad, id: 'ev-k2m4p6r8t0' }, resepsi] },
  repeated: { events: [{ ...akad, id: 'x' }, { ...resepsi, id: 'x' }] },
  malformed: { events: [{ ...akad, id: 'has space' }, resepsi] },
  collision: { events: [{ ...akad, id: 'ev-2' }, resepsi] },
  nonobject: { events: [akad, 'x'] },
  nullconfig: null,
  noevents: { settings: { title: 'Tanpa acara' } },
  keyed: { events: [{ ...akad, id: 'ev-1' }, { ...resepsi, id: 'ev-k' }] },
};
const REWRITTEN = new Set(['legacy', 'partial']);

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const readEvents = (raw: string | null) => normalizeStoredConfig(raw === null ? null : JSON.parse(raw)).config.events ?? null;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  const [phase, flag, out] = process.argv.slice(2);
  if (!['before', 'after'].includes(phase) || flag !== '--out' || !out) throw new Error('usage: before|after --out <file>');
  const sql = postgres(process.env.POSTGRES_URL ?? '', { max: 2, onnotice: () => {} });
  try {
    const rows = async () => (await sql<Row[]>`SELECT id, slug, config::text AS raw FROM invitations ORDER BY id`).map((row) => ({ ...row }));
    const versions = async () => digest((await sql<{ t: string }[]>`SELECT coalesce(string_agg(id || ':' || coalesce(config::text, 'null'), '|' ORDER BY id), '') AS t FROM invitation_versions`)[0].t);
    const guests = async () =>
      digest((await sql<{ t: string }[]>`SELECT coalesce(string_agg(id || ':' || rsvp_status || ':' || coalesce(rsvp_answers::text, 'null'), '|' ORDER BY id), '') AS t FROM guests`)[0].t);

    if (phase === 'before') {
      const [owner] = await sql<{ user_id: number }[]>`SELECT user_id FROM invitations ORDER BY id LIMIT 1`;
      if (!owner) throw new Error('No invitation in this database: seed it first');
      const suffix = Date.now().toString(36);
      const crafted: Record<string, number> = {};
      for (const [name, config] of Object.entries(CRAFTED)) {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO invitations (user_id, slug, event_type, status, config)
          VALUES (${owner.user_id}, ${`${PREFIX}${name}-${suffix}`}, 'wedding', 'DRAFT', ${config === null ? null : sql.json(config as never)})
          RETURNING id`;
        crafted[name] = row.id;
      }
      await sql`INSERT INTO invitation_versions (invitation_id, version_no, config, created_by, is_live)
                VALUES (${crafted.legacy}, 1, ${sql.json({ events: [resepsi, akad] } as never)}, 'customer', false)`;
      const all = await rows();
      const snapshot: Snapshot = { rows: all.map((row) => ({ ...row, read: readEvents(row.raw) })), versions: await versions(), guests: await guests(), crafted };
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(snapshot));
      const legacyRows = all.filter((row) => row.raw && /"events":\s*\[\s*\{/.test(row.raw) && !/"id":/.test(row.raw));
      console.log(`before: ${all.length} invitations recorded (${Object.keys(crafted).length} crafted); ${legacyRows.length} hold events without any id`);
      return;
    }

    const before = JSON.parse(readFileSync(out, 'utf8')) as Snapshot;
    const now = new Map((await rows()).map((row) => [row.id, row]));
    const craftedName = new Map(Object.entries(before.crafted).map(([name, id]) => [id, name]));
    let rewritten = 0;
    let readMismatch = 0;
    let badRewrite = 0;
    for (const row of before.rows) {
      const after = now.get(row.id);
      if (!after) {
        check(`invitation ${row.id} still exists`, false);
        continue;
      }
      if (JSON.stringify(readEvents(after.raw)) !== JSON.stringify(row.read)) readMismatch += 1;
      if (after.raw === row.raw) {
        if (craftedName.has(row.id)) check(`crafted ${craftedName.get(row.id)}: unchanged`, !REWRITTEN.has(craftedName.get(row.id)!));
        continue;
      }
      rewritten += 1;
      const was = JSON.parse(row.raw ?? 'null') as Record<string, unknown>;
      const is = JSON.parse(after.raw ?? 'null') as Record<string, unknown>;
      const events = is.events as Array<Record<string, unknown>>;
      const strip = (list: unknown) => (list as Array<Record<string, unknown>>).map(({ id: _id, ...rest }) => rest);
      const { events: _e1, schemaVersion: _v1, ...wasRest } = was;
      const { events: _e2, schemaVersion: _v2, ...isRest } = is;
      const ok =
        is.schemaVersion === 2 &&
        events.every((event) => typeof event.id === 'string') &&
        JSON.stringify(strip(events)) === JSON.stringify(strip(was.events)) &&
        JSON.stringify(isRest) === JSON.stringify(wasRest) &&
        (was.events as Array<Record<string, unknown>>).every((event, index) => event.id === undefined || event.id === events[index].id);
      if (!ok) badRewrite += 1;
      if (craftedName.has(row.id)) check(`crafted ${craftedName.get(row.id)}: rewritten with ids`, REWRITTEN.has(craftedName.get(row.id)!) && ok, JSON.stringify(events.map((event) => event.id)));
    }
    check('every reader sees the same event ids and content before and after the backfill', readMismatch === 0, `${readMismatch} differ of ${before.rows.length}`);
    check('rewritten configs gained ids and schemaVersion 2 and nothing else', badRewrite === 0, `${rewritten} rewritten, ${badRewrite} bad`);
    check('fixture configs with id-less events were rewritten', rewritten > REWRITTEN.size, `${rewritten - REWRITTEN.size} fixture rows`);
    check('saved versions are untouched (history)', (await versions()) === before.versions);
    check('guest rows are untouched', (await guests()) === before.guests);

    const migration = readFileSync(join(process.cwd(), 'lib/db/migrations/0013_event_ids.sql'), 'utf8');
    let again = -1;
    await sql
      .begin(async (tx) => {
        again = (await tx.unsafe(migration)).count;
        throw new Error('rollback');
      })
      .catch((error: Error) => {
        if (error.message !== 'rollback') throw error;
      });
    check('a second run of the migration changes nothing', again === 0, `rows=${again}`);
    const [{ applied }] = await sql<{ applied: number }[]>`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`;
    check('drizzle recorded the migration', applied >= 14, `${applied} applied`);

    const ids = Object.values(before.crafted);
    await sql`DELETE FROM invitation_versions WHERE invitation_id IN ${sql(ids)}`;
    await sql`DELETE FROM invitations WHERE id IN ${sql(ids)}`;
    console.log(`after: ${before.rows.length} invitations compared; crafted rows removed; ${failures ? `${failures} FAILED` : 'all checks pass'}`);
  } finally {
    await sql.end();
  }
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
