# 0018 — Attendants sign in with an email code until SMS is live

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 03 §2.3 and A-01; doc 05 §4.4; PRD FR-AUTH-004 (attendant line, temporary)
- **Related:** ADR 0015 (drivers sign in with an email code), ADR 0005 (attendant PWA)

## Context

Attendants were meant to sign in to the gate app with their phone and an SMS code, then set a 6-digit PIN (doc 05 §4.4). SMS isn't live (ADR 0015), so an attendant invited by phone had no way in:

- the invite link was shared by hand, and no SMS ever arrived;
- the invite page told attendants to "accept in the app" but offered no sign-in;
- the gate app sent them to the email and password sign-in, which attendants don't have.

## Decision

1. **Attendants sign in with a 6-digit code sent by email**, the same way drivers do (ADR 0015). "Use a phone number instead" stays: it works now for Supabase test numbers and becomes the main route when SMS is live.
2. **The invite page signs them in and accepts in one step.** An attendant enters the invited email or phone, enters the code, and the portal calls `/v1/auth/invites/accept`. The API checks the signed-in email or phone against the invite, as before. On a mismatch the portal signs them out so they can try the right contact.
3. **The gate app's sign-in is the code sign-in** (`/sign-in/code`). Owners and managers can still use their password there.
4. **Managers invite attendants by email for now.** The invite form says that a phone number needs SMS codes.
5. Nothing changes after sign-in: a manager still approves the phone, and the attendant still sets a PIN.

## Consequences

- **Attendants can be invited and signed in today, at no SMS cost.**
- **Attendants without email** must wait for SMS, or use a work email the business sets up.
- **An owner or manager can also get a code by email.** That session is aal1, so the portal still asks for MFA and the API refuses actions that need aal2 (doc 05 §5.2 rule 7). An email code is no weaker than the password-reset email that already exists.
- **Phone sign-ups also get the DRIVER role** from the database trigger. Roles are additive (doc 03 §2.3), so this is allowed.
- **When SMS goes live:** make phone the default on the invite and sign-in forms and the invite helper text; no API change is needed.
