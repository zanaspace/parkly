import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { apiAccess, bytea, createdAt, id, updatedAt } from './common.js';
import { files } from './files.js';
import { users } from './identity.js';

// Never reorder enum values; add new ones at the end.
export const operatorTypeEnum = pgEnum('operator_type', [
  'HOTEL',
  'OFFICE',
  'COMMERCIAL_LOT',
  'EVENT_CENTRE',
  'OTHER',
]);
export const operatorStatusEnum = pgEnum('operator_status', [
  'ONBOARDING',
  'ACTIVE',
  'SUSPENDED',
  'OFFBOARDED',
]);
export const operatorTierEnum = pgEnum('operator_tier', ['FREE', 'PRO']);
export const kybStatusEnum = pgEnum('kyb_status', [
  'NOT_STARTED',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
]);
export const memberRoleEnum = pgEnum('operator_member_role', ['OWNER', 'MANAGER', 'ATTENDANT']);
export const memberStatusEnum = pgEnum('operator_member_status', ['INVITED', 'ACTIVE', 'REMOVED']);
export const kybDocTypeEnum = pgEnum('kyb_document_type', [
  'CAC_CERT',
  'DIRECTOR_ID',
  'UTILITY_BILL',
  'OTHER',
]);
export const reviewStatusEnum = pgEnum('review_status', [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
]);
export const payoutProviderEnum = pgEnum('payout_provider', ['PAYSTACK', 'FLUTTERWAVE']);
/** PENDING: entered; VERIFIED: name resolved by the provider; ACTIVE: subaccount created (KYB approved). */
export const payoutStatusEnum = pgEnum('payout_account_status', [
  'PENDING',
  'VERIFIED',
  'ACTIVE',
  'DISABLED',
]);

/** A business that runs lots (doc 02 §2.3). `[enc]` columns hold app-level ciphertext. */
export const operators = pgTable(
  'operators',
  {
    id: id(),
    legalName: varchar('legal_name', { length: 200 }).notNull(), // C2
    tradingName: varchar('trading_name', { length: 120 }).notNull(), // C1
    type: operatorTypeEnum('type').notNull(),
    cacNumberEnc: text('cac_number_enc'), // C3 [enc]
    tinEnc: text('tin_enc'), // C3 [enc]
    addressLine: text('address_line'), // C2
    contactEmail: varchar('contact_email', { length: 254 }), // C3
    contactPhoneEnc: text('contact_phone_enc'), // C3 [enc]
    status: operatorStatusEnum('status').notNull().default('ONBOARDING'),
    commissionBps: integer('commission_bps').notNull().default(1200),
    tier: operatorTierEnum('tier').notNull().default('FREE'),
    kybStatus: kybStatusEnum('kyb_status').notNull().default('NOT_STARTED'),
    kybSubmittedAt: timestamp('kyb_submitted_at', { withTimezone: true }),
    kybReviewedBy: uuid('kyb_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    kybReviewedAt: timestamp('kyb_reviewed_at', { withTimezone: true }),
    kybRejectionReason: text('kyb_rejection_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // 10–15 % is the app rule; SUPER_ADMIN may override, so the DB only bounds it.
    check('operators_commission_bps_check', sql`${t.commissionBps} between 0 and 10000`),
    index('operators_status_idx').on(t.status),
    index('operators_kyb_status_idx').on(t.kybStatus),
    index('operators_created_by_idx').on(t.createdBy),
    apiAccess('operators'),
  ],
).enableRLS();

/**
 * Membership lifecycle and invites. Active members also hold a `user_roles`
 * row (the source for JWT claims); this table keeps who invited whom, lot
 * scope and the invite token. `user_id` is null until an invite is accepted.
 */
export const operatorMembers = pgTable(
  'operator_members',
  {
    id: id(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull(),
    /** Attendant lot scope; empty = every lot of the operator. */
    lotIds: uuid('lot_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    status: memberStatusEnum('status').notNull().default('INVITED'),
    inviteeName: varchar('invitee_name', { length: 100 }), // C3
    inviteePhoneHash: bytea('invitee_phone_hash'), // C3 blind index
    inviteeEmailHash: bytea('invitee_email_hash'), // C3 blind index
    inviteTokenHash: bytea('invite_token_hash'), // C4
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('operator_members_operator_user_key')
      .on(t.operatorId, t.userId)
      .where(sql`${t.userId} is not null and ${t.status} <> 'REMOVED'`),
    uniqueIndex('operator_members_invite_token_key')
      .on(t.inviteTokenHash)
      .where(sql`${t.inviteTokenHash} is not null`),
    index('operator_members_operator_idx').on(t.operatorId, t.status),
    index('operator_members_user_idx').on(t.userId),
    index('operator_members_invited_by_idx').on(t.invitedBy),
    apiAccess('operator_members'),
  ],
).enableRLS();

/** KYB evidence (C4). The file itself is a `files` row in the private `kyb-docs` bucket. */
export const operatorKybDocuments = pgTable(
  'operator_kyb_documents',
  {
    id: id(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'cascade' }),
    type: kybDocTypeEnum('type').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    status: reviewStatusEnum('status').notNull().default('SUBMITTED'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('operator_kyb_documents_operator_idx').on(t.operatorId),
    uniqueIndex('operator_kyb_documents_file_key').on(t.fileId),
    index('operator_kyb_documents_reviewed_by_idx').on(t.reviewedBy),
    apiAccess('operator_kyb_documents'),
  ],
).enableRLS();

/**
 * Settlement account (doc 06 §3.5: bank details live at the provider). We keep
 * the masked number and resolved name. The full number is held encrypted only
 * until the subaccount is created on KYB approval, then cleared.
 */
export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: id(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operators.id, { onDelete: 'cascade' }),
    provider: payoutProviderEnum('provider').notNull().default('PAYSTACK'),
    bankCode: varchar('bank_code', { length: 10 }).notNull(),
    bankName: varchar('bank_name', { length: 100 }).notNull(),
    accountNumberLast4: varchar('account_number_last4', { length: 4 }).notNull(), // C4 (masked)
    accountName: varchar('account_name', { length: 200 }).notNull(), // C4
    pendingAccountNumberEnc: text('pending_account_number_enc'), // C4 [enc], cleared after subaccount creation
    /** Resolved name differs from the operator's legal name: ops must look before approving. */
    nameMismatch: boolean('name_mismatch').notNull().default(false),
    providerSubaccountCode: varchar('provider_subaccount_code', { length: 64 }), // C4
    status: payoutStatusEnum('status').notNull().default('PENDING'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payout_accounts_operator_key').on(t.operatorId),
    check(
      'payout_accounts_active_has_subaccount',
      sql`${t.status} <> 'ACTIVE' or ${t.providerSubaccountCode} is not null`,
    ),
    apiAccess('payout_accounts'),
  ],
).enableRLS();
