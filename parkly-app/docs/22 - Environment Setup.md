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
| Auth email sender (dev, Oct 30) | ⚠️ Gmail SMTP with an app password, for testing only. Resend needs a verified domain to reach anyone but the account owner (§2.3a). |
| Email codes (dev, Oct 30) | ✅ 6 digits, 300 s; Confirm signup and Magic Link templates from `supabase/templates/` |
| Turnstile captcha (dev, Oct 30) | ✅ On in Supabase; site key on the portal, admin and web Vercel projects and the mobile preview build; mobile `production` EAS env still to set (§2.3b) |

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
| **Email OTP expiry** | **300 s** (doc 05 §4.1; matches `supabase/config.toml`) | Auth → Sign In / Providers → Email |
| **SMS OTP expiry** | **300 s** | Auth → Sign In / Providers → Phone |
| Captcha (Turnstile) on sign-in | **on before launch**: needs a Cloudflare Turnstile site key in the apps and the secret here (gap review S-4) | Auth → Bot and Abuse Protection |
| Site URL + redirect URLs | the env's web, portal and admin URLs + `parkly://` | Auth → URL Configuration |
| **Test phone numbers** | **dev only**, e.g. `2348061325196=123456`, in **international format without `+`**. **Never in staging or prod.** | Auth → Sign In / Providers → Phone |

### 2.3a Driver email codes (ADR 0015)

Drivers sign in with a 6-digit code by email until SMS is live. In each project:

1. **Auth → Sign In / Providers → Email:** enabled. Keep "Confirm email" on. Set **Email OTP Length** to `6` (every sign-in form expects 6 digits; new hosted projects default to 8) and **Email OTP Expiration** to `300`.
2. **Auth → Email Templates:** paste the HTML from `supabase/templates/` (local Supabase uses the same files through `config.toml`).
   - **Magic Link** (a returning driver or attendant): `magic_link.html`, subject `Your Parkly code`. It shows the code only.
   - **Confirm signup** (a brand-new address): `confirmation.html`, subject `Confirm your Parkly account`. It shows the **link only** to operators who signed up with a password in the portal (the sign-up sets `operator_signup` in user metadata), and the **code only** to everyone else (drivers and attendants signing in by email code).
