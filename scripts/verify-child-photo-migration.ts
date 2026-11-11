/**
 * Database-backed acceptance of `scripts/migrate-child-photos.ts` (D-040) on synthetic rows and a scratch storage root.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion MIGRATION_SCRATCH=/vercel/share/work/s23r-mig \
 *     npx tsx scripts/verify-child-photo-migration.ts
 *
 * Never point this at production: it inserts and deletes `s23r-mig-*` invitations. Fixture:
 *   A aqiqah: live photo P1, saved versions with P1 and an older P2 (only A references P2);
 *   B birthday: photo P3, also used as B's cover (shared reference);
 *   C khitanan: names A's P1 (another invitation's upload: skipped, and it keeps P1 referenced);
 *   D tasyakuran with a public upload (an adult's photo: out of scope);
 *   E aqiqah with an external URL (skipped);
 *   F aqiqah whose object is missing (reported, row untouched).
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  const root = process.env.MIGRATION_SCRATCH;
  if (!root) throw new Error('MIGRATION_SCRATCH (a scratch storage root) is required');
  mkdirSync(root, { recursive: true });
  const { client: sql } = await import('../lib/db/drizzle');
  const { LocalStorageDriver } = await import('../lib/storage/local-driver');
  const { migrateChildPhotos } = await import('./migrate-child-photos');
  const storage = new LocalStorageDriver(root);
  const hex = () => randomBytes(12).toString('hex');
  const digestOf = async (key: string) => {
    const object = await storage.read(key);
    return object ? createHash('sha256').update(Buffer.from(await new Response(object.body).arrayBuffer())).digest('hex') : null;
  };

  const [owner] = await sql<{ id: number }[]>`SELECT id FROM users ORDER BY id LIMIT 1`;
  if (!owner) throw new Error('No user in this database: run local-stack.sh db first');
  const tag = `s23r-mig-${Date.now().toString(36)}`;
  const ids: Record<string, number> = {};
  for (const [name, type] of [['A', 'aqiqah'], ['B', 'birthday'], ['C', 'khitanan'], ['D', 'tasyakuran'], ['E', 'aqiqah'], ['F', 'aqiqah']] as const) {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO invitations (user_id, slug, event_type, status, config) VALUES (${owner.id}, ${`${tag}-${name.toLowerCase()}`}, ${type}, 'PUBLISHED', '{}'::jsonb) RETURNING id`;
    ids[name] = row.id;
  }
  const P1 = `/media/${ids.A}/${hex()}.jpg`;
  const P2 = `/media/${ids.A}/${hex()}.jpg`;
  const P3 = `/media/${ids.B}/${hex()}.png`;
  const PD = `/media/${ids.D}/${hex()}.jpg`;
  const PF = `/media/${ids.F}/${hex()}.jpg`;
  const EXTERNAL = 'https://cdn.contoh.test/anak.jpg';
  for (const path of [P1, P2, P3, PD]) await storage.put(path.slice(7), randomBytes(2048), 'image/jpeg');
  const configs: Record<string, unknown> = {
    A: { ceremonyProfile: { honoureeName: 'Ananda Contoh', photoUrl: P1, showPhoto: true } },
    B: { birthdayPerson: { fullName: 'Rara Contoh', photoUrl: P3, showPhoto: true }, theme: { cover: { imageUrl: P3 } } },
    C: { ceremonyProfile: { photoUrl: P1, showPhoto: true } },
    D: { ceremonyProfile: { photoUrl: PD } },
    E: { ceremonyProfile: { photoUrl: EXTERNAL, showPhoto: true } },
    F: { ceremonyProfile: { photoUrl: PF, showPhoto: true } },
  };
  for (const [name, config] of Object.entries(configs)) {
    const text = JSON.stringify(config);
    await sql`UPDATE invitations SET config = ${text}::text::jsonb WHERE id = ${ids[name]}`;
    await sql`INSERT INTO invitation_versions (invitation_id, version_no, config, created_by, is_live) VALUES (${ids[name]}, 3, ${text}::text::jsonb, 'customer', true)`;
  }
  const olderA = JSON.stringify({ ceremonyProfile: { photoUrl: P2, showPhoto: true } });
  await sql`INSERT INTO invitation_versions (invitation_id, version_no, config, created_by, is_live) VALUES (${ids.A}, 1, ${olderA}::text::jsonb, 'customer', false)`;
  await sql`INSERT INTO invitation_versions (invitation_id, version_no, config, created_by, is_live) VALUES (${ids.A}, 2, ${JSON.stringify(configs.A)}::text::jsonb, 'customer', false)`;

  const all = Object.values(ids);
  const snapshot = async () => {
    const rows = await sql<{ k: string; c: string }[]>`
      SELECT 'i' || id AS k, config::text AS c FROM invitations WHERE id = ANY(${all})
      UNION ALL SELECT 'v' || id AS k, config::text AS c FROM invitation_versions WHERE invitation_id = ANY(${all}) ORDER BY k`;
    return createHash('sha256').update(rows.map((r) => `${r.k}=${r.c}`).join('\n')).digest('hex');
  };
  const field = async (table: 'invitations' | 'versions', id: number, path: string) =>
    table === 'invitations'
      ? (await sql<{ v: string }[]>`SELECT config #>> ${path}::text[] AS v FROM invitations WHERE id = ${id}`)[0]?.v
      : (await sql<{ v: string }[]>`SELECT string_agg(coalesce(config #>> ${path}::text[], '-'), ',' ORDER BY version_no) AS v FROM invitation_versions WHERE invitation_id = ${id}`)[0]?.v;
  const prot = (path: string) => `/media/protected/${path.slice(7)}`;
  // The scratch database may hold other invitations; only this fixture's lines are asserted on.
  const run = async (o: Partial<{ apply: boolean; deletePublic: boolean; rollback: boolean }>) => {
    const report = await migrateChildPhotos({ apply: false, deletePublic: false, rollback: false, ...o }, { sql, storage });
    return { ...report, lines: report.lines.filter((l) => all.some((id) => l.includes(`invitation=${id} `))) };
  };
  const sources = { P1: await digestOf(P1.slice(7)), P2: await digestOf(P2.slice(7)), P3: await digestOf(P3.slice(7)) };

  try {
    // 1. Dry run.
    const before = await snapshot();
    const dry = await run({});
    check('dry run plans P1, P2 (A), P3 (B) and PF (F)', dry.lines.filter((l) => l.startsWith('plan ')).length === 4, dry.lines.join(' | '));
    check('dry run skips C (another invitation) and E (external)', dry.lines.filter((l) => l.startsWith('skip ')).length === 2);
    check('dry run writes no row', (await snapshot()) === before);
    check('dry run writes no object', (await digestOf(prot(P1).slice(7))) === null && (await digestOf(prot(P3).slice(7))) === null);

    // 2. Apply.
    const applied = await run({ apply: true });
    check('apply: P1, P2, P3 copied and verified', (await digestOf(prot(P1).slice(7))) === sources.P1 && (await digestOf(prot(P2).slice(7))) === sources.P2 && (await digestOf(prot(P3).slice(7))) === sources.P3);
    check('apply: F reported missing-object, nothing written for it', applied.lines.some((l) => l.includes(`invitation=${ids.F} missing-object`)) && (await field('invitations', ids.F, '{ceremonyProfile,photoUrl}')) === PF);
    check('apply: A live config protected', (await field('invitations', ids.A, '{ceremonyProfile,photoUrl}')) === prot(P1));
    check('apply: A saved versions follow (v1 = P2, v2 / v3 = P1)', (await field('versions', ids.A, '{ceremonyProfile,photoUrl}')) === [prot(P2), prot(P1), prot(P1)].join(','));
    check('apply: B photo protected, its cover still the public path', (await field('invitations', ids.B, '{birthdayPerson,photoUrl}')) === prot(P3) && (await field('invitations', ids.B, '{theme,cover,imageUrl}')) === P3);
    check('apply: C, D, E untouched', (await field('invitations', ids.C, '{ceremonyProfile,photoUrl}')) === P1 && (await field('invitations', ids.D, '{ceremonyProfile,photoUrl}')) === PD && (await field('invitations', ids.E, '{ceremonyProfile,photoUrl}')) === EXTERNAL);
    check('apply without --delete-public keeps every public object', (await digestOf(P1.slice(7))) === sources.P1 && (await digestOf(P2.slice(7))) === sources.P2);
    check('apply: other config keys preserved', (await sql<{ n: string }[]>`SELECT config #>> '{ceremonyProfile,honoureeName}' AS n FROM invitations WHERE id = ${ids.A}`)[0]?.n === 'Ananda Contoh');

    // 3. Repeat.
    const mid = await snapshot();
    const again = await run({ apply: true });
    check('repeat apply is a no-op (no copy, no row change)', !again.lines.some((l) => l.startsWith('copied ') || l.startsWith('rewrote ')) && (await snapshot()) === mid);

    // 4. Delete public objects nothing references.
    const deleted = await run({ apply: true, deletePublic: true });
    check('delete-public: P2 (referenced by nothing now) removed', (await digestOf(P2.slice(7))) === null, deleted.lines.join(' | '));
    check('delete-public: P1 kept (C still names it)', (await digestOf(P1.slice(7))) === sources.P1);
    check('delete-public: P3 kept (B\u2019s cover names it)', (await digestOf(P3.slice(7))) === sources.P3);
    check('delete-public: protected copies intact', (await digestOf(prot(P2).slice(7))) === sources.P2);

    // 5. Rollback.
    const rollbackDry = await run({ rollback: true });
    check('rollback dry run plans P1, P2, P3 and writes nothing', rollbackDry.lines.filter((l) => l.startsWith('plan-rollback ')).length === 3 && (await digestOf(P2.slice(7))) === null);
    await run({ rollback: true, apply: true });
    check('rollback: P2 restored to the public key with the same bytes', (await digestOf(P2.slice(7))) === sources.P2);
    check('rollback: A live config and versions back on public paths', (await field('invitations', ids.A, '{ceremonyProfile,photoUrl}')) === P1 && (await field('versions', ids.A, '{ceremonyProfile,photoUrl}')) === [P2, P1, P1].join(','));
    check('rollback: B back', (await field('invitations', ids.B, '{birthdayPerson,photoUrl}')) === P3);
    check('rollback: protected copies kept', (await digestOf(prot(P1).slice(7))) === sources.P1);

    // 6. Forward again after a rollback: the existing protected copies are reused.
    const reapplied = await run({ apply: true });
    check('re-apply after rollback: no new copy, rows protected again', !reapplied.lines.some((l) => l.startsWith('copied ')) && (await field('invitations', ids.A, '{ceremonyProfile,photoUrl}')) === prot(P1));
  } finally {
    await sql`DELETE FROM invitation_versions WHERE invitation_id = ANY(${all})`;
    await sql`DELETE FROM invitations WHERE id = ANY(${all})`;
    for (const path of [P1, P2, P3, PD]) {
      await storage.remove(path.slice(7));
      await storage.remove(prot(path).slice(7));
    }
    await sql.end({ timeout: 5 });
  }
  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll child-photo migration checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
