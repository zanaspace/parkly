# Sprint 0 — Foundations: report

- **Status:** **Done**, with platform items carried over (see § Final status, 2026-10-22). The code foundations were done on 2026-10-14; the dev environment went live during S2.
- **Updated:** 2026-10-22

## Done (verified locally)

| Task (doc 20 S0) | Result |
|---|---|
| 1. Monorepo | pnpm 10 + Turborepo, `@parkly/config` (strict TS, ESLint flat config, Prettier), exact version pins, install-script allowlist (ADR 0003) |
| 2. API skeleton | Hono app: `/health/live`, `/health/ready` (DB + Redis checks), problem+json errors incl. `INTERNAL_ERROR`, request id, secure headers, CORS allowlist, Zod validation → `VALIDATION_FAILED`, Upstash rate limit, pino redaction, `@vercel/otel`, Sentry hook, env validation. OpenAPI generated to `apps/api/openapi.json`. |
| 3. Supabase + DB | `supabase/config.toml` (15-min JWT, refresh rotation, phone OTP, TOTP MFA, staff invite-only, 30-day sessions). Migrations: extensions (PostGIS, pgcrypto, pg_net, pg_cron, pgmq), `parkly_api` role, revoked client defaults, `users`, `user_roles`, `audit_logs` (append-only), `platform_settings` (seeded from doc 02 §8), `feature_flags` (seeded), auth-user trigger, `uuid_v7()`. RLS on every table, API policy per table. Drizzle schema in `packages/db`. |
| 4. Jobs skeleton | `/internal/jobs/:job` with HMAC (`job.timestamp.body`), ±300 s skew, replay guard; `fn_invoke_job` (pg_cron → pg_net, secrets from Vault); `job-ping` schedule; `outbox`, `notifications`, `reconciliation` queues. |
| 5. Local stack | `supabase start` + `seed.sql` (Vault secrets); README first-run steps |
| 6. Domain (TDD) | money (kobo, round-half-up, ₦ formatting), 15-min slots + Lagos dates, plate normalisation/validation, booking codes — 85 tests, 100 % coverage |
| 7. Tokens + UI | `@parkly/tokens` (DTCG → CSS vars, Tailwind preset, RN theme, contrast tests), `@parkly/ui` and `@parkly/ui-native` (Button, Text, Input) |
| 8. App skeletons | `apps/web` (3000), `apps/portal` (3001, `/attend` placeholder), `apps/admin` (3002), `apps/mobile` (Expo Router; expo-doctor clean, Android bundle exports) |
| 9. Provider interfaces | Payment, SMS, Push, Email, Maps, Storage, Clock + in-memory fakes |
| 10. CI | `ci.yml` (format, lint, typecheck, test, build, OpenAPI drift, Drizzle drift, `supabase start` + db lint + RLS integration tests, gitleaks, `pnpm audit`), `codeql.yml`, PR template |
| 11. Deploy | `deploy.yml`: main → migrate dev + staging → Vercel staging; tag → approval → migrate prod → Vercel prod; `vercel.json` (`dub1`) per Next app |
| 13. ADRs | 0003 monorepo, 0004 Paystack split, 0005 attendant PWA accepted; 0006 slot inventory proposed; 0002 amended |

Commands green at repo root: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Not yet verified / carried over

| Item | Why | Next step |
|---|---|---|
| DB integration tests (`packages/db/test/rls.int-spec.ts`) and the migrations themselves | Docker is not installed on the dev machine, so `supabase start` has not run yet | Install Docker Desktop and run `pnpm exec supabase start` and `pnpm --filter @parkly/db test:integration`, or let CI run them on the first PR |
| pgmq queue consumer job | Needs a running DB to test | Sprint 1, with the first DB-backed job |
| Task 11 (Vercel projects, env vars, Firewall, admin IP allowlist) and task 12 (Sentry projects, Better Stack drains) | Need the owner's accounts | Owner setup — see README "One-time platform setup" |
| Task 14 (Termii, Paystack, Maps, Play Console, Resend, Upstash) | External approvals | Start now; fakes are in place |
| The "CI fails on a deliberately committed fake secret" check | Needs the GitHub repo | After the repo is pushed |
| Web fonts in Next apps (`next/font`), axe checks, the ₦ glyph test, RN render tests, react-hooks lint plugin | Deferred skeleton polish | Sprint 1 UI work |

