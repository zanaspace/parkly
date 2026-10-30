import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings.js';
import { apiAccess, createdAt, id } from './common.js';
import { operators } from './operators.js';

/**
 * FR-BOOK-009, gap review L-5: one stored receipt per booking. `content` is
 * frozen when issued; a new charge or refund re-issues it as the next
 * revision under the same number. PDFs are generated from `content` on
 * demand (doc 06), so every copy of a revision is identical.
 */
export const receipts = pgTable(
  'receipts',
  {
    id: id(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'restrict' }),
    /** The operator's sequence number; `number` is its display form (R-000123). */
    seq: integer('seq').notNull(),
    number: text('number').notNull(),
    revision: integer('revision').notNull().default(1),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    revisedAt: timestamp('revised_at', { withTimezone: true }).notNull(),
    content: jsonb('content').notNull(), // C3: what the receipt shows
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('receipts_booking_key').on(t.bookingId),
    uniqueIndex('receipts_operator_seq_key').on(t.operatorId, t.seq),
    index('receipts_operator_idx').on(t.operatorId),
    apiAccess('receipts'),
  ],
).enableRLS();

/** The last receipt number given out per operator. */
export const receiptCounters = pgTable(
  'receipt_counters',
  {
    operatorId: uuid('operator_id')
      .primaryKey()
      .references(() => operators.id, { onDelete: 'restrict' }),
    lastSeq: integer('last_seq').notNull(),
    createdAt: createdAt(),
  },
  () => [apiAccess('receipt_counters')],
).enableRLS();
