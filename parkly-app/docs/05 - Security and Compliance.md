# 05 — Security and Compliance

> **Status:** v1.1 — 14 Oct 2026 (updated for Supabase + Vercel per [ADR 0002](decisions/0002-supabase-and-vercel-for-mvp.md)). Canonical names, stack and roles come from [00 — Read Me First](00%20-%20Read%20Me%20First%20-%20Index.md). Data classes (C1–C4) are defined in [06 — Data Storage, Classification and Retention](06%20-%20Data%20Storage%20Classification%20and%20Retention.md).
> **Legend:** ⚖️ **COUNSEL** = needs confirmation by a Nigerian lawyer before public launch. This document is engineering guidance, not legal advice.
> **Rule for agents:** every PR that touches auth, payments, booking, check-in, PII or infra must reference the section(s) of this doc it implements and must not weaken any control marked **MUST**.

---

## 1. Security objectives

1. **Protect money flows.** No one can obtain parking without paying, redirect operator settlements, or trigger refunds they are not entitled to.
2. **Protect people.** Driver phone, plate, location and booking history are never exposed to anyone without a need to know.
3. **Protect trust.** Only verified, permitted lots are shown; attendants cannot fake check-ins; reviews/incidents cannot be manipulated.
4. **Stay available where it matters.** Check-in works offline; payment and OTP outages degrade gracefully.
5. **Prove it.** Every privileged action is audited; controls are tested in CI; compliance evidence is producible on request.

Target assurance level: **OWASP ASVS 4.0 Level 2** for all apps, **Level 3 controls** for authentication, payments and admin.

---

## 2. Trust boundaries and assets

```
[Driver app / Driver web] ──TLS──┐                  (Auth only: publishable key)
[Attendant PWA (offline cache)] ─┼──────────────────────────────► Supabase Auth ──Send SMS Hook──► API ──► Termii
[Operator portal] ───────────────┤
[Admin console (IP allowlist)] ──┴──► Vercel Firewall (WAF) ──► API (Hono on Vercel Functions, lhr1)
                                                                   │  service-side DB role (bypasses RLS)
                                                                   ├──► Supabase Postgres (Supavisor, TLS) — RLS deny-all for anon/authenticated
                                                                   ├──► Supabase Storage (private buckets, signed URLs)
                                                                   ├──► Upstash Redis (rate limits)
                                                                   ├──► Paystack / Flutterwave (outbound)
                                                                   └──► Resend / Expo Push / Google Maps / Sentry / Better Stack
[Paystack / Flutterwave webhooks] ──► /v1/webhooks/* (signature-verified)
[Supabase pg_cron → pg_net] ──HMAC──► /internal/jobs/:job
```

**Trust boundary rule:** clients hold only the Supabase URL + **publishable (anon) key** and their own user JWT. Every data read/write goes through `apps/api`. The Supabase **secret/service_role key** and the DB connection string exist only in server-side Vercel env (`parkly-api`) and GitHub Actions secrets for migrations.

