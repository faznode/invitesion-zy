/**
 * D-040 data migration: children's photos stored before D-040 under the public namespace (`<id>/<name>`) move to the
 * protected one (`protected/<id>/<name>`, same name), and the invitation's config and every saved version follow.
 *
 *   POSTGRES_URL=… UPLOAD_ROOT=… npx tsx scripts/migrate-child-photos.ts                    # dry run (default)
 *   … --apply                                  # copy, verify bytes, rewrite config + saved versions
 *   … --apply --delete-public                  # also remove each old public object nothing else references
 *   … --rollback [--apply]                     # restore the public paths (copying bytes back if missing)
 *   … --invitation <id>                        # one invitation only
 *
 * Scope: the child-photo field of birthday (`birthdayPerson.photoUrl`), aqiqah and khitanan (`ceremonyProfile.photoUrl`)
 * invitations, in the live config and in every saved version, for uploads of that same invitation. Other invitations'
 * uploads, avatars and absolute URLs are reported and left alone (the guest page already drops the first two).
 *
 * Safety:
 * - Bytes are copied, read back and compared by SHA-256 before any row changes; a mismatch or an existing protected
 *   object with different bytes stops that path.
 * - Rows are rewritten in one transaction per path, guarded by the old value (a concurrent edit is never overwritten).
 * - Repeat runs are no-ops; `--delete-public` can run later as its own step.
 * - A public object is removed only when no row anywhere still names it (live configs and saved versions of every
 *   invitation, gallery rows, avatars): a photo also used as a cover or shared is kept and reported.
 * - Rollback keeps the protected copy and restores the public object and paths, so the pre-D-040 code works again.
 *
 * What it cannot do: bytes already served publicly (browser caches for up to a year, saved copies) cannot be recalled.
 * Output names invitation ids and storage keys only (random names), never people's data.
 */
import { createHash } from 'node:crypto';
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

type Sql = import('postgres').Sql;
type Storage = Pick<import('../lib/storage/driver').StorageDriver, 'read' | 'put' | 'remove'>;
type Field = { section: 'birthdayPerson' | 'ceremonyProfile' };

export type MigrationOptions = { apply: boolean; deletePublic: boolean; rollback: boolean; invitationId?: number };
export type MigrationReport = {
  planned: number; copied: number; rewrittenConfigs: number; rewrittenVersions: number; alreadyProtected: number;
  publicDeleted: number; publicKeptShared: number; restored: number; skipped: number; errors: number; lines: string[];
};

const FIELD_BY_TYPE: Record<string, Field> = {
  birthday: { section: 'birthdayPerson' },
  aqiqah: { section: 'ceremonyProfile' },
  khitanan: { section: 'ceremonyProfile' },
};

