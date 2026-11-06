-- Hand-written. Sprint 7 task 5: monthly statements (FR-OPS-006, doc 20).
-- Monthly on the 1st at 07:00 WAT (06:00 UTC): generates and emails monthly statements to operator owners.
select cron.schedule(
  'monthly-statements',
  '0 6 1 * *',
  $$select public.fn_invoke_job('monthly-statements')$$
);
