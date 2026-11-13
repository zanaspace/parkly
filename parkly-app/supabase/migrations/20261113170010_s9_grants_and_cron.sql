-- Sprint 9: Grants for parkly_api and pg_cron schedules for pass-reminders and retry-webhooks.

grant select, insert, update, delete on table
  public.driver_verifications,
  public.passes,
  public.pass_waitlist
to parkly_api;

do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and exists (select 1 from pg_proc where proname = 'call_api_job')
  then
    -- Daily 07:00 UTC (08:00 Lagos): expire passes past period_end and send 7d / 2d renewal reminders.
    perform cron.schedule(
      'pass-reminders',
      '0 7 * * *',
      $$select private.call_api_job('pass-reminders')$$
    );

    -- Every 5 minutes: retry webhook_events left PENDING or FAILED (with backoff).
    perform cron.schedule(
      'retry-webhooks',
      '*/5 * * * *',
      $$select private.call_api_job('retry-webhooks')$$
    );
  end if;
end
$cron$;