3. **Project Settings → Authentication → SMTP Settings: enable custom SMTP.** Supabase's built-in sender only reaches the project's own team members and a few emails an hour. Example with Resend (free tier): create an account, add and verify the sending domain (or start with Resend's test sender), create an API key, then set host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender `Parkly <no-reply@your-domain>`. The key lives only in Supabase, never in git or Vercel.
4. **Auth → Rate Limits:** raise "emails sent per hour" once custom SMTP is on (e.g. 100 for dev).

### 2.3b Security check on sign-in (ADR 0019)

Cloudflare Turnstile stops scripts from requesting codes or trying passwords. The apps send a token only when they have a site key; Supabase checks it only when captcha is on. **Turn it on in this order**, or sign-in breaks on any screen without a token:

1. **Cloudflare → Turnstile → Add widget.** Mode "Managed". Hostnames: the portal, admin and website domains for this environment (and `localhost` for dev). Copy the **site key** (public) and **secret key**.
2. **Vercel:** set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the portal, admin and web projects, then redeploy. Sign-in forms now show the check.
3. **Mobile:** set `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and `EXPO_PUBLIC_TURNSTILE_ORIGIN` (one of the widget's hostnames, e.g. `https://parkly-web.vercel.app`) in the EAS build profile, and **ship that build**. Older app builds can't send a token, so they stop signing in after step 4.
4. **Supabase → Authentication → Attack Protection → Enable Captcha protection:** provider Turnstile, paste the **secret key**, save.
5. Test: sign in on each app. A request without the check should fail with "Please complete the security check".

To turn it off, reverse the order: disable it in Supabase first, then remove the keys.

### 2.3c Notification email and push (ADR 0020)

The API sends booking notices and team invites itself (Supabase only sends sign-in emails). Until these are switched on, dev logs emails and fakes push, and invites are shared by copying the link.

1. **Email:** verify a sending domain in Resend (a subdomain such as `parkly.cicod.com` works; add the DNS records Resend shows). Create an API key. On the `parkly-api` Vercel project set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` (Sensitive) and `EMAIL_FROM=Parkly <no-reply@<that domain>>`, then redeploy. Use the same domain for Supabase SMTP (§2.3a) and delete the Google app password.
2. **Push:** set `PUSH_PROVIDER=expo` on `parkly-api` and redeploy. Push reaches only phones running an EAS build that registered a token after sign-in; Expo Go can't get tokens on Android.
3. **Check:** book and pay on dev. Within a minute `notifications` has a `booking.confirmed` row with `status = 'SENT'`. A row stuck on `PENDING` with `attempts >= 3` shows the failing channel in `last_error`.

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

**Run a job by hand** (same SQL editor, once the secrets exist). Outside production the permit expiry job accepts `asOf` to fast-forward the clock, which is how the S2 demo shows a lot being suspended:

```sql
select public.fn_invoke_job('permit-expiry-check');                          -- today
select public.fn_invoke_job('permit-expiry-check', '{"asOf":"2027-01-09"}'); -- pretend it is 9 Jan 2027
```

The call is asynchronous: see the response in `net._http_response` and the API logs. Emails are only logged (`email not sent (log only)`) until the email provider arrives in S6.

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
| `LOCATIONIQ_API_KEY` | not set (fake place list) | LocationIQ access token | LocationIQ access token (required) | ✅ |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_live_…` (live only here) | ✅ |
| `PAYSTACK_WEBHOOK_IPS` | not needed (not checked locally) | not set: Paystack's published IPs are built in | not set | |
| `MALWARE_SCANNER` | `fake` | `fake` | real vendor (ADR 0013) | |
| `SMS_PROVIDER` | `fake` | `termii` once approved | `termii` (required) | |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | — | when approved | required | ✅ (key) |
| `EMAIL_PROVIDER` | `log` until the Resend domain is verified | `resend` | `resend` (required) | ADR 0020 |
| `RESEND_API_KEY`, `EMAIL_FROM` | when `resend` | own key; sender on the verified domain, e.g. `Parkly <no-reply@parkly.cicod.com>` | required | ✅ (key) |
| `PUSH_PROVIDER` | `expo` once an EAS build is in testers' hands | `expo` | `expo` (required) | |
| `EXPO_ACCESS_TOKEN` | only if Expo "enhanced security" is on | same | same | ✅ |
| `WEB_BASE_URL` | `https://parkly-web-two.vercel.app` (set Oct 30) | staging web URL | live web URL | links in SMS and email |
| `PORTAL_BASE_URL` | `https://parkly-portal.vercel.app` (set Oct 30) | staging portal URL | live portal URL | invite links |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | one DB per env | own | own | ✅ (token) |
| `SENTRY_DSN` | EU DSN | EU DSN | EU DSN | |
| `TEST_SHORT_STAYS` | `on` only while testing overstay | `off` | **never `on`** (config refuses it) | 5-minute test stays |

`SETTLEMENT_PROVIDER=paystack` also switches booking checkout to Paystack with the same key (Sprint 4). Then, in the Paystack dashboard for that key (Settings → API Keys & Webhooks), set the **Webhook URL** to `<that env's API URL>/v1/webhooks/paystack` (dev: `https://parkly-api-six.vercel.app/v1/webhooks/paystack`). Paystack signs each webhook with the secret key; nothing else to store. Outside prod, lots whose operator has no active subaccount (the demo lots) take payments with no split, all to the main account; prod refuses them.

**Never reuse** `HASH_PEPPER_V1`, `ENC_KEY_V1` or `JOB_HMAC_SECRET` across environments. Losing a prod encryption key makes encrypted fields unreadable, so store each one in the password manager as well.

**`parkly-web`, `parkly-portal`, `parkly-admin`** (all public values)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | that env's project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | that env's publishable key |
| `NEXT_PUBLIC_API_URL` | that env's API URL |
| `NEXT_PUBLIC_TEST_STAYS` | `on` only on dev, with the API's `TEST_SHORT_STAYS=on` (web only) |

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

## Demo data (dev and local only)

Twelve demo car parks in Victoria Island, Ikoyi and Lekki Phase 1 make driver search usable before real operators go live. Each is LIVE with its own "… (demo)" operator, an approved permit and site visit, prices and hours. Data only, never schema; refused when `APP_ENV` is `staging` or `prod`.

```bash
pnpm --filter @parkly/api seed:demo -- --confirm-dev             # add (skips lots already there)
pnpm --filter @parkly/api seed:demo -- --confirm-dev --perf 500  # also 500 synthetic lots, for latency checks
pnpm --filter @parkly/api seed:demo -- --confirm-dev --remove    # delete every demo lot and operator
pnpm --filter @parkly/api seed:demo -- --confirm-dev --dry-run   # do it, then roll back
```

It uses `DATABASE_URL` from `apps/api/.env` and needs one admin user (demo site visits name an inspector). Dev currently has the 12 demo lots (loaded 2026-10-22).

## Vercel deployments and the Hobby limit

The Vercel Hobby plan allows **100 deployments a day** per account. Previously every push deployed all four apps as previews and every merge deployed all four again, so a busy day hit the limit ("Deployment rate limited — retry in 24 hours", 2026-10-22).

Each app's `vercel.json` now deploys from `main` only:

```json
"git": { "deploymentEnabled": { "main": true, "**": false } }
```

- Branches and pull requests no longer get preview deployments; check work locally (`pnpm --filter @parkly/<app> dev`) and on the dev sites after merging.
- A merge to `main` deploys the four apps (at most 4 deployments per merge).
- An "Ignored Build Step" would not help: Vercel counts canceled builds toward the daily limit.
- To get previews back, move the team to Vercel Pro (6,000 deployments a day) and remove the `**` rule. A test (`apps/api/src/vercel-config.spec.ts`) keeps the four files in step.
