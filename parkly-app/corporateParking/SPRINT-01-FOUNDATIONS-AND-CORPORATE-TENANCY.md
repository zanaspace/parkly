# Sprint CORP-01: Foundations & Corporate Tenancy

## Multi-Tenant Corporate Subdomain Routing, Database Schemas & Dynamic Company Branding Engine

**Sprint ID:** `CORP-01`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** S0 (Monorepo Foundations), S1 (Identity & RBAC)

---

## 1. Objectives & Scope

Sprint CORP-01 creates the foundational multi-tenant corporate layer that allows enterprise organizations to be onboarded with their dedicated corporate URLs (e.g. `https://zenith.parkly.ng`, `https://kpmg.parkly.ng`, `https://dangote.parkly.ng`).

### Core Deliverables

1. **Drizzle ORM Corporate Schemas (`packages/db`):**
   - `corporate_accounts`: Enterprise company record (RC/CAC number, legal entity name, corporate industry, contact phone, contact email, active status).
   - `corporate_domains`: Dedicated subdomains and verified email domains (e.g. `zenith.parkly.ng` and email domain `zenithbank.com`).
   - `corporate_branding`: Corporate logo URL, brand primary/secondary colors, custom welcome title, portal banner.
   - `corporate_cost_centers`: Departmental budget codes (e.g. "CC-101: Investment Banking", "CC-204: Commercial Logistics").
   - `corporate_members`: Employee membership and roles (`CORP_ADMIN`, `HR_MANAGER`, `FLEET_DISPATCHER`, `SECURITY_GUARD`, `EMPLOYEE`).
2. **Next.js Edge Middleware Multi-Tenant Router:**
   - Detects incoming Host header: `<companySlug>.parkly.ng` or custom enterprise CNAME domain (e.g. `parking.zenithbank.com`).
   - Rewrites requests to internal route group `/corporate/[companySlug]/*`.
   - Fallback and 404 handler for unregistered corporate subdomains.
3. **Dynamic Corporate Branding Component Kit (`@parkly/corporate-theme`):**
   - Injects verified corporate logo, company primary color palette, and corporate welcome message dynamically.
4. **Corporate Tenant API Endpoints:**
   - `GET /api/corp/:slug` - Public corporate tenant metadata (logo, name, brand colors, authorized email domains).
   - `GET /api/corp/:slug/resolve` - Edge middleware verification lookup.

---

## 2. Detailed Technical Specifications

### 2.1 Database Schema (`packages/db/src/schema/corporate.ts`)

```typescript
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

export const corporateAccounts = pgTable('corporate_accounts', {
  id: text('id').primaryKey(), // e.g. "corp_zenith"
  slug: text('slug').notNull().unique(), // e.g. "zenith"
  legalName: text('legal_name').notNull(), // e.g. "Zenith Bank PLC"
  cacRcNumber: text('cac_rc_number').notNull(),
  industry: text('industry').notNull(), // "BANKING", "CONSULTING", "LOGISTICS", "ENERGY", "TECH"
  headOfficeAddress: text('head_office_address').notNull(),
  primaryContactName: text('primary_contact_name').notNull(),
  primaryContactEmail: text('primary_contact_email').notNull(),
  primaryContactPhone: text('primary_contact_phone').notNull(),
  billingTier: text('billing_tier').notNull().default('STANDARD'), // "STANDARD", "ENTERPRISE", "FLEET_PRO"
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateDomains = pgTable('corporate_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  subdomain: text('subdomain').notNull().unique(), // e.g. "zenith"
  customDomain: text('custom_domain').unique(), // e.g. "parking.zenithbank.com"
  emailDomain: text('email_domain').notNull(), // e.g. "zenithbank.com"
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateBranding = pgTable('corporate_branding', {
  corporateId: text('corporate_id')
    .primaryKey()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  logoUrl: text('logo_url').notNull(),
  primaryColor: text('primary_color').notNull().default('#E31837'), // Company primary
  secondaryColor: text('secondary_color').notNull().default('#1E1E1E'),
  portalTitle: text('portal_title').notNull(),
  welcomeMessage: text('welcome_message'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateCostCenters = pgTable('corporate_cost_centers', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  code: text('code').notNull(), // e.g. "CC-FIN-01"
  name: text('name').notNull(), // e.g. "Finance & Accounts"
  monthlyBudgetKobo: integer('monthly_budget_kobo'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateMembers = pgTable('corporate_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Links to auth users
  role: text('role').notNull().default('EMPLOYEE'), // "CORP_ADMIN", "HR_MANAGER", "FLEET_DISPATCHER", "SECURITY_GUARD", "EMPLOYEE"
  costCenterId: uuid('cost_center_id').references(() => corporateCostCenters.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Corporate Schema Definitions & Migrations**
  - Add tables `corporate_accounts`, `corporate_domains`, `corporate_branding`, `corporate_cost_centers`, `corporate_members` to `packages/db`.
  - Export types and Drizzle relations in `packages/db/src/index.ts`.
  - Run `pnpm db:generate`.
- [ ] **Task 2: Corporate Tenant Resolution Service**
  - Implement `CorporateTenantService` in `apps/api` with memory/Redis cache for sub-millisecond lookups.
  - Implement public endpoint `GET /api/corp/:slug`.
- [ ] **Task 3: Edge Middleware Dynamic Subdomain Router**
  - Add corporate subdomain rewrite logic in Next.js middleware routing `<companySlug>.parkly.ng` to `/corporate/[companySlug]/*`.
- [ ] **Task 4: Dynamic Corporate Brand Component Kit**
  - Create `@parkly/corporate-theme` provider injecting CSS variables and company logo.
- [ ] **Task 5: Unit & Integration Tests**
  - Vitest tests verifying corporate slug resolution, domain matching, and edge rewrite behavior.

---

## 4. Verification & Exit Criteria

1. `pnpm db:generate` creates migration with zero drift.
2. Simulated HTTP request with `Host: zenith.parkly.ng` properly rewrites to Zenith Bank corporate context.
3. Unprovisioned corporate subdomains route to Corporate Registration portal.
4. Monorepo CI checks pass cleanly.
