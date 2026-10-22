import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, apiAppendOnly, createdAt, id, updatedAt } from './common.js';
import { bookings } from './bookings.js';
import { users } from './identity.js';
import { lots } from './lots.js';

export const entryMethodEnum = pgEnum('entry_method', ['QR', 'CODE', 'PLATE', 'ADMIN']);
export const overstayStatusEnum = pgEnum('overstay_status', [
  'NONE',
  'DUE',
  'PAID',
  'UNPAID',
  'WAIVED',
]);
export const checkinEventTypeEnum = pgEnum('checkin_event_type', [
  'CHECK_IN',
  'CHECK_OUT',
  'WALK_IN',
  'ISSUE',
]);
export const syncResultEnum = pgEnum('sync_result', [
  'APPLIED',
  'DUPLICATE',
  'CONFLICT',
  'REJECTED',
]);

/**
 * One car's stay for a booking (doc 02 §2.6): when it entered and left, and
 * any overstay. Passes join in S9 (then booking_id becomes optional).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    plateNorm: varchar('plate_norm', { length: 12 }).notNull(), // C3
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    checkInBy: uuid('check_in_by').references(() => users.id, { onDelete: 'set null' }),
    checkOutBy: uuid('check_out_by').references(() => users.id, { onDelete: 'set null' }),
    entryMethod: entryMethodEnum('entry_method'),
    overstayMinutes: integer('overstay_minutes').notNull().default(0),
    overstayAmountKobo: bigint('overstay_amount_kobo', { mode: 'number' }).notNull().default(0),
    overstayStatus: overstayStatusEnum('overstay_status').notNull().default('NONE'),
    /** ENTRY_AFTER_CANCEL, MISSING_CHECKIN, PLATE_MISMATCH, CLOCK_SKEW, PROVISIONAL */
    flags: text('flags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('sessions_booking_key').on(t.bookingId),
    index('sessions_lot_check_in_idx').on(t.lotId, t.checkInAt),
    index('sessions_check_in_by_idx').on(t.checkInBy),
    index('sessions_check_out_by_idx').on(t.checkOutBy),
    check(
      'sessions_overstay_check',
      sql`${t.overstayMinutes} >= 0 and ${t.overstayAmountKobo} >= 0`,
    ),
    apiAccess('sessions'),
  ],
).enableRLS();

/**
 * Append-only log of every event an attendant device sent (doc 02 §2.6), with
 * the server's verdict. `client_event_id` is the device's idempotency key.
 */
export const checkinEvents = pgTable(
  'checkin_events',
  {
    id: id(),
    clientEventId: uuid('client_event_id').notNull(),
    type: checkinEventTypeEnum('type').notNull(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id'),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'restrict' }),
    method: entryMethodEnum('method'),
    plateSeen: varchar('plate_seen', { length: 12 }), // C3
    /** WALK_IN: +1 or −1. */
    delta: integer('delta'),
    overrideReason: varchar('override_reason', { length: 200 }),
    /** ISSUE: what the attendant reported (no PII). */
    note: varchar('note', { length: 500 }),
    attendantId: uuid('attendant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    deviceTime: timestamp('device_time', { withTimezone: true }).notNull(),
    /** Device time, corrected when the device clock was off (doc 03 §3.8). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).notNull(),
    result: syncResultEnum('result').notNull(),
    resultReason: varchar('result_reason', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('checkin_events_client_event_key').on(t.clientEventId),
    index('checkin_events_lot_idx').on(t.lotId, t.occurredAt),
    index('checkin_events_booking_idx').on(t.bookingId),
    index('checkin_events_session_idx').on(t.sessionId),
    index('checkin_events_attendant_idx').on(t.attendantId, t.occurredAt),
    check('checkin_events_delta_check', sql`${t.delta} is null or ${t.delta} in (-1, 1)`),
    ...apiAppendOnly('checkin_events'),
  ],
).enableRLS();

/** One row per sync call; `id` is the device's batch id (doc 02 §2.6). */
export const attendantSyncBatches = pgTable(
  'attendant_sync_batches',
  {
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id').notNull(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    attendantId: uuid('attendant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventCount: integer('event_count').notNull(),
    deviceSentAt: timestamp('device_sent_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).notNull(),
    clockOffsetMs: bigint('clock_offset_ms', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('attendant_sync_batches_device_idx').on(t.deviceId, t.serverReceivedAt),
    index('attendant_sync_batches_lot_idx').on(t.lotId),
    index('attendant_sync_batches_attendant_idx').on(t.attendantId),
    apiAccess('attendant_sync_batches'),
  ],
).enableRLS();

/** Walk-ins currently inside, per lot (doc 03 §3.5: counted only, no PII). */
export const lotWalkIns = pgTable(
  'lot_walk_ins',
  {
    lotId: uuid('lot_id')
      .primaryKey()
      .references(() => lots.id, { onDelete: 'cascade' }),
    count: integer('count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('lot_walk_ins_count_check', sql`${t.count} >= 0`), apiAccess('lot_walk_ins')],
).enableRLS();
