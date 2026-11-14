# Parkly GovTech: Government Parking & Sovereign Asset Management

## Master Delivery Program & Technical Specification

**Directory:** `parkly-app/governmentParking/`  
**Classification:** Core GovTech Engineering & Product Specification  
**Architecture:** Multi-Tenant Sovereign State URLs (`https://<stateSlug>.parkly.ng`)  
**Target:** 36 Nigerian State Governments, FCT, State Internal Revenue Services (SIRS), Ministries of Transport & Parking Authorities (LASPA, KASTLEA, EDSTMA, etc.)

---

## 1. Overview & Architectural Vision

Parkly GovTech is the government and public-sector extension of Parkly, built to manage municipal curb parking, parastatal facilities (General Hospitals, State Secretariats, High Courts, Universities, Stadiums), and traffic enforcement across all 36 States of Nigeria and the FCT.

Just as private parking operators have their dedicated portal (`apps/portal`), every State Government on Parkly operates through a **Dedicated Sovereign State URL**:

```
https://<stateSlug>.parkly.ng
```

For example:

- **Lagos State:** `https://lagos.parkly.ng`
- **Kano State:** `https://kano.parkly.ng`
- **Rivers State:** `https://rivers.parkly.ng`
- **Federal Capital Territory (Abuja):** `https://fct.parkly.ng`

### Why a Dedicated State URL?

1. **Constitutional Sovereignty & Citizen Trust:** Citizens interact with their State Government's official crest, transport colors, and verified authority, eliminating skepticism about third-party private operators.
2. **Permanent Direct Routing:** Government officials, SIRS revenue auditors, MDA facility managers, traffic marshals, and local citizens always navigate to a single, dedicated home for all public parking interactions.
3. **Treasury Single Account (TSA) Segregation:** Every state's financial ledger, Remita/Paystack split subaccount, and bank reconciliation streams are strictly isolated under sovereign multi-tenant boundaries.
4. **Inter-Agency Governance:** A unified command centre for the Governor and SIRS, with scoped sub-consoles for individual Ministries, Departments, and Agencies (MDAs).

---

## 2. Dedicated State Subdomain Routing Matrix

When a user visits `https://<stateSlug>.parkly.ng`, Parkly's Edge Middleware parses the subdomain and routes them to the state's scoped environment:

| Route Path   | Audience                          | Functionality                                                                                                                       |
| :----------- | :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `/`          | Citizens & Motorists              | State-branded parking discovery, curb bay search, active session timer, and overstay fine clearance.                                |
| `/onboard`   | Government Officials              | Institutional KYG (Know Your Government) onboarding, gazetted appointment uploads, and TSA subaccount setup.                        |
| `/executive` | Governor & Commissioners          | High-level macro command centre: real-time IGR ticker, city congestion index, LGA revenue distribution, and leakage abatement KPIs. |
| `/sirs`      | SIRS & Finance Officers           | TSA remittance ledger, Remita/Paystack split subaccount settlement, bank reconciliation runs, and revenue audits.                   |
| `/assets`    | MDA Facility Managers             | Management of public parking inventory: General Hospitals, High Courts, Secretariats, Stadiums, and On-street curb corridors.       |
| `/curbs`     | State Parking Authorities (LASPA) | Zonal tariff design, peak hour multipliers, 15–30 min courtesy windows, and geofence polygon mapping.                               |
| `/marshals`  | Enforcement Commanders            | Traffic marshal shift rostering, handheld scanner provisioning, GPS attendance fence, and body-cam/device linking.                  |
| `/enforce`   | Field Enforcement Marshals        | Fast mobile camera plate scanner, Ed25519 QR validation, digital violation notices, wheel-clamp dispatch, and tow requests.         |

---

## 3. Inclusive Field Ergonomics & Unified Experience

To succeed in real Nigerian municipal conditions, Parkly GovTech is designed with three core ergonomic breakthroughs:

### 3.1 Ultra-Simple Onboarding for Non-Tech Savvy Stakeholders

- Government coordinators and MDA officers do not navigate complex technical configurations.
- **3-Step Conversational Onboarding:**
  1. _What is your State & Agency?_ (Select state, upload appointment letter or Gazette).
  2. _Where is the street curb or facility?_ (Type street name or pin on map).
  3. _Where should money go?_ (Enter Bank & Account Number / Remita TSA Service Type ID).
- Parkly automatically provisions the dedicated `<stateSlug>.parkly.ng` subdomain, generates printable entrance posters, sets up payment routes, and demarcates bays.

