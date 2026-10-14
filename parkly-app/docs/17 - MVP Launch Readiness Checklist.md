# 17 — MVP Launch Readiness Checklist

> **Status:** v1.0 — 14 Oct 2026. Covers the **pilot launch**: one node, 10–15 verified lots, a closed group of commuters, then public in that node.
> **Use:** work through it from Sprint 9 onward (see [doc 20](20%20-%20Sprint%20Plan%20and%20Delivery%20Roadmap.md)). Each item needs an **owner** and **evidence** (a link to a PR, test report, dashboard, signed document or ticket). An item without evidence is not done.
> **Gate:** go-live needs every **[B] Blocker** item checked and every owner in §15 signed. **[R] Required** items can carry a written waiver with a fix date ≤ 30 days after launch, signed by the product lead and the engineering lead. Waivers are not allowed for security, payments or legal blockers.

Legend: **[B]** blocker · **[R]** required (waivable) · **[N]** nice-to-have

---

## 1. Product

- [ ] [B] Every MVP flow in [doc 03](03%20-%20User%20Flow%20Diagrams%20(MVP).md) §1–§4 is built and passes the acceptance criteria in the [PRD (doc 19)](19%20-%20PRD%20-%20Product%20Requirements.md).
- [ ] [B] Driver can do the full journey on a low-end Android (2 GB RAM, Android 9): onboard → search → book → pay → check in → extend → check out → receipt.
- [ ] [B] The verified badge appears only for lots meeting the doc 00 §3.6 invariant. This is tested with expired-permit and stale-verification fixtures.
- [ ] [B] Every price shown before payment equals the amount charged (including the service fee). A property-based test covers the pricing module.
- [ ] [B] Cancellation, no-show, early-exit and overstay policies show the same text in the app, on the receipt, and in the ToS.
- [ ] [R] Empty states, error states and offline states exist for every screen in the inventory (doc 03 §5).
- [ ] [R] The copy has been reviewed for plain English and Lagos context (landmarks, naira formatting, local times).
- [ ] [R] The FAQ and help content are published, covering booking, payment, refunds, check-in problems and safety.
- [ ] [R] Feature flags are set: `claims_enabled=false`, `pass_prorate` per lot, `four_eyes_verification` per ops headcount.
- [ ] [N] Demand-signal ("notify me") data is visible to the ops team for supply planning.

## 2. Engineering quality

- [ ] [B] CI is green on `main`: lint, typecheck, unit, integration, e2e (web: Playwright; mobile: Maestro smoke).
- [ ] [B] Coverage meets the doc 02 targets: `packages/domain` ≥ 95% lines/branches; API modules for booking, payments, availability and auth ≥ 90%; overall API ≥ 80%.
- [ ] [B] The availability and concurrency test proves **no overbooking**: 200 concurrent booking attempts for the last 5 spaces confirm exactly 5.
- [ ] [B] Idempotency is tested for booking create, payment init, webhook handling, refunds and attendant event batches (replays give the same result, with no double charge).
- [ ] [B] Database migrations are forward-only, have been run on staging from an empty DB **and** from a prod-shaped snapshot, and have a documented rollback plan per migration.
- [ ] [B] The OpenAPI (`apps/api/openapi.json`) is regenerated and committed. Clients build against it with no type errors.
- [ ] [R] No `TODO(launch)` or `FIXME` remains in the code paths for payments, auth or check-in.
- [ ] [R] The dependency licence scan passes (no AGPL in shipped bundles without approval).
- [ ] [R] Seed and fixture data are separate from prod. Prod holds no test lots or users, or they're flagged `is_test=true` and hidden.
- [ ] [R] All ADRs for decisions taken during the build are written in `docs/decisions/`.
- [ ] [N] Storybook (or the equivalent) for `packages/ui` and `packages/ui-native` components.

## 3. Security (see [doc 05](05%20-%20Security%20and%20Compliance.md))

