import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';
import { getPostgresUrl } from '@/lib/env';

// Only the standalone scripts (db:seed, db:setup, drizzle-kit) need this; under
// Next.js the environment is already loaded and this is a no-op.
dotenv.config();

/**
 * Connection pooling.
 *
 * `postgres()` opens up to `max` sockets per process. Two things previously
 * made that unbounded in practice: every dev HMR reload constructed a fresh
 * client while the old one kept its sockets, and no ceiling was declared for
 * production. Postgres itself caps total connections, so exhausting them takes
 * the whole database down rather than just one instance.
 *
 * The client is therefore cached on `globalThis` across module reloads, and the
 * pool size is explicit so it can be reasoned about against the database's
 * `max_connections` and the number of running instances.
 */
const globalForDb = globalThis as unknown as {
  __appSql?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(getPostgresUrl(), {
    max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export const client = globalForDb.__appSql ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForDb.__appSql = client;

export const db = drizzle(client, { schema });
