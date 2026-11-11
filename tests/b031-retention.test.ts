// B-031 (D-063): the deletion and retention rules without a database. Shared vectors with the Rust purge, every
// invitation lookup in both languages guarded (or listed with its reason), the public media check, the owner controls'
// guards, and the flag default. The database behaviour is scripts/verify-retention.ts and
// services/api/tests/invitation_purge.rs. Fixture durations only; no policy is decided here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import {
  deletionState,
  isInvitationGone,
  ownPrefixes,
  PURGE_JOB_KIND,
  PURGE_MAX_ATTEMPTS,
  PURGED_TABLES,
  purgeAfterFor,
  purgeJobFor,
  RETAINED_TABLES,
  retentionConfig,
  retentionDue,
} from '../lib/invitation/retention';
import { assertSafeKey, type StoredObjectRead } from '../lib/storage/driver';
import { publicKeyInvitationId, serveMedia } from '../lib/storage/serve-media';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
process.env.POSTGRES_URL ??= 'postgres://b031-test:unused@127.0.0.1:1/unused';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const vectors = JSON.parse(read('contracts/vectors/invitation-purge.json')) as {
  days: { raw: string | null; min: 0 | 1; expected: number | null }[];
  jobs: { invitationId: number; deletedAt: string; windowDays: number; purgeAfter: string; dedupeKey: string; payload: unknown }[];
  ownership: { invitationId: number; key: string; owned: boolean }[];
};
const RUST = read('services/api/src/retention.rs');
const DAY = 86_400_000;

test('B-031 vectors: day settings parse as in Rust (min 1 for the window, min 0 for the retention)', () => {
  assert.ok(vectors.days.length >= 10);
  for (const { raw, min, expected } of vectors.days) {
    const name = min === 1 ? 'INVITATION_DELETION_WINDOW_DAYS' : 'INVITATION_RETENTION_DAYS_AFTER_EXPIRY';
    const config = retentionConfig(raw === null ? {} : { [name]: raw });
    assert.equal(min === 1 ? config.windowDays : config.retentionDaysAfterExpiry, expected, `${name}=${JSON.stringify(raw)}`);
  }
  assert.deepEqual(retentionConfig({}), { windowDays: null, retentionDaysAfterExpiry: null }, 'nothing is decided by default');
});

test('B-031 vectors: the job row Next.js writes is the one the Rust sweep writes', () => {
  assert.ok(vectors.jobs.length >= 2);
  for (const job of vectors.jobs) {
    const deletedAt = new Date(job.deletedAt);
    const purgeAfter = purgeAfterFor(deletedAt, job.windowDays);
    assert.equal(purgeAfter.toISOString(), job.purgeAfter);
    const row = purgeJobFor(job.invitationId, deletedAt, purgeAfter);
    assert.equal(row.kind, PURGE_JOB_KIND);
    assert.deepEqual(row.payload, job.payload);
    assert.equal(row.dedupeKey, job.dedupeKey);
    assert.equal(row.runAt.getTime(), purgeAfter.getTime());
    assert.equal(row.maxAttempts, PURGE_MAX_ATTEMPTS);
  }
  assert.match(RUST, new RegExp(`PURGE_JOB_KIND: &str = "${PURGE_JOB_KIND}"`));
  assert.match(RUST, new RegExp(`PURGE_MAX_ATTEMPTS: i32 = ${PURGE_MAX_ATTEMPTS};`));
});

test('B-031 vectors: an invitation owns exactly its three prefixes, through safe keys only', () => {
  for (const { invitationId, key, owned } of vectors.ownership) {
    let safe = true;
    try {
      assertSafeKey(key);
    } catch {
      safe = false;
    }
    assert.equal(safe && ownPrefixes(invitationId).some((prefix) => key.startsWith(prefix)), owned, key);
  }
});

test('B-031 rules: deletion state, gone-ness and the retention boundary', () => {
  const deletedAt = new Date('2026-11-10T00:00:00Z');
  const purgeAfter = purgeAfterFor(deletedAt, 30);
  assert.equal(purgeAfter.getTime() - deletedAt.getTime(), 30 * DAY);
  assert.deepEqual(deletionState({ deletedAt: null, purgeAfter: null, purgedAt: null }), { kind: 'live' });
  assert.deepEqual(deletionState({ deletedAt, purgeAfter, purgedAt: null }), { kind: 'scheduled', deletedAt, purgeAfter });
  assert.deepEqual(deletionState({ deletedAt, purgeAfter, purgedAt: purgeAfter }), { kind: 'purged', purgedAt: purgeAfter });
  assert.equal(isInvitationGone({ deletedAt: null }), false);
  assert.equal(isInvitationGone({ deletedAt }), true);

  const expiresAt = new Date('2027-01-01T00:00:00Z');
  const exactly = new Date(expiresAt.getTime() + 90 * DAY);
  assert.equal(retentionDue({ expiresAt, deletedAt: null }, 90, new Date(exactly.getTime() - 1)), false, 'one millisecond early');
  assert.equal(retentionDue({ expiresAt, deletedAt: null }, 90, exactly), true, 'due at the boundary, as `expires_at <= cutoff`');
  assert.equal(retentionDue({ expiresAt, deletedAt }, 90, exactly), false, 'already deleted');
  assert.equal(retentionDue({ expiresAt: null, deletedAt: null }, 0, exactly), false, 'drafts never expire');
});