- [ ] [B] An external penetration test of the API, the mobile app, the portal, the attendant PWA and the admin console is complete. **No open Critical or High findings.** Mediums have fix dates.
- [ ] [B] The OWASP ASVS L2 checklist (doc 05) has been self-assessed, with evidence.
- [ ] [B] The OWASP MASVS-L1 check has been done on the Android build: no secrets in the bundle, certificate pinning or justified exception, secure storage for tokens.
- [ ] [B] MFA is enforced for every admin user and operator owner/manager. Admin is behind SSO + IP allowlist.
- [ ] [B] Secrets live in Vercel environment variables (marked Sensitive, per environment) and Supabase Vault for SQL-side secrets. The Supabase secret/service key and DB URL exist only in server-side env; a bundle scan confirms no client (web or mobile) contains them. No secrets in the repo, and the history has been scanned (gitleaks).
- [ ] [B] **RLS audit:** every table in `public` has RLS enabled with no `anon`/`authenticated` policies (CI test green), and a direct Supabase Data API call with the publishable key + a real driver JWT returns no data.
- [ ] [B] **Supabase security advisor** and performance advisor show no open errors on `parkly-prod`. Supabase Auth settings reviewed: leaked-password protection on, OTP expiry 5 min, refresh-token rotation + reuse detection on, ES256 signing keys, MFA required (`aal2`) for admins and operator owners.
- [ ] [B] Storage buckets are all private; signed URLs only; no bucket policy grants `anon` access (except the approved public lot-photo bucket).
- [ ] [B] Paystack webhook signature verification is enforced. Unsigned or invalid requests are rejected and alerted.
- [ ] [B] Rate limits are live on OTP request/verify, login, booking create, search and the public endpoints.
- [ ] [B] The authorisation test suite passes: operator A cannot read or write operator B's lots, bookings, settlements or members (IDOR tests per resource).
- [ ] [B] Per-lot Ed25519 QR signing keys are stored encrypted with the app-level envelope key (ADR 0002), the rotation procedure has been tested, and the attendant PWA handles key rotation.
- [ ] [B] Vercel Firewall is active on every public project: custom WAF rules, bot protection, rate-limit rules on auth/booking/search, and the admin console restricted by IP allowlist + Deployment Protection.
- [ ] [R] SAST (CodeQL/Semgrep) and dependency scanning (Dependabot/`pnpm audit`) run in CI with no High findings.
- [ ] [R] Security headers (CSP, HSTS, frame-ancestors) are verified on every web app.
- [ ] [R] The security incident response runbook is written, and a tabletop exercise has been done once.

## 4. Data protection (see [doc 06](06%20-%20Data%20Storage%20Classification%20and%20Retention.md))

