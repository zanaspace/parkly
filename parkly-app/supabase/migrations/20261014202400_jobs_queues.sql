-- Hand-written. Jobs skeleton (doc 01 §jobs, doc 02 §6.10).
-- pg_cron → fn_invoke_job → pg_net POST /internal/jobs/:job, HMAC-signed.
-- Vault holds `job_hmac_secret` and `api_base_url` per environment
-- (seed.sql sets local values; hosted values are set by the runbook).

-- Work queues used by later sprints.
select pgmq.create('outbox');
select pgmq.create('notifications');
select pgmq.create('reconciliation');

create or replace function public.fn_invoke_job(job text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  base_url text;
  ts text := extract(epoch from now())::bigint::text;
  signature text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'job_hmac_secret';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'api_base_url';
  if secret is null or base_url is null then
    raise warning 'fn_invoke_job(%): vault secrets missing, skipping', job;
    return null;
  end if;

  -- pg_net sends body::text, so the MAC is computed over exactly what is sent.
  signature := encode(extensions.hmac(job || '.' || ts || '.' || body::text, secret, 'sha256'), 'hex');

  return net.http_post(
    url := base_url || '/internal/jobs/' || job,
    body := body,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-parkly-job-id', gen_random_uuid()::text,
      'x-parkly-job-timestamp', ts,
      'x-parkly-job-signature', signature
    ),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function public.fn_invoke_job(text, jsonb) from public, anon, authenticated;

-- Proves the wiring end to end; real schedules arrive with their sprints.
select cron.schedule('job-ping', '*/5 * * * *', $$select public.fn_invoke_job('ping')$$);