test('B-031 tables: the purge list matches Rust, and every table holding invitation_id is purged or retained on purpose', () => {
  const block = /purged_tables!\(([\s\S]*?)\);/.exec(RUST)?.[1] ?? '';
  const rust = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rust, [...PURGED_TABLES]);
  const retained = [...(/RETAINED_TABLES: &\[\(&str, &str\)\] = &\[([\s\S]*?)\n\];/.exec(RUST)?.[1] ?? '').matchAll(/\(\s*"([a-z_]+)",/g)].map((m) => m[1]);
  assert.deepEqual(retained, [...RETAINED_TABLES]);

  const schema = read('lib/db/schema.ts');
  const tables = [...schema.matchAll(/pgTable\(\s*'([a-z_]+)'/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  const withInvitation = tables
    .filter((table, i) => schema.slice(table.at, tables[i + 1]?.at ?? schema.length).includes("integer('invitation_id')"))
    .map((table) => table.name);
  assert.ok(withInvitation.length >= 18, `found ${withInvitation.length}`);
  for (const name of withInvitation) {
    assert.ok((PURGED_TABLES as readonly string[]).includes(name) || (RETAINED_TABLES as readonly string[]).includes(name), `${name} is classified`);
  }
  for (const name of [...PURGED_TABLES, ...RETAINED_TABLES]) assert.ok(tables.some((t) => t.name === name), `${name} exists`);
});

/** Every file under `dir` with one of `exts`, skipping dependencies and build output. */
function sources(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'target') continue;
    const path = join(ROOT, dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(relative(ROOT, path), exts));
    else if (exts.some((ext) => entry.endsWith(ext))) out.push(relative(ROOT, path));
  }
  return out;
}

/**
 * Reads of `invitations` that deliberately see deleted rows, each with its reason. Anything else that queries the table
 * must carry the guard, so a new query cannot forget it silently.
 */
const TS_UNGUARDED: Record<string, string> = {
  'lib/db/schema.ts': 'the table itself',
  'lib/invitation/deletion-db.ts': 'the deletion and restore themselves, and the media check',
  'app/(customer)/dashboard/invitations/page.tsx': 'the owner list shows a deleted invitation with its restore (purged ones are filtered)',
  'app/(customer)/dashboard/templates/page.tsx': 'which themes the owner has used; reads no invitation content',
  'app/(admin)/admin/[entry]/(console)/invitations/page.tsx': 'the administrator sees every row, marked DELETED or PURGED',
  'app/(admin)/admin/[entry]/(console)/page.tsx': 'counts of invitations ever created',
  'lib/invitation/create-next.ts': 'slug uniqueness must count tombstones (a deleted slug is never handed out again); the creation key',
  'lib/invitation/create.ts': 'reads back the row it has just created',
};
const TS_GUARD = /isNull\(invitations\.deletedAt\)|liveInvitation|deleted_at is null/;

test('B-031 guards: every TypeScript read of invitations refuses deleted rows, or is listed with its reason', () => {
  const files = [...sources('app', ['.ts', '.tsx']), ...sources('lib', ['.ts', '.tsx'])];
  const querying = files.filter((file) => /from\(invitations\)|Join\(invitations|join invitations i|from invitations i/.test(read(file)));
  assert.ok(querying.length >= 20, `found ${querying.length}`);
  for (const file of querying) {
    if (file in TS_UNGUARDED) continue;
    assert.match(read(file), TS_GUARD, `${file} reads invitations without the B-031 guard`);
  }
  for (const file of Object.keys(TS_UNGUARDED)) assert.ok(querying.includes(file) || file === 'lib/db/schema.ts', `${file} still queries invitations`);
});

test('B-031 payments: a settlement after the deletion records the money and never activates the deleted invitation', () => {
  const service = read('lib/payment/service.ts');
  const settle = service.slice(service.indexOf('export async function applySettlement'), service.indexOf('async function activateInvitation'));
  const activate = service.slice(service.indexOf('async function activateInvitation'), service.indexOf('export async function confirmManually'));
  // `.insert(payments)` without its receiver: B-039 wraps the call (`tx\n.insert(payments)`); the order is what is pinned.
  const paymentInsert = settle.indexOf('.insert(payments)');
  assert.ok(paymentInsert > 0, 'the settlement writes the payment row');
  assert.ok(settle.indexOf("status: 'PAID'") < paymentInsert && paymentInsert < settle.indexOf('activateInvitation('),
    'the order and the payment are written before, and whatever, the activation decides');
  assert.match(activate, /\.where\(and\(eq\(invitations\.id, invitationId\), isNull\(invitations\.deletedAt\)\)\)\s*\.limit\(1\)\s*\.for\('update'\)/,
    'the activation reads only a live row, under the lock the deletion takes');
  // B-039 (s39): the shared decision (contracts/vectors/payment-settlement.json) reads an unfound row as not live.
  assert.match(activate, /const activation = decideActivation\(order, invitation \?\? null, paidAt\);\s*if \(activation\.kind !== 'activated'\) return activation;/,
    'a deleted (unfound) row is left as it is');
  assert.match(activate, /\.where\(and\(eq\(invitations\.id, invitationId\), isNull\(invitations\.deletedAt\), ne\(invitations\.status, 'PUBLISHED'\)\)\)/,
    'the activation writes only the live, unpublished row it locked');
  assert.ok(settle.indexOf('activateInvitation(') < settle.indexOf('.insert(jobs)'), 'the entitlement outbox row is written in the same transaction');
});

/** Rust statements on `invitations` that deliberately see deleted rows. */
const RUST_UNGUARDED: Record<string, string> = {
  'src/content/create.rs': 'slug uniqueness counts tombstones; the creation key finds its own row',
  'src/retention.rs': 'the purge, its dry run and the sweep work on deleted rows by definition',
  'src/media.rs': 'the variant job reads `deleted_at` itself and stops',
};

test('B-031 guards: every Rust statement on invitations refuses deleted rows, or is listed with its reason', () => {
  const files = sources('services/api/src', ['.rs']).map((file) => relative('services/api', file));
  let statements = 0;
  for (const file of files) {
    if (file in RUST_UNGUARDED) continue;
    const text = read(join('services/api', file));
    for (const match of text.matchAll(/(from|join) invitations\b|update invitations\b/g)) {
      statements += 1;
      const at = match.index ?? 0;
      // From the statement's `query` macro to the next one: the guard must sit in this statement, not a neighbour.
      const next = text.indexOf('query', at);
      const statement = text.slice(text.lastIndexOf('query', at), next === -1 ? text.length : next);
      assert.match(statement, /deleted_at is null/, `${file}: a statement on invitations without the B-031 guard`);
    }
  }
  assert.ok(statements >= 9, `found ${statements}`);
});

/** In-memory storage that records reads. */
function fakeStorage(objects: Record<string, string>) {
  const reads: string[] = [];
  return {
    reads,
    async read(key: string): Promise<StoredObjectRead | null> {
      reads.push(key);
      if (!(key in objects)) return null;
      const bytes = new TextEncoder().encode(objects[key]);
      return { body: new ReadableStream({ start: (c) => { c.enqueue(bytes); c.close(); } }), size: bytes.length, contentType: 'image/jpeg' };
    },
  };
}

const HEX = '0123456789abcdef01234567';

test('B-031 media: a deleted invitation\'s public uploads and variants stop at the origin; avatars and live ones do not', async () => {
  assert.equal(publicKeyInvitationId(`12/${HEX}.jpg`), 12);
  assert.equal(publicKeyInvitationId(`variants/12/${HEX}/standard-640.webp`), 12);
  assert.equal(publicKeyInvitationId(`avatars/12/${HEX}.jpg`), null);
  assert.equal(publicKeyInvitationId(`012/${HEX}.jpg`), null);
  assert.equal(publicKeyInvitationId('12'), null);

  const keys = [`12/${HEX}.jpg`, `variants/12/${HEX}/standard-640.webp`, `13/${HEX}.jpg`, `avatars/12/${HEX}.jpg`];
  const storage = fakeStorage(Object.fromEntries(keys.map((key) => [key, 'jpeg'])));
  const asked: number[] = [];
  const deps = {
    storage,
    ownerMayRead: async () => false,
    invitationGone: async (id: number) => {
      asked.push(id);
      return id === 12;
    },
  };
  for (const key of keys.slice(0, 2)) {
    const response = await serveMedia(key.split('/'), deps);
    assert.equal(response.status, 404, key);
    assert.equal(response.headers.get('cache-control'), 'private, no-store', `${key}: the refusal is never cached`);
  }
  assert.equal(storage.reads.length, 0, 'a deleted invitation\'s object is not even read');
  assert.equal((await serveMedia(keys[2].split('/'), deps)).status, 200, 'another invitation is served');
  assert.equal((await serveMedia(keys[3].split('/'), deps)).status, 200, 'avatars belong to no invitation');
  assert.deepEqual(asked, [12, 12, 13], 'avatars never ask');

  const failures: unknown[] = [];
  const failing = { ...deps, invitationGone: async () => { throw new Error('database down'); }, onAccessCheckError: (e: unknown) => failures.push(e) };
  assert.equal((await serveMedia(keys[0].split('/'), failing)).status, 200, 'a failed check serves the public object (fails open)');
  assert.equal(failures.length, 1, 'and reports it');
  assert.equal((await serveMedia(keys[0].split('/'), { storage, ownerMayRead: async () => false })).status, 200, 'without the check, as before');
  const route = read('app/media/[...path]/route.ts');
  assert.match(route, /invitationGone: invitationMediaGone/, 'the route wires the check');
});

test('B-031 CI: the database job runs the Next.js acceptance; the rust job builds the jobs binary and refuses to skip its section', () => {
  const database = read('scripts/ci/database.sh');
  assert.match(database, /step "verify-retention \(B-031[^"]*" npx tsx scripts\/verify-retention\.ts/);
  const rust = read('scripts/ci/rust.sh');
  assert.match(rust, /jobs_binary\(\) \{\s*SQLX_OFFLINE=true cargo build -q --locked --manifest-path "\$SERVICE\/Cargo\.toml" --bin invitesion-jobs/);
  assert.match(rust, /retention_end_to_end\(\) \{[^}]*REQUIRE_JOBS_BIN=1 JOBS_BIN=\$JOBS_BIN npx tsx scripts\/verify-retention\.ts/);
  assert.match(rust, /grep -q 'rust section: ran'/, 'the step checks the section ran');
  const order = ['step "host replay isolation', 'step "jobs binary', 'step "retention end to end'].map((s) => rust.indexOf(s));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `steps in order: ${order}`);

  const script = read('scripts/verify-retention.ts');
  const jobsEnv = script.slice(script.indexOf('const jobsEnv = '), script.indexOf('const lastLine', script.indexOf('const jobsEnv = ')));
  assert.ok(jobsEnv.length > 0, 'the binary has its own environment');
  assert.doesNotMatch(jobsEnv, /\.\.\.(process\.)?env\b/, 'nothing from the caller\u2019s environment reaches the binary');
  assert.doesNotMatch(jobsEnv, /S3_/, 'no S3 configuration');
  assert.match(script, /rustRequired[\s\S]*check\('7: JOBS_BIN names an executable invitesion-jobs/, 'a required section without a binary FAILS');
  assert.match(script, /rust section: \$\{rustRan \? 'ran' : 'skipped'\}/);
});

test('B-031 owner controls: confirmation required, owner-only, restore independent of the flag, flag off by default', async () => {
  const actions = read('app/(customer)/dashboard/invitations/actions.ts');
  assert.match(actions, /formData\.get\('confirm'\) !== 'yes'/);
  assert.match(actions, /scheduleInvitationDeletion\(user\.id, id\)/);
  assert.match(actions, /restoreDeletedInvitation\(user\.id, id\)/);
  const page = read('app/(customer)/dashboard/invitations/page.tsx');
  assert.match(page, /windowDays !== null && <DeleteControl/);
  assert.match(page, /name="confirm" value="yes" required/);
  assert.match(page, /isNull\(invitations\.purgedAt\)/);

  const db = read('lib/invitation/deletion-db.ts');
  const restore = db.slice(db.indexOf('export async function restoreDeletedInvitation'), db.indexOf('export async function invitationMediaGone'));
  assert.doesNotMatch(restore, /deletionWindowDays|isFlagOn/, 'restoring never depends on the flag');
  assert.match(restore, /eq\(invitations\.userId, ownerId\)[\s\S]*\.for\('update'\)/, 'the restore takes the row lock the purge takes');
  assert.match(RUST, /from invitations where id = \$1 for update/, 'and the purge takes it before deciding');
  assert.match(db.slice(db.indexOf('export async function scheduleInvitationDeletion')), /eq\(invitations\.userId, ownerId\)[\s\S]*\.for\('update'\)/);

  const { deletionWindowDays } = await import('../lib/invitation/deletion-db');
  assert.equal(deletionWindowDays({}), null, 'off by default');
  assert.equal(deletionWindowDays({ INVITATION_DELETION_WINDOW_DAYS: '30' }), null, 'a window alone does not switch it on');
  assert.equal(deletionWindowDays({ FLAG_INVITATION_DELETION: 'true' }), null, 'nor does the flag without a window');
  assert.equal(deletionWindowDays({ FLAG_INVITATION_DELETION: 'true', INVITATION_DELETION_WINDOW_DAYS: '30' }), 30);
  assert.equal(deletionWindowDays({ FLAG_INVITATION_DELETION: 'true', INVITATION_DELETION_WINDOW_DAYS: '0' }), null, 'a window first');
});
