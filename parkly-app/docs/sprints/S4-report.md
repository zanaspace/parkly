# Sprint 4 — Booking, availability holds and payments: report

- **Status:** **Done (code complete)** on 2026-10-22. Drivers book and pay with Paystack in the app and on the website. Paid bookings show a signed QR ticket that also opens offline. Staging sign-off waits for staging (owner).
- **Updated:** 2026-10-22
- **Entry check:**
  - S3 is done (code complete).
  - The S2 carry-over "staging demo; `supabase migration repair`" is still open: dev migrations from S2 onward were applied by hand in the SQL editor.

## Goal (doc 20)

Drivers book and pay; capacity is never overbooked; webhooks drive confirmation; ledger records every kobo.

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Booking domain: booking and payment state machines, hold timing, confirm decision, Paystack split, double-entry journals | FR-BOOK-001/003, FR-PAY-004, tasks 4–5 | **Done** |
| 2 | Tables (bookings, history, payments, refunds, webhooks, idempotency keys, ledger) and `fn_hold_booking` with ordered row locks | FR-BOOK-001, task 1 | **Done** |
| 3 | Booking API with Paystack: checkout with split, verify, webhook, idempotency, ledger postings, late payments | FR-BOOK-001/003/004, FR-PAY-001/002/004, task 3 | **Done** |
| 4 | Hold expiry: SQL job every minute | task 2 | **Done** |
| 5 | Mobile: book, pay in the app, confirmation, My bookings | task 7 | **Done** |
| 6 | Web: phone sign-in, book, pay, confirmation, My bookings | task 8 | **Done** |
| 7 | QR ticket: per-lot Ed25519 keys, signed token, QR in app and web, tickets kept offline in the app (ADR 0007) | FR-BOOK-003, tasks 6–7 | **Done** |
| 8 | Payment safety net (webhook retries, open-checkout check) and Paystack sender IP check | FR-PAY-002, task 3 | **Done** |

### Story 1: booking domain (`packages/domain/src/booking`)

- **Booking transitions** follow doc 02 §3.1.
  - Only SYSTEM confirms, and only on a succeeded payment for the exact amount.
  - A hold ends when it runs out, when the charge fails, or when checkout can't start.
  - Check-in opens 30 minutes before the start. A no-show is marked after start + 30 minutes. A late arrival can check in if a space is free again.
- **Payment transitions** follow doc 02 §3.2. Refunds can never add up to more than was paid.
- **`confirmDecision`** says what to do with Paystack's answer: confirm; do nothing if already settled; flag a wrong amount and never confirm; take the space again for late money, or refund it; or fail.
- **Split:** the operator gets price − commission, and Parkly keeps commission + service fee (Paystack `transaction_charge`). It rounds the same way as the quote.
- **Ledger:** the payment, Paystack-fee and refund journals are tested to balance on 2,000 random amounts.
- **Shared booking words:** status labels, the window in Lagos time, and the checkout state.

### Story 2: database (`20261022145725`, `…145800`)

- **Tables:** `bookings`, `booking_status_history` (append-only), `payments`, `refunds`, `webhook_events`, `idempotency_keys`, `ledger_accounts`, `ledger_entries` (append-only). All have RLS on and API-role policies only.
- **Ledger balance:** `ledger_balanced_check` is checked when the transaction commits. Platform ledger accounts are seeded.
- **`fn_hold_booking`** follows doc 02 §5:
  - It checks the window is on the grid and the lot is LIVE.
  - It locks the vehicle so one car can't be booked twice at the same time.
  - It creates missing slot rows, locks the slots in order, refuses a full slot with `BOOKING_SLOT_UNAVAILABLE`, then writes the booking and its first history row.
- **Helpers:** `fn_convert_hold` (held → booked), `fn_release_slots`, and `fn_reacquire_booking` (late money). Only the API role can run them.
- **Tests:** CI runs 50 simultaneous bookings for 10 spaces and expects exactly 10 to get one. Every function was also checked on dev inside rolled-back transactions.

### Story 3: booking API

- **`POST /v1/bookings`** requires an `Idempotency-Key`; a repeat returns the stored answer. It prices on the server, holds the space, and opens a Paystack checkout with the split. If checkout can't start, it gives the space back and returns 502. A website booking may pass `returnTo`, which must be one of Parkly's own sites.
- **`GET /v1/bookings`** and **`GET /v1/bookings/:id`** return the driver's own bookings only (404 otherwise).
- **`POST /v1/payments/:reference/verify`** and **`POST /v1/webhooks/paystack`** both go through `verifyAndSettle`. It asks Paystack, applies the result under row locks, writes history and ledger journals, and requests any refund.
- **The webhook** checks the HMAC-SHA512 signature on the raw body, stores each event once, and keeps only the fields it needs (no customer or card authorization data).
- **Demo car parks without a payout subaccount** take payment with no split outside prod; prod refuses them.

### Story 4: hold expiry (`20261022190000`)

`fn_expire_holds` runs every minute and works through 500 rows per run, skipping rows another transaction has locked. It:
- expires unpaid holds and gives the space back
- marks checkouts still open after 30 minutes ABANDONED
- purges idempotency keys older than 48 hours

