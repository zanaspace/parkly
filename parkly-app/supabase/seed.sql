-- Local only (`supabase db reset`). Never runs against hosted projects.

-- Job wiring: must match JOB_HMAC_SECRET in apps/api/.env.
select vault.create_secret('local-dev-job-secret-change-me-0123456789', 'job_hmac_secret');
-- The API runs on the host; Supabase runs in Docker.
select vault.create_secret('http://host.docker.internal:4000', 'api_base_url');

-- Demo lots in Victoria Island arrive with Sprint 2 (operators, lots, permits).