export async function migrateChildPhotos(options: MigrationOptions, deps: { sql: Sql; storage: Storage }): Promise<MigrationReport> {
  const { isProtectedMediaPath, isUploadedMediaPath, mediaPathInvitationId } = await import('../lib/invitation/image-url');
  const { sql, storage } = deps;
  const report: MigrationReport = {
    planned: 0, copied: 0, rewrittenConfigs: 0, rewrittenVersions: 0, alreadyProtected: 0,
    publicDeleted: 0, publicKeptShared: 0, restored: 0, skipped: 0, errors: 0, lines: [],
  };
  const say = (line: string) => report.lines.push(line);
  const mode = options.rollback ? 'rollback' : 'forward';
  say(`mode=${mode} apply=${options.apply} deletePublic=${options.deletePublic}${options.invitationId ? ` invitation=${options.invitationId}` : ''}`);

  const rows = await sql<{ id: number; event_type: string }[]>`
    SELECT id, event_type FROM invitations
    WHERE event_type IN ('birthday', 'aqiqah', 'khitanan') ${options.invitationId ? sql`AND id = ${options.invitationId}` : sql``}
    ORDER BY id`;

  for (const invitation of rows) {
    const field = FIELD_BY_TYPE[invitation.event_type];
    const jsonPath = `{${field.section},photoUrl}`;
    const values = await sql<{ value: string | null }[]>`
      SELECT config #>> ${jsonPath}::text[] AS value FROM invitations WHERE id = ${invitation.id}
      UNION
      SELECT config #>> ${jsonPath}::text[] AS value FROM invitation_versions WHERE invitation_id = ${invitation.id}`;
    const paths = [...new Set(values.map((row) => row.value).filter((value): value is string => Boolean(value)))];

    for (const path of paths) {
      const own = mediaPathInvitationId(path) === invitation.id;
      if (!options.rollback) {
        if (isProtectedMediaPath(path) && own) {
          report.alreadyProtected++;
          if (options.deletePublic) await deletePublicIfUnreferenced(invitation.id, `/media/${path.slice('/media/protected/'.length)}`);
          continue;
        }
        if (!isUploadedMediaPath(path) || !own || path.startsWith('/media/avatars/')) {
          report.skipped++;
          say(`skip invitation=${invitation.id} reason=${isUploadedMediaPath(path) || isProtectedMediaPath(path) ? 'not-this-invitation' : 'external-or-invalid'}`);
          continue;
        }
        const target = `/media/protected/${path.slice('/media/'.length)}`;
        report.planned++;
        say(`plan invitation=${invitation.id} ${path.slice(7)} -> ${target.slice(7)}`);
        if (!options.apply) continue;
        if (!(await copyVerified(path.slice(7), target.slice(7), invitation.id))) continue;
        await rewrite(invitation.id, field, path, target);
        if (options.deletePublic) await deletePublicIfUnreferenced(invitation.id, path);
      } else {
        if (!isProtectedMediaPath(path) || !own) continue;
        const target = `/media/${path.slice('/media/protected/'.length)}`;
        report.planned++;
        say(`plan-rollback invitation=${invitation.id} ${path.slice(7)} -> ${target.slice(7)}`);
        if (!options.apply) continue;
        if (!(await copyVerified(path.slice(7), target.slice(7), invitation.id, true))) continue;
        await rewrite(invitation.id, field, path, target);
        report.restored++;
      }
    }
  }
  say(`summary ${JSON.stringify({ ...report, lines: undefined })}`);
  return report;

  async function readBytes(key: string) {
    const object = await storage.read(key);
    if (!object) return null;
    const bytes = Buffer.from(await new Response(object.body).arrayBuffer());
    return { bytes, contentType: object.contentType, digest: createHash('sha256').update(bytes).digest('hex') };
  }

  /** Copies `from` to `to` unless `to` already holds the same bytes; true when `to` verifiably equals `from`. */
  async function copyVerified(from: string, to: string, invitationId: number, allowMissingSourceIfTargetExists = false) {
    const source = await readBytes(from);
    const existing = await readBytes(to);
    if (!source) {
      if (allowMissingSourceIfTargetExists && existing) return true;
      report.errors++;
      say(`error invitation=${invitationId} missing-object ${from}`);
      return false;
    }
    if (existing) {
      if (existing.digest === source.digest) return true;
      report.errors++;
      say(`error invitation=${invitationId} conflict ${to} holds different bytes`);
      return false;
    }
    await storage.put(to, source.bytes, source.contentType);
    const check = await readBytes(to);
    if (!check || check.digest !== source.digest) {
      report.errors++;
      say(`error invitation=${invitationId} verify-failed ${to}`);
      return false;
    }
    report.copied++;
    say(`copied invitation=${invitationId} ${to} sha256=${source.digest.slice(0, 16)}`);
    return true;
  }

  async function rewrite(invitationId: number, field: Field, from: string, to: string) {
    const jsonPath = `{${field.section},photoUrl}`;
    const [configs, versions] = await sql.begin(async (tx) => {
      const c = await tx`
        UPDATE invitations SET config = jsonb_set(config, ${jsonPath}::text[], to_jsonb(${to}::text))
        WHERE id = ${invitationId} AND config #>> ${jsonPath}::text[] = ${from}`;
      const v = await tx`
        UPDATE invitation_versions SET config = jsonb_set(config, ${jsonPath}::text[], to_jsonb(${to}::text))
        WHERE invitation_id = ${invitationId} AND config #>> ${jsonPath}::text[] = ${from}`;
      return [c.count, v.count];
    });
    report.rewrittenConfigs += configs;
    report.rewrittenVersions += versions;
    say(`rewrote invitation=${invitationId} configs=${configs} versions=${versions}`);
  }

  async function deletePublicIfUnreferenced(invitationId: number, publicPath: string) {
    const key = publicPath.slice(7);
    if (!(await storage.read(key))) return;
    const [{ refs }] = await sql<{ refs: number }[]>`
      SELECT (
        (SELECT count(*) FROM invitations WHERE position(${publicPath} in config::text) > 0) +
        (SELECT count(*) FROM invitation_versions WHERE position(${publicPath} in config::text) > 0) +
        (SELECT count(*) FROM media_assets WHERE position(${publicPath} in url) > 0) +
        (SELECT count(*) FROM users WHERE position(${publicPath} in coalesce(avatar_url, '')) > 0)
      )::int AS refs`;
    if (refs > 0) {
      report.publicKeptShared++;
      say(`kept invitation=${invitationId} ${key} still referenced by ${refs} row(s)`);
      return;
    }
    if (!options.apply) {
      say(`would-delete invitation=${invitationId} ${key}`);
      return;
    }
    await storage.remove(key);
    if (await storage.read(key)) {
      report.errors++;
      say(`error invitation=${invitationId} delete-failed ${key}`);
      return;
    }
    report.publicDeleted++;
    say(`deleted invitation=${invitationId} ${key}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--apply', '--delete-public', '--rollback', '--invitation']);
  for (const arg of args) if (arg.startsWith('--') && !known.has(arg)) throw new Error(`unknown option ${arg}`);
  const at = args.indexOf('--invitation');
  const invitationId = at >= 0 ? Number(args[at + 1]) : undefined;
  if (at >= 0 && !(Number.isInteger(invitationId) && invitationId! > 0)) throw new Error('--invitation needs a positive id');
  const options: MigrationOptions = { apply: args.includes('--apply'), deletePublic: args.includes('--delete-public'), rollback: args.includes('--rollback'), invitationId };
  if (options.rollback && options.deletePublic) throw new Error('--rollback and --delete-public cannot be combined');

  const { client } = await import('../lib/db/drizzle');
  const { getStorage } = await import('../lib/storage');
  try {
    const report = await migrateChildPhotos(options, { sql: client, storage: getStorage() });
    for (const line of report.lines) console.log(line);
    if (!options.apply) console.log('dry run: nothing was written (pass --apply)');
    process.exitCode = report.errors ? 1 : 0;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith('migrate-child-photos.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
