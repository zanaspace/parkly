# Sprint 6 — Extend, overstay, cancel, refunds, receipts, notifications: report

- **Status:** **In progress.** The lifecycle features are merged, and the hardening pass from the [gap review](S0-S6-gap-review.md) has finished Waves 1 and 2 and three of the six Wave 3 items: automatic checks (CI), notifications, and overstay. Attendants are invited and signed in by email code, and every sign-in request carries a captcha. Still open: no-shows while a gate is offline, stored receipts, and database tests; staging doesn't exist yet, so the exit criteria are not met.
- **Updated:** 2026-10-30
- **Entry check:**
  - S5 is done (code complete).
  - The gap review (Oct 28) said S6 was not ready to merge and set out four fix waves. This report tracks them.

## Goal (doc 20)

The full session lifecycle is handled cashlessly, and drivers and operators are told what they need, reliably.

## What was built first (PRs #48 to #52)

| Area | What shipped | State after the gap review |
|---|---|---|
| Lifecycle API | Extend, cancel and overstay-pay endpoints; cancellation policy engine; extension table | Worked in tests, but money paths double-posted and holds never expired. Fixed in Wave 1. |
| Receipts and notifications | HTML receipt, notification service, reminder and no-show sweeps | Receipt had a token-in-URL leak and an XSS hole (fixed in Wave 2). Notifications don't run in production (Wave 3). |
| Client UX | Extension, overstay, cancel and receipt screens on web and mobile | Done. |
| Gate pass details | Entrance landmark notes; attendant call and WhatsApp contact | Done. |
| Test stays | A 5-minute stay for testing overstay | Broke slot ranges platform-wide. Fixed and put behind a switch in Wave 1. |

## Hardening pass

### Wave 1: stop money and inventory damage

| # | Work item | Findings | Commit | Status |
|---|---|---|---|---|
| 1 | Restore `[start, end)` slot ranges; one broken row no longer stops `fn_expire_holds` | P-1 | `9e3b920` | **Done** |
| 2 | 5-minute test stays need `TEST_SHORT_STAYS=on`, which the prod config refuses | L-2, P-11, U-1, U-2 | `9c15e13` | **Done** |
| 3 | Extension and overstay payments settle through one checked decision | P-2, P-3, P-6, L-7 | `f9fe038` | **Done** |
| 4 | One expiring hold per extension, confirmed only on a live booking | P-4, P-5, L-6 | `37b29c7` | **Done** |
| 5 | `Idempotency-Key` on extend, cancel and overstay pay; one open overstay checkout | P-7, P-13 | `6a6eb82` | **Done** |
| 6 | Refund each charge, reverse the ledger, retry and close refunds | P-8, P-9, P-12 | `74f2468` | **Done** |

**What changed for money:**
- **Settling add-ons.** A verify followed by the `charge.success` webhook now posts one journal, not two. A short or foreign-currency charge becomes `AMOUNT_MISMATCH` and is refunded. A charge still in progress waits instead of failing. Money for an extension or overstay that no longer applies is refunded.
- **Extension holds.** They expire like booking holds. A booking has at most one unpaid extension. Failed checkouts and cancels give the space back.
- **Refunds.** Cancelling an extended booking refunds each charge separately, newest first, each capped at what it has left. Every refund posts a reversal journal, so operator payable returns to zero. A job retries refunds Paystack didn't accept. `refund.processed` and `refund.failed` webhooks close them. A database trigger rejects refunds larger than their payment.

### Wave 2: close the security holes

| # | Work item | Findings | Commit | Status |
|---|---|---|---|---|
| 7 | Signed receipt links instead of `?token=`; receipts HTML-escaped with a strict CSP | S-2, S-3, U-5 | `854724d` | **Done** |
| 8 | Blocked attendant phones stay blocked; approvals are per lot | S-1, G-3, G-6, G-7, S-10 | `6d213ef` | **Done** |
| 9 | Signed gate codes for driver self check-in (ADR 0017) | G-1, G-2, U-9, U-10 | `0204eba` | **Done**. Posters printed before this change must be printed again. |
| 10 | Sign-in code hardening: 5-minute codes; Turnstile captcha on every sign-in request (ADR 0019) | S-4 | `84a76fa`, `8b3b9a1` | **Done**, within what Supabase allows (see below) |

**Item 10 in detail (ADR 0019).** Apps ask Supabase Auth directly to send codes and sign in, so the API's OTP precheck only helps honest clients. Supabase's own captcha check is the control a script can't skip.

