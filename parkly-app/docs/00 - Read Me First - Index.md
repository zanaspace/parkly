# 00 — Read Me First: Index and Canonical Decisions

> **Audience:** the coding agent(s) and engineers building Parkly.
> **Status:** v1.0 — 14 Oct 2026. Source inputs: `../../product doc/strategy.md`, `../../product doc/marketresearch.md`.
> **Rule:** This file is the **source of truth for names, stack and cross-cutting decisions**. If any other doc contradicts this one, this one wins. Then raise the conflict in `docs/decisions/` (ADR) and fix the other doc.

---

## 1. What we are building (one paragraph)

**Parkly** is a parking booking and payment platform for Lagos, Nigeria. Drivers find, book, pay for and check in to **verified, LASPA-permitted off-street lots** (hotels, office buildings, commercial lots, later event centres). Lot operators get software: inventory and occupancy, a low-end-phone attendant check-in app that works offline, cashless collection with daily split settlement, reports and permit reminders. The core bet is **trust + operator tools**, not a listing app. North Star: **paid, completed parking sessions per week at verified lots**.

Explicitly **not** in scope (yet): on-street parking, peer-to-peer driveways, **holding customer wallet balances** (needs a CBN MMO licence), plate-recognition hardware, dynamic pricing, a second city.

---

## 2. How to read these docs (order matters)

| # | Doc | Read when |
|---|-----|-----------|
| 00 | Read Me First — Index (this file) | Always, first |
| 19 | [PRD — Product Requirements](19%20-%20PRD%20-%20Product%20Requirements.md) | Before any feature work: what and why |
| 20 | [Sprint Plan and Delivery Roadmap](20%20-%20Sprint%20Plan%20and%20Delivery%20Roadmap.md) | To know **what to build now** and the definition of done per sprint |
| 01 | [System Architecture and System Designs](01%20-%20System%20Architecture%20and%20System%20Designs.md) | Before writing any service, infra or integration code |
| 02 | [Technical Design Document and TDD Strategy](02%20-%20Technical%20Design%20Document%20and%20TDD%20Strategy.md) | Data model, API contracts, state machines, testing rules |
| 03 | [User Flow Diagrams (MVP)](03%20-%20User%20Flow%20Diagrams%20(MVP).md) | Before building any screen |
| 04 | [Design System and Brand Foundation](04%20-%20Design%20System%20and%20Brand%20Foundation.md) | Before any UI work |
| 05 | [Security and Compliance](05%20-%20Security%20and%20Compliance.md) | Before auth, payments, data, infra — and every PR review |
| 06 | [Data Storage, Classification and Retention](06%20-%20Data%20Storage%20Classification%20and%20Retention.md) | Before adding any table, column, log or file |
| 07–16 | Design System Tokens (Colors, Typography, Spacing, Shadows, Breakpoints, Corner Radius, Gradients, Patterns, Components, System) | When implementing `packages/tokens` and `packages/ui` |
| 17 | [MVP Launch Readiness Checklist](17%20-%20MVP%20Launch%20Readiness%20Checklist.md) | From Sprint 9 onward; gate for pilot launch |
| 18 | [Enterprise Product Readiness Criteria](18%20-%20Enterprise%20Product%20Readiness%20Criteria.md) | Grow/Scale phases; gate for employer and partner deals |
| 21 | [Phase 1 Sprint 0 Foundations — Build Guide](21%20-%20Phase%201%20Sprint%200%20Foundations%20-%20Build%20Guide.md) | Plain-language walkthrough of what Sprint 0 built and how to run it |
| — | [`../AGENTS.md`](../AGENTS.md) | Working rules for coding agents (also loaded via `CLAUDE.md`) |

---

## 3. Canonical decisions (do not change without an ADR)

### 3.1 Product surfaces

| Surface | App folder | Tech | Users |
|---|---|---|---|
| Driver mobile app (Android-first, iOS build later) | `apps/mobile` | React Native + Expo (managed, EAS builds), TypeScript, Expo Router | Drivers |
| Driver web (light fallback + public lot pages + marketing) | `apps/web` | Next.js (App Router), TypeScript | Drivers, public |
| Operator portal + Attendant PWA | `apps/portal` | Next.js (App Router). Attendant app is an **offline-first PWA** at route `/attend` | Operator owners, managers, attendants |
| Admin / Ops console (internal only) | `apps/admin` | Next.js (App Router), separate domain, SSO/MFA, IP allowlist | Parkly ops, support, compliance, finance |
| API | `apps/api` | Hono on **Vercel Functions** (Node.js 22 runtime), TypeScript, REST + OpenAPI 3.1 | All clients |
| Background jobs | `apps/api` routes under `/internal/jobs/:job` + SQL functions in `supabase/migrations` | Supabase `pg_cron` → `pg_net` (HMAC-signed) + `pgmq` queues | — |

