# Sprint CORP-03: Fleet Logistics & Pool Car Dispatch

## Multi-Vehicle Fleet Registry, Dynamic Chauffeur Assignment, Overnight Staging & Commercial Compliance

**Sprint ID:** `CORP-03`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT CORP-01, SPRINT CORP-02, S2 (Lots & Operators)

---

## 1. Objectives & Scope

Sprint CORP-03 provides B2B fleet logistics management for logistics couriers (e.g. DHL, GIGL), executive chauffeur pools (e.g. banks, oil & gas), and delivery dispatch fleets. Fleets require dynamic multi-driver assignments, secure overnight vehicle staging, and automated regulatory compliance verification.

### Core Deliverables

1. **Commercial Fleet Registry (`https://<companySlug>.parkly.ng/fleet`):**
   - Registry for commercial vehicles categorized by type:
     - `EXECUTIVE_SEDAN` (Corporate pool cars & VIP chauffeurs).
     - `DELIVERY_VAN` (Logistics vans, parcel couriers).
     - `DISPATCH_MOTORCYCLE` (Last-mile courier bikes).
     - `STAFF_SHUTTLE_BUS` (Employee commuter buses).
2. **Dynamic Driver-to-Vehicle Dispatch Engine:**
   - Multi-driver binding: Allows multiple drivers to share one fleet vehicle or one driver to operate multiple pool cars.
   - Temporary check-out: Driver selects vehicle plate on the mobile app before starting shift.
3. **Overnight Staging & Depot Parking:**
   - Reserved staging bays in high-security commercial lots.
   - Overnight parking window (7:00 PM – 7:00 AM) with automated barrier authorization and security guard shift handover logs.
4. **Commercial Regulatory Compliance Tracker:**
   - Tracks vehicle statutory documents:
     - Commercial Roadworthiness Certificate.
     - Hackney Carriage License / Permit.
     - State Transport Authority Permit (e.g. LASPA Commercial Transit Permit).
   - Automated expiration warnings 30 days and 7 days prior to expiry.

---

## 2. Detailed Technical Specifications

### 2.1 Fleet Schema (`packages/db/src/schema/corporate_fleet.ts`)

```typescript
import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { corporateAccounts, corporateCostCenters } from './corporate';

export const corporateFleetVehicles = pgTable('corporate_fleet_vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  costCenterId: uuid('cost_center_id').references(() => corporateCostCenters.id),
  plateNumber: text('plate_number').notNull(),
  vehicleType: text('vehicle_type').notNull(), // "EXECUTIVE_SEDAN", "DELIVERY_VAN", "DISPATCH_MOTORCYCLE", "STAFF_SHUTTLE"
  makeModel: text('make_model').notNull(), // e.g. "Toyota HiAce 2022"
  color: text('color').notNull(),
  chassisVin: text('chassis_vin'),
  commercialPermitNumber: text('commercial_permit_number'),
  permitExpiryDate: timestamp('permit_expiry_date', { withTimezone: true }),
  isOvernightAllowed: boolean('is_overnight_allowed').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateFleetDrivers = pgTable('corporate_fleet_drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Links to auth users
  fullName: text('full_name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  driverLicenseNumber: text('driver_license_number').notNull(),
  licenseExpiryDate: timestamp('license_expiry_date', { withTimezone: true }),
  currentAssignedVehicleId: uuid('current_assigned_vehicle_id').references(
    () => corporateFleetVehicles.id,
  ),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fleetVehicleDispatchLogs = pgTable('fleet_vehicle_dispatch_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => corporateFleetVehicles.id),
  driverId: uuid('driver_id')
    .notNull()
    .references(() => corporateFleetDrivers.id),
  checkedOutAt: timestamp('checked_out_at', { withTimezone: true }).notNull().defaultNow(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  odometerReadingKm: text('odometer_reading_km'),
});
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Fleet Schema & Migrations**
  - Add tables `corporate_fleet_vehicles`, `corporate_fleet_drivers`, `fleet_vehicle_dispatch_logs` to `packages/db`.
  - Produce migration with `pnpm db:generate`.
- [ ] **Task 2: Fleet Management UI (`/fleet`)**
  - Implement fleet table displaying active vehicles, assigned drivers, and compliance status indicators.
  - Add vehicle modal for adding new fleet assets and uploading permit documents.
- [ ] **Task 3: Dynamic Pool Car Checkout in Driver Mobile App**
  - Add "Fleet Mode" toggle in driver mobile app allowing drivers to select a pool car from the company's active fleet.
  - Automatically swap the driver's active parking plate upon checkout.
- [ ] **Task 4: Regulatory Expiration Alert Engine**
  - Add background job checking for expiring commercial permits and emailing fleet directors.
- [ ] **Task 5: Unit & Integration Tests**
  - Test multi-driver dispatch and check-in/check-out lifecycle.
  - Test permit expiration warning notifications.

---

## 4. Verification & Exit Criteria

1. Fleet manager can register 10 delivery vans and assign drivers.
2. Driver can check out a pool car on mobile; gate scanner recognizes the vehicle as corporate-authorized.
3. Overnight staging rules properly restrict non-overnight vehicles from unauthorized overnight parking.
4. Monorepo CI checks pass cleanly.
