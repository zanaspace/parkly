# Sprint 9 — Monthly passes and hardening: report

- **Status:** **Code complete.** All ten Sprint 9 tasks (`FR-PASS-001…005`, `FR-AUTH-009`, `FR-PAY-007`, `FR-LOT-008`, `NFR-LOWEND-001`, `NFR-A11Y-001`, security hardening, nightly encrypted backups and `erasure_log` replay) are built and tested on `feat/s9-monthly-passes-and-hardening`.
- **Updated:** 2026-11-13
- **Entry check:**
  - S8 is code complete (`S8-report.md`).
  - Carry-overs picked up in S9: `retry-webhooks` job (`docs/20 §6` S4 carry-over) and post-restore `erasure_log` replay (`docs/20 §6` / `docs/06 §7`).

## Goal (doc 20)

Commuters can buy 30-day passes; secondary payment provider is ready; security, accessibility and low-end device budgets are met.

## Doc 20 Sprint 9 tasks

| # | Task | Stories | Status | Where |
|---|---|---|---|---|
| 1 | Monthly pass purchase: 30-day validity, capacity cap (`pass.max_share_percent`, default 50%), waitlist when full | `FR-PASS-001`, `FR-PASS-003` | **Done** | `packages/domain/src/pass`, `apps/api/src/modules/passes`, `apps/web/app/passes`, `apps/mobile/app/(app)/passes.tsx` |
| 2 | Pass QR (`t: 'P'`), offline check-in rules, one-vehicle-in-lot-at-a-time enforcement, `PASS` badge in attendant PWA | `FR-PASS-002` | **Done** | `apps/api/src/lib/qr-tickets.ts`, `apps/api/src/modules/attend/routes.ts`, `apps/portal/lib/attend/gate.ts`, `apps/portal/components/attend/attend-app.tsx` |
| 3 | Pass renewal reminders (7 days and 2 days before expiry) and one-tap renewal; vehicle swap on pass (P1, max 2/month) | `FR-PASS-003`, `FR-PASS-004` | **Done** | `apps/api/src/jobs/pass-reminders.ts`, `POST /v1/passes/:id/renew`, `POST /v1/passes/:id/swap-vehicle` |
| 4 | Driver identity verification (P1): FRSC Driver's License + DOB or NIN check (< 60 s via Dojah/Smile ID adapter), `Verified Driver` badge, gating on monthly passes and operator-configured lots; raw ID numbers hashed + encrypted, never stored in plaintext | `FR-AUTH-009`, `FR-PASS-005` | **Done** | `packages/domain/src/verification`, `apps/api/src/providers/dojah-identity.ts`, `GET/POST /v1/me/verification`, `apps/portal/components/capacity-blocks.tsx` |
| 5 | Flutterwave adapter behind `PaymentProvider` (`payment_provider` feature flag); contract test suite | `FR-PAY-007` | **Done** | `apps/api/src/providers/flutterwave-payments.ts`, `apps/api/src/providers/flutterwave-payments.spec.ts`, `POST /v1/webhooks/flutterwave` |
| 6 | Capacity blackouts for operators (maintenance/event windows, full or partial, honours confirmed bookings) | `FR-LOT-008` | **Done** | `packages/domain/src/availability`, `apps/api/src/modules/lots/routes.ts`, `apps/portal/components/capacity-blocks.tsx` |
| 7 | Performance pass on reference low-end Android and slow 4G: bundle size (< 40 MB AAB, lean dependency budget), image sizes, query indexes | `NFR-LOWEND-001` | **Done** | `supabase/migrations/20261113170000_s9_passes_verification_blackouts.sql`, `apps/api/src/hardening.spec.ts` |
| 8 | Accessibility audit and fixes: TalkBack/screen reader labels, 48 dp touch targets, contrast, 200% font scale, axe-core | `NFR-A11Y-001` | **Done** | `packages/ui-native/src/Text.tsx`, `packages/ui-native/src/Button.tsx`, `apps/mobile/src/components/Chip.tsx`, `apps/api/src/hardening.spec.ts` |
| 9 | Security hardening sweep against `docs/05` checklist; fix pen-test findings; `retry-webhooks` job | `docs/05` | **Done** (pen-test external vendor still pending) | `apps/api/src/jobs/retry-webhooks.ts`, `apps/api/src/hardening.spec.ts` |
| 10 | Off-platform nightly encrypted backup job (`pg_dump` + Storage → S3/R2 with `age`); restore test + `erasure_log` re-application script (`docs/06 §7`) | `docs/02 §7`, `docs/06 §7` | **Done** | `.github/workflows/nightly-backup.yml`, `scripts/reapply-erasures.ts`, `apps/api/src/jobs/reapply-erasures.ts` |

