# 22 — Environment Setup

> **Audience:** the owner and engineers setting up or maintaining Parkly's environments.
> **Status:** v1.0, 21 Oct 2026. The canonical decisions live in doc 00 §3.3 and ADR 0002; this doc is the step-by-step guide.
> **Rule:** remote databases are changed only by CI (`supabase db push` in `.github/workflows/deploy.yml`), never from a laptop (AGENTS.md §4). Secrets never go in git, in a client bundle, or in any `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variable.

---

## 1. The four environments

| Env | What it's for | Supabase project | Apps hosted on | Paystack | SMS | Deployed by |
|---|---|---|---|---|---|---|
| **local** | Your PC (`pnpm dev`, Expo) | none (in-memory) **or** the dev DB via `DATABASE_URL` | your PC | fake (or test key) | fake + Supabase test numbers | you |
| **dev** | Shared development, PR previews | `devproject` (`qbheoilyuvudiefubdco`) | Vercel **Preview** (per PR) | test key | fake + test numbers | Vercel Git integration; migrations by `deploy.yml` on merge to `main` |
| **staging** | Every merge to `main`; sprint demos (DoD item 11) | `parkly-staging` | Vercel custom env **staging** | **test** key | Termii once approved | `deploy.yml` on push to `main` |
| **prod** | Real users | `parkly-prod` (+ PITR) | Vercel **Production** | **live** key | Termii (required) | `deploy.yml` on tag `vX.Y.Z` + manual approval |

**Order of operations on every release:** migrations first, then code (ADR 0002). The API refuses to start with unsafe settings: live Paystack keys outside prod, fakes in prod, fake storage outside local (`apps/api/src/config/env.ts`).

### 1.1 Current state (21 Oct 2026, updated after dev hosting went live)

| Item | State |
|---|---|
| local | ✅ working; API uses the dev DB through `apps/api/.env` |
| dev Supabase | ✅ `devproject`, Ireland (`eu-west-1`), Postgres 17. Migrations up to S1 applied; S2 migrations (`20261021090000`, `…091000`, `…091100`, `…093000`) waiting for a push. Phone sign-in on, test number `2348061325196=123456`. |
| staging / prod Supabase | ❌ not created. The org `parkly` already has 2 projects (`devproject` plus an unused default project `zaasjtmqznaxlqjianok`). The Free plan normally allows 2 active projects, so staging and prod need the **Pro** plan (billed per project), or the unused project must be deleted. |
| Vercel (dev hosting) | ✅ Team `sellytics-1483` (**Hobby**, temporary: for dev only, move to a Parkly Pro team before staging). Projects **`parkly-api`** → https://parkly-api-six.vercel.app (`/health/ready`: db ok, redis ok) and **`parkly-admin`** → https://parkly-khaki.vercel.app (admin sign-in with TOTP verified) and **`parkly-portal`** → https://parkly-portal.vercel.app (pages load; operators exist from S2 slice A). and **`parkly-web`** → https://parkly-web-two.vercel.app (placeholder page until S3). All point at the **dev** Supabase project for Production and Preview; the API allows all three sites (`CORS_ORIGINS`). Preview deployments are behind Vercel Authentication; on Hobby the production URLs are public (admin still needs password + TOTP; no IP allowlist until Pro). |
| Upstash | ✅ Redis in eu-west-1 (free), used by `parkly-api` |
| GitHub environments / secrets | ❌ not set (repo `zanaspace/parkly`); `gh` CLI not installed, so use the website |
| Custom Access Token Hook, Send SMS Hook (hosted) | ❌ not enabled (S1 carry-over) |
| Vault secrets, `parkly_api` login (hosted) | ❌ not set (S0 carry-over) |

---

## 2. Supabase: one project per environment

Do this for **staging** first, then **prod** when launch is near (S10). Dev already exists; steps 2.3–2.6 still apply to it.

### 2.1 Create the project

Dashboard → New project, or with the CLI (already logged in on this PC):

```bash
pnpm exec supabase projects create parkly-staging \
  --org-id ufpersmtazftrzzkztbc --region eu-west-1 --db-password '<generate: 32+ random chars>'
