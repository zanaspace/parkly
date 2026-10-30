# 0020 — Notifications go through an outbox table, not pgmq

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 20 S6 task 6 ("`pgmq` `notifications` queue"); AGENTS.md §5 "Jobs" (pgmq for this queue)
- **Related:** gap review L-1, O-4; FR-NOT-001 to 003; doc 06 §2 (contact copies)

## Context

Gap review L-1 found that notifications did nothing in production:
- the reminder sweep read in-memory store fields, so Postgres gave it nothing;
- push tokens and contact details came from fields Postgres doesn't have;
- duplicate protection was an in-process `Set`, lost on every serverless call;
- nothing retried, nothing was scheduled, and only the sweep sent anything.

Doc 20 asked for a `pgmq` queue drained by a `pg_cron` job. FR-NOT-003 also asks for stored delivery status, retries with backoff, and 5 attempts. pgmq would need a status table beside it anyway, giving two places to keep in step.

A second gap: the `users` table had no phone or email, only lookup hashes, so no job could ever address an SMS or email.

## Decision

1. **One `notifications` table is both the queue and the delivery log.** Each row has:
   - a unique `dedupe_key` (for example `booking.confirmed:<booking id>`), so a duplicate webhook or a re-synced gate batch queues once;
   - `status`, `channels_done`, `attempts` and `next_attempt_at`.

   RLS is on, and only the API role has access. The `pgmq` `notifications` queue created in S0 stays unused.
2. **`deliver-notifications` runs every minute (pg_cron).** It claims due rows with `FOR UPDATE SKIP LOCKED`, leasing each for 5 minutes, so overlapping runs never send the same row.
   - It sends only the channels not yet delivered.
   - It retries failures after 1, 5, 25 and 120 minutes, then marks the row `FAILED` after the fifth attempt.
3. **Channels, per event:**
   - Push first.
   - SMS always for confirmations, cancellations, extensions and overstay; SMS for reminders only if push reached no device (FR-NOT-003).
   - Email for confirmations and cancellations.
   - A push to devices that are all unregistered is not retried.
4. **Quiet hours (22:00–07:00 Lagos)** hold non-critical events until 07:00. Today that is only "checked out — view your receipt"; every other event is time-bound.
5. **Who queues what:**
   - Settling a payment queues `booking.confirmed`, or `booking.extended` once per paid extension.
   - Cancelling queues `booking.cancelled`.
   - Gate sync and self check-in queue `session.checked_in` and `session.checked_out`; pricing an overstay queues `session.overstay_due`.
   - `sweep-reminders` (every 5 minutes) queues reminders 60 minutes before the start and 15 before the end. It also queues no-shows, which `fn_mark_no_shows` marks inside the database.
   - `notify` never throws, so a notification can't break the action that caused it.
6. **Contact copies.** Bootstrap stores the phone and email encrypted on `users` (`phone_enc`, `email_enc`), as doc 06 §2 allows. They are decrypted only at send time. The queued payload never holds a phone, email or token.
7. **Providers behind switches:**
   - `EMAIL_PROVIDER=resend` (with `RESEND_API_KEY` and `EMAIL_FROM`) or `log`.
   - `PUSH_PROVIDER=expo` or `fake`.
   - SMS stays as it was.
   - Prod refuses the log-only and fake options.
8. **Links in messages** go to `WEB_BASE_URL/bookings/<id>`; the old `parkly.ng/b/…` links didn't exist. Invite emails link to `PORTAL_BASE_URL/invite/<token>`.
9. **Team invites are emailed directly, not queued:** the link is a credential and is never stored. The API reports `emailed: true` only when a real email left.

## Consequences

- **Delivery survives** cold starts, duplicates and provider outages, and each message's status can be queried.
- **One table to watch** for "stuck" notifications: `status = 'PENDING' and attempts >= 3`.
- **Retention:** rows are kept 90 days (doc 06). The retention job is S8 (gap review O-8).
- **Erasure (DSAR, S8)** must clear `users.phone_enc` and `users.email_enc` along with the hashes.
- **The mobile app registers its Expo push token after sign-in.** Expo Go can't get tokens on Android, so testing push needs a development or EAS build.
- **Not built:** notification preferences (FR-NOT-004, P1), operator digests and admin alerts (S7–S8).
