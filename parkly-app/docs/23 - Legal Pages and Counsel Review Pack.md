# 23 — Legal Pages and Counsel Review Pack

**Status:** draft for counsel (S8 task 8). **Owner:** product owner. **Reviewer:** Nigerian counsel and the DPO.

This is what to hand to counsel with the two documents. The text itself lives in `apps/web/lib/legal/` (`privacy.ts`, `terms.ts`, `operators.ts`) and is shown at `/legal/privacy`, `/legal/terms` and `/legal/operators` on the driver website. Each audience finds its own documents in its own app: **drivers** from the website footer (Terms, Privacy) and the app's sign-up consent screen; **operators** from the foot of every operator-portal page (Operator Terms, and "How we handle your data", which jumps to the data section) and from the sign-up checkbox. The website footer also has a "For car parks" link. `/legal` lists all of them, grouped by who they are for. It is written in plain English for drivers, and from what Parkly does **today**, checked against the code, not from the plan.

## 1. What is in the pages

| Page | Covers |
|---|---|
| **Privacy Notice** (`/legal/privacy`) | Who we are and the DPO; **what we collect and how** (given by the driver, created by use, where they are, from other services); what we do not collect; **what we use it for, with the lawful basis**; who sees it (car parks, staff, 11 processors, with what each receives and where); data leaving Nigeria; retention; the driver's rights and exactly how to use each; security; children; cookies; changes; contact |
| **Operator Terms** (`/legal/operators`) | The marketplace role; joining and the KYB checks (CAC, director ID, proof of address); the LASPA permit and the Parkly site visit; listing, price review and the overstay price limit; commission (10–15%), the driver service fee, the Paystack split and payouts; what the operator must do (honour bookings, no cash, the attendant app); the team and attendant devices; suspension and ending; **a data section**: what Parkly collects about the business and its team and why, what operators see about drivers, and what operators may and may not do with it; responsibility; disputes |
| **Driver Terms** (`/legal/terms`) | What Parkly is (a marketplace); the account; booking (Reserve for later, Park now), paying; arriving, no-shows; extending and overstay; cancelling and refunds; using a car park; conduct; suspension; liability; disputes and governing law; changes |

Not covered here (separate documents, doc 05 section 18.6): a stand-alone operator data processing agreement (the Operator Terms have a data section; counsel decides whether more is needed), the Claims Terms (Sprint 12), the Attendant Code of Conduct, Acceptable Use for ratings (Sprint 11), the responsible-disclosure policy.

## 2. Before launch

1. **Counsel reviews and edits** the text. Every place that needs them is marked `DRAFT FOR COUNSEL` in the Terms, and listed in section 4 below.
2. **Fill in who we are.** `apps/web/lib/legal/entity.ts` holds the company name, CAC number, address, privacy and support emails and the DPO. While a value is missing the page shows `[… : to be completed]` in its place, so nothing can go out with an invented name. `missingEntityFields()` lists what is left.
3. **Mark them approved:** set `draft: false` on each document. That removes the "not yet reviewed" banner.
4. **Bump the version people accept.** The pages say version `2026-11-12`. The sign-up screens show the versions in the platform settings `legal.terms_version`, `legal.privacy_version` and `legal.operator_agreement_version` (today `2026-10-01`). When the text is approved, set all three to the same date as the pages. Everyone who accepted an older version is then asked to accept again.
5. **Confirm the sub-processors** (section 3) and keep the list in the Privacy Notice, doc 05 section 18.1.1 and `privacy.ts` the same.
6. **Set where the apps read the documents:** `EXPO_PUBLIC_WEB_URL` (mobile) and `NEXT_PUBLIC_WEB_URL` (operator portal) to the live driver website address. Both default to the dev site.
7. **Operational promises:** turn on `ADMIN_IP_ALLOWLIST` (the notice says admin access is limited to approved networks) and confirm the retention jobs run (doc 22 section 2.3d).

