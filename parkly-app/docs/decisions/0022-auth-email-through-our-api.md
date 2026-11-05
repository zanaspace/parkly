# 0022 — Every auth email is rendered by our API and sent through Resend

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 22 §2.3a (Supabase email templates and custom SMTP are no longer used once the hook is on)
- **Related:** ADR 0015 (driver email codes), ADR 0018 (attendant email codes), ADR 0020 (notification email through Resend), doc 05 §4.1 (OTP limits)

## Context

Parkly sends two kinds of email:

- **Notifications** (booking confirmed, cancelled, reminders, receipts, team invites, permit expiry). Our API renders these and sends them through the `EmailProvider` (Resend) since ADR 0020.
- **Auth emails** (sign-in codes, password reset, operator signup confirmation, email change). Supabase Auth sends these itself, from templates pasted into its dashboard, through whatever SMTP server the dashboard names (Gmail with an app password on dev).

That split meant two senders, two looks, templates living in a dashboard rather than in git, and a mailbox password stored in Supabase. The product owner wants every email to go through Resend and look like Parkly, with nothing sent by Supabase.

## Decision

1. **Turn on Supabase's Send Email Hook** (HTTPS) pointing at `POST /hooks/supabase/send-email` on `parkly-api`. With the hook on, Supabase sends no email and ignores its SMTP settings and templates.
2. **The hook renders every auth email in the shared Parkly layout** (`apps/api/src/emails/layout.ts`), the same one the notification, invite and permit emails now use. The types it handles:
   - **Codes:** `magiclink`, `email`, `signup` (not an operator), `reauthentication`.
   - **Links:** `recovery`, `invite`, `email_change`, and operator `signup` (`operator_signup` in the user's metadata).
   - **Security notices:** any `*_notification` type, if those are enabled in Supabase.
   - **Anything else** is refused with 400, so a new Supabase type fails loudly instead of sending nothing.
3. **Links go through Supabase's `/auth/v1/verify`** with the token hash and the app's `redirect_to`, exactly as Supabase's own `{{ .ConfirmationURL }}` did. The portal and admin `/auth/confirm` routes are unchanged.
4. **Security rules match the SMS hook.**
   - The Standard Webhooks signature is checked against `SUPABASE_EMAIL_HOOK_SECRET`.
   - Codes and links are limited per account: 3 per 15 min, 5 per hour, 10 per day. The limit is keyed on the Supabase user id, so no address is stored. Security notices aren’t limited.
   - Logs carry only the action type, never the code, the token or the address.
5. **Config guards.**
   - Setting the hook secret outside local requires `EMAIL_PROVIDER=resend`. Otherwise codes would only be logged and nobody could sign in.
   - Prod requires the secret.
   - Without the secret the route answers 503.
6. Gmail SMTP and the Resend SMTP option are dropped. `supabase/templates/` is kept only for local Supabase with the hook off, where codes land in Inbucket.

## Consequences

- Auth email copy and design live in git, are tested, and match every other Parkly email.
- One sending domain, one provider and one place to see delivery (the Resend dashboard).
- Auth email now depends on `parkly-api` being up. If the API or Resend is down, Supabase gets a 502 and the user sees a "couldn't send" error and can retry. Before, Supabase's SMTP was a separate path.
- Supabase's "emails per hour" limit no longer applies to these emails. Our per-recipient limits replace it.
- Changing a template means a code change and deploy, not a dashboard edit.