```

- Region **eu-west-1 (Ireland)** for every project (doc 00 §3.2; Vercel Functions are pinned to `dub1` to match).
- Plan: **Pro** for staging and prod. Prod also gets the **PITR** add-on (RPO ≤ 15 min, doc 00 §3.2).
- Store the DB password in your password manager. CI gets it as `SUPABASE_DB_PASSWORD` (§4).
- Note the **project ref** (the `xxxx` in `xxxx.supabase.co`).

### 2.2 Apply migrations: let CI do it

Don't push from a laptop. After §4 is set up, merging to `main` runs `supabase db push` against dev and then staging. Tags run it against prod after approval.

The **dev** project is the exception while CI isn't wired yet: the owner pushes manually from the repo root:

```bash
pnpm exec supabase link --project-ref qbheoilyuvudiefubdco
pnpm exec supabase db push        # shows the pending migrations and asks before applying
```

### 2.3 Auth settings (make the hosted project match `supabase/config.toml`)

Run `pnpm exec supabase config diff` to preview, then `pnpm exec supabase config push`. It copies the settings `config.toml` declares to the linked project and asks before each change. Then check these in the dashboard, because some are hosted-only:

| Setting | Value | Where |
|---|---|---|
| JWT signing keys | **Asymmetric (ES256)**; legacy HS256 disabled after migration | Project Settings → JWT Keys |
| Access token expiry | 900 s (15 min) | Auth → Sessions |
| Refresh token rotation + reuse detection | on, reuse interval 10 s | Auth → Sessions |
| Session time-box | 30 days | Auth → Sessions |
| Email sign-up | **on, with confirmation** (operators self-sign-up; decision S2) | Auth → Sign In / Providers → Email |
| Minimum password length / requirements | 12, letters + digits | Auth → Sign In / Providers → Email |
| **Leaked-password protection** | on (hosted-only) | Auth → Sign In / Providers → Email |
| Phone sign-up | on | Auth → Sign In / Providers → Phone |
| MFA (TOTP) | enroll + verify on | Auth → Multi-Factor |
| Site URL + redirect URLs | the env's web, portal and admin URLs + `parkly://` | Auth → URL Configuration |
| **Test phone numbers** | **dev only**, e.g. `2348061325196=123456`, in **international format without `+`**. **Never in staging or prod.** | Auth → Sign In / Providers → Phone |

### 2.4 Auth hooks

| Hook | Type | Target | Envs |
|---|---|---|---|
| Custom Access Token | Postgres | `public.fn_custom_access_token_hook` (created by migration) | all |
| Send SMS | **HTTPS** | `https://<api-domain>/hooks/supabase/send-sms`. Copy the generated secret (`v1,whsec_…`) into the API env `SUPABASE_SMS_HOOK_SECRET`. | staging, prod (and dev once the API is deployed) |

Until the API is deployed somewhere public, dev can't reach an HTTPS hook. Keep using test phone numbers there.

### 2.5 Vault secrets (used by `pg_cron` → `/internal/jobs/:job`)

Run in the project's SQL editor, with the values for that environment:

```sql
select vault.create_secret('<same value as the API env JOB_HMAC_SECRET>', 'job_hmac_secret');
select vault.create_secret('https://<api-domain>', 'api_base_url');
```

Until these exist, `fn_invoke_job` logs a warning and skips (no harm).

### 2.6 The API's database role

The API should connect as `parkly_api` (row-level policies per table), not `postgres`. In the SQL editor:

```sql
alter role parkly_api with login password '<generate: 32+ random chars>';
```

Then the API's `DATABASE_URL` is the **Transaction pooler** string (port **6543**) with user `parkly_api.<project-ref>` and that password. If the password contains `@ # / ? : %`, URL-encode them (e.g. `@` → `%40`).

