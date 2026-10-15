# Sprint 1 — Identity & Auth: progress report

- **Status:** In progress — core identity, auth, accounts, vehicles, portal auth/MFA, and mobile onboarding flows implemented and verified locally.
- **Updated:** 2026-10-15

## Done (verified locally)

| Task (doc 20 S1) | Result |
|---|---|
| 1. Driver phone OTP | Supabase Auth integration + custom `/hooks/send-sms` endpoint verified with signature; Termii adapter and fake provider; phone normalization (+234); rate limiting (3 sends / 15 min per phone/IP) via Upstash/memory store. |
| 2. Session tokens & hooks | Custom Access Token Hook (`fn_custom_access_token_hook`) injecting `app_roles`, `operator_id`, and `lot_ids` claims into Supabase JWTs; API middleware verifying tokens against JWKS with caching. |
| 3. Portal & admin auth | Email + password sign-in; TOTP MFA enrollment and verification (`/mfa/enroll`, `/mfa/verify`); password reset and update flows; route guards enforcing `aal2` for privileged roles. |
| 4. Attendant sign-in foundation | Role mapping for `OPERATOR_ATTENDANT`, device registration schema, and lot-scoping groundwork. |
| 5. RBAC guard & policy layer | `can(user, action, resource)` policy engine in `@parkly/domain/authz`; comprehensive RBAC matrix test suite (57 tests passing in `apps/api/test/rbac-matrix.spec.ts`). |
| 6. AuditLog middleware | Hono middleware recording actor, IP, user-agent, route, action, and payload for privileged requests; append-only trigger in PostgreSQL. |
| 7. Consents & accounts model | Schema and migrations for `consents` (versioned terms, privacy, marketing), `accounts`, `vehicles`, `devices`, and account deletion requests. |
| 8. Vehicles CRUD | Plate normalization and validation for Nigerian plates (`@parkly/domain/plate`); `/me/vehicles` CRUD endpoints. |
| 9. Mobile onboarding & auth | Expo onboarding screens, phone input, OTP verification, vehicle registration, and profile screens in `apps/mobile`. |
| 10. Portal auth UX | Next.js portal authentication layout, error messaging without account enumeration, open-redirect protection (`safeNext`). |

All verification suites passing at repo root:
- `pnpm test`: 153 API tests, 85 domain tests, 20 portal tests, 19 DB schema tests, UI tests (all green).
- `pnpm typecheck`: 17 packages passing clean (zero errors).
- `pnpm lint`: clean across all workspace packages.
- `pnpm format:check`: 100% formatted with Prettier.
- `pnpm build`: all 10 apps and packages built successfully.

## Not yet verified / carried over

| Item | Why | Next step |
|---|---|---|
| Remote migrations push (`20261015074002...` and `20261015074100...`) | Hosted Supabase project needs `supabase db push` with remote project credentials | Push migrations in CI or via CLI |
| Real SMS delivery via Termii in staging | Requires approved Termii sender ID + live DND route | Continue using fake SMS in dev/testing until approval |
| Custom Access Token Hook configuration in Supabase Dashboard | Auth hooks must be activated in the hosted Supabase Auth settings | Enable hook in Supabase dashboard under Auth > Hooks |

## Decisions and doc changes made this sprint

- Added `@parkly/portal` test setup with `vitest` for auth guard and API unit testing.
- Added open-redirect guard (`safeNext`) in `@parkly/portal` to prevent malicious redirects post-authentication.
- Strict typing enforced on all `it.each` test matrix definitions to satisfy `noImplicitAny`.
