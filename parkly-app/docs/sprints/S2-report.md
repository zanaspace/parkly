# Sprint 2 — Operators, lots, permits, verification: report

- **Status:** **Done (code complete)** on 2026-10-22. Every story and slice is built, tested and merged to `main` (PRs #1–#15) and deployed to the dev environment. Two exit checks still need owner steps on dev, and the staging demo waits for staging (owner decision: wait). See § Exit criteria.
- **Updated:** 2026-10-22
- **Entry check:** S1 was reviewed on 2026-10-21. Its gaps were closed or logged as carry-over (see `S1-report.md` § Review, doc 20 §6).

## Summary

Operators can now sign up, verify their business (KYB documents + bank account), create lots with photos, opening hours, prices and a LASPA permit, and submit them. Parkly staff review KYB (which creates the operator's Paystack subaccount) and review each lot's permit, prices, photos and site visit, then take it live. A daily job reminds operators before a permit expires and suspends the lot when it does. Owners build a team by inviting managers and attendants.

| Who | Where (dev) | What they can do now |
|---|---|---|
| Operator owner | Portal https://parkly-portal.vercel.app | Sign up → business details + agreement → MFA → KYB documents + bank account → submit KYB → create lots (details, location, capacity, amenities, hours, 3–10 photos) → prices → LASPA permit → submit lot → see review outcomes and reasons → invite and remove team members |
| Operator manager | Portal | Accept an invite (email), set up MFA, manage lots, invite attendants |
| Parkly staff (ops, compliance, super admin) | Admin console https://parkly-khaki.vercel.app | KYB queue and review (approve creates the Paystack subaccount); lot queue and review (permit with LASPA note, prices, photos, site visit checklist), go live, send back, suspend, reinstate, archive; audit log |
| System | API https://parkly-api-six.vercel.app + `pg_cron` | Permit reminders (30/14/7/1 days) and auto-suspend on expiry, daily 06:00 Lagos |

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Lot state machine, `canGoLive`/`listability`, submission gaps, verification checklist, permit dates + expiry reminders, rate-plan validation (`packages/domain/lot`) | FR-LOT-003/004/005/006/007, task 4 | **Done**: 153 tests, 100 % lines |
| 2 | Schema + migrations: `files`, operators, operator members, KYB docs, payout accounts, lots (PostGIS), hours/closures, photos, permits, verifications + items, rate plans; RLS + grants + FK/hot-path indexes; `user_roles.operator_id` FK | tasks 1–6 | **Done**: migrations `20261021091000`, `20261021091100`. Dry-run on the dev DB in a rolled-back transaction: all apply, every table has RLS, no client grants. Schema tests check that enums match the domain. |
| 3 | Providers: `SettlementProvider` (Paystack banks, resolve, subaccounts + fake), Supabase Storage adapter (+ fake that holds bytes), `MalwareScanner` (fake; vendor via ADR 0013); upload pipeline (presign → complete: size + SHA-256 + magic bytes, WebP re-encode with EXIF stripped, PDF scan, 10-min window); 7 private buckets with size/type limits | tasks 1–2 | **Done**: 58 new tests; adapters tested against Paystack-shaped fixtures (not yet recorded from the sandbox, see `apps/api/test/fixtures/paystack/README.md`); bucket migration dry-run on the dev DB (rolled back) |
| 4 | Operator API: create operator, business details, KYB documents, payout account | FR-LOT-001 | **Done** in slices A + B |
| 5 | Lots API: CRUD, opening hours, photos, permits, rate plans, submit | FR-LOT-002/003/005/006, FR-OPS-005 | **Done** in slices C + D. Closures and operator pause/resume are carried over (§ Carried over). |
| 6 | Team invites (OWNER/MANAGER/ATTENDANT, lot scoping), revoke | FR-OPS-004 | **Done** in slice F2 (+ invite page fix, PR #15) |
| 7 | Admin API: review queues (KYB, permits, verifications, rate plans), lot status actions with reason; subaccount on KYB approval | FR-ADM-001, FR-LOT-006 | **Done** in slices E1 + E2 |
| 8 | Permit expiry job (`pg_cron` 06:00 WAT → `/internal/jobs/permit-expiry-check`) | FR-LOT-007, task 7 | **Done** in slice F1 |
| 9 | Portal screens: sign-up, onboarding wizard, lots, rate plans, permits, team | task 8 | **Done** across slices A–F |
| 10 | Admin screens: review queues, lot detail, status actions | task 9 | **Done** in slices E1 + E2 |

## Vertical slices (from 2026-10-21)

After story 3 the remaining work is built as slices that each ship API + portal screens together, so every step can be tried on the live dev portal (https://parkly-portal.vercel.app). Same scope and tests as stories 4–10, reordered.

| Slice | Scope | Status |
|---|---|---|
| A | Operator sign-up (email + confirmation) → business details → owner; edit details until KYB is submitted | **Done** (#4, #5) |
| B | KYB documents (upload pipeline) + payout account (bank resolve) + submit KYB | **Done** (#6) |
| C | Lot wizard: details, map pin, capacity, amenities, hours, photos | **Done** (#7–#9) |
| D | Permit, rate plans, submit lot for verification | **Done** (#10) |
| E | Admin review queues → subaccount on KYB approval → lot LIVE | **Done** (E1 KYB review #11, E2 lot review + go-live #12) |
| F | Team invites; permit expiry job | **Done** (F1 permit expiry job #13, F2 team invites #14, invite page #15) |

### Slice A: what was built

- **Permissions:** a `signed-in` level for three actions open to users with no role yet (read own profile, sign out, create an operator); `operator:read` (owner, manager), `operator:update` (owner). Everything else stays deny-by-default.
- **API:** `POST /v1/operators` (one transaction: operator + OWNER membership + role; advisory lock so a double submit can't create two), `GET`/`PATCH /v1/operators/{id}` (other operators → 404; PATCH locked once KYB is submitted). CAC, TIN and phone are encrypted at rest; the audit log records changed field names only.
- **Consents:** new type `OPERATOR_AGREEMENT` (migration `20261021131441`); version in `legal.operator_agreement_version` (migration `20261021131500`); `/v1/me` reports it.
- **Portal:** `/sign-up`, `/onboarding` (business details + agreement), `/business` (view/edit), home shows business + KYB status; role-less users are routed to onboarding; the email confirmation link bootstraps the session. New `Select` component in `packages/ui`.
- **Tests:** +12 API (operators), +3 RBAC matrix rows, +6 domain authz, +18 contracts, +1 UI, +7 portal, +1 store contract.

### Slice B: what was built

- **Rules** (`packages/domain/operator`): required documents (CAC certificate, director ID, proof of address), `kybSubmissionGaps`, `accountNameMatches` (ignores case, punctuation and Ltd/Limited/Nig/Plc).
- **Permissions:** `operator:kyb:read` (owner, manager), `operator:kyb:manage` (owner), `bank:list`.
- **API:** KYB document presign → browser uploads to private Storage → complete (story 3 checks, PDF scan, image re-encode) → recorded; delete; bank list (cached 1 h); payout account set/read; KYB submit with a list of missing items. Errors `KYB_INCOMPLETE`, `UPLOAD_NOT_RECEIVED`, `UPLOAD_REJECTED`.
- **Portal:** `/kyb` with one upload slot per required document (SHA-256 computed in the browser, file goes straight to Storage), bank form showing the resolved name and a mismatch notice, submit with missing items listed; home links to it.
- **Tests:** +14 API (kyb), +6 RBAC matrix rows (the matrix now runs without rate limiting, which is tested elsewhere), +15 domain, +3 authz, +7 contracts, +19 portal copy, +1 store contract.

### Slice C: what was built

- **Rules** (`packages/domain/lot/draft`): amenities and vehicle types, capacity (bookable ≤ total), Lagos State bounds for the pin, opening-hours validation (one window per day, overnight allowed), slugs.
- **Permissions:** `lot:read`, `lot:manage` (owner and manager).
- **API:** lots list/create/read/update (optimistic `version`), opening hours, photos (presign → browser upload → complete with WebP re-encode → list/delete, max 10). Only DRAFT lots change for now.
- **Portal:** `/lots`, `/lots/new`, `/lots/[id]` (photos, hours grid, details); home links to it. Browser upload helpers shared with KYB.
- **Checked against the real dev database** (rolled-back transaction): map location round-trips exactly, other operators can't load the lot, stale edits are refused, overnight hours, duplicate slugs.
- **Tests:** +13 API (lots) +1 cross-operator, +4 RBAC matrix rows, +27 domain, +2 authz, +5 contracts, +6 portal, +1 store contract.

### Slice D: what was built

- **API:** permit scan presign → browser upload → permit with dates checked (`PERMIT_EXPIRED` for an expired one) and the scan re-checked; prices per product (`PUT`, waits for approval, replaces the pending change, domain rules → `RATE_PLAN_INVALID`); submit DRAFT → PENDING_VERIFICATION through `checkLotTransition` + `submissionGaps`, with the missing items listed. The lot response now carries its latest permit and current prices.
- **Store:** permits (create, latest), rate plans (submit/replace pending, current), `lots.setStatus` that only moves from the expected status.
- **Portal:** lot page gains Prices (naira in, kobo via `nairaToKobo`; shows live vs awaiting approval), LASPA permit (number, dates, scan; warns when < 30 days to expiry), and Submit for verification with the missing items.
- **Tests:** +8 API (permit, prices, submit), +2 RBAC matrix rows, +2 contracts, +9 portal, +1 store contract. API: 426 tests, branches 86.9 %.

### Slice E1: KYB review

- **Permission** `kyb:review` (ADMIN_OPS, ADMIN_COMPLIANCE, SUPER_ADMIN; aal2).
- **API:** queue, detail (decrypted details, documents, masked bank, owner; audited), 5-minute document links (audited), approve/reject. Approve creates the Paystack subaccount and saves its code before activating, so a retry after a failure never creates a second subaccount; then one transaction activates the operator, approves the documents and activates the payout account with the full account number erased (the DB CHECK refuses ACTIVE without a code). Reject requires a reason the owner sees.
- **Admin console:** "KYB to review" queue and review page (details, open documents in a new tab, bank-name warning, approve / reject with reason). **Portal:** the KYB page shows the rejection reason.
- **Checked against the dev database** (rolled back): queue, reject, resubmit clears the reason, approve refused without a subaccount code, approve, second approve refused.
- **Also:** the API typecheck now covers `test/` (the RBAC matrix and integration tests were never type-checked).
- **Tests:** +12 API (admin KYB), +2 RBAC matrix rows, +2 authz, +1 contracts, +1 store contract. API: 459 tests.

### Slice E2: lot review and go-live

- **Permissions:** `lot:review` and `permit:review` (ops, compliance, super admin); `rate-plan:review` and `lot:verify` (ops, super admin). Status moves also go through the domain transition table, so only ops/super admin take a lot live or reinstate it; compliance can suspend.
- **API:** lot queue + detail with the listing gate; permit scan link (audited) and review with the LASPA check note; price review (approval retires the previous live price in the same transaction); photo review (approval copies the photo to `lot-photos-public`); site visit checklist and review (required items, four-eyes flag, lower count replaces capacity); status moves (go live, send back, suspend, reinstate, archive) with reasons. New codes `VERIFICATION_CHECKLIST_FAILED`, `FOUR_EYES_REQUIRED`.
- **Admin console:** "Lots to review" queue (waiting / live / suspended) and a review page: details, map link, permit (open scan, approve with note / reject), prices, photo thumbnails with approve/reject, site visit form (phone-friendly, "Use my location", Lagos time), go-live checklist, send back / suspend / reinstate / archive. CSP allows images from the Supabase host only for the signed photo links.
- **Portal:** the lot page explains each status and shows the reason when Parkly sends a lot back or suspends it.
- **Checked against the dev database** (rolled back): queue with operator name, permit approve once, price approve retires the old one, photo approval, visit with GPS round-trip, capacity lowered on approval, LIVE sets the verified badge.
- **Tests:** +18 API (admin lots), +2 RBAC matrix rows (7 write routes covered in admin/lots.spec), +3 authz, +4 contracts, +1 store contract, +4 admin. API: 498 tests, branches 86.2 %.

### Slice F1: permit expiry job

- **Job** `permit-expiry-check` (FR-LOT-007, doc 01 §5.8), scheduled by migration `20261021200000_permit_expiry_cron.sql` at 06:00, 07:00 and 08:00 Lagos (the later runs only pick up leftovers). Per APPROVED permit: the nearest 30/14/7/1-day reminder not yet sent (a missed run never sends a burst); on the expiry date the permit becomes EXPIRED and a LIVE or PAUSED lot left without a valid permit is SUSPENDED by SYSTEM with a reason the operator sees (`lot.suspended`, `permit.expired` audited). A renewal that is already approved keeps the lot live; a replaced permit gets no reminders.
- **Time travel for the demo:** outside production a signed call may pass `{"asOf": "YYYY-MM-DD"}` (doc 22 §2.5).
- **Emails** go to the operator's contact email through a log-only sender until the email provider (Resend) and the notification outbox arrive in S6.
- **Checked against the dev database** (rolled back): due list, reminder buckets, reminders never move backwards, expire once.
- **Tests:** +8 job, +2 registry, +1 store contract. API: 509 tests.

### Slice F2: team invites

- **Permissions:** `operator:members:invite` (owner, manager; managers may invite attendants only, `FORBIDDEN_ROLE_GRANT`), `operator:members:remove` (owner).
- **API:** team list (members + open invites), invite (manager by email, attendant by phone with optional lots), cancel/remove (role grant deleted, sessions and devices revoked), `/auth/invites/accept` for the invited account only. Contact details are stored only as blind-index hashes and the invite token as a hash. Attendants' lot scope now feeds authorisation (`lot:checkin` in S5).
- **Portal:** Team page (`/team`) with invite form, one-time link (copy / WhatsApp), remove and cancel; `/invite/[token]` to accept (sign in or sign up first, then back to the invite); home shows the team summary.
- **Checked against the dev database** (rolled back): owner listed, invite, find by contact and token, accept with role grant, accept twice refused, owner can't join twice, remove drops the role.
- **Tests:** +11 API (team), +1 store contract, +2 authz, +2 contracts, +2 portal. API: 521 tests.

### Invite page fix (PR #15)

- The invite page now says who invited you and as what before sign-in (public, token-gated, rate-limited `POST /v1/invites/preview`). Managers get sign in / create account, or their signed-in email with Accept and "Sign out and use another account"; attendants are told to accept in the attendant app, with no sign-up offered; expired and used links say so. Found when an attendant invite was opened with an email account.

## Decisions (where the docs disagree)

| Topic | Docs | Decision |
|---|---|---|
| Photos needed before submission | doc 02 §3.3 "≥1 photo"; PRD FR-LOT-002 "3–10 photos" | 3–10, following the PRD (`MIN_LOT_PHOTOS`, `MAX_LOT_PHOTOS`) |
| Who moves a lot to LIVE | doc 02 §3.3: ADMIN_OPS; doc 03 §2.4: operator presses "Go live" | ADMIN_OPS, following doc 02 (AGENTS.md §10 makes doc 02 the authority on state machines). The operator resumes from PAUSED. |
| Go-live invariant | doc 02: permit + verification + rate plan; doc 03 adds KYB approved, payout active, ≥1 attendant | The gate also requires an active operator (`OPERATOR_NOT_ACTIVE`). A verified payout account is required at submission. "≥1 active attendant" is deferred to S5, when attendants can sign in. |
| Bank account number | doc 02: `account_number` [enc]; doc 06 §3.5: bank details held only at the provider; PRD: subaccount created only after admin approval | Keep the number encrypted in `pending_account_number_enc` only until the subaccount is created on KYB approval, then null it. Docs 02 and 06 updated. |
| Storage objects | doc 06 §1.2 + doc 02 §2.9: one `files` row per object | KYB docs, photos, permit scans and verification evidence reference `files` (class, retention, mime, size, sha256) instead of storing paths. |
| Rate-plan rejection | doc 02 enum has no rejected state | Added `REJECTED` (with `rejection_reason`) so a rejected change keeps its history |
| Upload URL lifetime | doc 05 V12: signed upload URLs ≤ 10 min; Supabase upload URLs last 2 h and cannot be shortened | The 10-min window is enforced when the upload is completed: late uploads are deleted and REJECTED (`EXPIRED`). |
| `lot-photos-public` bucket | doc 05: every bucket private; doc 06 omits it from the private list | Created **private** for now; S3 decides between a public CDN bucket for approved C1 photos and signed URLs. |
| Malware scanning vendor | doc 05: "chosen by ADR in Sprint 2" | ADR 0013 (Proposed): interface + fake built; shortlist and criteria listed; **owner to choose the vendor**. Prod config refuses the fake scanner. |
| Rate-plan approval | PRD FR-LOT-005 and doc 20: every change needs admin approval; doc 03 §2.2: only changes > 50 % | Every change needs approval, following the PRD |
| Validity boundary | doc 00: `expires_at > now()` | A permit or verification is invalid on its expiry / valid-until date itself (Lagos calendar day). The 06:00 job suspends that morning. |
| Operator self sign-up | PRD silent; doc 03 O-01 and the doc 20 S2 demo describe self sign-up; doc 05 §4 allows invite or self sign-up with email confirmation | Self sign-up with email confirmation (confirmed by the product owner on 2026-10-21). Email users get no role until they create an operator and become OWNER. Phone users still get DRIVER. |
| Operator sign-up order | doc 03: O-01 sign-up (email, phone OTP, agreement) → O-02 MFA → O-03 business details | Sign-up is email + password only. Agreement + Privacy are accepted on O-03, where the operator is created (so the consent is tied to the business). MFA follows O-03, because MFA is mandatory for the OWNER role, which exists only from O-03. Owner phone OTP is not in the MVP; the contact phone is captured on O-03. Doc 03 updated. |
| Payout name mismatch | doc 03 O-05: "Account name ≠ legal name: needs admin review" | Accepted and flagged (`nameMatchesLegalName: false`); the operator is told ops will check it; the admin queue (slice E) shows it. |
| Subaccount timing | doc 02: PUT creates the Paystack subaccount; PRD FR-LOT-001: only after admin approval | Created on KYB approval (slice E), following the PRD; PUT only resolves and stores. |
| Map pin | doc 03 O-11: address autocomplete + drop a pin on a map | Needs a Google Maps key (S3). Until then: latitude/longitude fields, "Use my current location" (browser geolocation, for use at the entrance) and a "Check it on a map" link (OpenStreetMap). Checked against Lagos State bounds. |
| Editing after submission | doc 02: PATCH with optimistic version, any status | Only DRAFT lots change until submission/verification (slice D) and booking capacity rules (S4, `LOT_CAPACITY_BELOW_COMMITTED`) exist |
| Photo thumbnails in the portal | not specified | Not shown yet: photos are private until approved, and there is no signed-download endpoint for operators. The list shows count, size and review status. |
| Price input | doc 00: money is integer kobo; "never compute prices on a client" | Operators type naira; the portal converts the typed amount to kobo with the domain's `nairaToKobo` (input parsing, not pricing). The API validates and stores kobo. |
| Rate-plan endpoint | doc 02: `POST .../rate-plans` | `PUT`: a change replaces the product's pending plan rather than adding another, matching the one-pending-per-product constraint |
| Operator email on KYB decision | doc 03 O-06: "Email when approved or rejected" | Not sent yet: notifications arrive in S6. The owner sees the status and the reason on the portal KYB page. |
| Who takes a lot live | doc 02 §3.3 and the domain table: ADMIN_OPS (PENDING_VERIFICATION → LIVE); doc 03 §2.4: the operator presses "Go live" (O-13) after "ready to go live" | Ops take it live from the review page, following doc 02 and the domain rules. The operator's own go-live button (O-13), the "ready to go live" email and the ≥ 1 active attendant check come with notifications (S6) and team invites (slice F). |
| Photos and go-live | FR-LOT-002 (3–10 photos); the listing gate does not mention photos | Photos are reviewed one by one; go-live does not wait for them. Only approved photos are copied to public storage for drivers (S3). |
| Rejected price change | not specified | The rejection reason is audited and the pending price disappears from the lot; while a lot is waiting for review, ops send it back with a reason the operator sees. Showing rejected prices on the portal is a follow-up. |
| Four-eyes on visits | doc 03 §4.1: when ops headcount ≥ 2 (flag `four_eyes_verification`) | Enforced when the flag is on; a missing flag row reads as off (one ops person on dev). Turn it on in `feature_flags` before launch (doc 17). |
| Suspend impact preview / bulk refund | doc 03 §4.3 | Bookings arrive in S4, so there is nothing to preview or refund yet; "honour existing bookings" is the only behaviour until then. |
| Visit evidence photos | doc 02: `evidence_file_ids` per checklist item | Not collected yet (X-03 field use, S8); the checklist, count, GPS and notes are recorded. |
| Permit reminder channels | doc 01 §5.8: email + SMS to owners/managers and ops; drivers with future bookings notified | Email to the operator's contact email only (logged until S6). SMS needs Termii, managers arrive with team invites (F2), and bookings with S4; the ops alert comes with notifications (S6). |
| Expiry job schedule | doc 01: daily 06:00 | 06:00 plus two catch-up runs at 07:00 and 08:00 Lagos, because one run handles at most 100 permits and pg_cron does not re-call on "remaining". |
| Invite delivery | doc 03 §2.3: SMS invite link | The portal shows the link once to copy or share on WhatsApp. SMS (Termii) and email invites arrive with notifications (S6). |
| Invite contact | doc 03: name + phone for every invite; doc 02: email or phone | Managers by email (they sign in to the portal by email); attendants by phone (attendant app, S5). Accepting needs the invited email/phone on the signed-in account. |
| Attendant acceptance | doc 03 §2.3 step 2: A-01 sets up a PIN after OTP | The API accepts attendant invites now; the attendant app with phone OTP + PIN is S5, so attendants keep their link until then. |
| One operator per owner | not stated | MVP: a user owns at most one operator (`OPERATOR_DUPLICATE`); revisit for multi-business owners |
| New error codes | FR-LOT-003 Gherkin names `LOT_PERMIT_INVALID` | Added `LOT_PERMIT_INVALID` (422) and `LOT_HAS_FUTURE_BOOKINGS` (409) to contracts and doc 02 §11 |

## Exit criteria (doc 20 S2)

| Criterion | Status |
|---|---|
| A lot goes DRAFT → PENDING_VERIFICATION → LIVE only with an approved permit + verification | **Met.** The domain transition table and `listability` gate every path to LIVE (truth-table tests); the API refuses go-live with `LOT_PERMIT_INVALID` / `LOT_NOT_LISTABLE` listing what is missing (admin/lots.spec); checked against the dev database (rolled back). |
| An expired permit auto-suspends in staging, with a time-travel test | **Met in tests; dev run pending.** The job suspends LIVE/PAUSED lots on the expiry date (permit-expiry.spec, fake clock). Staging does not exist yet (owner: wait); on dev it can be shown with `fn_invoke_job('permit-expiry-check', '{"asOf": …}')` once the Vault secrets are confirmed (doc 22 §2.5). |
| Tests named by doc 20: state machine, `canGoLive` truth table, expiry job with a fake clock, upload rejects wrong MIME / oversize, tenancy on all lot endpoints | **Met** (domain lot specs, permit-expiry.spec, uploads specs, RBAC matrix + cross-operator tests). |

**Demo script** (doc 20 S2), on dev:

| Step | Status |
|---|---|
| Operator signs up → adds bank → creates a lot with photos → uploads permit | Done by the product owner on dev (2026-10-21) |
| Admin approves KYB | Done on dev (creates a Paystack **test** subaccount) |
| Admin approves permit, verification → lot LIVE | Built (slice E2); owner run on dev to confirm |
| Fast-forward clock → lot SUSPENDED + emails | Built (slice F1); needs the Vault secrets; emails are logged until S6 |
| (extra) Owner invites a manager who accepts and sets up MFA | Done by the product owner on dev (2026-10-22) |

## Delivered (pull requests)

| PR | What |
|---|---|
| #1, #2, #3 | Story 3 providers + upload pipeline; Vercel API build fixes |
| #4, #5 | Slice A operator sign-up (+ EAS Node fix, any email at sign-up) |
| #6 | Slice B KYB documents, payout account, KYB submission |
| #7, #8, #9 | Slice C lot wizard (+ "saved" message fix, photo count fix) |
| #10 | Slice D permit, prices, lot submission |
| #11 | Slice E1 admin KYB review + Paystack subaccount |
| #12 | Slice E2 admin lot review + go-live |
| #13 | Slice F1 permit expiry job |
| #14 | Slice F2 team invites |
| #15 | Invite page says who invited you and as what |

Stories 1 and 2 (domain rules, schema + migrations) were committed before the PR flow started.

**Tests at sprint end** (all green; typecheck, lint and format clean): API 524 (branches ≥ 86 %), domain 335, contracts 53, DB schema 52, portal 68, admin 25, tokens 51, UI 8, UI native 4.

**Migrations added this sprint** (applied to the dev database by the owner in the SQL editor): `20261021090000_admin_revoke_sessions`, `20261021091000_operators_lots_permits`, `20261021091100_operators_lots_grants`, `20261021093000_storage_buckets`, `20261021131441_consent_operator_agreement`, `20261021131500_operator_agreement_version`, `20261021200000_permit_expiry_cron`.

## Carried over

| Item | Why | New target |
|---|---|---|
| Lot closures (holidays, events) and operator pause/resume | Only matter once drivers can book (closures block availability; pause needs the "N bookings affected" warning) | S4 (booking and availability) |
| Operator "Go live" button (O-13), "ready to go live" email, ≥ 1 active attendant in the go-live gate | Ops take lots live for now (doc 02); notifications are S6 and attendants sign in from S5 | S5/S6 |
| Attendant invite acceptance in an app (phone OTP + PIN) | The attendant app is S5 | S5 |
| Emails (permit reminders, suspension, KYB decision) and SMS invites | Email provider and notification outbox are S6; SMS needs Termii | S6 |
| Suspend impact preview and bulk cancel/refund | No bookings until S4 | S8 (admin console) |
| Site-visit evidence photos | Field use of X-03 | S8 |
| Rejected price changes shown on the portal | Not specified; ops send the lot back with a reason meanwhile | S7 (operator dashboard) |
| Staging and production environments, S2 demo on staging | Owner decision: wait | Before S4 |
| `supabase migration repair` for migrations applied by hand on dev; DB integration tests in CI | Remote changes must go through CI (AGENTS.md §4); CI secrets not set yet | Owner setup, before S4 |
| Malware scanning vendor (ADR 0013 Proposed) | Owner to choose | Before launch (prod refuses the fake scanner) |
| Recorded Paystack sandbox fixtures | Adapters tested against fixtures written from the API reference | S4 (payments) |

## Owner actions open

1. Confirm the Vault secrets work: `select public.fn_invoke_job('ping');` then `net._http_response` shows 202 (doc 22 §2.5).
2. Run the S2 demo end to end on dev (take a lot live, then fast-forward the expiry job).
3. Decide the Google Maps key for S3 (create now, or start with the stand-in).
4. Choose the malware scanning vendor (ADR 0013).

## Risks and notes

- `pnpm audit --prod` reports 2 high + 2 moderate advisories, all through Expo dev tooling in `apps/mobile` (`node-forge` and `braces` via `@expo/cli`/`@expo/metro`, `uuid` and `decode-uri-component` via `expo`/`expo-router`). None has a patched version yet, and none is in the API or web bundles. They were present before S2. Re-check when Expo publishes fixes.
- The Paystack fixtures were written from Paystack's API reference, not recorded. Record real sandbox responses once test keys are available.
- Commit `a27db2c` stored `20261021090000_admin_revoke_sessions.sql` empty. It was fixed in `1114df2`. The function already existed on the dev DB (created by hand); the migration is idempotent.
