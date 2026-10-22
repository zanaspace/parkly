-- Hand-written. Sprint 4: the payment safety net (doc 02 §7.6, §9). Every
-- minute the API retries failed Paystack webhooks and asks Paystack about
-- checkouts still open after two minutes. Needs the Vault secrets
-- job_hmac_secret and api_base_url (doc 22 §2.5); without them
-- fn_invoke_job logs a warning and does nothing.
select cron.schedule(
  'settle-payments',
  '* * * * *',
  $$select public.fn_invoke_job('settle-payments')$$
);