### 3.2 Stack

| Concern | Decision |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript `strict: true` everywhere. No `any` without a comment. |
| Shared packages | `packages/contracts` (Zod schemas + generated OpenAPI types, single source for DTOs), `packages/db` (Drizzle schema + client + typed queries), `packages/tokens` (design tokens JSON → CSS variables + RN theme via Style Dictionary), `packages/ui` (web React components), `packages/ui-native` (RN components), `packages/config` (eslint, tsconfig, prettier), `packages/domain` (pure domain logic: pricing, state machines, plate normalisation, crypto helpers — no I/O) |
| Platform | **Supabase** (Postgres, Auth, Storage, cron/queues) + **Vercel** (web apps + API). Full spec and rationale: [ADR 0002](decisions/0002-supabase-and-vercel-for-mvp.md) |
| Database | **Supabase Postgres** + PostGIS, `pg_cron`, `pgmq`, `pg_net`, `pgcrypto`. ORM: **Drizzle** (geo queries via parameterised `sql\`\`` only). Migrations: SQL in `supabase/migrations/` (drizzle-kit generated + hand-written RLS/functions/cron), applied by Supabase CLI. Serverless connects via **Supavisor transaction mode**. |
| Row Level Security | Enabled on **every** table, **deny-all** for `anon`/`authenticated`. Clients use Supabase only for Auth; all data flows through `apps/api`. |
| Auth | **Supabase Auth**: driver phone OTP (Send SMS Hook → Termii), operator/admin email+password + TOTP MFA (`aal2` mandatory for admins, operator owners and operator managers), ES256 JWTs, 15-min access token, rotating refresh tokens. Custom Access Token Hook adds role claims. |
| Rate limits | Vercel Firewall + Upstash Redis (`@upstash/ratelimit`). No other Redis/cache in MVP. |
| Object storage | **Supabase Storage** (private buckets, signed upload/download URLs only) |
| Payments | **Paystack** (CBN-licensed) using **subaccounts + split payments** for operator settlement. **Flutterwave** as secondary behind the same `PaymentProvider` interface. **No stored wallet balances, ever.** |
| SMS / OTP | **Termii** (primary, DND-route for OTP), secondary provider behind `SmsProvider` interface |
| Push | Expo Notifications (FCM on Android, APNs on iOS) |
| Email | Resend (receipts, operator statements; also Supabase Auth SMTP) |
| Maps / geocoding | Google Maps Platform (Places Autocomplete, Geocoding, Maps SDK for Android/JS) |
| Hosting / region | Vercel projects `parkly-api`, `parkly-web`, `parkly-portal`, `parkly-admin` (admin: own domain, IP allowlist). Supabase region nearest Lagos available at creation, default **Ireland (`eu-west-1`)**; Vercel Functions pinned to the **same region as the DB** (`dub1`). Cross-border transfer basis to be confirmed by counsel under NDPA 2023 (see doc 05). |
| Secrets | Vercel environment variables (Sensitive), per environment; Supabase Vault for SQL-side secrets. Supabase secret/service key never in any client. |
| Config as code | `supabase/config.toml` + `supabase/migrations/`, `vercel.json` per app. No Terraform in MVP. |
| CI/CD | GitHub Actions (tests against `supabase start`, then `supabase db push` before Vercel promotion); Vercel Git integration; EAS Build/Submit for mobile |
| Observability | Sentry (all apps); `@vercel/otel` tracing; Vercel Log Drains → Better Stack (logs, uptime, status page); structured JSON logs (pino) |
| Backups / DR | Supabase Pro + PITR add-on (RPO ≤ 15 min) + nightly encrypted off-platform `pg_dump`; RTO 4 h |
| Feature flags | Simple DB-backed flags table + `FeatureFlagService` (no third-party vendor in MVP) |
| Testing | Vitest (unit, packages + api), Hono `app.request()` + local Supabase (`supabase start`) for API integration, Playwright (web e2e), Maestro (mobile e2e), k6 (load) |

### 3.3 Environments

