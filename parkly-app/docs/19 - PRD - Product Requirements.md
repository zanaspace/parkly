# 19 — PRD: Product Requirements

> **Product:** Parkly · **Market:** Lagos, Nigeria · **Version:** 1.0 (14 Oct 2026)
> **Inputs:** `product doc/strategy.md`, `product doc/marketresearch.md`. **Canonical names/stack:** doc 00 (wins on conflict).
> **Delivery plan:** doc 20 maps every FR below to a sprint.

---

## 1. Problem

Lagos has 3M+ vehicles (LASPA estimate) and parking demand that exceeds supply. Drivers circle, haggle with touts, pay cash, and worry about theft and damage. The state is moving on-street parking to its own cashless system, so the private opportunity is **off-street lots**. Lot owners (hotels, office buildings, commercial lots) have spare bays but no occupancy visibility, leak cash, and carry new LASPA permit obligations (enforcement began 1 Sep 2026).

Local apps have not solved **trust**: Parkwell names it as its hardest hurdle. In South Africa, KaChing shut down over reliability and support, while Admyt scaled by serving landlords. Parkly wins by being **trusted and operationally reliable**, and by giving operators software they actually want to use.

## 2. Goals and non-goals

### 2.1 Goals (pilot, months 2–5)

| ID | Goal | Measure (target set after discovery baselines) |
|---|---|---|
| G1 | Drivers can find, book, pay and check in at verified lots without cash or touts | Booking conversion; payment success rate ≥ 97% |
| G2 | Operators get paid reliably and see occupancy | Daily settlement reconciled to 100%; operator weekly active use |
| G3 | Every live lot is verified and LASPA-permitted | 100% of live lots with valid permit |
| G4 | Operations never break the promise | Check-in failure rate < 1%; support first response < 15 min (07:00–21:00) |
| G5 | Habit forms | 30-day repeat booking rate; North Star: paid, completed sessions/week |

### 2.2 Non-goals (do not build)

On-street parking · peer-to-peer driveways · **wallet balances / stored value** · plate-recognition hardware · dynamic pricing · second city · autonomous/valet · auto-debit subscriptions (MVP).

## 3. Personas

| Persona | Description | Primary needs |
|---|---|---|
| **Tolu, office commuter (primary driver)** | Salaried, drives into VI/Ikoyi/Lekki/Ikeja 5 days a week, Android mid-range phone, pays by card/transfer | Reserved safe bay, predictable daily/monthly price, no cash, fast entry |
| **Chidi, event-goer (secondary driver)** | Attends weddings, church, concerts at venues | Know a space exists before leaving home |
| **Mrs Adeyemi, facilities manager (primary supply)** | Runs a 20–300 bay lot at an office building/hotel, mostly cash | Fill bays, stop leakage, daily cash in bank, LASPA paperwork handled |
| **Musa, lot attendant** | Low-end Android (2GB RAM), patchy data, shared phone, limited literacy in English UI | Check a car in or out in < 10 s, works offline, hard to get wrong |
| **Parkly ops agent** | Internal: onboarding, verification, support, finance, compliance | One console to verify lots, resolve issues, refund, audit |

## 4. Jobs to be done

- **Driver:** "When I'm driving to work, I want a guaranteed safe space at a fixed price, so I don't waste time or risk my car."
- **Driver (event):** "When I'm going to a busy venue, I want to know I have a space before I arrive."
- **Operator:** "When my bays sit empty or cash goes missing, I want bookings and cashless collection, so revenue is predictable and visible."
- **Operator:** "When my LASPA permit is due, I want a reminder and a record, so I'm never fined or suspended."
- **Attendant:** "When a car arrives, I want to confirm it's booked in one tap, even with no network."

## 5. Scope by horizon

| Horizon | In scope | Sprints (doc 20) |
|---|---|---|
| **Now (pilot)** | Driver app (Android) + web fallback; phone OTP; vehicles; search; lot detail; book hourly/daily; pay (Paystack); QR ticket; attendant offline check-in/out; extend; overstay; cancel/refund; receipts; SMS/push/email; operator onboarding, lots, rate plans, permits, occupancy dashboard, settlement reports; admin verification, support, incidents (basic), permit expiry automation, DSAR; monthly passes | S0–S10 |
| **Next (grow)** | Ratings; in-app incident reporting UX; claims workflow + insurer; event/venue booking; employer passes + invoicing; paid operator tier; referrals; second node | S11–S16 |
| **Later (scale)** | Fleet accounts; plate recognition at partner lots; partner API for ride-hail/fintech; LASPA data integration; new cities | Epics only |

