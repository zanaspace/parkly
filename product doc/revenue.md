Before you turn it on
- Allowlist: set ADMIN_IP_ALLOWLIST on both parkly-api and parkly-admin. Test it from a phone off the office network. Setting it wrong locks you out of the console, so keep a way to change the Vercel variable.
- Hobby plan: this is the only network lock available there, because the Vercel Firewall allowlist needs a paid plan.
- Step-up on staging: the first time you use one of those actions after signing in, you may see "Confirm now" even though you just signed in, if the TOTP check was more than 5 minutes ago. Enter a fresh code and it goes through.