## What was built, in plain words

### 1. Monthly passes (`FR-PASS-001…004`)
- **30-day passes at a single verified car park.** Drivers can purchase a `MONTHLY` pass at any live lot whose active rate plan includes a monthly price. Pass capacity is capped at `pass.max_share_percent` (default 50% of `capacity_bookable`) so at least half of every lot remains open for hourly and daily commuters.
- **Waitlist when full.** When a lot's active passes reach the cap, `POST /v1/passes` returns `409 PASS_CAP_REACHED` and both the web and mobile apps offer a one-tap **Join Waitlist** action (`POST /v1/passes/waitlist`).
- **Signed Pass QR (`t: 'P'`) and one-vehicle-inside rule.** Paid passes receive an Ed25519-signed QR token with `t: 'P'` valid for the 30-day window. Both the attendant PWA (`/attend`) and driver self check-in (`/v1/passes/:id/self-check-in` and `self-check-out`) enforce that only **one vehicle** is inside the lot on a pass at a time (`PASS_ALREADY_CHECKED_IN` if already inside).
- **Vehicle swap up to 2 times per billing month (`FR-PASS-004`).** Drivers can swap the active vehicle on their pass up to twice per 30-day cycle (`POST /v1/passes/:id/swap-vehicle`) while no car is currently checked in. Swapping rotates the pass QR token to the new plate, and the attendant PWA rejects any stale QR carrying the old plate.
- **7-day and 2-day renewal reminders + one-tap renewal (`FR-PASS-003`).** The scheduled job `/internal/jobs/pass-reminders` sends `pass.expiring` notifications 7 days and 2 days before `valid_until` and marks expired passes `EXPIRED`. Renewing an active pass (`POST /v1/passes/:id/renew`) extends validity seamlessly from the current `valid_until`.

### 2. Driver identity verification & Verified Driver badge (`FR-AUTH-009`, `FR-PASS-005`)
- **60-second Tier 2 KYC check.** Drivers can verify their identity via **FRSC Driver's License + Date of Birth** or **11-digit NIN** (`POST /v1/me/verification`), backed by `DojahIdentityProvider` (`apps/api/src/providers/dojah-identity.ts`) in production and `FakeIdentityVerificationProvider` in dev/tests.
- **Zero plaintext ID storage (`docs/05`, `docs/06`).** Raw license numbers and NINs are never stored in plaintext or logged: the database stores only an HMAC-SHA256 lookup hash (`id_hash`), an AES-256-GCM envelope-encrypted payload (`id_encrypted`), and a masked display string (`id_masked`, e.g. `ABC******A12`).
- **Gating and badges.** Monthly passes require Verified Driver status when `pass.requires_verified_driver` is `true` (default), and operators can also require Verified Driver status for hourly/daily bookings on individual lots (`lots.requires_verified_driver`). The `✓ Verified Driver` badge is shown in the driver apps and on the attendant gate screen.

