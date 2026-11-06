import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, createdAt, id, updatedAt } from './common.js';
import { paymentProviderEnum, payments } from './bookings.js';
import { users } from './identity.js';

export const reconciliationRunStatusEnum = pgEnum('reconciliation_run_status', [
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
]);

export const reconciliationResultEnum = pgEnum('reconciliation_result', [
  'MATCHED',
  'MISSING_INTERNAL',
  'MISSING_PROVIDER',
  'AMOUNT_MISMATCH',
  'STATUS_MISMATCH',
  'AUTO_FIXED',
]);

/**
 * Daily reconciliation runs per payment provider (doc 02 §2.7).
 */
export const reconciliationRuns = pgTable(
  'reconciliation_runs',
  {
    id: id(),
    businessDate: date('business_date').notNull(),
    provider: paymentProviderEnum('provider').notNull(),
    status: reconciliationRunStatusEnum('status').notNull().default('RUNNING'),
    totalInternal: integer('total_internal').notNull().default(0),
    totalProvider: integer('total_provider').notNull().default(0),
    matchedCount: integer('matched_count').notNull().default(0),
    mismatchedCount: integer('mismatched_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('reconciliation_runs_provider_date_key').on(t.provider, t.businessDate),
    index('reconciliation_runs_status_idx').on(t.status),
    apiAccess('reconciliation_runs'),
  ],
).enableRLS();

/**
 * Individual transactions compared in a reconciliation run (doc 02 §2.7).
 */
export const reconciliationItems = pgTable(
  'reconciliation_items',
  {
    id: id(),
    runId: uuid('run_id')
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    providerReference: varchar('provider_reference', { length: 100 }).notNull(),
    result: reconciliationResultEnum('result').notNull(),
    details: jsonb('details').notNull(),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reconciliation_items_run_idx').on(t.runId),
    index('reconciliation_items_result_idx').on(t.result),
    index('reconciliation_items_reference_idx').on(t.providerReference),
    apiAccess('reconciliation_items'),
  ],
).enableRLS();

export type ReconciliationRunRow = typeof reconciliationRuns.$inferSelect;
export type ReconciliationItemRow = typeof reconciliationItems.$inferSelect;