## 3. Every factual statement and where it comes from

Counsel should be able to check any sentence against the system. "Built" means the code does it today; "Confirm" means a person must verify before launch.

### 3.1 What we collect

| Statement | Source | Status |
|---|---|---|
| Phone number, used to sign in by one-time code and for booking messages | Supabase Auth, `users.phone_enc`, doc 06 section 3.1 | Built |
| Name, optional email | `users` (S1, ADR 0020), doc 06 3.1 | Built |
| Vehicles: plate, and make, model, colour if added | `vehicles`, doc 06 3.2 | Built |
| Consent to Terms and Privacy, and the marketing choice, with version and time | `consents`, doc 06 3.1 | Built |
| Bookings, sessions (check-in and out, method, attendant or device), payments, refunds, receipts | doc 06 3.4; `bookings`, `sessions`, `payments`, `refunds`, `receipts` | Built |
| Card number, expiry, CVV, PIN never seen or kept | Paystack hosted checkout, doc 06 3.4 (SAQ-A) | Built |
| Message log (event, time, status; not the full text) | `notifications`, ADR 0020 | Built |
| Device id, platform, app version, push token | `devices`, doc 06 3.1 | Built |
| IP address in technical and security records; some stored only as a one-way code | request logs; `audit_logs.ip_hash`, rate-limit keys | Built. **Confirm** log retention per provider |
| Staff actions recorded; staff see phone and email masked unless a reason is recorded | `audit_logs`, `POST /v1/admin/bookings/{id}/reveal` | Built |
| "Near me" search uses the position once, not stored | `GET /v1/lots` takes `lat`/`lng`; no table stores them | Built (no column holds them) |
| Self check-in compares the position with the car park, not stored | `attend/routes.ts` computes the distance; no coordinates are written | Built |
| Typed destination sent to LocationIQ, not linked to the user | ADR 0014; `/v1/places/autocomplete` | Built |
| Paystack tells us payment status; providers tell us delivery status | webhooks, notification outcomes | Built |

### 3.2 What we say we do **not** collect

| Statement | Why it is true today |
|---|---|
| No photos of the driver or car; no licence or ID number | Not built. Doc 06 lists driver ID checks (Tier 2 KYC) for monthly passes later: the notice promises to ask first |
| No CCTV, no call recordings | doc 06 3.6, 3.7 |
| No advertising or analytics trackers | None in the code (checked: no analytics SDK in web or mobile). If analytics is added, it needs consent and a notice update |
| No location history | See 3.1 |

### 3.3 Retention

| Statement | Source | Status |
|---|---|---|
| Account details erased after a 30-day grace when the driver deletes the account | `account-erasure` job, doc 06 6.1 | Built |
| Financial records kept 6 years, plate replaced by a one-way code, name and phone removed after erasure | doc 06 3.4; `erasure.eraseUser` | Built for erasure. The 24-month pseudonymisation job in doc 06 is **not** built. **Counsel:** confirm 6 years |
| Consent record kept 6 years | doc 06 3.1 | Policy. **Counsel:** confirm |
| Notification log 90 days | `retention-purge` job | Built |
| Data export file deleted after 7 days | `retention-purge` job | Built |
| Incident reports 3 years after closure | doc 06 3.7 | Policy; the purge for it is not built. **Counsel:** confirm |
| Audit records 6 years | doc 06 3.8 | Policy; export to the off-platform bucket is not built |
| Technical and security logs "days to a few months" | Vercel Hobby keeps about 30 minutes; Better Stack is not used | **Confirm** when logging is set up |

### 3.4 Rights

