# 0002 — Supabase + Vercel as the MVP platform (replaces AWS + NestJS)

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Product lead (owner), engineering lead
- **Related:** doc 00 §3; docs 01, 02, 05, 06, 17, 20; AGENTS.md

## Context

The first draft of the docs placed the platform on AWS (ECS Fargate, RDS, ElastiCache, S3, SES, Terraform) with a NestJS API and BullMQ workers. For a 2–3 engineer pilot team, that is a lot of infrastructure to build and run before the first booking. The product owner chose **Supabase** (managed Postgres, Auth, Storage, cron/queues) and **Vercel** (hosting for the web apps and serverless API) for the MVP.

Everything that made the original design safe still has to hold: server-side business logic, atomic availability locking, verified webhooks, offline attendant check-in, audit logs, NDPA-grade data handling, RPO 15 min / RTO 4 h.

## Options considered

1. **AWS + NestJS (previous):** full control and an African region, but slow to stand up and heavy to operate for a small team.
2. **Supabase with clients talking directly to the DB (RLS-only security):** fastest to start, but money and booking rules end up in RLS policies that are hard to test, and one wrong policy leaks data or allows free bookings.
3. **Supabase for Postgres + Auth + Storage + cron/queues, plus a thin API on Vercel that owns all business logic (chosen):** keeps the logic server-side and testable, with RLS as a second line of defence.

## Decision

Option 3. The canonical stack becomes:

| Concern | Decision |
|---|---|
| Database | **Supabase Postgres** with extensions `postgis`, `pg_cron`, `pgmq`, `pg_net`, `pgcrypto`. One Supabase project per environment: `parkly-dev`, `parkly-staging`, `parkly-prod`. |
| Region | Closest Supabase region to Lagos that the project offers at creation time; default **Ireland (`eu-west-1`)**. Vercel Functions run in the **same region as the database** (Ireland → `dub1`), not near the user — DB round-trips dominate latency. Cross-border transfer basis under NDPA still needs counsel (doc 05). |
| ORM / migrations | **Drizzle ORM** (`packages/db`: schema, client, typed queries; PostGIS via `customType` + parameterised `sql\`\``). Migrations: drizzle-kit generates SQL into `supabase/migrations/`; RLS policies, SQL functions, triggers and cron schedules are hand-written SQL migrations in the same folder. **Supabase CLI** applies them (`supabase db push`). Prisma is no longer used. |
| DB connections | Serverless code connects through **Supavisor in transaction mode** (port 6543, `prepare: false`). Migrations use the direct connection. |
| API | `apps/api` = **Hono** app deployed as **Vercel Functions (Node.js runtime, not Edge)**. Same `/v1` REST surface, same module boundaries under `apps/api/src/modules/<module>/`. OpenAPI generated from `packages/contracts` via `@hono/zod-openapi`. |
| Auth | **Supabase Auth.** Drivers: phone OTP; SMS delivered through Supabase's **Send SMS Hook** → our hook endpoint → `SmsProvider` (Termii). Operators/admins: email + password + **TOTP MFA** (Supabase MFA); `aal2` required for every admin role and for `OPERATOR_OWNER` and `OPERATOR_MANAGER`. Supabase issues the JWTs: **asymmetric signing keys (ES256)**, access-token lifetime **15 min**, refresh-token rotation with reuse detection on. The API verifies JWTs against the project's JWKS. A **Custom Access Token Hook** adds `app_roles`, `operator_id` and `lot_ids` claims from our tables. Attendant device registration + local PIN stay as designed in doc 05. |
| Authorisation | Enforced in the API (RBAC + operator/lot scoping) exactly as before. **RLS enabled on every table in `public`, with no policies for `anon` / `authenticated` (deny-all).** Clients use Supabase only for Auth; all data goes through the API. The API's DB role bypasses RLS and is server-only. |
| Storage | **Supabase Storage**, private buckets only (`permits`, `verification`, `lot-photos`, `incident-evidence`, `kyb-docs`). Uploads via API-issued **signed upload URLs**; reads via short-lived signed URLs (≤ 5 min for C4). Public lot photos are served from a separate `lot-photos-public` bucket only after admin approval. |
| Background jobs | **pg_cron** schedules. Pure-SQL jobs run in the DB (e.g. expire unpaid holds every minute, release slot inventory). App-level jobs (reconciliation, permit reminders, outbox dispatch, notifications) are triggered by pg_cron → **pg_net** HTTP POST to `apps/api` `/internal/jobs/:job`, authenticated with an HMAC-signed header (secret in Vercel env + Supabase Vault). Work queues use **pgmq** (`notifications`, `outbox`, `reconciliation`). Every job is idempotent and chunked to finish inside the Vercel function time limit. BullMQ is not used. |
| Cache / rate limiting | **No Redis in MVP for caching** (Postgres is enough at pilot scale). Rate limiting: **Vercel Firewall** rules at the edge + **Upstash Redis** (`@upstash/ratelimit`, via Vercel Marketplace) for per-user/per-phone API limits. Supabase Auth's own OTP rate limits stay on. |
| Web hosting | **Vercel**: projects `parkly-api`, `parkly-web`, `parkly-portal`, `parkly-admin` from the monorepo. `parkly-admin` on its own domain with Vercel Firewall **IP allowlist** and Deployment Protection. |
| Edge security | Vercel Firewall (WAF custom rules, bot protection, IP allowlist for admin). Security headers/CSP set in each Next.js app and in Hono middleware. |
| Secrets | **Vercel environment variables** (marked Sensitive), per environment. Supabase `service_role`/secret key and DB URL only in server-side env, never in any client bundle or mobile app. Mobile and web clients get only the Supabase URL + **publishable (anon) key**. Supabase Vault for secrets SQL needs (job HMAC secret). |
| Field-level encryption (C4) | App-level AES-256-GCM envelope encryption in `packages/domain/crypto` with versioned keys (`ENC_KEY_V1`, …) in Vercel Sensitive env. Ed25519 per-lot QR private keys are stored encrypted this way. |
| Email | **Resend** (receipts, statements; also configured as Supabase Auth SMTP). |
| SMS / push / maps / payments | Unchanged: Termii, Expo Notifications, Google Maps, Paystack (Flutterwave secondary). |
| Observability | **Sentry** (all apps), `@vercel/otel` tracing, Vercel **Log Drains → Better Stack** (log search + uptime monitors + status page), Supabase logs/reports for DB. |
| Backups / DR | Supabase **Pro + Point-in-Time Recovery add-on** (meets RPO ≤ 15 min). Plus a nightly encrypted `pg_dump` from GitHub Actions to off-platform storage (a separate cloud bucket) for vendor-level DR. Restore drill every quarter. RTO 4 h. |
| Environments | `local`: `supabase start` (Postgres+PostGIS, Auth, Storage, Studio, Inbucket mail) + `pnpm dev`. PR → Vercel **Preview** (Git integration) against `parkly-dev`; merge to `main` → GitHub Actions migrates `parkly-dev` + `parkly-staging`, then deploys the Vercel `staging` environment; tag `vX.Y.Z` → manual approval → migrates `parkly-prod`, then deploys Vercel production (matches doc 20 §1.3; *amended 2026-10-14*). Prod data never copied down. |
| CI/CD | GitHub Actions runs lint/typecheck/tests (integration tests against `supabase start` in CI, replacing Testcontainers), then `.github/workflows/deploy.yml` runs `supabase db push` on the target project **before** deploying with the Vercel CLI. Vercel's Git integration builds PR previews only; EAS for mobile. |
| Infrastructure as code | No Terraform in MVP. Supabase config in `supabase/config.toml` + migrations; Vercel config in `vercel.json` per app. Both committed. |
| Plans | Vercel **Pro** (Hobby forbids commercial use). Supabase **Pro** for every environment; PITR add-on on `parkly-prod`. |