`local` (`supabase start`: Postgres+PostGIS, Auth, Storage, Studio, Inbucket mail; `pnpm dev`) → `dev` (Supabase `parkly-dev` + Vercel PR previews) → `staging` (`parkly-staging`, Paystack **test** keys; every merge to `main`) → `prod` (`parkly-prod`; tagged release `vX.Y.Z` with manual approval). Migrations always run before the deploy that needs them. Prod data never copied to lower environments.

### 3.4 Money, time, IDs, phone numbers, plates

- **Money:** integers in **kobo** (`amount_kobo BIGINT`). Currency is `NGN` only, but store `currency CHAR(3)` anyway. Never use floats. Rounding: half-up to the nearest kobo, done only in `packages/domain/pricing`.
- **Time:** store `TIMESTAMPTZ` in UTC. Display in `Africa/Lagos` (UTC+1, no DST). Booking slots are aligned to **15-minute** boundaries.
- **IDs:** UUIDv7 primary keys. Public, human-facing codes: booking code = 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (e.g. `PK-7HQ4MZ`).
- **Phone:** E.164 (`+234…`), validated with libphonenumber. Phone is the driver's primary identity.
- **Plates:** stored raw + normalised (`upper`, strip spaces/hyphens, e.g. `LND-123-AB` → `LND123AB`). Normalisation lives in `packages/domain/plate`.

### 3.5 Domain glossary and core entities

| Term | Meaning |
|---|---|
| **User** | Any authenticated person. Has one or more **roles**. |
| **Driver** | User with role `DRIVER`. Has verified phone, ≥1 **Vehicle**. |
| **Operator** | A business (organisation) that runs one or more lots. Has KYC/KYB, a Paystack subaccount, members. |
| **OperatorMember** | User ↔ Operator link with role `OWNER`, `MANAGER` or `ATTENDANT`. |
| **Lot** | A physical parking facility. Has location (PostGIS point), address, opening hours, **capacity**, amenities, photos, **Permit**, **VerificationRecord**, status. |
| **Permit** | LASPA permit record for a lot: number, issue/expiry dates, document upload, review status. |
| **VerificationRecord** | Result of the on-site checklist: LASPA permit, guard presence, lighting, CCTV, access control, capacity count, owner identity; reviewer, date, photos. |
| **RatePlan** | Price rules for a lot: `HOURLY` (per 15-min block after first hour minimum), `DAILY`, `MONTHLY`. Set by operator, approved by admin. |
| **Booking** | A reservation of 1 bay-equivalent of capacity at a lot for a time window, by a driver, for a vehicle. MVP uses **capacity counts, not numbered bays.** |
| **Pass** | A monthly pass (recurring access for a vehicle at a lot for a calendar period). Paid upfront; no auto-debit in MVP. |
| **Session** | The physical stay: check-in time → check-out time. 1:1 with a Booking or Pass-day. |
| **Payment** | A charge attempt through the provider (initial, extension, overstay). |
| **Refund** | Provider refund linked to a Payment. |
| **Settlement** | Provider payout to an operator subaccount; reconciled against our ledger. |
| **LedgerEntry** | Double-entry internal ledger row (we record, we do not hold funds). |
| **Incident** | Safety/service issue reported by driver, attendant or ops. |
| **Claim** | Damage/theft claim (Grow phase). |
| **Rating** | 1–5 stars + tags after a completed session (Grow phase). |
| **AuditLog** | Append-only record of privileged actions. |

### 3.6 Canonical state machines (names are fixed)

- **Lot.status:** `DRAFT → PENDING_VERIFICATION → LIVE ⇄ PAUSED`; `LIVE → SUSPENDED` (permit expired, safety issue, admin); `→ ARCHIVED`. A lot can be `LIVE` **only** if it has an `APPROVED` permit with `expires_at > now()` and an `APPROVED` VerificationRecord less than 12 months old.
- **Booking.status:** `PENDING_PAYMENT → CONFIRMED → CHECKED_IN → COMPLETED`; also `PENDING_PAYMENT → EXPIRED` (payment window 10 min), `CONFIRMED → CANCELLED`, `CONFIRMED → NO_SHOW` (grace window passed), any paid state → `REFUNDED`/`PARTIALLY_REFUNDED` (via refund record, status kept on Payment).
- **Payment.status:** `INITIATED → PENDING → SUCCEEDED | FAILED | ABANDONED`; `SUCCEEDED → REFUNDED | PARTIALLY_REFUNDED`.
- **Permit.status / VerificationRecord.status:** `SUBMITTED → IN_REVIEW → APPROVED | REJECTED`; Permit also `EXPIRED`.
- **Incident.status:** `OPEN → TRIAGED → RESOLVED → CLOSED`.
- **Claim.status:** `SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED → PAID → CLOSED`.

