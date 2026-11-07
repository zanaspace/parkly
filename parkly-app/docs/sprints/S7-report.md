# Sprint 7 — Operator dashboard, ledger, settlement and reconciliation: report

- **Status:** **Code complete.** Tasks 1 to 6 and the occupancy drift fix (G-9) are merged on `main`. Still open: P-9 (late bank transfers), task 7 (pen-test vendor, owner), and the operator portal's finance pages, which the revenue API was built for but nothing in the portal shows yet. Staging still doesn't exist, so the exit criterion can't be met.
- **Updated:** 2026-11-07
- **Entry check:**
  - S6 is code complete: every Wave 3 item of the [gap review](S0-S6-gap-review.md) is merged (S6 report, "Still open").
  - The gap review asked S7 to also take G-9 (occupancy drift) and P-9 (late bank transfers). G-9 is done; P-9 is open.
- **Built alongside S7:** flexible arrival, ADR 0023 stages 1 and 2 (#80, #86) and ADR 0024 "Park now" holds (#84, #85). See [Flexible arrival](#flexible-arrival-built-alongside-s7).

## Goal (doc 20)

Operators trust the numbers: live occupancy, bookings, revenue and settlements that match Paystack to the kobo.

## Doc 20 Sprint 7 tasks

| # | Task | Status |
|---|---|---|
| 1 | Occupancy read model (expected, in, available); portal live dashboard polling every 15 s | **Done** (PRs #70, #73) |
| 2 | Bookings list with filters + CSV export (owner/manager; exports audited, watermarked with the user id) | **Done** (#74). The admin list shipped earlier in #70. |
| 3 | Settlement ingestion from Paystack → `settlements` table → ledger | **Done** (#77); Paystack's settlement fields still to confirm against the first live payout |
| 4 | Daily reconciliation job (07:00 WAT): provider vs payments vs ledger vs settlements | **Done** (#81, review fixes #87, #88). Runs as one paged job, not per operator through `pgmq`; see task 4 below |
| 5 | Revenue report per operator/lot/day; monthly statement PDF (P1) | **Done** in the API (#82). **No portal screen yet**: see "Operator finance pages" under Still open |
| 6 | Admin finance views | **Done** (#83) |
| 7 | Book the pen-test vendor for S10 | Open (owner) |
| G-9 | Occupancy drift (from the gap review) | **Done** |
| P-9 | Late bank transfers and `NEEDS_REVIEW` charges (from the gap review) | Open. Money landing after the hold is already refunded by `settle-payments`; the gap-review item hasn't been checked and closed |

## Before S7: every email goes through Resend (ADR 0022)

**The problem.** Our API already sent booking emails through Resend. But sign-in codes, password reset and signup confirmation came from Supabase, through a Gmail mailbox, using templates pasted into the Supabase dashboard. There were two senders, two looks, and a mailbox password stored in Supabase.

**What we did.**

- **Supabase's Send Email Hook is on.** Supabase now sends no email itself. For every auth email it calls our API (`POST /hooks/supabase/send-email`), which renders the email and sends it through Resend from `no-reply@parkly.sellytichq.com`.
- **One Parkly design for every email.** Sign-in codes, password reset, operator signup, booking confirmations and cancellations, team invites and permit-expiry notices all share one layout (`apps/api/src/emails/layout.ts`).
- **Same protections as the SMS hook.**
  - Every call must carry Supabase's signature.
  - Codes and links are limited to 3 per 15 minutes, 5 per hour and 10 per day per account.
  - Codes, links and addresses are never logged.
- **Links open in any browser.** The first version sent reset links through Supabase's sign-in exchange. That only works in the browser that asked for the email, so a link opened from the Gmail app said "expired". Links now go straight to our own `/auth/confirm` page with a one-time token, which works anywhere.
- **CodeQL alert fixed.** The first version hashed the email address to key the rate limit, and CodeQL flagged it as a weakly hashed password. The limit now uses the account id, so there's no hashing and still no address in Redis.
- **Tested on dev (Nov 6)** on the portal and admin, including links opened from Gmail.

**Also on dev.** The Custom Access Token (JWT) Claims hook, open since Sprint 1, is now switched on. Before turning it on, we dry-ran the function against real accounts. It returned the right roles and operator, and left the standard token fields alone.

**CI fixes along the way.**
- Three files from #70 that failed the format check.
- `node-forge` raised to 1.4.2 (through Expo's CLI) for five new high advisories.

## Task 1: live occupancy, in plain words

**What the operator sees on the portal home.**

- **Live numbers.** For each car park: Parkly cars in, walk-ins, bookings still to arrive in the next 24 hours, and spaces free now.
  - The free-spaces badge is green, amber when under a fifth of the spaces are left, or red when full.
  - The gate card adds them up across all car parks.
- **They refresh every 15 seconds** while the tab is open, straight away when you come back to the tab, and not at all while it's hidden.
- **"Live · Updated 10:42:05"** shows when the numbers were taken. If refreshes fail for 45 seconds it turns into **"Not updating"**, so nobody trusts frozen numbers.
- **The week ahead.** For today and the next 6 days, per car park:
  - the fewest bookable spaces left at that day's busiest 15 minutes
  - how many paid bookings are due to arrive

  It loads with the page and isn't polled.
- **Over-capacity warning.** If more cars are counted in than the car park has spaces, the row shows a red note: a check-out may have been missed or walk-ins miscounted.

**How it works.**

- **Live counts.** `GET /v1/operators/{id}/occupancy` returns `parked`, `walkIns`, `expected`, `available` (total spaces less cars in, never below zero) and `asOf`.
  - The page polls it through its own route, `/api/operators/{id}/occupancy`, which adds the access token from the session cookie. The token never reaches the browser.
  - We used a route rather than a server action because Next 16 runs server actions one at a time per browser, so a poll could hold up a form the user submits.
- **The week ahead.** `GET /v1/operators/{id}/outlook` uses the slot inventory and a new store query for paid arrivals not yet in.
  - The maths is the domain function `weekOutlook`, with `outlookWindow` deciding the time range.
- **Who can see it.** Owners and managers only. Another operator, or any other role, gets 404 (RBAC matrix rows).

## Task 2: the operator bookings list and CSV export, in plain words

**What the operator sees.** A new **Bookings** page in the portal menu.

- **Filters:** car park, a from–to date range and a status ("Paid, not arrived", "Parked now", "Completed", "No-show", "Cancelled"). Dates are when the booking starts, in Lagos time. It opens on the last 7 days, all car parks.
- **The list:** booking code, car park, stay, plate and driver's first name, status, check-in and check-out times, and what the driver paid, plus any overstay. A car checked out by the 12-hour rule says "Checked out automatically". On phones the rows become cards.
- **Pages:** 50 at a time, with "Next page".
- **Download CSV:** every booking matching the filters, up to 10,000, straight away.
  - The first row says who downloaded it, when, and with which filters.
  - The download is recorded in the audit log.
  - If more than 10,000 match, or the dates are wrong, the page says what to change instead of downloading.

**How it works.**

- **The list:** `GET /v1/operators/{id}/bookings`.
  - It pages with a cursor (start time and id), so pages don't shift when new bookings arrive.
  - Without a status filter, it leaves out abandoned checkouts (unpaid or expired holds).
- **The export:** `GET /v1/operators/{id}/bookings/export` returns the same rows as a CSV.
  - Money is in naira with two decimals and times are in Lagos.
  - Any cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe, so a plate or car park name can't run as a formula in Excel.
  - The audit row is `operator.bookings_exported`, with the filters and the row count.
- **Who:** owners and managers (new permissions `operator:bookings:read` and `operator:bookings:export`). Another operator gets 404. Attendants use the gate manifest instead.
- **Driver details:** first name and plate only, as doc 02 sets for operators. That is the minimised form doc 06 asks for in an export.
- **The portal:** the page is a plain form, so filtering works without JavaScript. The download goes through the portal's own route, which adds the access token, so the token never reaches the browser.

**Money columns.** The list and the CSV show the booked price and what the driver paid. Commission, the operator's share and settlements come with the revenue report (task 5), built from the ledger, so they also include extensions and refunds.

## Task 3: settlements from Paystack, in plain words

**What a settlement is.** Paystack collects the driver's money. Every so often it pays out:
- the operator's share goes straight to the operator's bank, through their Paystack subaccount;
- Parkly's share (commission and service fee, less Paystack's fees) goes to Parkly's bank.

Each payout is a "settlement". Until now we recorded the money coming in, but not the money going out.

**What we built.**

- **A `settlements` table**, one row per Paystack payout. It holds the amount paid out, the gross and fees, the date and the status, plus a copy of Paystack's money fields. The copy never includes bank account numbers or names.
- **A job every hour** (`settlements-sync`). It asks Paystack for the last 14 days of payouts, for Parkly's account and for every operator with an active payout account, and saves each one once. Looking back 14 days every hour means a payout that was "processing" and is now paid out is picked up. Seeing the same payout again changes nothing.
- **Ledger posting, exactly once.** When a payout is paid out, it's posted in the same transaction, with the row locked:
  - an operator payout reduces what Parkly owes that operator (`OPERATOR_PAYABLE`);
  - Parkly's own payout moves the money from Paystack into Parkly's bank (`CASH_AT_BANK`, a new account).

  Both take the money out of the Paystack clearing account, which should then sit near zero once everything is paid out. That is what task 4's reconciliation will check.
- **Fail safe.** Anything we don't recognise is saved as **NEEDS_REVIEW** with the reason and is never posted:
  - a status we don't know;
  - a currency other than NGN;
  - a missing or fractional amount;
  - a payout listed under the wrong subaccount.

  If Paystack ever reports a payout differently after we posted it, it isn't posted twice: it's flagged for review. The job logs a warning whenever something needs review.

**What's still unconfirmed.** Paystack's docs block automated reading, and **test mode never pays out**, so the real settlement list is always empty there. We confirmed the endpoint and its filters work with the test key, and recorded that empty response as a test fixture. The settlement fields themselves (`effective_amount`, `total_amount`, `total_fees`, `settlement_date`, `status`, `subaccount`) follow Paystack's documented shape, but **must be checked against the first live payout**. The strict reading means a mismatch shows up as NEEDS_REVIEW rows and a warning, not as wrong ledger entries.

## Task 4: daily reconciliation, in plain words

**What it does.** Every morning at 07:00 Lagos (`reconcile-payments`, `pg_cron` at 06:00 UTC) it checks the day before from four sides:
- **Paystack against our payments.** It reads every page of Paystack's transactions and matches each one to our payment by reference. A record missing on one side is looked up on the other before it's flagged, so a checkout that crosses midnight isn't flagged twice.
- **Payments against the ledger.** Every settled payment must have a journal that took in exactly its amount from Paystack.
- **Held payouts.** Settlements still marked NEEDS_REVIEW (task 3) are listed until someone sorts them.

**What it finds.** Each exception is one item on the run: `MISSING_INTERNAL`, `MISSING_PROVIDER`, `AMOUNT_MISMATCH`, `STATUS_MISMATCH`, `LEDGER_MISSING`, `LEDGER_MISMATCH`, `SETTLEMENT_REVIEW`.
- **Charges we never recorded are fixed automatically** (`AUTO_FIXED`). They go through the normal `verifyAndSettle` path, so the receipt, the notice and any late-money refund all happen as usual.
- **Re-runs are safe.** A run and its items save in one transaction. A re-run replaces the open items and keeps the resolved ones.
- **Finance gets an email** when a run has exceptions, if `FINANCE_ALERT_EMAIL` is set. A failed email never fails the run.

**Resolving.** Admins resolve an item with a note (`/v1/admin/reconciliation/...`). Each resolution is audited. Resolving an item twice, or losing a race to resolve it, returns 409.

**Different from doc 20.** Doc 20 planned one job per operator through a `pgmq` queue. Paystack lists transactions per account, not per operator, so the job reads one paged list instead. At pilot volume that easily finishes inside the function time limit.

**Not yet.** The check that the Paystack clearing balance equals what hasn't been paid out yet. It waits until real payout timing is known (doc 02).

## Task 5: revenue report and monthly statements, in plain words

**The API** (owners and managers; another operator gets 404):
- `GET /v1/operators/{id}/reports/earnings`: daily rows per operator, filterable by car park. It shows what drivers paid (bookings, extensions and overstay together), commission, service fee, the operator's share, refunds and settlements. It is built from the `payments`, `refunds` and `settlements` tables, not from the ledger. Overstay isn't shown on its own line.
- `GET /v1/operators/{id}/reports/export`: the same report as a watermarked CSV, audited as `operator.earnings_exported`.
- `GET /v1/operators/{id}/reports/statements/{month}`: a monthly statement as JSON, or as a PDF with `?format=pdf`. PDF downloads are audited.

**The job.** `monthly-statements` runs on the 1st of each month at 07:00 Lagos and emails each operator owner last month's statement PDF.

**Gap.** Nothing in the operator portal calls these endpoints yet. Operators only get the emailed PDF. See "Operator finance pages" under Still open.

## Task 6: admin finance views, in plain words

The admin console has a **Finance** page with the reconciliation runs, their exception counts and finance totals. Each run opens to its items, and an admin can resolve an item with a note there. The admin home shows a finance summary.

## Flexible arrival (built alongside S7)

- **ADR 0023, stage 1** (#80): drivers who come too early are told when check-in opens, instead of being refused.
- **ADR 0023, stage 2** (#80, #86): when there is space, an early driver can pay to start now, on mobile and on the web.
- **ADR 0024, "Park now"** (#84, #85):
  - **Holds.** The driver prepays a stay and the space is held at once. The clock starts at check-in.
  - **Holding fee.** The first 60 minutes held are free. After that, 25% of the hourly rate per started 15 minutes, at least ₦150 per block.
  - **Limits.** A hold is released as a no-show after 3 hours. Each car park caps holds at 30% of its spaces by default (`HOLD_CAP_REACHED`).
  - **Check-in.** Park-now bookings skip the 15-minute grid check and can check in straight away.
  - **Tab label.** My bookings calls the tab "Active" once the car is checked in.

**To confirm.** The holding fee is worked out at check-in and shown as due at checkout, along with any overstay. Before the pilot, check that the checkout payment actually collects it, and that it reaches the ledger and the revenue report.

## G-9: occupancy no longer drifts, in plain words

**The problem.** A car whose check-out was never scanned counted as "in" forever, and the walk-in count never went back to zero. Over days, "free now" would get worse and worse.

**What we did** (owner decisions, Nov 6).

- **Forgotten check-outs close by themselves** (`fn_close_stale_sessions`, every hour).
  - **When:** 12 hours after the booking ended, a car still "in" is checked out **at the booking's end time** and flagged `AUTO_CLOSED`.
  - **No overstay is charged**, because nobody knows when the car really left. The booking becomes completed, recorded as a system action.
  - **It waits for offline gate phones.** If a phone that was on duty hasn't synced since then, the real check-out may be in its queue, so the job waits for it, as the no-show job does. After 24 hours it closes anyway.
  - **A real check-out still wins.** If one syncs later, its time replaces the automatic one ("latest check-out wins") and overstay is priced as usual.
- **Walk-ins reset to zero every night at 03:00 Lagos** (`fn_reset_walk_ins`). Walk-ins are only counted, not tracked car by car, so a nightly reset is the only way to correct them.

## How the work was checked

| Change | Checks |
|---|---|
| Settlements | Domain tests for the journal (operator, main account, zero, negative); adapter tests against a recorded empty list and a documented-shape list (main account and subaccount calls, what counts as paid out, every review reason, no bank details kept, a record with no id); 5 tests for the save-and-post rules; a store contract case run on both stores (save once, post once, a changed payout flagged, main account pending then paid); 5 job tests (both accounts posted once, pending then paid, review and warning, one account failing, deadline). Migrations and a posted journal checked on the dev schema inside a rolled-back transaction. |
| Operator bookings | Domain tests for the CSV writer (quoting, formula defusing) and Lagos dates; permission tests; 5 API tests (list, pages and filters, bad ranges and cursors, the export's watermark, header and audit row, another operator's 404); RBAC matrix rows; store contract case for filters and pages (runs on Postgres in CI); portal filter tests |
| Auth email | 13 hook tests (signature, each email type, rate limits, logging, escaping, provider down, links straight to `/auth/confirm`, fallback); config tests; tested on dev |
| Live occupancy | Domain tests for the outlook window; API tests for both endpoints and the other-operator 404; RBAC matrix; store contract case for arrivals (runs on Postgres in CI); portal helper tests |
| G-9 | 6 database integration tests (close at 12 h, leave at 11 h, wait for a silent phone, close after 24 h, never touch a checked-out car, walk-in reset, schedules) |

**Running the database tests without Docker.** Docker isn't installed on the development laptop, so `supabase start` can't run there. To check the G-9 SQL against the real schema before CI, we ran the integration tests against the hosted dev database:
- The migration and all test data were applied inside one transaction per test, and every transaction was rolled back.
- Afterwards we confirmed no function or schedule was left behind.
- This caught a real bug: adding the flag with `||` read the text as an array. We fixed it with `array_append` before committing.

## Decisions

| Decision | Why |
|---|---|
| All auth email through our API and Resend (ADR 0022) | One sender, one look, templates in git and tested, no mailbox password in Supabase |
| Auth links go straight to `/auth/confirm` with a one-time token | Works in any browser, including Gmail's, and shows our domain |
| Rate limit auth email per account id | No hashing of addresses (CodeQL), still no address stored |
| Live occupancy by polling every 15 s, not Supabase Realtime | Doc 20 task 1; Realtime would need RLS read policies per operator |
| A route handler for polling, not a server action | Next 16 runs server actions one at a time per browser |
| Auto-close after 12 h, at the booking's end, no overstay | Owner, Nov 6: we can't know when the car left, so we don't charge for it |
| Walk-ins reset at 03:00 Lagos | Owner, Nov 6: walk-ins aren't tracked per car |
| Bookings CSV is immediate (up to 10,000 rows), not an emailed async job (doc 03 had planned that) | Pilot volumes are small; a direct download is simpler, and the audit row and watermark still record who took the data |
| Export open to owners and managers | PRD FR-OPS-002 and doc 20 say owner/manager; doc 02 had said owner only, now corrected |
| Settlements are read strictly and anything unrecognised is held for review, never posted | Paystack's settlement fields couldn't be confirmed (docs blocked, test mode never pays out); a wrong guess must not become wrong ledger entries |
| Look back 14 days every hour | A payout can move from processing to paid out days later; repeats change nothing |
| No commission or operator share in the bookings list | Those come from the ledger in the revenue report (task 5), which counts extensions and refunds |

## Risks

- **Auth email depends on our API and Resend.** If either is down, Supabase gets an error and the user sees "couldn't send". They can retry.
- **Vercel Hobby keeps only short runtime logs**, so a problem reported hours later can't be traced. Moving to Pro before staging fixes this.
- **Migrations are still applied by hand on dev.** `20261106090000_occupancy_drift.sql` must be applied before the auto-close and walk-in reset run there.
- **No staging**, so no S7 exit criterion can be met. The exit criterion is 7 days of staging transactions reconciling with zero unexplained mismatches.

## Exit criteria (doc 20 S7)

| Criterion | State |
|---|---|
| 7 days of staging test transactions reconcile with zero unexplained mismatches | **Not met.** Reconciliation is built and runs on dev, but staging doesn't exist. |

## Still open

### S7 tasks

- **P-9: late bank transfers.** Check the gap-review scenarios against `settle-payments` and reconciliation, then close the item or build what's missing.
- **Operator finance pages (portal).** Scheduled next, before S8 (`product doc/nextsteps.md` §5, `product doc/revenue.md`). The portal home shows no money, and operators can't download their statement. The API from task 5 is ready, so this is portal work only.
- **Park-now holding fee at checkout.** Confirm it's collected and reaches the ledger (see Flexible arrival).
- **Paystack clearing-balance check.** Waits for real payout timing.

### Owner actions

- [ ] Apply `20261106090000_occupancy_drift.sql` to dev.
- [ ] Test the mobile email sign-in code. It comes through the new hook; web is already tested.
- [ ] Delete the Google app password used for the old Gmail SMTP.
- [ ] Book the pen-test vendor for S10 (task 7).
- [ ] Apply `20261106091452_settlements.sql` and `20261106091500_settlements_grants_cron.sql` to dev.
- [ ] Apply the reconciliation, statement and flexible-booking migrations to dev: `20261106115202_reconciliation_tables.sql`, `20261106120000_reconciliation_grants_cron.sql`, `20261106140000_monthly_statements_cron.sql`, `20261106150000_flexible_bookings.sql`, `20261106211220_reconciliation_ledger_results.sql`.
- [ ] Set `FINANCE_ALERT_EMAIL` on the API's Vercel env so reconciliation exceptions reach finance.
- [ ] When the first **live** Paystack payout happens: check the `settlements` rows (no NEEDS_REVIEW), and replace `test/fixtures/paystack/settlements-assumed.json` with a sanitised copy of the real list.
- [ ] Create staging (Supabase and Vercel), and repeat doc 22 §2.3a for its email hook and Resend settings.
