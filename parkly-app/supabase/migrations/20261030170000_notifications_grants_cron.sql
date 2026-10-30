-- Hand-written. Sprint 6 notifications (ADR 0020, gap review L-1).
-- The API owns the outbox; delete is for the 90-day retention job (doc 06).
grant select, insert, update, delete on public.notifications to parkly_api;

-- Send due notifications every minute; retries come due through next_attempt_at.
select cron.schedule(
  'deliver-notifications',
  '* * * * *',
  $$select public.fn_invoke_job('deliver-notifications')$$
);

-- Queue start (60 min) and end (15 min) reminders. The dedupe key makes reruns
-- harmless, so a missed run is caught by the next one.
select cron.schedule(
  'sweep-reminders',
  '*/5 * * * *',
  $$select public.fn_invoke_job('sweep-reminders')$$
);
