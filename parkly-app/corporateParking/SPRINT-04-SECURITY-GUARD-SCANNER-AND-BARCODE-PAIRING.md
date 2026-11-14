# Sprint CORP-04: Security Guard Scanner & Barcode Pairing

## Low-Literacy Gate Guard PWA, Booth Barcode Self-Onboarding, Plate OCR Recognition & Nigerian Voice SFX

**Sprint ID:** `CORP-04`  
**Parent Program:** Parkly Corporate (`parkly-app/corporateParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT CORP-01, SPRINT CORP-02, SPRINT CORP-03, S5 (Attendant PWA)

---

## 1. Objectives & Scope

Sprint CORP-04 provides the gate security layer for corporate office parks and headquarters (e.g. Halogen, Proton, KingsGuard, or in-house security). Frontline guards often have limited formal education and cannot deal with complex logins, passwords, or small text.

### Core Deliverables

1. **Low-Literacy Guard Self-Onboarding via Booth Barcode Snapshot:**
   - Permanent laminated **Gate Guard Shift Barcode** (`CORP_SHIFT.<gateId>.<signedToken>`) mounted inside each guard booth or on the security supervisor's badge.
   - Guard taps one giant button on low-cost smartphone: **"Snap Guard Barcode"**, points camera at the marker.
   - The device checks GPS fence and device fingerprint, instantly pairing the guard to that gate for their shift. **Zero typing, zero passwords, zero email forms.**
2. **Dedicated Mobile Guard PWA (`https://<companySlug>.parkly.ng/guard`):**
   - High-contrast, mobile-first interface optimized for daylight glare and low-end Android smartphones.
   - **Automatic Plate OCR:** Guard points camera at front or rear bumper; system reads the plate without manual typing.
   - **Ed25519 QR Scanner:** Decodes staff and visitor digital passes in under 1.5 seconds.
3. **Zero-Text Audio & Visual Feedback:**
   - 🟢 **FULL GREEN SCREEN:** Authorized Employee / Pool Car / VIP Guest. Loud bell chime + localized voice prompt in **Nigerian Pidgin English** (_"Company staff! Open gate!"_), **Yoruba** (_"Oṣiṣẹ ile-iṣẹ ni! Ṣi ilẹkun!"_), **Hausa** (_"Ma'aikaci ne! Buɗe ƙofa!"_), or **Igbo** (_"Onye ọrụ ụlọ ọrụ! Meghee ọnụ ụzọ!"_).
   - 🟡 **FULL YELLOW SCREEN:** VIP Guest Arriving (_"Visitor for Executive Director"_).
   - 🔴 **FULL RED SCREEN:** Unauthorized / Blocked Vehicle. Warning buzzer + voice alert (_"No enter! Car not allowed!"_).
4. **VIP Visitor Pre-Clearance & Host SMS Alerts:**
   - Pre-booked visitors display their digital visitor QR pass.
   - Guard scan validates entry and sends an automated instant SMS/Slack/Teams alert to the host: _"Your guest [Name] in [Plate] has arrived at the gate."_

---

## 2. Detailed Technical Specifications

### 2.1 Security & Guard Schema (`packages/db/src/schema/corporate_security.ts`)

```typescript
import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { corporateAccounts } from './corporate';

export const corporateGateBooths = pgTable('corporate_gate_booths', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  gateName: text('gate_name').notNull(), // e.g. "Main Entrance Gate A", "Basement Ramp"
  tokenCode: text('token_code').notNull().unique(), // Ed25519 payload for printable QR
  gpsLatitude: text('gps_latitude').notNull(),
  gpsLongitude: text('gps_longitude').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const corporateGuardShifts = pgTable('corporate_guard_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  gateBoothId: uuid('gate_booth_id')
    .notNull()
    .references(() => corporateGateBooths.id),
  deviceFingerprint: text('device_fingerprint').notNull(),
  guardName: text('guard_name'),
  securityAgency: text('security_agency'), // e.g. "Halogen Security"
  preferredLanguage: text('preferred_language').notNull().default('PIDGIN'), // "PIDGIN" | "YORUBA" | "HAUSA" | "IGBO" | "ENGLISH"
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const corporateVisitorPasses = pgTable('corporate_visitor_passes', {
  id: uuid('id').primaryKey().defaultRandom(),
  corporateId: text('corporate_id')
    .notNull()
    .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
  hostEmployeeId: uuid('host_employee_id'),
  visitorName: text('visitor_name').notNull(),
  visitorPhone: text('visitor_phone').notNull(),
  plateNumber: text('plate_number').notNull(),
  visitDate: text('visit_date').notNull(), // YYYY-MM-DD
  isVip: boolean('is_vip').notNull().default(false),
  status: text('status').notNull().default('INVITED'), // "INVITED", "CHECKED_IN", "COMPLETED", "CANCELLED"
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Security Schema & Migrations**
  - Add tables `corporate_gate_booths`, `corporate_guard_shifts`, `corporate_visitor_passes` to `packages/db`.
  - Produce migration with `pnpm db:generate`.
- [ ] **Task 2: Guard Booth QR Generator (`/security`)**
  - Implement security management screen allowing facility chiefs to add gates and print laminated shift pairing posters with cryptographic tokens.
- [ ] **Task 3: Mobile Guard PWA (`/guard`)**
  - Build responsive mobile interface with giant camera scanner and zero-typing plate OCR.
  - Implement 1-tap "Snap Guard Barcode" self-onboarding.
- [ ] **Task 4: Multi-Lingual Audio Feedback Engine**
  - Embed local audio assets (chime, buzzer, and voice prompts in Pidgin, Yoruba, Hausa, Igbo, English).
  - Trigger audio on successful plate or QR recognition.
- [ ] **Task 5: Visitor Arrival Alert Webhook**
  - Send SMS/email alert to host employee upon visitor check-in at the gate.
- [ ] **Task 6: Unit & Field Simulation Tests**
  - Verify shift barcode pairing and device fingerprint lock.
  - Verify plate OCR recognition accuracy and voice prompt playback.

---

## 4. Verification & Exit Criteria

1. Guard can scan the physical booth barcode and activate an active shift in under 2 seconds without typing.
2. Guard points camera at employee plate; screen turns solid Green and plays _"Company staff! Open gate!"_.
3. Scanning an unknown plate turns screen solid Red and plays warning buzzer.
4. Monorepo CI checks pass cleanly.