### 3.7 Roles (RBAC)

`DRIVER`, `OPERATOR_OWNER`, `OPERATOR_MANAGER`, `OPERATOR_ATTENDANT`, `ADMIN_SUPPORT`, `ADMIN_OPS` (verification, lots), `ADMIN_FINANCE` (refunds, settlements), `ADMIN_COMPLIANCE` (permits, data requests), `SUPER_ADMIN`. Operator roles are always **scoped to one operator** (and optionally to specific lots for attendants). Authorisation is enforced in the API, never only in the UI.

### 3.8 API conventions

- Base path `/v1`. JSON. `camelCase` in JSON, `snake_case` in DB.
- Every mutating endpoint accepts an `Idempotency-Key` header (required for bookings, payments, check-in/out, refunds).
- Errors: RFC 9457 `application/problem+json` with a stable `code` (e.g. `BOOKING_SLOT_UNAVAILABLE`).
- Pagination: cursor-based (`?cursor=&limit=`, max 100).
- Contracts live in `packages/contracts`; OpenAPI is generated from them and committed at `apps/api/openapi.json`. Clients use generated types — never hand-written DTO copies.

### 3.9 Pricing and fees (configurable; values below are pilot defaults)

- Platform commission: **12%** of booking value, per-lot override (range 10–15%), shown to the operator, deducted via split.
- Driver service fee: **₦100** flat on bookings under 24 h; **₦0** on monthly passes. Shown before payment.
- Payment cost is absorbed by the platform from commission in MVP (configurable `fee_bearer`).
- Cancellation: free up to **30 min** before start; after that, non-refundable except ops override.
- No-show grace: **30 min** after booking start.
- Overstay: charged per started 15-min block at the lot's hourly rate, collected at exit (pay-link/SMS) or flagged to ops.

All of these live in config (`platform_settings` table), never hard-coded in clients.

### 3.10 Non-negotiables

1. No wallet balances or stored value. Funds move driver → provider → split to operator + Parkly.
2. A lot without a valid permit and verification is never shown to drivers.
3. Every privileged action writes an `AuditLog` row.
4. PII is classified (doc 06) before it's stored; logs never contain OTPs, tokens, full card data or full phone numbers.
5. Attendant check-in must work with **no network** for at least 8 hours and sync later.
6. Every external call (payment, SMS, maps) goes through an interface with a fake implementation for tests.
7. Test-first for domain logic, payments, booking availability and authorisation (doc 02).

---

## 4. Repository layout (target)

```
parkly-app/
├── AGENTS.md                 # agent working rules (CLAUDE.md points here)
├── CLAUDE.md
├── docs/                     # these documents
│   └── decisions/            # ADRs: NNNN-title.md
├── apps/
│   ├── api/                  # Hono API on Vercel Functions (+ /internal/jobs)
│   ├── mobile/               # Expo driver app
│   ├── web/                  # Next.js driver web + public pages
│   ├── portal/               # Next.js operator portal + /attend PWA
│   └── admin/                # Next.js internal console
├── packages/
│   ├── contracts/ db/ domain/ tokens/ ui/ ui-native/ config/
├── supabase/                 # config.toml, migrations/ (schema, RLS, SQL functions, cron), seed.sql
└── .github/workflows/
```

---

## 5. Open questions owned by the business (do not block build; build behind config)

| # | Question | Default used until answered |
|---|---|---|
| Q1 | Pilot node: VI/Ikoyi/Lekki vs Ikeja | Seed data and map default centre on Victoria Island |
| Q2 | Final commission / service fee | 12% / ₦100 (config) |
| Q3 | Payment structure confirmed by counsel | Paystack split payments, no stored funds |
| Q4 | Insurance partner and claim caps | Claims feature behind flag `claims_enabled=false` until Sprint 12 |
| Q5 | NDPC "major importance" classification | Build to DCMI standard anyway (DPO, audit trail, DPIA) |
| Q6 | Supabase/Vercel region outside Nigeria (default Ireland) acceptable for data transfer under NDPA | Yes, pending counsel; data is plain Postgres so the region/provider stays swappable |
| Q7 | Brand name "Parkly" final | Used everywhere; brand strings centralised in `packages/config/brand.ts` |