## 6. Functional requirements

Priority: **P0** = pilot cannot launch without it · **P1** = pilot-desirable / early grow · **P2** = later.
Each FR has a story and Gherkin acceptance criteria (AC). Engineers turn AC into tests first (doc 02, TDD).

### 6.1 Identity and access — FR-AUTH

**FR-AUTH-001 · P0 · Driver sign-up/sign-in with phone OTP** *(until an SMS provider is live, drivers sign in with a 6-digit email code instead; phone stays available for test numbers; ADR 0015)*
As a driver, I want to sign in with my phone number and a one-time code, so I don't need a password.
```gherkin
Scenario: Successful OTP sign-in
  Given I enter a valid Nigerian number "+2348031234567"
  When I request a code
  Then a 6-digit OTP is sent by SMS within 30 seconds
  And the code expires after 5 minutes
  When I enter the correct code
  Then I am signed in with a Supabase Auth session: access token (15 min) and rotating refresh token (session time-boxed to 30 days)

Scenario: OTP abuse is throttled
  Given I have requested 3 codes for the same number in the last 15 minutes
  When I request another code
  Then I receive error "OTP_RATE_LIMITED" and no SMS is sent

Scenario: Wrong code attempts are limited
  Given I enter wrong codes repeatedly
  When Supabase Auth's verify limit is reached
  Then I see "Too many attempts, try again later" and must wait or request a new code
  And any code older than 5 minutes is rejected
```

**FR-AUTH-002 · P0 · Driver profile** — name (required), email (optional, for receipts), consent records (terms, privacy, marketing opt-in separate and unticked by default).
```gherkin
Scenario: Consent captured at sign-up
  Given I am a new driver
  When I complete my profile
  Then I must accept Terms and Privacy Notice to continue
  And marketing consent is optional and off by default
  And each consent is stored with version and timestamp
```

**FR-AUTH-003 · P0 · Vehicles** — a driver adds 1–5 vehicles (plate, make, model, colour); plate normalised; one default vehicle.
```gherkin
Scenario: Add vehicle with plate normalisation
  When I add plate "lnd 123-ab"
  Then it is stored as raw "lnd 123-ab" and normalised "LND123AB"
  And I cannot add the same normalised plate twice to my account
```

**FR-AUTH-004 · P0 · Operator and admin sign-in** — email + password (min 12 chars, breached-password check) + TOTP MFA. MFA **mandatory** for all admin roles and operator OWNER/MANAGER; optional for ATTENDANT, who sign in to the PWA with phone OTP + lot-scoped PIN.
```gherkin
Scenario: Admin without MFA cannot access console
  Given an admin account has not enrolled MFA
  When they sign in with a correct password
  Then they are forced into MFA enrolment before any other page loads
```

**FR-AUTH-005 · P0 · RBAC** — roles per doc 00 §3.7, enforced server-side on every endpoint; operator roles scoped to one operator; attendants optionally scoped to lots.
```gherkin
Scenario: Cross-operator access is denied
  Given I am OPERATOR_MANAGER of operator A
  When I request lot data belonging to operator B
  Then I receive 404 and an authorisation-denied event is logged
```

**FR-AUTH-006 · P0 · Sessions and sign-out** — refresh-token rotation with reuse detection; sign out this device / all devices; admin can revoke a user's sessions.

**FR-AUTH-007 · P0 · Account deletion** — driver can request deletion in app; processed per doc 06 retention (financial records kept, identity pseudonymised).

**FR-AUTH-008 · P0 · Audit log** — every privileged action (admin and operator writes, refunds, role changes, lot status changes, data exports) writes an append-only AuditLog row.

