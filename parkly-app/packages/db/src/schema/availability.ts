import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apiAccess } from './common.js';
import { lots } from './lots.js';

/**
 * One row per lot per 15-minute slot (doc 02 §2.5, doc 01 §6, ADR 0006).
 * Rows are created on demand by the booking functions (S4) with capacity
 * copied from `lots.capacity_bookable`; a slot without a row is fully free.
 * High-volume, so no id or timestamps.
 */
export const lotSlotInventory = pgTable(
  'lot_slot_inventory',
  {
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull(),
    booked: integer('booked').notNull().default(0),
    held: integer('held').notNull().default(0),
    passReserved: integer('pass_reserved').notNull().default(0),
    blocked: integer('blocked').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.lotId, t.slotStart] }),
    check(
      'lot_slot_inventory_slot_check',
      sql`extract(epoch from ${t.slotStart})::bigint % 900 = 0`,
    ),
    check(
      'lot_slot_inventory_counts_check',
      sql`${t.capacity} >= 0 and ${t.booked} >= 0 and ${t.held} >= 0 and ${t.passReserved} >= 0 and ${t.blocked} >= 0`,
    ),
    check(
      'lot_slot_inventory_capacity_check',
      sql`${t.booked} + ${t.held} + ${t.passReserved} + ${t.blocked} <= ${t.capacity}`,
    ),
    apiAccess('lot_slot_inventory'),
  ],
).enableRLS();
