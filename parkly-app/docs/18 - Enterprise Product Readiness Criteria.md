# 18 — Enterprise Product Readiness Criteria

> **Status:** v1.0 — 14 Oct 2026. Applies to the **Grow** (months 5–12) and **Scale** (months 12–24) phases in the strategy.
> **Purpose:** defines what Parkly has to have in place before it signs **employer/corporate pass deals, fleet accounts, partner API integrations (ride-hail, fintech, LASPA) and new nodes or cities**. Use it as a gate for each deal type (§3) and as the maturity roadmap (§5).
> **Builds on:** [doc 01 Architecture](01%20-%20System%20Architecture%20and%20System%20Designs.md), [doc 05 Security](05%20-%20Security%20and%20Compliance.md), [doc 06 Data](06%20-%20Data%20Storage%20Classification%20and%20Retention.md), [doc 17 MVP checklist](17%20-%20MVP%20Launch%20Readiness%20Checklist.md) (which must be fully done first).

---

## 1. Enterprise segments and what they expect

| Segment | Example buyer | What they'll ask for | Strategy horizon |
|---|---|---|---|
| Employers (corporate passes) | Banks, telcos and consultancies in VI/Ikoyi/Ikeja | Monthly passes for N staff, one invoice, admin portal, SSO, a staff roster sync, a DPA, an SLA | Next (Grow) |
| Fleets | Ride-hail fleet owners, logistics, corporate car pools | Many vehicles, usage reports per vehicle/driver, spending limits, post-paid invoicing | Later (Scale) |
| Partner platforms | Ride-hail apps, fintech/super-apps, banks | A booking API, availability API, webhooks, sandbox, OAuth, uptime SLA, security questionnaire answers | Later (Scale) |
| Venues and events | Event centres, churches, stadiums | Bulk/allocated inventory, event-specific pricing, ticket-bundled parking codes | Next (Grow) |
| Government / regulator | LASPA | Data sharing (permit status, occupancy), audit access, compliance reports | Later (Scale) |
| New nodes / cities | Internal | Repeatable onboarding, regional config, scaling headroom | Grow (node 2) → Scale (city 2) |

---

## 2. Readiness criteria by area

Every criterion has an ID, so contracts, RFP answers and ADRs can refer to it.

### 2.1 Identity and access for organisations

| ID | Criterion |
|---|---|
| ENT-IAM-1 | **Organisation accounts** for employers and fleets (new entity `Organisation` of type `EMPLOYER` or `FLEET`, separate from `Operator`), with roles `ORG_ADMIN`, `ORG_FINANCE`, `ORG_MEMBER`. |
| ENT-IAM-2 | **SSO for org admins:** SAML 2.0 and OIDC (Azure AD/Entra ID, Google Workspace, Okta). JIT provisioning optional. SSO can be enforced per org. |
| ENT-IAM-3 | **Member provisioning:** CSV bulk upload (phone + employee id + vehicle plate), then SCIM 2.0 (users) for orgs > 200 members. Deprovisioning revokes passes from the next period, configurable as immediate. |
| ENT-IAM-4 | MFA is enforced for every org admin who isn't using SSO. |
| ENT-IAM-5 | Org admins can see their own org's audit log (logins, member changes, pass assignments, invoices). |

### 2.2 Billing and invoicing

| ID | Criterion |
|---|---|
| ENT-BIL-1 | **Invoiced billing:** a monthly invoice per org (PDF + CSV line items per member/vehicle/lot), with the company RC number, TIN and VAT (7.5%) shown correctly, and sequential invoice numbering. |
| ENT-BIL-2 | **Payment of invoices** by bank transfer to a dedicated virtual account (provider-issued) or a Paystack payment link. Auto-matching of payments to invoices. Net-15/30 terms per contract. |
| ENT-BIL-3 | **No stored value:** org pre-payments are invoiced for a defined period and service, not held as a spendable balance (the CBN constraint carries over from doc 00 §3.10). Counsel confirms the post-paid structure. |
| ENT-BIL-4 | Operator payouts for corporate passes: settled per period, reconciled against invoice payment, with a clear statement to the operator. |
| ENT-BIL-5 | Credit control: dunning reminders, suspension of passes on non-payment after the contractual grace period, a written-off workflow (finance-only). |
| ENT-BIL-6 | Fleet spending controls: per-vehicle/per-driver monthly caps, allowed lots/zones, allowed hours. |
| ENT-BIL-7 | Accounting export (CSV/journal format agreed with finance; Xero/QuickBooks/Sage connector optional). |

