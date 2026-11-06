-- Hand-written. Sprint 7 task 3: provider settlements (doc 02 §2.7).
grant select, insert, update on public.settlements to parkly_api;

-- Hourly: the API lists Paystack settlements for Parkly's main account and
-- each operator subaccount, records them once and posts each paid-out one to
-- the ledger once. Needs the Vault secrets job_hmac_secret and api_base_url
-- (doc 22 §2.5); without them fn_invoke_job logs a warning and does nothing.
select cron.schedule(
  'settlements-sync',
  '41 * * * *',
  $$select public.fn_invoke_job('settlements-sync')$$
);
