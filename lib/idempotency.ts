import 'server-only';

import { sql } from 'drizzle-orm';
import type { db } from '@/lib/db/drizzle';

/**
 * B-024 (D-056): the TypeScript writer's side of `services/api/src/idempotency.rs`, for a write whose retry must replay
 * its first answer whichever writer is live. Same table (`api_idempotency_keys`), scope, request hash, statements and
 * 24-hour retention, so a batch the TypeScript writer answered replays through the Rust writer after a flip of the flag,
 * and the other way round. The key is recorded in the transaction of the write it protects; a refusal records nothing.
 * The caller builds the scope and the hash (for pass check-ins: `passCheckinScope` and `passCheckinHash`).
 */

export const IDEMPOTENCY_RETENTION_MS = 24 * 3_600_000;

export type IdempotentPrior = { kind: 'none' } | { kind: 'replay'; status: number; body: unknown } | { kind: 'mismatch' };

type Executor = Pick<typeof db, 'execute'>;

/** UTC wall time, as every `timestamp` column holds it. */
const wall = (date: Date) => date.toISOString().replace('T', ' ').replace('Z', '');
const expiredBefore = (now: Date) => wall(new Date(now.getTime() - IDEMPOTENCY_RETENTION_MS));

/** `lookup`: a live record for this scope and key replays when the request is the same one, else the key is reused. */
export async function lookupIdempotent(executor: Executor, scope: string, key: string, hash: string, now: Date): Promise<IdempotentPrior> {
  const rows = await executor.execute<{ request_hash: string; response_status: number; response_body: unknown }>(sql`
    select request_hash, response_status, response_body from api_idempotency_keys
    where scope = ${scope} and key = ${key} and created_at >= ${expiredBefore(now)}::timestamp`);
  const row = rows[0];
  if (!row) return { kind: 'none' };
  if (row.request_hash !== hash) return { kind: 'mismatch' };
  const body = typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body;
  return { kind: 'replay', status: Number(row.response_status), body };
}

/**
 * `record`: stores the key with the response inside the write's transaction. False when another request with this key
 * committed first: the caller rolls back and answers from `lookupIdempotent`. An expired record is replaced, and up to
 * 100 expired records are swept, as the API does.
 */
export async function recordIdempotent(
  executor: Executor,
  scope: string,
  key: string,
  hash: string,
  status: number,
  body: unknown,
  now: Date,
): Promise<boolean> {
  const rows = await executor.execute<{ inserted: boolean }>(sql`
    insert into api_idempotency_keys (scope, key, request_hash, response_status, response_body, created_at)
    values (${scope}, ${key}, ${hash}, ${status}, ${JSON.stringify(body)}::text::jsonb, ${wall(now)}::timestamp)
    on conflict (scope, key) do update set
      request_hash = excluded.request_hash, response_status = excluded.response_status,
      response_body = excluded.response_body, created_at = excluded.created_at
    where api_idempotency_keys.created_at < ${expiredBefore(now)}::timestamp
    returning true as inserted`);
  if (!rows.length) return false;
  await executor.execute(sql`
    delete from api_idempotency_keys where (scope, key) in
      (select scope, key from api_idempotency_keys where created_at < ${expiredBefore(now)}::timestamp order by created_at limit 100)`);
  return true;
}