### Availability locking on Supabase

The "hold a slot" step is a single Postgres function `fn_hold_booking(...)` (SECURITY DEFINER, `search_path` pinned, callable only by the API role) that does the ordered `SELECT … FOR UPDATE` on `lot_slot_inventory` rows and inserts the booking in one transaction. The API calls it inside its own transaction; logic and tests stay as in doc 02.

## Consequences

- **Easier:** Sprint 0 (no AWS/Terraform), Sprint 1 (Auth, MFA, refresh rotation built in), backups, local dev (`supabase start`).
- **Harder / watch:** Vercel function time limits (chunk long jobs); connection pooling must use Supavisor; vendor lock-in on Auth (mitigated: data is plain Postgres, users exportable); no African region (latency ~80–120 ms Lagos→Ireland, acceptable); NDPA cross-border transfer needs counsel.
- **Docs updated in the same change:** 00, 01, 02, 03, 05, 06, 17, 18, 19, 20, AGENTS.md, ADR 0001 planned list.
- **Revisit** when: sustained > 50 req/s on the API, jobs regularly near time limits, an enterprise customer requires in-country hosting, or Supabase cost exceeds an equivalent managed AWS setup.

## Amendments

- **2026-10-14 — API role and RLS.** `parkly_api` does **not** get `BYPASSRLS` (hosted Supabase may not allow granting it). Every table instead carries one explicit RLS policy `TO parkly_api`, declared in the Drizzle schema (`apiAccess()` / `apiAppendOnly()` in `packages/db/src/schema/common.ts`). `anon`/`authenticated` remain deny-all, and Supabase's default table privileges for them are revoked in the first migration. Migrations run as `postgres` via `supabase db push`, from CI only.
- **2026-10-14 — Deploy flow.** See the Environments row: `main` deploys staging, tags deploy production after manual approval; migrations always run first (`.github/workflows/deploy.yml`).
- **2026-10-14 — Region.** The Supabase projects were created in Ireland (`eu-west-1`), so Vercel Functions are pinned to Dublin (`dub1`), next to the database. London references were updated to Ireland across the docs.