- **Where the check appears:**
  - Portal: password sign-in, sign-up, password reset and the attendant code sign-in.
  - Admin: password sign-in and reset.
  - Driver website: code sign-in.
  - Mobile: the email, phone and resend steps, in a WebView.
- **The widget** is `Turnstile` in `packages/ui`. It renders nothing without a site key, and resets after each submit, because a token works once.
- **A failed check** returns `AUTH_CAPTCHA_FAILED` with its own message, so it never reads as a wrong password.
- **The web apps' CSP** allows `challenges.cloudflare.com` only when a site key is set.
- **Not built: a per-phone counter of wrong codes.** Supabase has no verify hook, and apps verify directly, so a counter in our API could be skipped. The remaining risk is a 6-digit code, live for 5 minutes, limited to 30 checks per IP per 5 minutes, with captcha on every send. ADR 0019 records it.

## Sign-in and team onboarding

Found while testing the invite flows on dev.

| Change | Why | Commit |
|---|---|---|
| **Attendants sign in with a 6-digit email code** (ADR 0018), with phone as the alternative | An attendant invited by phone had no way in. No SMS was sent, the invite page only said "accept in the app", and the gate app sent them to the email and password sign-in. | `8f2cbd6` |
| **The confirmation email depends on who signed up** | It showed both a code and a link to everyone. Operators confirm with the link; drivers and attendants type the code. | `517cc57` |
| **An ended session on the invite page signs out** instead of "Something went wrong" | After a test account was deleted, the browser kept a valid-looking cookie and Accept invite failed with no explanation. | `b664738` |

### Attendant sign-in (ADR 0018)

1. The manager invites the attendant **by email** in Team. The form says a phone number needs SMS, which isn't live.
2. The manager shares the invite link (copy or WhatsApp). Invites aren't emailed yet; that comes with notifications in Wave 3.
3. The attendant opens the link and enters the invited email, or the phone with "Use a phone number instead". They type the 6-digit code.
4. `verifySignInCode` signs them in, calls `/v1/auth/bootstrap`, then `/v1/auth/invites/accept`. The API checks the signed-in email or phone against the invite. On a mismatch, the portal signs them out and shows "This invite link isn't valid for this account".
5. They land on "You've joined the team", then `/attend`. The manager approves the phone, and the attendant sets a 6-digit PIN.

The gate app's sign-in is `/sign-in/code`. Owners and managers keep a link to password sign-in there. A manager who signs in by email code gets an `aal1` session: the portal still asks for the authenticator, and the API refuses actions that need `aal2`.

### Confirmation email by audience

- Portal password sign-up sets `operator_signup: true` in user metadata. Only the email template reads it; no hook, policy or API code does, so it grants nothing.
- `supabase/templates/confirmation.html` shows **only the button** when the flag is set, and **only the code** otherwise.
- Both templates are wired into `config.toml` for local Supabase. Hosted projects need them pasted into the dashboard (doc 22 §2.3a).

## Other fixes

| Fix | Commit |
|---|---|
| The cancel route read `booking.free_cancellation_lead_min`, but the database seeds `booking.free_cancel_before_start_min`. The lookup always fell back to 30 minutes, so changing the setting did nothing. Same default, so nothing changed for drivers. | `b81a54d` |
| The mobile preview build carries the Turnstile site key. Without it, the app can't send codes now that Supabase requires the check. | `307ff08` |
| Personal notes holding keys and passwords (`urlpages/`) are git-ignored. | `ba47ec6` |

## How cancellation works now

| When the driver cancels a paid booking | Refund | Space |
|---|---|---|
| More than 30 minutes before the start | Full: parking price and service fee, one refund per charge | Released |
| Within 30 minutes of the start, or after it, before check-in | None | Released |
| Never cancels and never arrives | None; marked `NO_SHOW` 30 minutes after the start | Released |
| Already checked in | Can't cancel; they check out | — |

Ops can cancel any booking with a full or partial goodwill refund. The 30-minute window is the platform setting `booking.free_cancel_before_start_min`.

## Hosted configuration on dev (owner)