> **Local dev today** uses the `postgres` user in `apps/api/.env` as a shortcut. Switch it to `parkly_api` once the role has a password.

### 2.7 Keys you'll need from each project

Project Settings → API Keys:

- **Project URL**: public. Goes to every app.
- **Publishable key** (`sb_publishable_…`): public. Goes to every app.
- **Secret key** (`sb_secret_…`): **server-only**. Goes only into the API env (`SUPABASE_SECRET_KEY`).

---

## 3. Vercel: four projects, three environments each

> **Build settings for the API live in `apps/api/vercel.json`** (install + build commands). The build must compile only the API's workspace dependencies, never the API itself: Vercel's Hono preset compiles `src/index.ts`, and a pre-built `dist/` makes it deploy files Node cannot load ("Cannot use import statement outside a module"). `src/vercel-config.spec.ts` guards this. Next apps use `cd ../.. && pnpm turbo run build --filter=@parkly/<app>` (no `...`, which would build other apps too).

Log in first on this PC with `vercel login`, or use the website.

### 3.1 Create the projects

| Project | Root directory | Framework | Notes |
|---|---|---|---|
| `parkly-api` | `parkly-app/apps/api` | Hono (auto-detected) | `vercel.json` pins `dub1` and sets install/build commands |
| `parkly-web` | `parkly-app/apps/web` | Next.js | |
| `parkly-portal` | `parkly-app/apps/portal` | Next.js | operator portal + `/attend` PWA |
| `parkly-admin` | `parkly-app/apps/admin` | Next.js | own domain, **IP allowlist** + Deployment Protection (doc 05) |

For each one:
- Plan **Pro** (needed for the custom `staging` environment, Firewall rules and `dub1` functions).
- **Settings → Functions → Region: `dub1`** (Dublin, same as the DB).
- **Settings → Environments → create `staging`** (a custom environment).
- **Git:** connect `zanaspace/parkly`. Preview deployments come from PRs; production and staging come from `deploy.yml`, not auto-deploys, so turn off auto-deploy of `main` to Production.
- Note each project's **Project ID** (Settings → General) for GitHub (§4).

### 3.2 Environment variables

Set them in Settings → Environment Variables, per environment (Preview = dev, staging, Production = prod). Mark every secret **Sensitive**.

**`parkly-api`**

