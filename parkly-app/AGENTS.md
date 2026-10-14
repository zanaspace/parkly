# AGENTS.md — Operating Manual for Coding Agents

You are building **Parkly**, a parking booking and payment platform for Lagos. This file tells you **how to work**. The docs in `docs/` tell you **what to build**.

## 1. Read order (before writing any code)

1. `docs/00 - Read Me First - Index.md`: canonical names, stack and non-negotiables. **It wins every conflict.**
2. `docs/20 - Sprint Plan and Delivery Roadmap.md`: find the current sprint and the docs it lists.
3. `docs/19 - PRD - Product Requirements.md`: the FRs and acceptance criteria for that sprint.
4. The docs listed under the sprint's **Read** line (architecture 01, TDD 02, flows 03, design 04/07–16, security 05, data 06).
5. `docs/decisions/`: ADRs that override or clarify earlier docs.

## 2. Picking up a sprint

1. Confirm the previous sprint's exit criteria are met (`docs/sprints/S<n-1>-report.md`). If not, finish carry-over first.
2. Break the sprint into stories. Each one references an FR/NFR ID and meets the Definition of Ready (doc 20 §1.1).
3. Order the work so domain logic and contracts come first, then the API, then the UI.
4. Work one story per branch and PR (`feat/s4-booking-hold`).
5. At sprint end, run the demo script on staging and write `docs/sprints/S<n>-report.md` covering what's done, what carried over, risks and decisions.

Do not build features from a later sprint. If you need something early, use a fake or a feature flag and note it.

## 3. TDD loop (mandatory for domain, payments, availability, auth, sync)

1. Turn the story's Gherkin acceptance criteria into failing tests: unit tests in `packages/domain`, integration tests in `apps/api/test`, e2e tests in Playwright or Maestro.
2. Write the minimum code to pass.
3. Refactor with the tests green.
4. Add the authorisation tests: an allowed role, a denied role, and a cross-tenant request.
5. Run the full suite before you push.

External services (Paystack, Termii, Maps, Supabase Storage, push, email, clock) are always reached through interfaces. Tests use the fakes and never real network calls. Each adapter also gets a contract test, run only in CI with sandbox keys.

## 4. Commands

```bash
pnpm install                         # install workspace
supabase start                       # local Supabase: Postgres+PostGIS, Auth, Storage, Studio, Inbucket mail (no docker compose)
pnpm db:generate                     # drizzle-kit: schema changes in packages/db → SQL in supabase/migrations/
supabase migration new <name>        # hand-written SQL migration (RLS, functions, triggers, pg_cron)
supabase db reset                    # rebuild local DB from migrations + supabase/seed.sql (VI demo lots)
pnpm dev                             # turbo: all apps in watch mode (API runs via `vercel dev` / Hono node server)
pnpm --filter @parkly/api dev        # one app
pnpm test                            # all unit + integration (against local Supabase)
pnpm test:e2e                        # Playwright (web) ; pnpm --filter @parkly/mobile e2e (Maestro)
pnpm lint && pnpm typecheck          # must be clean
pnpm contracts:openapi               # regenerate OpenAPI + client types after API change
pnpm tokens:build                    # rebuild design tokens (CSS vars + RN theme)
```

If a command doesn't exist yet, create it in the root `package.json` and `turbo.json`, following this list. Remote databases are changed **only** by CI (`supabase db push`), never from a laptop. The platform choice and its rules are in `docs/decisions/0002-supabase-and-vercel-for-mvp.md`.

## 5. Coding standards

- TypeScript `strict`. Avoid `any`; if you must use it, add a justification comment. Prefer `unknown` plus Zod parsing at boundaries.
- DTOs and validation come only from `packages/contracts` (Zod). Never hand-copy types.
- Business rules (pricing, state machines, availability, plate normalisation, cancellation policy) live in `packages/domain` as pure functions. Controllers stay thin.
- Money is integer **kobo**. Time is UTC `TIMESTAMPTZ`, displayed in `Africa/Lagos`. IDs are UUIDv7.
- Errors use problem+json with a stable `code` in `UPPER_SNAKE_CASE`.
- Every mutating endpoint for bookings, payments, check-in/out and refunds requires an `Idempotency-Key`.
- DB: `snake_case`. Migrations are forward-only, live in `supabase/migrations/`, and are backward compatible with the previous API deploy (expand → migrate → contract). Add an index for every foreign key and every query in a hot path.
- Data access: **Drizzle** via `packages/db` only; raw SQL only through parameterised `sql` template tags. Serverless code connects through **Supavisor transaction mode** (port 6543, `prepare: false`); migrations use the direct connection.
- **Every new table's migration enables RLS** (`alter table … enable row level security;`) and adds no `anon`/`authenticated` policies unless an ADR says so. CI fails on any RLS-disabled table.
- SQL functions: `security definer` only with a pinned `search_path`, and `execute` granted only to the API role.
- Jobs: no long-running workers. Use `pg_cron` (pure SQL, or → `pg_net` → `/internal/jobs/:job` with HMAC header) and `pgmq` queues. Jobs are idempotent and chunked to finish within the Vercel function time limit.
- The Supabase **secret/service key** and DB URL are server-only (Vercel env). Clients get only the Supabase URL + publishable key and use Supabase **only for Auth**.
- UI: only design tokens. Never use raw hex, px or font values in components. Use components from `packages/ui` / `packages/ui-native` before writing new ones.
- Logging: structured pino logs with redaction. Never log OTPs, tokens, passwords, full phone numbers, card data or permit/ID documents.
- Small modules, clear names, comments only where the *why* isn't obvious.

