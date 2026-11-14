# Sprint GOV-01: Foundations & Sovereign State Tenancy

## Multi-Tenant Subdomain Routing, Database Schemas & Dynamic State Branding Engine

**Sprint ID:** `GOV-01`  
**Parent Program:** Parkly GovTech (`parkly-app/governmentParking/`)  
**Status:** Ready to Implement  
**Dependencies:** S0 (Monorepo Foundations), S1 (Identity & RBAC)

---

## 1. Objectives & Scope

Sprint GOV-01 creates the foundational multi-tenant state layer that allows State Governments to be onboarded with their dedicated sovereign URLs (e.g. `https://lagos.parkly.ng`, `https://kano.parkly.ng`, `https://rivers.parkly.ng`, `https://fct.parkly.ng`).

### Core Deliverables

1. **Drizzle ORM State Schemas:**
   - `government_states`: Sovereign state records (code, name, capital, governor name, active status, contact email/phone).
   - `state_subdomains`: Subdomain binding (`slug`, `domain`, `is_verified`, `ssl_status`).
   - `state_branding`: State coat of arms/crest URL, primary/secondary colors, official font, slogan/motto.
   - `state_mdas`: Ministries, Departments, and Agencies belonging to the state.
   - `state_member_roles`: Role-based access control linking user IDs to state government roles (`GOVERNOR_OFFICE`, `SIRS_AUDITOR`, `TRANSPORT_COMMISSIONER`, `MDA_DIRECTOR`, `MARSHAL_COMMANDER`, `FIELD_MARSHAL`).
2. **Next.js Edge Middleware Dynamic Subdomain Router:**
   - Detects incoming Host header: `<stateSlug>.parkly.ng` or custom state domain (e.g. `parking.lagosstate.gov.ng`).
   - Resolves tenant context and rewrites requests to internal route group `/government/[stateSlug]/*`.
   - Fallback and 404 handler for unprovisioned state subdomains.
3. **Dynamic State Theming Engine (`@parkly/gov-theme`):**
   - Server-side theme injector rendering the verified State Crest, official state primary palette (e.g., Lagos Blue/Gold/Red/Green, Kano Green/Red), official disclaimers, and certified government footer.
4. **State Tenant API Endpoints:**
   - `GET /api/gov/state/:slug` - Public metadata for state domain initialization (name, crest, colors, active features).
   - `GET /api/gov/state/:slug/resolve` - Edge middleware verification lookup.

---

## 2. Detailed Technical Specifications

### 2.1 Database Schema (`packages/db/src/schema/government.ts`)

```typescript
import { pgTable, text, timestamp, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';

export const governmentStates = pgTable('government_states', {
  id: text('id').primaryKey(), // e.g. "st_lagos"
  slug: text('slug').notNull().unique(), // e.g. "lagos"
  name: text('name').notNull(), // e.g. "Lagos State Government"
  capital: text('capital').notNull(), // e.g. "Ikeja"
  geoZone: text('geo_zone').notNull(), // "SOUTH_WEST", "NORTH_CENTRAL", etc.
  officialEmail: text('official_email').notNull(),
  officialPhone: text('official_phone').notNull(),
  governorName: text('governor_name'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stateSubdomains = pgTable('state_subdomains', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  subdomain: text('subdomain').notNull().unique(), // e.g. "lagos"
  customDomain: text('custom_domain').unique(), // e.g. "parking.lagosstate.gov.ng"
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stateBranding = pgTable('state_branding', {
  stateId: text('state_id')
    .primaryKey()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  crestUrl: text('crest_url').notNull(),
  motto: text('motto'),
  primaryColor: text('primary_color').notNull().default('#008751'),
  secondaryColor: text('secondary_color').notNull().default('#005A36'),
  accentColor: text('accent_color').notNull().default('#FFD700'),
  portalTitle: text('portal_title').notNull(),
  welcomeMessage: text('welcome_message'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stateMdas = pgTable('state_mdas', {
  id: text('id').primaryKey(), // e.g. "mda_lagos_laspa"
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. "Lagos State Parking Authority (LASPA)"
  code: text('code').notNull(), // e.g. "LASPA"
  category: text('category').notNull(), // "TRANSPORT", "HEALTH", "JUDICIARY", "SECRETARIAT", "EDUCATION", "SPORTS"
  leadContactName: text('lead_contact_name'),
  leadContactEmail: text('lead_contact_email'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 Next.js Edge Multi-Tenant Routing Engine

```typescript
// apps/portal/middleware.ts or dedicated government edge router
export function governmentTenantMiddleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';

  // Extract state slug: e.g. "lagos.parkly.ng" -> "lagos"
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'parkly.ng';
  const stateMatch = hostname.match(new RegExp(`^([a-z0-9-]+)\\.${rootDomain}$`, 'i'));

  if (stateMatch) {
    const stateSlug = stateMatch[1].toLowerCase();
    if (!['www', 'admin', 'api', 'app'].includes(stateSlug)) {
      // Rewrite internal path to the state government handler
      return NextResponse.rewrite(
        new URL(`/government/${stateSlug}${url.pathname}${url.search}`, req.url),
      );
    }
  }
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Database Migration & Schema Definitions**
  - Add tables `government_states`, `state_subdomains`, `state_branding`, `state_mdas`, `state_member_roles` to `packages/db`.
  - Export types and relations in `packages/db/src/index.ts`.
  - Run `pnpm db:generate` to produce clean migration.
- [ ] **Task 2: State Tenant Resolution Service**
  - Implement caching repository in `apps/api` (`StateTenantService` with memory/Redis cache) for fast sub-millisecond subdomain lookups.
  - Implement public GET `/api/gov/state/:slug` endpoint returning sanitized public state branding and metadata.
- [ ] **Task 3: Edge Middleware Dynamic Subdomain Router**
  - Add tenant routing logic in Next.js middleware handling `*.parkly.ng` wildcard domains and custom government CNAME domains.
  - Test rewrite logic with unit tests (`subdomain-router.spec.ts`).
- [ ] **Task 4: State Theme & Brand Component Kit**
  - Create reusable theme provider component that loads CSS variables dynamically (`--gov-primary`, `--gov-secondary`, `--gov-accent`) based on resolved state tenant.
  - Render official State Crest, Government Verification Seal, and public disclaimers.
- [ ] **Task 5: Test Suite & Quality Gates**
  - Vitest unit tests verifying state slug validation, subdomain resolution, and branding injection.
  - Lint, format check, and typecheck passes.

---

## 4. Verification & Exit Criteria

1. `pnpm db:generate` creates migration without errors.
2. Visiting `https://lagos.parkly.ng/` or simulated `Host: lagos.parkly.ng` resolves to Lagos State tenant context.
3. Visiting unprovisioned state (e.g. `unknown.parkly.ng`) displays official State Onboarding Invitation page.
4. All unit and integration tests pass with zero TypeScript errors.
