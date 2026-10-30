# 0019 — Cloudflare Turnstile on every sign-in request

- **Status:** Accepted (code shipped switched off; turned on per environment, see doc 22 §2.3b)
- **Date:** 2026-10-30
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 05 §4.1 (verify-attempts row)
- **Related:** gap review S-4; ADR 0015, ADR 0018 (email codes)

## Context

Gap review S-4 found the sign-in code controls weaker than doc 05 §4.1:

1. Email codes lasted an hour. This was fixed earlier: both email and SMS codes now last 5 minutes.
2. Code sends had no bot check. A script could use up a person's 10 SMS a day, or flood an inbox with email codes, at our cost.
3. Wrong codes were limited only per IP (30 per 5 minutes), not per phone.

Every app asks Supabase Auth directly to send and to check codes, using the public project URL and publishable key. So the API precheck (`/v1/auth/otp/precheck`) only helps honest clients: a script can call Supabase without it. Any control must run inside Supabase or a Supabase hook.

## Decision

1. **Supabase Auth captcha with Cloudflare Turnstile.** Supabase checks the token on every request that sends a code or signs in: `signInWithOtp` (phone and email), `signInWithPassword`, `signUp` and `resetPasswordForEmail`. A script without a valid token gets `captcha_failed`, and nothing is sent.
2. **Every sign-in screen shows the widget**: the portal (password, sign-up, reset, attendant code), the admin console (password, reset), the driver website (code) and the mobile app (email, phone and resend, through a WebView). A token works once, so the widget resets after each request.
3. **Off until configured.** Without a site key, no widget renders and no token is sent. The order to switch it on is in doc 22 §2.3b: set the site key in every app and ship the mobile build first, and only then turn captcha on in Supabase. Otherwise screens without a token stop working.
4. **`AUTH_CAPTCHA_FAILED`** gets its own message ("Please complete the security check, then try again."), so a failed check never reads as a wrong password.
5. **SMS limits stay in the Send SMS hook**, which every SMS passes through (3 per 15 minutes, 5 per hour, 10 per day per phone). Captcha now stands in front of them, so a script can't use them up for someone else.

## What we did not build, and why

**A per-phone counter of wrong codes**, as doc 05 §4.1 asked. Supabase has no hook on code checks, and apps check codes directly with Supabase. A counter in our API could simply be skipped. Moving every code check behind our API would still leave Supabase's own verify endpoint open to anyone with the public key.

The remaining risk is bounded by:
- 6-digit codes that expire in 5 minutes;
- Supabase's limit of 30 code checks per IP per 5 minutes;
- captcha on every send, so new codes can't be requested in bulk.

To guess one code, an attacker needs about 17,000 IP addresses working within its 5 minutes. We accept this for the pilot. We'll revisit it if Supabase adds a verify hook or a per-user verify limit.

## Consequences

- **Bots can't request codes or try passwords at scale**, and email and SMS costs are protected.
- **People see a security check before they get a code.** Turnstile usually passes without a click.
- **A Cloudflare account is needed** (free tier), with a widget listing the portal, admin and website hostnames.
- **The mobile app depends on Turnstile in a WebView**, loaded as if from a listed hostname (`EXPO_PUBLIC_TURNSTILE_ORIGIN`).
- **The web apps' CSP allows `challenges.cloudflare.com`** (scripts and frames) only when a site key is set.