No-show marking waits for check-in (S5).

### Stories 5–6: checkout screens

- **App:**
  - "Book for ₦X" on the lot screen, then review and pay (car, server total).
  - Paystack checkout inside the app, checked every 3 seconds.
  - Confirmation with the code, failed or expired explanations, and My bookings.
- **Website:**
  - Phone sign-in (precheck, Supabase SMS code, terms on first sign-in; same account as the app).
  - Review and pay, then Paystack's own page, then back to `/bookings/paid`, which confirms with the server.
  - Booking page and My bookings.

### Story 7: QR ticket (ADR 0007, `20261022200000`, `…200100`)

- **Keys:**
  - Each car park gets an Ed25519 key on its first paid booking.
  - The private key is stored only as FieldCrypto ciphertext.
  - At most one ACTIVE key per lot, and keys are never deleted.
- **Token:** the ticket is `PK1.<header>.<claims>.<signature>`. `verifyQrToken` is the offline check the S5 attendant app will use: key, signature, lot, window and expiry.
- **Drawing it:** QR level L, 69 modules. The app draws it with plain views and the website as an SVG. A real signed ticket drawn as the web SVG decodes with a QR reader and verifies.
- **Offline:** the app keeps paid tickets in secure storage, so the ticket and My bookings open with no signal. They are cleared on sign-out.

### Story 8: payment safety net (`20261022210000`)

- **`settle-payments` job, every minute:**
  - It retries stored `charge.success` events left pending or failed, up to 5 times.
  - It verifies checkouts still open 2–35 minutes after they started.
  - The result: a paid booking is confirmed even if Paystack's webhook never arrives.
- **Sender check:** the webhook refuses addresses outside Paystack's published IPs (not checked locally). `PAYSTACK_WEBHOOK_IPS` overrides the list.

## Exit criteria (doc 20 S4)

| Criterion | Status |
|---|---|
| End-to-end paid booking on staging with Paystack test cards | **Met on dev, staging pending.** In the app, `PK-MFGBY3` (bank transfer) and `PK-5SUWCF`; on the website, `PK-7VBZNQ` (card). Each was confirmed, with balanced ledger journals and the space moved from held to booked. Paystack's webhook arrived and was processed (17:41:37 Lagos). Staging waits for the owner. |
| k6 overbooking test passes | **Partly met.** The database-level race (50 simultaneous bookings for 10 spaces → exactly 10) runs in CI against local Supabase. The k6 run against a deployed API waits for staging (Hobby dev hosting is not a fair target, as in S3). |
| Reconciliation of ledger vs test transactions, manual check OK | **Met on dev.** Payment `01a1647d-…fd59`: ₦1,100 = ₦880 operator + ₦220 Parkly, Paystack fee ₦16.50 recorded as an expense, journals balanced. |

**Demo** (doc 20 S4): "two phones race for last space → one wins → pays with test card → webhook confirms → QR shown offline in airplane mode." Every step exists on dev.
- The race is proven by the CI test, and on a one-space lot the second driver gets "that time just filled up".
- Paying, the webhook confirmation and the QR were all done on dev.
- The airplane-mode ticket is in the QR ticket PR, waiting to be tested on a phone.

## Decisions

- **ADR 0006 accepted:** slot rows locked in order in `fn_hold_booking`.
- **ADR 0007:**
  - Static QR signed per lot, with no rotating code. Doc 05 §10 now points to it.
  - Short key ids and error correction L keep the code easy to scan.
- **Webhooks are processed inline** before the 200 reply, with the `settle-payments` job as the retry path. The doc 02 §7 queue (pgmq) design is deferred; doc 02 §7 has the interim note.
- **Commission:** the bookings table and the split accept 0–100%, because a SUPER_ADMIN may override the 10–15% rule (doc 02 §2.3).
- **Website booking needs no feature flag:** doc 20 S4 task 8 asks for "the same checkout". The `driver_web_booking_enabled` flag stays unused.

## Carried over and notes

| Item | Reason | New target |
|---|---|---|
| Paid booking and k6 overbooking run on staging | Staging waits for the owner | When staging exists (before S5 sign-off) |
| `supabase migration repair` and CI deploy secrets; S2–S4 migrations were applied by hand on dev | CI secrets not set | Owner, before staging |
| Lot closures and operator pause/resume (moved from S2 to S4) | Not built in S4; needed once attendants run lots | S5 |
| QR key rotation job and revocation list | Delivered with the attendant manifest | S5 |
| Booking confirmation SMS, push and email receipt | Notifications are S6 | S6 |
| Recorded Paystack sandbox fixtures and the adapter contract test in CI | Needs CI secrets (sandbox key) | With the CI secrets |
| Real phone numbers for sign-in (Termii sender ID) | Owner approval pending | When Termii approves |

- **Local API:** two local API runs were stopped during the sprint because the PC was low on memory. Nothing depended on them.
- **Payment emails:** Paystack needs an email address. Phone-only drivers get `driver-<id>@users.parkly.ng`, which Parkly never emails. Decide in S6 whether to ask drivers for an email for receipts.
