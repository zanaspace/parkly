import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, apiAppendOnly, createdAt, id, updatedAt } from './common.js';
import { vehicles } from './account.js';
import { users } from './identity.js';
import { lots, productEnum, ratePlans } from './lots.js';
import { operators } from './operators.js';

// Doc 00 §3.6 — names are fixed. Never reorder; add new values at the end.
export const bookingStatusEnum = pgEnum('booking_status', [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
]);
export const bookingActorEnum = pgEnum('booking_actor', ['DRIVER', 'ADMIN', 'ATTENDANT', 'SYSTEM']);
export const bookingSourceEnum = pgEnum('booking_source', ['MOBILE', 'WEB', 'ADMIN']);
export const paymentStatusEnum = pgEnum('payment_status', [
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'ABANDONED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);
export const paymentKindEnum = pgEnum('payment_kind', ['BOOKING', 'EXTENSION', 'OVERSTAY', 'PASS']);
export const paymentProviderEnum = pgEnum('payment_provider', ['PAYSTACK', 'FLUTTERWAVE', 'FAKE']);
export const refundReasonEnum = pgEnum('refund_reason', [
  'DRIVER_CANCEL',
  'HOLD_EXPIRED',
  'LOT_UNAVAILABLE',
  'OPS_GOODWILL',
  'DUPLICATE',
  'PERMIT_SUSPENSION',
  'OTHER',
]);
export const refundStatusEnum = pgEnum('refund_status', ['PENDING', 'SUCCEEDED', 'FAILED']);
export const webhookProcessingEnum = pgEnum('webhook_processing_status', [
  'PENDING',
  'PROCESSED',
  'FAILED',
  'IGNORED',
]);
export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'ASSET',
  'LIABILITY',
  'REVENUE',
  'EXPENSE',
]);
export const ledgerDirectionEnum = pgEnum('ledger_direction', ['DEBIT', 'CREDIT']);
export const idempotencyStatusEnum = pgEnum('idempotency_status', ['IN_PROGRESS', 'COMPLETED']);

/** A driver's booking for one lot and window (doc 02 §2.6). Prices are server snapshots. */
export const bookings = pgTable(
  'bookings',
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
    product: productEnum('product').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: bookingStatusEnum('status').notNull().default('PENDING_PAYMENT'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    priceKobo: bigint('price_kobo', { mode: 'number' }).notNull(),
    serviceFeeKobo: bigint('service_fee_kobo', { mode: 'number' }).notNull(),
    totalKobo: bigint('total_kobo', { mode: 'number' }).notNull(),
    commissionBps: integer('commission_bps').notNull(),
    ratePlanId: uuid('rate_plan_id')
      .notNull()
      .references(() => ratePlans.id, { onDelete: 'restrict' }),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
    source: bookingSourceEnum('source').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('bookings_code_key').on(t.code),
    index('bookings_driver_start_idx').on(t.driverId, t.startAt.desc()),
    index('bookings_lot_start_idx').on(t.lotId, t.startAt),
    index('bookings_status_hold_idx').on(t.status, t.holdExpiresAt),
    index('bookings_status_start_idx').on(t.status, t.startAt),
    index('bookings_vehicle_idx').on(t.vehicleId),
    index('bookings_rate_plan_idx').on(t.ratePlanId),
    index('bookings_cancelled_by_idx').on(t.cancelledBy),
    check('bookings_window_check', sql`${t.endAt} > ${t.startAt}`),
    check(
      'bookings_grid_check',
      sql`extract(epoch from ${t.startAt})::bigint % 900 = 0 and extract(epoch from ${t.endAt})::bigint % 900 = 0`,
    ),
    check('bookings_product_check', sql`${t.product} in ('HOURLY', 'DAILY')`),
    check(
      'bookings_amounts_check',
      sql`${t.priceKobo} > 0 and ${t.serviceFeeKobo} >= 0 and ${t.totalKobo} = ${t.priceKobo} + ${t.serviceFeeKobo}`,
    ),
    check('bookings_commission_check', sql`${t.commissionBps} between 0 and 10000`),
    check(
      'bookings_hold_check',
      sql`${t.status} <> 'PENDING_PAYMENT' or ${t.holdExpiresAt} is not null`,
    ),
    apiAccess('bookings'),
  ],
).enableRLS();

/** Append-only: every status change and who made it (doc 02 §2.6). */
export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: id(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    fromStatus: bookingStatusEnum('from_status'),
    toStatus: bookingStatusEnum('to_status').notNull(),
    actorType: bookingActorEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('booking_status_history_booking_idx').on(t.bookingId, t.createdAt),
    ...apiAppendOnly('booking_status_history'),
  ],
).enableRLS();