### 2.3 Contracts, SLAs and support

| ID | Criterion |
|---|---|
| ENT-SLA-1 | **Availability SLA 99.9%** monthly for the booking, availability and check-in APIs (excluding announced maintenance ≤ 4 h/month in a 00:00–05:00 WAT window). Service credits are defined in the MSA. Needs the architecture in ENT-SCL. |
| ENT-SLA-2 | A **public status page** (`status.parkly.ng` or similar) with component-level status, incident history, scheduled maintenance and email/SMS subscription. It's hosted outside the main infrastructure. |
| ENT-SLA-3 | **Support tiers:** see §4. Named account manager for Enterprise. |
| ENT-SLA-4 | Incident communication: a first notice within 30 min of a Sev-1, updates every 60 min, an RCA within 5 business days. |
| ENT-SLA-5 | Contract templates: MSA, order form, SLA schedule, **DPA** (controller/processor roles defined, NDPA-compliant, sub-processor list, transfer clauses), and a security schedule. |
| ENT-SLA-6 | The sub-processor list (Supabase, Vercel, Paystack, Flutterwave, Termii, Google Maps, Sentry, Resend, Upstash, Better Stack, Expo) is published, with 30 days' notice of changes. Our customer SLA never exceeds what Supabase and Vercel commit to on our plan tier (move to their Team/Enterprise tiers before offering 99.9%+). |

### 2.4 Security assurance

| ID | Criterion |
|---|---|
| ENT-SEC-1 | **Penetration testing:** an annual third-party test of all apps and APIs, plus one before every major new surface (partner API, org portal). A retest confirms fixes. An executive summary letter is available under NDA. |
| ENT-SEC-2 | **SOC 2 Type I → Type II / ISO 27001 roadmap:** §5.2 gives the timeline. Policies are written and approved (information security, access control, change management, vendor management, incident response, BCP/DR, acceptable use, data classification). |
| ENT-SEC-3 | A pre-filled **security questionnaire** answer pack (CAIQ-lite / SIG-lite) is maintained by security and refreshed every quarter. |
| ENT-SEC-4 | Vulnerability management SLAs: Critical 48 h, High 7 days, Medium 30 days, Low 90 days. Tracked and reported. |
| ENT-SEC-5 | Access reviews every quarter for production, admin console and cloud IAM. Joiner/mover/leaver process with same-day removal. |
| ENT-SEC-6 | Encryption: TLS 1.2+ everywhere, provider-managed encryption at rest (Supabase, Vercel), app-level envelope encryption with versioned keys for C4 fields, customer-scoped encryption context for org data exports. Sub-processor security reports (Supabase and Vercel SOC 2 Type II) are on file. |
| ENT-SEC-7 | A responsible disclosure policy and `security.txt` are published. A bug bounty is considered at Scale. |

### 2.5 Data protection and compliance

| ID | Criterion |
|---|---|
| ENT-DP-1 | An **NDPA annual compliance audit** by a licensed Data Protection Compliance Organisation (DPCO), filed with NDPC as required for a data controller/processor of major importance. |
| ENT-DP-2 | A DPIA is refreshed for each new enterprise data flow: employee rosters, fleet telematics, partner data sharing. |
| ENT-DP-3 | Role clarity: for employer passes, Parkly is the controller for driver account data and the employer is the controller for the roster it uploads (documented in the DPA). |
| ENT-DP-4 | **Data export for customers:** an org admin can export all org data (members, passes, sessions, invoices) as CSV/JSON on demand, with the export audit-logged. |
| ENT-DP-5 | **Audit export:** the org's audit log is exportable (CSV/JSON). The platform audit log is exportable to the customer's SIEM on request (Enterprise tier). |
| ENT-DP-6 | Data residency statement and transfer mechanism, documented and agreed with counsel (doc 00 Q6). |
| ENT-DP-7 | Contract-end data return and deletion within 30 days, with a deletion certificate. |
| ENT-DP-8 | Records of processing activities (RoPA) kept current. |

