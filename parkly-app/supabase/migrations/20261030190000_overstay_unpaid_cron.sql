-- Hand-written. Sprint 6, gap review L-4 (FR-BOOK-008): an overstay still due
-- 24 hours after check-out becomes UNPAID, which blocks the driver's new
-- bookings until they pay it or ops waive it. PAID and WAIVED are final.
create or replace function public.fn_mark_overstay_unpaid()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  update public.sessions
     set overstay_status = 'UNPAID',
         updated_at = now()
   where overstay_status = 'DUE'
     and check_out_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.fn_mark_overstay_unpaid() from public, anon, authenticated;

-- Hourly: a driver is blocked at most an hour after the 24 hours run out.
select cron.schedule('mark-overstay-unpaid', '7 * * * *', $$select public.fn_mark_overstay_unpaid()$$);

-- The blocking check reads a driver's UNPAID sessions on every new booking.
create index if not exists sessions_overstay_unpaid_idx
  on public.sessions (booking_id)
  where overstay_status = 'UNPAID';
