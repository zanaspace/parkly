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

export type LatLng = { lat: number; lng: number };

/**
 * Reads a PostGIS point as Postgres returns it: hex EWKB, optionally with an
 * SRID (flag 0x20000000). Only Point is supported; anything else throws.
 */
export function parseEwkbPoint(hex: string): LatLng {
  const buf = Buffer.from(hex, 'hex');
  const le = buf.readUInt8(0) === 1;
  const readU32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const readF64 = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  const type = readU32(1);
  if ((type & 0xffff) !== 1) throw new Error(`expected a Point, got WKB type ${type & 0xffff}`);
  const offset = type & 0x20000000 ? 9 : 5;
  return { lng: readF64(offset), lat: readF64(offset + 8) };
}

/**
 * `geography(Point,4326)` from PostGIS, which Supabase installs in the
 * `extensions` schema (not on the API role's search_path, so qualify it).
 * Geo queries (ST_DWithin, distance) stay in parameterised `sql` (doc 00 §3.2).
 */
export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType: () => 'extensions.geography(Point,4326)',
  toDriver: ({ lat, lng }) =>
    sql`extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography`,
  fromDriver: parseEwkbPoint,
});