/** One attempt to collect money; `id` is also the provider reference (doc 02 §2.7). */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    kind: paymentKindEnum('kind').notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'restrict' }),
    payerUserId: uuid('payer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }), // C3
    provider: paymentProviderEnum('provider').notNull(),
    providerReference: varchar('provider_reference', { length: 100 }).notNull(),
    providerAccessCode: varchar('provider_access_code', { length: 100 }),
    authorizationUrl: text('authorization_url'),
    currency: char('currency', { length: 3 }).notNull().default('NGN'),
    amountKobo: bigint('amount_kobo', { mode: 'number' }).notNull(),
    feesKobo: bigint('fees_kobo', { mode: 'number' }),
    platformAmountKobo: bigint('platform_amount_kobo', { mode: 'number' }).notNull(),
    operatorAmountKobo: bigint('operator_amount_kobo', { mode: 'number' }).notNull(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'restrict' }),
    subaccountCode: varchar('subaccount_code', { length: 64 }), // C4
    status: paymentStatusEnum('status').notNull().default('INITIATED'),
    channel: varchar('channel', { length: 32 }),
    cardLast4: char('card_last4', { length: 4 }), // C3; never more card data
    cardBrand: varchar('card_brand', { length: 32 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 64 }),
    failureMessage: text('failure_message'),
    rawVerify: jsonb('raw_verify'), // C3, redacted (no authorization codes)
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payments_provider_reference_key').on(t.provider, t.providerReference),
    index('payments_status_created_idx').on(t.status, t.createdAt),
    index('payments_booking_idx').on(t.bookingId),
    index('payments_payer_idx').on(t.payerUserId),
    index('payments_operator_idx').on(t.operatorId),
    check('payments_target_check', sql`${t.kind} <> 'BOOKING' or ${t.bookingId} is not null`),
    check(
      'payments_amounts_check',
      sql`${t.amountKobo} > 0 and ${t.platformAmountKobo} >= 0 and ${t.operatorAmountKobo} >= 0
        and ${t.platformAmountKobo} + ${t.operatorAmountKobo} = ${t.amountKobo}`,
    ),
    apiAccess('payments'),
  ],
).enableRLS();

/** Refunds against one payment; their sum never exceeds it (checked under the payment row lock). */
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    amountKobo: bigint('amount_kobo', { mode: 'number' }).notNull(),
    reason: refundReasonEnum('reason').notNull(),
    status: refundStatusEnum('status').notNull().default('PENDING'),
    providerRefundId: varchar('provider_refund_id', { length: 100 }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_requested_by_idx').on(t.requestedBy),
    index('refunds_approved_by_idx').on(t.approvedBy),
    check('refunds_amount_check', sql`${t.amountKobo} > 0`),
    apiAccess('refunds'),
  ],
).enableRLS();

/**
 * Every provider webhook we accept, deduplicated (doc 02 §7). Rows are never
 * deleted by the API; only the processing columns change.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: paymentProviderEnum('provider').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    reference: varchar('reference', { length: 100 }),
    signatureValid: boolean('signature_valid').notNull().default(true),
    payload: jsonb('payload').notNull(), // C3, retained 180 days
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingStatus: webhookProcessingEnum('processing_status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('webhook_events_dedupe_key').on(t.provider, t.dedupeKey),
    index('webhook_events_status_idx').on(t.processingStatus, t.receivedAt),
    index('webhook_events_reference_idx').on(t.reference),
    apiAccess('webhook_events'),
  ],
).enableRLS();

/** A replayable response per (actor, Idempotency-Key), kept 48 hours (doc 02 §2.9). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    actorId: uuid('actor_id').notNull(),
    key: varchar('key', { length: 100 }).notNull(),
    method: varchar('method', { length: 8 }).notNull(),
    path: text('path').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: idempotencyStatusEnum('status').notNull().default('IN_PROGRESS'),
    responseStatus: smallint('response_status'),
    responseBody: jsonb('response_body'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.key] }),
    index('idempotency_keys_expires_idx').on(t.expiresAt),
    apiAccess('idempotency_keys'),
  ],
).enableRLS();

/** Chart of accounts for the double-entry ledger (doc 02 §2.7). */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: id(),
    code: varchar('code', { length: 100 }).notNull(),
    type: ledgerAccountTypeEnum('type').notNull(),
    operatorId: uuid('operator_id').references(() => operators.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('ledger_accounts_code_key').on(t.code),
    index('ledger_accounts_operator_idx').on(t.operatorId),
    apiAccess('ledger_accounts'),
  ],
).enableRLS();

/** Append-only journal lines; each journal balances at commit (`ledger_balanced_check`). */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    journalId: uuid('journal_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    direction: ledgerDirectionEnum('direction').notNull(),
    amountKobo: bigint('amount_kobo', { mode: 'number' }).notNull(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    refundId: uuid('refund_id').references(() => refunds.id, { onDelete: 'restrict' }),
    description: text('description'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_entries_journal_idx').on(t.journalId),
    index('ledger_entries_account_idx').on(t.accountId, t.createdAt),
    index('ledger_entries_payment_idx').on(t.paymentId),
    index('ledger_entries_refund_idx').on(t.refundId),
    check('ledger_entries_amount_check', sql`${t.amountKobo} > 0`),
    ...apiAppendOnly('ledger_entries'),
  ],
).enableRLS();
