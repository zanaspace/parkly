# Parkly

Parking booking and payment for verified lots in Lagos. Start with [`docs/00 - Read Me First - Index.md`](docs/00%20-%20Read%20Me%20First%20-%20Index.md); coding agents also read [`AGENTS.md`](AGENTS.md).

## Layout

| Path                                      | What                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/api`                                | Hono API on Vercel Functions (`/health/*`, `/internal/jobs/*`, `/v1/*` from Sprint 1) |
| `apps/mobile`                             | Expo driver app (Android first)                                                       |
| `apps/web` · `apps/portal` · `apps/admin` | Next.js: driver web, operator portal + `/attend` PWA, internal console                |
| `packages/domain`                         | Pure business rules (money, slots, plates, codes…)                                    |
| `packages/contracts`                      | Zod schemas and error codes shared by API and clients                                 |
| `packages/db`                             | Drizzle schema and client                                                             |
| `packages/tokens` · `ui` · `ui-native`    | Design tokens and components                                                          |
| `supabase/`                               | Supabase config, SQL migrations, local seed                                           |

## Prerequisites

- Node.js 22+ and pnpm 10 (`npm i -g pnpm@10`)
- **Docker Desktop** — only needed to run Supabase locally (`supabase start`) and the DB integration tests. Everything else works without it.

The Supabase CLI is a dev dependency; run it as `pnpm exec supabase …`.

## First run (< 15 minutes)

```bash
pnpm install
pnpm build                                   # builds shared packages once
cp apps/api/.env.example apps/api/.env       # optional locally: the API has local defaults
pnpm exec supabase start                     # Postgres+PostGIS, Auth, Storage, Studio (needs Docker)
pnpm dev                                     # all apps in watch mode
```

| App             | URL                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| API             | http://localhost:4000/health/ready                                                                                                        |
| Driver web      | http://localhost:3000                                                                                                                     |
| Operator portal | http://localhost:3001                                                                                                                     |
| Admin           | http://localhost:3002                                                                                                                     |
| Supabase Studio | http://127.0.0.1:54323                                                                                                                    |
| Mobile          | Port 8081 is the Expo bundler, not a web page: scan the QR in the terminal with Expo Go on an Android phone, or press `a` for an emulator |

Local sign-in without SMS: phone `+2348000000001`, code `123456` (`supabase/config.toml`).

## Everyday commands

```bash
pnpm test                                   # unit tests (no network, no DB)
pnpm --filter @parkly/db test:integration   # RLS + trigger tests against local Supabase
pnpm lint && pnpm typecheck
pnpm db:generate                            # Drizzle schema change → SQL in supabase/migrations
pnpm exec supabase migration new <name>     # hand-written SQL (functions, grants, cron)
pnpm exec supabase db reset                 # rebuild local DB from migrations + seed
pnpm contracts:openapi                      # regenerate apps/api/openapi.json
pnpm tokens:build                           # rebuild design tokens
```

## Deploys

- PR → Vercel preview against the `parkly-dev` Supabase project.
- Merge to `main` → migrations on dev + staging, then deploy to Vercel `staging`.
- Tag `vX.Y.Z` → manual approval → migrations on prod, then deploy to production.

See `.github/workflows/deploy.yml` and ADR 0002. Remote databases are changed only by CI.

## One-time platform setup (owner tasks)

1. **Supabase:** create `parkly-dev`, `parkly-staging`, `parkly-prod` (Pro plan; PITR add-on on prod) in the region closest to Lagos (default Ireland). In each project's Vault add `job_hmac_secret` and `api_base_url`. Create the API's login: `alter role parkly_api with login password '…'` (password stored only in Vercel env).
2. **Vercel (Pro):** projects `parkly-api`, `parkly-web`, `parkly-portal`, `parkly-admin` with root directories `apps/<name>`, Functions region `dub1`, a custom `staging` environment, env vars per environment (mark secrets Sensitive), admin domain with IP allowlist.
3. **GitHub:** environments `dev`, `staging`, `production` (required reviewers on `production`) with secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and variables `SUPABASE_PROJECT_REF`, `VERCEL_PROJECT_ID_API|WEB|PORTAL|ADMIN`.
4. **Accounts to start now (slow approvals):** Termii sender ID + DND route, Paystack (test + live KYB), Google Maps keys, Upstash, Resend domain, Sentry, Better Stack, Google Play Console.
