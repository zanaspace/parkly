import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings.js';
import { apiAccess, createdAt, id } from './common.js';
import { users } from './identity.js';

export const notificationStatusEnum = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
]);

/**
 * Notification outbox and delivery log (FR-NOT-001/002, ADR 0020). Lifecycle
 * events insert one row each; the deliver-notifications job claims due rows,
 * sends them and retries failed channels with backoff. The payload holds what
 * the templates need (booking code, lot name, times, amounts), never a phone,
 * email or push token: those are read at send time. Kept 90 days (doc 06).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    eventKey: text('event_key').notNull(),
    /** One row per event, e.g. `booking.confirmed:<bookingId>`; repeats are ignored. */
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').notNull(), // C3: booking details for the templates
    status: notificationStatusEnum('status').notNull().default('PENDING'),
    /** Channels already delivered, so a retry only resends the ones that failed. */
    channelsDone: text('channels_done')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    attempts: integer('attempts').notNull().default(0),
    /** When the row is next due; also the lease while a job is sending it. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_key').on(t.dedupeKey),
    index('notifications_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'PENDING'`),
    index('notifications_user_idx').on(t.userId),
    index('notifications_booking_idx').on(t.bookingId),
    apiAccess('notifications'),
  ],
).enableRLS();
