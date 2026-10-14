-- Hand-written. Fixes from `supabase db advisors --type security` on parkly-dev.

-- 1. pg_net was created without a schema and landed in public (lint 0014).
--    pg_net does not support ALTER EXTENSION ... SET SCHEMA, so recreate it.
--    Its functions live in the `net` schema either way, so fn_invoke_job is unaffected.
--    Pending HTTP requests in its queue are dropped; acceptable for the ping job.
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end
$$;

-- 2. Hosted projects ship public.rls_auto_enable() (SECURITY DEFINER) for the
--    "auto-enable RLS" setting, executable by anon/authenticated via
--    /rest/v1/rpc (lints 0028/0029). Clients must never call it.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
