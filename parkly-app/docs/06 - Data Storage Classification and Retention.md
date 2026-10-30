# 06 — Data Storage, Classification and Retention

> **Status:** v1.1 — 14 Oct 2026 (updated for Supabase + Vercel per [ADR 0002](decisions/0002-supabase-and-vercel-for-mvp.md)). Names and stack follow [00 — Read Me First](00%20-%20Read%20Me%20First%20-%20Index.md). Security controls referenced here are in [05 — Security and Compliance](05%20-%20Security%20and%20Compliance.md).
> **Legend:** ⚖️ **COUNSEL** = retention period or basis to confirm with a Nigerian lawyer / DPO before launch. Until confirmed, implement the value shown (it's configurable in `retention_policies`).
> **Rule for agents (MUST):** before adding any table, column, log field, analytics event or file type, add/update its row in §3 of this document in the same PR. Unclassified data must not be stored.

---

## 1. Classification scheme

| Class | Label | Definition | Examples |
|---|---|---|---|
| **C1** | Public | Intended for anyone; disclosure causes no harm | Lot name, address, public photos, prices, opening hours, amenities, "Verified" badge, marketing pages |
| **C2** | Internal | Business data not meant for the public; low harm if disclosed | Aggregated occupancy stats, feature flags, non-PII metrics, internal docs, rate plan drafts |
| **C3** | Confidential | Personal data or commercially sensitive data; moderate–high harm | Driver phone, name, email, plates, booking/session history, location searches, payment references, operator contacts, permits, verification photos, incident reports, audit logs |
| **C4** | Restricted | Data whose exposure enables account takeover, fraud or serious harm | Password/OTP/refresh-token hashes, TOTP secrets, signing keys, KYB identity documents (ID numbers, director IDs), bank account details (masked) + account names, Paystack subaccount codes, claims evidence with injury/medical info, DSAR identity proofs |

### 1.1 Handling rules

| Rule | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| Storage location | Any approved store, CDN ok | Approved stores (§2) | Approved stores (§2) in the `parkly-prod` Supabase project only | `parkly-prod` only; **field-level encrypted** (app-level AES-256-GCM envelope, doc 05 §7) or held only by the provider (Supabase Auth, Paystack) |
| Encryption at rest | Optional | Yes (provider-managed) | Yes (provider-managed AES-256) | Provider-managed + app-level field encryption AES-256-GCM |
| Encryption in transit | TLS | TLS | TLS 1.2+ | TLS 1.2+ |
| Access | Anyone | Staff | Role-based, need-to-know, scoped (doc 05 §5) | Named roles only; reveal action audited; four-eyes for bulk |
| Logging of values | Yes | Yes | **Masked** only | **Never** |
| In analytics | Yes | Yes | Only pseudonymised (user ID hash, coarse geohash) | Never |
| In lower environments (dev/staging) | Yes | Yes | **Synthetic only** | **Synthetic only** |
| Export / download | Free | Staff | Audited; masked by default | `SUPER_ADMIN` + audit + reason |
| Sharing with third parties | Free | NDA | DPA + purpose limitation | DPA + explicit approval by DPO |
| Disposal | Normal delete | Normal delete | Hard delete / anonymise per §6; crypto-shred where used | Crypto-shred (delete data key) + hard delete |
| Printing / screenshots | OK | OK | Avoid; ops consoles mask by default | Not allowed |

### 1.2 Tagging in code

- Drizzle schema (`packages/db`): every column carrying C3/C4 is declared through the helpers `c3(column)` / `c4(column)` (which register the class in an exported `dataClasses` map) and also carries a SQL `COMMENT ON COLUMN … IS 'class:C3'` in its migration. A CI script (`scripts/check-data-classes.ts`) fails if a column in a table listed in §3 lacks a class, and compares against this doc's inventory table.
- Pino redaction paths and the analytics event schema are generated from these tags.
- Supabase Storage: no object tags, so class and retention are encoded by **bucket and path prefix** (`kyb-docs/` = C4, `incident-evidence/c4/` = C4, `verification/` = C3, …) and by a `files` table row per object (`bucket`, `path`, `data_class`, `retention_policy`, `owner_entity`, `created_at`). Retention jobs delete via the Storage API using the `files` table; there are no lifecycle rules to rely on.

---

## 2. Storage locations

| Store | Purpose | Region | Encryption | Notes |
|---|---|---|---|---|
| **Supabase Postgres** (`parkly-prod`) + PostGIS — app schemas | System of record | Ireland `eu-west-1` ⚖️ | Provider-managed AES-256 at rest; TLS; field-level for C4 (`ENC_KEY_V<n>`) | RLS deny-all for client roles; PITR (§7) |
| **Supabase Auth** (`auth` schema, same project) | Users' phone/email, password hashes, OTP tokens, TOTP factors, sessions, refresh tokens, auth audit log | Ireland | Provider-managed; secrets hashed by Supabase | Managed by Supabase Auth; we never read hashes; app `users` table references `auth.users.id` |
| **Supabase Storage** private buckets: `kyb-docs` (C4), `permits` (C3), `verification` (C3), `incident-evidence` (C3/C4 prefix), `lot-photos` (pre-approval, C3), `exports` (DSAR/statement downloads, C3) | Files | Ireland | Provider-managed at rest; signed URLs only (≤ 5 min for C4, ≤ 24 h one-time for DSAR exports) | Every object has a `files` row (class, retention) |
| Supabase Storage `lot-photos-public` | Approved lot photos (C1) | Ireland + Supabase CDN | Provider-managed | EXIF stripped, re-encoded; public read |
| `pgmq` queues, `pg_cron` job history (`cron.job_run_details`) | Job payloads (IDs only, no PII), run history | Ireland | As Postgres | Job payloads carry IDs, never PII; `cron.job_run_details` pruned to 14 days |
| **Upstash Redis** | Rate-limit counters, SMS budget counters, job nonces | EU region | Provider-managed; TLS | Keys contain **hashed** phone/IP only; all keys TTL'd; no durable PII |
| **Vercel** (function logs, Firewall logs) | App/request logs | Vercel (`dub1` + edge) | Provider-managed | Masked PII only; Vercel log retention is short (plan-dependent) — drained to Better Stack |
| **Better Stack** | Log storage/search, uptime, status page | EU region | Provider-managed | Masked PII only |
| Off-platform object-lock bucket (provider chosen by Sprint 0 ADR) | Nightly encrypted `pg_dump` (incl. `auth`), Storage sync, daily audit-log export | EU region ⚖️ | `age`-encrypted before upload + provider at rest; compliance-mode object lock | Immutable for retention period |
| Paystack / Flutterwave | Card data, bank account numbers, settlement | Provider | Provider (PCI DSS L1) | We store references + masked data only |
| Termii | SMS delivery logs (phone, message) | Provider | Provider | Message contains no PII other than code/booking code |
| Sentry | Error events | Provider EU data region ⚖️ | Provider | PII scrubbing on; `sendDefaultPii=false` |
| Resend | Email delivery logs (recipient, subject, status) | Provider (EU region if available) ⚖️ | Provider | Receipts contain booking details (C3) |
| Product analytics (PostHog Cloud EU or self-hosted — decide in Sprint 7) | Usage analytics | ⚖️ | Provider | Pseudonymised, consent-gated |
| Driver device | Supabase session (access + refresh token) via `expo-secure-store` adapter, device ID, QR seed (secure store); booking cache (encrypted MMKV) | Device | OS keystore | Cleared on logout |
| Attendant device (IndexedDB) | Daily manifest, queued events | Device | Encrypted with non-extractable WebCrypto key | Cleared on logout and after 24 h |

---

## 3. Data inventory (Record of Processing)

Columns: **Class · Purpose · Lawful basis · Where stored · Encryption · Access · Retention · Deletion method**.
Retention clock starts at the "trigger" stated. "Account closure" = driver/operator deletes account or is closed by Parkly.

### 3.1 Driver identity and account

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Phone number (E.164) | C3 | Login (OTP), booking notifications, support | Contract | `auth.users.phone` (Supabase Auth, login identity) + app `users.phone_enc` copy [enc], set at sign-in (ADR 0020) + `phone_hash` (blind index) | At rest (Supabase) | Driver; support (masked, reveal audited); operators see masked | Account life + 30 days | Anonymise (replace with `deleted:{uuid}`), hash removed |
| Name (first, last) | C3 | Receipts, attendant greeting (first name only) | Contract | `users` | At rest | Driver; support; operator sees first name | Account life + 30 days | Anonymise |
| Email (optional) | C3 | Receipts, account recovery | Contract / consent for marketing | `users.email_enc` [enc], set at sign-in (ADR 0020) | At rest | Driver; support (masked) | Account life + 30 days | Anonymise |
| Date of birth / age confirmation (boolean 18+) | C3 | Adults-only service | Contract | `users.is_adult_confirmed` (no DOB stored) | At rest | System | Account life | Delete with account |
| OTP (hashed) | C4 | Authentication | Contract | Supabase Auth (`auth` schema, one-time tokens) | Hashed by Supabase | Supabase Auth only | 5 min expiry | Supabase invalidates on use/expiry |
| OTP in transit through Send SMS Hook | C4 | Delivery to Termii | Contract | **Not stored** — request memory only; excluded from logs/Sentry | TLS | Hook code | Request lifetime | n/a |
| Refresh tokens / sessions | C4 | Session management | Contract / legitimate interest (security) | Supabase Auth (`auth.sessions`, `auth.refresh_tokens`) | Managed by Supabase | System; user sees device list (via app `devices` table) | Until expiry/revocation; revoked rows purged by Supabase | Supabase-managed; `signOut` on account deletion |
| Supabase Auth audit log (login/logout/token events, IP) | C3 | Security, investigations | Legitimate interest | Supabase Auth audit log | At rest (Supabase) | Security | 12 months ⚖️ (prune job) | `auth-audit-prune` job |
| Device ID, platform, app version, model, linked `session_id` | C3 | Device binding, fraud, support | Legitimate interest | `devices` | At rest | System; support | Account life + 90 days | Hard delete |
| Push token (Expo/FCM/APNs) | C3 | Notifications | Contract | `devices.push_token` | At rest | System | Until invalid/logout/account closure | Hard delete |
| Play Integrity verdicts | C3 | Fraud/security | Legitimate interest | `security_events` | At rest | Security | 12 months | Hard delete |
| Consents (type, version, timestamp, channel) | C3 | Demonstrate consent | Legal obligation | `consents` | At rest | DPO, system | Account life + 6 years ⚖️ (proof) | Hard delete after period |
| Preferences (language, notification settings) | C2 | UX | Contract | `user_settings` | At rest | Driver | Account life | Delete with account |
| Driver's License number (FRSC) / NIN verification ref | C4 | Identity proofing for monthly passes & gated lots (Tier 2 KYC, FR-AUTH-009) | Consent / Legal obligation | `driver_verifications.id_number_encrypted`, `provider_ref` | App-level AES-256-GCM envelope | Security, Ops (reveal audited) | Account life + 30 days | Hard delete / crypto-shred |
| Verified Driver status (`is_verified_driver`, badge timestamp) | C1 | Verification badge on ticket, pass & manifest | Legitimate interest / Contract | `users.is_verified_driver`, `driver_verifications.status` | At rest (Supabase) | Driver, attendants, operators, public | Account life | Anonymise |

### 3.2 Vehicles

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Plate number (raw + normalised) | C3 | Check-in matching, disputes | Contract | `vehicles.plate_raw`, `plate_norm`, `plate_hash` | At rest | Driver; attendants (masked + hash match); operators (for their bookings); support | Account life + 30 days; plates on **financial/booking records** follow §3.4 | Anonymise vehicle; booking snapshot keeps `plate_hash` only after 24 months |
| Make, model, colour | C3 | Attendant recognition | Contract | `vehicles` | At rest | Driver; attendants; operators | As plate | Anonymise |
| Vehicle photo | — | **Not collected in MVP** | — | — | — | — | — | — |

### 3.3 Location and search

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Precise device location (lat/lng at search time) | C3 | "Lots near me" | Consent (OS permission) | **Not persisted**; used in request only | TLS | System | Request lifetime | n/a |
| Search queries (destination text, geohash-6, filters, time) | C3 | Improve supply targeting, demand heatmaps | Legitimate interest (DPIA) | `search_events` | At rest | Product/analytics (pseudonymised) | **30 days** raw, then aggregated to geohash-5 + hour counts (C2), no user link | Nightly job aggregates and hard deletes raw |
| Saved places (home/work labels) | C3 | Convenience | Contract | `saved_places` | At rest | Driver | Until user deletes / account closure | Hard delete |
| Lot coordinates (PostGIS) | C1 | Discovery | Legitimate interest | `lots.location` | At rest | Public | Lot life + per §3.6 | — |

### 3.4 Bookings, sessions, payments, ledger

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Booking (lot, window, status, price snapshot, booking code, vehicle snapshot) | C3 | Service delivery, disputes, accounting | Contract + legal obligation | `bookings` | At rest | Driver; operator (scoped); support; finance | **6 years** from booking end ⚖️ (tax/CAMA) — PII fields pseudonymised after **24 months** | After 24 m: unlink `user_id` → `pseudonymous_id`, plate → hash; after 6 y: hard delete |
| Pass (monthly) | C3 | Recurring access | Contract | `passes` | At rest | As booking | As booking | As booking |
| Session events (check-in/out time, method QR/CODE/MANUAL, attendant ID, device ID, override reason) | C3 | Proof of service, fraud, disputes | Contract + legitimate interest | `session_events` | At rest | Operator (scoped), ops, finance | 6 years ⚖️ (financially linked); pseudonymise at 24 m | As booking |
| Override photos (attendant manual check-in) | C3 | Fraud control, disputes | Legitimate interest | Storage (`files` row) | At rest (Storage) | Ops, operator manager | **90 days** unless linked to incident/claim (then as incident) | `retention:files` job |
| Payment record (provider, reference, amount, status, channel, card brand + last4 if returned, split snapshot) | C3 | Payment processing, reconciliation, refunds | Contract + legal obligation | `payments` | At rest | Driver (own); finance; support (masked) | **6 years** ⚖️ | Hard delete after period; PII pseudonymised at 24 m |
| Card PAN / CVV / PIN | — | **Never stored or transmitted by Parkly** (SAQ-A) | — | Provider only | — | — | — | — |
| Card fingerprint / authorization signature (provider token) | C4 | Fraud (duplicate detection) | Legitimate interest | `payments.card_fingerprint` | Field-level | System, finance | 24 months | Hard delete |
| Refunds (amount, reason, requested/approved by) | C3 | Accounting, audit | Legal obligation | `refunds` | At rest | Finance | 6 years ⚖️ | Hard delete |
| Ledger entries | C3 | Financial record | Legal obligation | `ledger_entries` (append-only) | At rest | Finance | 6 years ⚖️ (or longer if required) | Hard delete after period |
| Settlements / reconciliation reports | C3 | Operator payouts, audit | Legal obligation + contract | `settlements`, Storage `exports` statements | At rest (DB + Storage) | Finance; operator owner (own) | 6 years ⚖️ | Hard delete |
| Receipts (PDF/email) | C3 | Consumer protection | Legal obligation + contract | `receipts.content` (frozen snapshot: issuer, lot, permit no., plate, driver first/last name and phone last 4, charges, refunds); the PDF is drawn from it on demand and attached to the confirmation email (ADR 0021); Resend message logs | — | Driver; support | **6 years** ⚖️, like the payment record; Resend logs 30 days | Hard delete after period; the driver name in `content` is pseudonymised at 24 m with payments (job not built yet) |
| Idempotency keys + response | C3 | Duplicate protection | Legitimate interest | `idempotency_keys` | At rest | System | 24 h | TTL job |
| Webhook events (raw payload) | C3 | Payment verification, disputes | Legitimate interest + legal obligation | `webhook_events` | At rest | Finance, system | 90 days raw; parsed fields live in `payments` | Hard delete |

### 3.5 Operators (businesses and members)

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Business name, CAC RC number, address | C2/C3 | KYB, contracts, invoices | Contract + legal obligation | `operators` | At rest | Ops, finance, owner | Relationship + 6 years ⚖️ | Hard delete after period |
| Member name, email, phone, role | C3 | Access, notifications | Contract | `users`, `operator_members` | At rest | Operator owner/manager; ops | Membership + 30 days (user record per §3.1) | Remove membership; anonymise user if no other role |
| KYB documents (CAC certificate, director ID, utility bill) | C4 | Prevent fake operators | Legal obligation + legitimate interest | Storage `kyb-docs` + metadata in `kyb_documents` (ID numbers field-level encrypted) | At rest + field-level | `ADMIN_OPS`, `ADMIN_COMPLIANCE` only | Relationship + 6 years ⚖️ | Crypto-shred key + Storage delete |
| Bank details | C4 | Settlement | Contract | **Held only at Paystack/Flutterwave.** We store `subaccount_code`, bank name, **masked** account (`******1234`), resolved account name. The full number is held field-level encrypted (`payout_accounts.pending_account_number_enc`) **only** between entry and subaccount creation on KYB approval, then nulled | Field-level | Owner (own); `ADMIN_FINANCE` | Relationship + 6 years ⚖️ | Hard delete |
| Bank/subaccount change history | C4 | Fraud control | Legitimate interest | `subaccount_changes` | Field-level | Finance, security | 6 years ⚖️ | Hard delete |
| Operator agreement acceptance (version, signer, timestamp, IP) | C3 | Contract evidence | Contract + legal obligation | `agreements` | At rest | Ops, legal | Relationship + 6 years ⚖️ | Hard delete |
| TOTP factor secrets | C4 | MFA | Contract / security | Supabase Auth (`auth.mfa_factors`) | Managed by Supabase | Supabase Auth only | Until factor removed | Supabase-managed (unenroll / user delete) |
| Password hash | C4 | Login | Contract | Supabase Auth (`auth.users`, bcrypt) — **never in app tables** | Hash (Supabase) | Supabase Auth only | Account life | `auth.admin.deleteUser` at erasure |
| Attendant device registration (device ID, public key, approved by) | C4 | Offline check-in integrity | Contract + legitimate interest | `attendant_devices` | Field-level | Operator manager; ops | Revocation + 12 months | Hard delete |
| Attendant PIN | C4 | Local unlock | — | **Device only** (PBKDF2-derived, never sent) | Device | — | Device | Wipe on logout |

### 3.6 Lots, permits, verification

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Lot public profile (name, address, hours, capacity, amenities, prices, approved photos) | C1 | Discovery | Contract | `lots`, `rate_plans`, `lot-photos-public` bucket | — | Public | While `LIVE`; archived 6 years ⚖️ | Unpublish; archive row |
| Lot internal notes, occupancy data | C2 | Ops | Legitimate interest | `lots`, `occupancy_snapshots` | At rest | Ops, operator | Occupancy: 3 years aggregated | Aggregate / delete |
| LASPA permit (number, dates, document scan) | C3 | Permit gate (compliance) | Legal obligation | `permits` + Storage (`files` row) | At rest (DB + Storage) | Ops, compliance, operator owner | Permit expiry + 6 years ⚖️ (regulatory evidence) | Hard delete |
| Additional approvals (LASTMA etc.) | C3 | Compliance | Legal obligation | `permits.additional_approvals` + Storage `permits` | As permit | As permit | As permit | As permit |
| Verification record (checklist results, reviewer, date, notes) | C3 | Trust layer | Legitimate interest + contract | `verification_records` | At rest | Ops, compliance, operator (own) | Lot life + 6 years ⚖️ | Hard delete |
| Verification photos (gate, lighting, CCTV cameras visible, signage) | C3 | Evidence of checklist | Legitimate interest | Storage (`files` row) | At rest; EXIF location kept internally only | Ops, compliance | As verification record | Storage delete |
| People/plates incidentally in verification photos | C3 | — (avoid) | — | Ops guidelines: photograph empty areas; blur faces/plates before upload (client-side blur tool, Grow) | — | — | — | — |
| **CCTV footage** | — | **Not collected or stored by Parkly.** Operators retain under their own policies; Parkly may request a specific clip for a claim, stored as claim evidence (§3.7) | — | — | — | — | — | — |

### 3.7 Trust, safety and support

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Incident reports (type, description, booking link, reporter, status) | C3 | Safety, lot quality, disputes | Legitimate interest + contract | `incidents` | At rest | Ops, support; operator (own lot, reporter masked) | **3 years** from closure ⚖️ (limitation period); longer under legal hold | Hard delete / anonymise reporter |
| Incident evidence (photos, video, attendant notes) | C3 | Investigation | Legitimate interest | Storage (`files` row) | At rest (Storage) | Ops | As incident | Storage delete |
| Claims (Grow): claim details, amounts, decisions, insurer refs | C3 | Claims handling | Contract + legal claims | `claims` | At rest | Claims owner, finance | **6 years** from closure ⚖️ | Hard delete |
| Claim evidence incl. CCTV clips, police reports, repair quotes | C3/C4 (C4 if medical/injury or ID docs) | Claims | Contract + legal claims | Storage `incident-evidence/c4/` where applicable | At rest + C4 bucket/prefix | Claims owner | As claim | Crypto-shred + delete |
| Claim payout bank details | C4 | Pay claim | Contract | Provider transfer recipient code + masked account | Field-level | Finance | As claim | Hard delete |
| Ratings (stars, tags, text) (Grow) | C3 (author link) / C1 (published aggregate) | Lot quality | Legitimate interest | `ratings` | At rest | Public (aggregate + anonymised text), ops | Author link removed at account closure; text kept anonymised for lot life | Anonymise |
| Support conversations (in-app, WhatsApp, email, call notes) | C3 | Customer support | Contract + legitimate interest | Support tool (vendor TBD, DPA required) + `support_notes` | Provider / at rest | Support, ops | **2 years** from last message ⚖️ | Vendor deletion API / hard delete |
| Call recordings | — | **Not recorded in MVP.** If introduced: consent notice, 90 days retention | — | — | — | — | — | — |
| Fraud signals / risk scores | C3 | Fraud prevention | Legitimate interest | `risk_events` | At rest | Security, finance | 24 months | Hard delete |
| Blocklists (phone hash, device ID, card fingerprint, plate hash) | C3 | Fraud prevention | Legitimate interest | `blocklist` | At rest + hashes only | Security | Until removed + review yearly; max 5 years | Hard delete |

### 3.8 Technical, security and audit data

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| IP address (request logs) | C3 | Security, abuse prevention | Legitimate interest | Vercel logs → Better Stack (truncated `/24` in aggregates), `security_events` (full), Upstash keys (hashed, TTL) | Provider at rest | Eng on-call, security | App logs **30 days**; security events 12 months | Better Stack retention setting; job delete |
| Application logs (masked) | C2/C3 | Debugging, monitoring | Legitimate interest | Vercel (short, plan-dependent) → Log Drain → Better Stack | Provider at rest | Eng | **30 days** in Better Stack | Retention setting |
| Edge/Firewall logs (Vercel Firewall) | C3 | Security | Legitimate interest | Vercel Firewall (provider retention) + drained to Better Stack | Provider | Security | Provider default; Better Stack 30 days (90 days for security-tagged events) | Retention setting |
| Supabase platform logs (Postgres, API gateway, Storage, Auth) | C3 | Debugging, security | Legitimate interest | Supabase Logs (plan retention) | Provider | Eng, security | Supabase plan default (Pro ≈ 7 days) — not relied on for long-term evidence | Provider expiry |
| Audit log (`audit_logs`) | C3 (integrity-critical) | Accountability, compliance | Legal obligation + legitimate interest | Postgres (append-only) + daily export to off-platform object-lock bucket | At rest + `age` encryption on export | `ADMIN_COMPLIANCE`, `SUPER_ADMIN` (read) | **6 years** ⚖️ (object lock); in DB 2 years | Object-lock expiry; DB partition drop |
| Platform audit logs (Supabase org audit log, Vercel team activity, GitHub audit log) | C3 | Security of platform changes | Legitimate interest | Provider; weekly export to the off-platform bucket | Provider / `age` | Security | 6 years ⚖️ for exports | Object-lock expiry |
| Error reports (Sentry) | C2 (PII scrubbed) | Debugging | Legitimate interest | Sentry (EU region) | Provider | Eng | 90 days | Vendor retention setting |
| Traces/metrics | C2 | Performance | Legitimate interest | Vercel Observability / `@vercel/otel` → Better Stack; Sentry performance | Provider | Eng | Metrics 13 months; traces 30 days | Retention setting |
| Product analytics events | C2 (pseudonymised) | Product improvement | **Consent** | Analytics tool | Provider | Product | 13 months | Vendor retention + deletion API on account closure |
| Feature flags, platform settings | C2 | Operations | Legitimate interest | Postgres | At rest | Eng, `SUPER_ADMIN` | Indefinite (history 2 years) | — |

### 3.9 Messaging

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| Notification log (channel, template, recipient user ID, status, provider message ID) | C3 | Delivery tracking, support | Contract | `notifications` | At rest | Support, eng | **90 days** | Hard delete |
| SMS content | C3 | Delivery | Contract | Termii (provider logs) — we store template ID + params hash, not content | Provider | — | Provider retention (request ≤ 90 days) ⚖️ | Provider |
| Marketing contact lists | C3 | Marketing | Consent | Derived at send time from `consents`; no separate list exported | — | Marketing | Until consent withdrawn | — |

### 3.10 Privacy operations

| Data element | Class | Purpose | Lawful basis | Stored | Encryption | Access | Retention | Deletion |
|---|---|---|---|---|---|---|---|---|
| DSAR requests (type, timeline, outcome) | C3 | Demonstrate compliance | Legal obligation | `dsar_requests` | At rest | DPO, compliance | 6 years ⚖️ | Hard delete |
| DSAR identity proofs (if manual) | C4 | Verify requester | Legal obligation | Storage `kyb-docs/dsar/` (C4) | At rest (Storage) | DPO | **30 days** after request closed | Crypto-shred + delete |
| Erasure log (entity IDs erased, timestamp — no PII) | C2 | Re-apply erasure after backup restore | Legal obligation | `erasure_log` | At rest | DPO, eng | 6 years (longer than max backup retention) | — |
| Breach register | C3 | NDPA accountability | Legal obligation | Restricted doc store | — | DPO | 6 years ⚖️ | — |
| Legal holds | C3 | Preserve evidence | Legal obligation | `legal_holds` | At rest | Compliance | Until released + 1 year | — |

---

## 4. Retention schedule (summary, implemented in `retention_policies`)

| Policy key | Data | Retention | Trigger | Action | Job |
|---|---|---|---|---|---|
| `otp` | OTP hashes | 5 min | Created | Expire | Supabase Auth (config) |
| `auth_audit` | Supabase Auth audit log rows | 12 months ⚖️ | Created | Delete | `retention:auth-audit` monthly (SQL, pg_cron) |
| `cron_history` | `cron.job_run_details`, archived `pgmq` messages | 14 days | Created | Delete | pg_cron daily |
| `rate_limit` | Upstash counters, job nonces | ≤ 24 h | Created | Expire | Upstash TTL |
| `idempotency` | Idempotency keys | 24 h | Created | Delete | `retention:idempotency` hourly |
| `search_raw` | Search events | 30 days | Created | Aggregate + delete | `retention:search` nightly |
| `app_logs` | App logs | 30 days | Created | Expire | Better Stack retention setting (Vercel/Supabase native retention is shorter) |
| `notifications` | Notification log | 90 days | Created | Delete | nightly |
| `webhook_raw` | Webhook payloads | 90 days | Received | Delete | nightly |
| `override_photos` | Manual check-in photos | 90 days (unless linked) | Uploaded | Delete | `retention:files` nightly (via `files` table + Storage API) |
| `sessions` | Revoked/expired auth sessions | Supabase-managed | Expiry | Delete | Supabase Auth |
| `devices` | Device records | 90 days after last seen / account closure | Last seen | Delete | weekly |
| `risk_events`, `card_fingerprint`, `security_events` | Fraud/security | 12–24 months | Created | Delete | monthly |
| `support` | Support conversations | 2 years after last message ⚖️ | Last message | Delete | monthly |
| `pseudonymise_bookings` | Booking/payment PII | 24 months | Booking end | Pseudonymise | monthly |
| `incidents` | Incidents | 3 years after closure ⚖️ | Closure | Delete/anonymise | monthly |
| `financial` | Bookings, payments, refunds, ledger, settlements, operator KYB, agreements, permits | **6 years** ⚖️ (FIRS / CAMA 2020 record-keeping — confirm exact period) | End of booking / relationship / permit expiry | Delete | monthly |
| `audit` | Audit logs, platform audit-log exports | 6 years ⚖️ | Created | Object-lock expiry | — |
| `claims` | Claims + evidence | 6 years after closure ⚖️ | Closure | Delete | monthly |
| `dsar_proofs` | DSAR ID proofs | 30 days after closure | Closure | Crypto-shred | daily |
| `analytics` | Analytics events | 13 months | Event | Vendor retention | vendor |
| `backups` | DB backups | Supabase PITR 7–14 days + daily backups (plan); off-platform nightly dumps: 35 days daily + 12 monthly | Created | Expire | Supabase (platform); object-lock retention on off-platform bucket |

**Implementation rules**
- Retention jobs are scheduled by **`pg_cron`**: pure-SQL deletes run in the DB; jobs that touch Storage objects or vendors are triggered via `pg_net` → `/internal/jobs/retention-*` (HMAC-signed, doc 05 §3.8). All are idempotent, process in chunks of ≤ 1,000 rows (resumable cursor, finishing inside the Vercel function time limit), write a summary to `audit_logs` (`RETENTION_RUN`, counts only) and skip any record under **legal hold** (§9).
- Retention periods are config (`retention_policies` table) so counsel's answers can be applied without code changes.
- Tests: each policy has an integration test that seeds expired/non-expired/held records and asserts the right outcome.

---

## 5. Pseudonymisation and anonymisation techniques

| Technique | Used for |
|---|---|
| **Blind index** `HMAC-SHA256(value, key_blind)` | `phone_hash`, `plate_hash`, `email_hash` for lookup/dedup without plaintext |
| **Pseudonymous ID** (`psid = HMAC(user_id, key_psid)`) | Analytics, aggregated reporting, pseudonymised financial records after 24 months |
| **Masking** | UI/logs: phone `+234 80* *** 1234`, plate `LND***AB`, email `a***@g***.com`, account `******1234` |
| **Generalisation** | Location → geohash-5/6; timestamps → hour bucket in aggregates |
| **Anonymisation** (irreversible) | Account closure: replace identifiers with `deleted:{random}`, drop hashes and links; rating text kept without author |
| **Crypto-shredding** | C4 files and fields: each subject/operator has a data key; deleting the key renders ciphertext (incl. in backups) unrecoverable |

Keys `key_blind` (`HMAC_KEY_V<n>`), `key_psid` (`PSID_KEY_V<n>`) and the field-encryption master key (`ENC_KEY_V<n>`) live in **Vercel Sensitive environment variables** on `parkly-api` only; rotation requires a re-index / re-wrap job (documented runbook). Crypto-shredding works because per-subject data keys are stored wrapped in Postgres: deleting the wrapped key row makes the ciphertext in the DB **and in every backup** unrecoverable.

---

## 6. Account deletion and anonymisation flow

### 6.1 Driver account deletion

1. Driver taps **Settings → Delete account** (also via `privacy@` or support). Re-authenticate with OTP.
2. **Pre-checks:** active booking/pass (`CONFIRMED`/`CHECKED_IN`) → must finish or cancel first; open incident/claim → deletion queued until closed (driver informed); unpaid overstay → must settle.
3. Show what is deleted vs retained (financial records retained for the statutory period in pseudonymised form) — plain language.
4. On confirm: status `PENDING_DELETION`, all sessions revoked, push tokens deleted, marketing consents withdrawn, analytics deletion request sent. **30-day grace** period (driver can cancel by logging in).
5. After 30 days, `account-erasure` job:
   - Supabase Auth: `auth.admin.deleteUser(id)` (removes phone, password hash, factors, sessions, identities from the `auth` schema).
   - `users`: phone/name/email → anonymised; `phone_hash`, `email_hash` removed; status `DELETED`.
   - Storage: objects owned by the user (via `files` table) deleted through the Storage API.
   - `vehicles`, `saved_places`, `devices`, `user_settings`: hard delete.
   - `bookings`/`payments`/`session_events`: `user_id` → `psid`, plate → `plate_hash` only, vehicle snapshot → make/colour removed.
   - `ratings`: author unlinked. `support_notes`: deleted (unless legal hold). `search_events`: deleted.
   - Vendor deletions: analytics, support tool, Sentry user (if any), Expo push, Resend contact (if any).
   - Crypto-shred any per-user data keys.
   - Append entry to `erasure_log`; write `AuditLog` (`ACCOUNT_ERASED`, no PII).
6. Confirmation SMS/email sent **before** contact data is erased.
7. Re-registration with the same phone later creates a fresh account (no link to old one).

### 6.2 Operator closure

- Terminate agreement → lots `ARCHIVED` (public profile removed immediately); pending settlements completed; members' operator roles removed.
- Operator business records (KYB, agreements, permits, settlements) retained for the statutory period (`financial` policy), then deleted.
- Member user accounts: anonymised unless they also have a driver role.

---

## 7. Backups and erasure

- Backups are immutable; we **do not edit backups** to erase individuals. Instead:
  - C4 data is crypto-shredded (key deletion makes backup copies unreadable).
  - `erasure_log` is retained longer than the longest backup; any restore runs `reapply-erasures` before the database is put back into service (runbook + automated step in restore script).
- Backups in scope:
  - **Supabase platform backups**: daily backups (plan retention) + **PITR** add-on on `parkly-prod` (7 days minimum, 14 recommended). We cannot edit or selectively delete these; they age out on Supabase's schedule.
  - **Off-platform nightly dumps** (doc 05 §15): `age`-encrypted `pg_dump` of app schemas + `auth`, and encrypted Storage sync, in an object-lock bucket — 35 days of dailies + 12 monthlies. ⚖️ transfer basis for the bucket's region.
- Because the `auth` schema is in the off-platform dump, an erased user's Auth record exists in backups until they age out (max ~12 months); the erasure log covers it on restore.
- Restore procedure (runbook): restore into a **fresh** Supabase project → run `reapply-erasures` (deletes/anonymises every ID in `erasure_log`, including `auth.users`) → run retention jobs → only then point the API at it.
- Lower environments never receive backup restores of prod; use `supabase/seed.sql` + `scripts/seed` synthetic data generator.

---

## 8. Logs and analytics minimisation

- Logs: only IDs and masked values; redaction is enforced (doc 05 §12) and tested.
- Analytics events: allowlisted schema (`packages/contracts/analytics`). Allowed properties: `psid`, event name, screen, lot ID (C1), geohash-5, booking duration bucket, price bucket, app version, OS. **Forbidden:** phone, name, email, plate, precise lat/lng, free text, payment refs.
- Consent gate: analytics SDK not initialised until consent; respect withdrawal (stop + delete).
- Business reporting uses aggregates (C2) via masked SQL views (read-only `parkly_analyst` role; Supabase read replica if load requires); no ad-hoc PII queries outside the admin console. Supabase Studio access to `parkly-prod` is limited to named owners and every session is noted in the access log.

---

## 9. Legal hold

- `ADMIN_COMPLIANCE` can place a hold on a user, operator, booking, incident or claim (reason, requester, scope, review date).
- While held: retention jobs and account erasure skip the scoped records; erasure requests are acknowledged and paused with explanation ⚖️.
- Holds reviewed every 90 days; release is audited; normal retention resumes.

---

## 10. Data residency and transfers

| Data | Location | Transfer basis |
|---|---|---|
| Primary database, auth, files, job queues | Supabase **Ireland (`eu-west-1`)** — closest region available at project creation; confirm at Sprint 0 | Cross-border transfer under NDPA Part VIII / GAID — adequacy or appropriate safeguards (Supabase DPA + contractual clauses) ⚖️ |
| API compute, web hosting, request/firewall logs | Vercel Functions `dub1` (Ireland); Vercel edge network (global, incl. nearest PoP to Lagos) | Vercel DPA + contractual clauses ⚖️ |
| Logs, uptime | Better Stack (EU region) | Processor DPA ⚖️ |
| Rate-limit counters (hashed identifiers) | Upstash (EU region) | Processor DPA ⚖️ |
| Email | Resend (EU region if available, else US) | Processor DPA + SCC-style clauses ⚖️ |
| DR backups, audit exports | Off-platform object-lock bucket (EU region, provider by Sprint 0 ADR) | As above ⚖️ |
| Payment data | Paystack / Flutterwave (Nigeria + their processors) | Processor DPA |
| SMS | Termii (Nigeria) | Processor DPA |
| Errors / analytics | Sentry (EU region), analytics vendor (EU preferred) | Processor DPA + SCC-style clauses ⚖️ |
| Push | Expo push service (US) → FCM/APNs | Processor DPA ⚖️; notification content minimised (no plate/phone) |
| Maps | Google (global) | Only lot addresses and search text; no user IDs sent |

The full sub-processor register (DPA and SOC 2 status) is in doc 05 §18.1.1. Data is plain Postgres + object files, so moving to a Nigerian region/provider (if required by NDPC or a large customer) is a migration (dump/restore + Auth user export), not a rewrite.

---

## 11. DSAR handling (operational)

1. Request received (in app, `privacy@`, support) → `dsar_requests` row, acknowledgement within **72 h**.
2. Verify identity (OTP to registered phone; email confirmation if available; manual ID proof only as last resort → C4, 30-day retention).
3. Fulfil:
   - **Access/portability:** automated export job gathers profile, vehicles, consents, bookings, passes, payments (masked), session events, incidents, ratings, notification log → JSON + human-readable PDF, stored in the private `exports` bucket and delivered via in-app download link (Supabase Storage signed URL issued by the API, 24 h, one-time; object deleted after download or 7 days).
   - **Rectification:** self-serve or support edits (audited).
   - **Erasure:** §6.1.
   - **Restriction/objection:** flag `processing_restricted` on user; excluded from analytics, marketing, non-essential processing.
4. Close within SLA (doc 05 §18.1), record outcome, notify requester.
5. Monthly DSAR metrics to DPO.

---

## 12. Definition of done for any data change

- [ ] Data element added to §3 with class, purpose, basis, storage, access, retention, deletion.
- [ ] Drizzle column declared with `c3()`/`c4()` + `COMMENT ON COLUMN` in the migration; C4 uses `FieldCrypto`; lookups use blind index.
- [ ] New table has RLS enabled (deny-all for client roles); new files get a `files` row with class + retention policy and live in the right private bucket/prefix.
- [ ] Retention policy key assigned and covered by a retention job test.
- [ ] Included in DSAR export (or justified exclusion) and in account erasure flow.
- [ ] Not logged unmasked; not in analytics unless allowlisted.
- [ ] Seed/synthetic data generator updated (no real data in non-prod).
