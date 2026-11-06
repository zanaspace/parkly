# Sprint 7 — Operator dashboard, ledger, settlement and reconciliation: report

- **Status:** **In progress.** Task 1 (live occupancy) is built and merged, with the occupancy drift fix (gap review G-9). Before S7 work started, all auth email moved to Resend in the Parkly design (ADR 0022). Tasks 2 to 7 are open. Staging still doesn't exist, so the exit criteria can't be met yet.
- **Updated:** 2026-11-06
- **Entry check:**
  - S6 is code complete: every Wave 3 item of the [gap review](S0-S6-gap-review.md) is merged (S6 report, "Still open").
  - The gap review asked S7 to also take G-9 (occupancy drift) and P-9 (late bank transfers). G-9 is done; P-9 is open.

## Goal (doc 20)

Operators trust the numbers: live occupancy, bookings, revenue and settlements that match Paystack to the kobo.

## Doc 20 Sprint 7 tasks

| # | Task | Status |
|---|---|---|
| 1 | Occupancy read model (expected, in, available); portal live dashboard polling every 15 s | **Done** (PRs #70, #73) |
| 2 | Bookings list with filters + CSV export (owner/manager; exports audited, watermarked with the user id) | Open. The **admin** bookings list with filters and overstay waive shipped in #70; the operator list and the export are not built. |
| 3 | Settlement ingestion from Paystack → `settlements` table → ledger | Open |
| 4 | Daily reconciliation job (07:00 WAT, chunked per operator) | Open |
| 5 | Revenue report per operator/lot/day; monthly statement PDF (P1) | Open |
| 6 | Admin finance views | Open |
| 7 | Book the pen-test vendor for S10 | Open (owner) |
| G-9 | Occupancy drift (from the gap review) | **Done** |
| P-9 | Late bank transfers and `NEEDS_REVIEW` charges (from the gap review) | Open |

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

## Risks

- **Auth email depends on our API and Resend.** If either is down, Supabase gets an error and the user sees "couldn't send". They can retry.
- **Vercel Hobby keeps only short runtime logs**, so a problem reported hours later can't be traced. Moving to Pro before staging fixes this.
- **Migrations are still applied by hand on dev.** `20261106090000_occupancy_drift.sql` must be applied before the auto-close and walk-in reset run there.
- **No staging**, so no S7 exit criterion can be met. The exit criterion is 7 days of staging transactions reconciling with zero unexplained mismatches.

## Exit criteria (doc 20 S7)

| Criterion | State |
|---|---|
| 7 days of staging test transactions reconcile with zero unexplained mismatches | **Not met.** Reconciliation isn't built, and staging doesn't exist. |

## Still open

### S7 tasks

- 2: the operator bookings list and the CSV export.
- 3: settlement ingestion.
- 4: reconciliation.
- 5: the revenue report.
- 6: admin finance views.
- P-9: late bank transfers.

### Owner actions

- [ ] Apply `20261106090000_occupancy_drift.sql` to dev.
- [ ] Test the mobile email sign-in code. It comes through the new hook; web is already tested.
- [ ] Delete the Google app password used for the old Gmail SMTP.
- [ ] Book the pen-test vendor for S10 (task 7).
- [ ] Create staging (Supabase and Vercel), and repeat doc 22 §2.3a for its email hook and Resend settings.
