# Sprint reports

One report per sprint (AGENTS.md §2): what was built, what carried over, risks and decisions. The plan for each sprint is in [doc 20](../20%20-%20Sprint%20Plan%20and%20Delivery%20Roadmap.md); its carry-over log (§6) tracks everything moved to a later sprint.

| Sprint | Goal (doc 20) | Status | Report |
|---|---|---|---|
| S0 | Foundations: monorepo, API skeleton, database, jobs, design tokens, app skeletons, CI | **Done**, platform items carried over (staging/prod, CI secrets, Sentry, external accounts) | [S0-report.md](S0-report.md) |
| S1 | Identity and access: driver phone OTP, operator/admin password + MFA, RBAC, audit log, vehicles | **Done**; attendant sign-in → S5, real-number OTP → Termii | [S1-report.md](S1-report.md) |
| S2 | Operators, lots, permits, verification: operator onboarding + KYB, lot wizard, admin review and go-live, permit expiry job, team invites | **Done (code complete)**; dev demo run and staging pending | [S2-report.md](S2-report.md) |
| S3 | Lot discovery: drivers search near a destination and see prices and availability (mobile + web) | **Done (code complete)**; LocationIQ key to add on Vercel | [S3-report.md](S3-report.md) |
| S4 | Booking, availability holds and payments (Paystack) | Next | — |

## What exists on dev today

| App | URL | Who uses it |
|---|---|---|
| API | https://parkly-api-six.vercel.app | Every app; `pg_cron` jobs |
| Operator portal | https://parkly-portal.vercel.app | Operator owners and managers |
| Admin console | https://parkly-khaki.vercel.app | Parkly staff |
| Driver web | https://parkly-web-two.vercel.app | Drivers: search, results and lot pages (booking from S4) |
| Driver mobile app | Expo / EAS Android test builds | Drivers (sign-in, profile, vehicles until S3) |

Environments, variables and secrets: [doc 22](../22%20-%20Environment%20Setup.md).