| Statement | Source | Status |
|---|---|---|
| Copy of data: Account, Download my data | `POST /v1/me/data-export` | Built |
| Delete the account in the app, 30 days to change their mind, blocked by an unfinished booking or unpaid overstay | `DELETE /v1/me`, `POST /v1/me/deletion/cancel` | Built |
| Add, change or remove vehicles in the app | `/v1/me/vehicles` | Built |
| Correct name or email, withdraw marketing, object or restrict: write to us | no in-app screen yet | Built as "write to us". An in-app switch for marketing is planned |
| We answer within 30 days | `DSR_DUE_DAYS` = 30 | Built. **Counsel:** confirm the statutory period under NDPA and GAID 2025 |

### 3.5 Companies that process data for us

The notice lists: Supabase, Vercel, Paystack, Termii, Resend, Expo, Cloudflare (Turnstile), Upstash, LocationIQ, OpenFreeMap, Sentry. This is the list of providers **actually in the code** (checked 12 Nov 2026). Doc 05 section 18.1.1 also lists Better Stack, Google Maps and Workspace, Flutterwave and a backup bucket provider, which are **not in use yet** and so are deliberately not in the notice. Add each to the notice when it goes live.

| Open point for each | Owner |
|---|---|
| A signed data processing agreement (doc 05 marks every one "to confirm") | Legal |
| Where each processes data. The notice says Ireland for Supabase and Vercel's servers, Nigeria for Paystack and Termii, EU for Upstash and Sentry, United States for Expo, "to be confirmed" for Resend, and "global" for Cloudflare, LocationIQ and OpenFreeMap | Engineering to verify the regions in use |
| Transfer basis for each non-Nigerian processor under NDPA Part VIII | Counsel (doc 05 section 18.7, item 4) |

## 4. Points that need counsel

Numbered to match doc 05 section 18.7 where one exists.

1. **Lawful basis and the privacy notice as a whole**: that the bases chosen (contract, legal obligation, legitimate interest, consent) are right for each purpose in the table, including legitimate interest for fraud and security logging.
2. **Data controller and operators**: the notice says Parkly is the controller for driver data, and that car parks see only first name, plate, times and amounts paid. Confirm whether operators are independent controllers or processors for what they see (doc 05 18.6, "Data Processing Agreement (operator)").
3. **Marketplace role** (Terms, "About these Terms"): Parkly as an intermediary that takes the booking and the payment, with the parking provided by the operator. Confirm this wording, and the CBN / payment-aggregator question (item 1).
4. **Cross-border transfers** (item 4): the transfer basis for Supabase and Vercel (Ireland), Expo (United States) and the global services, and the exact sentence in the notice.
5. **DPO, NDPC registration, DPIA** (item 3): who the DPO is, whether Parkly is a data controller of major importance, and the DPIA before the pilot.
6. **Liability, risk of loss, governing law** (item 6): the three `DRAFT FOR COUNSEL` notes in the Terms: whether parking is at the owner's risk, any cap on Parkly's liability, and the governing law and dispute process (courts of Lagos State, mediation or arbitration).
7. **Retention** (item 8): 6 years for financial records, 3 years for incidents, 6 years for consent and audit records.
8. **Response and breach timing** (item 5): the 30-day response period for rights requests, and the breach promise "within the time the law sets".
9. **Age**: the 18-or-over rule and the sentence about children.
10. **Automated decisions**: the sentence that nothing significant is decided automatically. Prices and refund limits are rules, and staff can review them.
11. **Operator Terms, commercial points**: the commission range and the rule that the rate at booking time applies; that operators must not take cash for Parkly bookings; the suspension and termination terms; the first-payout hold (item 9).
12. **Refund and cancellation wording** against consumer protection law (FCCPC): the 30-minute free cancellation, no refund for unused time, no refund for no-shows, the Park now holding fee, and the overstay rules.

## 5. How the text is kept true

- A test (`apps/web/lib/legal/legal.spec.ts`) fails if the Privacy Notice stops naming a kind of data, a processor, a lawful basis, a retention period or a right, or if a placeholder is used that does not exist.
- When behaviour changes (a new provider, a new kind of data, a new retention period), update the notice **and** this pack in the same change, and bump the version if it matters to drivers (AGENTS.md section 10).
