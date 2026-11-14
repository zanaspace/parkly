# Vercel WAF & Firewall Configuration Specification

> **Reference:** PRD §7 (`NFR-SEC-001`, `NFR-SEC-002`), Doc 05 §4 (Network Security), Doc 17 §3 (Security Checklist)  
> **Target Projects:** `parkly-api`, `parkly-admin`, `parkly-portal`, `parkly-web`

---

## 1. Global WAF Rules (Applied Across All Production Projects)

1. **Bot Protection & Managed Rules:**
   * Enable **Vercel Managed Ruleset** (OWASP Top 10 mitigation: SQL injection, cross-site scripting, path traversal).
   * Enable **Bot Detection / Challenge**: Automated scrapers and headless clients targeting public search are presented with Cloudflare Turnstile managed challenges.
2. **Security Headers Enforced (Edge Middleware):**
   * `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   * `X-Content-Type-Options: nosniff`
   * `X-Frame-Options: DENY`
   * `Referrer-Policy: no-referrer`
   * `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline';`

---

## 2. API Rate Limiting Rules (`parkly-api`)

| Route Pattern | Method | Rate Limit Window | Max Requests | Action |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/auth/otp/request` | `POST` | 1 minute | 3 per IP/Phone | 429 Too Many Requests |
| `/v1/auth/otp/verify` | `POST` | 1 minute | 5 per IP/Phone | 429 Too Many Requests |
| `/v1/bookings` | `POST` | 1 minute | 30 per User/IP | 429 (Idempotent replay exempted) |
| `/v1/discovery/search` | `GET` | 1 minute | 60 per IP | Managed Challenge |
| `/v1/webhooks/*` | `POST` | 1 minute | Unlimited | Verified via HMAC signature |

---

## 3. Admin Console Isolation (`parkly-admin`)

1. **IP Allowlist Enforcement:**
   * Restrict access to `/` and all sub-routes to authorized Parkly office IPs and VPN exit gateways:
     * Rule: `ip.src not in {$PARKLY_OFFICE_IPS, $PARKLY_VPN_IPS} -> Action: Deny (403 Forbidden)`.
2. **Deployment Protection:**
   * Vercel Authentication enabled for Preview deployments.
3. **MFA Requirement:**
   * Supabase Auth `aal2` (TOTP MFA) strictly enforced for all admin sessions.