| Variable | dev (Preview) | staging | prod | Secret? |
|---|---|---|---|---|
| `APP_ENV` | `dev` | `staging` | `prod` | |
| `LOG_LEVEL` | `debug` | `info` | `info` | |
| `CORS_ORIGINS` | preview URLs of web/portal/admin | staging URLs | prod domains | |
| `DATABASE_URL` | dev pooler URL as `parkly_api` (6543) | staging pooler | prod pooler | ✅ |
| `SUPABASE_URL` | dev project URL | staging URL | prod URL | |
| `SUPABASE_PUBLISHABLE_KEY` | dev publishable | staging | prod | |
| `SUPABASE_SECRET_KEY` | dev `sb_secret_…` | staging | prod | ✅ |
| `SUPABASE_SMS_HOOK_SECRET` | from Send SMS hook | from hook | from hook | ✅ |
| `JOB_HMAC_SECRET` | `openssl rand -hex 32` (same value in Vault, §2.5) | own value | own value | ✅ |
| `HASH_PEPPER_V1` | `openssl rand -hex 32` | own value | own value | ✅ |
| `ENC_KEY_V1` | `openssl rand -base64 32` | own value | own value | ✅ |
| `ENC_KEY_CURRENT` | `v1` | `v1` | `v1` | |
| `STORAGE_PROVIDER` | `supabase` | `supabase` | `supabase` | |
| `SETTLEMENT_PROVIDER` | `paystack` | `paystack` | `paystack` | |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_live_…` (live only here) | ✅ |
| `MALWARE_SCANNER` | `fake` | `fake` | real vendor (ADR 0013) | |
| `SMS_PROVIDER` | `fake` | `termii` once approved | `termii` (required) | |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | — | when approved | required | ✅ (key) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | one DB per env | own | own | ✅ (token) |
| `SENTRY_DSN` | EU DSN | EU DSN | EU DSN | |

**Never reuse** `HASH_PEPPER_V1`, `ENC_KEY_V1` or `JOB_HMAC_SECRET` across environments. Losing a prod encryption key makes encrypted fields unreadable, so store each one in the password manager as well.

**`parkly-web`, `parkly-portal`, `parkly-admin`** (all public values)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | that env's project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | that env's publishable key |
| `NEXT_PUBLIC_API_URL` | that env's API URL |

Nothing secret ever goes in a `NEXT_PUBLIC_*` variable.

---

## 4. GitHub: environments, secrets and variables

Repo **zanaspace/parkly** → Settings → Environments. Create `dev`, `staging` and `production`. On **`production`**, add **Required reviewers** (this is the manual approval gate for tags).

| Name | Kind | Scope | Value |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | repository | Supabase → Account → Access Tokens |
| `VERCEL_TOKEN` | secret | repository | Vercel → Account → Tokens |
| `VERCEL_ORG_ID` | secret | repository | Vercel team ID (Settings → General) |
| `SUPABASE_DB_PASSWORD` | secret | per environment | that project's DB password (§2.1) |
| `SUPABASE_PROJECT_REF` | variable | per environment | `qbheoilyuvudiefubdco` for dev, the staging ref, the prod ref |
| `VERCEL_PROJECT_ID_API` / `_WEB` / `_PORTAL` / `_ADMIN` | variable | staging, production | Project IDs from §3.1 |

These names match `.github/workflows/deploy.yml` exactly.

---

## 5. Local environment

Every local env file is git-ignored. Copy from the `.env.example` next to each.

| File | Holds | Notes |
|---|---|---|
| `apps/api/.env` | DB URL, Supabase keys, provider switches | Without `DATABASE_URL` the API uses in-memory storage (lost on restart) |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEV_AUTH` | Phone on Wi-Fi: API URL = PC's LAN IP (e.g. `http://192.168.100.120:4000`). With a real DB set `EXPO_PUBLIC_DEV_AUTH=off`, sign in with a test number, and restart Expo with `--clear`. |
| `apps/portal/.env.local`, `apps/admin/.env.local`, `apps/web/.env.local` | the three `NEXT_PUBLIC_*` values | |

**Phone on the same Wi-Fi?** Windows must treat the network as **Private** and allow Node.js inbound on Private networks. Otherwise Expo Go shows "Something went wrong".

---

## 6. Checklist per environment

- [ ] Supabase project in `eu-west-1`, right plan (Pro; PITR for prod)
- [ ] Migrations applied by CI; `select count(*) from supabase_migrations.schema_migrations` matches the repo
- [ ] Security Advisor shows no issues (RLS on every table)
- [ ] Auth settings match §2.3; leaked-password protection on; no test numbers outside dev
- [ ] Custom Access Token hook on; Send SMS hook pointing at the API (staging/prod)
- [ ] Vault `job_hmac_secret` + `api_base_url`; `parkly_api` has a login password
- [ ] Vercel: 4 projects, `dub1`, env vars set and Sensitive where marked; admin IP allowlist
- [ ] GitHub environment with `SUPABASE_DB_PASSWORD` + `SUPABASE_PROJECT_REF` (+ Vercel project IDs)
- [ ] `GET <api>/health/ready` → `{"status":"ok","checks":{"db":"ok","redis":"ok"}}`
- [ ] Sign in to portal and admin with TOTP; driver sign-in works (test number in dev; real SMS in staging/prod)

---

## 7. Costs to expect (confirm on the vendors' pricing pages)

Supabase **Pro** per project (staging, prod; prod adds PITR), Vercel **Pro** per seat, Upstash (pay-per-request, small), Sentry (free or Team), Termii (per SMS), Paystack (per transaction, no monthly fee), the malware-scanning vendor (ADR 0013). The Free plans are enough for **local + dev** only.
