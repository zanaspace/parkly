# Parkly Corporate & Enterprise Fleet Parking Blueprint
## B2B Parking Management, Dedicated Company Subdomains, Automated Employee Mobility & Fleet Logistics

**Document Classification:** Strategic Whitepaper, Technical Architecture & B2B Implementation Guide  
**Target Audience:** Chief Technology Officers, Chief Operating Officers, Heads of HR & People Operations, Fleet Directors, Facility Managers, and Corporate Security Chiefs across commercial hubs (Victoria Island, Marina, Ikoyi, Ikeja, Abuja CBD, Port Harcourt, Kano).  
**Version:** 2.0 (Integrated Multi-Tenant Dedicated Corporate URL Architecture)  
**Effective Date:** November 2026  

---

## Executive Summary

Parking in Nigeria's commercial and financial nerve centres (e.g. Lagos Island, Victoria Island, Ikeja, Abuja Central Business District) represents a massive operational bottleneck for enterprises:
1. **Severe Office Bay Deficits:** 90% of commercial office towers have only 1 parking bay per 100 m² of floor space, forcing executive staff and employees to circle congested streets or park in unsecured, informal lots.
2. **Chaotic Cash Reimbursements:** Companies spend millions of naira monthly reimbursing staff for parking receipts, handwritten paper tickets, or informal curb touts with zero audit trail or corporate visibility.
3. **Fleet Inefficiency & Vandalism Risk:** Logistics vans, corporate pool cars, and dispatch fleets suffer from unmonitored staging, illegal curb fines, wheel-clamping, and security vulnerabilities.
4. **Friction for Visiting Clients & VIPs:** High-value clients and board executives arrive at office premises only to be turned away at security barriers due to lack of real-time bay coordination.

**Parkly Corporate Edition** transforms corporate parking into an **automated, cashless, auditable employee benefit and fleet infrastructure**. Companies provision reserved bays across their own private office parks and Parkly's network of partner car parks, managing employees, visitors, and fleets through a **Dedicated Sovereign Corporate URL** (e.g., `https://zenith.parkly.ng`, `https://kpmg.parkly.ng`, `https://dangote.parkly.ng`).

