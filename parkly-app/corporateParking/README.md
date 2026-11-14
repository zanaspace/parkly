# Parkly Corporate & Enterprise Fleet Parking

## Master Delivery Program & Technical Specification

**Directory:** `parkly-app/corporateParking/`  
**Classification:** Core B2B Engineering & Product Specification  
**Architecture:** Multi-Tenant Dedicated Corporate URLs (`https://<companySlug>.parkly.ng`)  
**Target:** Corporate Enterprises, Banks, Multinationals, Logistics Fleets, Commercial Towers, and Private Security Firms (Halogen, Proton, KingsGuard, etc.)

---

## 1. Overview & Architectural Vision

Parkly Corporate Edition is the enterprise B2B extension of Parkly, built to manage employee workplace parking, executive pool cars, commercial delivery fleets, and VIP visitor access across major Nigerian business districts (Victoria Island, Marina, Ikoyi, Ikeja GRA, Abuja CBD, Port Harcourt).

Just as State Governments receive dedicated sovereign portals (`https://<stateSlug>.parkly.ng`), every Corporate Client on Parkly operates through a **Dedicated Sovereign Corporate URL**:

```
https://<companySlug>.parkly.ng
```

For example:

- **Zenith Bank:** `https://zenith.parkly.ng`
- **KPMG Nigeria:** `https://kpmg.parkly.ng`
- **Dangote Group:** `https://dangote.parkly.ng`
- **DHL Express:** `https://dhl.parkly.ng`

### Why a Dedicated Corporate URL?

1. **Corporate Identity & Employee Trust:** Staff and visitors interact with their employer's official logo, brand colors, and single sign-on (SSO), building confidence and seamless workplace adoption.
2. **Simplified HR & Fleet Administration:** HR managers, fleet dispatchers, and facility security chiefs have one centralized, branded destination to manage passes, rosters, and vehicle fleets.
3. **Consolidated Monthly E-Invoicing:** All parking sessions (on-site headquarters, partner commercial garages, and municipal curbs) aggregate into a single monthly tax invoice with departmental cost-center itemization.
4. **Frictionless Gate Verification:** Gate security guards verify authorized vehicles in under 2 seconds using low-literacy, zero-typing mobile scanners.

---

## 2. Dedicated Corporate Subdomain Routing Matrix

When a user visits `https://<companySlug>.parkly.ng`, Parkly's Edge Middleware parses the subdomain and routes them to the company's scoped environment:

| Route Path  | Audience                 | Functionality                                                                                                   |
| :---------- | :----------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `/`         | Employees & Staff        | Employee self-service: access 1-tap company pass QR, view assigned workplace bays, and request visitor parking. |
| `/onboard`  | HR & Facility Admins     | 3-step rapid company onboarding wizard: company details, billing info, and staff roster upload.                 |
| `/portal`   | HR & Facility Managers   | Staff roster management, email domain matching (`*@company.com`), pass quota allocation, and visitor invites.   |
| `/fleet`    | Fleet Managers           | Commercial vehicle registry (sedans, vans, bikes), driver-to-plate assignments, and maintenance staging.        |
| `/security` | Facility Security Chiefs | Gate guard shift pairing, visitor pre-clearance logs, and unauthorized vehicle blacklist.                       |
| `/guard`    | Gate Security Guards     | Low-literacy mobile scanner PWA: plate OCR, Ed25519 QR pass scanning, and multi-lingual voice alerts.           |
| `/finance`  | Finance & Accounts       | Monthly consolidated invoice, bank statement reconciliation, cost-center reports, and VAT receipts.             |

---

## 3. Inclusive Field Ergonomics & Unified Experience

To eliminate all friction for both corporate executives and frontline security guards:

### 3.1 3-Step Simple Onboarding for Non-Tech HR Admins

- Corporate HR and facility administrators do not navigate complex technical configurations:
  1. _Who is Onboarding:_ Enter Company Name, RC/CAC Number, and corporate email domain (e.g. `@zenithbank.com`).
  2. _Upload Staff Roster:_ Upload a basic CSV/Excel sheet with staff names, phone numbers, and license plates.
  3. _Select Billing Preference:_ Corporate Direct Debit, Credit Card, or Monthly Bank Transfer.
- Parkly instantly provisions `<companySlug>.parkly.ng`, configures employee passes, and sends automated welcome messages.

### 3.2 Unified Driver Experience (Zero Friction for Employees & Fleet Drivers)

- **Zero Expense Out-of-Pocket:** Employees and fleet drivers never pay at the gate. **₦0 is charged to the driver.**
- **Universal Access:** Employees scan the gate poster or display their company pass in their mobile browser or Parkly app.
- **Works Everywhere:** Valid across company-owned office lots, commercial partner garages, and municipal curbs.

### 3.3 Zero-Literacy Gate Security Guard Scanner

Corporate gate security guards often have limited formal education and cannot manage complex logins:

1. **Zero-Typing Self-Onboarding via Booth Barcode Snapshot:**
   - Every guard booth has a permanent laminated **Gate Guard Shift Barcode**.
   - The security guard opens the app on any low-cost phone, taps the giant **"Snap Guard Barcode"** button, and scans the physical marker.
   - The guard is instantly verified and paired to that gate for their shift. **No email, no password, no typing.**
