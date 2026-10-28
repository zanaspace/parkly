# Parkly — Sprint Gap & Loophole Review

Oct 28, 2026 · @PRODUCTS

Sprints 0 to 5 are broadly sound, but Sprint 6 is not ready to merge. It has 3 Critical and 13 High findings of its own, mostly in money paths and device trust. The worst is the 5-minute test migration (`dd07e2a`). It makes ordinary paid bookings fail to confirm and can stop hold expiry across the platform. Fix the six Wave 1 items before any new sprint work.

| Severity | Count | Examples |
| --- | --- | --- |
| Critical | 4 | Slot range breaks inventory (P-1); extension journals posted twice (P-2); no amount check on extensions (P-3); prod config can't boot (O-1) |
| High | 18 | Token in receipt URLs (S-2); receipt XSS (S-3); attendant can unblock own phone (S-1); self check-in spoofing (G-1); notifications dead in prod (L-1); CI red (T-1) |
| Medium | 35 | Refund ledger gaps, OTP limits, no-show drift, receipts incomplete |
| Low | 27 | Caching, tokens, error codes, hygiene |

**Must fix first:**

1. Restore correct slot ranges and gate the 5-minute stay off in prod (P-1, L-2).
2. Send extension and overstay payments through the shared payment decision (P-2, P-3).
3. Make extension holds exclusive and expiring (P-4, P-5).
4. Remove `?token=` auth and escape receipt HTML (S-2, S-3).
5. Keep blocked attendant phones blocked, with approval per lot (S-1, G-3).
6. Get CI green (T-1).

## Scope and method

This review covers Sprints 0 to 6 of the Phase 1 pilot build, measured against doc 20 (sprint plan), doc 19 (PRD), AGENTS.md non-negotiables and the ADRs. Sprint 6 is reviewed as it stands on branch `feat/s6-driver-directions-contact` (commit `dd07e2a`); it has no sprint report yet.

The code was read in five parallel passes:

| Pass | Areas read |
| --- | --- |
| Security | `apps/api/src/auth`, middleware, auth/me/admin/operators/team/kyb/uploads/webhooks modules, job HMAC, RLS and `security definer` functions in migrations |
| Money | bookings, holds, pricing, Paystack provider, webhooks, ledger, `settle-payments`, QR tickets |
| Gate (S5) | attendant API, offline PWA, sync and conflict rules, self check-in, no-shows, occupancy, pause and hours edits |
| Lifecycle (S6) | extensions, overstay, cancellation, refunds, receipts, notifications, reminder sweep, 5-minute test duration |
| Delivery and ops | S0–S3 scope vs plan, carry-over log, tests per module, CI, jobs, logging, design tokens |

Severity scale:

| Severity | Meaning |
| --- | --- |
| Critical | Loses money, leaks data across tenants or breaks a non-negotiable. Fix before any further sprint work. |
| High | Exploitable or wrong in normal use. Fix in the hardening pass before S7 starts. |
| Medium | Wrong at the edges or missing a required control. Schedule within S7. |
| Low | Hygiene, docs, polish. Batch into S9 hardening. |

Every finding below was checked against the code; anything not confirmed is marked *suspected*.

## Sprint-by-sprint review

S0 to S3 match their plan in code. S4 is solid on the main booking path. S5 works offline but trusts drivers and devices too much. S6 is the weakest: about half its doc 20 tasks are missing or only work in tests. No sprint has passed its "demo on staging" exit criterion, because staging still doesn't exist.

| Sprint | Shipped | Gaps found | Finding IDs |
| --- | --- | --- | --- |
| S0 Foundations | Monorepo, API skeleton, DB, jobs, tokens, CI with RLS, OpenAPI and drift checks | Staging and prod environments, Sentry on clients, Better Stack and Vercel Firewall still open. CI is red on this branch. | T-1, T-2, O-1, O-2 |
| S1 Identity | Driver OTP, email code (ADR 0015), operator and admin password + MFA, RBAC, audit log | Real-number OTP waits for Termii approval. | S-section, O-4 |
| S2 Operators and lots | KYB, lot wizard, admin review and go-live, permit expiry job, team invites; all admin actions audited | The "Go live" button (O-13) and all S2 emails never shipped. The listing gate's SQL is never tested against Postgres. The 12-month verification rule is not enforced in the database. | T-4, O-5, O-6 |
| S3 Discovery | Search, name autocomplete and lot pages, all through one `listable()` gate that meets Never-do #2 | A delisted lot can still show for up to 10 minutes from caches. The SQL gate doesn't require an active rate plan, though the domain rule does. | O-7 |
| S4 Booking and payments | Slot-row locking, holds, Paystack checkout, verified webhooks, balanced ledger, safety-net job, signed QR | Late bank transfers get stuck. Refunds post no reversal journal. The k6 overbooking script was never written. | P-9, P-10, P-12, T-6 |
| S5 Gate and offline PWA | Offline gate, manifest, sync and conflict rules, self check-in, device approval, pause and hours edits | Self check-in spoofing, static codes, cross-lot device approval, wrong no-shows. No monotonic counter or delta sync. No offline e2e test. The report says lot closures are done; they are not. | G-1 to G-14, T-5 |
| S6 Lifecycle (unmerged) | Domain engines, extension table, extend, cancel, overstay-pay and receipt endpoints, client screens | The 5-minute migration breaks inventory. Extension money is double-posted. Notifications don't run in production. No refund webhooks, ops waive, receipt PDF or email, or push registration. No S6 report. | P-1 to P-8, L-1 to L-11 |

### Doc 20 Sprint 6 tasks against the code

| Task | Status |
| --- | --- |
| 1. Extension: availability, incremental payment, manifest update | Partial. Works, but not idempotent and holds never expire (P-2 to P-6) |
| 2. Overstay at checkout, pay link, unpaid block, ops waive | Partial. Charge only; no block, waive or pay link (L-3, L-4) |
| 3. Cancellation policy engine and refund via provider; refund webhooks | Partial. Engine done; refunds can miss and have no webhooks (P-8) |
| 4. No-show job every 5 min | Done in SQL, but wrong while gates are offline (G-4) |
| 5. Receipts: HTML/PDF, email, in-app, private bucket | Partial. HTML only, with an XSS hole (S-2, L-5) |
| 6. Notification service: templates, pgmq queue, retries, SMS fallback, quiet hours | Not working in production (L-1) |
| 7. Reminders 60 min before start, 15 min before end | Not scheduled (L-1) |
| 8. Push token registration in mobile | Not built (L-1) |

