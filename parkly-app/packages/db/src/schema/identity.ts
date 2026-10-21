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
import { authUsers } from 'drizzle-orm/supabase';
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

/** Profile, 1:1 with auth.users (doc 02 §2.2). Phone/email stay in auth.users (C3). */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'restrict' }),
    phoneHash: bytea('phone_hash'), // C3: HMAC of E.164 phone
    phoneLast4: text('phone_last4'), // C3
    emailHash: bytea('email_hash'), // C3
    firstName: varchar('first_name', { length: 50 }), // C3
    lastName: varchar('last_name', { length: 50 }), // C3
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    locale: text('locale').notNull().default('en-NG'),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false), // C3
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
