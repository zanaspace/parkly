# Sprint reports

One report per sprint (AGENTS.md §2): what was built, what carried over, risks and decisions. The plan for each sprint is in [doc 20](../20%20-%20Sprint%20Plan%20and%20Delivery%20Roadmap.md); its carry-over log (§6) tracks everything moved to a later sprint.

| Sprint | Goal (doc 20) | Status | Report |
|---|---|---|---|
| S0 | Foundations: monorepo, API skeleton, database, jobs, design tokens, app skeletons, CI | **Done**, platform items carried over (staging/prod, CI secrets, Sentry, external accounts) | [S0-report.md](S0-report.md) |
| S1 | Identity and access: driver phone OTP, operator/admin password + MFA, RBAC, audit log, vehicles | **Done**; attendant sign-in → S5, real-number OTP → Termii | [S1-report.md](S1-report.md) |
| S2 | Operators, lots, permits, verification: operator onboarding + KYB, lot wizard, admin review and go-live, permit expiry job, team invites | **Done (code complete)**; dev demo run and staging pending | [S2-report.md](S2-report.md) |
| S3 | Lot discovery: drivers search near a destination and see prices and availability (mobile + web) | **Done (code complete)**; LocationIQ key to add on Vercel | [S3-report.md](S3-report.md) |
| S4 | Booking, availability holds and payments (Paystack): book and pay in the app and on the web, webhooks, ledger, signed QR ticket | **Done (code complete)**; staging sign-off and k6 run wait for staging | [S4-report.md](S4-report.md) |
| S5 | QR ticket check-in and the offline attendant PWA: offline gate app, 24 h manifest, camera scan, plate/code search, delta sync, lot pause/resume | **Done (code complete)**; physical device field test in S10 | [S5-report.md](S5-report.md) |
| S6 | Extend, overstay, cancel, refunds, receipts, notifications | **Done (code complete)**: gap-review Waves 1–3 merged; staging demo pending | [S6-report.md](S6-report.md) |
| S7 | Operator dashboard, ledger, settlement and reconciliation | **Done (code complete)**: tasks 1–6 merged, with flexible arrival (ADR 0023 stages 1–2, ADR 0024 "Park now"). Open: P-9, operator finance pages in the portal, pen-test booking; staging needed for the exit criterion | [S7-report.md](S7-report.md) |
| S8 | Admin console, support and compliance (NDPA) | **Done (code complete)**: support search, booking actions and refund approvals, incidents (task 3) and the suspension impact and bulk cancel (task 4) built; platform settings and feature flags (task 5) built; data requests, account erasure and retention (task 6, first part) built; admin hardening (task 7, first part: network allowlist, idle timeout, step-up) built; legal pages (task 8) drafted: Privacy Notice and Driver Terms at /legal on the driver website, awaiting counsel (doc 23). Tasks 1–8 are built; the S8 exit criteria need staging | [S8-report.md](S8-report.md) |
| S9 | Monthly passes and hardening | **Done (code complete)**: monthly passes (`FR-PASS-001…005`: 30-day purchase, 50% capacity cap, waitlist, `t: 'P'` pass QR, offline gate check-in, 1-vehicle-inside rule, 2 swaps/month, 7d/2d reminders, 1-tap renewal), driver identity verification (`FR-AUTH-009`: FRSC DL / NIN via Dojah adapter, `Verified Driver` badge), Flutterwave secondary payment provider (`FR-PAY-007`), operator capacity blackouts (`FR-LOT-008`), `retry-webhooks` and `reapply-erasures` jobs, nightly encrypted backup workflow (`.github/workflows/nightly-backup.yml`), low-end device & accessibility hardening (`NFR-LOWEND-001`, `NFR-A11Y-001`) | [S9-report.md](S9-report.md) |

## What exists on dev today

| App | URL | Who uses it |
|---|---|---|
| API | https://parkly-api-six.vercel.app | Every app; `pg_cron` jobs |
| Operator portal | https://parkly-portal.vercel.app | Operator owners and managers; attendants sign in here by email code and use the gate app at `/attend` |
| Admin console | https://parkly-khaki.vercel.app | Parkly staff |
| Driver web | https://parkly-web-two.vercel.app | Drivers: search, lot pages, phone sign-in, book and pay, My bookings with the QR ticket |
| Driver mobile app | Expo Go / EAS Android test builds | Drivers: sign-in, search, book and pay, My bookings, QR ticket (offline) |

Environments, variables and secrets: [doc 22](../22%20-%20Environment%20Setup.md).
