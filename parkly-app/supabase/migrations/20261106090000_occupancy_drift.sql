-- Hand-written. Sprint 7, gap review G-9: occupancy drifted. A car whose
-- check-out was never scanned counted as parked forever, and the walk-in count
-- (walk-ins are counted, not tracked car by car) never went back to zero.
--
-- 1. fn_close_stale_sessions (hourly): a session checked in, not out, whose
--    booking ended more than 12 hours ago is closed AT THE BOOKING'S END and
--    flagged AUTO_CLOSED. Closing at the end charges no overstay: nobody knows
--    when the car left. The booking moves CHECKED_IN → COMPLETED (SYSTEM).
--    It waits, like fn_mark_no_shows (G-4), while a gate phone on shift has not
--    synced since the cutoff, because the real check-out may be in its queue;
--    after a further 12 hours of silence it closes anyway. A real check-out
--    that syncs later still wins ("latest check-out wins", doc 01 §5.3) and is
--    priced for overstay as usual.
-- 2. fn_reset_walk_ins (03:00 Lagos): walk-in counts go back to zero.

create or replace function public.fn_close_stale_sessions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  s record;
  closed integer := 0;
begin
  for s in
    select se.id as session_id, bk.id as booking_id, bk.end_at, bk.status
      from public.sessions se
      join public.bookings bk on bk.id = se.booking_id
     where se.check_in_at is not null
       and se.check_out_at is null
       and bk.end_at < now() - interval '12 hours'
       and (
         bk.end_at < now() - interval '24 hours'
         or not exists (
           select 1 from public.devices d
            where d.lot_id = se.lot_id
              and d.approved_at is not null
              and d.revoked_at is null
              -- On shift: synced in the 12 hours before the booking ended.
              and exists (
                select 1 from public.attendant_sync_batches sb
                 where sb.device_id = d.id
                   and sb.server_received_at > bk.end_at - interval '12 hours')
              -- Silent since the cutoff.
              and not exists (
                select 1 from public.attendant_sync_batches sb
                 where sb.device_id = d.id
                   and sb.server_received_at > bk.end_at + interval '12 hours')))
     order by bk.end_at
     limit 500
       for update of se, bk skip locked
  loop
    update public.sessions
       set check_out_at = greatest(s.end_at, check_in_at),
           flags = case when 'AUTO_CLOSED' = any(flags) then flags else array_append(flags, 'AUTO_CLOSED') end,
           version = version + 1,
           updated_at = now()
     where id = s.session_id;
    if s.status = 'CHECKED_IN' then
      update public.bookings
         set status = 'COMPLETED', version = version + 1, updated_at = now()
       where id = s.booking_id;
      insert into public.booking_status_history (id, booking_id, from_status, to_status, actor_type, reason)
      values (public.uuid_v7(), s.booking_id, 'CHECKED_IN', 'COMPLETED', 'SYSTEM', 'checkout.auto_closed');
    end if;
    closed := closed + 1;
  end loop;
  return closed;
end;
$$;

create or replace function public.fn_reset_walk_ins()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  update public.lot_walk_ins set count = 0, updated_at = now() where count > 0;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.fn_close_stale_sessions() from public, anon, authenticated;
revoke execute on function public.fn_reset_walk_ins() from public, anon, authenticated;

select cron.schedule('close-stale-sessions', '23 * * * *', $$select public.fn_close_stale_sessions()$$);
-- 02:00 UTC is 03:00 in Lagos (UTC+1, no daylight saving).
select cron.schedule('reset-walk-ins', '0 2 * * *', $$select public.fn_reset_walk_ins()$$);

-- The sweep reads open sessions only.
create index if not exists sessions_open_idx
  on public.sessions (booking_id)
  where check_in_at is not null and check_out_at is null;
