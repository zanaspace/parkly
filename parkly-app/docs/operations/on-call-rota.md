# On-Call Rota & Incident Escalation Runbook

> **Reference:** PRD §7 (`NFR-SUP-001`, `NFR-OBS-001`), Doc 05 §8 (Security Incident Response), Doc 20 Sprint 10  
> **SLA Targets:** P0/High: First response < 15 min, resolution plan < 1 hr · P1: < 4 hr · P2: < 24 hr  
> **On-Call Management Tool:** Better Stack Uptime & Incident Alerting

---

## 1. Severity Classifications & Response SLAs

| Severity | Definition | Examples | Response SLA | Target Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **P0 (Critical)** | Core service unavailable across multiple lots; data breach; payment gateway outage | API 500 spike > 5%; Paystack webhook failure spike; DB connection pool exhausted | **< 15 minutes** | < 2 hours |
| **P1 (High)** | Major feature failure affecting a specific lot; safety incident at gate; barrier stuck | Gate PWA unable to check in cars at a high-volume lot; Dojah identity verification timeout | **< 30 minutes** | < 4 hours |
| **P2 (Medium)** | Minor impairment with workaround available; non-critical notification delays | SMS confirmation delayed (driver has QR in app); receipt download error | **< 2 hours** | < 24 hours |
| **P3 (Low)** | Cosmetic bug, low-impact query slow down | Minor UI styling glitch on web; export report formatting | Next business day | Sprint triage |

---

## 2. On-Call Escalation Rota & Better Stack Configuration

### Escalation Path
```
Better Stack Monitor Triggers Alert
                │
                ▼
Level 1: Primary On-Call Engineer (Push notification + SMS)
       (Acknowledge within 10 minutes)
                │ (If unacknowledged)
                ▼
Level 2: Secondary On-Call (Lead Engineer) (Phone Call)
       (Acknowledge within 10 minutes)
                │ (If unacknowledged)
                ▼
Level 3: Head of Engineering & Operations (Phone Call)
```

---

## 3. Specific Outage Runbooks

### Runbook A: Primary Payment Gateway Outage (Paystack Down)
1. **Detection:** Better Stack alerts on `payment.init.error_rate > 5%` or Paystack status page confirms incident.
2. **Action:**
   * Switch the primary payment provider to **Flutterwave** (built and tested in Sprint 9).
   * Update feature flag in platform settings:
     ```bash
     pnpm --filter @parkly/api exec tsx scripts/set-flag.ts payment_provider flutterwave
     ```
   * Or update in Admin Console: `/settings/flags` -> `payment_provider` = `flutterwave`.
3. **Verification:**
   * In-flight Paystack checkouts continue to settle via `webhook_events`.
   * New checkout sessions initialize via Flutterwave split payment adapter.
4. **Recovery:** Once Paystack confirms full resolution, switch flag back to `paystack`.

---

### Runbook B: SMS Provider Outage (Termii Down)
1. **Detection:** Driver OTP delivery delay > 60s or Termii delivery failure rate > 10%.
2. **Action:**
   * System automatically falls back to **Email OTP** for users with an email address on file (ADR 0015).
   * Verify fallback in logs: `auth.otp.fallback_to_email`.
   * Direct drivers experiencing SMS delays to select "Send OTP via Email".

---

### Runbook C: Attendant PWA Offline Mode Verification
1. **Detection:** Attendant phone reports no internet connectivity.
2. **Action:**
   * The attendant PWA operates completely offline for up to 24 hours using cached local manifest (`/attend`).
   * No emergency action required unless the offline period exceeds 24 hours.
   * If local storage is corrupted, attendant uses supervisor hotline for manual plate lookups.