### 2.6 Partner API platform

| ID | Criterion |
|---|---|
| ENT-API-1 | A **separate partner API surface** (`/partner/v1`), documented in its own OpenAPI spec and published in a developer portal with guides, a changelog and code samples. |
| ENT-API-2 | **Authentication:** OAuth 2.0 client credentials (machine-to-machine) for partners. Scoped tokens (`lots:read`, `availability:read`, `bookings:write`, `bookings:read`, `webhooks:manage`). Tokens last 1 h. Client secrets can be rotated with overlap. Optional mTLS for high-volume partners. Simple **API keys** only for read-only public-data tiers. Keys are hashed at rest and shown once. |
| ENT-API-3 | **Sandbox environment** with test data and Paystack test mode, self-service credentials, and a reset button. |
| ENT-API-4 | **Webhooks for partners:** events `booking.confirmed`, `booking.cancelled`, `session.checked_in`, `session.checked_out`, `payment.refunded`, `lot.availability_changed` (throttled). HMAC-SHA256 signatures with a timestamp, retries with exponential backoff for 24 h, a dead-letter queue, a replay UI, and an event id for dedupe. |
| ENT-API-5 | **Rate limits:** per client and per scope (default 600 req/min for read, 60 req/min for booking writes), burst allowance, `RateLimit-*` headers, and a 429 with `Retry-After`. Limits are raised by contract. |
| ENT-API-6 | **Versioning and deprecation policy:** URL-major versioning (`/partner/v1`). Additive changes are non-breaking. Breaking changes only in a new major. **≥ 12 months'** deprecation notice, with a `Deprecation` and `Sunset` header, changelog and email notice. At most 2 majors supported at once. |
| ENT-API-7 | **Idempotency** is required on every partner write (`Idempotency-Key`, 24 h retention). |
| ENT-API-8 | Partner payment models: (a) the partner collects and pays Parkly by invoice (post-paid, settlement terms), or (b) Parkly-hosted checkout. Either way, there are no stored balances. Counsel reviews each model. |
| ENT-API-9 | Per-partner usage analytics and an API health dashboard. Partner-specific error-rate alerts. |
| ENT-API-10 | Contract tests run against the partner API in CI. Backward-compatibility checks (OpenAPI diff) block breaking changes in a minor release. |

### 2.7 Multi-tenancy and data isolation

| ID | Criterion |
|---|---|
| ENT-MT-1 | Every tenant-scoped table carries `operator_id` or `organisation_id`. Repository-level scoping is enforced by a mandatory tenant context in the API. RLS is already on every table (deny-all for clients, ADR 0002); at this level, add **tenant-scoped RLS policies** for any data exposed through Supabase Realtime or a per-tenant DB role, as defence in depth. |
| ENT-MT-2 | An automated cross-tenant access test suite (every resource × every role) runs in CI. Any IDOR is a Sev-1. |
| ENT-MT-3 | Per-tenant configuration (pricing, commission, branding of invoices, SSO settings, webhook endpoints) without code changes. |
| ENT-MT-4 | Noisy-neighbour protection: per-tenant rate limits and per-tenant queue fairness for exports and webhooks. |
| ENT-MT-5 | Region/city as a first-class dimension (`city_id`) on lots, pricing rules, regulator rules, support hours and permit types, so city 2 is configuration plus a regulator adapter, not a fork. |

### 2.8 Scalability and performance targets