**FR-AUTH-009 · P1 · Driver Identity Verification (KYC & Trust Tiers)** — Tiered verification structure separating low-friction hourly booking from high-trust monthly/overnight/corporate privileges.
- **Tier 1 — Consumer Baseline (P0 · In MVP Core):** Phone OTP (NIN-linked Nigerian SIM) / Email OTP fallback (ADR 0015), driver name, FRSC plate normalisation (`FR-AUTH-003`), accepted Terms of Service & Privacy Notice (NDPA consent), and 3D-Secure payment card tokenisation. Zero upfront document upload required for standard hourly or daily reservations to maintain sub-60s booking conversion.
- **Tier 2 — Verified Driver (P1 · Sprint 9):** Identity proofing via Nigerian identity provider (Dojah / Smile ID / QoreID). Driver provides FRSC Driver's License number and Date of Birth (or NIN/vNIN phone-match). Verified against official government registries; upon successful match, driver profile receives a "Verified Driver" badge and `is_verified_driver: true`. Gated by operators for monthly passes (`FR-PASS-005`), overnight parking, and high-security lots. Raw documents are not retained; license numbers are stored encrypted at rest (C4) per doc 06.
- **Tier 3 — Corporate & Fleet Driver (P2 · Sprint 14):** Corporate email domain verification (`@company.com`), employer pass delegation, fleet vehicle plate assignment, and optional commercial/hackney carriage permit validation.
```gherkin
Scenario: Driver verifies identity with FRSC Driver's License
  Given I am a signed-in driver without verification
  When I submit my FRSC Driver's License number and Date of Birth
  Then the system verifies the details against the FRSC database via the identity partner
  And my full name is matched against the license record
  And my account receives the "Verified Driver" badge (is_verified_driver: true)
  And the license number is stored encrypted at rest (C4) with raw documents discarded

Scenario: High-trust lot or monthly pass gates on Verified Driver status
  Given lot "VI Financial Towers" has policy "requires_verified_driver: true" for monthly passes
  When an unverified driver attempts to purchase a monthly pass
  Then the checkout flow requires completion of Tier 2 Driver Verification before payment
  And the slot hold is preserved while verification completes
```

### 6.2 Operators and lots — FR-LOT

**FR-LOT-001 · P0 · Operator onboarding (KYB)** — business name, CAC/RC number, contact, owner identity, bank account (validated via Paystack resolve), creates a Paystack subaccount. Status `PENDING → ACTIVE` after admin review.
```gherkin
Scenario: Bank account validation
  When the operator enters account number and bank
  Then the account name is resolved from the provider and shown for confirmation
  And a subaccount is created only after admin approval
```

**FR-LOT-002 · P0 · Create and edit lot** — name, address, map pin, opening hours (per weekday, 24h flag), total capacity, capacity offered to Parkly, vehicle size limits, amenities (guard, CCTV, lighting, covered, access control, EV charging), entry instructions, 3–10 photos. Starts in `DRAFT`.

**FR-LOT-003 · P0 · LASPA permit** — permit number, issue/expiry dates, document upload (PDF/JPG ≤ 10 MB). Admin reviews.
```gherkin
Scenario: Lot cannot go live without a valid permit
  Given a lot with permit status "REJECTED" or expiry in the past
  When anyone attempts to set the lot to LIVE
  Then the request fails with "LOT_PERMIT_INVALID"
```

**FR-LOT-004 · P0 · Verification checklist** — ops agent records on-site checklist (permit sighted, guard presence, lighting, CCTV, access control, capacity count, owner identity) with photos and GPS-tagged timestamp; result APPROVED/REJECTED with notes.
```gherkin
Scenario: Verified badge
  Given a lot has an APPROVED permit and an APPROVED verification under 12 months old
  When the lot is set LIVE
  Then drivers see a "Verified" badge with the verification date
```

**FR-LOT-005 · P0 · Rate plans** — operator sets HOURLY (first-hour minimum, then per 15-min block), DAILY (flat, defined hours), MONTHLY (calendar month). Changes require admin approval and apply to new bookings only.

**FR-LOT-006 · P0 · Lot status control** — operator can PAUSE/resume; admin can SUSPEND/ARCHIVE with reason; existing bookings on suspension trigger ops workflow (notify + refund or relocate).

