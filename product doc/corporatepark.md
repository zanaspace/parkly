What is "Tier 3: Corporate & Fleet Driver"?
In simple terms, Tier 1 and Tier 2 are designed for individual retail drivers who pay out of their own pocket and verify their personal identity.

Tier 3 is designed for B2B (Business-to-Business) parking—where an organization, company, or fleet manager pays for the parking, and the driver is parking on the company's behalf.

Instead of putting all the burden on the individual driver to undergo heavy document checks, trust is anchored to the vetted corporate entity.

The Two Groups in Tier 3
1. Company Staff (Corporate Employees)
Real-World Context in Lagos: Think of companies in high-density business districts like Victoria Island, Marina, or Ikoyi (e.g., banks, consulting firms, tech companies). Most office buildings don't have enough internal parking spaces for all their managers and staff. Today, companies either rent off-site plots of land or employees fight for street parking.
How Parkly Handles It:
The company registers an Employer Account on the Parkly Portal (

FR-EMP-001
).
The company buys 20, 50, or 100 monthly parking passes at nearby partner lots for its staff.
How Staff are Onboarded:
Work Email Domain Check: The employee logs into the Parkly mobile app and enters their work email (e.g., tunde.adebayo@zenithbank.com or ada@kpmg.ng). An instant verification token confirms they work there.
Or Phone Roster Upload: HR simply uploads a list of authorized staff phone numbers. When the employee logs into Parkly with their phone, their corporate pass is already waiting for them.
The Driver Experience: The employee adds their car plate. When they drive into the lot, they scan their QR code—no personal payment required. Parkly bills the employer on a single consolidated monthly invoice (

FR-EMP-003
).
2. Commercial & Fleet Drivers (Pool Cars, Chauffeurs, Delivery & Ride-Hail)
Real-World Context in Lagos:
Corporate Chauffeurs & Executive Drivers: Company executive pool cars driven by assigned staff drivers who need secure, reserved parking while executives are in meetings.
Logistics & Delivery Vans: Delivery companies (e.g., DHL, GIGL, FMCG distributors) needing safe daytime holding bays or overnight vehicle depot parking in central commercial hubs.
Ride-hail / Shuttle Fleets: Vehicle owners or fleet aggregators who manage 10–50 cars and need guaranteed overnight staging slots where vehicles won't be vandalized or towed by local authorities.
How Parkly Handles It:
The fleet manager registers their fleet of vehicles (e.g., 10 Toyota HiAce buses or 15 executive sedans) on Parkly.
The fleet manager assigns authorized drivers to specific vehicle plates.
Regulatory / Commercial Verification: For commercial transport vehicles, the fleet account maintains compliance records (such as LASPA Commercial Transport permits or Hackney Carriage badges).
At the Gate: When the driver arrives, the attendant scans the QR code or checks the plate. The system confirms:
“Vehicle LND-452-XY is an authorized pool car under Fleet Account ABC.”
“Driver is verified by Fleet ABC.”
Access is granted without cash or card at the barrier.
How Tier 3 Verification Works Under the Hood
[Corporate Employer / Fleet Manager]
          │
          ├─► 1. Parkly verifies Company (CAC/RC Number, Corporate Bank/Billing)
          │
          ├─► 2. Company purchases bulk monthly passes & sets authorized lots
          │
          └─► 3. Company adds authorized drivers via:
                  • Work email domain (e.g. *@company.com)
                  • Or staff phone number upload
                  • Assigns approved vehicle plate(s)
                              │
                              ▼
                    [Driver Mobile App]
                    • Logs in via work email / phone
                    • Receives "Corporate Pass" automatically
                    • Scans QR at gate (₦0 charged to driver)
                    • Attendant manifest shows "Corporate Verified"
Why Tier 3 Is Kept for Sprint 14 (Phase 2)
Reason	Detail
Requires Pilot Baseline First	To run corporate passes smoothly, Parkly first needs the core single-driver booking engine (S1–S4), offline attendant validation (S5), and monthly pass capacity logic (S9) fully operational and tested in real parking lots.
B2B Billing Infrastructure	Corporate clients don't pay with a single debit card at the gate; they require monthly invoicing, bank transfer reconciliation, tax/VAT receipts, and cost-center reporting (

FR-EMP-003
).
High Financial Value	Once launched in Sprint 14, Tier 3 provides Parkly and lot operators with predictable, high-volume, recurring monthly income with zero chargeback risk.
=============================================================

