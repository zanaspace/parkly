import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { apiAccess, bytea, createdAt, id, updatedAt } from './common.js';
// Circular with operators.ts (operators.created_by → users); safe because references are lazy.
import { operators } from './operators.js';

// Doc 00 §3.7. Never reorder; add new values at the end.
export const roleEnum = pgEnum('role', [
  'DRIVER',
  'OPERATOR_OWNER',
  'OPERATOR_MANAGER',
  'OPERATOR_ATTENDANT',
  'ADMIN_SUPPORT',
  'ADMIN_OPS',
  'ADMIN_FINANCE',
  'ADMIN_COMPLIANCE',
  'SUPER_ADMIN',
]);

export const userStatusEnum = pgEnum('user_status', [
  'ACTIVE',
  'LOCKED',
  'SUSPENDED',
  'PENDING_DELETION',
  'DELETED',
]);

/**
 * Profile, 1:1 with auth.users while the account is open (doc 02 §2.2). Phone/email stay in
 * auth.users (C3). There is no foreign key to auth.users on purpose: when an account is erased
 * (doc 06 §6.1) the Auth user is deleted and this row stays as an anonymised stand-in, so the
 * bookings and payments that point at it (kept for the statutory period) remain valid.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    phoneHash: bytea('phone_hash'), // C3: HMAC of E.164 phone
    phoneLast4: text('phone_last4'), // C3
    emailHash: bytea('email_hash'), // C3
    // Copies of the Supabase Auth contact, for notifications (doc 06 §2). Set at bootstrap.
    phoneEnc: text('phone_enc'), // C3 [enc]
    emailEnc: text('email_enc'), // C3 [enc]
    firstName: varchar('first_name', { length: 50 }), // C3
    lastName: varchar('last_name', { length: 50 }), // C3
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    locale: text('locale').notNull().default('en-NG'),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false), // C3
    /** FR-AUTH-009 / FR-PASS-005: Tier 2 Nigerian driver identity verification status. */
    isVerifiedDriver: boolean('is_verified_driver').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_phone_hash_key')
      .on(t.phoneHash)
      .where(sql`${t.phoneHash} is not null`),
    uniqueIndex('users_email_hash_key')
      .on(t.emailHash)
      .where(sql`${t.emailHash} is not null`),
    index('users_status_idx').on(t.status),
    apiAccess('users'),
  ],
).enableRLS();

/**
 * Source for JWT role claims. operator_id scopes operator roles to one operator.
 * NULLS NOT DISTINCT so a user holds a platform role at most once.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    operatorId: uuid('operator_id').references(() => operators.id, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('user_roles_user_role_operator_key')
      .on(t.userId, t.role, t.operatorId)
      .nullsNotDistinct(),
    index('user_roles_operator_idx').on(t.operatorId),
    apiAccess('user_roles'),
  ],
).enableRLS();

export const driverVerificationMethodEnum = pgEnum('driver_verification_method', [
  'FRSC_LICENSE',
  'NIN_PHONE',
]);

export const driverVerificationStatusEnum = pgEnum('driver_verification_status', [
  'VERIFIED',
  'REJECTED',
  'FAILED',
]);

export const identityProviderEnum = pgEnum('identity_provider', ['DOJAH', 'FAKE']);

/**
 * Tier 2 KYC Driver Identity Verification records (FR-AUTH-009, doc 06 §2).
 * Raw document images are never stored; the normalised license/NIN is encrypted at rest (`id_number_enc` C4)
 * and HMAC-hashed (`id_number_hash` C3) for deduplication.
 */
export const driverVerifications = pgTable(
  'driver_verifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: driverVerificationMethodEnum('method').notNull(),
    status: driverVerificationStatusEnum('status').notNull(),
    provider: identityProviderEnum('provider').notNull(),
    providerReference: varchar('provider_reference', { length: 120 }).notNull(),
    idNumberEnc: text('id_number_enc').notNull(), // C4 [enc]
    idNumberHash: bytea('id_number_hash').notNull(), // C3: HMAC-SHA256
    maskedIdNumber: varchar('masked_id_number', { length: 32 }).notNull(), // C3
    verifiedName: varchar('verified_name', { length: 120 }), // C3
    dateOfBirthEnc: text('date_of_birth_enc'), // C3 [enc]
    rejectionReason: text('rejection_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('driver_verifications_user_idx').on(t.userId, t.createdAt.desc()),
    index('driver_verifications_hash_idx').on(t.idNumberHash),
    apiAccess('driver_verifications'),
  ],
).enableRLS();