**FR-LOT-007 · P0 · Permit expiry automation** — reminders to operator at 30/14/7/1 days; on expiry lot auto-moves to `SUSPENDED`, hidden from search, future bookings flagged to ops.

**FR-LOT-008 · P1 · Capacity blackout** — operator blocks capacity for a date/time range (e.g. building event).

### 6.3 Discovery — FR-SRCH (part of FR-LOT family in doc 20 as FR-LOT-1xx)

**FR-LOT-101 · P0 · Search by destination** — Places autocomplete or "near me"; returns LIVE lots within 2 km (expandable to 5 km) with price for requested window, availability, distance, verified badge; list + map.
```gherkin
Scenario: Search returns only bookable verified lots
  Given 3 LIVE lots and 1 SUSPENDED lot within 2 km
  When I search for tomorrow 08:00–18:00
  Then I see the 3 LIVE lots sorted by distance
  And each shows the total price for that window and "x spaces left" or "Full"
  And the SUSPENDED lot is not shown

Scenario: p95 latency
  Then search responds in under 800 ms at p95 on the API
```

**FR-LOT-102 · P0 · Lot detail** — photos, address, entry instructions, hours, amenities, verified badge + date, rate plans, price breakdown (rate + service fee), cancellation policy, directions deep link.

**FR-LOT-103 · P1 · Public lot page (web)** — SEO-friendly page on `apps/web` for each LIVE lot with "Book in app / Book on web".

### 6.4 Booking — FR-BOOK

**FR-BOOK-001 · P0 · Create booking** — choose lot, vehicle, start/end (15-min aligned, start ≥ now+0, max `booking.max_advance_days` ahead (default 30) for hourly/daily); quote shown; creates `PENDING_PAYMENT` booking that **holds capacity for 10 minutes**.
```gherkin
Scenario: Capacity hold prevents overbooking
  Given a lot offers 1 space and has 0 confirmed bookings for 09:00–17:00
  When two drivers try to book 09:00–17:00 at the same moment
  Then exactly one booking enters PENDING_PAYMENT
  And the other receives "BOOKING_SLOT_UNAVAILABLE"

Scenario: Hold expiry
  Given a PENDING_PAYMENT booking older than 10 minutes without successful payment
  Then it becomes EXPIRED and the capacity is released
```

**FR-BOOK-002 · P0 · Price quote** — server-calculated in `packages/domain/pricing`; quote ID valid 10 min; client never computes the charge.

**FR-BOOK-003 · P0 · Booking confirmation** — on payment success: status CONFIRMED, booking code (e.g. `PK-7HQ4MZ`), QR ticket, SMS + push with code, lot address and entry instructions.

**FR-BOOK-004 · P0 · My bookings** — upcoming, active, past; offline-cached ticket (QR + code viewable without network).

**FR-BOOK-005 · P0 · Extend** — while CONFIRMED or CHECKED_IN, extend end time if capacity allows; extra payment; new end time sent to attendant manifest.
```gherkin
Scenario: Extension blocked when lot full
  Given the lot is full for the extension window
  When I request to extend by 1 hour
  Then I receive "BOOKING_EXTENSION_UNAVAILABLE" and no charge is made
```

**FR-BOOK-006 · P0 · Cancel** — free until 30 min before start (full refund including service fee); after that, no refund unless ops override.
```gherkin
Scenario: Free cancellation
  Given my booking starts in 2 hours
  When I cancel
  Then the booking is CANCELLED and a full refund is initiated within 1 minute
```

**FR-BOOK-007 · P0 · No-show** — booking not checked in by start + 30 min → `NO_SHOW`, capacity released, no refund (configurable).

**FR-BOOK-008 · P0 · Overstay** — checkout after end time: charged per started 15-min block at hourly rate; driver gets pay link via SMS/push; unpaid overstay blocks new bookings until paid; ops can waive.

**FR-BOOK-009 · P0 · Receipt** — digital receipt (in app, email if provided, downloadable PDF): lot, permit no., times, line items, VAT note if applicable, booking code, payment ref.

### 6.5 Payments — FR-PAY

