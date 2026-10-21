# Sprint 2 — Operators, lots, permits, verification: progress report

- **Status:** In progress. Story 1 (domain rules) is done.
- **Updated:** 2026-10-21
- **Entry check:** S1 was reviewed on 2026-10-21. Its gaps were closed or logged as carry-over (see `S1-report.md` § Review, doc 20 §6).

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Lot state machine, `canGoLive`/`listability`, submission gaps, verification checklist, permit dates + expiry reminders, rate-plan validation (`packages/domain/lot`) | FR-LOT-003/004/005/006/007, task 4 | **Done**: 153 tests, 100 % lines |
| 2 | Schema + migrations: operators, operator members, KYB docs, payout accounts, lots (PostGIS), hours/closures, photos, permits, verifications + items, rate plans; RLS + grants + indexes; `user_roles.operator_id` FK | tasks 1–6 | To do |
| 3 | Providers: `PaymentProvider.resolveAccount/createSubaccount` (Paystack + fake), Supabase Storage adapter + upload verification (MIME sniff, size, WebP re-encode, EXIF strip) | tasks 1–2 | To do |
| 4 | Operator API: create operator, business details, KYB documents, payout account | FR-LOT-001 | To do |
| 5 | Lots API: CRUD, opening hours, closures, photos, permits, rate plans, submit, pause/resume | FR-LOT-002/003/005/006, FR-OPS-005 | To do |
| 6 | Team invites (OWNER/MANAGER/ATTENDANT, lot scoping), revoke | FR-OPS-004 | To do |
| 7 | Admin API: review queues (KYB, permits, verifications, rate plans), lot status actions with reason; subaccount on KYB approval | FR-ADM-001, FR-LOT-006 | To do |
| 8 | Permit expiry job (`pg_cron` 06:00 WAT → `/internal/jobs/permit-expiry`) | FR-LOT-007, task 7 | To do |
| 9 | Portal screens: sign-up, onboarding wizard, lots, rate plans, permits, team | task 8 | To do |
| 10 | Admin screens: review queues, lot detail, status actions | task 9 | To do |

## Decisions (where the docs disagree)

| Topic | Docs | Decision |
|---|---|---|
| Photos needed before submission | doc 02 §3.3 "≥1 photo"; PRD FR-LOT-002 "3–10 photos" | 3–10, following the PRD (`MIN_LOT_PHOTOS`, `MAX_LOT_PHOTOS`) |
| Who moves a lot to LIVE | doc 02 §3.3: ADMIN_OPS; doc 03 §2.4: operator presses "Go live" | ADMIN_OPS, following doc 02 (AGENTS.md §10 makes doc 02 the authority on state machines). The operator resumes from PAUSED. |
| Go-live invariant | doc 02: permit + verification + rate plan; doc 03 adds KYB approved, payout active, ≥1 attendant | The gate also requires an active operator (`OPERATOR_NOT_ACTIVE`). A verified payout account is required at submission. "≥1 active attendant" is deferred to S5, when attendants can sign in. |
| Rate-plan approval | PRD FR-LOT-005 and doc 20: every change needs admin approval; doc 03 §2.2: only changes > 50 % | Every change needs approval, following the PRD |
| Validity boundary | doc 00: `expires_at > now()` | A permit or verification is invalid on its expiry / valid-until date itself (Lagos calendar day). The 06:00 job suspends that morning. |
| Operator self sign-up | doc 05 §4: "operators invited or self-signup with email confirmation"; local config has email sign-up off | Enable email sign-up with confirmation. Email users get no role until they create an operator and become OWNER. Phone users still get DRIVER. |
| New error codes | FR-LOT-003 Gherkin names `LOT_PERMIT_INVALID` | Added `LOT_PERMIT_INVALID` (422) and `LOT_HAS_FUTURE_BOOKINGS` (409) to contracts and doc 02 §11 |
