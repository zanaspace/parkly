-- Hand-written. Sprint 4 story 5: the expire-holds SQL job (doc 02 §9).
-- Every minute: unpaid holds past hold_expires_at become EXPIRED and give their
-- space back; checkouts with no success 30 minutes after they opened become
-- ABANDONED (doc 02 §3.2); idempotency keys older than 48 hours are purged.
-- Chunked (500 per run) and safe to run twice: SKIP LOCKED leaves rows a
-- concurrent payment confirmation is holding to that confirmation.
-- NO_SHOW marking waits for check-in (Sprint 5).
create or replace function public.fn_expire_holds()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  b record;
  expired integer := 0;
  abandoned integer := 0;
  purged integer := 0;
begin
  for b in
    select bk.id
      from public.bookings bk
     where bk.status = 'PENDING_PAYMENT' and bk.hold_expires_at < now()
     order by bk.hold_expires_at
     limit 500
       for update skip locked
  loop
    perform public.fn_release_slots(b.id, 'held');
    update public.bookings
       set status = 'EXPIRED', hold_expires_at = null, version = version + 1, updated_at = now()
     where id = b.id;
    insert into public.booking_status_history (id, booking_id, from_status, to_status, actor_type, reason)
    values (public.uuid_v7(), b.id, 'PENDING_PAYMENT', 'EXPIRED', 'SYSTEM', 'hold.expired');
    -- A checkout that never opened can no longer be paid.
    update public.payments
       set status = 'FAILED', failure_code = 'hold.expired', updated_at = now()
     where booking_id = b.id and status = 'INITIATED';
    expired := expired + 1;
  end loop;

  with stale as (
    select p.id
      from public.payments p
     where p.status = 'PENDING' and p.created_at < now() - interval '30 minutes'
     order by p.created_at
     limit 500
       for update skip locked
  )
  update public.payments p
     set status = 'ABANDONED', updated_at = now()
    from stale
   where p.id = stale.id;
  get diagnostics abandoned = row_count;

  delete from public.idempotency_keys k
   where k.ctid in (
     select ik.ctid from public.idempotency_keys ik where ik.expires_at < now() limit 500
   );
  get diagnostics purged = row_count;

  return jsonb_build_object('expired', expired, 'abandoned', abandoned, 'purged', purged);
end;
$$;

revoke execute on function public.fn_expire_holds() from public, anon, authenticated;

select cron.schedule('expire-holds', '* * * * *', $$select public.fn_expire_holds()$$);