## Security and access

The security base is strong. RLS is on all 37 tables, `security definer` functions are locked down, JWTs are verified strictly, and booking IDs can't be enumerated. The holes sit in three places: device trust, the token in the receipt URL, and unescaped receipt HTML. Gate-code and device-approval issues are in the gate section (G-1 to G-3).

### S-1 (High): an attendant can undo a manager's block on their phone

**Where:** `apps/api/src/store/drizzle.ts:451-466` (`devices.upsert` sets `revokedAt: null`), reached from `POST /v1/auth/bootstrap` (`modules/auth/routes.ts:87`) and `POST /v1/me/devices` (`modules/me/routes.ts:118`).

**What's wrong:** driver devices and attendant devices share one `devices` table and the same unique key `(user_id, client_device_id)`. Any role can register its own device.

**Exploit:** a manager blocks a misused attendant phone. The attendant calls `POST /v1/me/devices` with the same device id. `revokedAt` goes back to null, and the manifest and sync work again with no manager action.

**Fix:**

1. Never clear `revoked_at` in `devices.upsert`. Only a manager approval clears it.
2. Move attendant devices to their own `attendant_devices` table, as doc 05 already names it. This also fixes G-3.
3. Add a test: revoke, call `/me/devices`, then sync must return `DEVICE_REVOKED`.

### S-2 (High): the full access token travels in receipt URLs

**Where:** `apps/api/src/auth/context.ts:22-24` accepts `?token=` on every route. `apps/mobile/src/lib/api.ts:288-291` builds `…/receipt?format=html&token=<JWT>` and opens it in the browser. The payload logger prints the query string unsanitised (`middleware/payload-logger.ts:56-58`).

**Impact:** the driver's token lands in browser history, Vercel request logs and Sentry breadcrumbs. Anyone who reads it can call any `/v1` endpoint as that driver for 15 minutes, including cancel and refund.

**Fix:**

1. Remove the query-token fallback from `authenticate`.
2. Add `POST /v1/bookings/{id}/receipt-link`. It returns an HMAC-signed URL for that booking only, valid for 5 minutes, verified only on the receipt route.
3. Sanitise `query` in the payload logger.

### S-3 (High): receipt HTML is not escaped

**Where:** `apps/api/src/modules/bookings/receipt.ts:604-627` inserts `lot.name`, `addressLine`, `area`, plate, driver name and refund reason raw. The web app re-serves it at `apps/web/app/bookings/[id]/receipt/route.ts`, and the web CSP allows inline scripts (`packages/config/next-security-headers.js:8`).

**Exploit:** a lot named `<img src=x onerror=…>` runs script in the web session of every driver who opens a receipt. It must pass admin review first, but nothing in review checks for markup.

**Fix:**