## Decisions and doc changes made this sprint

- Health endpoints follow doc 02 (`/health/live`, `/health/ready`); doc 20 updated.
- Job signing: headers `x-parkly-job-id|timestamp|signature`, MAC over `job.timestamp.body`; docs 01 and 02 aligned.
- Added error codes `INTERNAL_ERROR` (500) and `OTP_RATE_LIMITED` (429) to doc 02 §11.
- `parkly_api` uses explicit per-table RLS policies, not BYPASSRLS; migrations run as `postgres` from CI (ADR 0002 amendment; docs 01, 02, 05).
- Deploy flow: main → staging, tags → production with approval (ADR 0002 amendment; docs 00, 20).
- Expo SDK 57 expects TypeScript 6.0; the repo stays on 5.9.3 for now (`expo.install.exclude`), and can move to 6.0 later.

## Risks

- Account approvals (Termii sender ID, Paystack live KYB) are the long pole for Sprints 1 and 4.
- The migrations haven't been applied to a real database yet; the first `supabase start` may surface SQL fixes.

## Update — migrations applied to the hosted dev project

- `supabase db push` to the dev project (`devproject`, ref `qbheoilyuvudiefubdco`, Ireland `eu-west-1`) applied all migrations.
- Verified on the remote:
  - all 5 tables have RLS
  - only `parkly_api` policies exist, and `anon`/`authenticated` have no table grants
  - 27 settings and 10 flags are seeded
  - the `job-ping` cron job and the 3 pgmq queues exist
  - `parkly_api` can insert audit logs but not update them
- The Supabase security advisor flagged `pg_net` in `public` and a Supabase-provided `public.rls_auto_enable()` executable by `anon`. Both are fixed by migration `20261014225303_security_advisor_fixes.sql`, and the advisor now reports **no issues**.
- Region is Ireland, so Vercel Functions are pinned to `dub1` (ADR 0002 amendment).
- Still to do on the dev project: Vault secrets `job_hmac_secret` and `api_base_url`, and a LOGIN password for `parkly_api`. The `pnpm --filter @parkly/db test:integration` suite still needs a local or CI run.

## Final status — 2026-10-22

Done since the update above (during S1 and S2):

| Item | Result |
|---|---|
| GitHub repository | `zanaspace/parkly`; every change since S2 goes through a pull request |
| Dev hosting (task 11) | Four Vercel projects on the Hobby team, region `dub1`: API https://parkly-api-six.vercel.app, portal https://parkly-portal.vercel.app, admin https://parkly-khaki.vercel.app, web https://parkly-web-two.vercel.app. Environment variables per doc 22; secrets entered by the owner. |
| Upstash Redis | Created; rate limiting and the job replay guard use it on dev |
| Mobile builds | Expo account `zanas-team`, EAS project linked, Android test builds (Node 22.22.2) |
| Environments doc | Doc 22 Environment Setup (local, dev, staging, prod; which variables, where, secret or not) |
| Vault job secrets on dev | Entered by the owner on 2026-10-22 (doc 22 §2.5); to confirm with the `ping` check (202 in `net._http_response`) |

Still carried over (doc 20 §6):

| Item | Status |
|---|---|
| Staging and production environments | Owner decision: wait (before S4) |
| CI secrets and the first green CI run on GitHub (DB integration tests with `supabase start`, migrations pushed by CI) | Not set up yet. Dev migrations were applied by hand in the SQL editor, so the remote history needs `supabase migration repair` before CI pushes. |
| Sentry projects, Better Stack drains, Vercel Firewall + admin IP allowlist (task 12) | Not set up |
| Termii sender ID, Paystack live KYB, Google Maps key, Play Console, Resend (task 14) | Paystack **test** key in use on dev; the rest pending. Supabase test phone numbers stand in for SMS. |
| `parkly_api` login password | Not needed while the API uses the dev connection string; set before staging |
