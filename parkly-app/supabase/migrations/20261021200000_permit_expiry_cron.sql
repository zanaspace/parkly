-- Hand-written. FR-LOT-007 permit reminders and auto-suspend (doc 01 §5.8).
-- Runs at 06:00, 07:00 and 08:00 Lagos (05–07 UTC). The job is idempotent, so
-- the later runs only pick up what an earlier run left (chunk limit or failure).
-- Needs the Vault secrets job_hmac_secret and api_base_url (doc 22 §2.5);
-- without them fn_invoke_job logs a warning and does nothing.
select cron.schedule(
  'permit-expiry-check',
  '0 5-7 * * *',
  $$select public.fn_invoke_job('permit-expiry-check')$$
);
