# Sprint 0 — Foundations: progress report

- **Status:** In progress — code foundations done; platform accounts and the DB/deploy exit criteria wait on owner setup.
- **Updated:** 2026-10-14

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
| 11. Deploy | `deploy.yml`: main → migrate dev + staging → Vercel staging; tag → approval → migrate prod → Vercel prod; `vercel.json` (`lhr1`) per Next app |
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