### 3. Secondary payment provider — Flutterwave (`FR-PAY-007`)
- **Full `PaymentProvider` adapter.** `FlutterwavePaymentProvider` (`apps/api/src/providers/flutterwave-payments.ts`) implements transaction initialization (with operator split subaccounts), verification, refunds, subaccount creation, and `verif-hash` / HMAC-SHA256 webhook signature verification (`POST /v1/webhooks/flutterwave`).
- **Runtime switch via feature flag.** Switching `payment_provider` to `'flutterwave'` routes new booking and pass checkouts to Flutterwave without code changes, while `settlePaymentByReference` and `/v1/payments/:reference/verify` inspect the payment's recorded provider so in-flight Paystack transactions continue to settle cleanly.

### 4. Operator capacity blackouts (`FR-LOT-008`)
- **Full or partial maintenance/event blocks.** Operators can schedule capacity blackouts (`GET/POST/DELETE /v1/operators/:operatorId/lots/:lotId/blocks`) in the operator portal (`apps/portal/components/capacity-blocks.tsx`), blocking either a specific number of bays (`blocked_spots`) or the entire lot (`blocked_spots = NULL`).
- **Existing bookings honoured.** Creating a blackout checks overlapping confirmed bookings and refuses (`409 LOT_HAS_FUTURE_BOOKINGS`) if the blackout would reduce remaining capacity below already-confirmed bookings.

### 5. Hardening, backups, low-end device & accessibility (`NFR-LOWEND-001`, `NFR-A11Y-001`, `docs/05`, `docs/06 §7`)
- **Webhook retry job (`retry-webhooks`).** Re-processes failed `webhook_events` up to 5 attempts and alerts after 3 failures.
- **Post-restore erasure replay (`reapply-erasures` & `scripts/reapply-erasures.ts`).** Queries `erasure_log` and re-scrubs any user/vehicle/booking/pass/verification rows resurrected by a point-in-time database restore (`docs/06 §7`).
- **Nightly encrypted off-platform backup (`.github/workflows/nightly-backup.yml`).** Dumps Postgres and Storage objects nightly, encrypts with `age` (`AGE_PUBLIC_KEY`), and uploads to off-platform S3/R2 with a 35-day retention tag.
- **Accessibility & low-end device budgets.** Touch targets are ≥ 48 dp across `@parkly/ui-native` and `apps/mobile`, `Text` and `Button` support dynamic font scaling up to 200% (`allowFontScaling`, `maxFontSizeMultiplier={2}`), composite SQL indexes cover pass and blackout hot queries, and automated tests in `apps/api/src/hardening.spec.ts` enforce dependency, security header, RLS, and touch-target invariants.

## Exit criteria (doc 20 S9)

| Criterion | State |
|---|---|
| A monthly pass can be bought, used at the gate (online and offline), and renewed | **Met in automated tests** (`apps/api/src/modules/passes/passes.spec.ts` and `apps/portal/lib/attend/gate.spec.ts`). Live staging demo awaits staging environment. |
| Switching `payment_provider` to Flutterwave in staging processes a test booking end-to-end | **Met in automated tests** (`apps/api/src/modules/passes/passes.spec.ts` and `apps/api/src/providers/flutterwave-payments.spec.ts`). |
| All High/Critical pen-test findings are closed and re-verified | **Codebase hardened** (`apps/api/src/hardening.spec.ts`); external pen-test vendor engagement remains an owner action. |
| Off-platform backup restore + `erasure_log` re-application is completed and timed | **Workflow + script + job built and tested** (`.github/workflows/nightly-backup.yml`, `scripts/reapply-erasures.ts`, `apps/api/src/jobs/reapply-erasures.ts`). Live restore timing awaits production/staging S3/R2 credentials. |

## Owner actions

- [ ] Apply the two Sprint 9 migrations in order:
  1. `supabase/migrations/20261113170000_s9_passes_verification_blackouts.sql`
  2. `supabase/migrations/20261113170010_s9_grants_and_cron.sql`
- [ ] Add GitHub Actions secrets for `.github/workflows/nightly-backup.yml`: `PROD_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGE_PUBLIC_KEY`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`.
- [ ] Set `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `DOJAH_APP_ID`, and `DOJAH_SECRET_KEY` on Vercel when ready to test live providers outside sandbox/fake mode.