| ID | Criterion | Target |
|---|---|---|
| ENT-SCL-1 | Peak booking throughput | 50 bookings/s sustained, 200/s burst, with no overbooking |
| ENT-SCL-2 | Search/availability read | 1,000 req/s, p95 < 300 ms (cached), p99 < 800 ms |
| ENT-SCL-3 | Attendant event ingestion | 500 events/s, sync lag p95 < 60 s |
| ENT-SCL-4 | Data volume | 10M sessions/year without degrading queries (partitioning for bookings/sessions/events by month; read replica for reporting) |
| ENT-SCL-5 | Lots / cities | 5,000 lots, 5 cities without architectural change |
| ENT-SCL-6 | Load tests | Run each quarter and before each enterprise go-live at 2× contracted peak. Results are archived. |
| ENT-SCL-7 | Capacity planning | Monthly review of headroom (Supabase compute and connections, Supavisor pool, read replicas, `pgmq` queue depth, Vercel function concurrency/duration, Upstash limits, provider rate limits including Paystack and Termii), checked against the ADR 0002 revisit triggers |

### 2.9 Resilience and disaster recovery

| ID | Criterion |
|---|---|
| ENT-DR-1 | RPO ≤ 5 min, RTO ≤ 1 h for the core booking/check-in path (tighter than the MVP's 15 min / 4 h). |
| ENT-DR-2 | **DR test twice a year:** (a) Supabase PITR restore and (b) restore of the off-platform `pg_dump` + Storage export into a fresh Supabase project in another region, with a Vercel deployment pointed at it; measure RTO/RPO, write the report. Off-platform backup copies are kept in a second provider/region, subject to the counsel-approved transfer basis. Consider a Supabase read replica in a second region for ENT-DR-1. |
| ENT-DR-3 | A game day each quarter: inject a payment provider outage, SMS outage, Upstash loss (rate limiter must fail safe), Supabase degradation (attendant offline mode carries check-in) and a Vercel region issue. Verify the failover and runbooks. |
| ENT-DR-4 | Automatic failover to the secondary payment provider and the secondary SMS provider, behind a health-checked circuit breaker. |
| ENT-DR-5 | A business continuity plan covers the support team, office power/internet outages (Lagos context) and key-person dependency. |

### 2.10 Accessibility and quality

| ID | Criterion |
|---|---|
| ENT-ACC-1 | A **WCAG 2.2 AA conformance report (VPAT/ACR)** for the driver web, org admin portal and driver app, refreshed each year. |
| ENT-ACC-2 | Accessibility regression tests (axe) in CI for every web app. Manual screen-reader audits each quarter. |
| ENT-QA-1 | Release management: a release calendar, change advisory for partner-impacting changes, release notes for enterprise customers. |

### 2.11 Observability and reporting for customers

| ID | Criterion |
|---|---|
| ENT-OBS-1 | Customer-facing usage reports: per member/vehicle/lot, sessions, spend, utilisation of purchased passes. Scheduled email delivery. |
| ENT-OBS-2 | SLA reporting: monthly uptime per component, shared with Enterprise customers. |
| ENT-OBS-3 | Internal SLOs with error budgets for each SLA'd component. Releases freeze when the budget is exhausted. |

---

## 3. Gates per deal type

A deal can be signed only when every criterion listed for it is met (or an approved exception is in the contract).

| Deal type | Must-have criteria |
|---|---|
| **Employer passes (pilot, ≤ 50 staff)** | ENT-IAM-1, ENT-IAM-3 (CSV), ENT-IAM-4, ENT-BIL-1/2/3/4, ENT-SLA-5 (DPA), ENT-DP-3/4, ENT-MT-1/2, ENT-SEC-4 |
| **Employer passes (> 50 staff or regulated employer, e.g. bank)** | All of the above + ENT-IAM-2 (SSO), ENT-IAM-5, ENT-BIL-5, ENT-SLA-1/2/3/4, ENT-SEC-1/2 (SOC 2 Type I or ISO 27001 underway)/3/5, ENT-DP-1/5/7, ENT-DR-1/2 |
| **Fleet accounts** | Employer pilot set + ENT-BIL-6/7, ENT-OBS-1, ENT-SCL-6 |
| **Partner API (ride-hail / fintech)** | ENT-API-1 to ENT-API-10, ENT-SLA-1/2/4/6, ENT-SEC-1/2/3/4/7, ENT-MT-4, ENT-SCL-1/2/6, ENT-DR-1/3/4, ENT-DP-2/6, ENT-OBS-2/3 |
| **Venue / event partnerships** | ENT-IAM-1 (venue as org), ENT-BIL-1/2, ENT-SCL-1 (event spikes), ENT-SLA-2, ENT-SCL-6 (load test at event peak) |
| **New node (same city)** | ENT-MT-5, ENT-SCL-7, a repeatable lot onboarding playbook with lot acquisition cost measured (strategy Scale gate) |
| **New city** | ENT-MT-5 + a regulator adapter for the new city's permit rules, local counsel review, local support hours, ENT-DR-2 passed in the last 6 months, ENT-SCL-5 headroom confirmed |
| **LASPA data integration** | ENT-API-1/2/4/6, ENT-DP-2/6, ENT-SEC-1, and a formal data-sharing agreement |

---

## 4. Support tiers

| Tier | Who | Channels | Hours (WAT) | First response | Resolution target (Sev-1 / Sev-2 / Sev-3) |
|---|---|---|---|---|---|
| **Standard** | All drivers, operators | WhatsApp, phone, in-app, email | Lot opening hours (MVP: 06:00–22:00 daily) | 15 min median (WhatsApp/phone), 1 business day (email) | 4 h / 1 business day / 5 business days |
| **Business** | Employers ≤ 200 seats, small fleets | + dedicated email, shared Slack/WhatsApp group | 06:00–22:00 daily | 1 h Sev-1, 4 h Sev-2 | 4 h / 1 business day / 3 business days |
| **Enterprise** | Large employers, partners, fleets > 200 vehicles | + named account manager, 24/7 Sev-1 phone line, quarterly business review | 24/7 for Sev-1, otherwise 06:00–22:00 | 30 min Sev-1, 2 h Sev-2 | 2 h / 8 h / 2 business days |

Severity definitions: **Sev-1** booking/check-in or payment unavailable for many users, a data breach, or a safety incident. **Sev-2** a major feature degraded, or one lot unusable. **Sev-3** a minor issue or question.

---

## 5. Maturity scorecard

Score each area 1–4 every quarter. The **target column** is the minimum level for the phase. Record the evidence for each score.

**Levels**

- **L1 — Initial:** works for the pilot, with manual processes and tribal knowledge.
- **L2 — Defined:** documented, repeatable, owned, and tested in CI where it applies.
- **L3 — Managed:** measured with SLOs/KPIs, automated, reviewed regularly, audited internally.
- **L4 — Optimised:** externally certified/attested, self-service for customers, continuously improved.

### 5.1 Scorecard

| Area | L1 | L2 | L3 | L4 | MVP target | Grow target | Scale target |
|---|---|---|---|---|---|---|---|
| **Identity & access** | Phone OTP + operator MFA | RBAC test suite, admin SSO, quarterly access review | Org accounts, customer SSO (SAML/OIDC), audit to customer | SCIM, customer-managed policies, SIEM export | L2 | L3 | L4 |
| **Billing & invoicing** | Card/transfer per booking, split settlement | Monthly passes, receipts, operator statements, reconciliation automated | Org invoicing, dunning, credit control, accounting export | Self-service billing portal, multi-entity invoicing | L2 | L3 | L3 |
| **Security assurance** | ASVS L2 self-assessment, pre-launch pen test | Vulnerability SLAs met, SAST/DAST in CI, policies written | Annual pen test + retest, SOC 2 Type I or ISO 27001 Stage 1, questionnaire pack | SOC 2 Type II / ISO 27001 certified, bug bounty | L1→L2 | L3 | L4 |
| **Data protection** | Privacy policy, consents, deletion, DPO | DPIA, RoPA, retention jobs, DSAR SLA tracked | NDPA annual audit filed, DPA templates, customer data export | Privacy-by-design reviews in SDLC, external certification | L2 | L3 | L3–L4 |
| **Availability & SLAs** | 99.5% best effort, basic alerts | SLOs defined, on-call, status page | 99.9% SLA with credits, error budgets | 99.95%, multi-region active-passive | L1→L2 | L3 | L3–L4 |
| **Resilience & DR** | Backups + tested restore | Runbooks rehearsed, secondary providers integrated | Semi-annual DR test, quarterly game days, auto failover | Cross-region DR with RTO ≤ 15 min | L2 | L3 | L3–L4 |
| **Partner API platform** | — (none) | Internal API documented (OpenAPI) | Partner API, OAuth client credentials, sandbox, webhooks, versioning policy | Developer portal self-serve onboarding, SDKs, usage billing | L2 (internal) | L2 | L3–L4 |
| **Multi-tenancy** | App-level scoping | Cross-tenant test suite in CI | RLS defence in depth, per-tenant limits & config | Tenant-level encryption keys, isolated tenancy option | L2 | L3 | L3 |
| **Scalability** | Load tested to 10× pilot peak | Partitioning plan, read replica | Quarterly load tests at 2× contracted peak, capacity reviews | Autoscaling validated to 10× contracted peak | L1→L2 | L2 | L3 |
| **Observability** | Sentry, dashboards, alerts | Tracing end to end, SLO dashboards | Customer-facing usage & SLA reports | Anomaly detection, proactive customer alerts | L2 | L3 | L3 |
| **Support** | WhatsApp + phone, human, pilot hours | Ticketing, SLAs tracked, knowledge base | Tiered support, account managers, 24/7 Sev-1 | Customer success function, QBRs, NPS-driven | L1→L2 | L3 | L3–L4 |
| **Accessibility** | WCAG AA on key flows | axe in CI, TalkBack tested | Conformance report (VPAT/ACR) | Third-party audit each year, AA across all surfaces | L2 | L3 | L3 |
| **Regulatory (LASPA, CBN)** | Permit gate, counsel opinion | Automated permit expiry, compliance reporting | Regulator reporting/data sharing, multi-city rules engine | Formal regulator partnership / integration | L2 | L2–L3 | L3–L4 |

### 5.2 Certification roadmap (proposed)

| When (from pilot launch) | Milestone |
|---|---|
| Month 0–3 | Policies written (§2.4 ENT-SEC-2), asset inventory, risk register, vendor list. Compliance automation tool chosen (e.g. Vanta/Drata/Secureframe), or a manual evidence repo. |
| Month 3–6 | Controls implemented and evidence collection automated. Internal audit. NDPA audit by a DPCO (ENT-DP-1). |
| Month 6–9 | **SOC 2 Type I** report (or ISO 27001 Stage 1). The choice depends on what the first enterprise prospects ask for: international partners → SOC 2, Nigerian banks and corporates → often ISO 27001. |
| Month 9–18 | **SOC 2 Type II** observation window (6–12 months) and report, or ISO 27001 Stage 2 certification. |
| Ongoing | Annual pen test, annual NDPA audit, annual DR test report, quarterly access reviews. |

---

## 6. Ownership and review

| Area | Owner (role) |
|---|---|
| IAM, multi-tenancy, API platform, scalability, DR | Engineering lead |
| Security assurance, certifications | Security owner (engineering lead until hired) |
| Data protection, NDPA audit, DSAR | DPO |
| Billing, invoicing, credit control | Finance lead |
| SLAs, status page, support tiers | Operations lead |
| Contracts, DPA, MSA | Legal / compliance adviser |
| Regulator relationship | CEO / founder + compliance adviser |

The scorecard is reviewed **every quarter** and before every enterprise deal or new city. Results go in `docs/readiness/YYYY-QN-scorecard.md`.
