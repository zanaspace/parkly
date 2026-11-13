import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { vehicles } from './account.js';
import { apiAccess, bookingSourceEnum, createdAt, id, updatedAt } from './common.js';
import { users } from './identity.js';
import { lots, ratePlans } from './lots.js';

export const passStatusEnum = pgEnum('pass_status', [
  'HELD',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'REVOKED',
]);

export const passWaitlistStatusEnum = pgEnum('pass_waitlist_status', [
  'WAITING',
  'NOTIFIED',
  'CONVERTED',
  'EXPIRED',
]);

/**
 * A driver's 30-day monthly pass at a single lot (FR-PASS-001..005, doc 02 §2.6).
 * Reserves 1 space (`lot_slot_inventory.pass_reserved`) across the 30-day window.
 * Allows unlimited check-ins/outs during opening hours with at most 1 vehicle in the lot at a time,
 * and up to 2 vehicle swaps per 30-day period (`swaps_used <= 2`).
 */
export const passes = pgTable(
  'passes',
  {
    id: id(),
    code: varchar('code', { length: 9 }).notNull(), // PK-XXXXXX
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }), // C3
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }), // C3
    plateNormSnapshot: varchar('plate_norm_snapshot', { length: 12 }).notNull(), // C3
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: passStatusEnum('status').notNull().default('HELD'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    priceKobo: bigint('price_kobo', { mode: 'number' }).notNull(),
    serviceFeeKobo: bigint('service_fee_kobo', { mode: 'number' }).notNull().default(0),
    totalKobo: bigint('total_kobo', { mode: 'number' }).notNull(),
    commissionBps: integer('commission_bps').notNull(),
    ratePlanId: uuid('rate_plan_id')
      .notNull()
      .references(() => ratePlans.id, { onDelete: 'restrict' }),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),
    swapsUsed: smallint('swaps_used').notNull().default(0),
    /** Dedupes the 7-day and 2-day renewal reminders (FR-PASS-003). */
    lastReminderDays: smallint('last_reminder_days'),
    renewedFromPassId: uuid('renewed_from_pass_id'),
    source: bookingSourceEnum('source').notNull().default('MOBILE'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('passes_code_key').on(t.code),
    index('passes_driver_period_idx').on(t.driverId, t.periodEnd.desc()),
    index('passes_lot_status_period_idx').on(t.lotId, t.status, t.periodStart, t.periodEnd),
    index('passes_status_hold_idx').on(t.status, t.holdExpiresAt),
    index('passes_vehicle_idx').on(t.vehicleId),
    check('passes_period_check', sql`${t.periodEnd} >= ${t.periodStart}`),
    check('passes_window_check', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'passes_amounts_check',
      sql`${t.priceKobo} > 0 and ${t.serviceFeeKobo} >= 0 and ${t.totalKobo} = ${t.priceKobo} + ${t.serviceFeeKobo}`,
    ),
    check('passes_swaps_check', sql`${t.swapsUsed} between 0 and 2`),
    check('passes_hold_check', sql`${t.status} <> 'HELD' or ${t.holdExpiresAt} is not null`),
    apiAccess('passes'),
  ],
).enableRLS();

/** Waitlist for drivers when a lot's monthly pass allocation is sold out (FR-PASS-001). */
export const passWaitlist = pgTable(
  'pass_waitlist',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // C3
    desiredStartDate: date('desired_start_date', { mode: 'string' }).notNull(),
    status: passWaitlistStatusEnum('status').notNull().default('WAITING'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('pass_waitlist_lot_status_idx').on(t.lotId, t.status, t.createdAt),
    index('pass_waitlist_driver_idx').on(t.driverId),
    apiAccess('pass_waitlist'),
  ],
).enableRLS();