| Asset | Class | Why it matters |
|---|---|---|
| Payment references, settlement records, ledger | C3/C4 | Financial loss, fraud |
| OTP hashes, refresh tokens, password hashes, TOTP secrets (held in Supabase Auth `auth` schema) | C4 | Account takeover |
| Supabase secret/service_role key, DB connection string, JWT signing keys, job HMAC secret, `ENC_KEY_*` | C4 | Full data compromise |
| Driver phone, name, email, plates, booking/location history | C3 | Privacy, physical safety (tracking a person's routine) |
| Operator KYB documents, masked bank info, Paystack subaccount codes | C4 | Settlement redirection, identity fraud |
| Lot QR signing keys, attendant device keys | C4 | Fake check-ins |
| Permits, verification photos | C3 | Trust layer integrity |
| Audit logs | C3 (integrity-critical) | Evidence, non-repudiation |

---

## 3. Threat model (STRIDE)

Review this model at the start of every sprint that adds a new surface or integration. New threats → add a row and a test.

### 3.1 Driver mobile app (`apps/mobile`) and driver web (`apps/web`)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Account takeover via SIM swap / OTP interception | OTP + device binding; step-up re-verification on new device for sensitive actions; notify old device on new login; SIM-swap check API where the SMS provider supports it (§4.1) |
| S | Fake app / phishing clone | Play Integrity API attestation on login (soft-fail in MVP, logged); app signing via EAS; brand monitoring |
| T | Tampered client sends altered price/amount | **Server computes all prices**; client amounts are ignored; contracts reject unknown fields |
| R | Driver denies making a booking | Booking + payment + device ID + IP recorded in append-only audit/ledger |
| I | Tokens extracted from device | Tokens in `expo-secure-store` (Android Keystore / iOS Keychain); never in AsyncStorage; no tokens in logs/crash reports |
| I | Location/search history leaked | Search history not stored server-side beyond 30 days (doc 06); analytics gets coarse geohash only |
| D | Booking hoarding (reserve all capacity, never pay) | `PENDING_PAYMENT` hold expires in 10 min; max 2 pending bookings per driver; per-device and per-phone rate limits |
| E | Driver accesses another driver's booking (IDOR) | Every query scoped by `userId` from token; UUIDv7 not treated as secret; policy tests (§5.4) |

### 3.2 Attendant PWA (`apps/portal` route `/attend`, offline-first)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Shared/stolen attendant phone used by someone else | Attendant login + 6-digit PIN to unlock app after 5 min idle; device registration approved by operator manager; remote device revocation |
| S | Forged driver QR code | QR is a signed token (Ed25519) verified offline with the lot public key (§10) |
| T | Attendant edits cached manifest or queued events | Queued events are signed with a per-device key (WebCrypto, non-extractable); server re-validates every event against server state on sync |
| R | Attendant claims "driver never came" / collusive cash parking | Every check-in/out is an event with device ID, attendant ID, local time + server receive time; anomaly reports (§9.3) |
| I | Cached manifest leaks driver data | Manifest contains booking code, **masked** plate (`LND***AB` + full normalised plate hash for matching), vehicle make/colour, time window — **no phone numbers, no names beyond first name**; IndexedDB cleared on logout and after 24 h |
| D | Device offline > 8 h, queue grows | Queue capped (5,000 events); warning banner at 6 h offline; events carry monotonic sequence numbers |
| E | Attendant accesses other lots or operator finance | Attendant token scoped to `operatorId` + assigned `lotIds`; finance endpoints require `OPERATOR_OWNER`/`OPERATOR_MANAGER` |

### 3.3 Operator portal (`apps/portal`)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Credential stuffing | Supabase Auth password hashing + leaked-password protection (HIBP), sign-in rate limits (Supabase + Upstash), mandatory TOTP for owners and managers |
| T | Operator changes bank account to attacker's | Bank/subaccount change requires owner + TOTP step-up, 24 h cooling period before first settlement to the new account, email + SMS alert to all owners, admin review |
| T | Operator sets abusive prices | Rate plan changes go through admin approval; price bounds per district in config |
| R | Operator disputes settlement amount | Ledger is double-entry, immutable; daily statements emailed; reconciliation report |
| I | Operator sees driver PII beyond need | Operators see first name, masked phone (`+234 80* *** 1234`), plate, booking times; full phone only via in-app masked call/SMS relay (later) |
| E | Manager escalates to owner | Role changes only by `OPERATOR_OWNER`; audited |

### 3.4 Admin console (`apps/admin`)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Admin account takeover | Supabase Auth (Google Workspace OAuth restricted to the company domain, or email+password) **plus** mandatory TOTP — API rejects admin requests whose JWT `aal` ≠ `aal2`; Vercel Firewall IP allowlist (office + VPN) on the admin domain; 12 h max session, 30 min idle |
| T | Rogue insider approves own fake lot / issues refunds | Four-eyes: lot `LIVE` approval and refunds > ₦50,000 need a second admin; no self-approval of own submissions |
| R | Admin denies action | `AuditLog` for every admin read of C3/C4 records and every write; daily export to a write-once (object-lock) off-platform bucket |
| I | Bulk data export | No bulk export in MVP; exports > 100 rows need `SUPER_ADMIN` and are audited; PII masked by default with "reveal" action that is logged |
| E | Support role does finance actions | Granular roles (§5.1); deny-by-default guards |

### 3.5 API (`apps/api`, Hono on Vercel Functions) and background jobs

| STRIDE | Threat | Controls |
|---|---|---|
| S | Forged JWT | Supabase Auth asymmetric signing keys (**ES256 only**); API verifies against the project JWKS (cached, refreshed on unknown `kid`); strict `alg` allowlist, `iss`/`aud`/`exp` checks; HS256 legacy secret **disabled** once asymmetric keys are active |
| T | Mass assignment | Zod schemas with `.strict()`; DTOs never spread into Drizzle `insert().values()`/`update().set()` — map fields explicitly |
| T | SQL injection in geo queries | Drizzle query builder or parameterised `sql\`\`` template only; `sql.raw()` with any non-constant input banned by lint/Semgrep rule |
| R | Missing evidence | Request ID + user ID + role on every log line; `AuditLog` service |
| I | Verbose errors | RFC 9457 problems with stable `code`; stack traces never returned outside `local` |
| D | Abuse / scraping | Vercel Firewall rate rules + Upstash token-bucket limits (§8); pagination max 100; request body max 1 MB (uploads go direct to Supabase Storage via signed upload URLs) |
| D | Double-booking under race | `fn_hold_booking` Postgres function: ordered `SELECT … FOR UPDATE` on `lot_slot_inventory` + insert in one transaction (doc 02, ADR 0002) |
| D | Long job exceeds function time limit, partial work | Jobs chunked and idempotent; each chunk records a cursor; re-run safe |
| E | Broken object/function-level authorisation | Central `requirePermission()` Hono middleware; every route declares required permission; CI test asserts no route lacks one |

### 3.8 Supabase and Vercel platform

| STRIDE | Threat | Controls |
|---|---|---|
| I/T | **Leaked publishable (anon) key** — it ships in every client, so assume it is public | **RLS enabled on every table in `public` (and any other exposed schema) with no policies for `anon`/`authenticated` → deny-all.** Exposed API schemas limited to what's required; Storage buckets private with no client policies; CI test (§5.4) proves an anon and an authenticated JWT can read/write **nothing** via PostgREST/Storage |
| I/E | **Misconfigured RLS** (table created without RLS, permissive policy added later) | Migration lint: every `CREATE TABLE` in `public` must be followed by `ENABLE ROW LEVEL SECURITY`; `supabase db lint` + Supabase Security Advisor checks in CI; event trigger (`ensure_rls`) auto-enables RLS on new tables; adding any policy needs an ADR + security-owner review |
| E | **Exposed service_role/secret key or DB URL** | Server-only Vercel env (Sensitive) on `parkly-api` only; never prefixed `NEXT_PUBLIC_`/`EXPO_PUBLIC_`; build-time check fails if the key string appears in any client bundle; gitleaks custom rule for Supabase keys; rotate immediately on suspicion (runbook) |
| S | **Spoofed `/internal/jobs/:job` call** (pg_net trigger endpoint is on the public internet) | HMAC-SHA256 over `job + timestamp + body` with secret stored in Supabase Vault and Vercel env; reject if timestamp skew > 60 s or nonce reused (nonce stored 10 min); jobs idempotent; route excluded from public OpenAPI; Vercel Firewall rule limits rate |
| E | **`SECURITY DEFINER` functions** abused by callers to bypass RLS | Only where essential (`fn_hold_booking`, auth hooks); `SET search_path = ''` and fully-qualified names; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE` only to the API role / `supabase_auth_admin`; inputs validated inside; listed in doc 02 and reviewed per PR |
| S | Forged Send SMS Hook / Custom Access Token Hook call | Hooks verify Supabase's webhook signature (Standard Webhooks secret) before acting; hook endpoint never sends to a number not in the signed payload |
| I | PostgREST/GraphQL exposure of internal schemas | `pg_graphql` disabled; PostgREST exposed schemas set to `public` only (deny-all), internal tables in `app` schema not exposed |
| D | Connection exhaustion from serverless fan-out | Supavisor transaction mode; small per-function pool; statement timeout 10 s for API role |
| E | Compromised Vercel/Supabase/GitHub account | SSO + MFA enforced on Vercel team, Supabase org and GitHub org; least-privilege member roles; production env vars editable only by owners; access reviewed quarterly |

### 3.6 Webhooks (`/v1/webhooks/paystack`, `/v1/webhooks/flutterwave`, `/v1/webhooks/termii`)

| STRIDE | Threat | Controls |
|---|---|---|
| S | Forged "payment succeeded" event | Verify `x-paystack-signature` (HMAC-SHA512 of raw body with secret key) / Flutterwave `verif-hash`; constant-time compare; reject otherwise. **Then re-query the provider's verify endpoint** before marking `SUCCEEDED` |
| T | Amount/currency tampering | Compare provider-verified `amount` (kobo), `currency`, `reference` against our `Payment` row; mismatch → `FAILED` + alert |
| R | Replay of old webhook | Event ID stored in `webhook_events` with unique constraint; events older than 24 h ignored; processing is idempotent |
| D | Webhook flood | Separate rate limit; source IP allowlist for Paystack published IPs (defence in depth, not sole control); store then process async via `pgmq` |
| E | Webhook endpoint used to reach internal logic | Webhook handler only stores the verified event and enqueues it on `pgmq`; business logic runs in the job handler |

### 3.7 Payments flow

| STRIDE | Threat | Controls |
|---|---|---|
| S | Driver pays for cheaper booking, swaps reference | Reference is server-generated, bound to `bookingId` + amount; verify call checks both |
| T | Split misconfigured → operator underpaid / Parkly overpaid | Split computed in `packages/domain/pricing`, snapshot stored on `Payment`; reconciliation job compares provider settlement vs ledger daily |
| R | Chargeback disputes | Keep evidence bundle: booking, check-in/out events, receipt, IP, device |
| I | Card data exposure | **Card data never touches Parkly servers** (provider-hosted checkout / SDK) → PCI DSS **SAQ-A** scope |
| D | Provider outage | Fail over to secondary provider via `PaymentProvider` interface; feature flag `payment_provider_primary` |
| E | Refund abuse by staff | Refunds only via `ADMIN_FINANCE`; four-eyes above threshold; refunds never exceed captured amount (DB check) |

---

## 4. Authentication

### 4.0 Platform

All identities live in **Supabase Auth** (ADR 0002). Supabase generates, stores (hashed) and expires OTPs, hashes passwords, stores TOTP factors and issues/rotates tokens. Parkly code adds: the **Send SMS Hook** (delivery + abuse limits), the **Custom Access Token Hook** (role claims), device registration, step-up rules, and API-side enforcement of `aal`, roles and scope.

Supabase Auth settings that are **MUST** (kept in `supabase/config.toml` and verified against prod by a CI check of the Management API):

| Setting | Value |
|---|---|
| Phone provider | Enabled; delivery via **Send SMS Hook** (`/hooks/supabase/send-sms` → `SmsProvider` → Termii) |
| OTP length / expiry | 6 digits / 300 s |
| Email signup | Disabled for drivers' public flow; operators invited or self-signup with email confirmation |
| Anonymous sign-ins | Disabled |
| Leaked-password protection | Enabled (HIBP) |
| Minimum password length | 10 |
| MFA (TOTP) | Enabled; enrolment required for admin roles, `OPERATOR_OWNER` and `OPERATOR_MANAGER` |
| JWT signing | Asymmetric **ES256** signing key; legacy HS256 secret revoked |
| Access token expiry | 900 s |
| Refresh token rotation | Enabled; reuse interval 10 s |
| Session timebox / inactivity timeout | Per role (§4.4) |
| Auth rate limits | Tightened from defaults (§8) |
| Redirect URL allowlist | Exact app/portal/admin URLs per environment only |

### 4.1 Drivers — phone + OTP

| Parameter | Value (MUST) |
|---|---|
| OTP generation / storage / TTL | Supabase Auth (6 digits, hashed at rest, 5 min) |
| Verify attempts | Supabase Auth verify rate limit + Upstash limit of 5 failed verifications per phone per 15 min (API wrapper / hook counter); then require a new OTP |
| Resend cooldown | 60 s (Supabase `sms` resend interval), escalating to 120 s / 300 s enforced in the Send SMS Hook; max 5 sends / phone / hour, 10 / day |
| Per-IP / per-device | Max 20 OTP requests / IP / hour (Supabase Auth IP limit + Vercel Firewall); max 10 / device / day |
| Choke point | **The Send SMS Hook is the enforcement point** for every SMS: it verifies the hook signature, applies Upstash per-phone, per-prefix and global budget limits, blocks non-Nigerian or premium-rate prefixes, and returns an error (no SMS sent) when limits are exceeded |
| Purposes | Login (`signInWithOtp`), phone change (`updateUser({phone})`, re-verification), step-up (re-verify OTP; API checks `amr` + `iat` freshness) — Supabase scopes each OTP to its flow |
| Delivery | Termii DND/transactional route; message never contains anything but the code, app name and "Never share this code" |
| Enumeration | OTP request returns the same response whether or not the number is registered |
| Logging | OTP values are **never** logged (the hook payload containing the OTP is excluded from logging and Sentry breadcrumbs); phone numbers are logged masked (`+23480****1234`) |

**SIM-swap and device considerations**
- On login from a **new device**: allow login, but mark session `trust=LOW` for 24 h: block changing phone number, adding a vehicle plate already linked elsewhere, and receipts to a new email — unless step-up succeeds.
- Notify previous devices via push ("New login on Tecno Spark …"). Provide "This wasn't me" → revokes all sessions.
- Integrate a SIM-swap check (Termii / aggregator) when available; if the SIM changed < 72 h ago, require email verification or support contact for sensitive actions. ⚖️ confirm data-sharing basis for SIM-swap lookups.
- Optional 4-digit app PIN / biometric unlock for drivers (local only; protects tokens if phone is unlocked and lost).

### 4.2 Operators — email + password (+ TOTP)

- Passwords (Supabase Auth email provider): min 10 chars, no composition rules, blocked by Supabase **leaked-password protection** (HIBP). Hashing is done by Supabase Auth (bcrypt); Parkly never sees or stores password hashes.
- TOTP (Supabase MFA, RFC 6238) **mandatory (`aal2`) for `OPERATOR_OWNER` and `OPERATOR_MANAGER`** (doc 00); owners must have a fresh `aal2` (≤ 5 min) for any bank/subaccount change. Recovery: a second TOTP factor or support-assisted reset with identity check (Supabase has no recovery codes; documented in runbook).
- Attendants: login by phone + OTP on first device registration (Supabase Auth), then 6-digit app PIN (local unlock only, max 5 attempts → wipe local cache + sign out). Device must be approved by a manager (`attendant_devices` table, checked by the API on every attendant request).
- Account lockout: Supabase sign-in rate limits + Upstash progressive delay per email + IP after 5 failures; no permanent lockout (DoS); alert owner after 10.
- Password reset: Supabase recovery link (single-use, 30 min), redirect URL allowlisted; API signs out all other sessions (`signOut({scope:'others'})`) after reset.

### 4.3 Admins

- Supabase Auth with **Google Workspace OAuth** restricted to the company domain (enforced in the Custom Access Token Hook: non-company domains get no admin claims) — or email+password where Workspace isn't available — **plus mandatory TOTP**. The API rejects any admin route unless the JWT has `aal = aal2`. WebAuthn as MFA is out of MVP scope (revisit when Supabase supports it as a factor).
- IP allowlist in Vercel Firewall on the admin domain + app-level check on `/v1/admin/*`. Session 12 h absolute, 30 min idle. Fresh TOTP verification (≤ 5 min) for four-eyes approvals.
- `SUPER_ADMIN` limited to 2 named people; break-glass account sealed and audited.

### 4.4 Tokens and sessions

| Item | Rule |
|---|---|
| Access token | Supabase-issued JWT, **ES256**, **15 min** TTL. Standard claims `sub`, `aal`, `amr`, `session_id`, `iat`, `exp`, `aud`, `iss`, plus `app_roles`, `operator_id`, `lot_ids` added by the **Custom Access Token Hook** from our tables. The API treats hook claims as a hint and **re-checks membership/scope in the DB** for writes and any finance/admin action (roles can change mid-token) |
| Refresh token | Managed by Supabase Auth; **rotated on every use**. Session lifetime via Supabase session timebox/inactivity: driver 90 days absolute / 30 days inactivity; operator 14 days; attendant 7 days; admin 12 h absolute / 30 min inactivity (inactivity also enforced in admin UI) |
| Reuse detection | Supabase refresh-token reuse detection (outside the 10 s reuse interval) revokes the session; API logs a security event when a refresh fails for reuse and alerts the user |
| Device binding | `devices` table: `deviceId` generated on install (secure storage), linked to Supabase `session_id` at sign-in; the API requires `X-Device-Id` matching the session's device on every request; mismatch → `401` + session revoked (Admin API `signOut`) |
| Web storage | Portal/admin/web use `@supabase/ssr` with **server-side** session handling: auth cookies `Secure; SameSite=Lax`, read only in server components/route handlers; no tokens in `localStorage`; CSRF protection via SameSite + Origin check on mutating requests |
| Mobile storage | supabase-js session persisted with an `expo-secure-store` storage adapter (never AsyncStorage) |
| Logout | `signOut()` revokes the refresh token server-side; "log out all devices" = `signOut({scope:'global'})` |
| Key rotation | Supabase JWT signing keys: create standby key → rotate every 90 days → revoke old key after access-token TTL; API JWKS cache refreshes on unknown `kid` |

---

## 5. Authorisation

### 5.1 Model

RBAC (roles from doc 00 §3.7) + **resource scoping** (ABAC-lite):

| Role | Scope | Can | Cannot |
|---|---|---|---|
| `DRIVER` | own user | own profile, vehicles, bookings, passes, payments, incidents | anything else |
| `OPERATOR_OWNER` | one operator | all operator data, members, rate plans (submit), bank details, payouts view | approve own lot/permit/rates |
| `OPERATOR_MANAGER` | one operator (opt. lots) | lots, occupancy, bookings, attendants, reports | bank details, members with OWNER role |
| `OPERATOR_ATTENDANT` | assigned lots | today's manifest, check-in/out, report incident | finance, reports, other lots |
| `ADMIN_SUPPORT` | platform | view bookings (masked PII), cancel within policy, open incidents | refunds, lot approval, settlements |
| `ADMIN_OPS` | platform | verification, lot status, permits review | refunds, settlements |
| `ADMIN_FINANCE` | platform | refunds, settlements, reconciliation | lot approval |
| `ADMIN_COMPLIANCE` | platform | permits, DSAR, legal hold, audit log read | refunds |
| `SUPER_ADMIN` | platform | role management, settings | bypass four-eyes |

### 5.2 Enforcement rules (MUST)

1. Deny by default. Every route registers `requirePermission('booking:read:own')`-style middleware; a CI test fails if any route lacks it.
2. Scope filters are applied in the **repository layer** (Drizzle `where(eq(lots.operatorId, ctx.operatorId))`), not only in route handlers.
3. Lookup by ID returns `404` (not `403`) for out-of-scope resources to avoid enumeration.
4. Four-eyes actions store `requestedBy` and `approvedBy`; DB check `requested_by <> approved_by`.
5. Permissions are in `packages/domain/authz` as a pure function `can(actor, action, resource)` so it is unit-testable.
6. **RLS is defence in depth, not the authorisation layer.** RLS is enabled on every table with no `anon`/`authenticated` policies; the API's DB role is the only role that reads/writes app data. Never add a client-facing RLS policy as a shortcut to skip the API.
7. Admin routes require `aal2` and an IP-allowlisted origin; finance/role/settlement routes additionally re-read the actor's roles from the DB.

### 5.3 Policy test matrix

`apps/api/test/authz/` contains a table-driven test: **every role × every endpoint × (own / other-tenant / unauthenticated)** with the expected status. Adding an endpoint without adding rows fails CI.

### 5.4 RLS and platform exposure tests (MUST, run in CI against `supabase start`)

1. For every table in every exposed schema: `rowsecurity = true` (query `pg_tables`); test fails listing offending tables.
2. With the publishable key and **no** JWT, and again with a valid **driver** JWT: PostgREST `select`/`insert`/`update`/`delete` on every table returns no rows / is denied.
3. Storage: every bucket is private; anon and authenticated JWTs cannot list, read or upload without an API-issued signed URL.
4. `SECURITY DEFINER` functions: `EXECUTE` is not granted to `PUBLIC`, `anon` or `authenticated`; `search_path` is set (checked via `pg_proc.proconfig`).
5. `supabase db lint` and Security Advisor report no errors.

---

## 6. OWASP mappings

### 6.1 ASVS 4.0 L2 — key chapters

| ASVS chapter | Parkly control |
|---|---|
| V1 Architecture | Threat model (§3), trust boundaries, ADRs in `docs/decisions/` |
| V2 Authentication | §4.0–4.3; Supabase Auth; leaked-password protection; mandatory TOTP (`aal2`) for admin and owners |
| V3 Session management | §4.4; refresh rotation, reuse detection, timebox/inactivity timeouts, device binding |
| V4 Access control | §5; deny-by-default; policy test matrix; RLS deny-all (§5.4) |
| V5 Validation, sanitisation, encoding | Zod `.strict()` at the edge; React auto-escaping; no `dangerouslySetInnerHTML`; parameterised SQL |
| V6 Stored cryptography | App-level AES-256-GCM envelope encryption for C4 (§7); Supabase-managed encryption at rest |
| V7 Error handling & logging | RFC 9457 errors; pino with redaction; audit log (§12) |
| V8 Data protection | Classification (doc 06), minimisation, cache-control `no-store` on PII responses |
| V9 Communications | TLS 1.2+ (1.3 preferred) at Vercel edge; HSTS preload; API → Postgres over TLS (`sslmode=verify-full` with Supabase CA); all provider calls HTTPS |
| V10 Malicious code | Supply chain (§13), no dynamic `eval`, lockfile integrity |
| V11 Business logic | Server-side pricing, booking holds, idempotency, anti-automation limits |
| V12 Files | Uploads direct to **private Supabase Storage buckets via API-issued signed upload URLs** (single-use, ≤ 10 min, path fixed by API); bucket `allowed_mime_types` + `file_size_limit` (10 MB); after upload the API checks magic bytes, re-encodes images (sharp, EXIF stripped) and only then marks the file usable; PDFs (permits/KYB) are virus-scanned via a hosted scanning API chosen by ADR in Sprint 2 and viewed by admins only in a sandboxed viewer |
| V13 API | OpenAPI contract, strict schemas, rate limits, CORS allowlist |
| V14 Configuration | Managed runtimes (Vercel Functions, Supabase); config as code (`supabase/config.toml`, `vercel.json`); security headers (§11); no default creds; Supabase Security Advisor clean |

### 6.2 OWASP API Security Top 10 (2023)

| Risk | Control |
|---|---|
| API1 BOLA | Repository-level scoping; 404 on out-of-scope; policy tests |
| API2 Broken authentication | §4 |
| API3 Broken object property level auth | Response DTOs are explicit allowlists (Zod output schemas); never return raw Drizzle rows |
| API4 Unrestricted resource consumption | §8 rate limits; pagination caps; upload limits; OTP/SMS cost caps with daily budget alarms |
| API5 Broken function level auth | `requirePermission()` on every route; admin API requires `aal2` + IP allowlist (Vercel Firewall) |
| API6 Unrestricted access to sensitive business flows | Booking hold caps; promo/referral abuse controls; device fingerprint |
| API7 SSRF | No user-supplied URLs fetched; outbound HTTP only through provider adapters with hard-coded base URLs (Vercel has no network egress controls, so the code allowlist is the control); `pg_net` only called from migrations-defined cron jobs with fixed URLs |
| API8 Security misconfiguration | Config as code reviewed; `supabase db lint` + Security Advisor in CI; RLS tests (§5.4); CORS allowlist; prod debug off |
| API9 Improper inventory management | Only `/v1`; OpenAPI committed; old versions sunset with dates; no undocumented routes (test) |
| API10 Unsafe consumption of APIs | Provider responses validated with Zod; timeouts (5 s), retries with backoff, circuit breakers |

### 6.3 OWASP Mobile Top 10 (2024)

| Risk | Control |
|---|---|
| M1 Improper credential usage | No secrets in the app bundle (only public values: Supabase URL + publishable key — safe only because RLS is deny-all, Paystack public key, Maps key restricted by package name + SHA-1) |
| M2 Inadequate supply chain security | Expo SDK pinned; EAS build in CI; dependency review |
| M3 Insecure authentication/authorisation | Server-side auth only; device binding; biometric is local convenience, not auth |
| M4 Insufficient input/output validation | Shared Zod contracts; deep-link params validated |
| M5 Insecure communication | HTTPS only; Android `cleartextTrafficPermitted=false`; see pinning note (§11.1) |
| M6 Inadequate privacy controls | Location permission "while in use" only; no background location; analytics consent |
| M7 Insufficient binary protections | Hermes bytecode + R8/ProGuard; Play Integrity soft check |
| M8 Security misconfiguration | `android:allowBackup=false`; no exported components except deep-link activity; `FLAG_SECURE` on screens showing QR? — **No** (driver must show QR; allow screenshots but QR rotates, §10) |
| M9 Insecure data storage | Tokens in secure store; booking cache (non-sensitive) in MMKV encrypted; clear on logout |
| M10 Insufficient cryptography | Platform crypto only; no custom algorithms |

---

## 7. Cryptography, secrets and keys

| Item | Decision |
|---|---|
| In transit | TLS 1.2+ everywhere (1.3 preferred) at the Vercel edge; Supabase "Enforce SSL" on; API → Postgres with `sslmode=verify-full`; Upstash over TLS; HSTS `max-age=63072000; includeSubDomains; preload` |
| At rest | Supabase Postgres, Storage and backups encrypted at rest by the provider (AES-256); Upstash and Better Stack encrypted at rest by the provider. Because we don't control those keys, **all C4 fields get app-level encryption** (next row) |
| Field-level encryption (C4) | **App-level envelope encryption** in `packages/domain/crypto` (`FieldCrypto`): per-record random 256-bit data key, AES-256-GCM; data key wrapped with the master key `ENC_KEY_V<n>` (Vercel Sensitive env); ciphertext format `v<n>:<wrappedKey>:<iv>:<ct>:<tag>`. Applies to: operator KYB document metadata containing ID numbers, masked bank account + account name, attendant device public-key metadata, Ed25519 lot private keys, claims bank details (Grow). Searchable fields use a separate **HMAC blind index** (e.g. `phone_hash`, `plate_hash`) with key `HMAC_KEY_V<n>`. TOTP secrets are held by Supabase Auth |
| Hashing | Passwords and OTPs: Supabase Auth. Idempotency keys, API keys (Grow), job nonces: SHA-256 of 256-bit random / HMAC-SHA256 |
| Signing | JWT: Supabase Auth asymmetric **ES256** signing keys, rotated every 90 days (standby key first). QR tokens: Ed25519 per-lot keypair (private key envelope-encrypted as above; public key distributed to attendant devices). Job calls: HMAC-SHA256 (secret in Supabase Vault + Vercel env) |
| Secrets management | **Vercel environment variables marked Sensitive**, per environment, on the project that needs them only (e.g. `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, `ENC_KEY_*` on `parkly-api` only). Supabase **Vault** for secrets used inside SQL (job HMAC secret, API base URL). GitHub Actions secrets (environment-scoped, required reviewers for prod) for migration tokens. **Never** in repo, `.env` committed, `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` vars, or Expo `app.config` (except public values). Local dev uses `.env.local` (gitignored) with test keys and the local `supabase start` keys |
| Rotation | Provider secret keys and Supabase secret key: on staff change and yearly; DB password yearly and on staff change; `ENC_KEY`/`HMAC_KEY`: new version yearly, background re-wrap job, old version kept read-only until re-wrap completes |
| Randomness | `crypto.randomBytes` / `crypto.randomInt` / `crypto.getRandomValues` only |

---

## 8. Rate limiting (MUST)

Three layers: (1) **Vercel Firewall** rate-limit rules at the edge (2,000 req / 5 min / IP default; tighter on `/v1/auth/*`, `/v1/webhooks/*`, `/internal/*`); (2) **Supabase Auth rate limits** for auth endpoints (configured in `config.toml`); (3) **Upstash Redis** token buckets (`@upstash/ratelimit`) in a Hono `rateLimit(...)` middleware and inside the Send SMS Hook. Keys combine IP, device ID, user ID or phone as listed. Exceeded → `429` with `Retry-After`. If Upstash is unreachable: fail **closed** for OTP sends and auth, fail **open** (with edge limits still active) for read endpoints.

| Endpoint | Limit | Key | Layer |
|---|---|---|---|
| OTP send (Supabase Auth → Send SMS Hook) | 5/h, 10/day; 60 s cooldown escalating | phone | Hook (Upstash) + Supabase |
| OTP send | 20/h | IP; 10/day per device | Supabase Auth + Firewall |
| OTP verify | 5 failed / 15 min; 20/h | phone; IP | Supabase Auth + Upstash |
| Email sign-in (operator/admin) | 10/15 min | email + IP | Supabase Auth + Upstash |
| Token refresh | 60/h | session | Supabase Auth |
| Password reset | 3/h | email; 20/h IP | Supabase Auth |
| `GET /v1/lots/search` | 60/min | user or IP | Upstash |
| `GET /v1/lots/:id` | 120/min | user or IP | Upstash |
| `POST /v1/bookings` | 10/h; max 2 concurrent `PENDING_PAYMENT` (DB check) | user | Upstash + DB |
| `POST /v1/bookings/:id/extensions` | 10/h | user | Upstash |
| `POST /v1/payments/*/verify` | 30/h | user | Upstash |
| `POST /v1/attend/checkins`, `/checkouts` | 600/h | device | Upstash |
| `POST /v1/attend/sync` | 120/h, batch ≤ 500 events | device | Upstash |
| `POST /v1/uploads/presign` (signed upload URL) | 30/h | user | Upstash |
| `POST /v1/incidents` | 10/day | user | Upstash |
| `POST /v1/webhooks/*` | 1,000/min | provider + IP | Firewall |
| `POST /internal/jobs/*` | 120/min | — (HMAC required) | Firewall |
| Admin API (any) | 300/min | admin user | Upstash |

Cost guardrails: the Send SMS Hook keeps a daily SMS counter in Upstash; Better Stack alert at 2× trailing 7-day average; automatic OTP sending pause for a phone prefix pattern under attack (toll fraud / SMS pumping); Termii account has a hard daily spend cap.

---

## 9. Payment security and fraud controls

### 9.1 Payment security (MUST)

1. **PCI DSS scope SAQ-A:** card entry only in Paystack/Flutterwave hosted checkout or their official SDK. Parkly never receives PAN, CVV or PIN. Store only provider `reference`, `authorization` last4/brand if returned (C3), channel.
2. **Server-generated references** `PKP_{uuidv7}`; amount, currency and split computed server-side and snapshotted on the `Payment` row.
3. **Webhook verification:** HMAC signature on raw body (constant-time) → store in `webhook_events` (unique `provider_event_id`) → enqueue on `pgmq` → job handler calls provider **verify transaction** API → compares `reference`, `amount_kobo`, `currency`, `status`, subaccount → then transitions `Payment` and `Booking`.
4. **Client callbacks are hints only.** The app's "payment complete" callback triggers a server-side verify; it never marks a payment successful by itself.
5. **Idempotency:** `Idempotency-Key` header (UUID) stored with request hash and response for 24 h in `idempotency_keys`; same key + different body → `409`.
6. **Replay protection:** webhook events > 24 h old ignored; event IDs unique; state transitions are guarded (`SUCCEEDED` can't go back to `PENDING`).
7. **Refunds:** only to the original payment method via provider; `sum(refunds) <= captured` enforced by DB constraint + domain check; four-eyes above ₦50,000; reason code required.
8. **Settlement integrity:** operator subaccount changes follow §3.3 controls; daily reconciliation job compares provider transactions + settlements with the ledger; any mismatch > ₦0 opens a finance alert.
9. **No stored value:** no balances, credits are **not** stored value — referral credits (Grow) are implemented as discounts applied at checkout, non-withdrawable. ⚖️ confirm referral credits don't constitute e-money.

### 9.2 Fraud scenarios and controls

| Scenario | Signals | Controls |
|---|---|---|
| **Booking abuse** — capacity hoarding, scalping, bots | Many pending holds, many devices per phone, booking + cancel loops | Hold TTL 10 min; ≤ 2 pending; cancellation limit (5 free cancellations/month); device + phone velocity limits; Play Integrity |
| **Fake operators / ghost lots** | New operator, no physical presence, bank name ≠ business name | KYB (CAC registration, director ID), LASPA permit verification, **on-site verification visit** before `LIVE`, Paystack account-name resolution must match business/owner name, first settlement held 7 days for new operators ⚖️ |
| **Collusive attendants** — taking cash, marking paid bookings as no-show, letting unbooked cars in | Low check-in rate vs occupancy surveys, high no-show rate at one lot/attendant, manual overrides | Every check-in requires QR scan **or** booking code + plate match; manual override needs reason + photo; per-attendant no-show and override dashboards; mystery-shopper audits; driver gets push on check-in/out ("Did you just check in at …?") |
| **Refund abuse** — drivers claiming no space, repeat complainers | Refund rate per driver, refunds without incident record | Refunds require linked incident or attendant-confirmed "lot full"; per-driver refund cap/month; finance review dashboard |
| **Promo / referral abuse** (Grow) | Same device, same plate, same payment card fingerprint across accounts | One referral reward per device + card fingerprint + plate; rewards issued after referee's first **completed** paid session |
| **Account takeover** | New device + phone change + new plate | §4.1 low-trust window; step-up |
| **Chargebacks** | Disputed card payments | Evidence bundle (§3.7); block card fingerprint after 2 lost disputes |

### 9.3 Fraud monitoring

Weekly fraud review (ops) using admin dashboards: no-show rate by lot and attendant, manual overrides, refunds by driver/admin, OTP send anomalies, new-operator settlement holds. Thresholds in `platform_settings`; breaches create an `Incident` with type `FRAUD_SIGNAL`.

---

## 10. Offline QR check-in token security

Goal: attendant can verify a driver's booking **with no network** for ≥ 8 h, without enabling forgery or screenshot sharing.

**Design**
1. Each lot has an **Ed25519 keypair**. Private key stays server-side (`lot_signing_keys`, envelope-encrypted with `ENC_KEY_V<n>`, §7). Public key + `kid` are delivered to attendant devices with the daily manifest.
2. On booking confirmation, the server issues the driver app a **booking credential**: signed payload `{v, kid, bookingId, lotId, plateHash8, windowStart, windowEnd, seed}` (seed = 160-bit random, encrypted at rest on device in secure store).
3. The driver app renders a QR containing the signed credential **plus a rotating TOTP-style code** derived from `seed` (HMAC-SHA1, 30 s step, 6 digits). The server includes `HMAC(seed)` check data in the attendant manifest so the attendant app can verify the rotating code offline.
   - This stops a static screenshot being reused later (code expires in ~60 s window).
4. Attendant app verifies offline: signature valid for lot `kid` → `lotId` matches → time within window (± 15 min early/grace, using device clock with server-time offset captured at last sync) → rotating code valid → booking in manifest and not already checked in locally → plate match (attendant reads plate; app compares normalised plate hash).
5. Check-in is recorded locally as an event signed with the device key, and **single-use** locally (second scan of same booking shows "already checked in at 08:14").
6. On sync, the server re-validates every event; conflicts (e.g. booking cancelled while offline, double check-in at two devices) are resolved by rules in doc 02 and flagged to ops.

**Fallbacks:** booking code (`PK-7HQ4MZ`) + plate entry when the driver's phone is dead; SMS with booking code is sent at confirmation. Fallback check-ins are flagged as `method=CODE` for fraud analytics.

**Key management:** lot keys rotate every 30 days with overlap (old `kid` valid until all bookings issued with it end). Compromise → revoke `kid`, reissue credentials via push, force manifest refresh.

---

## 11. Client hardening

### 11.1 Mobile app (Expo)

- Secure storage: `expo-secure-store` for tokens, device ID, QR seed. Nothing sensitive in AsyncStorage.
- Transport: HTTPS only, `usesCleartextTraffic=false`.
- **Certificate pinning:** **not enabled in MVP** (CDN cert rotation risk causing outages for an app whose reliability is the product). Mitigations: HSTS, Play Integrity, short-lived tokens. Revisit at Scale phase with public-key pinning to two backup keys and a remote kill switch.
- Root/jailbreak detection: **soft** — detect (via Play Integrity verdicts), log, and show a warning; never block (many low-end/custom-ROM Android devices in market).
- `android:allowBackup="false"`, no debuggable release builds, R8 enabled, source maps uploaded to Sentry only (not shipped).
- Deep links: only `parkly://` and verified App Links (`https://parkly.ng/...` — domain TBD); all params validated.
- Screens: hide sensitive content (OTP entry, payment) in the app switcher snapshot.
- Remote config kill switch: minimum supported app version; forced upgrade for security fixes.

### 11.2 Web apps (Next.js: web, portal, admin)

Security headers (set in Next.js middleware / `next.config` `headers()` for web apps and in Hono `secureHeaders()` middleware for `apps/api`; verified by test; Vercel serves HTTPS only):

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' https://js.paystack.co https://maps.googleapis.com; frame-src https://checkout.paystack.com https://checkout.flutterwave.com; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://{project-ref}.supabase.co; connect-src 'self' {api} https://{project-ref}.supabase.co https://*.sentry.io https://maps.googleapis.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests` (admin: tighter, no third-party scripts) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self)` on `/attend` only, `geolocation=(self)` on web; everything else `()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` | `no-store` on authenticated pages and PII API responses |

- CORS: explicit origin allowlist per environment; credentials only for first-party origins.
- Attendant PWA service worker: caches app shell + manifest only; never caches authenticated API responses other than the manifest (encrypted in IndexedDB with a key derived from the device key).

---

## 12. Logging, monitoring and SIEM

- **Structured logs** (pino JSON): `timestamp, level, requestId, traceId, userId, role, operatorId, route, status, latencyMs`. Redaction paths: `authorization`, `cookie`, `otp`, `password`, `token`, `refreshToken`, `*.phone` (masked), `*.email` (masked), `*.accountNumber`, `*.cardNumber`. Unit test asserts redaction.
- **Audit log** (`audit_logs` table, append-only — a trigger rejects `UPDATE`/`DELETE`, and the API role has `INSERT`/`SELECT` only on it; hash-chained `prev_hash` column for tamper evidence; daily export job writes the day's rows to the **off-platform object-lock bucket** in compliance mode, same bucket family as the nightly `pg_dump`).
  Events: logins (success/fail, from Supabase Auth audit log + hooks), MFA changes, role changes, admin reads of C3/C4, lot status changes, permit/verification decisions, rate plan approvals, refunds, settlement/subaccount changes, DSAR actions, feature flag/settings changes, data exports.
- **Sources:** API logs (pino → Vercel → **Log Drain → Better Stack**), Vercel Firewall events, Supabase Postgres/Auth/Storage logs (Supabase Logs Explorer; Auth audit log), Sentry, Supabase organisation audit log and Vercel team activity log (platform-level changes such as env var edits, member changes).
- **Security events → alerts** (Better Stack + Sentry → on-call phone/Slack in MVP): refresh-token reuse, > 10 failed logins on an account, admin login from new IP, webhook signature failures > 5/min, job-HMAC failures, OTP spike, bank account change, payment amount mismatch, reconciliation mismatch, Firewall block spike, Supabase Security Advisor new error, production env var change, new Supabase/Vercel member.
- **SIEM:** MVP = Better Stack log search + saved alerts + weekly manual review of Supabase/Vercel audit logs. Enterprise phase = ship to a managed SIEM with retention per doc 06.

---

## 13. Supply chain and CI security gates

| Gate | Tool | Policy |
|---|---|---|
| Dependency updates | Renovate (grouped weekly; security updates immediately) | Lockfile committed; `pnpm install --frozen-lockfile` in CI |
| Known vulns | `pnpm audit --prod` + GitHub Dependabot alerts | Fail on high/critical in prod deps (with time-boxed allowlist file requiring an expiry date) |
| SAST | CodeQL (JS/TS) + Semgrep (OWASP + custom rules: ban `sql.raw(` with non-constant input, `eval`, `dangerouslySetInnerHTML`, `Math.random` in auth/crypto paths, logging of `otp`/`token`, Supabase secret key referenced outside `apps/api`, `NEXT_PUBLIC_`/`EXPO_PUBLIC_` vars containing `SECRET`/`SERVICE`) | Fail on high |
| Secret scanning | gitleaks (pre-commit + CI, with custom rules for Supabase secret keys/JWTs, Paystack `sk_live_`, Termii keys) + GitHub push protection | Fail on any finding |
| Client bundle check | After `next build`/EAS export, grep bundles for the Supabase secret key, DB URL patterns and `sk_live_` | Fail on any finding |
| Database config | `supabase db lint`, Security Advisor, RLS/exposure tests (§5.4) against `supabase start`; migrations reviewed by security owner when they touch RLS, grants, `SECURITY DEFINER`, hooks or cron | Fail on error |
| DAST | OWASP ZAP baseline on staging after each deploy; full scan weekly | Fail on high |
| SBOM | CycloneDX generated per build, stored with release artifacts | Required for release |
| Deploy integrity | Production deploys only from protected `main` via Vercel Git integration (no CLI deploys to prod); migrations to prod only from the GitHub Actions `prod` environment with required reviewers; mobile via EAS with Play App Signing | Required for prod |
| Licences | license-checker; deny GPL/AGPL in shipped code without approval | Fail |
| Branch protection | `main` protected; required reviews (≥1, security-owner review for `auth/`, `payments/`, `supabase/migrations/`); required status checks; no force push | — |
| CI permissions | Supabase access token and Vercel token as **environment-scoped** GitHub secrets (prod requires approval); least-privilege tokens; pinned action SHAs | — |

---

## 14. Platform security (Supabase + Vercel)

**Supabase (per project: `parkly-dev`, `parkly-staging`, `parkly-prod`)**
- Separate projects per environment; prod in its own Supabase organisation or with access limited to named owners. Org SSO/MFA enforced for all members.
- Network restrictions: Postgres direct/pooler connections allowed only from the IP ranges needed (Vercel Functions use dynamic IPs, so rely on strong DB password + TLS + least-privilege role; enable **Network Restrictions** for direct connections used by CI/admins). SSL enforcement on.
- Roles: `parkly_api` (app role used by the API; not superuser, no BYPASSRLS — an explicit RLS policy per table instead, explicit table grants only — doc 02 §1), migrations via `supabase db push` as `postgres` from CI only, read-only `parkly_analyst` (masked views only, Grow). Nobody uses `postgres`/service role day-to-day.
- Exposed schemas limited (§3.8); `pg_graphql` disabled; Realtime disabled until a feature needs it (then with RLS policies + ADR).
- Storage: all buckets private, `allowed_mime_types` and `file_size_limit` set per bucket; no client Storage policies.
- Statement timeout 10 s for `parkly_api`; `pg_cron` jobs owned by a dedicated role.
- Supabase Security Advisor and Performance Advisor reviewed every sprint; zero open errors at release.

**Vercel**
- Team SSO + MFA; Pro plan; production env vars editable only by owners; **Deployment Protection** on preview deployments (no public previews with staging/dev data); `parkly-admin` protected by Vercel Firewall IP allowlist on the admin domain.
- Vercel Firewall: managed rulesets (OWASP core where available), bot protection, custom rules for `/v1/auth/*`, `/v1/webhooks/*` (Paystack IPs), `/internal/*`, and rate limits (§8). Attack Challenge Mode runbook for DDoS.
- Functions pinned to the DB region (`lhr1`); Node.js runtime; no secrets in build logs (`--no-verbose`, redact).
- Custom domains with HSTS; no `*.vercel.app` URLs used by clients in prod.

---

## 15. Backup and recovery security

- **Supabase Pro daily backups + Point-in-Time Recovery add-on** on `parkly-prod` (PITR retention 7 days minimum, 14 recommended) → RPO ≤ 15 min.
- **Nightly off-platform logical backup:** GitHub Actions (prod environment) runs `pg_dump` of app schemas **and** the `auth` schema (needed to restore users; it contains password/OTP hashes and MFA secrets, so the dump is C4) → encrypted with `age` (public key in repo, private key held offline by 2 named people) → uploaded to an **off-platform object-lock bucket** (separate cloud account; compliance-mode retention per doc 06). This covers Supabase-account loss or ransomware via a compromised Supabase account. ⚖️ storage location is part of the cross-border transfer analysis.
- Storage buckets: nightly sync of private buckets to the same off-platform bucket (encrypted).
- Quarterly **restore drill** into a fresh Supabase project (from PITR and from the off-platform dump); results recorded. RTO ≤ 4 h for API (doc 01).
- Backups are within DSAR/erasure scope via the "beyond use" approach: deleted records are not restored into production; if a restore happens, re-apply the erasure log (doc 06 §7) before the restored DB serves traffic.

---

## 16. Incident response

### 16.1 Severity levels

| Sev | Definition | Examples | Response | Comms |
|---|---|---|---|---|
| **SEV1** | Confirmed breach of C3/C4 data, money loss, or full outage of booking/payment/check-in | DB exfiltration, settlement redirection, payments marking success without money | Page on-call immediately; IC assigned in 15 min; war room | Founders/CEO, DPO, counsel within 1 h; regulators per §16.3 |
| **SEV2** | Suspected breach, partial outage, single-tenant compromise | Operator account takeover, OTP provider outage, attendant device stolen with active session | Response in 30 min | Internal + affected operator |
| **SEV3** | Contained security bug, no evidence of exploitation | IDOR found in review, vulnerable dependency | Fix within 7 days (high) / 30 days (medium) | Internal |
| **SEV4** | Hardening item | Missing header | Backlog | — |

### 16.2 Process

1. **Detect** (alert, report, bug bounty) → 2. **Triage** (IC assigns sev) → 3. **Contain** (revoke sessions/keys, disable feature flag, block IPs, pause settlements) → 4. **Eradicate** → 5. **Recover** → 6. **Notify** → 7. **Post-incident review** within 5 business days (blameless, actions tracked).
Runbooks in `docs/runbooks/` (created in Sprint 9): key compromise, provider secret rotation, account takeover, payment mismatch, data breach, attendant device loss, DDoS.

### 16.3 Breach notification (NDPA 2023)

- Notify the **Nigeria Data Protection Commission (NDPC) within 72 hours** of becoming aware of a personal-data breach likely to result in risk to data subjects' rights and freedoms. ⚖️
- Notify affected data subjects **without undue delay** where the breach is likely to result in **high risk**, in plain language, with steps they can take. ⚖️
- Notify payment provider(s) immediately for any payment-related compromise; operators for incidents affecting their lots or settlements.
- Keep a **breach register** (all breaches, notifiable or not) — owner: DPO.
- Template notices prepared in advance (Sprint 9).

---

## 17. Penetration testing and bug bounty

| When | What |
|---|---|
| Sprint 9 (pre-pilot) | External grey-box pen test: API, driver app (Android), attendant PWA offline flow, portal, admin, payment/webhook flows. All high/critical fixed and retested before launch. |
| Pilot launch | `security.txt` + responsible disclosure policy (`security@` mailbox, 90-day disclosure, safe harbour). |
| Grow phase | Private bug bounty (invite-only) once pen-test findings are closed; annual pen test thereafter and after major changes (claims, employer billing, partner API). |
| Enterprise | Pen test report summary + SOC 2-style controls evidence for customers (doc 18). |

---

## 18. Compliance

### 18.1 NDPA 2023 + GAID 2025 (Nigeria Data Protection Act and General Application and Implementation Directive)

| Requirement | Implementation | Owner |
|---|---|---|
| **Lawful basis per purpose** | See table below; recorded in the Record of Processing Activities (RoPA) in doc 06 | DPO |
| **Consent** (where used) | Granular, unbundled, opt-in toggles: marketing SMS/WhatsApp/email, analytics, precise location; stored in `consents` table with version, timestamp, channel; withdraw as easily as given | Product |
| **Privacy notice** | Plain-English, shown at sign-up, linked in app/web/receipts; versioned; re-acceptance on material change | Legal |
| **Data Protection Officer** | Appoint a DPO (can be outsourced to a licensed DPCO) before pilot launch; contact in privacy policy | CEO ⚖️ |
| **DPIA** | Complete a DPIA before pilot (location + plate + behavioural booking data, operator access, offline manifests); review on major change | DPO |
| **Data subject rights** | Access, rectification, erasure, restriction, objection, portability, withdraw consent — self-serve in app (export/delete account) + `privacy@` channel; SLA below | Support + DPO |
| **Data Controller/Processor of Major Importance (DCMI/DPMI)** | Assess threshold; **build to DCMI standard regardless**: register with NDPC if required, annual **compliance audit** filing via a licensed DPCO, pay fees ⚖️ | DPO |
| **Processor contracts** | DPAs with every sub-processor in §18.1.1 before production data flows to it | Legal |
| **Cross-border transfer** | Primary data in Supabase **London (`eu-west-2`)**, API compute in Vercel `lhr1` (London) with Vercel edge network globally, off-platform backups, and US-based processors (e.g. Sentry, Upstash/Resend/Better Stack depending on chosen region) → document transfer basis (adequacy / appropriate safeguards / standard contractual clauses) per NDPA Part VIII and GAID for **each** processor; record in RoPA (doc 06) ⚖️ | DPO + Counsel |
| **Security of processing** | This document | Eng |
| **Breach notification** | §16.3 | DPO |
| **Children** | Service is for drivers (adults); block sign-up if declared under 18; no knowing processing of children's data | Product |
| **Data minimisation & retention** | Doc 06 | Eng |
| **Staff training** | Annual privacy + security training; confidentiality agreements | Ops |

#### 18.1.1 Sub-processor register

Kept current in this table and published in the Privacy Policy. Status columns must be confirmed (and evidence saved) before pilot launch — "to confirm" means not yet verified by us.

| Sub-processor | Purpose | Data (class) | Location (choose EU/closest region where offered) | DPA | SOC 2 Type II / ISO 27001 |
|---|---|---|---|---|---|
| **Supabase** | Database, Auth, Storage, cron/queues | All app data incl. C4 | London (`eu-west-2`) | Sign Supabase DPA — to confirm | SOC 2 Type II (report under NDA) — to confirm current |
| **Vercel** | Hosting of web apps + API functions, Firewall, logs | Request data, logs (C3 in transit) | Functions `lhr1`; edge global | Vercel DPA — to confirm | SOC 2 Type II, ISO 27001 — to confirm current |
| **Upstash** | Rate-limit counters (keys contain hashed phone/IP) | C2/C3 (hashed identifiers only) | EU region (e.g. Ireland or Frankfurt) | Upstash DPA — to confirm | SOC 2 — to confirm |
| **Resend** | Transactional email (receipts, statements, auth email) | Email, name, receipt content (C3) | Choose EU sending region if available | Resend DPA — to confirm | SOC 2 Type II — to confirm |
| **Better Stack** | Log aggregation, uptime, status page | Redacted logs (C2/C3) | EU region | DPA — to confirm | SOC 2 Type II — to confirm |
| **Sentry** | Error monitoring | Redacted errors, device info (C2/C3) | EU data region (`de.sentry.io`) | Sentry DPA — to confirm | SOC 2 Type II, ISO 27001 — to confirm |
| **Paystack** | Payments, split settlement, refunds | Payment refs, amount, email/phone, card data (held by Paystack) (C3/C4) | Nigeria | Merchant agreement + DPA — to confirm | PCI DSS Level 1 — to confirm |
| **Flutterwave** (secondary) | Payments failover | As Paystack | Nigeria | Merchant agreement + DPA — to confirm | PCI DSS Level 1 — to confirm |
| **Termii** | SMS OTP and notifications | Phone, message content (C3) | Nigeria | DPA — to confirm | — to confirm |
| **Google (Maps Platform, Workspace)** | Maps/geocoding; admin SSO | Search queries, coarse location (C2/C3); admin identities | Global | Google Maps/Cloud DPA — to confirm | SOC 2, ISO 27001 — to confirm |
| **Expo (EAS, push)** | Build, push notification relay | Push tokens, notification content (C2/C3) | US | Expo DPA — to confirm | SOC 2 — to confirm |
| Off-platform backup bucket provider (chosen in Sprint 0 ADR) | Encrypted backups, audit export | Encrypted C4 | EU region | DPA — to confirm | — to confirm |

Adding a sub-processor requires: ADR, DPA signed, entry here and in doc 06, transfer basis recorded, Privacy Policy update.

**Lawful basis by purpose**

| Purpose | Lawful basis |
|---|---|
| Account creation, OTP, booking, check-in, receipts | Performance of contract |
| Payments, refunds, settlement, tax/accounting records | Contract + legal obligation |
| Fraud prevention, security logging, audit logs | Legitimate interest (balancing test in DPIA) |
| Incident and claims handling | Contract + legitimate interest; legal claims |
| LASPA permit/operator KYB data | Contract + legal obligation (regulatory) |
| Product analytics (non-essential) | Consent |
| Marketing messages | Consent |
| Precise device location (for "near me") | Consent (OS permission + in-app explainer); search works without it |
| Sharing with operators (first name, masked phone, plate, booking time) | Performance of contract (disclosed in privacy notice) |
| Responding to law enforcement / LASPA lawful requests | Legal obligation (verify each request; log in audit) |

**Data subject request SLAs**

| Request | Self-serve? | SLA |
|---|---|---|
| Access / export (JSON + PDF summary) | Yes (in app) | Automated within 24 h; manual ≤ 30 days ⚖️ (confirm statutory period) |
| Rectification | Yes (profile, vehicles) | Immediate; manual ≤ 7 days |
| Erasure / account deletion | Yes | Within 30 days (doc 06 §7), retained financial records excepted |
| Objection / restriction | Via `privacy@` | ≤ 30 days |
| Withdraw consent | Yes (settings) | Immediate |

Identity verification for DSARs: OTP to registered phone (+ email confirmation if present). Every DSAR is logged in `dsar_requests` with timeline.

### 18.2 CBN / payments

- **No stored value**: Parkly does not hold customer funds or wallet balances (requires an MMO licence). Collection only through **CBN-licensed** gateways (Paystack, Flutterwave) with **split settlement** to operator subaccounts. ⚖️ confirm the marketplace/split structure does not make Parkly a payment service provider requiring a PSSP licence.
- Refunds go back to the original payment method. No cash-out, no P2P transfers, no balances.
- Referral credits/discounts are non-withdrawable and non-transferable (§9.1).
- Keep transaction records per doc 06 retention.

### 18.3 LASPA (Lagos State Parking Authority) — compliance by design

- **Permit gate (MUST, enforced in code):** a lot can only be `LIVE` with an `APPROVED` permit whose `expires_at > now()` and an `APPROVED` verification < 12 months old (doc 00 §3.6). DB-level check in the `Lot` status transition service + nightly job.
- Reminders to operator at 30 / 14 / 7 / 1 days before permit expiry (email + SMS + portal banner); auto-`SUSPENDED` at expiry; existing confirmed bookings → ops decides (honour or refund) via admin queue.
- Hotels, event centres, nightclubs: record LASTMA approval document where required (field `additionalApprovals`). ⚖️
- Pricing: check with LASPA whether operators' parking charges require approval; rate plan approval workflow keeps an audit trail. ⚖️
- Permit verification evidence retained per doc 06.

### 18.4 Consumer protection (FCCPA 2018 / FCCPC)

- Prices shown **in full before payment** (parking + service fee, itemised); no drip pricing; operator commission is never added as a surprise to the driver.
- Clear cancellation, refund, no-show and overstay terms displayed before payment and on receipt.
- Digital receipt for every payment (in app + SMS/email), including operator name and lot address.
- Complaint channel (in-app support, phone/WhatsApp line) with response targets; escalation path documented.
- No unfair contract terms; liability terms reviewed against Anya v Imo commentary (owner's-risk vs licence) ⚖️.
- Marketing claims ("verified", "safe") backed by the documented verification checklist; avoid absolute safety guarantees until the claims programme exists ⚖️.

### 18.5 Accessibility

- WCAG 2.2 AA for web apps; equivalent for mobile (TalkBack labels, 48 dp touch targets, dynamic type, colour contrast ≥ 4.5:1 — enforced by tokens, doc 07).
- Plain English, low-literacy friendly copy for attendants; icons with text labels.
- Low-bandwidth: core flows usable on 3G and on low-end Android (2 GB RAM).

### 18.6 Legal documents required before public launch

| Document | Notes | Sprint |
|---|---|---|
| **Driver Terms of Service** | Booking, cancellation, no-show, overstay, liability, licence vs bailment, acceptable use, dispute resolution, governing law (Lagos/Nigeria) ⚖️ | 9 |
| **Operator Agreement** | Commission, settlement (T+1 via provider), permit obligations, verification consent, service levels, data processing roles (who is controller for which data), termination, non-circumvention ⚖️ | 2 (draft for pilot signing) |
| **Privacy Policy** | NDPA-compliant; purposes, bases, recipients, transfers, retention, rights, DPO contact | 9 |
| **Cookie / tracking notice** | Web apps; consent banner for non-essential analytics | 9 |
| **Claims Terms** | What is covered, caps, evidence, timeline, insurer role — only when claims launch (Sprint 12) ⚖️ | 12 |
| **Attendant Code of Conduct** | Cash prohibition at Parkly bookings, device use, privacy | 5 |
| **Data Processing Agreement (operator)** | If operators are processors/joint controllers for driver data ⚖️ | 2 |
| **Responsible Disclosure Policy** | `security.txt` | 9 |
| **Acceptable Use / Community guidelines** | Ratings and incident reports (Grow) | 11 |

### 18.7 Items requiring counsel confirmation (summary)

1. Whether split-settlement marketplace model requires any CBN licence for Parkly (PSSP/aggregator).
2. Referral credits are not e-money/stored value.
3. NDPC DCMI classification, registration and audit obligations.
4. Cross-border transfer basis for Supabase London hosting, Vercel functions/edge, off-platform backups and each non-Nigerian sub-processor (§18.1.1).
5. Statutory DSAR response periods and breach notification thresholds/content under NDPA + GAID 2025.
6. Liability, licence vs bailment, owner's-risk wording (Anya v Imo), and claims/insurance distribution rules.
7. LASPA pricing approval and LASTMA approvals for hotels/event centres.
8. Financial record retention periods (doc 06).
9. Holding first settlement for new operators (contractual basis).
10. SIM-swap lookup data-sharing basis.

---

## 19. Security definition of done (every story)

- [ ] Threat model row added/updated if a new surface, integration or data element.
- [ ] AuthZ: route has `requirePermission()`; policy matrix rows added; out-of-scope returns 404.
- [ ] New tables have RLS enabled with no client policies; new SQL functions have pinned `search_path` and restricted `EXECUTE`; RLS/exposure tests (§5.4) pass.
- [ ] New secrets only in server-side Vercel env (Sensitive) / Supabase Vault; nothing secret behind `NEXT_PUBLIC_`/`EXPO_PUBLIC_`.
- [ ] Inputs validated with strict Zod schemas; outputs via explicit response schemas.
- [ ] Rate limit applied if endpoint is public, auth-related, costly or abusable.
- [ ] No secrets, OTPs, tokens or unmasked PII in logs, errors, analytics or crash reports.
- [ ] New data elements classified in doc 06 with retention.
- [ ] Privileged action writes `AuditLog`.
- [ ] Idempotency for money/booking/check-in mutations.
- [ ] CI security gates green (SAST, secrets, deps, client-bundle check, DB lint/advisors).
