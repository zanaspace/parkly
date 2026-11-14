# Sprint GOV-06: Citizen Mobility Experience, Passes & Public Pilot

## Citizen State Landing Portal, Civil Servant Permits, Violation Clearance & 60-Day State Pilot Rollout

**Sprint ID:** `GOV-06`  
**Parent Program:** Parkly GovTech (`parkly-app/governmentParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT GOV-01 through SPRINT GOV-05, S9 (Monthly Passes), S10 (Pilot Launch Readiness)

---

## 1. Objectives & Scope

Sprint GOV-06 completes the citizen-facing and field-readiness components of Parkly GovTech:

1. **The Citizen State Portal (`https://<stateSlug>.parkly.ng/`):** A dedicated, state-branded web experience where motorists search municipal curb parking, pay for parking sessions, buy monthly public or resident passes, and resolve wheel-clamp violation fines.
2. **Civil Servant Subsidized Permits:** Digital staff permits for doctors, nurses, civil servants, and judicial officers linked to their staff ID and license plate.
3. **Instant Violation & Clamping Clearance:** Motorists with a clamped vehicle scan the violation QR code, settle the state fine via Remita or Card, and receive an instant SMS unlock token for the field marshal.
4. **State Pilot Launch Package:** Attendant field guides, public awareness signage, k6 stress testing at state scale, and pilot rollout runbooks.

### Core Deliverables

1. **Citizen State Landing Page (`https://<stateSlug>.parkly.ng/`):**
   - Official State Government banner, Governor's welcome message, and certified municipal parking seal.
   - Interactive search bar to find curb parking by LGA, street name, or public institution.
   - 1-tap quick access: "Pay Parking Fee", "Clear Violation Fine", "Buy Civil Servant / Resident Pass".
2. **Civil Servant Permit Engine:**
   - Institutional staff verification portal (`/permits/civil-servant`).
   - Staff ID matching and plate whitelisting for 100% or subsidized parking at State Secretariats, General Hospitals, and High Courts.
3. **Violation Payment & Unclamp Resolution Flow:**
   - Dedicated fine resolution page (`/violations/pay?ticketId=...`).
   - Instant payment reconciliation via Remita or Card.
   - Automated notification dispatch to the assigned field marshal's scanner: `VEHICLE UNCLAMPED - FINE SETTLED`.
4. **60-Day State Pilot Kit:**
   - 1-page laminated quick field guide for State Traffic Marshals.
   - Standardized entrance poster templates with dynamic Ed25519 QR codes.
   - Pilot Go/No-Go readiness audit script (`scripts/gov-pilot-readiness.ts`).

---

## 2. Detailed Technical Specifications

### 2.1 Civil Servant Permit Schema (`packages/db/src/schema/government_permits.ts`)

```typescript
import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { governmentStates, stateMdas } from './government';
import { statePublicAssets } from './government_assets';

export const civilServantPermits = pgTable('civil_servant_permits', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  mdaId: text('mda_id')
    .notNull()
    .references(() => stateMdas.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull(), // e.g. "LASG-MOH-10842"
  staffFullName: text('staff_full_name').notNull(),
  staffEmail: text('staff_email').notNull(),
  plateNumber: text('plate_number').notNull(),
  assignedAssetId: uuid('assigned_asset_id').references(() => statePublicAssets.id), // e.g. Secretariat Complex
  isSubsidized: boolean('is_subsidized').notNull().default(true),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('ACTIVE'), // "ACTIVE", "REVOKED", "EXPIRED"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 Instant Unclamp Webhook Notification

```typescript
export async function handleViolationSettled(violationId: string) {
  const violation = await store.getViolation(violationId);
  await store.updateViolationStatus(violationId, 'PAID');

  // Push instant alert to the clamping marshal's handheld device
  await pushService.sendToMarshal(violation.marshalId, {
    title: 'Vehicle Fine Settled',
    body: `Vehicle ${violation.plateNumber} has cleared its fine. Authorization granted to remove wheel clamp #${violation.clampId}.`,
    data: { violationId, clampId: violation.clampId, action: 'UNCLAMP' },
  });

  // Send citizen confirmation SMS with unlock token
  await smsService.send(violation.citizenPhone, {
    message: `Payment of ₦${(violation.fineAmountKobo / 100).toLocaleString()} received. Marshal notified to unlock vehicle ${violation.plateNumber}. Token: ${violation.clampId}.`,
  });
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Civil Servant Permit Schema & Migrations**
  - Add `civil_servant_permits` table to `packages/db`.
  - Connect with driver vehicle whitelisting logic.
- [ ] **Task 2: Citizen State Portal Homepage (`/`)**
  - Design and build responsive citizen portal displaying official state branding, street curb search, and quick payment actions.
- [ ] **Task 3: Violation Payment & Instant Unclamp Flow**
  - Implement `/violations/pay` page with Remita and Paystack payment widgets.
  - Implement webhook listener and push notification dispatch to field marshal.
- [ ] **Task 4: Civil Servant Permit Registration & Approval**
  - Build permit application page and MDA HR approval console.
- [ ] **Task 5: Pilot Rollout Documentation & Training Kit**
  - Create laminated field guide for marshals: `docs/operations/state-marshal-field-guide.md`.
  - Author pilot readiness audit script: `scripts/gov-pilot-readiness.ts`.
- [ ] **Task 6: Performance & Load Verification**
  - Run k6 load test simulating 50,000 daily citizen parking lookups and 5,000 concurrent marshal verifications.
  - Complete OWASP ASVS L2 government security audit checklist.

---

## 4. Verification & Exit Criteria

1. Motorist can visit `<stateSlug>.parkly.ng/`, search for a curb bay, and book parking.
2. Motorist with a clamped vehicle can enter ticket ID, pay fine, and trigger automated unclamp push alert to the field marshal.
3. Civil servant permit properly recognizes staff vehicle and grants free/subsidized entry.
4. Pilot readiness script reports all 7 launch gates PASSED.
5. All monorepo CI tests, builds, and linting pass with zero errors.
