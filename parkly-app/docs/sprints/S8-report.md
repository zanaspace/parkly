# Sprint 8 — Admin console, support and compliance: report

- **Status:** **Code complete.** All eight tasks are built. Stories 1 and 2 (support search and booking actions) are merged on `main`. Tasks 3 to 8 are on stacked branches, pushed and waiting for review and CI. The exit criteria cannot be met yet: there is no staging to run them on.
- **Updated:** 2026-11-12
- **Entry check:**
  - S7 is code complete (S7 report): tasks 1 to 6 and the flexible arrival work are merged. Open from S7: P-9, the pen-test vendor, and staging.
  - Doc 20 puts the operator finance pages in the portal before S8. They are merged (`feat/s7-portal-finance`).
- **Built alongside S8, not in doc 20:** a fix so a password can never land in a web address, a fix to CI, and a repair of a database that was missing a migration. See [Fixes made on the way](#fixes-made-on-the-way).

## Goal (doc 20)

Parkly ops can run the pilot: find anything, fix bookings, handle incidents, suspend lots, and meet NDPA obligations.

## Doc 20 Sprint 8 tasks

| # | Task | Status | Where |
|---|---|---|---|
| 1 | Support search, booking timeline, masked contact details with an audited reveal | **Done** | `main` (#95) |
| 2 | Booking actions (cancel, refund, resend) with reasons; second approver above ₦50,000 | **Done**, except **relocate** (its own inventory rules) | `main` (#96) |
| 3 | Incident model and console; S1 paging hook | **Done**, except attendant and driver reports (FR-INC-002, 003) and evidence photos | `feat/s8-incidents` |
| 4 | Lot suspension workflow: affected bookings and driver notices | **Done** | `feat/s8-lot-suspension` |
| 5 | Platform settings and feature flags UI (super admin) | **Done** | `feat/s8-platform-settings` |
| 6 | DSAR export, deletion and pseudonymisation job, retention purges | **Done in part**: see [what is not built](#task-6-data-requests-account-erasure-and-retention-in-plain-words) | `feat/s8-dsar` |
| 7 | Admin hardening: separate domain, IP allowlist, 15-minute idle timeout, re-authentication | **Done in part**: the separate domain is not built | `feat/s8-admin-hardening` |
| 8 | Counsel review of terms and privacy text; legal pages in the apps | **Drafts written and shown in the apps.** Counsel review is still to do | `feat/s8-legal-pages` |

## Task 1: support search and the booking page, in plain words

**What support can now do.** One search box finds a booking by its code (`PK-3MV7BU`), the driver's phone, the plate, or a payment reference. The booking page shows the driver as first name, a masked phone number and the plate, plus a timeline of everything that happened: status changes, payments, refunds, gate events and overstay. To see the full phone number or email, support must give a reason, and the reveal is recorded.

## Task 2: staff cancel, refund and resend, in plain words

- **Cancel** (support, ops, finance): follows the same rule a driver gets. If more is due, it is a separate refund.
- **Refund** (finance; support up to ₦10,000 a booking): staff choose an amount, up to what is left. It comes off the parking price first, then the fee.
- **A second approver above ₦50,000.** A larger refund waits in a queue. A different finance admin has to approve it. The person who asked cannot. The database enforces that too.
- **Resend the ticket:** queues the confirmation again, at most once a minute.
- **Not built:** relocating a booking to another car park. It needs its own inventory rules.

## Task 3: incidents, in plain words

**The idea.** When something goes wrong at a car park (access refused, safety, theft, an overcharge), support or ops logs it against the car park, and optionally against a booking.

- **Levels S1 to S4** (critical to low), with a response deadline: S1 15 minutes, S2 1 hour, S3 8 hours, S4 48 hours. The queue shows the worst first, then the oldest, and marks overdue ones.
- **Status flow:** open, triaged (someone takes it), resolved (with how), closed. A resolved one can be reopened for 7 days. Every step is recorded.
- **Escalation.** A critical incident calls a paging hook. Until an on-call service is chosen, the hook writes an error-level log line. The incident that brings a car park to **3 incidents in 30 days** is recorded once as "flagged for review", and the queue shows a "car parks to review" panel.
- **In the console:** an Incidents page (queue, log form, detail with notes and the next step) and a link from the booking page that starts a report with the booking and car park filled in.
- **Not built:** reports from attendants and drivers, evidence photos, and a link to a parking session.

## Task 4: lot suspension, in plain words

- **Before suspending**, the lot page shows the impact: how many paid bookings are waiting to start, how many cars are parked now, how many unpaid holds, and the refund total.
- **Suspending still honours existing bookings** (doc 03). Drivers are only told when ops chooses to cancel them.
- **Cancel the paid bookings** is a second step, only once the car park is suspended. It cancels each paid, not-started booking with a **full refund**, however close to the start, tells each driver by SMS, push and email, and records each one. Cars parked now and unpaid holds are left alone. It handles 100 at a time and is safe to run again. It is for ops, finance and super admins.
- **Not built:** nearby alternatives in the notice, relocation, and a second approver for the bulk refund.

## Task 5: platform settings and feature flags, in plain words

- A super admin can change 11 business settings (default commission, overstay ceiling, VAT, unpaid hold, early arrival, free cancellation, no-show and overstay grace, the two refund limits) and switch 11 feature flags. Each change needs a reason and is recorded with the old and new value.
- **Only settings the API reads today** are listed, so a change always has an effect. The 10 flags from doc 02 are stored but nothing obeys them yet. The page says so. One extra flag, `four_eyes_verification`, **is** obeyed now by lot review.
- **Not built:** flags per operator or by percentage, flags for the mobile and web apps, and settings nothing reads yet.

## Task 6: data requests, account erasure and retention, in plain words

**What a driver can do now.**
- **Download my data** in the app: a file with the profile (phone as its last four digits), vehicles, consents and bookings with their payments and refunds. The link lasts 15 minutes; the file is deleted after 7 days.
- **Delete my account.** Blocked while a booking has not finished or an overstay is unpaid. There are 30 days to change their mind (**Keep my account**).

**What happens at 30 days.** A nightly job deletes the Supabase Auth user first, so a failure can be retried before our own data is touched. Then, in one step, it anonymises the user, removes devices, roles and notifications, deletes vehicles no booking uses and scrubs the rest, and replaces plates on bookings and sessions with a one-way code. Bookings and payments stay (financial records). Only counts are recorded.

**Retention job.** Nightly: expired idempotency keys, notifications after 90 days, export files after 7 days.

**Compliance.** A Privacy page lists every request with first name, due date and an overdue mark.

**Not built (listed in doc 06):** the confirmation message before erasure; files in storage owned by the account; re-applying erasures after a database restore; legal holds; deletion at outside vendors; the other retention policies in doc 06 (24-month pseudonymisation, incidents, and so on).

**A schema change to approve.** `users` no longer has a foreign key to Supabase's `auth.users`. The Auth user is deleted at erasure, and the anonymised row has to stay because bookings and payments point at it.

## Task 7: admin hardening, in plain words

- **Network allowlist.** `ADMIN_IP_ALLOWLIST` lists the addresses allowed to reach the admin API and console. It is checked before any role. Empty means off. A typo stops the API starting and makes the console refuse everyone, so a mistake never opens the door.
- **Idle and session limits.** The console signs an admin out after **15 minutes** idle (doc 20; doc 05 said 30, so the shorter applies) or **12 hours** from sign-in, and says why.
- **Step-up.** Approving or rejecting a refund, changing a commission rate, platform settings, feature flags and the bulk cancel after a suspension need an authenticator-app check from the last 5 minutes. The time comes from the signed token, so it cannot be claimed. The console offers "Confirm now" and returns the admin to the page.
- **Not built:** a separate admin domain (a Vercel and DNS decision), the break-glass account, Google Workspace sign-in, and a Vercel Firewall allowlist (not on the Hobby plan).

## Task 8: legal pages, in plain words

- **Three drafts, shown in the apps.** A Privacy Notice and Driver Terms for drivers, and Operator Terms (with a data section) for car parks. They are on the driver website at `/legal`. The driver website footer links Terms, Privacy and "For car parks". The operator portal footer links the Operator Terms and "How we handle your data". The app's sign-up screen and the operator sign-up checkbox link to them.
- **Written from the code, not the plan.** The Privacy Notice says how data is collected, what it is used for with its lawful basis, who sees it (car parks, staff, 11 outside providers), how long it is kept and how to use each right. Anything in doc 06 that is not built (analytics, ratings, saved places, driver ID checks) is left out.
- **Drafts for a lawyer.** Every page says so. Liability, risk of loss, governing law, the first-payout hold, and who is the data controller for operator-visible data are marked `DRAFT FOR COUNSEL` and not guessed.
- **Company details missing.** Company name, CAC number, address, emails and DPO live in `apps/web/lib/legal/entity.ts`; until filled, the page shows `[… : to be completed]`.
- **The counsel pack is [doc 23](../23%20-%20Legal%20Pages%20and%20Counsel%20Review%20Pack.md):** every statement with where it comes from and whether it is built, what to fill in and bump before launch, and the 12 points counsel must settle.

## Fixes made on the way

| Problem | Fix |
|---|---|
| Opening a dev app from a LAN address (`192.168.x.x`) left the page without its scripts; the sign-in form then submitted as a GET and **put the email and password in the web address**. The Turnstile check never showed either. | Forms post by default (`ActionForm`, attendant PIN form). `DEV_ORIGINS` lets a LAN address load properly. `fix/forms-never-get-submit` |
| The refund reason on the booking page used a native dropdown, and so did the incident form. | Both use the platform dropdown. No native `<select>` is left in the apps. |
| CI's database job failed after applying every migration: the mail container clashed on a port. The Supabase CLI had renamed it `mailpit`; the workflow still excluded `inbucket`. | One-line fix in the workflow. `fix/ci-supabase-mailpit` |
| CI's Postgres test failed on the privacy code: a `Date` inside a raw SQL fragment. The in-memory tests could not catch it. | The query builder is used instead, and the purge casts the time. |
| **Staging's booking page crashed** with "An error occurred". The API log said `relation "refund_requests" does not exist`: a migration had been missed, and a first attempt to apply it had left a half-applied state ("already exists" errors). | Re-runnable versions of the two migrations were written and placed in the main folder's migrations folder. |

## How the work was checked

| Area | What was tested |
|---|---|
| Incidents | Domain: status rules, deadlines, queue order, the 3-in-30-days flag. API: logging, linking a booking, paging and a failed page, flag raised once, 30-day window, queue order and overdue, the full walk, the 7-day reopen window, notes. A store test that also runs on Postgres in CI. |
| Suspension | Impact counts and masking, roles, a full refund with notices and records, a safe second run, a refund right before the start, only after suspending. |
| Settings and flags | Limits, on/off values, unknown keys, a bad saved value, super admin only, nothing changed on refusal. |
| Privacy | Obligations, cancel, export and download, ownership, erasure end to end, pseudonyms, a retry after Auth was down, retention, the compliance queue, the Supabase admin call. |
| Hardening | The allowlist (range, proxy chain, before roles, off, typo), every step-up action with an old check, a password-only session and a fresh check, expiry by the token's own time, the admin session rules. |
| Legal | The notice names every kind of data, source, lawful basis, provider, retention period and right; says what it does not collect; makes no promise the app cannot keep. |
| Every change | Lint, typecheck, `next build`, prettier, OpenAPI regenerated, RBAC matrix rows for every new route. |

Final counts: API 1530, domain 624, db 103, admin 66, mobile 94, web 28, portal 108. API branch coverage is exactly at the 85% threshold.

**The tests that cannot run on this laptop.** There is no Docker, so the Postgres store tests only run in CI. The in-memory store passed them, and CI then found a real driver problem in the privacy code. The erasure and purge steps after that point had not yet run against real Postgres when this was written.

## Decisions

| Decision | Why |
|---|---|
| S1 incidents have a 15-minute response time | Doc 03 gives 1 hour, 8 hours and 48 hours; 15 minutes for critical is our choice |
| A critical incident calls a paging hook that, for now, writes an error log | No on-call provider chosen yet (owner decision) |
| Suspending honours existing bookings; cancelling and refunding them is a separate, reasoned step | Doc 03; drivers are only told when ops cancels |
| The bulk cancel has no second approver | It is recorded with a reason; add maker-checker if you want one |
| Settings: only those the API reads are editable | A change must always do something |
| Settings changes have no Idempotency-Key | Setting a value is repeatable |
| Auth user deleted before our own data is anonymised | A failure can be retried before any data is touched |
| `users` has no foreign key to `auth.users` | The anonymised row must outlive the Auth user |
| Plates become a salted one-way code at erasure (salt thrown away) | History still groups for one person, but cannot be reversed or matched to another |
| Consent rows keep their IP hash | They are proof of consent |
| Export is built at once and downloaded with a 15-minute link | Pilot volumes are small; the file is deleted after 7 days |
| Idle timeout is 15 minutes | Doc 20 task 7; doc 05 said 30, so the shorter applies |
| Allowlist is checked in the API and in the admin app | A second lock behind the Vercel Firewall rule, which Hobby does not have |
| Step-up is read from the token's `amr` time | The client cannot claim it |
| Legal text is data in `apps/web/lib/legal`, one copy for every app | Counsel reviews one place |
| The Privacy Notice lists only providers actually in the code | Do not name Better Stack, Google Maps or Flutterwave until they are used |
| Each app's footer links its own audience's documents | Drivers and operators have different documents |

## Risks

- **Migrations are still applied by hand.** This already broke staging once. Apply the list under "Owner actions" in order, and treat any "already exists" error as a half-applied file.
- **No staging**, so no S8 exit criterion can be met.
- **Postgres-only code** (account erasure, the purge) is only proven by CI.
- **The step-up check assumes Supabase puts the authenticator time in the token's `amr` claim.** It was tested with tokens we sign ourselves, not against real Supabase tokens. If the claim is missing, every sensitive action will show "Confirm now" forever.
- **Allowlist mistakes lock the console.** Keep a way to change the Vercel variable before turning it on.
- **Vercel Hobby** keeps about 30 minutes of runtime logs and has no firewall allowlist. Move to Pro before staging.
- **The legal text is not legal advice.** Nothing should be shown to the public as final until counsel has signed it off.
- **The unfinished parts of erasure** (confirmation message, storage files, restore) are a launch risk under the NDPA.

## Exit criteria (doc 20 S8)

| Criterion | State |
|---|---|
| Support can resolve the top 10 support scenarios (doc 03) end to end on staging | **Not met.** The tools exist (search, timeline, cancel, refund, resend, incidents, suspension); staging does not. |
| A data export and a deletion are done on a test account | **Not met.** Both are built and tested in memory; neither has run against a real database. |

## Still open

### S8 tasks

- Relocating a booking (task 2).
- Attendant and driver incident reports, evidence photos, session link (task 3).
- The unbuilt parts of erasure and retention listed under task 6.
- A separate admin domain, the break-glass account, Google Workspace sign-in (task 7).
- Counsel review of the legal text (task 8).

### Owner actions

- [ ] **Apply these migrations to dev (and staging), in order:**
  1. `20261106211220_reconciliation_ledger_results.sql`
  2. `20261107204806_support_search_plate_index.sql`
  3. `20261107214248_refund_requests.sql` then `20261107214300_refund_requests_grants.sql`
  4. `20261112080127_incidents.sql` then `20261112080140_incidents_grants.sql`
  5. `20261112095010_dsar_erasure.sql` then `20261112095020_erasure_log_grants_cron.sql`

  The files are in the main folder's migrations folder. Two of them are the re-runnable versions.
- [ ] Merge in this order: `fix/ci-supabase-mailpit`, the two `fix/` branches, `feat/s8-incidents`, `feat/s8-lot-suspension`, `feat/s8-platform-settings`, `feat/s8-dsar`, `feat/s8-admin-hardening`, `feat/s8-legal-pages`. Before pulling into the main folder, delete its untracked copies of the migration files.
- [ ] **Vault secrets for the two new cron jobs** (`account-erasure`, `retention-purge`): `job_hmac_secret` and `api_base_url` (doc 22 section 2.3d).
- [ ] **`ADMIN_IP_ALLOWLIST`** on both `parkly-api` and `parkly-admin` (doc 22). Test from a phone off the office network.
- [ ] **`NEXT_PUBLIC_WEB_URL`** (portal) and **`EXPO_PUBLIC_WEB_URL`** (mobile) set to the website address.
- [ ] Fill `apps/web/lib/legal/entity.ts`; give counsel [doc 23](../23%20-%20Legal%20Pages%20and%20Counsel%20Review%20Pack.md); when approved, set `draft: false` and the three `legal.*_version` settings to the pages' date (this makes everyone accept again).
- [ ] Confirm each provider's data processing agreement and region (doc 05 section 18.1.1) and keep the Privacy Notice's list the same.
- [ ] Choose an on-call service for critical incidents.
- [ ] Create staging, then run the two exit criteria on it.
- [ ] Watch CI on `feat/s8-dsar` first: it is the first run of the erasure and purge steps against real Postgres.