### 3.2 Unified Driver Experience (Zero Friction Across Public & Private Spaces)

- Drivers never have to wonder whether they are parking in a private commercial garage or a municipal street curb.
- **Universal Flow:** Scan poster QR or enter plate number -> Select duration -> 1-Tap Pay -> Instant Digital Pass.
- **Zero App Download Requirement:** Guest checkouts work in standard mobile browsers.
- **Payment Ingestion Fitted for Nigeria:**
  - _Instant Dynamic Virtual Account:_ Citizen transfers to an auto-generated dedicated account via any bank app; verifies in under 3 seconds.
  - _USSD 1-Tap:_ Dial short code (`*737#`, `*894#`) without internet.
  - _Debit Card & Apple/Google Pay._

### 3.3 Zero-Literacy Marshal Self-Onboarding & Audio-Visual Field Scanner

Street marshals and curb attendants often have limited formal education and cannot manage complex logins or read tiny text:

1. **Zero-Typing Self-Onboarding via Designated Booth/Badge Barcode:**
   - Every supervisor badge or physical guard booth has a laminated **Marshal Pairing QR Barcode**.
   - The attendant opens the app, taps the giant **"Snap Shift Barcode"** button, and scans the physical marker.
   - The device is instantly verified via GPS and device fingerprint, binding the marshal to that specific lot for an active 8-to-12 hour shift. **Zero typing, zero passwords, zero email forms.**
2. **Audio-Visual, Zero-Text Verification Interface:**
   - **Giant Color Feedback:**
     - 🟢 **FULL GREEN SCREEN:** Session active and paid. Accompanied by loud bell chime and voice prompt in **Nigerian Pidgin English** (_"Dis motor don pay!"_), **Yoruba** (_"Motó yi ti sanwó"_), **Hausa** (_"Wannan mota ta biya"_), or **Igbo** (_"Ụgbọ ala a akwụọla"_).
     - 🟡 **FULL YELLOW SCREEN:** Expiring soon / 10-minute courtesy grace window (_"Time dey finish"_).
     - 🔴 **FULL RED SCREEN:** Unpaid / Evasion. Loud warning buzzer and voice prompt: _"Dis motor never pay! Clamp am!"_.
   - **Automatic Plate OCR:** Marshals do not type letters or numbers; they simply point their camera at the car's plate.
   - **One-Tap Clamp & Ticket:** If red, tapping the giant clamp icon snaps photo proof, logs GPS, and sends an instant SMS unlock ticket to the car owner.

---

## 4. The 6-Sprint Government Delivery Program

To build Parkly GovTech systematically and cleanly, development is divided into 6 distinct sprints. Each sprint contains full technical specifications, database schema migrations, API routes, frontend views, and verification tests:

