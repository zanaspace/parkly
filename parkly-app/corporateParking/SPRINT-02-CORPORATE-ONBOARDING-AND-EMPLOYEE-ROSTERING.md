# Sprint CORP-02: Corporate Onboarding, SSO & Employee Rostering

## Rapid 3-Step Company Onboarding, Work Email Domain Matching & Bulk Staff Pass Allocation

**Sprint ID:** `CORP-02`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT CORP-01, S1 (Identity & OTP), S9 (Monthly Passes)

---

## 1. Objectives & Scope

Sprint CORP-02 builds the effortless onboarding workflow for enterprise clients. Non-tech savvy HR and People Operations teams can register their organization, verify their corporate identity, and provision parking passes for hundreds of employees in minutes.

### Core Deliverables

1. **Ultra-Simple 3-Step Corporate Onboarding Wizard (`https://<companySlug>.parkly.ng/onboard`):**
   - _Step 1: Organization Details:_ Legal Company Name, CAC/RC Number, and Work Email Domain (e.g. `@kpmg.ng`).
   - _Step 2: Employee Roster Ingestion:_ Drag-and-drop Excel/CSV upload or Google Workspace / Microsoft 365 directory sync.
   - _Step 3: Billing & Pass Activation:_ Select billing method (Direct Debit, Corporate NUBAN Bank Transfer, Corporate Card) and assign pass quotas.
2. **Work Email Domain Auto-Verification Engine:**
   - Any employee logging into the Parkly mobile app or web with their corporate email (e.g. `ada@kpmg.ng`) receives an instant 6-digit magic OTP.
   - Upon verification, their employee pass is auto-provisioned without HR manual intervention.
3. **Bulk CSV Staff Roster Ingestion (`apps/api`):**
   - Parser accepting `.csv` and `.xlsx` files with columns: `fullName`, `workEmail`, `phoneNumber`, `plateNumber`, `department`.
   - Automatic phone number normalization (+234 standard) and Nigerian plate formatting (`LND-452-XY`).
   - Handles duplicates, updates existing vehicle plates, and flags errors gracefully.
4. **HR Staff Management Console (`https://<companySlug>.parkly.ng/portal`):**
   - Active employee roster table with instant search and status toggles (`ACTIVE`, `SUSPENDED`).
   - One-click employee pass deactivation upon staff exit.

---

## 2. Detailed Technical Specifications

### 2.1 Staff Roster Schema (`packages/db/src/schema/corporate_roster.ts`)

```typescript
import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { corporateAccounts, corporateCostCenters } from './corporate';

export const corporateStaffRoster = pgTable('corporate_staff_roster', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  costCenterId: uuid('cost_center_id').references(() => corporateCostCenters.id),
  fullName: text('full_name').notNull(),
  workEmail: text('work_email').notNull(),
  phoneNumber: text('phone_number').notNull(),
  plateNumber: text('plate_number'),
  department: text('department'),
  jobTitle: text('job_title'),
  isPassActive: boolean('is_pass_active').notNull().default(true),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 CSV Roster Ingestion Parser

```typescript
export interface RosterRowInput {
  fullName: string;
  workEmail: string;
  phoneNumber: string;
  plateNumber?: string;
  department?: string;
}

export function parseAndValidateRosterRow(row: RosterRowInput, authorizedDomain: string) {
  const normalizedEmail = row.workEmail.trim().toLowerCase();
  if (!normalizedEmail.endsWith(`@${authorizedDomain}`)) {
    throw new Error(
      `Email ${normalizedEmail} does not match corporate domain @${authorizedDomain}`,
    );
  }
  const normalizedPhone = normalizePhone(row.phoneNumber);
  const normalizedPlate = row.plateNumber ? normalizePlate(row.plateNumber) : undefined;

  return {
    fullName: row.fullName.trim(),
    workEmail: normalizedEmail,
    phoneNumber: normalizedPhone,
    plateNumber: normalizedPlate,
    department: row.department?.trim(),
  };
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Roster Schema & Database Migrations**
  - Add `corporate_staff_roster` table in `packages/db`.
  - Connect with driver vehicle whitelisting logic.
- [ ] **Task 2: 3-Step Corporate Onboarding Wizard UI**
  - Build responsive wizard at `apps/portal/app/corporate/[companySlug]/onboard/page.tsx`.
  - Add auto-lookup for CAC/RC number and interactive file uploader.
- [ ] **Task 3: Bulk CSV/Excel Roster Ingestion Service**
  - Implement streaming parser in `apps/api` (`CorporateRosterService`) supporting up to 5,000 employees per upload batch.
  - Return detailed summary: `{ total: 250, inserted: 242, updated: 8, errors: [] }`.
- [ ] **Task 4: Work Email Auto-Matching Middleware**
  - When driver logs into mobile app with corporate email domain, check `corporate_domains` and automatically bind the company's active monthly pass.
- [ ] **Task 5: HR Portal Roster View (`/portal`)**
  - Build responsive staff table with search by plate, name, or department.
  - Add 1-tap pass revoke and plate swap actions.
- [ ] **Task 6: Unit & Integration Tests**
  - Test bulk CSV ingestion with edge case Nigerian phone formats (`0803...`, `+234...`, `234...`).
  - Test domain matching logic.

---

## 4. Verification & Exit Criteria

1. HR user can complete `/onboard` and upload a 50-person staff roster in under 2 minutes.
2. Employee with matching corporate email logs into mobile app and sees active Corporate Pass with ₦0 fee.
3. HR can revoke an employee pass with instant gate de-authorization.
4. Monorepo CI checks pass cleanly.
