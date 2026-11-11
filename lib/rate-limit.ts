import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { retryAfter, windowStart, type Limit, type Verdict } from './rate-limit-keys';

export { addressKey, addressSecret, ipBucket, parseLimit, retryAfter, windowStart, type Limit, type Verdict } from './rate-limit-keys';

/**
 * B-033: the TypeScript writer's side of the write limits (B-013), a port of `services/api/src/limits.rs`: the same
 * fixed windows in `api_rate_limits`, the same statement, the same bucket names (the pure rules are
 * `rate-limit-keys.ts`, pinned by shared vectors). So a limit holds across a flip of `BACKEND_ROSTER` and counts the
 * same whichever writer is live. A client address is reduced to the API's keyed hash before it reaches the database and
 * is never logged (UU PDP); without `INTERNAL_API_SECRET` there is no key, and the per-address limit is skipped (the
 * per-link limit and the queue ceiling still apply).
 */

/** UTC wall time, as every `timestamp` column holds it. */
const wall = (date: Date) => date.toISOString().replace('T', ' ').replace('Z', '');

/** One hit for `bucket` at `now`: the API's statement, so both writers share every window. */
export async function hit(bucket: string, limit: Limit, now: Date = new Date()): Promise<Verdict> {
  const start = wall(windowStart(now, limit.windowSeconds));
  const rows = await db.execute<{ hits: number }>(sql`
    insert into api_rate_limits (bucket, window_start, hits) values (${bucket}, ${start}::timestamp, 1)
    on conflict (bucket) do update set
      hits = case when excluded.window_start > api_rate_limits.window_start then 1 else api_rate_limits.hits + 1 end,
      window_start = greatest(api_rate_limits.window_start, excluded.window_start)
    returning hits`);
  const hits = Number(rows[0]?.hits ?? 1);
  if (hits === 1) {
    await db.execute(sql`
      delete from api_rate_limits where bucket in
        (select bucket from api_rate_limits where window_start < ${wall(new Date(now.getTime() - 86_400_000))}::timestamp
         order by window_start limit 100)`);
  }
  return { allowed: hits <= limit.max, retryAfter: retryAfter(now, limit) };
}
