import { sql } from 'drizzle-orm';
import { customType, pgPolicy, pgRole, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Created by a hand-written migration; drizzle-kit must not manage it. */
export const parklyApi = pgRole('parkly_api').existing();

/**
 * RLS is enabled on every table and `anon`/`authenticated` get no policies
 * (deny-all). The API role gets one explicit allow-all policy instead of
 * BYPASSRLS, which hosted Supabase may not let us grant (doc 02 §1).
 */
export const apiAccess = (table: string) =>
  pgPolicy(`${table}_api_all`, {
    as: 'permissive',
    for: 'all',
    to: parklyApi,
    using: sql`true`,
    withCheck: sql`true`,
  });

/** Append-only tables: the API may read and insert, never update or delete. */
export const apiAppendOnly = (table: string) => [
  pgPolicy(`${table}_api_select`, { for: 'select', to: parklyApi, using: sql`true` }),
  pgPolicy(`${table}_api_insert`, { for: 'insert', to: parklyApi, withCheck: sql`true` }),
];

export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Kept current by the shared `set_updated_at` trigger (hand-written migration). */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