## 6. Folder conventions

```
apps/api/src/modules/<module>/   routes.ts (Hono + zod-openapi), service.ts, repository.ts, policies.ts
apps/api/src/jobs/               /internal/jobs/:job handlers (HMAC-verified, idempotent)
apps/api/test/                   integration tests, rbac-matrix.spec.ts
packages/db/src/                 Drizzle schema, client, typed queries
supabase/                        config.toml, migrations/ (schema, RLS, SQL functions, pg_cron), seed.sql
apps/mobile/app/                 Expo Router screens; src/features/<feature>/
apps/portal/app/(operator)/      operator portal; app/attend/ attendant PWA
apps/admin/app/                  internal console
packages/domain/src/<area>/      pure logic + *.spec.ts beside it
packages/contracts/src/<area>/   zod schemas
docs/decisions/NNNN-title.md     ADRs
docs/sprints/S<n>-report.md      sprint reports
```

## 7. Never do (non-negotiables)

1. Never store wallet balances, credits redeemable for cash, or any stored value. Discounts only.
2. Never show a lot to drivers unless it is `LIVE` with an approved, unexpired permit and an approved verification under 12 months old.
3. Never perform a privileged action without an `AuditLog` row.
4. Never store PII that isn't classified in doc 06. Never log secrets or PII.
5. Never let attendant check-in depend on the network. It must work offline for 8+ hours.
6. Never call an external service directly from business code. Always go through its provider interface.
7. Never confirm a booking from the client's word. Only a verified webhook or a server-side verify call can confirm it.
8. Never compute prices on a client. Clients display server quotes.
9. Never commit secrets or `.env` files with real values. Never disable CI checks, tests or lint rules to make a build pass.
10. Never use floats for money. Never use string-concatenated SQL.
11. Never enforce authorisation only in the UI.
12. Never query Supabase directly from a client (mobile, web, portal, admin, PWA) for data. Clients use Supabase for Auth only; all data goes through `apps/api`.
13. Never put the Supabase secret/service key or DB connection string in a client bundle, mobile app, `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` variable or log.
14. Never create a table without enabling RLS in the same migration.

## 8. Security checklist (every PR)

- [ ] New endpoints have authN plus a policy check, with RBAC matrix tests and a cross-tenant test.
- [ ] Input is validated with Zod and output is serialised through a schema (no leaked fields).
- [ ] Idempotency is handled where required. Race conditions are considered (locks or transactions).
- [ ] No secrets in code. New secrets go in Vercel env vars (Sensitive) and the env schema; SQL-side secrets in Supabase Vault. Nothing secret behind a `NEXT_PUBLIC_`/`EXPO_PUBLIC_` prefix.
- [ ] New tables have RLS enabled; new SQL functions have a pinned `search_path` and restricted `execute`.
- [ ] PII fields are added to doc 06 and the log redaction list is updated.
- [ ] Uploads: MIME sniffing, size limits, re-encoding, private Supabase Storage bucket, signed upload/download URLs issued by the API.
- [ ] Rate limits on public and auth endpoints.
- [ ] Webhooks: signature verified, replay-safe.
- [ ] Privileged actions are audited.
- [ ] Dependencies added are necessary, maintained and licence-compatible. `pnpm audit` is clean.
- [ ] Error messages don't reveal internals or whether an account exists.

## 9. ADRs (architecture decision records)

Write an ADR when you choose or change a library, provider, data model pattern, security control or anything listed in doc 00 §3.

- File: `docs/decisions/NNNN-short-title.md`, numbered sequentially.
- Template: see `docs/decisions/0001-record-architecture-decisions.md`.
- Status: `Proposed → Accepted → Superseded by NNNN`.
- If an ADR changes a canonical decision, also update doc 00 in the same PR.

## 10. Keeping docs true

When behaviour changes, update the doc in the same PR:

| Change | Update |
|---|---|
| Requirement or acceptance criteria | doc 19 (PRD) |
| API, data model, state machine, testing approach | doc 02 |
| Service boundaries, infra, integrations | doc 01 |
| Screens or flows | doc 03 |
| Tokens or components | docs 04, 07–16 |
| Security control | doc 05 |
| New data, retention | doc 06 |
| Scope moved between sprints | doc 20 carry-over log |

## 11. Commits and PRs

- Conventional Commits: `feat(api): …`, `fix(mobile): …`, `test(domain): …`, `docs: …`, `chore(infra): …`, `refactor(portal): …`. Use the app or package name as the scope.
- Reference FR IDs in the body: `Refs: FR-BOOK-001`.
- PRs are small (one story). The description includes FR IDs, test evidence, the security checklist, screenshots for UI and migration notes.
- Payments, auth, security and infra PRs need human review before merge.

## 12. Definition of Done

A story is done only when every item of doc 20 §1.2 holds. In short:

- Tests were written first and pass, and coverage thresholds are met.
- Lint, typecheck, audit and secret scan are clean.
- OpenAPI has been regenerated.
- Authorisation, audit and PII handling are in place.
- Accessibility has been checked.
- Docs are updated.
- The story is deployed to `dev` and demoable on staging.