**FR-PAY-001 · P0 · Pay via Paystack** — card, bank transfer, USSD via Paystack checkout; split to operator subaccount (booking value − commission) and Parkly (commission + service fee).
```gherkin
Scenario: Split is correct
  Given a booking value of ₦5,000 (500000 kobo), commission 12% and service fee ₦100
  When payment succeeds
  Then the charge is 510000 kobo
  And the operator split is 440000 kobo
  And Parkly receives 70000 kobo before provider fees
```

**FR-PAY-002 · P0 · Webhooks are the source of truth** — booking confirmed only on a verified webhook (HMAC signature) or server-side verify call; duplicate webhooks are idempotent.
```gherkin
Scenario: Duplicate webhook
  Given a charge.success webhook for reference R was processed
  When the same webhook arrives again
  Then no second ledger entry or notification is created and the API returns 200
```

**FR-PAY-003 · P0 · Refunds** — full/partial via provider API; initiated by policy (cancellation) or ADMIN_FINANCE; status tracked; driver notified.

**FR-PAY-004 · P0 · Internal ledger** — double-entry LedgerEntry rows for every charge, split, fee, refund, settlement; sum of every journal = 0.

**FR-PAY-005 · P0 · Daily reconciliation** — job compares provider transactions and settlements with ledger; mismatches create a finance task; report available to ADMIN_FINANCE.

**FR-PAY-006 · P0 · No stored value** — no balances, credits redeemable as cash, or top-ups. Referral rewards (Next) are booking discounts only.

**FR-PAY-007 · P1 · Provider failover** — Flutterwave behind `PaymentProvider`; switchable per environment flag.

### 6.6 Check-in / check-out — FR-CHK

**FR-CHK-001 · P0 · QR ticket** — signed token (booking id, lot id, window, plate, signature) displayed in app and verifiable offline by the attendant PWA using the lot's verification key.

**FR-CHK-002 · P0 · Attendant check-in** — scan QR, or enter booking code, or search plate in today's manifest; shows plate, vehicle, window; one tap check-in.
```gherkin
Scenario: Offline check-in
  Given the attendant device downloaded today's manifest and is offline
  When the attendant scans a valid QR for this lot and today
  Then check-in is recorded locally with a device timestamp and idempotency key
  And it syncs to the server when the network returns

Scenario: Wrong lot
  When the attendant scans a ticket for another lot
  Then the app shows "Not for this lot" in red and does not check in
```

**FR-CHK-003 · P0 · Check-out** — attendant taps check-out (or driver taps "I've left" with geofence hint); session ends; overstay computed.

**FR-CHK-004 · P0 · Offline manifest and sync** — PWA caches the manifest for the next 24 h, refreshes every 5 min when online, works ≥ 8 h offline, queues events, resolves conflicts (server keeps earliest check-in, latest check-out; duplicates dropped by idempotency key).

**FR-CHK-005 · P0 · Walk-up / unbooked vehicle** — attendant records an unbooked arrival as "walk-in" (no payment through Parkly in MVP; used for occupancy only).

**FR-CHK-006 · P1 · SMS fallback** — driver without data can show the SMS booking code; attendant can verify code offline against manifest.

### 6.7 Monthly passes — FR-PASS

**FR-PASS-001 · P0 · Buy monthly pass** — select lot with MONTHLY plan, vehicle, start month; capacity reserved for the month; paid upfront.
**FR-PASS-002 · P0 · Pass check-in** — same QR flow; unlimited entries within lot hours for the calendar month; one vehicle in lot at a time.
**FR-PASS-003 · P0 · Renewal reminder** — 7 and 2 days before expiry, with one-tap renew (manual payment; no auto-debit in MVP).
**FR-PASS-004 · P1 · Vehicle swap** — change pass vehicle up to 2 times per month.
```gherkin
Scenario: Pass capacity
  Given a lot offers 10 monthly passes and 10 are sold for November
  When I try to buy a November pass
  Then I see "Sold out" and can join a waitlist (P1)
```

**FR-PASS-005 · P1 · Verified driver gating** — Lots can configure `requires_verified_driver: true` for monthly passes and multi-day holds. Unverified drivers must complete Tier 2 KYC (`FR-AUTH-009`) before activating or completing purchase of a monthly pass.
```gherkin
Scenario: Unverified driver blocked from buying gated pass
  Given a lot requires driver verification for monthly passes
  And I have not completed Tier 2 verification
  When I attempt to purchase the pass
  Then I am directed to the 60-second identity verification flow
  And the pass hold is preserved while verification completes
```

