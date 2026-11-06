-- Hand-written. Sprint 7 task 4: daily reconciliation (doc 02 §2.7).
grant select, insert, update on public.reconciliation_runs to parkly_api;
grant select, insert, update on public.reconciliation_items to parkly_api;

create trigger reconciliation_runs_set_updated_at before update on public.reconciliation_runs
  for each row execute function public.set_updated_at();

-- Daily at 07:00 WAT (06:00 UTC): reconciles previous day's provider charges vs payments & ledger.
select cron.schedule(
  'reconcile-payments',
  '0 6 * * *',
  $$select public.fn_invoke_job('reconcile-payments')$$
);