1. Add an `escapeHtml()` helper and use it for every inserted value.
2. Serve receipts with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`. This also fixes the API's current CSP, which blocks the receipt's own styles on mobile.
3. Reject `<` and `>` in lot names in `contracts/lots.ts:30`.
4. Add a snapshot test with hostile input.

### S-4 (Medium): OTP controls are weaker than doc 05 requires

**Where:** `supabase/config.toml:213,239`. Hosted dashboard values still need checking.

**What's wrong:**

- Email codes last 3,600 seconds; doc 05 says 300.
- Verify attempts are limited only per IP (30 per 5 minutes). Doc 05 asks for 5 failures per phone per 15 minutes.
- Anyone can use up a victim's 10 daily code sends, which locks them out for 24 hours.

**Fix:**

1. Set `otp_expiry = 300`.
2. Add Turnstile captcha on code send.
3. Add a per-phone failed-verify counter.
4. Key send limits on phone plus IP, with a higher global cap per phone.

### S-5 (Medium): admin and step-up rules from doc 05 are missing

- There is no IP allowlist on `/v1/admin/*`.
- Payout-account changes and four-eyes approvals don't require a fresh MFA check. `Identity` doesn't carry `iat` or `amr` (`auth/token.ts:52-58`).
- The token hook doesn't restrict admin claims to the company email domain.

Payout edits are locked after KYB submit, which limits the risk today.

**Fix:** expose `iat` and `amr` on `Identity`. Add `requireFreshAal2(c, 300)` and admin IP-allowlist middleware. Check the email domain in the hook.

### Low

| ID | Finding | Fix |
| --- | --- | --- |
| S-6 | The job request's `x-parkly-job-id` is not signed (`jobs/signature.ts:9-14`), so a captured request can be replayed within 5 minutes under a new id. Jobs are idempotent, so the impact is extra load. | Sign `timestamp.id.body` in `signJobRequest` and `fn_invoke_job`. |
| S-7 | The Send-SMS hook doesn't dedupe on `webhook-id`, so a replay re-sends the SMS. | Pass it through `replayGuard.firstSeen`. |
| S-8 | A revoked session keeps working for up to 15 minutes, because the API only checks the JWT signature. | Check the session id against revoked devices in `loadActor`, cached briefly. |
| S-9 | Own-scope rules skip MFA, so owners and admins at aal1 can edit their profile and create operators (`domain/authz.ts:43-47,125-129`). | Apply the `AAL2_ROLES` check in the own-scope branch. |
| S-10 | Audit rows are written after the action and outside its transaction (`lib/audit.ts`). A failed insert leaves a privileged change unaudited (Never-do #3). The auto-approval of a manager's own device isn't audited. | Write the audit row in the same transaction. Audit the auto-approval. |
| S-11 | The RBAC matrix (`test/rbac-matrix.spec.ts`) has no rows for S5 and S6 endpoints, team, rate plans, photos, permits or admin status changes. | Add a row per endpoint, with a cross-tenant case for each. |
| S-12 | Account deletion still has `TODO(S4)` (`me/routes.ts:145`). A driver with an active booking or unpaid overstay can request deletion. | Block deletion while a booking is active or an overstay is unpaid. |
| S-13 | *Suspected:* signed upload URLs don't set `upsert: false` (`providers/supabase-storage.ts:44`), so a verified PDF may be replaceable while the URL is valid. | Pass `upsert: false` and re-hash on admin download. |
| S-14 | Client IP comes from the first `x-forwarded-for` entry (`middleware/rate-limit.ts:56`). This is safe on Vercel only. | Use `x-vercel-forwarded-for` or `x-real-ip`. |

**Done well:** ES256-only JWT checks with issuer, audience and expiry; roles re-read from the database on every request; deny-by-default authorisation with MFA for owner, manager and admin; 404 on cross-tenant reads; RLS and locked-down SQL functions everywhere; HMAC-checked Paystack webhooks with an IP allowlist and dedupe; hashed 256-bit invite tokens; strict upload handling; and a config that refuses fake providers in prod.

## Booking, payments, extensions and overstay

The Sprint 4 booking path is sound. The Sprint 6 add-ons are the problem. Extensions, overstay and cancellation refunds bypass the shared payment decision (`confirmDecision`). The 5-minute test migration also breaks inventory for ordinary bookings. Three findings are Critical.

### P-1 (Critical): the 5-minute test migration breaks slot moves for every booking

**Where:** `supabase/migrations/20261027003000_allow_5min_test_booking.sql` lines 66, 72, 80 (`fn_hold_booking`) and 125–130 (`fn_move_booking_slots`).

**What's wrong:** hold and move now lock `slot_start < end_at + interval '10 minutes'`, but the seed and the slot count still use `[start_at, end_at)`. A 10:00–11:00 booking also touches the 11:00 row whenever that row exists, which it does in any busy lot. `fn_move_booking_slots` then sees 5 rows moved against `ceil(duration/900) = 4` and raises.

**Impact:**

- A paid booking fails at `fn_convert_hold`. The webhook retries 5 times and fails each time, so the driver is charged and the booking stays `PENDING_PAYMENT`.
- `fn_expire_holds` runs in one transaction, so one failing booking stops hold expiry for the whole platform.
- Cancel and no-show release fail the same way.
- Holds also block the next slot, so drivers see `BOOKING_SLOT_UNAVAILABLE` when the slot is actually free.

**Fix:**

1. Write a new forward migration that restores `[start_at, end_at)` in `fn_hold_booking`, `fn_move_booking_slots`, `fn_reacquire_booking` and `fn_hold_extension`.
2. For a sub-15-minute booking, lock exactly `ceil(duration/900)` rows starting at the slot that contains `start_at`. Never extend past `end_at`.
3. Add a store test with back-to-back bookings (10:00–11:00 then 11:00–12:00), and assert that hold, move and release touch the same number of rows.
4. Make `fn_expire_holds` process each booking in its own sub-block (`begin … exception … end`), so one bad row can't stop the sweep.

### P-2 (Critical): extension and overstay payments post ledger journals twice

**Where:** `apps/api/src/store/drizzle-bookings.ts:560-658`; `postJournal` at `:141`.

**What's wrong:** the `EXTENSION` and `OVERSTAY` branches never check whether the payment is already `SUCCEEDED`. Verify posts the journals, then the `charge.success` webhook (`webhooks/routes.ts:124`) posts them again. The retry job can post them a third time.

**Impact:** operator payable and revenue are inflated, which overpays operators at the S7 payout.

**Fix:**

1. Send every payment kind through `confirmDecision`, under the same payment-row lock, and return `NOOP` when the payment is already settled.
2. Add a unique constraint on `ledger_journals (payment_id, journal_kind)` as a database backstop.
3. Add a test that settles the same extension payment twice (verify, then webhook) and asserts one journal.

### P-3 (Critical): extension and overstay skip the amount and currency check

**Where:** the same branches, `drizzle-bookings.ts:560-616`. Compare `payment.ts:97`.

**What's wrong:** any Paystack `success` confirms the extension or marks the overstay paid. Nothing compares `charge.amountKobo` with `payment.amountKobo` or checks `NGN`.

**Fix:** covered by P-2. The shared decision function checks amount and currency. A mismatch becomes `AMOUNT_MISMATCH` and an automatic refund.

### P-4 (High): extension holds never expire and can lock a lot

**Where:** `apps/api/src/modules/bookings/routes.ts:593-770`; `20261026210100_lifecycle_functions.sql:4-90`.

**What's wrong:**

- `fn_expire_holds` only expires bookings. An extension left in `PENDING_PAYMENT` keeps `held + 1` forever.
- A failed Paystack initialize does not release the hold. Create-booking does release at `:404`.
- There is no limit on pending extensions per booking and no `Idempotency-Key`.

**Exploit:** a driver with one confirmed booking calls `POST /bookings/{id}/extensions` repeatedly. Each call holds the same slots until the lot shows full to everyone.

**Fix:**

1. Add `hold_expires_at` to `booking_extensions` and expire those holds in `fn_expire_holds`.
2. Add a partial unique index that allows one `PENDING_PAYMENT` extension per booking.
3. Release the hold when checkout initialize fails.
4. Require `Idempotency-Key`.

### P-5 (High): two extensions can both confirm, or a cancelled booking can be extended

**Where:** `fn_confirm_extension`, `lifecycle_functions.sql:92-160`.

**What's wrong:** the function never locks the booking or checks that `ext.start_at = booking.end_at`, or that the booking is still `CONFIRMED` or `CHECKED_IN`.

**Fix:** lock the booking row first. Require a matching `start_at` and a live status. If either check fails, release the hold and refund the payment.

### P-6 (High): an extension that is still processing is marked failed, so a later payment buys nothing

**Where:** `drizzle-bookings.ts:604-611`.

**What's wrong:** any non-`success` status (`ongoing`, `pending`, `abandoned`) marks the payment `FAILED` right away. If success arrives later, the code still charges and posts journals. But the extension is no longer pending, so it is never applied and nothing is refunded.

**Fix:** treat non-terminal statuses as `WAIT`. When a success can't be applied, refund it.

### P-7 (High): overstay can be paid twice

**Where:** `routes.ts:886-928`; `fn_mark_overstay_paid` (`lifecycle_functions.sql:214`).

**What's wrong:** every call while the session is `DUE` creates a new `OVERSTAY` payment. `fn_mark_overstay_paid` checks neither status nor amount, so two tabs mean two charges.

**Fix:** add a partial unique index allowing one open overstay payment per session. Require an `Idempotency-Key`. In SQL, require `overstay_status = 'DUE'` and a matching amount; otherwise refund.

### P-8 (High): cancellation refunds can hit the wrong payment and are never retried

**Where:** `routes.ts:833-840`; `drizzle-bookings.ts:404-409`; `settle.ts:23`.

**What's wrong:**

- After an extension, `total_kobo` includes the extension. The refund for that total is sent against a single payment. The route picks `latestForBooking`, which can be a failed attempt, while the store picks the latest successful one. The refund can exceed that charge, so Paystack rejects it.
- No job retries refunds stuck in `PENDING` with no provider id. There is no `refund.processed` webhook handler.
- Payment status never moves to `REFUNDED` or `PARTIALLY_REFUNDED`, and nothing enforces "refunds ≤ payment".

**Fix:**

1. Split the refund across the booking's successful payments, newest first, each capped at its amount. Use the payment chosen inside the transaction.
2. Add a `retry-refunds` job (`pg_cron` every 10 min, chunked) and handle `refund.processed` and `refund.failed` webhooks.
3. Call `statusAfterRefund`. Add a trigger that rejects refunds whose sum exceeds the payment.

### Medium and Low

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| P-9 | Medium | Late bank transfers get stuck. `fn_expire_holds` marks payments `ABANDONED` at 30 min without asking Paystack, while the safety net only scans 2–35 min (`settle-payments.ts:148`). `NEEDS_REVIEW` and `AMOUNT_MISMATCH` keep the money with only a log line. | Verify with Paystack before abandoning. Write an incident row, and refund `NEEDS_REVIEW` and mismatch charges automatically. |
| P-10 | Medium | Late payment can give one car two overlapping bookings. `fn_reacquire_booking` does not re-check vehicle overlap or that the lot is `LIVE`. | Add both checks to reacquire. Return false so the payment is refunded. |
| P-11 | Medium | Extensions can be backdated. `validateExtensionWindow` (`packages/domain/src/booking/extension.ts:35`) ignores `now`, so an overstaying driver extends over past time at the normal rate. | Require `currentEndAt > now - grace`. Past time is billed as overstay. |
| P-12 | Medium | Refunds after hold expiry or cancellation post no reversal journal (`settle-plan.ts:86-96`), so the operator's payable keeps money returned to the driver. | Post a refund reversal journal and recover the operator share from the next payout (S7). |
| P-13 | Medium | Extension, cancel, overstay-pay and verify take no `Idempotency-Key` (AGENTS.md §5). | Reuse the create-booking idempotency middleware on all four. |
| P-14 | Low | The extension price is today's rate minus the original `price_kobo`. After a price cut, an extension can cost zero and auto-confirm. | Price the extension window on its own, with a floor of the minimum unit price. |
| P-15 | Low | A cancelled booking's QR keeps working offline until the gate syncs. The signing-key cache (`qr-tickets.ts:20`) never expires, so a revoked key keeps signing on warm instances. | Add a 5-minute TTL to the key cache and push cancellations in the next manifest delta. |
| P-16 | Low | Cancel policy is computed from a booking row read before the transaction. | Re-read the booking under the lock inside `fn_cancel_booking`. |

**Done well:** ordered slot-row locking with a capacity CHECK backstop; amount and currency checks plus reacquire-or-refund on the main booking path; HMAC-verified, deduplicated webhooks followed by a server verify; integer kobo pricing on the server only; a balanced, append-only ledger; per-lot Ed25519 QR keys; and a chunked safety-net job.

## Gate, check-in and offline sync (Sprint 5)

The offline gate works, but trust at the gate is weak. Driver self check-in trusts the phone's GPS. The poster and attendant codes are static. A phone's approval carries over to another operator's lot. The result is that overstay fees can be dodged and no-shows can be marked wrongly.

### G-1 (High): drivers can self check in or out from anywhere

**Where:** `apps/api/src/modules/attend/routes.ts:376,406,424`; `packages/domain/src/checkin/checkin.ts:219-295`; `packages/contracts/src/attend.ts:119-125`.

**What's wrong:** the poster QR is just `PKG1.<lotId>`, and the lot id is in every booking. The geofence uses whatever `lat` and `lng` the client sends, and the lot's coordinates are public on the lot page.

**Exploit:** an overstaying driver calls `POST /bookings/{id}/self-check-out` from home with the lot's coordinates. Check-out is stamped "now", so no overstay is charged while the car stays parked. Self check-in from home also stops the booking becoming a no-show.

**Fix:**

1. Replace the static code with a rotating one: `PKG1.<lotId>.<minuteBucket>.<hmac>`, signed with a per-lot secret, shown on the attendant phone or a cheap display. Printed posters carry a per-lot secret that ops can rotate and that is never sent to driver apps.
2. Allow self check-out only when no overstay is due. Otherwise send the driver to pay or to the attendant.
3. On mobile, reject mocked locations (`pos.mocked`) and require GPS accuracy within the geofence radius.
4. Flag every self event in `sessions.flags` (`SELF_UNVERIFIED`) so the S7 dashboard can show them.
5. Rate-limit both self-check endpoints.

### G-2 (High): the attendant barcode bypasses the owner's "self check-in off" switch

**Where:** `checkin.ts:227,292-293`; `attend/routes.ts:420`; shown at `apps/portal/components/attend/attend-app.tsx:614,621` (commit `4c0e111`).

**What's wrong:** a `PKGA.<lotId>` code skips the `enabled` check. It can be derived from the lot id and is printed as text on the attendant screen. Any driver can type it, even when the owner turned self check-in off.

**Fix:** make it a short-lived signed token, `PKGA.<lotId>.<exp>.<sig>`, using a key from the manifest with a TTL of about 60 seconds. The server verifies it and records which device showed it. Stop showing the raw text.

### G-3 (High): a phone approved at one lot is auto-approved at another

**Where:** `apps/api/src/store/drizzle-attend.ts:68-93` (`registerDevice`).

**What's wrong:** on re-registration the upsert overwrites `lot_id` and `operator_id` but keeps `approved_at`. A phone approved at lot A (operator X) registers for lot B (operator Y) and is approved there without Y's manager seeing it. This is a cross-tenant gap.

**Fix:** when `lot_id` or `operator_id` changes, clear `approved_at` and `approved_by` unless the caller is a manager of the new lot. Better: key devices by `(user_id, client_device_id, lot_id)`. Add a cross-tenant test.

### G-4 (High): no-shows are marked while the car is inside, and rebooking skews inventory

**Where:** `supabase/migrations/20261023090100_checkin_grants_no_show.sql:30-66` (`fn_mark_no_shows`) and `:71-114` (`fn_rebook_no_show`).

**What's wrong:**

- The job marks no-shows at start + 30 minutes even when the lot's gate phone is offline with unsynced check-ins. The space is released and resold.
- When the check-in syncs, `fn_rebook_no_show` re-books from the arrival time, but the job only released from the job time. The slots in between are booked twice.
- Past slots also count toward the capacity check, so the rebook can fail with `NO_CAPACITY`, leaving a `NO_SHOW` booking with an open session.
- Lots with no attendant and self check-in off turn every booking into a no-show.

**Fix:**

1. Skip lots whose approved devices last synced before start + 30 minutes. Recheck them on the next run.
2. Store `no_show_released_from` on the booking. Rebook from `greatest(no_show_released_from, now())` and ignore past slots in both the increment and the capacity check.
3. Don't mark no-shows on lots with no check-in channel.

### Medium and Low

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| G-5 | Medium | Offline event times are trusted within 48 h (`checkin.ts:150-166`, `attend-plan.ts:64-69`). An attendant can backdate a check-out to wipe an overstay and take cash. Future times and check-out before check-in are accepted. | Reject times after `receivedAt + skew`. Flag check-out before check-in and check-outs far from the batch send time. Add the per-device monotonic counter doc 20 asks for. |
| G-6 | Medium | Blocking a phone throws `DEVICE_REVOKED` before storing its batch, and the client then wipes it (`attend-app.tsx:90-93`). Real check-ins are lost and those cars become no-shows. | Store the revoked device's batch as `REJECTED / DEVICE_REVOKED` for ops review, then tell the client to wipe. |
| G-7 | Medium | Removing an attendant doesn't wipe the phone: it gets 401 or `LOT_NOT_FOUND`, not `DEVICE_REVOKED`. The cached manifest stays and the PIN still opens it offline. | Check the device before role scoping. Wipe on 401 or 404 from sync. Block gate use once the manifest is older than 24 h. |
| G-8 | Medium | After a sync the queue empties, but the manifest refreshes only every 5 minutes. A screenshot of the same QR shows green for a second car (`apps/portal/lib/attend/gate.ts:45-57`). | Keep a per-shift local log of synced check-ins, or refresh the manifest right after each sync. |
| G-9 | Medium | Occupancy drifts. Sessions never checked out count as parked forever, and walk-ins have no reset (`drizzle-attend.ts:226-233,354-392`). | Nightly job that closes stale sessions with a flag and reconciles walk-ins. Warn when parked + walk-ins exceeds capacity. |
| G-10 | Medium | The opening-hours edit checks bookings, then writes, with no lock (`lots/routes.ts:414-449`). It ignores `NO_SHOW` bookings, and the audit row lacks before/after values. | One transaction with the lot row locked. Include `NO_SHOW`. Audit before and after. |
| G-11 | Low | `client_event_id` is unique across all devices, so a reused id from another device turns a real event into `DUPLICATE`. | Scope uniqueness to `(device_id, client_event_id)`. |
| G-12 | Low | `fn_mark_no_shows` is not granted to `parkly_api`, so the API job always fails and the error is swallowed (`jobs/mark-no-shows.ts:18-21`). pg\_cron does the real work. | Grant it or delete the API job, and rethrow errors. |
| G-13 | Low | The manifest is capped at 5,000 rows with no flag (`drizzle-attend.ts:148`). A 500-event sync runs one transaction per event and may time out. | Return `truncated: true` and page the manifest. Chunk sync within the time limit. |
| G-14 | Low | The service worker is network-first with no timeout (`public/attend-sw.js:49`), so on 2G the offline page can hang. | Add a 3-second network timeout, then fall back to cache. |

**Done well:** one pure gate-decision function shared by the PWA and the server; explicit conflict rules; per-event transactions with row locks; append-only `checkin_events`; minimal PII in the manifest; PIN lock with wipe after 5 bad PINs; and offline QR checks against revoked key ids.

## Sprint 6 lifecycle: what is missing or not wired

Sprint 6 looks done in the UI, but several parts only work against the in-memory test store. Reminders and push never fire in production. Overstay pricing from ADR 0016 is not connected. The 5-minute test stay ships to drivers. Together with P-1 to P-8 above, Sprint 6 is not ready to merge to `main`.

### L-1 (High): notifications and reminders do nothing in production

**Where:** `apps/api/src/jobs/reminder-sweep.ts:21-26`; `apps/api/src/notifications/service.ts:54-57`.

**What's wrong:**

- The sweep reads `store.booking.bookingRows`, which exists only on the memory store. With the real Drizzle store the list is empty, so no reminder is ever sent.
- Push tokens are read from in-memory `deviceRows` only.
- Deduplication is an in-process `Set`, which is lost on every serverless call.
- There is no `pg_cron` schedule, no `pgmq` queue, no retry or backoff, no delivery status and no quiet hours.
- Only the sweep calls `dispatch`. Booking confirmed, cancelled, extended and overstay-due events send nothing.
- The start reminder fires 25–45 minutes before start; doc 20 says 60.

**Fix (doc 20 S6 task 6, as specified):**

1. Add a `notifications` table (RLS on) with a unique `(booking_id, event_key)` for idempotency, plus `status`, `attempts`, `next_attempt_at` and `channel`.
2. Add store queries for due reminders and push tokens. Remove every `as unknown as` cast to the memory store.
3. Enqueue into a `pgmq` `notifications` queue from each lifecycle event. Drain it with a `pg_cron` → `/internal/jobs/notifications` job, chunked, with retries and backoff.
4. Add SMS fallback for critical events, and quiet hours (22:00–07:00 Lagos) for non-critical ones.
5. Schedule `sweep-reminders` every 5 minutes for 60 minutes before start and 15 minutes before end.
6. Register push tokens from the mobile app (doc 20 S6 task 8).

### L-2 (High): the 5-minute test stay ships to production

**Where:** commit `dd07e2a`: `discovery.ts` `DURATIONS`, `packages/domain/src/pricing/quote.ts:164-182`, `availability.ts:65-80`, `extension.ts:56-60`, and the web and mobile pickers.

**What's wrong:**

- There is no env or feature flag, so drivers see "5 min (Test)".
- It skips the operator's minimum stay, lead time, 30-day max advance and the 15-minute slot grid.
- It is priced as a 15-minute block the operator never approved.
- The screen shows overstay after 1 minute of grace (`routes.ts:200`), but check-out charges after 10 (`attend/routes.ts:88`).
- Extending a 5-minute stay fails in SQL but passes in the memory store, so tests stay green while production breaks.

**Fix:** put it behind a `testing.shortStays` flag that the env schema forces off in prod, in domain, API and SQL alike. Or revert it and test overstay with a fake clock instead. Fix P-1 at the same time.

### L-3 (Medium): ADR 0016 overstay pricing is not wired in

`calculateOverstay` and `validateOverstayRatePlan` in `packages/domain/src/booking/overstay.ts` are used only by their own tests. There is no operator overstay price column, and `overstay_max_multiplier` is not enforced. Check-out prices overstay with the lot's current rate plan, not the booking's `rate_plan_id`.

**Fix:** add `overstay_rate_kobo` to `rate_plans` with a CHECK against the Parkly maximum, then call `calculateOverstay` at check-out using the booking's own rate plan. Do the same for extension pricing (P-14).

### L-4 (Medium): unpaid overstay never blocks anything (FR-BOOK-008)

- `createBooking` never checks for an unpaid overstay.
- Nothing sets `UNPAID` or `WAIVED`, and there is no ops waive endpoint.
- No pay link is sent by SMS or push.
- `setOverstay` (`drizzle-attend.ts:405`) overwrites the status to `DUE` with no guard. A re-synced check-out may reset `PAID` to `DUE` (*suspected*).

**Fix:**

1. Move `DUE` to `UNPAID` after 24 hours with a job.
2. Reject new bookings with `OVERSTAY_UNPAID` while any session is `UNPAID`.
3. Add `POST /admin/sessions/:id/overstay/waive` with a reason and an audit row.
4. Guard `setOverstay` so it never goes backwards from `PAID` or `WAIVED`.
5. Send the pay link through the notification queue (L-1).

### L-5 (Medium): receipts don't meet FR-BOOK-009

- No permit number, VAT note or receipt number.
- The receipt is not stored, so `issuedAt` changes on every view.
- After an extension, line items don't add up to `total_kobo`.
- Pending refunds are shown as refunded.
- No PDF, no Resend email and no private Storage bucket.

**Fix:** add a `receipts` table with a sequential number per operator and a frozen JSON snapshot. Render the HTML and PDF from the snapshot, store the PDF in a private bucket, and email it through the email provider interface. Add `receipts` to doc 06 retention.

### Smaller Sprint 6 items

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| L-6 | Medium | `fn_hold_extension` doesn't check the same car's next booking, or the lot's permit and verification. | Add the vehicle-overlap and lot-listable checks. |
| L-7 | Medium | `fn_mark_overstay_paid` and `fn_confirm_extension` don't check that the payment belongs to this booking and succeeded. | Pass the payment id and check `booking_id`, `kind` and `status` in SQL. |
| L-8 | Low | A full lot returns `BOOKING_SLOT_UNAVAILABLE`; the PRD expects `BOOKING_EXTENSION_UNAVAILABLE`. | Map the error in the extension route. |
| L-9 | Low | `booking:update:own` is defined but unused; mutations authorise with `booking:read:own`. | Use the update permission on all mutating booking routes. |
| L-10 | Low | The web cancel modal hard-codes "30 minutes". There is no extension quote endpoint, so clients don't show the price before paying. | Read the window from the API. Add `GET /bookings/{id}/extensions/quote`. |
| L-11 | Low | An admin refund override can exceed `total_kobo` (`cancellation.ts:369`). | Cap it at the amount paid. |

## Client UX (web, mobile, attendant app)

The client gaps are small next to the server ones, but several of them show drivers wrong prices or wrong status. All prices still come from the server, so Never-do #8 holds.

| ID | Severity | Where | Gap | Fix |
| --- | --- | --- | --- | --- |
| U-1 | High | Web and mobile duration pickers | "5 min (Test)" is offered to real drivers (L-2). | Hide it unless the API's config says test stays are on. |
| U-2 | Medium | Booking details on web and mobile | The overstay shown uses 1 minute of grace (`bookings/routes.ts:200`), but check-out charges after 10 (`attend/routes.ts:88`), so drivers see a charge that never comes, or a different amount. | Use one grace value from lot config, returned by the API with the booking. |
| U-3 | Medium | Extend sheet | There is no extension quote endpoint, so drivers don't see the price before Paystack opens. | Add `GET /bookings/{id}/extensions/quote` and show its price on each option. |
| U-4 | Medium | Web cancel modal | "30 minutes" is hard-coded instead of read from the policy. | Return the free-cancel deadline and refund amount from the API and show them. |
| U-5 | Medium | Mobile receipt | Opens in the browser with the token in the URL (S-2). The API's CSP also strips the receipt's styles, so it renders unstyled. | Use the signed receipt link, served with a CSP that allows inline styles. |
| U-6 | Medium | Mobile app | No push token registration, so push can't work even after L-1 is fixed. | Register the Expo push token after sign-in through `POST /v1/me/devices`. |
| U-7 | Medium | Attendant app (`attend-app.tsx:95-97`) | A 401 during a shift shows the signed-out screen and stops the offline gate until reload. | Keep the gate running on cached data and show a "sign in again" banner. |
| U-8 | Medium | Attendant app (`attend-app.tsx:402,646`) | A manifest older than 24 h only shows a banner and the gate keeps going. | Block scanning past 24 h plus a margin, with a clear "connect to refresh" state. |
| U-9 | Low | Attendant screen (`attend-app.tsx:614,621`) | The `PKGA` code is shown as plain text that drivers can copy (G-2). | Show only the rotating QR. |
| U-10 | Low | Driver self check-in on mobile | Mocked GPS is accepted (G-1). | Reject `pos.mocked` and low-accuracy fixes. |
| U-11 | Low | Web, portal, admin, mobile | About 27 hex colours, 30 `px` values and 72 numeric RN styles bypass tokens (O-9). | Replace with tokens; add a lint rule. |
| U-12 | Low | Mobile and web | Unpaid overstay doesn't block or warn at checkout (L-4). | Show the unpaid amount and a pay button before a new booking. |

## Testing and operations

CI would be red on this branch, at four steps. Unit tests pass (about 1,600 across the workspace), but the in-memory store hides several production bugs, and the production config cannot boot today.

### Local results on `feat/s6-driver-directions-contact`

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass, 17/17 tasks |
| `pnpm lint` | **Fail**, 7 errors: unused vars in domain `cancellation`, `extension`, `overstay`; a non-null assertion in `booking-lifecycle.tsx:154`; an unused import in mobile `booking/[id].tsx`; a `void` type in mobile `api.ts:300` |
| `pnpm format:check` | **Fail**, 77 files |
| `pnpm test` | Pass. Domain 488, API 722 (branch coverage 85.44% against an 85% threshold), others 393 |
| `pnpm test:integration` | Not run; needs local Supabase |
| `pnpm audit --audit-level high` | **Fail**, 7 high (dev-only: style-dictionary, `@expo/cli`, jsdom/undici) |
| OpenAPI drift | **Fail**: `openapi.json` lacks receipt, extensions, cancel and overstay routes |

### Findings

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| O-1 | Critical (launch) | The prod config can never pass validation. `env.ts:53` allows only `MALWARE_SCANNER=fake`, and `env.ts:89` refuses `fake` in prod. ADR 0013 is still Proposed. | Choose the scanner vendor, accept ADR 0013, add the adapter and enum value. |
| T-1 | High | CI is red at lint, format, audit and OpenAPI. | Fix the 7 lint errors, run Prettier, run `pnpm contracts:openapi`. Upgrade the flagged packages or record time-boxed audit exceptions; never disable the step (Never-do #9). |
| T-2 | High | The memory store differs from Postgres, so tests pass while production fails (P-1, L-1, L-2). | Every store method used in a lifecycle path gets a `store-contract` case run against both stores. Ban `as unknown as` casts to the memory store in `src/`. |
| T-3 | Medium | No other-driver tests for cancel, extensions, overstay-pay or receipt; the RBAC matrix marks them `COVERED_ELSEWHERE` (`rbac-matrix.spec.ts:214-287`). | Add allowed-role, denied-role and cross-tenant cases for each (AGENTS.md §3). |
| T-4 | High | The SQL listing gate (`drizzle.ts:264`) is tested only through the memory store. | Store-contract cases: expired permit, permit expiring today, stale verification, operator not active, paused and suspended lots. |
| T-5 | Medium | No Playwright offline e2e, no 8-hour fake-clock test and no QR tamper test in attend. | Add them as doc 20 S5 lists. Add an e2e job to CI. |
| T-6 | Medium | No k6 overbooking script exists, only `tests/load/search.js`. | Write `tests/load/booking-race.js` for staging. |
| T-7 | Medium | No spec files for webhooks, health, `mark-no-shows` or `settle-payments`. Only one integration test file. | Add webhook replay, out-of-order and bad-signature tests. Add job tests with a fake clock. |
| O-2 | Medium | Sentry is optional even in prod, there is no `captureException`, and no client has a Sentry SDK. `mark-no-shows` swallows its errors. | Require `SENTRY_DSN` in staging and prod. Add the SDK to web, portal, admin and mobile. Rethrow job errors. |
| O-3 | Medium | Log redaction (`lib/logger.ts:16-26`) misses plate, permit number, SMS recipient, API keys, signatures and QR tokens, and only goes 2 levels deep. | Extend it per doc 06 and add a logger test per field. |
| O-4 | Medium | Email is `logOnlyEmail` in every environment (`bootstrap.ts:149`). SMS and push are fakes in jobs (`registry.ts:28-35`). | Add the email provider adapter and env config. Pass real providers into `createJobs`. |
| O-5 | Medium | The S5 report says lot closures are done. The `lot_closures` table exists but no code reads it, so availability ignores closures. | Correct the report, log it in doc 20 §6, and build closures into availability. |
| O-6 | Medium | `verification_records.valid_until` has no CHECK, so a manual fix could list a lot on an old verification. | Add a CHECK tying it to inspection date + 12 months. |
| O-7 | Low | Delisted lots stay in caches for up to 10 minutes (`places/routes.ts:78`, `discovery/routes.ts:284`). | Shorter TTLs or purge on status change. |
| O-8 | Medium | No retention jobs are scheduled (doc 06, doc 17). | Schedule them in S8 as planned, but track them now. |
| O-9 | Low | About 27 raw hex colours, 30 raw `px` values and 72 numeric RN style values in app components. | Replace with tokens and add a lint rule against hex and px literals in `apps/*`. |
| O-10 | Low | `LOG_PAYLOADS` uses `z.coerce.boolean()`, so `"false"` becomes true. | Use an explicit \`'true' |

### Carry-over still open

| Item | From | Blocks |
| --- | --- | --- |
| Staging and prod environments; every staging demo | S0 | All exit criteria |
| CI deploy secrets and `supabase migration repair`; S2–S4 migrations were applied by hand on dev | S2 | Trustworthy migration history |
| Sentry, Better Stack, Vercel Firewall, admin IP allowlist | S0 | Launch |
| Termii sender ID and real-number OTP | S1 | Real drivers signing in |
| Recorded Paystack fixtures and adapter contract test in CI | S4 | Payment confidence |
| Email provider for permit, KYB and receipt emails | S2 | S6 receipts |
| Operator "Go live" button and email | S2 | Operator self-service |
| Lot closures | S2 | Holiday and event days |
| Device field test on a 2 GB Android 8 phone | S5 | S10 launch |

## Prioritized fix plan

The fixes run in four waves. Waves 1 and 2 must land before Sprint 6 merges to `main`. Wave 3 is the hardening pass before Sprint 7 starts. Wave 4 folds into S7 to S9. Each work item is one branch and one PR, tests first (AGENTS.md §3).

### Wave 1: stop money and inventory damage (before anything else)

| # | Work item | Findings | Main files | Done when |
| --- | --- | --- | --- | --- |
| 1 | `fix/s6-slot-range`: restore `[start_at, end_at)` slot ranges; per-booking error isolation in `fn_expire_holds` | P-1 | new migration replacing `20261027003000`; `fn_hold_booking`, `fn_move_booking_slots`, `fn_reacquire_booking`, `fn_hold_extension`, `fn_expire_holds` | Back-to-back bookings 10:00–11:00 and 11:00–12:00 both hold, convert and release on Postgres. One broken row doesn't stop the sweep. |
| 2 | `fix/s6-test-stays-flag`: gate the 5-minute stay behind `testing.shortStays`, forced off in prod | L-2, U-1, P-11 | `packages/domain` quote, availability, extension; `discovery.ts`; `config/env.ts`; web and mobile pickers | Prod config rejects the flag. Drivers don't see the option when it's off. |
| 3 | `fix/s6-settle-decision`: route extension and overstay payments through `confirmDecision`; unique journal per payment | P-2, P-3, P-6, L-7 | `store/drizzle-bookings.ts`, `bookings/payment.ts`, new ledger constraint migration | Verify then webhook posts one journal. A short payment becomes `AMOUNT_MISMATCH` and is refunded. A pending status waits. |
| 4 | `fix/s6-extension-holds`: one pending extension per booking, hold expiry, release on failure, confirm checks | P-4, P-5, L-6 | `booking_extensions` migration, `lifecycle_functions.sql`, `bookings/routes.ts` | Ten parallel extension requests leave one hold. An abandoned extension frees its slots in 15 minutes. A paid extension on a cancelled booking is refunded. |
| 5 | `fix/s6-idempotency`: `Idempotency-Key` on extensions, cancel, overstay-pay and verify; one open overstay payment per session | P-7, P-13 | `bookings/routes.ts`, overstay payment migration | Two taps on "Pay overstay" give one checkout. |
| 6 | `fix/s6-refunds`: split refunds across payments, retry job, refund webhooks, reversal journals, sum-of-refunds trigger | P-8, P-9, P-12, L-11 | `bookings/routes.ts`, `drizzle-bookings.ts`, `settle-plan.ts`, `webhooks/routes.ts`, new `retry-refunds` job | Cancelling an extended booking refunds each charge in full. `refund.processed` marks the payment `REFUNDED`. Ledger operator payable goes back to zero. |

### Wave 2: close the security holes

| # | Work item | Findings | Main files | Done when |
| --- | --- | --- | --- | --- |
| 7 | `fix/receipt-link`: drop `?token=`, add signed receipt link, escape receipt HTML, strict CSP | S-2, S-3, U-5 | `auth/context.ts`, `bookings/receipt.ts`, `apps/web/.../receipt/route.ts`, mobile `api.ts`, `payload-logger.ts` | A request with `?token=` is 401 on every route. A lot named `<script>` renders as text. Mobile receipt is styled. |
| 8 | `fix/attendant-devices`: separate `attendant_devices` table; approval per lot; revoked devices stay revoked | S-1, G-3, G-6, G-7 | new migration, `store/drizzle.ts`, `store/drizzle-attend.ts`, `attend/routes.ts`, `attend-app.tsx` | Revoke then `/me/devices` still syncs as `DEVICE_REVOKED`. Approval at lot A gives nothing at lot B. A revoked phone's batch is kept for review. |
| 9 | `fix/gate-codes`: rotating signed poster and attendant codes; no self check-out while overstay is due; mocked-GPS rejection; rate limits | G-1, G-2, U-9, U-10 | `packages/domain/src/checkin`, `attend/routes.ts`, `contracts/attend.ts`, `attend-app.tsx`, mobile self check-in | A `PKG1.<lotId>` or `PKGA.<lotId>` code alone is rejected. An overstaying driver can't self check out. |
| 10 | `fix/otp-hardening`: 300 s expiry, captcha on send, per-phone verify counter, phone+IP send limits | S-4 | `supabase/config.toml`, hosted Auth settings, send-SMS hook | Six wrong codes in 15 minutes lock that phone's verify for 15 minutes. |

### Wave 3: make Sprint 6 actually work, and get CI green

| # | Work item | Findings | Done when |
| --- | --- | --- | --- |
| 11 | `chore/ci-green`: lint, Prettier, OpenAPI regen, audit upgrades or exceptions | T-1 | CI passes on the branch with no step disabled. |
| 12 | `feat/s6-notifications`: notifications table and pgmq queue, cron drain, retries, SMS fallback, quiet hours, 60/15-minute reminders, real providers in jobs, push registration | L-1, O-4, U-6 | Every FR-NOT-002 event lands in the table once and is delivered on dev with the fake providers, and in staging with real ones. |
| 13 | `feat/s6-overstay-adr16`: overstay rate on the rate plan, priced from the booking's plan; unpaid block; ops waive; guarded `setOverstay`; one grace value | L-3, L-4, U-2, U-12, P-14 | A driver with unpaid overstay gets `OVERSTAY_UNPAID` at checkout. Waive writes an audit row. |
| 14 | `fix/no-show-offline`: skip lots with stale gate sync; rebook from release time; no no-shows without a check-in channel | G-4, G-12 | A check-in synced 2 hours late leaves inventory counts unchanged. |
| 15 | `feat/s6-receipts`: stored receipts with numbers, PDF in private bucket, email via provider | L-5, O-4 | Two views of a receipt are identical. The PDF arrives by email in staging. |
| 16 | `test/store-contract`: Postgres contract cases for listing gate, lifecycle store methods and cross-tenant S5/S6 endpoints | T-2, T-3, T-4, S-11 | Every new store method has a contract case. The RBAC matrix has a row per endpoint. |
| 17 | `docs/s6-report`: write the S6 report; correct the S5 lot-closures claim; update doc 06 and the doc 20 carry-over log | O-5 | The reports match the code. |

### Wave 4: fold into Sprints 7 to 9

- **S7:** occupancy reconciliation and stale-session job (G-9); late transfer handling (P-9); reconciliation will also catch any remaining ledger drift.
- **S8:** admin IP allowlist and step-up MFA (S-5); in-transaction audit rows (S-10); deletion guard (S-12); retention jobs (O-8).
- **S9:** offline time checks and monotonic counter (G-5); manifest paging and sync chunking (G-13); per-device event ids (G-11); lot closures (O-5); token lint rule (O-9); remaining Low items.

## Readiness for Sprint 7 and beyond

Sprint 7 should not start until Waves 1 to 3 are done. S7 is about operators trusting the numbers, and today the ledger can double-post extension revenue (P-2) and miss refund reversals (P-12). Reconciliation built on that would report mismatches from day one.

| Next sprint | Depends on | Blocked by today |
| --- | --- | --- |
| S7 Dashboard, ledger, settlement, reconciliation | S6 money paths correct | P-1 to P-3, P-8, P-12, G-9 |
| S8 Admin console and compliance | S2, S4, S6 | Refund and waive flows (P-8, L-4); notification queue for lot-suspension notices (L-1) |
| S9 Passes and hardening | S4, S5 | Device trust (S-1, G-3) and gate codes (G-1, G-2), since passes reuse the gate |
| S10 Launch readiness | All | Staging, malware scanner (O-1), Termii, Sentry, field test |

### Owner actions that no code can unblock

- [ ] Create the staging and prod Supabase and Vercel projects, and add CI deploy secrets.
- [ ] Run `supabase migration repair` on dev so remote history matches the files.
- [ ] Choose the malware scanner vendor so ADR 0013 can be accepted (O-1).
- [ ] Choose the email provider account (Resend) for receipts and operator emails.
- [ ] Chase Termii sender ID and DND approval.
- [ ] Set up Sentry and Better Stack projects.
- [ ] Decide whether drivers must give an email for receipts (open since the S4 report).

### Open questions

- Should the 5-minute test stay be kept behind a flag, or removed and replaced by fake-clock tests?
- Should printed entrance posters remain at all, or should self check-in need a code on the attendant phone or a small display?
