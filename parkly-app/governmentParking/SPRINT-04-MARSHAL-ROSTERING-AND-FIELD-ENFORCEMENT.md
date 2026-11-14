# Sprint GOV-04: Traffic Marshal Scanner, Rostering & Curb Enforcement

## Low-End Device PWA, Plate OCR Recognition, Cryptographic Validation, Wheel-Clamp Dispatch & Digital Violations

**Sprint ID:** `GOV-04`  
**Parent Program:** Parkly GovTech (`parkly-app/governmentParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT GOV-01, SPRINT GOV-03, S5 (Offline Attendant PWA)

---

## 1. Objectives & Scope

Sprint GOV-04 delivers the enforcement engine for State Traffic Authorities (e.g. LASPA, LASTMA, KASTLEA, EDSTMA, VIO). In street curbs and public parastatals, enforcement cannot rely on physical barriers or imported boom gates. Instead, certified field marshals patrol corridors using lightweight mobile scanners to verify vehicle compliance in real time.

### Core Deliverables

1. **Traffic Marshal Rostering & Device Binding (`https://<stateSlug>.parkly.ng/marshals`):**
   - Onboard traffic marshals with official service badges (Badge ID, Agency, Beat/Zone assignment).
   - Device pairing: Bind marshal session to authorized Android device fingerprint and GPS geofence.
2. **Dedicated Mobile Enforcement PWA (`https://<stateSlug>.parkly.ng/enforce`):**
   - Mobile-first, low-bandwidth, offline-capable scanner interface.
   - Dual verification methods:
     - **Plate OCR Scanner:** Fast camera recognition of Nigerian vehicle registration plates (e.g. `KJA-123AA`, `ABC-456XY`).
     - **Dynamic Ed25519 QR Scanner:** Decodes citizen digital gate passes and checks 24-hour cached local manifests.
3. **Instant Enforcement Status Signals:**
   - 🟢 **VALID (Active Session):** Vehicle has paid, displays time remaining and bay number.
   - 🟡 **OVERSTAY / COURTESY GRACE:** Within 10-minute grace window; displays accrued overstay fee.
   - 🔴 **VIOLATION (Unpaid / Evasion):** No booking recorded or overstay grace elapsed.
4. **Digital Violation & Clamping Workflow:**
   - One-tap digital ticket generation: Captures timestamp, GPS coordinates, marshal badge ID, and photo proof.
   - Wheel-clamp lock logging with unique Clamp ID.
   - Digital impound towing dispatch notification to State Towing Yard.
   - Automated citizen notification via SMS with payment link to unlock vehicle.

---

## 2. Detailed Technical Specifications

### 2.1 Database Schema Additions (`packages/db/src/schema/government_enforcement.ts`)

```typescript
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';
import { governmentStates, stateMdas } from './government';
import { statePublicAssets } from './government_assets';

export const stateMarshals = pgTable('state_marshals', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  mdaId: text('mda_id')
    .notNull()
    .references(() => stateMdas.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Links to auth users
  badgeNumber: text('badge_number').notNull(), // e.g. "LASPA-MR-042"
  fullName: text('full_name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  assignedAssetId: uuid('assigned_asset_id').references(() => statePublicAssets.id),
  isActive: boolean('is_active').notNull().default(true),
  deviceFingerprint: text('device_fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const curbViolations = pgTable('curb_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => statePublicAssets.id, { onDelete: 'cascade' }),
  marshalId: uuid('marshal_id')
    .notNull()
    .references(() => stateMarshals.id),
  plateNumber: text('plate_number').notNull(),
  violationType: text('violation_type').notNull(), // "NO_BOOKING", "OVERSTAY_EXCEEDED", "ILLEGAL_OBSTRUCTION", "UNAUTHORIZED_STAFF_BAY"
  fineAmountKobo: integer('fine_amount_kobo').notNull(),
  isClamped: boolean('is_clamped').notNull().default(false),
  clampId: text('clamp_id'),
  photoProofUrl: text('photo_proof_url'),
  gpsLatitude: text('gps_latitude').notNull(),
  gpsLongitude: text('gps_longitude').notNull(),
  status: text('status').notNull().default('ISSUED'), // "ISSUED", "PAID", "DISMISSED", "TOWED"
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentReference: text('payment_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 Offline Verification Engine

Field marshals use locally cached 24-hour manifest queues:

- The device syncs active bookings for its assigned street beat every 5 minutes when online.
- When offline, plate lookups query the local IndexedDB/SQLite database.
- Violations recorded offline are queued and batch-synced via `attendant_sync_batches` upon reconnecting.

---

## 3. Tasks Breakdown

- [ ] **Task 1: Enforcement Schema & Migrations**
  - Create `state_marshals` and `curb_violations` tables in `packages/db`.
  - Add migrations and relations.
- [ ] **Task 2: Marshal Rostering Console (`/marshals`)**
  - Implement `/marshals` screen for LASPA/KASTLEA commanders to create marshal profiles, assign beats, and view active patrol locations.
- [ ] **Task 3: Mobile Enforcement PWA (`/enforce`)**
  - Build responsive mobile interface optimized for low-end Android smartphones.
  - Implement plate search bar with instant status lookup.
  - Integrate camera feed for plate barcode/QR scanning.
- [ ] **Task 4: Digital Violation & Clamping Workflow**
  - Build ticket creation modal capturing photo proof, GPS location, violation category, and clamp serial number.
  - Generate instant citizen SMS dispatch with payment link to unlock.
- [ ] **Task 5: Unit & Field Simulation Tests**
  - Simulate offline plate verification against 1,000 active sessions.
  - Verify violation sync queue and idempotency key uniqueness.

---

## 4. Verification & Exit Criteria

1. Marshal can scan a plate number and receive green, amber, or red status in under 1.5 seconds.
2. Marshal can issue a digital clamp violation with photo and GPS upload.
3. Offline queue preserves violations during network disconnects and syncs upon reconnection.
4. Monorepo CI passes cleanly.