Employees and fleet drivers park seamlessly without out-of-pocket payments, while security guards verify vehicles in under two seconds using low-literacy, audio-visual mobile scanners. All parking activity consolidates into a single, tax-deductible monthly e-invoice with departmental cost-center breakdown.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      DEDICATED SOVEREIGN CORPORATE PORTAL                       │
│           (e.g., https://zenith.parkly.ng  |  https://kpmg.parkly.ng)           │
│         Official Corporate Identity · Single Sign-On · Subdomain Routing        │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
     ┌───────────────────────────────────┼───────────────────────────────────┐
     ▼                                   ▼                                   ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│   HR & PEOPLE OPS /   │   │   FLEET DISPATCH &    │   │   GATE SECURITY &     │
│   FACILITY MANAGEMENT │   │   LOGISTICS CONSOLE   │   │   GUARD PWA SCANNER   │
│ • Bulk Staff Roster   │   │ • Pool Car Allocation │   │ • Zero-Typing Pairing │
│ • Domain Email Match  │   │ • Delivery Van Staging│   │ • Plate OCR Camera    │
│ • Department Budgets  │   │ • Driver Compliance   │   │ • Green/Red Voice SFX │
│ • Monthly E-Invoicing │   │ • Overnight Holds     │   │ • VIP Visitor Alerts  │
└───────────┬───────────┘   └───────────┬───────────┘   └───────────┬───────────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED DRIVER & EMPLOYEE PASS LAYER                        │
│   • 1-Tap Corporate Pass (₦0 charged to employee at the barrier)               │
│   • Works across Company Office Lots, Commercial Partner Garages & State Curbs  │
│   • Instant Guest Visitor Parking Invitations with VIP Arrival SMS             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Value Proposition for Enterprise Leadership

### 1.1 For the Chief Executive Officer & COO
* **Employee Retention & Productivity:** Removes daily 30–45 minute morning parking anxiety for valuable executives and team members.
* **100% Cashless Corporate Invoicing:** Replaces manual cash reimbursements with a single consolidated monthly corporate invoice with full 7.5% VAT compliance and WHT deductibility.
* **Professional VIP Experience:** Corporate guests receive branded digital parking passes with reserved bay reservations and automated gate clearance.

### 1.2 For HR & People Operations
* **Zero-Touch Staff Onboarding:** Automatic employee pass allocation via corporate email domain matching (`*@company.com`) or simple CSV staff roster upload.
* **Departmental Cost-Center Billing:** Direct parking expenses to specific cost centres (e.g. Sales, Investment Banking, Legal, Logistics) for transparent internal budgeting.
* **Flexible Hybrid Passes:** Dynamic allocation of passes for hybrid teams working 2–3 days a week, reducing parking costs by 40% compared to static monthly leases.

### 1.3 For Fleet & Logistics Directors
* **Centralized Fleet Command:** Real-time visibility into where company pool cars, executive chauffeurs, and delivery vans are parked across the metropolis.
* **Guaranteed Overnight Staging:** Secure, monitored overnight staging lots protecting commercial assets from theft, vandalism, or municipal towing.
* **Compliance Tracking:** Automated alerts for expiring commercial vehicle roadworthiness, LASPA commercial transit permits, and hackney carriage licenses.

---

## 2. Dedicated Corporate URL & Subdomain Architecture

Every corporate client receives an isolated, dedicated corporate web address:
```
https://<companySlug>.parkly.ng
```

### 2.1 Corporate Subdomain Routing Matrix
| Domain / Route | Target Audience | Primary Function |
| :--- | :--- | :--- |
| `https://<companySlug>.parkly.ng/` | Company Employees | Corporate dashboard: access 1-tap company pass QR, view assigned workplace bays, and request visitor parking. |
| `https://<companySlug>.parkly.ng/onboard` | HR & Facility Admins | 3-step rapid company onboarding wizard: company details, billing info, and staff roster upload. |
| `https://<companySlug>.parkly.ng/portal` | HR & Facility Managers | Staff roster management, email domain matching, parking quota allocation, and visitor invites. |
| `https://<companySlug>.parkly.ng/fleet` | Fleet Managers | Vehicle registry (pool cars, vans, bikes), driver-to-plate assignments, and maintenance staging. |
| `https://<companySlug>.parkly.ng/security` | Facility Security Chiefs | Gate guard shift pairing, visitor pre-clearance logs, and unauthorized vehicle blacklist. |
| `https://<companySlug>.parkly.ng/guard` | Gate Security Guards | Low-literacy mobile scanner PWA: plate OCR, Ed25519 QR pass scanning, and multi-lingual voice alerts. |
| `https://<companySlug>.parkly.ng/finance` | Finance & Accounts | Monthly consolidated invoice, bank statement reconciliation, cost-center reports, and VAT receipts. |

---

## 3. Inclusive Onboarding & Field Ergonomics

### 3.1 3-Step Simple Corporate Onboarding (Zero Jargon)
Designed so any HR executive or facility administrator can onboard their company in under 5 minutes:
1. **Company Profile & Email Domain:** Enter company name, RC/CAC number, and authorized corporate email domain (e.g. `@zenithbank.com`).
2. **Staff Roster or Roster Sync:** Upload a basic Excel/CSV file with columns: `Name`, `Phone`, `Email`, `Plate Number` (or connect Google Workspace / Microsoft 365).
3. **Billing Method:** Select Corporate Direct Debit, Credit Card, or Monthly Bank Transfer (TSA / Corporate NUBAN).
*Parkly instantly provisions `<companySlug>.parkly.ng`, issues digital passes to all staff, and sends automated welcome SMS/emails.*

### 3.2 Unified Driver Experience (Zero Employee Friction)
* **Zero Personal Expense:** When an employee parks at their company lot, an affiliated commercial lot, or a municipal curb, they scan the gate code or display their pass. **₦0 is charged to the driver.**
* **1-Tap Workplace Pass:** The employee accesses their company pass directly via mobile app or standard mobile browser.
* **Auto-Plate Whitelist:** For office gates equipped with automatic plate reading, the barrier opens automatically upon approach.

### 3.3 Zero-Literacy Gate Security Guard Scanner
Corporate gate guards and private security personnel (e.g. Halogen, Proton, KingsGuard) often have low tech literacy:
1. **Zero-Typing Self-Onboarding via Booth/Badge Barcode:**
   - Every security booth has a permanent laminated **Gate Guard Shift Barcode**.
   - The security guard opens the app on any low-end smartphone, taps the giant **"Snap Guard Barcode"** button, and scans the physical code.
   - The guard is instantly verified and paired to that gate for their 8-to-12 hour shift. **No email, no password, no typing.**
2. **Audio-Visual Feedback with Multi-Lingual Voice Prompts:**
   - **Giant Color Feedback:**
     - 🟢 **FULL GREEN SCREEN:** Authorized Employee / VIP Guest. Bell chime + voice prompt in Nigerian Pidgin (*"Company staff! Open gate!"*), Yoruba (*"Oṣiṣẹ ile-iṣẹ ni! Ṣi ilẹkun!"*), Hausa (*"Ma'aikaci ne! Buɗe ƙofa!"*), or Igbo (*"Onye ọrụ ụlọ ọrụ! Meghee ọnụ ụzọ!"*).
     - 🟡 **FULL YELLOW SCREEN:** VIP Guest Arriving (*"Visitor for Executive Director"*).
     - 🔴 **FULL RED SCREEN:** Unauthorized / Blocked Vehicle. Warning buzzer + voice alert (*"No enter! Car not allowed!"*).
   - **Automatic Plate OCR:** Guard points camera at the car plate; system validates authorization in under 1.5 seconds.

---

## 4. The Two Groups in Corporate Parking

### 4.1 Group A: Corporate Employees & Executive Staff
* **The Reality in Lagos/Abuja:** Staff commuting to commercial hubs face exorbitant informal parking fees or battle for limited on-site slots.
* **Parkly Solution:**
  - Companies purchase bulk monthly capacity at guaranteed rates in nearby commercial garages or municipal curbs.
  - Passes are assigned dynamically to employees' mobile phones.
  - Hybrid workplace scheduling allows 100 parking passes to comfortably support 180 hybrid staff through automated reservation calendars.

### 4.2 Group B: Commercial Fleets, Pool Cars & Logistics
* **The Reality:** Corporate chauffeurs waiting outside client meetings are frequently harassed or clamped by municipal curb touts; delivery vans (DHL, GIGL, FMCG) lack secure staging bays.
* **Parkly Solution:**
  - Fleet managers register vehicle plates and assign multiple authorized drivers.
  - Vehicles enter any authorized corporate or partner bay on Parkly's network seamlessly.
  - All parking sessions are automatically charged to the central fleet cost centre, eliminating petty cash vouchers.

---

## 5. Financial Settlement, Consolidated Invoicing & Tax Compliance

Parkly Corporate eliminates chaotic parking expense reimbursements:

$$\text{Monthly Corporate Invoice} = \sum (\text{Staff Monthly Passes} + \text{Fleet Parking Hours} + \text{VIP Visitor Passes}) + 7.5\% \text{ VAT}$$

* **Consolidated Monthly Billing:** Delivered on the 1st of every month via automated PDF e-invoice.
* **Cost-Center Allocation:** Invoices itemize expenditures by department (e.g. Marketing: ₦450,000, Operations Fleet: ₦1,200,000).
* **Tax Compliance:** Complete with Tax Identification Number (TIN), official VAT breakdown, and Withholding Tax (WHT) deduction schedules conforming to Federal Inland Revenue Service (FIRS) regulations.
* **Flexible Settlement:** Settled via Paystack Corporate Direct Debit, NIP Corporate Bank Transfer, or corporate card.

---

## 6. Enterprise Pilot & Implementation Roadmap

To deliver Parkly Corporate cleanly alongside Government Parking and the Core MVP, the technical rollout is organized into **6 Dedicated Corporate Sprints** housed in [`parkly-app/corporateParking/`](file:///c:/Users/CI-STAFF/Documents/parkly/parkly-app/corporateParking):

```
┌────────────────────────────────────────────────────────────────────────┐
│               CORPORATE PARKING DELIVERY SPRINT PROGRAM                │
├───────────────┬────────────────────────────────────────────────────────┤
│ Sprint CORP-01│ Multi-Tenant Subdomain Routing & Corporate Tenancy     │
│ Sprint CORP-02│ Corporate Onboarding, SSO & Employee Rostering         │
│ Sprint CORP-03│ Commercial Fleet Registry & Pool Car Dispatch          │
│ Sprint CORP-04│ Low-Literacy Guard Scanner & Barcode Pairing           │
│ Sprint CORP-05│ Consolidated Invoicing, VAT & ERP Expense Allocation   │
│ Sprint CORP-06│ Employee Mobile Pass, VIP Visitors & Enterprise Pilot  │
└───────────────┴────────────────────────────────────────────────────────┘
```

1. **Sprint CORP-01: Multi-Tenant Subdomain Routing & Corporate Tenancy**
   - Database schema for corporate accounts, subdomains, branding, and cost centers.
   - Next.js edge middleware routing for `<companySlug>.parkly.ng` and custom enterprise domains.
   - Dynamic corporate branding engine (logo, corporate colors, welcome banner).

2. **Sprint CORP-02: Corporate Onboarding, SSO & Employee Rostering**
   - 3-step rapid company onboarding wizard (`/onboard`).
   - Corporate email domain matching (`*@company.com`) & CSV staff roster ingestion.
   - Automated employee pass allocation and activation.

3. **Sprint CORP-03: Commercial Fleet Registry & Pool Car Dispatch**
   - Fleet vehicle registry: sedans, delivery vans, dispatch bikes, and pool cars.
   - Dynamic driver-to-vehicle dispatch and pool car checkout.
   - Regulatory compliance tracking (LASPA commercial badges, Hackney carriage permits).

4. **Sprint CORP-04: Low-Literacy Guard Scanner & Barcode Pairing**
   - Zero-typing guard shift onboarding via booth/badge barcode snapshot.
   - Camera plate OCR recognition & Ed25519 QR pass scanning.
   - Full-screen color feedback + multi-lingual Nigerian voice alerts (Pidgin, Yoruba, Hausa, Igbo).
   - VIP visitor parking pre-clearance with arrival SMS alerts.

5. **Sprint CORP-05: Consolidated Invoicing, VAT & ERP Expense Allocation**
   - Automated 1st-of-the-month consolidated corporate e-invoice generation with 7.5% VAT.
   - Departmental cost-center budget limits and over-budget approval workflows.
   - Integration with corporate accounting software (SAP, NetSuite, QuickBooks exports).

6. **Sprint CORP-06: Employee Mobile Pass, VIP Visitors & Enterprise Pilot**
   - 1-tap Employee Corporate Pass in mobile app and web.
   - Corporate Guest & Visitor self-booking flow.
   - 30-Day Enterprise Pilot rollout kit: Security guard field cards, employee welcome guides, and k6 corporate load tests.

---

## 7. Conclusion & Next Steps for Corporate Organizations

By replacing informal parking touts, fragmented cash vouchers, and employee parking stress with an automated digital platform, Parkly Corporate unlocks:
1. **Immediate Administrative Savings:** Eliminates hundreds of hours spent processing petty cash parking receipts.
2. **Guaranteed Employee Satisfaction:** High-value staff arrive at work calm, on time, and assured of secure parking.
3. **Full Tax & Corporate Governance:** Every kobo spent on parking is 100% auditable, VAT-compliant, and deductible.

### Recommended Action
Corporate HR and Facility Heads can initiate onboarding immediately by reserving their company's dedicated portal at `<companySlug>.parkly.ng`.

---
*Parkly Technologies Ltd · Africa's Sovereign Corporate & Municipal Mobility Infrastructure*  
*Enquiries: b2b@parkly.ng · Victoria Island, Lagos · Abuja CBD*