### 6.8 Operator portal — FR-OPS

**FR-OPS-001 · P0 · Occupancy dashboard** — live: expected arrivals, checked-in, available capacity per lot; today and next 7 days.
**FR-OPS-002 · P0 · Bookings list** — filter by lot/date/status; export CSV (owner/manager only).
**FR-OPS-003 · P0 · Revenue and settlement report** — per day: gross booking value, commission, net, settlement status/date, provider reference; matches Paystack.
**FR-OPS-004 · P0 · Team management** — invite managers and attendants (by phone/email), assign lots, revoke access.
**FR-OPS-005 · P0 · Permit tracker** — permit status and expiry per lot; upload renewal.
**FR-OPS-006 · P1 · Monthly statement** — PDF emailed on the 1st.
**FR-OPS-007 · P2 · Analytics (paid tier)** — utilisation by hour/day, repeat drivers, revenue trends.

### 6.9 Admin console — FR-ADM

**FR-ADM-001 · P0 · Operator & lot review queues** — KYB, permits, verification, rate-plan approvals with approve/reject + reason.
**FR-ADM-002 · P0 · Support search** — find driver/booking by phone, booking code, plate, payment ref; view timeline; masked PII unless "reveal" (audited).
**FR-ADM-003 · P0 · Booking actions** — cancel, refund (full/partial), waive overstay, relocate, resend ticket — each with reason, audited, refund over ₦50,000 needs a second ADMIN_FINANCE approval.
**FR-ADM-004 · P0 · Lot suspend/unsuspend** with reason and affected-bookings workflow.
**FR-ADM-005 · P0 · Platform settings** — commission defaults, service fee, cancellation/no-show windows, feature flags (SUPER_ADMIN only, audited).
**FR-ADM-006 · P0 · Data subject requests (DSAR)** — export driver data (JSON/PDF) and process deletion per doc 06; 30-day SLA tracked.
**FR-ADM-007 · P0 · Finance views** — reconciliation results, mismatches, refunds, settlements.
**FR-ADM-008 · P1 · Weekly ops review report** — incidents, check-in failures, payment success, support times.

### 6.10 Notifications — FR-NOT

**FR-NOT-001 · P0 · Channels** — SMS (Termii), push (Expo), email (Resend). Transactional only by default; marketing only with opt-in.
**FR-NOT-002 · P0 · Events** — OTP; booking confirmed; reminder 60 min before start; entry instructions; check-in confirmation; 15 min before end ("extend?"); overstay pay link; cancellation/refund; pass expiry; operator: new booking (digest), settlement, permit expiry; admin: payment mismatch, incident.
**FR-NOT-003 · P0 · Delivery reliability** — queue with retries (exponential backoff, 5 attempts), SMS fallback if push not delivered for critical events (confirmation, overstay), delivery status stored.
**FR-NOT-004 · P1 · Notification preferences** — driver controls non-critical channels.

### 6.11 Incidents — FR-INC

**FR-INC-001 · P0 · Ops-logged incident** — support/ops logs incident against lot/booking (type: damage, theft, safety, access denied, overcharge, tout, other; severity S1–S4).
**FR-INC-002 · P0 · Attendant "issue" button** — report access/gate/vehicle issue from PWA.
**FR-INC-003 · P1 · Driver in-app incident report** — during or 72 h after a session, with photos.
**FR-INC-004 · P1 · Auto-escalation** — S1 incidents page on-call ops; 3+ incidents at a lot in 30 days flags lot for review.

### 6.12 Ratings — FR-RAT (Next)

**FR-RAT-001 · P1 · Rate session** — 1–5 stars + tags (safe, easy entry, clean, staff friendly, as described) after completion; prompt once.
**FR-RAT-002 · P1 · Lot rating display** — average shown after ≥ 5 ratings.
**FR-RAT-003 · P1 · Low-rating review** — lot avg < 3.5 over last 20 ratings → ops review task.

### 6.13 Claims — FR-CLM (Next, behind `claims_enabled`)