| Setting | State |
|---|---|
| Supabase custom SMTP | **Gmail SMTP, for testing only.** Resend only delivers to the account owner until a domain is verified. Swap back when the domain is verified, then delete the Google app password. |
| Email OTP length and expiry | 6 digits, 300 seconds |
| Confirm signup template | ✅ Pasted from `supabase/templates/confirmation.html`; managers get the button-only email, drivers and attendants the code-only email |
| Turnstile | Widget `Parkly sign-in`, Managed mode, hostnames: portal, admin, website and `localhost` |
| Vercel `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Set on `parkly-portal`, `parkly-admin` and `parkly-web` (Production and Preview); all three redeployed |
| Supabase captcha | ✅ **On** (Cloudflare Turnstile). Sign-in confirmed working on the portal, admin and driver website. |
| Mobile | Local `.env` and the EAS `preview` profile have the site key and origin. The `production` EAS environment still needs both (doc 22 §2.3b). |

## Wave 3: what was built, in plain words

### Item 11: automatic checks (CI)

**The problem.** GitHub runs automatic checks (formatting, lint, types, tests, build, security scans) only from `.github/workflows` at the top of the repository. Ours were one folder down, inside `parkly-app/`, so **no check had ever run**: every pull request merged unchecked. The code also had 53 badly formatted files, 28 lint errors and 8 high-severity dependency warnings.

**What changed.**
- The workflows moved to the top of the repository and run inside `parkly-app/`. Every pull request and every merge to `main` is now checked.
- Formatting fixed, the 28 lint errors cleared, and two packages upgraded (style-dictionary, undici). Three warnings inside Expo's own tools have no compatible fix; they are recorded with reasons in `pnpm-workspace.yaml` and reviewed by 31 Jan 2027.
- The first run on GitHub found a security test that disagreed with a Sprint 3 decision (approved lot photos are public on purpose); the test was corrected.
- The deploy workflow stays switched off until staging exists, so a merge never deploys by itself.

**For you.** A red cross on a pull request now means something is wrong. Optional: in GitHub → Settings → Branches, require the checks to pass before merging.

### Item 12: notifications (ADR 0020)

**The problem.** Notifications existed on paper but sent nothing in production: reminders found no bookings, the database had no phone or email to send to, nothing retried, and only reminders were wired up at all.

**What drivers get now.**

| When | What they receive |
|---|---|
| Booking paid | "Booking confirmed": push, SMS (with the booking code) and email |
| 60 minutes before the start | "Starts soon": push, or SMS if push doesn't reach the phone |
| Checked in or out at the gate | Push. "Checked out" waits until 07:00 if it happens between 22:00 and 07:00. |
| 15 minutes before the end | "Ends soon, extend?": push, or SMS if push doesn't reach the phone |
| Extension paid | "Extended": push and SMS |
| Left late | "Overstay due" with the amount and a pay link: push and SMS |
| Cancelled | "Cancelled" with the refund amount: push, SMS and email |
| Never arrived | "No-show": push |

**How it works.** Every event is written to a `notifications` table, and a job sends it within a minute. If a channel fails, it is retried after 1, 5, 25 and 120 minutes, then marked failed; channels that already worked aren't sent twice. The same event never sends twice, even if a payment webhook or a gate sync arrives twice. A notification can never break the action that caused it (paying, cancelling, checking out).

**Also built.**
- At sign-in, the phone and email are now saved **encrypted** so messages can be sent later (doc 06 allows this).
- The driver app registers for push after sign-in; tapping a notification opens that booking. Push needs a real (EAS) build; in Expo Go the app works without push.
- **Team invites are emailed** to the person invited by email. The portal says "We've emailed this link to …" only when an email really went out, and still shows copy and WhatsApp.
- Links in messages now go to the real website (`/bookings/<id>`), not `parkly.ng`, which doesn't exist. Lot names are escaped in emails, and a long lot name no longer cuts the link off an SMS.

**For you.** Real email starts when the Resend domain is verified and `EMAIL_PROVIDER=resend` is set on the API; push starts with `PUSH_PROVIDER=expo` and an EAS build (doc 22 §2.3c). Until then, emails are only logged and push is simulated. SMS waits for a provider.

**To test.** Book and pay on dev. Within a minute, Supabase → Table Editor → `notifications` shows a `booking.confirmed` row: `SENT`, or `SKIPPED` when there was nowhere real to send it.

### Item 13: overstay (ADR 0016)

**The problem.** Overstay was charged at check-out but never enforced: drivers could leave it unpaid and keep booking. It was priced from the lot's *current* price, operators couldn't set their own overstay price, staff couldn't forgive it, a paid overstay could flip back to "due", and the apps kept showing "Unpaid overstay" after it was paid. An extension could also come out free after a price cut.

**What changed.**

| Who | What they see now |
|---|---|
| Operator | On an hourly price: an optional **overstay price per 15 minutes** and **extra grace**. Parkly caps the price at 2× the hourly price per 15 minutes; staff see both when approving. |
| Driver | Overstay and extensions are priced at the plan they **booked at**; a later price change never touches a sold stay. The booking page shows the same grace and price that check-out charges. |
| Driver | An overstay still unpaid **24 hours after check-out blocks new bookings**. Review and pay (web and app) shows "Pay your overstay first" with the amount and a Pay button. |
| Driver | The "Unpaid overstay" banner shows only while it is owed, not after it's paid or waived. |
| Parkly staff | Admin console → **Bookings**: find a booking by its code (`pk3mv7bu` works). Ops, Finance and Super Admin can **waive** an overstay with a reason, saved in the audit log. Support can look but not waive. |

A paid or waived overstay is final: a phone re-syncing an old check-out can't make it "due" again.

**For you.** Apply the two migrations to dev **before** merging (`20261030182040_rate_plan_overstay`, `20261030190000_overstay_unpaid_cron`).

**To test.**
1. Portal → a lot's hourly price → set an overstay price (e.g. ₦200) and grace (20 min); approve it in admin.
2. Book on it, check in and check out well past the end: the charge uses ₦200 per 15 minutes after 20 minutes.
3. In Supabase, set that session's `overstay_status` to `UNPAID` (as the hourly job does after 24 h), then try to book again: the site asks you to pay first.
4. Admin console → Bookings → the code → waive with a reason. The driver can book again, and the audit log has the reason.

### Item 14: no-shows when a gate phone is offline

**The problem.** Thirty minutes after a booking starts, the database marks it a **no-show** if nobody checked the car in, and gives the space back for others to book. But a gate phone without network keeps its check-ins on the phone until it reconnects. So a driver who *was* checked in could be marked a no-show and lose their space, and when the check-in finally arrived, some slots were counted twice. Car parks with no attendant phone and self check-in switched off turned **every** booking into a no-show, because nobody there could check anyone in.

**What changed.**
- **No gate, no no-shows:** a car park with no approved gate phone and self check-in off never marks no-shows.
- **Wait for the gate:** if any gate phone that was in use around the booking hasn't synced since the 30-minute deadline, the booking is left alone and checked again 5 minutes later. Once every phone on shift has reported in without that car, it's a no-show. After 12 hours of silence it is marked anyway.
- **No double counting:** when a "no-show" turns out to have checked in, the space is taken again only from now on; past time is not counted twice.
- A copy of the no-show job in the API that never worked (it failed silently on every run) was removed; the database job is the one that runs.

**For you.** Apply `20261031090000_no_show_offline_gates.sql` to dev before merging. Nothing else changes.

**To test.** Hard to do by hand, because it needs a gate phone to go offline. The cases are covered by database tests in CI (`packages/db/test/no-show.int-spec.ts`): a self check-in lot, a lot with no way to check in, a silent phone then a sync, an old unused phone, and the late check-in.

### The Expo Go fix

Turning on push made the app crash in **Expo Go** on start ("Cannot find native module"), because Expo Go doesn't contain the push module. Push now loads only in a real build, so Expo Go works again, without push. On its own branch, `fix/mobile-push-expo-go`.

### Item 15: receipts (ADR 0021)

**The problem.** The receipt was rebuilt every time it was opened, so its date changed on every view and it had no number. It left out the LASPA permit number, didn't add up after an extension, showed a refund as done while it was still in progress, and there was no PDF and no email.

**What changed.**

| Who | What they see now |
|---|---|
| Driver | Every paid booking has a **receipt number** per car park company, like `R-000123`, issued when the payment goes through. The receipt says who issued it ("Issued by Eko Parking through Parkly") and the lot's **LASPA permit number**. |
| Driver | **Every charge** is listed (booking, extension, overstay) with the **total charged**. Refunds say **Refunded** or **Refund in progress**. |
| Driver | **Download PDF** on the booking page (web) and in the app, next to "View receipt". The **confirmation email carries the PDF**. |
| Driver | When money changes (an extension, overstay or refund), the same number gets a new **revision** ("Revision 2, 31 Oct 14:05"). Renaming the lot later never changes an old receipt. |
| Parkly | **VAT is ready but off.** Switched on, receipts show "Includes VAT at 7.5%: ₦X" and Parkly's VAT number. Prices don't change: VAT is shown as part of the price already charged. |

**How VAT is switched on (when Parkly decides).** Supabase → Table Editor → `platform_settings`:
- `fees.vat_enabled` → `true`
- `fees.vat_rate_bps` → `750` (7.5%; change only if the rate changes)
- `company.vat_number` → `"12345678-0001"` (with the quotes)

Receipts issued from then on show VAT; earlier ones stay as they were.

**Why no storage bucket.** The plan was to save each PDF in a private bucket. Instead the receipt's content is saved in the database, and the PDF is drawn from it each time it is asked for. Every copy of a revision is identical, there is no second copy of personal data to secure and delete, and a refund never leaves an old PDF lying around (ADR 0021). The PDF shows "NGN" instead of "₦", because the standard PDF font has no naira sign.

**For you.** Apply `20261031100000_receipts.sql` and then `20261031100100_receipts_grants_vat.sql` to dev **before** merging. Without them, paying for a booking still works, but receipts return an error.

**To test.**
1. Book and pay on dev. Open the booking: **View receipt** shows `R-000001` (or the next number for that company), the permit number and the total charged.
2. **Download PDF**: a file named `parkly-R-000001.pdf` downloads and matches the page.
3. Extend the booking and pay: the receipt lists both charges, the new total, and "Revision 2".
4. Cancel a booking with a refund: it says **Refund in progress**, then **Refunded** once Paystack confirms.
5. In Supabase, `receipts` has one row per paid booking.
6. Email with the PDF attached arrives once real email is on (Resend, item 12).

### Item 16: tests against the real database

**The problem.** Most API tests run against an in-memory copy of the database, because it's fast. If the copy behaves differently from Postgres, tests pass while production fails, which has happened before (P-1, L-1, L-2). Many newer features had no test against Postgres at all. Nobody had checked that drivers can't act on someone else's booking for cancel, extend and overstay-pay, or that the map hides a lot when its permit expires today.

**What changed.**
- **One set of tests, run against both:** cancelling with a refund and following it until Paystack confirms, extensions (hold, pay, release, wrong payment), payments still open, retried webhooks, the notification queue, reminders, overstay waive, and saved phone/email and push tokens. CI runs them on Postgres.
- **When a lot shows on the map:** it's hidden when its permit expires that day, its site visit is out of date, it's paused or suspended, or its company isn't approved. Shown again when that's fixed.
- **Other people's bookings:** another driver, or the car park's own staff, can't cancel, extend or pay overstay on a driver's booking. They're told it doesn't exist, and nothing changes.
- **The permissions table** now includes the Sprint 5 and 6 pages, each with a "different company" case.

**What the tests found, now fixed.** In each case, the in-memory copy behaved differently from Postgres:

| Found | Fixed |
|---|---|
| The refund retry ignored its 5-minute wait in tests, so a refund could look retried at once | The copy waits like the database; the test now moves the clock on |
| Refunds were dated by the computer's clock, not by when the cancel happened | Dated by the action |
| Confirming an extension without a payment wiped the payment link, and a wrong payment was accepted | Kept, and a wrong payment is refused, as in the database |
| Booking payments had no type ("booking") in tests | Set, as in the database |
| **Postgres let a company become active with no payout account** (the copy refused) | **Postgres now refuses too:** no payout account, no approval. The admin page already saves the account first, so nothing changes for staff. |

**For you.** No migrations or settings. If CI goes red on the database job, that's this branch's new Postgres tests doing their work; I'll fix it.

## Doc 20 Sprint 6 tasks against the code

| Task | Status |
|---|---|
| 1. Extension: availability, incremental payment, manifest update | **Done.** Idempotent; holds expire. |
| 2. Overstay at checkout, pay link, unpaid block, ops waive | **Done.** Priced from the booking's own plan with the operator's overstay terms; pay link by message; unpaid after 24 h blocks new bookings; ops waive with a reason (item 13). |
| 3. Cancellation policy engine and refund via provider; refund webhooks | **Done** |
| 4. No-show job every 5 minutes | **Done in SQL**; waits for offline gate phones and skips lots with no way to check in (item 14) |
| 5. Receipts: HTML/PDF, email, in-app, private bucket | **Done** (item 15): stored and numbered, HTML and PDF from the same snapshot, PDF on the confirmation email. No bucket: the PDF is drawn on demand (ADR 0021). |
| 6. Notification service: templates, pgmq queue, retries, SMS fallback, quiet hours | **Done** with an outbox table instead of pgmq (ADR 0020). Real email and push need their switches (doc 22 §2.3c). |
| 7. Reminders 60 minutes before start, 15 before end | **Done**, every 5 minutes (pg_cron) |
| 8. Push token registration in mobile | **Done**; needs an EAS build (not Expo Go) |

## Exit criteria (doc 20 S6)

| Criterion | Status |
|---|---|
| Every FR-NOT-002 event fires in staging with real SMS, push and email | **Not met.** Every event is now queued and sent, with tests; but staging doesn't exist, email waits for the Resend domain, push for an EAS build, and SMS for a provider. |
| Refunds visible in the Paystack test dashboard | **Met in tests.** Charge-by-charge refunds and the refund webhooks are covered; not yet run against the sandbox on staging. |

## Decisions

| ADR | Decision |
|---|---|
| [0017](../decisions/0017-signed-gate-codes.md) | Self check-in codes are signed: posters with the server pepper, the attendant's phone with the lot gate key, changing every minute. |
| [0018](../decisions/0018-attendant-email-code-sign-in.md) | Attendants sign in with an email code until SMS is live; the invite page signs them in and accepts in one step. |
| [0019](../decisions/0019-turnstile-captcha-on-sign-in.md) | Cloudflare Turnstile on every sign-in request, checked by Supabase; switched on in a set order. |
| [0020](../decisions/0020-notification-outbox.md) | Notifications go through an outbox table (queue and delivery log), not pgmq; contact copies encrypted on `users`. |
| [0021](../decisions/0021-stored-receipts-pdf-on-demand.md) | Receipts are stored and numbered per operator; the PDF is drawn from the stored copy on demand, not kept in a bucket; VAT designed in, off by default. |

## Risks

- **Gmail SMTP on dev** is limited to about 500 emails a day, and uses a personal mailbox's app password. Fine for testing; not for real users.
- **The remaining guessing risk on sign-in codes** (ADR 0019) is accepted for the pilot.
- **Mobile builds without the site key can't sign in** now that captcha is on. Ship the production build with both values before a store release.
- **Hosted settings live only in the dashboards** (SMTP, templates, OTP length, captcha). Staging and prod must repeat doc 22 §2.3 to §2.3c.
- **Migrations are applied by hand on dev** until the deploy workflow is switched on with staging. Merging code before its migration breaks the dev API (sign-in after item 12, prices and check-out after item 13).

## Still open

### Wave 3 (before Sprint 7)

| # | Work item | Findings | Status |
|---|---|---|---|
| 11 | CI green: lint, Prettier, OpenAPI regen, audit; workflows moved to the repository root | T-1 | **Done** |
| 12 | Notifications: outbox, retries, SMS fallback, quiet hours, reminders, push registration, invite emails (ADR 0020) | L-1, O-4, U-6 | **Done** |
| 13 | Overstay: priced from the booking's plan, unpaid block, ops waive with audit; extensions from the booking's plan | L-3, L-4, U-2, U-12, P-14 | **Done** |
| 14 | No-shows skip lots whose gate hasn't synced | G-4, G-12 | **Done** |
| 15 | Receipts: stored, numbered, PDF in a private bucket, emailed | L-5, O-4 | **Done** (PDF on demand, ADR 0021) |
| 16 | Postgres contract tests for new store methods and cross-tenant endpoints | T-2, T-3, T-4, S-11 | **Done** |

### Owner actions

- [ ] Create staging (Supabase and Vercel). No sprint has run its demo on staging yet.
- [ ] Verify a sending subdomain in Resend (for example `parkly.cicod.com`). Then swap Supabase SMTP back to Resend and delete the Google app password.
- [ ] Add `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and `EXPO_PUBLIC_TURNSTILE_ORIGIN` to the `production` EAS environment before the next store build.
- [ ] Choose an SMS provider. Phone becomes the default sign-in for drivers and attendants with no code change.
- [ ] Apply the item 13 migrations to dev, then merge `feat/s6-overstay`.
- [ ] When the Resend domain is verified: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` on `parkly-api`. With an EAS build in testers' hands: `PUSH_PROVIDER=expo`.
- [x] `WEB_BASE_URL` and `PORTAL_BASE_URL` set on `parkly-api` (Oct 30).

### Product follow-ups

- A **"New link"** button on invited team members, so a lost invite link can be reissued without cancelling.
- ~~Invite emails~~: built in item 12; they go out once real email is switched on.