Next implementatio
2. What Is Left to Build (Sprints 6 – 10)
⏳ Sprint 6 — Extend, Overstay, Cancel, Refunds, Receipts & Notifications (NEXT)
In-App Booking Extension (FR-BOOK-005): Driver can extend their parking window before expiry with automated availability check and incremental Paystack payment.
Overstay Pricing & Pay Link (FR-BOOK-008): Automatic overstay fee calculation at check-out (using operator overstay rate or hourly ÷ 4), overstay pay link, and operator waiver tool.
Cancellation & Auto-Refunds (FR-PAY-003): Configurable cancellation policy engine (e.g., 100% refund >2h before start, 50% <2h, 0% after start) with Paystack refund API integration.
No-Show Marking (FR-BOOK-007): Scheduled job running every 5 min marking unarrived bookings as NO_SHOW at start_time + 30m to release inventory.
Receipts & Invoicing (FR-PAY-004): HTML/PDF receipt generation emailed via Resend and downloadable in-app.
Notification Outbox Engine (FR-NOT-001…003): pgmq queue with exponential backoff retries, SMS fallback (Termii), push notifications (Expo), and transactional emails (60m arrival reminder, 15m extend alert).
⏳ Sprint 7 — Operator Dashboard, Ledger & Reconciliation
Real-Time Occupancy Dashboard: Read model aggregating expected arrivals, currently parked, and available spaces.
Audited CSV Exports: Bookings and revenue CSV exports with user-ID watermarking.
Automated Daily Reconciliation Job: Ingestion of Paystack settlements matching provider transactions vs payments vs ledger vs payouts to the kobo.
Monthly Operator Financial Statement: PDF statements generated on the 1st of each month.
⏳ Sprint 8 — Admin Console, Support & NDPA Compliance
Global Support Search: Search tool for support staff (lookup by phone, plate, booking code, or payment ref) with masked PII and audited "reveal" logs.
Support Booking Actions: Maker-checker workflow for refunds over ₦50,000, bay relocation, and ticket re-sending.
Incident Management Console: Logging and tracking lot incidents (theft, damage, touts, access denial) with S1–S4 severity and SLAs.
Emergency Lot Suspension Workflow: One-click lot freeze with automatic affected driver notifications and refunds.
NDPA 2023 Compliance: Automated Data Subject Access Request (DSAR) export bundle and account deletion/pseudonymisation purge jobs.
⏳ Sprint 9 — Monthly Passes, Tier 2 Driver Verification (KYC) & Hardening
Monthly Passes (FR-PASS-001…004): Calendar month capacity allocation, upfront purchase, pass entry rules (one vehicle in lot at a time), and renewal reminders.
Tier 2 Driver Verification KYC (FR-AUTH-009): Identity provider adapter (Dojah / Smile ID) for FRSC Driver's License verification (number + DOB lookup) and NIN phone-match; Verified Driver badge.
Verified Driver Gating (FR-PASS-005): Lots enforcing requires_verified_driver: true for monthly passes and overnight holds.
Pre-Launch Hardening: Supabase PITR backups, off-platform encrypted pg_dump, bundle size optimization (< 30 MB Android AAB), and WCAG AA accessibility audit.
⏳ Sprint 10 — Launch Readiness, Pen Test & Closed Beta
Security Pen-Test Remediation: Remediate any High/Critical issues found in external penetration testing.
k6 Load Testing: Stress test at 2× pilot load (2,000 bookings/day, 50 concurrent on a single lot).
Disaster Recovery (DR) Drill: Validate RPO ≤ 15 min and RTO ≤ 4 h from off-platform backup.
Production Go-Live Config: Migration to parkly-prod, live keys activation, and Better Stack on-call alerts.
Closed Beta: Pilot rollout with 3–5 partner car parks in Victoria Island / Lekki.
3. Open External Dependencies (Waiting on Owner Approvals)
Termii Live SMS Sender ID: Waiting on telecom/DND route approval (using email verification code and test numbers meanwhile per 

ADR 0015
).
Paystack Live KYB: Operating on test sandbox keys until corporate live keys are issued.
Staging Environment Credentials: Dev deployment is running; staging pipeline setup waits for owner cloud access.
Recommended Next Step
Sprint 5 is complete. We are ready to begin Sprint 6 — Extend, Overstay, Cancel, Refunds, Receipts & Notifications. Would you like to create the Sprint 5 completion report (S5-report.md) and kick off Sprint 6?

7:19 PM