**FR-CLM-001 · P1 · Submit claim** — within 72 h of session end; type, description, photos, police report (theft); linked to session.
**FR-CLM-002 · P1 · Claims workflow** — SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → PAID → CLOSED; claims owner assigned; SLA timers.
**FR-CLM-003 · P1 · Insurer integration** — send claim to insurer partner (API or secure email); per-session cover premium on booking if enabled.
**FR-CLM-004 · P1 · Exposure caps** — per-claim and monthly caps from config.

### 6.14 Events and venues — FR-EVT (Next)

**FR-EVT-001 · P1 · Event listing** — venue operator creates an event (date, time window, capacity, flat price) linked to a lot.
**FR-EVT-002 · P1 · Event booking** — drivers book event parking; peak-entry mode in attendant PWA (fast scan, bulk manifest).
**FR-EVT-003 · P2 · Partner link** — shareable booking link / QR for event organisers.

### 6.15 Employers — FR-EMP (Next)

**FR-EMP-001 · P1 · Employer account** — company profile, admins, cost centres.
**FR-EMP-002 · P1 · Corporate passes** — employer buys monthly passes for staff (assign by phone number); staff see pass in app.
**FR-EMP-003 · P1 · Invoicing** — one monthly invoice, pay by transfer/Paystack invoice; no credit/stored value.
**FR-EMP-004 · P2 · Usage reports** for employer admins.
**FR-EMP-005 · P2 · Corporate & Fleet Driver Verification (Tier 3)** — Corporate drivers verify via work email domain (`@company.com`) or employer invitation token; fleet managers assign verified vehicle plates and validate commercial driver credentials where required.

### 6.16 Growth — FR-GRO (Next)

**FR-GRO-001 · P1 · Referrals** — driver gets a code; referee and referrer get a one-time booking discount after first completed paid session (discount, never cash).
**FR-GRO-002 · P1 · Paid operator tier** — subscription unlocks FR-OPS-007 analytics, multi-staff controls, integrations; billed via Paystack subscription.

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-PERF-001** | API p95 < 300 ms for reads, < 800 ms for search, < 1 s for booking create (excluding provider). |
| **NFR-PERF-002** | Driver app cold start < 3 s on reference device (Android 8, 2 GB RAM); ticket screen opens < 1 s from cache. |
| **NFR-PERF-003** | Pilot load: 2,000 bookings/day, 50 concurrent booking attempts on one lot without overbooking (k6 test). |
| **NFR-AVAIL-001** | API availability **99.5%** monthly during pilot (excluding announced maintenance 01:00–04:00 WAT). 99.9% target for Grow. |
| **NFR-AVAIL-002** | RPO ≤ 15 min, RTO ≤ 4 h. DR drill before launch. |
| **NFR-SEC-001** | OWASP ASVS Level 2 for API and web; MASVS-L1 for mobile. Details in doc 05. |
| **NFR-SEC-002** | TLS 1.2+ everywhere; encryption at rest (Supabase-managed disk and Storage encryption, plus app-level AES-256-GCM for C4 fields); secrets in Vercel environment variables (Sensitive) and Supabase Vault; no secrets in repo or client bundles; RLS enabled on every table (deny-all for client roles). |
| **NFR-SEC-003** | Pen test by an external party before pilot launch; all High/Critical fixed. |
| **NFR-PRIV-001** | NDPA 2023 + GAID 2025: consent records, privacy notice, DSAR within 30 days, retention per doc 06, DPIA done before launch. |
| **NFR-OFFLINE-001** | Attendant PWA works ≥ 8 h offline with cached manifest; zero data loss on sync. |
| **NFR-OFFLINE-002** | Driver ticket (QR + code) available offline; booking flow shows clear offline state and retries. |
| **NFR-A11Y-001** | WCAG 2.2 AA for web; RN accessibility labels; min touch target 48 dp; text scales to 200%. |
| **NFR-LOWEND-001** | Android 8+ (API 26), 2 GB RAM, APK/AAB download < 30 MB, works on 3G (≤ 400 kbps): first meaningful screen < 5 s; API responses gzip, images WebP ≤ 150 KB. |
| **NFR-LOC-001** | English UI at launch; strings externalised (i18n) to add Yoruba/Pidgin later. Currency format `₦5,000`. |
| **NFR-OBS-001** | Every request has a trace id; dashboards for payment success, check-in failures, OTP delivery; alerts to on-call. |
| **NFR-SUP-001** | Support available 07:00–21:00 WAT daily during pilot; first response < 15 min. |

