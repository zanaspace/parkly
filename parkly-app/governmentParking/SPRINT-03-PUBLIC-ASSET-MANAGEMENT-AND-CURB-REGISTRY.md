# Sprint GOV-03: Public Asset Inventory, Geofencing & Parastatals

## Municipal Curb Demarcation, Parastatal Asset Hierarchy, GIS Polygon Geofencing & Zonal Tariffs

**Sprint ID:** `GOV-03`  
**Parent Program:** Parkly GovTech (`parkly-app/governmentParking/`)  
**Status:** Ready to Implement  
**Dependencies:** SPRINT GOV-01, SPRINT GOV-02, S2 (Lots & Rate Plans)

---

## 1. Objectives & Scope

Sprint GOV-03 equips State Governments with the tools to register and manage two major categories of public parking assets:

1. **Municipal On-Street Curbs:** Controlled by State Parking Authorities (e.g. LASPA, KASTLEA) across commercial and residential corridors.
2. **Institutional Parastatal Facilities:** State General Hospitals, State Secretariats, High Court Complexes, Stadiums, and State Universities.

### Core Deliverables

1. **Public Asset Registry & MDA Hierarchy:**
   - Link lots directly to a State (`state_id`) and an MDA (`mda_id`).
   - Categorize assets into:
     - `ON_STREET_CURB` (Metered curb corridor with demarcated bay numbers, e.g. Bays 001–045).
     - `GENERAL_HOSPITAL` (Outpatient, emergency, and visitor bays).
     - `STATE_SECRETARIAT` (Civil service and external visitor bays).
     - `JUDICIAL_COMPLEX` (Judicial, legal counsel, and public bays).
     - `TRANSIT_HUB_STADIUM` (Event and inter-state passenger transit bays).
2. **GIS Polygon Geofencing & Bay Demarcation:**
   - Visual polygon coordinate mapper allowing MDA managers to draw geofences around public streets or hospital compounds.
   - GPS boundary checking on citizen self-checkin to prevent remote fraudulent bookings (`SELF_CHECKIN_TOO_FAR`).
   - Individual bay numbering (`bay_code`: e.g. `BRD-014` on Broad Street).
3. **Zonal Tariff Engine & Courtesy Windows:**
   - **Emergency Courtesy Window:** Automatic free first 15–30 minutes for General Hospitals and Court Registries.
   - **Civil Servant Discount Rules:** Subsidized or zero-rate validation for government employees with verified staff IDs.
   - **Tiered Zonal Rates:**
     - _Tier A (Prime CBD Corridors):_ Peak progressive hourly rates to ensure curb turnover.
     - _Tier B (Institutional Parastatals):_ Standard flat daily/hourly rates.
     - _Tier C (Public Transit Hubs):_ Commuter park-and-ride rates.
4. **Public Asset Management Console (`https://<stateSlug>.parkly.ng/assets`):**
   - MDA-scoped asset management console allowing facility managers to view bays, toggle emergency blackouts, and update operational hours.

---

## 2. Detailed Technical Specifications

### 2.1 Database Schema Additions (`packages/db/src/schema/government_assets.ts`)

```typescript
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';
import { governmentStates, stateMdas } from './government';
import { lots } from './lots';

export const statePublicAssets = pgTable('state_public_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: text('state_id')
    .notNull()
    .references(() => governmentStates.id, { onDelete: 'cascade' }),
  mdaId: text('mda_id')
    .notNull()
    .references(() => stateMdas.id, { onDelete: 'cascade' }),
  lotId: text('lot_id')
    .notNull()
    .references(() => lots.id, { onDelete: 'cascade' }),
  assetCategory: text('asset_category').notNull(), // "ON_STREET_CURB", "GENERAL_HOSPITAL", "STATE_SECRETARIAT", "JUDICIAL_COMPLEX", "TRANSIT_HUB"
  lga: text('lga').notNull(), // Local Government Area
  corridorName: text('corridor_name'), // e.g. "Broad Street Central", "Ahmadu Bello Way"
  totalBays: integer('total_bays').notNull(),
  freeCourtesyMinutes: integer('free_courtesy_minutes').notNull().default(0), // 30 mins for hospitals
  isCivilServantExempt: boolean('is_civil_servant_exempt').notNull().default(false),
  polygonCoordinates: jsonb('polygon_coordinates').notNull(), // Array of [lat, lng] points
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const curbBays = pgTable('curb_bays', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => statePublicAssets.id, { onDelete: 'cascade' }),
  bayCode: text('bay_code').notNull(), // e.g. "BRD-001"
  status: text('status').notNull().default('AVAILABLE'), // "AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"
  sensorId: text('sensor_id'), // Optional IoT sensor identifier
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 Geofence Boundary Check Algorithm

```typescript
export function isPointInsidePolygon(
  point: [number, number],
  polygon: [number, number][],
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
```

---

## 3. Tasks Breakdown

- [ ] **Task 1: Asset Schema & Migrations**
  - Create `state_public_assets` and `curb_bays` tables in `packages/db`.
  - Add relations between state assets, MDAs, and core `lots`.
- [ ] **Task 2: Asset Management Frontend (`/assets` and `/curbs`)**
  - Implement `/assets` screen listing all registered state facilities with filters by MDA and LGA.
  - Implement curb demarcation editor allowing batch creation of street bays (e.g. Bays 001–050).
- [ ] **Task 3: MapLibre Interactive Polygon Geofence Editor**
  - Embed vector map allowing government engineers to click and draw geofence boundaries around streets and compounds.
  - Save polygon GeoJSON to asset record.
- [ ] **Task 4: Courtesy Window & Tariff Extension**
  - Extend pricing calculation in `packages/domain/src/pricing/quote.ts` to respect `freeCourtesyMinutes` (first 15–30 minutes rate = ₦0 for hospitals/courts).
  - Add overstay fine progression for curb violations.
- [ ] **Task 5: Unit & Integration Tests**
  - Test polygon intersection logic with edge coordinates.
  - Test pricing quotes with courtesy drop-off windows.

---

## 4. Verification & Exit Criteria

1. Government facility manager can create an on-street curb asset with 50 numbered bays.
2. Geofence algorithm correctly validates whether driver GPS coordinate is inside or outside the curb corridor.
3. Hospital quote test confirms first 30 minutes are ₦0, and billed at standard tariff afterwards.
4. Monorepo CI checks pass cleanly.