| Sprint ID  | Document                                                                                                         | Title & Focus                                              | Deliverables                                                                                                                                                                                                                                         |
| :--------- | :--------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GOV-01** | [SPRINT-01-FOUNDATIONS-AND-STATE-TENANCY.md](SPRINT-01-FOUNDATIONS-AND-STATE-TENANCY.md)                         | **Multi-Tenant Subdomain Routing & Sovereign State Brand** | Schema for `government_states`, `state_mdas`, `state_subdomains`, `state_tsa_accounts`. Next.js edge wildcard subdomain middleware. Dynamic state branding engine (crest, colors, theme).                                                            |
| **GOV-02** | [SPRINT-02-STATE-ONBOARDING-AND-FINANCIAL-TSA.md](SPRINT-02-STATE-ONBOARDING-AND-FINANCIAL-TSA.md)               | **Institutional State Onboarding, KYG & TSA Split Engine** | State Onboarding Wizard (`/onboard`). KYG verification workflow. Remita RRR & Paystack TSA split subaccount integration. 3-way split ledger (State TSA + Parastatal Maintenance + Tech fee). AAL2 MFA provisioning for State Auditor-General.        |
| **GOV-03** | [SPRINT-03-PUBLIC-ASSET-MANAGEMENT-AND-CURB-REGISTRY.md](SPRINT-03-PUBLIC-ASSET-MANAGEMENT-AND-CURB-REGISTRY.md) | **Public Asset Inventory, Geofencing & Parastatals**       | Ingestion for on-street curbs, General Hospitals, Secretariats, High Courts, and Stadiums. GIS polygon geofencing & curb-bay demarcation. Zonal rate cards (CBD, Institutional, Mass Transit), courtesy windows, civil servant permits.              |
| **GOV-04** | [SPRINT-04-MARSHAL-ROSTERING-AND-FIELD-ENFORCEMENT.md](SPRINT-04-MARSHAL-ROSTERING-AND-FIELD-ENFORCEMENT.md)     | **Traffic Marshal Scanner, Rostering & Curb Enforcement**  | Marshal onboarding and device pairing. Dedicated Offline PWA (`/enforce`) with camera plate OCR and Ed25519 QR validation. Digital wheel-clamp ticketing, violation notices, and impound dispatch.                                                   |
| **GOV-05** | [SPRINT-05-STATE-EXECUTIVE-COMMAND-AND-SIRS-PORTAL.md](SPRINT-05-STATE-EXECUTIVE-COMMAND-AND-SIRS-PORTAL.md)     | **Executive Governor Command Centre & SIRS IGR Portal**    | Governor Command Centre (`/executive`) with live IGR revenue counter, congestion heatmap, and LGA breakdown. SIRS Console (`/sirs`): daily remittance ledger, bank statement reconciliation, watermarked audit export.                               |
| **GOV-06** | [SPRINT-06-CITIZEN-STATE-EXPERIENCE-AND-PUBLIC-PILOT.md](SPRINT-06-CITIZEN-STATE-EXPERIENCE-AND-PUBLIC-PILOT.md) | **Citizen Mobility Experience, Passes & Pilot Rollout**    | Citizen state portal on `<stateSlug>.parkly.ng`: zone search, bay booking, digital passes, and overstay fee clearance. Civil servant digital staff permits. 60-Day State Pilot deployment playbook, attendant field guide, and k6 load verification. |

---

## 4. Multi-Tenant Edge Routing Architecture

```
[ Incoming Request: https://lagos.parkly.ng/executive ]
                          │
                          ▼
             [ Next.js Edge Middleware ]
  Extract Host: "lagos.parkly.ng" -> stateSlug = "lagos"
  Query Cache / Edge Store -> Validate Active State Tenant
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   State Valid                       State Invalid
Rewrite to internal route:         Redirect to national
/government/[stateSlug]/executive  parkly.ng/state-not-found
         │
         ▼
[ Dynamic Layout: @parkly/gov-theme ]
- Injects Lagos State Crest
- Injects Official Brand Theme (#008751)
- Scopes API context to state_id = 'st_lagos'
```

---

## 5. Unified Data Model Hierarchy

```
government_states (e.g. Lagos State, id: 'st_lagos', slug: 'lagos')
  ├── state_subdomains ('lagos.parkly.ng', is_verified: true)
  ├── state_tsa_accounts (Remita RRR / Paystack Subaccount, bank_code, acct_no)
  ├── state_mdas (Ministries, Departments & Agencies)
  │     ├── Ministry of Transport (LASPA) -> Manages On-Street Curbs
  │     ├── Ministry of Health -> Manages State General Hospitals
  │     ├── Office of the Head of Service -> Manages State Secretariats
  │     └── Judicial Service Commission -> Manages High Courts
  │
  ├── lots (linked via mda_id and state_id)
  │     ├── On-Street Curb Zones (bays 1-50, geofenced polygon)
  │     └── Parastatal Lots (General Hospital Ikeja, 200 bays)
  │
  └── state_marshals (Enforcement Officers with assigned device IDs and geofenced beats)
```

---

## 6. How We Build It: Execution Order

We execute the sprints sequentially, starting from Sprint GOV-01:

1. **Step 1:** Run Sprint GOV-01 (Data schemas, Edge middleware, State branding).
2. **Step 2:** Run Sprint GOV-02 (State onboarding, KYG verification, TSA splits).
3. **Step 3:** Run Sprint GOV-03 (Asset registry, Parastatals, geofencing).
4. **Step 4:** Run Sprint GOV-04 (Marshal scanner, enforcement, ticketing).
5. **Step 5:** Run Sprint GOV-05 (Executive Governor command centre, SIRS ledger).
6. **Step 6:** Run Sprint GOV-06 (Citizen portal, civil servant passes, pilot go-live).

Each sprint follows the strict Parkly engineering standard:

- 100% TypeScript type-safety
- Zero migration drift (`pnpm db:generate`)
- Prettier and ESLint cleanliness (`pnpm format:check && pnpm lint`)
- Vitest automated test suites with high code coverage
- Next.js production builds passing cleanly