2. **Audio-Visual Feedback with Nigerian Voice Prompts:**
   - **Giant Color Feedback:**
     - 🟢 **FULL GREEN SCREEN:** Authorized Employee / VIP Guest. Loud bell chime + voice in **Nigerian Pidgin** (_"Company staff! Open gate!"_), **Yoruba** (_"Oṣiṣẹ ile-iṣẹ ni! Ṣi ilẹkun!"_), **Hausa** (_"Ma'aikaci ne! Buɗe ƙofa!"_), or **Igbo** (_"Onye ọrụ ụlọ ọrụ! Meghee ọnụ ụzọ!"_).
     - 🟡 **FULL YELLOW SCREEN:** VIP Guest Arriving (_"Visitor for Managing Director"_).
     - 🔴 **FULL RED SCREEN:** Unauthorized / Blocked Vehicle. Warning buzzer + voice alert (_"No enter! Car not allowed!"_).
   - **Automatic Plate OCR:** Guard points camera at the car plate; system validates authorization in under 1.5 seconds.

---

## 4. The 6-Sprint Corporate Delivery Program

The engineering and operational rollout of Parkly Corporate is divided into 6 distinct sprints:

| Sprint ID   | Document                                                                                                                     | Title & Focus                                             | Deliverables                                                                                                                                                                                  |
| :---------- | :--------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CORP-01** | [SPRINT-01-FOUNDATIONS-AND-CORPORATE-TENANCY.md](SPRINT-01-FOUNDATIONS-AND-CORPORATE-TENANCY.md)                             | **Multi-Tenant Subdomain Routing & Corporate Tenancy**    | Schema for `corporate_accounts`, `corporate_domains`, `corporate_cost_centers`, `corporate_branding`. Next.js edge wildcard subdomain middleware. Dynamic corporate branding engine.          |
| **CORP-02** | [SPRINT-02-CORPORATE-ONBOARDING-AND-EMPLOYEE-ROSTERING.md](SPRINT-02-CORPORATE-ONBOARDING-AND-EMPLOYEE-ROSTERING.md)         | **Corporate Onboarding, SSO & Employee Rostering**        | 3-step rapid company onboarding wizard (`/onboard`). Corporate email domain matching (`*@company.com`) & CSV staff roster ingestion. Automated employee pass allocation.                      |
| **CORP-03** | [SPRINT-03-FLEET-LOGISTICS-AND-POOL-CAR-DISPATCH.md](SPRINT-03-FLEET-LOGISTICS-AND-POOL-CAR-DISPATCH.md)                     | **Commercial Fleet Registry & Pool Car Dispatch**         | Fleet vehicle registry (sedans, vans, bikes, pool cars). Dynamic driver-to-vehicle dispatch and pool car checkout. Regulatory compliance tracking.                                            |
| **CORP-04** | [SPRINT-04-SECURITY-GUARD-SCANNER-AND-BARCODE-PAIRING.md](SPRINT-04-SECURITY-GUARD-SCANNER-AND-BARCODE-PAIRING.md)           | **Security Guard Scanner & Barcode Pairing**              | Zero-typing guard shift onboarding via booth barcode snapshot. Camera plate OCR & Ed25519 QR scanning. Audio-visual Green/Red signals with Nigerian voice prompts. VIP visitor pre-clearance. |
| **CORP-05** | [SPRINT-05-CONSOLIDATED-BILLING-EXPENSE-AND-ERP-INVOICING.md](SPRINT-05-CONSOLIDATED-BILLING-EXPENSE-AND-ERP-INVOICING.md)   | **Consolidated Invoicing, VAT & ERP Expense Allocation**  | Automated monthly corporate e-invoicing with 7.5% VAT. Departmental cost-center budget limits. Paystack Direct Debit / Bank Transfer auto-reconciliation. ERP exports.                        |
| **CORP-06** | [SPRINT-06-EMPLOYEE-MOBILE-EXPERIENCE-AND-ENTERPRISE-PILOT.md](SPRINT-06-EMPLOYEE-MOBILE-EXPERIENCE-AND-ENTERPRISE-PILOT.md) | **Employee Mobile Pass, VIP Visitors & Enterprise Pilot** | 1-tap Employee Corporate Pass in mobile app and web. Corporate Guest & Visitor self-booking flow. 30-Day Enterprise Pilot rollout kit and k6 scale verification.                              |

---

## 5. Execution Order

We execute the sprints sequentially, starting from Sprint CORP-01:

1. **Step 1:** Run Sprint CORP-01 (Database schemas, Edge middleware, Corporate branding).
2. **Step 2:** Run Sprint CORP-02 (Corporate onboarding, SSO & Staff rostering).
3. **Step 3:** Run Sprint CORP-03 (Fleet registry, Pool car dispatch & Compliance).
4. **Step 4:** Run Sprint CORP-04 (Low-literacy Guard scanner, Barcode pairing & Audio SFX).
5. **Step 5:** Run Sprint CORP-05 (Consolidated monthly invoicing, VAT & ERP exports).
6. **Step 6:** Run Sprint CORP-06 (Employee mobile pass, VIP visitor booking & Enterprise pilot).