- [ ] [B] The privacy policy is published (web + in-app) and matches the actual data collected (it's cross-checked against the doc 06 inventory).
- [ ] [B] Consent capture is recorded with version, timestamp and channel. Marketing is opt-in only.
- [ ] [B] The DPIA (Data Protection Impact Assessment) is complete for location, plate and payment data, and signed by the DPO.
- [ ] [B] A DPO has been appointed (internal or outsourced), and the contact is published in the privacy policy.
- [ ] [B] NDPC registration status is decided by counsel (major-importance classification) and registration is filed if needed.
- [ ] [B] Account deletion works in-app **and** through the web URL (a Play Store requirement). The erasure job has been tested end to end.
- [ ] [B] The DSAR process has been tested: export, rectification and erasure each completed on a test account within the target time.
- [ ] [B] Logs and analytics events are scanned: no phone numbers, emails, OTPs, tokens, full plates or card data (an automated test plus a manual sample review).
- [ ] [R] Retention jobs are scheduled and dry-run on staging (doc 06 schedule).
- [ ] [R] Data processing agreements (DPAs) are signed with every sub-processor: Supabase, Vercel, Paystack, Termii, Google Maps, Sentry, Resend, Upstash, Better Stack, Expo (or their standard terms accepted and filed). The sub-processor list is published with the privacy policy.
- [ ] [R] The cross-border transfer basis (Supabase/Vercel region outside Nigeria, default London) is documented by counsel.

## 5. Payments

- [ ] [B] **Live** Paystack keys are in Vercel production env vars (Sensitive), never in Preview/dev. The live account has completed Paystack compliance and has been activated for split payments and refunds.
- [ ] [B] Splits are tested **live** with real small amounts across at least 3 real operator subaccounts. The operator received the correct net amount in their bank on T+1.
- [ ] [B] Every payment type has been tested live: `INITIAL`, `EXTENSION`, `OVERSTAY`, `PASS`, and full + partial refunds.
- [ ] [B] Every channel has been tested live: card, bank transfer, USSD (whichever are enabled).
- [ ] [B] **Reconciliation has run daily for 2 consecutive weeks on staging/pilot with zero unexplained mismatches.** Exceptions are documented and resolved.
- [ ] [B] Webhook handling is idempotent and order-independent (tested with replayed, duplicated and out-of-order events).
- [ ] [B] The late-success rule (payment succeeds after the hold expired) is implemented and tested: confirm if capacity allows, otherwise auto-refund + notify.
- [ ] [B] No code path stores a spendable balance for a driver. The `OUTSTANDING_BALANCE` flag is debt-only (confirmed in code review).
- [ ] [B] Counsel's written opinion confirms the payment structure (licensed gateway + split, no held funds) is compliant with CBN rules.
- [ ] [R] The secondary provider (Flutterwave) is integrated behind `PaymentProvider` and passes the contract tests in sandbox. A switch-over runbook exists.
- [ ] [R] Finance reports exist: daily GBV, commission, refunds, settlements, reconciliation exceptions.
- [ ] [R] Refund limits and alerts by role are configured (doc 03 §4.4).

## 6. Operations

- [ ] [B] **10–15 lots** are `LIVE` in the pilot node, each with an `APPROVED` permit (unexpired) and an `APPROVED` on-site verification. (Strategy minimum gate: ≥ 8 committed.)
- [ ] [B] Every live lot has ≥ 2 trained attendants with the PWA installed and logged in, and has done a dry-run shift (≥ 10 test check-ins/check-outs including one offline period).
- [ ] [B] Attendant training material exists: a 1-page laminated card (scan, lookup, colours, overrides, "never collect cash for overstay", who to call) plus a short video.
- [ ] [B] The support line is staffed (WhatsApp + phone) for all live lot opening hours during the pilot. The response-time target is published internally.
- [ ] [B] The on-call ops rota covers HIGH-severity incidents (safety/theft), with a 1-hour response.
- [ ] [B] These runbooks are written and rehearsed: payment provider outage; SMS provider outage; API down (attendant offline mode procedure); lot permit expired with active bookings; lot suspended with bookings (bulk refund); driver turned away at the gate; overstay dispute; lost/stolen attendant phone (revoke device); security incident; data breach notification.
- [ ] [B] Signed operator agreements exist for every live lot (commission %, settlement terms, obligations, liability, termination).
- [ ] [R] On-site signage is installed at partner lots ("Parkly verified — scan to book"), with the QR to the lot page.
- [ ] [R] The weekly incident review meeting is scheduled, with a template (strategy §8 "weekly review of incidents").
- [ ] [R] Baseline occupancy has been recorded for each pilot lot before launch (needed to measure impact).
- [ ] [N] An escalation contact at LASPA has been identified and the pilot discussed (strategy: "no surprises").

## 7. Legal

- [ ] [B] Driver Terms of Service are published and accepted in onboarding (versioned). They cover booking, cancellation, no-show, overstay, liability limits and the incident process.
- [ ] [B] The operator agreement is approved by counsel and signed by every pilot operator.
- [ ] [B] The privacy policy is approved by counsel (see §4).
- [ ] [B] Counsel's opinion covers: (a) the payments structure, (b) liability allocation for damage/theft (strategy and research cite *Anya v Imo*) and the wording of the "claims promise" in marketing, (c) data protection obligations.
- [ ] [B] Marketing copy makes **no insurance or guarantee claims** until an insurance partner is signed (`claims_enabled=false`). Counsel has reviewed the "verified" wording.
- [ ] [B] The company entity, the RC number and the support contact are shown on receipts and in the app.
- [ ] [R] Trademark search / filing for "Parkly" has started (doc 00 Q7).
- [ ] [R] Attendant data processing terms are in the operator agreement (operators are responsible for their staff's devices and conduct).

## 8. Observability and on-call

- [ ] [B] Sentry is live in every app, with release tracking and source maps / debug symbols uploaded.
- [ ] [B] Dashboards exist for: API latency/error rate per route; booking funnel; payment success rate; webhook lag; attendant sync lag and conflict rate; queue depth; DB CPU/connections; SMS delivery rate.
- [ ] [B] Alerts are routed to on-call (PagerDuty/Opsgenie or an SMS + Slack equivalent) for: API 5xx > 2% for 5 min; p95 latency > 1.5 s for 10 min; payment success rate < 90% for 30 min; webhook processing lag > 5 min; reconciliation mismatch; queue backlog > 1,000 for 10 min; SMS failure rate > 10%; DB storage > 80%; certificate expiry < 14 days.
- [ ] [B] The on-call rota is published (engineering), with escalation to the engineering lead. Every on-call engineer has prod read access and the runbooks.
- [ ] [B] Uptime checks run from an external location against the public API health endpoint and the web apps.
- [ ] [R] Structured logs carry a `request_id`/`trace_id` linking from the mobile app to the API to background jobs (`/internal/jobs/*`).
- [ ] [R] An internal status-update channel and driver-facing comms templates for outages exist.

## 9. Performance and reliability

- [ ] [B] A k6 load test on staging hits **10× the expected pilot peak** (assume 200 bookings/hour, 50 concurrent searches/s) with search p95 < 500 ms, booking create p95 < 800 ms, and an error rate < 0.5%.
- [ ] [B] Mobile cold start < 3 s and the ticket screen opens offline < 1 s on the reference low-end device.
- [ ] [B] Attendant PWA: QR scan to result < 1 s offline. It works for 8 h offline with ≥ 500 queued events and syncs them without loss (tested).
- [ ] [B] Backups: Supabase **PITR add-on** is enabled on `parkly-prod`, and the nightly encrypted off-platform `pg_dump` (+ Storage export) is running. **Both restores have been tested** (PITR to a timestamp; dump into a fresh Supabase project), with times recorded (RTO target ≤ 4 h, RPO ≤ 15 min).
- [ ] [B] Supabase and Vercel are on **Pro** plans (Vercel Hobby forbids commercial use). Supabase compute size chosen from the k6 results; Supavisor pool size checked against Vercel function concurrency; Vercel Functions region matches the DB region.
- [ ] [B] Every scheduled job (`pg_cron`) is listed, enabled on prod, idempotent, and finishes well inside the Vercel function time limit at 10× pilot volume; failed runs alert.
- [ ] [R] The web apps reach a Lighthouse performance score ≥ 80 on a mobile profile, slow 4G.
- [ ] [R] The driver app APK/AAB is < 40 MB download size.
- [ ] [R] Degraded-mode behaviour has been verified: Maps down (list-only), SMS down (push + in-app only), payments down (booking disabled with a clear message).

## 10. Accessibility

- [ ] [B] The driver app and web meet WCAG 2.2 AA for: colour contrast (doc 07 tokens validated), touch targets ≥ 48 dp, labels for screen readers (TalkBack tested on key flows), and no information shown by colour alone (attendant Green/Amber/Red results also use icons + text).
- [ ] [R] Dynamic font sizes up to 200% are supported without breaking the booking flow.
- [ ] [R] The portal and admin are keyboard-navigable, and axe-core in Playwright reports no serious/critical violations.
- [ ] [N] Sunlight-readability check of the attendant PWA in an outdoor test.

## 11. App store and distribution

- [ ] [B] The Google Play listing is complete: name, short and full description, screenshots (phone), feature graphic, category, contact email, privacy policy URL.
- [ ] [B] The Play **Data safety** form is filled in to match doc 06 (location, phone number, name, payment info handled by Paystack, device IDs, crash logs). It's been reviewed by the DPO.
- [ ] [B] The account-deletion URL is filled in on Play Console (`apps/web` `/account/delete`).
- [ ] [B] Content rating questionnaire done; target API level meets current Play requirements.
- [ ] [B] Internal testing → closed testing (pilot commuters) tracks used before production. Staged rollout plan: 10% → 50% → 100%.
- [ ] [B] App signing is managed by Play App Signing, and the upload key is stored safely (2 custodians).
- [ ] [R] EAS Update (OTA) channel per environment. A policy is written: OTA only for JS-only fixes, never for permission or native changes.
- [ ] [R] The attendant PWA installs from the portal ("Add to Home screen") and has been tested on the 3 most common attendant phone models.
- [ ] [N] iOS TestFlight build ready (iOS launch is not required for the pilot).

## 12. Rollback plan

- [ ] [B] API and web apps: Vercel **Instant Rollback** to the previous production deployment, rehearsed on staging. Migrations are applied by `supabase db push` before promotion and are backward compatible, so rolling back the code never requires a DB rollback.
- [ ] [B] Database: every pilot migration is backward compatible with the previous API version (expand → migrate → contract). There's no destructive migration in the launch release.
- [ ] [B] Mobile: kill-switch flags (`bookings_enabled`, `payments_enabled`, `min_supported_app_version`) are served by the API and honoured by the app (a forced-update screen).
- [ ] [B] Web apps: the previous build artefact stays available for instant redeploy.
- [ ] [B] Fallback to concierge mode is documented: if the platform must stop, ops takes bookings via WhatsApp + Paystack payment links and attendants use a printed list (strategy "concierge before software").
- [ ] [R] The comms templates for rollback exist (driver SMS, operator email).

## 13. Pilot success metrics and thresholds

These are measured from the doc 03 §6 events and reviewed weekly. Thresholds are **proposed defaults**: confirm or adjust them after discovery (strategy §10: "set numeric targets after the discovery phase"). Going below a threshold for 2 consecutive weeks triggers a review, not an automatic shutdown.

| Metric | Definition | Pilot threshold (proposed) | Strategy link |
|---|---|---|---|
| North Star | Paid, completed sessions per week at verified lots | Up week-on-week for 6 of the first 8 weeks | §1, §10 |
| Payment success rate | Succeeded ÷ (succeeded + failed + abandoned) | **≥ 95%** (alert < 90%) | §10 Operations |
| Booking conversion | `lot_viewed` → `booking_confirmed` | ≥ 15% | §10 Demand |
| Repeat rate (30 days) | Drivers with ≥ 2 bookings within 30 days of the first | ≥ 40% | §9 Pilot exit gate |
| Check-in failures | Rejected + conflicts ÷ check-in attempts | **≤ 2%** | §10 Operations |
| Attendant sync lag (p95) | `received_at − occurred_at` while online | ≤ 2 min | Reliability |
| Support first response | Time to first human reply (WhatsApp/phone) in support hours | **≤ 15 min median, ≤ 1 h p90**; HIGH-severity incidents ≤ 1 h | §10 Operations, §11 |
| Incident rate | Incidents per 1,000 sessions | Baseline in weeks 1–4, then set; **0 unresolved safety incidents** | §9 Pilot exit gate |
| Permit compliance | Share of live lots with a valid LASPA permit | **100%** | §10 Compliance |
| Reconciliation | Unexplained mismatches | **0** (any mismatch is resolved within 2 business days) | Finance |
| Uptime (API) | Monthly availability | ≥ 99.5% in pilot | Reliability |
| Contribution per booking | Avg booking value × take rate − payment cost − support cost | Measured, no target in pilot | §7 |

## 14. Launch-day and first-two-weeks plan

- [ ] [B] Launch-window freeze: no non-critical deploys 48 h before and 72 h after go-live.
- [ ] [B] A war-room channel is set up, with eng + ops + support present during peak hours (07:00–10:00, 16:00–20:00 WAT) for the first 5 business days.
- [ ] [B] A daily pilot review (15 min) runs for the first 2 weeks: metrics in §13, incidents, payment exceptions, attendant feedback.
- [ ] [R] A closed beta of ≥ 50 commuters (employer and building-manager channels) runs for ≥ 1 week before the node is opened publicly.

## 15. Go / no-go sign-off

The decision is taken in a go/no-go meeting at least 3 business days before the planned public launch. **Any "No" on a blocker area means no-go.**

| Area | Owner (role) | Blockers clear? | Waivers (ids) | Decision | Name | Date |
|---|---|---|---|---|---|---|
| Product (§1) | Product lead | ☐ | | Go / No-go | | |
| Engineering (§2, §9, §12) | Engineering lead | ☐ | | Go / No-go | | |
| Security (§3) | Security owner / eng lead | ☐ | none allowed | Go / No-go | | |
| Data protection (§4) | DPO | ☐ | none allowed | Go / No-go | | |
| Payments & finance (§5) | Finance lead | ☐ | none allowed | Go / No-go | | |
| Operations & support (§6, §14) | Operations lead | ☐ | | Go / No-go | | |
| Legal (§7) | Legal / compliance adviser | ☐ | none allowed | Go / No-go | | |
| Observability (§8) | Engineering lead | ☐ | | Go / No-go | | |
| Accessibility (§10) | Product lead | ☐ | | Go / No-go | | |
| App store (§11) | Engineering lead | ☐ | | Go / No-go | | |
| **Final** | **CEO / founder** | | | **Go / No-go** | | |
