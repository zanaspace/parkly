import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, createdAt, id, updatedAt } from './common.js';
import { users } from './identity.js';

export const corporateMemberRoleEnum = pgEnum('corporate_member_role', [
  'CORP_ADMIN',
  'HR_MANAGER',
  'FLEET_DISPATCHER',
  'SECURITY_GUARD',
  'EMPLOYEE',
]);

/**
 * Enterprise B2B corporate organization record (doc 00, Sprint CORP-01).
 */
export const corporateAccounts = pgTable(
  'corporate_accounts',
  {
    id: id(),
    slug: varchar('slug', { length: 64 }).notNull(),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    cacRcNumber: varchar('cac_rc_number', { length: 50 }).notNull(),
    industry: varchar('industry', { length: 80 }).notNull(),
    headOfficeAddress: text('head_office_address').notNull(),
    primaryContactName: varchar('primary_contact_name', { length: 120 }).notNull(),
    primaryContactEmail: varchar('primary_contact_email', { length: 254 }).notNull(),
    primaryContactPhone: varchar('primary_contact_phone', { length: 30 }).notNull(),
    billingTier: varchar('billing_tier', { length: 50 }).notNull().default('STANDARD'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('corporate_accounts_slug_key').on(t.slug),
    index('corporate_accounts_is_active_idx').on(t.isActive),
    apiAccess('corporate_accounts'),
  ],
).enableRLS();

/**
 * Dedicated corporate subdomains (e.g. zenith.parkly.ng) and email domain bindings (e.g. zenithbank.com).
 */
export const corporateDomains = pgTable(
  'corporate_domains',
  {
    id: id(),
    corporateId: uuid('corporate_id')
      .notNull()
      .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
    subdomain: varchar('subdomain', { length: 64 }).notNull(),
    customDomain: varchar('custom_domain', { length: 254 }),
    emailDomain: varchar('email_domain', { length: 254 }).notNull(),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('corporate_domains_subdomain_key').on(t.subdomain),
    uniqueIndex('corporate_domains_custom_domain_key')
      .on(t.customDomain)
      .where(sql`${t.customDomain} is not null`),
    index('corporate_domains_email_domain_idx').on(t.emailDomain),
    index('corporate_domains_corporate_id_idx').on(t.corporateId),
    apiAccess('corporate_domains'),
  ],
).enableRLS();

/**
 * Custom corporate branding, logo, and theme colors.
 */
export const corporateBranding = pgTable(
  'corporate_branding',
  {
    corporateId: uuid('corporate_id')
      .primaryKey()
      .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
    logoUrl: text('logo_url').notNull(),
    primaryColor: varchar('primary_color', { length: 20 }).notNull().default('#E31837'),
    secondaryColor: varchar('secondary_color', { length: 20 }).notNull().default('#1E1E1E'),
    portalTitle: varchar('portal_title', { length: 150 }).notNull(),
    welcomeMessage: text('welcome_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [apiAccess('corporate_branding')],
).enableRLS();

/**
 * Departmental cost centers for B2B itemized billing (e.g. Finance, Sales, Fleet).
 */
export const corporateCostCenters = pgTable(
  'corporate_cost_centers',
  {
    id: id(),
    corporateId: uuid('corporate_id')
      .notNull()
      .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    monthlyBudgetKobo: integer('monthly_budget_kobo'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('corporate_cost_centers_corp_code_key').on(t.corporateId, t.code),
    index('corporate_cost_centers_corp_id_idx').on(t.corporateId),
    apiAccess('corporate_cost_centers'),
  ],
).enableRLS();

/**
 * Links a standard Parkly user (users table) to an employer corporate account.
 */
export const corporateMembers = pgTable(
  'corporate_members',
  {
    id: id(),
    corporateId: uuid('corporate_id')
      .notNull()
      .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: corporateMemberRoleEnum('role').notNull().default('EMPLOYEE'),
    costCenterId: uuid('cost_center_id').references(() => corporateCostCenters.id, {
      onDelete: 'set null',
    }),
    workEmail: varchar('work_email', { length: 254 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('corporate_members_corp_user_key').on(t.corporateId, t.userId),
    index('corporate_members_user_id_idx').on(t.userId),
    index('corporate_members_corp_id_idx').on(t.corporateId),
    apiAccess('corporate_members'),
  ],
).enableRLS();