## 8. Metrics and analytics

Event tracking via a first-party `analytics_events` pipeline (no third-party ad SDKs in MVP). Personal data minimised; user ids pseudonymous.

| Strategy metric | Product measure | Events / source |
|---|---|---|
| **North Star** | Paid, completed sessions per week at verified lots | `booking.completed` where payment succeeded and lot verified |
| Supply | Verified lots live; verified bays; bays online | Lot status, capacity tables |
| Demand | Weekly active drivers; booking conversion; 30-day repeat | `search.performed`, `quote.viewed`, `booking.created`, `payment.succeeded` |
| Revenue | GBV; take rate; contribution per booking | Ledger |
| Trust | Rating; incidents per 1,000 sessions; claim resolution time | Ratings, incidents, claims |
| Operations | Payment success rate; check-in failures; support response time | Payments, `checkin.failed`, support tool |
| Compliance | Share of live lots with valid permit (target 100%) | Permit table, daily job |

Funnel: `app.opened → search.performed → lot.viewed → quote.viewed → booking.created → payment.succeeded → checkin.completed → checkout.completed`.

## 9. Release criteria (pilot)

1. All P0 FRs pass acceptance tests in staging.
2. NFR-SEC-003 pen test: no open High/Critical.
3. Load test meets NFR-PERF-003; DR drill meets NFR-AVAIL-002.
4. Doc 17 MVP Launch Readiness Checklist 100% signed off.
5. 10–15 lots verified and LIVE in one node; attendants trained.
6. Counsel sign-off on payments structure, driver & operator terms, privacy notice.
7. Closed beta: ≥ 50 paid sessions, payment success ≥ 97%, zero unresolved S1 incidents.

## 10. Assumptions

- Commuters will pay for guaranteed safe parking and book ahead.
- Operators accept 10–15% commission and cashless collection.
- Enough verified lots exist in one node.
- Paystack split + subaccount meets settlement needs without a licence of our own (counsel to confirm).
- LASPA welcomes compliant private platforms.
- Attendants have at least a low-end Android phone (Parkly may provide devices for the pilot).

## 11. Risks

| Risk | Product mitigation |
|---|---|
| Poor operations (KaChing lesson) | Offline attendant flow, human support, weekly incident review, monitoring |
| Unsafe lots | Verification gate, incidents, fast suspension |
| Disintermediation | Daily settlement, useful tools, passes tied to app |
| Regulatory change | Permit gate, config-driven pricing, LASPA engagement |
| Payments licensing | No stored value; licensed gateway split |
| Claims cost | Claims behind flag with caps; insurer first |
| Connectivity/power | Offline PWA, SMS fallback, lightweight app |

## 12. Dependencies

| Dependency | Needed for | Owner | Needed by |
|---|---|---|---|
| Paystack (business account, subaccounts, split, webhooks) | FR-PAY | Finance/eng | S4 (test keys S0) |
| Flutterwave (secondary) | FR-PAY-007 | Eng | S9 |
| Termii (sender ID + DND OTP route approval) | FR-AUTH-001, FR-NOT | Eng/ops | S1 (approval takes weeks — start S0) |
| Google Maps Platform (billing account, API keys restricted) | FR-LOT-101 | Eng | S3 |
| Apple/Google developer accounts | Mobile release | Product | S0 / S10 |
| LASPA (permit verification process) | FR-LOT-003/007 | Ops/compliance | S2 |
| Nigerian counsel (payments, terms, privacy, liability) | Release criteria | Product | S8 |
| Insurer partner | FR-CLM | Product | S12 |
| External pen-test vendor | NFR-SEC-003 | Eng | Booked by S7, run S10 |

## 13. Out of scope (MVP)

On-street parking; P2P driveways; wallets/stored value/top-ups; hardware/ANPR; dynamic pricing; multi-currency; iOS store release (build exists, release optional); languages other than English; auto-debit subscriptions; second city.
