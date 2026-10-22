# 0015 — Drivers sign in with an email code until SMS is live

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 00 §3 "Auth" and "SMS / OTP" lines; PRD FR-AUTH-001 (temporary)
- **Related:** ADR 0002 (Supabase Auth), doc 05 §4.1, doc 22 §2

## Context

Drivers sign in with a phone number and an SMS code (FR-AUTH-001). The reasons are still valid:
- the phone is how Lagos drivers identify themselves
- no passwords
- a SIM is tied to a real person
- SMS is the fallback for booking codes
- attendants have phones, not email

Real SMS needs a provider with a Nigerian sender ID and a DND route. Termii approval takes weeks and its minimum spend was judged too high for the pilot (2026-10-22). Until then, only Supabase test numbers can sign in, which blocks real testers.

## Decision

1. **Drivers sign in with a 6-digit code sent by email**, on the app and on the website. "Use a phone number instead" stays available, for test numbers now and for SMS later.
2. **Supabase Auth sends and checks the code** (`signInWithOtp({ email })`, `verifyOtp({ type: 'email' })`). Its email template carries `{{ .Token }}`, and a real email sender is set as custom SMTP (doc 22): Supabase's built-in sender is for development only.
3. **Driver role:**
   - Phone sign-ups still get the DRIVER role from the database trigger.
   - Email sign-ups get it when a driver app calls `POST /v1/auth/bootstrap` with `asDriver: true`.
   - Operators also sign up by email, so the role is never given from the email alone.
   - DRIVER only allows acting on one's own bookings, profile and vehicles, so self-service is safe, as it is for phone sign-ups.
4. **The SMS path is unchanged:** the Send SMS hook, the `SmsProvider` interface and the Termii adapter remain. Any SMS provider can replace Termii behind `SmsProvider` (one adapter) when a cheaper one is chosen.

## Consequences

- **Testers can sign in today at no SMS cost.**
- **Some drivers rarely check email:** the code expires after 1 hour (Supabase default) to allow for slow inboxes, and SMS returns as the main route when a provider is live.
- **One person could create several accounts** with different emails. The per-device and per-driver hold limits (doc 05 §3) still apply.
- **Dropping email later:** the driver's email stays the login for their account. When SMS goes live, drivers can add a phone in their profile (S6/S8 "change contact"), and the email option can be hidden behind a flag.
- **Docs:** doc 00 §3 and the PRD FR-AUTH-001 note point here.
