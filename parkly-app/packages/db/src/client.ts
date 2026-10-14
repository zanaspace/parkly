import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Serverless code connects through Supavisor transaction mode (port 6543),
 * which does not support prepared statements (ADR 0002).
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { prepare: false, max: options.max ?? 1, idle_timeout: 20 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>['db'];
