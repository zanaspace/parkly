import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, apiAppendOnly, bytea, createdAt, id, updatedAt } from './common.js';
import { users } from './identity.js';

export const platformEnum = pgEnum('device_platform', ['ANDROID', 'IOS', 'WEB', 'PWA']);
export const consentTypeEnum = pgEnum('consent_type', [
  'TERMS',
  'PRIVACY',
  'MARKETING',
  'LOCATION',
]);
export const dsrTypeEnum = pgEnum('dsr_type', [
  'ACCESS',
  'CORRECTION',
  'DELETION',
  'PORTABILITY',
  'OBJECTION',
]);
export const dsrStatusEnum = pgEnum('dsr_status', ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']);

/** Doc 02 §2.2. Max 5 active per driver (app rule); plate_norm used by gate lookups. */
export const vehicles = pgTable(
  'vehicles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plateRaw: varchar('plate_raw', { length: 20 }).notNull(), // C3
    plateNorm: varchar('plate_norm', { length: 12 }).notNull(), // C3
    make: varchar('make', { length: 40 }),
    model: varchar('model', { length: 40 }),
    colour: varchar('colour', { length: 40 }),
    isDefault: boolean('is_default').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('vehicles_user_plate_key')
      .on(t.userId, t.plateNorm)
      .where(sql`${t.deletedAt} is null`),
    // At most one default vehicle per driver.
    uniqueIndex('vehicles_user_default_key')
      .on(t.userId)
      .where(sql`${t.isDefault} and ${t.deletedAt} is null`),
    index('vehicles_plate_norm_idx').on(t.plateNorm),
    apiAccess('vehicles'),
  ],
).enableRLS();

/**
 * One row per (user, installed app). `client_device_id` is generated on the
 * device and kept in secure storage. Attendant columns are used from Sprint 5.
 */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientDeviceId: uuid('client_device_id').notNull(),
    platform: platformEnum('platform').notNull(),
    pushTokenEnc: text('push_token_enc'), // C3 [enc]
    appVersion: varchar('app_version', { length: 32 }),
    authSessionId: uuid('auth_session_id'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    operatorId: uuid('operator_id'),
    lotId: uuid('lot_id'),
    deviceKeyPublic: text('device_key_public'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('devices_user_client_device_key').on(t.userId, t.clientDeviceId),
    index('devices_auth_session_idx').on(t.authSessionId),
    apiAccess('devices'),
  ],
).enableRLS();

/** Append-only: a new row per decision, so the full consent history is kept. */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: consentTypeEnum('type').notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    granted: boolean('granted').notNull(),
    ipHash: bytea('ip_hash'), // C3
    createdAt: createdAt(),
  },
  (t) => [
    index('consents_user_type_idx').on(t.userId, t.type, t.createdAt),
    ...apiAppendOnly('consents'),
  ],
).enableRLS();

/** NDPA data-subject requests (doc 05, doc 06). Deletion processing arrives in Sprint 8. */
export const dataSubjectRequests = pgTable(
  'data_subject_requests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: dsrTypeEnum('type').notNull(),
    status: dsrStatusEnum('status').notNull().default('OPEN'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    handledBy: uuid('handled_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    exportStoragePath: text('export_storage_path'), // C3
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One open request of each type per user (DSR_ALREADY_OPEN).
    uniqueIndex('dsr_user_type_open_key')
      .on(t.userId, t.type)
      .where(sql`${t.status} in ('OPEN', 'IN_PROGRESS')`),
    index('dsr_status_due_idx').on(t.status, t.dueAt),
    apiAccess('data_subject_requests'),
  ],
).enableRLS();
