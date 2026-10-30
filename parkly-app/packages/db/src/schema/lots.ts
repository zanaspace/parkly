import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, createdAt, geographyPoint, id, updatedAt } from './common.js';
import { files } from './files.js';
import { users } from './identity.js';
import { operators, operatorTypeEnum, reviewStatusEnum } from './operators.js';

// Doc 00 §3.6 — names are fixed. Never reorder; add new values at the end.
export const lotStatusEnum = pgEnum('lot_status', [
  'DRAFT',
  'PENDING_VERIFICATION',
  'LIVE',
  'PAUSED',
  'SUSPENDED',
  'ARCHIVED',
]);
export const permitStatusEnum = pgEnum('permit_status', [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
export const photoStatusEnum = pgEnum('lot_photo_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const verificationItemEnum = pgEnum('verification_item', [
  'LASPA_PERMIT',
  'GUARD_PRESENCE',
  'LIGHTING',
  'CCTV',
  'ACCESS_CONTROL',
  'CAPACITY_COUNT',
  'OWNER_IDENTITY',
  'ENTRANCE_SIGNAGE',
  'FIRE_SAFETY',
]);
export const checkResultEnum = pgEnum('check_result', ['PASS', 'FAIL', 'NA']);
export const productEnum = pgEnum('product', ['HOURLY', 'DAILY', 'MONTHLY']);
export const ratePlanStatusEnum = pgEnum('rate_plan_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'RETIRED',
  'REJECTED',
]);

/** A parking facility (doc 02 §2.4). Capacity counts, not numbered bays (doc 00 §3.5). */
export const lots = pgTable(
  'lots',
  {
    id: id(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'restrict' }),
    type: operatorTypeEnum('type').notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: varchar('description', { length: 1000 }),
    addressLine: text('address_line').notNull(),
    area: varchar('area', { length: 80 }),
    lga: varchar('lga', { length: 80 }),
    location: geographyPoint('location').notNull(),
    entranceNotes: varchar('entrance_notes', { length: 500 }),
    capacityTotal: integer('capacity_total').notNull(),
    capacityBookable: integer('capacity_bookable').notNull(),
    amenities: text('amenities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    vehicleTypes: text('vehicle_types')
      .array()
      .notNull()
      .default(sql`'{CAR}'::text[]`),
    status: lotStatusEnum('status').notNull().default('DRAFT'),
    statusReason: text('status_reason'),
    /** Derived: true while the lot passes the listing gate (doc 00 §3.6). */
    verifiedBadge: boolean('verified_badge').notNull().default(false),
    timezone: varchar('timezone', { length: 40 }).notNull().default('Africa/Lagos'),
    /** Drivers may check themselves in with the entrance QR (ADR 0016); the owner decides. */
    selfCheckinEnabled: boolean('self_checkin_enabled').notNull().default(false),
    /** Optimistic concurrency for PATCH (CONFLICT_STALE_VERSION). */
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('lots_capacity_total_check', sql`${t.capacityTotal} > 0`),
    check(
      'lots_capacity_bookable_check',
      sql`${t.capacityBookable} > 0 and ${t.capacityBookable} <= ${t.capacityTotal}`,
    ),
    uniqueIndex('lots_slug_key').on(t.slug),
    index('lots_location_gist').using('gist', t.location),
    index('lots_status_idx').on(t.status),
    index('lots_operator_idx').on(t.operatorId),
    index('lots_created_by_idx').on(t.createdBy),
    apiAccess('lots'),
  ],
).enableRLS();

/** One window per weekday (0 = Sunday). Overnight windows close before they open (18:00–06:00). */
export const lotOpeningHours = pgTable(
  'lot_opening_hours',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    is24h: boolean('is_24h').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check('lot_opening_hours_weekday_check', sql`${t.weekday} between 0 and 6`),
    check(
      'lot_opening_hours_window_check',
      sql`${t.is24h} or (${t.opensAt} is not null and ${t.closesAt} is not null and ${t.opensAt} <> ${t.closesAt})`,
    ),
    uniqueIndex('lot_opening_hours_lot_weekday_key').on(t.lotId, t.weekday),
    apiAccess('lot_opening_hours'),
  ],
).enableRLS();

