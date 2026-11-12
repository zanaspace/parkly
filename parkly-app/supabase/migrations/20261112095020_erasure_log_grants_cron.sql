-- Hand-written. FR-AUTH-007, NFR-PRIV-001 (doc 06 sections 4, 6.1, 7).
-- The API role appends erasure_log rows and never edits or deletes them.
grant select, insert on public.erasure_log to parkly_api;

-- Account erasure: daily at 02:00 Lagos (01:00 UTC). Erases accounts whose 30-day
-- grace has passed. Idempotent, so a missed run is picked up the next day.
-- Needs the Vault secrets job_hmac_secret and api_base_url (doc 22 section 2.5);
-- without them fn_invoke_job logs a warning and does nothing.
select cron.schedule(
  'account-erasure',
  '0 1 * * *',
  $$select public.fn_invoke_job('account-erasure')$$
);

-- Retention purge: nightly at 03:00 Lagos (02:00 UTC): idempotency keys, the notification
-- log (90 days) and data export files (7 days).
select cron.schedule(
  'retention-purge',
  '0 2 * * *',
  $$select public.fn_invoke_job('retention-purge')$$
);
