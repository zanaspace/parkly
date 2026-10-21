# Sprint 2 — Operators, lots, permits, verification: progress report

- **Status:** In progress. Stories 1–3 are done (domain rules, schema + migrations, providers + upload pipeline), plus **slices A–B** (operator sign-up + business details; KYB documents, payout account, KYB submission).
- **Updated:** 2026-10-21
- **Entry check:** S1 was reviewed on 2026-10-21. Its gaps were closed or logged as carry-over (see `S1-report.md` § Review, doc 20 §6).

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Lot state machine, `canGoLive`/`listability`, submission gaps, verification checklist, permit dates + expiry reminders, rate-plan validation (`packages/domain/lot`) | FR-LOT-003/004/005/006/007, task 4 | **Done**: 153 tests, 100 % lines |
| 2 | Schema + migrations: `files`, operators, operator members, KYB docs, payout accounts, lots (PostGIS), hours/closures, photos, permits, verifications + items, rate plans; RLS + grants + FK/hot-path indexes; `user_roles.operator_id` FK | tasks 1–6 | **Done**: migrations `20261021091000`, `20261021091100`. Dry-run on the dev DB in a rolled-back transaction: all apply, every table has RLS, no client grants. Schema tests check that enums match the domain. |
| 3 | Providers: `SettlementProvider` (Paystack banks, resolve, subaccounts + fake), Supabase Storage adapter (+ fake that holds bytes), `MalwareScanner` (fake; vendor via ADR 0013); upload pipeline (presign → complete: size + SHA-256 + magic bytes, WebP re-encode with EXIF stripped, PDF scan, 10-min window); 7 private buckets with size/type limits | tasks 1–2 | **Done**: 58 new tests; adapters tested against Paystack-shaped fixtures (not yet recorded from the sandbox, see `apps/api/test/fixtures/paystack/README.md`); bucket migration dry-run on the dev DB (rolled back) |
| 4 | Operator API: create operator, business details, KYB documents, payout account | FR-LOT-001 | To do |
| 5 | Lots API: CRUD, opening hours, closures, photos, permits, rate plans, submit, pause/resume | FR-LOT-002/003/005/006, FR-OPS-005 | To do |
| 6 | Team invites (OWNER/MANAGER/ATTENDANT, lot scoping), revoke | FR-OPS-004 | To do |
| 7 | Admin API: review queues (KYB, permits, verifications, rate plans), lot status actions with reason; subaccount on KYB approval | FR-ADM-001, FR-LOT-006 | To do |
| 8 | Permit expiry job (`pg_cron` 06:00 WAT → `/internal/jobs/permit-expiry`) | FR-LOT-007, task 7 | To do |
| 9 | Portal screens: sign-up, onboarding wizard, lots, rate plans, permits, team | task 8 | To do |
| 10 | Admin screens: review queues, lot detail, status actions | task 9 | To do |

## Vertical slices (from 2026-10-21)

After story 3 the remaining work is built as slices that each ship API + portal screens together, so every step can be tried on the live dev portal (https://parkly-portal.vercel.app). Same scope and tests as stories 4–10, reordered.

| Slice | Scope | Status |
|---|---|---|
| A | Operator sign-up (email + confirmation) → business details → owner; edit details until KYB is submitted | **Done** |
| B | KYB documents (upload pipeline) + payout account (bank resolve) + submit KYB | **Done** |
| C | Lot wizard: details, map pin, capacity, amenities, hours, photos | To do |
| D | Permit, rate plans, submit lot for verification | To do |
| E | Admin review queues → subaccount on KYB approval → lot LIVE | To do |
| F | Team invites; permit expiry job | To do |

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
| One operator per owner | not stated | MVP: a user owns at most one operator (`OPERATOR_DUPLICATE`); revisit for multi-business owners |
| New error codes | FR-LOT-003 Gherkin names `LOT_PERMIT_INVALID` | Added `LOT_PERMIT_INVALID` (422) and `LOT_HAS_FUTURE_BOOKINGS` (409) to contracts and doc 02 §11 |

## Risks and notes

- `pnpm audit --prod` reports 2 high + 2 moderate advisories, all through Expo dev tooling in `apps/mobile` (`node-forge` and `braces` via `@expo/cli`/`@expo/metro`, `uuid` and `decode-uri-component` via `expo`/`expo-router`). None has a patched version yet, and none is in the API or web bundles. They were present before S2. Re-check when Expo publishes fixes.
- The Paystack fixtures were written from Paystack's API reference, not recorded. Record real sandbox responses once test keys are available.
- Commit `a27db2c` stored `20261021090000_admin_revoke_sessions.sql` empty. It was fixed in `1114df2`. The function already existed on the dev DB (created by hand); the migration is idempotent.