/** Holidays and events when the lot is closed. */
export const lotClosures = pgTable(
  'lot_closures',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: varchar('reason', { length: 200 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('lot_closures_window_check', sql`${t.endsAt} > ${t.startsAt}`),
    index('lot_closures_lot_starts_idx').on(t.lotId, t.startsAt),
    index('lot_closures_created_by_idx').on(t.createdBy),
    apiAccess('lot_closures'),
  ],
).enableRLS();

/** 3–10 per lot (FR-LOT-002). Copied to `lot-photos-public` only after admin approval. */
export const lotPhotos = pgTable(
  'lot_photos',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    publicFileId: uuid('public_file_id').references(() => files.id, { onDelete: 'set null' }),
    sort: smallint('sort').notNull().default(0),
    caption: varchar('caption', { length: 140 }),
    status: photoStatusEnum('status').notNull().default('PENDING'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('lot_photos_lot_sort_idx').on(t.lotId, t.sort),
    uniqueIndex('lot_photos_file_key').on(t.fileId),
    index('lot_photos_public_file_idx').on(t.publicFileId),
    index('lot_photos_reviewed_by_idx').on(t.reviewedBy),
    apiAccess('lot_photos'),
  ],
).enableRLS();

/**
 * LASPA permit (C3). `issued_at`/`expires_at` are calendar dates in Lagos; a
 * permit is no longer valid on its expiry date (domain `listability`).
 */
export const permits = pgTable(
  'permits',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    issuer: varchar('issuer', { length: 40 }).notNull().default('LASPA'),
    permitNumber: varchar('permit_number', { length: 64 }).notNull(),
    issuedAt: date('issued_at', { mode: 'string' }).notNull(),
    expiresAt: date('expires_at', { mode: 'string' }).notNull(),
    documentFileId: uuid('document_file_id').references(() => files.id, {
      onDelete: 'restrict',
    }),
    status: permitStatusEnum('status').notNull().default('SUBMITTED'),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    /** How ops checked it with LASPA (phone/email/portal) and the reference (doc 03 §4.2). */
    reviewNote: text('review_note'),
    /** Dedupes the 30/14/7/1-day reminders (FR-LOT-007). */
    lastReminderDays: smallint('last_reminder_days'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('permits_dates_check', sql`${t.expiresAt} > ${t.issuedAt}`),
    index('permits_lot_status_idx').on(t.lotId, t.status),
    index('permits_status_expires_idx').on(t.status, t.expiresAt),
    index('permits_document_file_idx').on(t.documentFileId),
    index('permits_submitted_by_idx').on(t.submittedBy),
    index('permits_reviewed_by_idx').on(t.reviewedBy),
    apiAccess('permits'),
  ],
).enableRLS();

/** On-site inspection (FR-LOT-004). Valid for 12 months from the inspection day. */
export const verificationRecords = pgTable(
  'verification_records',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    inspectorUserId: uuid('inspector_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }).notNull(),
    status: reviewStatusEnum('status').notNull().default('SUBMITTED'),
    capacityCounted: integer('capacity_counted').notNull(),
    gpsAtInspection: geographyPoint('gps_at_inspection'), // C2
    notes: text('notes'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    validUntil: date('valid_until', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('verification_records_capacity_check', sql`${t.capacityCounted} >= 0`),
    index('verification_records_lot_status_idx').on(t.lotId, t.status),
    index('verification_records_inspector_idx').on(t.inspectorUserId),
    index('verification_records_reviewed_by_idx').on(t.reviewedBy),
    apiAccess('verification_records'),
  ],
).enableRLS();

export const verificationItems = pgTable(
  'verification_items',
  {
    id: id(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => verificationRecords.id, { onDelete: 'cascade' }),
    item: verificationItemEnum('item').notNull(),
    result: checkResultEnum('result').notNull(),
    /** `files` ids in the `verification` bucket. */
    evidenceFileIds: uuid('evidence_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('verification_items_record_item_key').on(t.recordId, t.item),
    apiAccess('verification_items'),
  ],
).enableRLS();

/** Prices in kobo (doc 00 §3.4). Admin approval required; applies to new bookings only (FR-LOT-005). */
export const ratePlans = pgTable(
  'rate_plans',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    product: productEnum('product').notNull(),
    status: ratePlanStatusEnum('status').notNull().default('PENDING_APPROVAL'),
    currency: char('currency', { length: 3 }).notNull().default('NGN'),
    hourlyRateKobo: bigint('hourly_rate_kobo', { mode: 'number' }),
    minMinutes: integer('min_minutes').notNull().default(60),
    blockMinutes: integer('block_minutes').notNull().default(15),
    dailyCapKobo: bigint('daily_cap_kobo', { mode: 'number' }),
    dailyRateKobo: bigint('daily_rate_kobo', { mode: 'number' }),
    monthlyRateKobo: bigint('monthly_rate_kobo', { mode: 'number' }),
    /** Operator's overstay price per 15 minutes (ADR 0016); null = hourly ÷ 4. API caps it at the platform maximum. */
    overstayRateKobo: bigint('overstay_rate_kobo', { mode: 'number' }),
    /** Grace after the end, at least the platform's 10 minutes; null = the platform's. */
    overstayGraceMin: integer('overstay_grace_min'),
    /** Reserved for Grow; null in MVP. */
    earlyBird: jsonb('early_bird'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'rate_plans_price_check',
      sql`(${t.product} = 'HOURLY' and ${t.hourlyRateKobo} > 0)
        or (${t.product} = 'DAILY' and ${t.dailyRateKobo} > 0)
        or (${t.product} = 'MONTHLY' and ${t.monthlyRateKobo} > 0)`,
    ),
    check('rate_plans_block_check', sql`${t.blockMinutes} = 15`),
    check(
      'rate_plans_overstay_check',
      sql`(${t.overstayRateKobo} is null or ${t.overstayRateKobo} > 0)
        and (${t.overstayGraceMin} is null or ${t.overstayGraceMin} between 10 and 240)`,
    ),
    check(
      'rate_plans_min_minutes_check',
      sql`${t.minMinutes} between 15 and 1440 and ${t.minMinutes} % 15 = 0`,
    ),
    // One live price and one pending change per (lot, product).
    uniqueIndex('rate_plans_active_key')
      .on(t.lotId, t.product)
      .where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex('rate_plans_pending_key')
      .on(t.lotId, t.product)
      .where(sql`${t.status} = 'PENDING_APPROVAL'`),
    index('rate_plans_status_idx').on(t.status),
    index('rate_plans_submitted_by_idx').on(t.submittedBy),
    index('rate_plans_approved_by_idx').on(t.approvedBy),
    apiAccess('rate_plans'),
  ],
).enableRLS();
