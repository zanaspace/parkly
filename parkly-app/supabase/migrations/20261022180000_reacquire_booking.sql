-- Hand-written. Sprint 4 story 3: money arrived after a hold expired (doc 01 §5.2
-- edge cases). If every slot of the window still has a free space, book it
-- straight away (booked += 1, there is no hold to convert) and return true;
-- otherwise change nothing and return false, and the payment is refunded.
create or replace function public.fn_reacquire_booking(p_booking_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  b record;
  full_slots integer;
begin
  select bk.lot_id, bk.start_at, bk.end_at, l.capacity_bookable into b
    from public.bookings bk
    join public.lots l on l.id = bk.lot_id
   where bk.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select b.lot_id, s, b.capacity_bookable
    from generate_series(b.start_at, b.end_at - interval '15 minutes', interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = b.lot_id and i.slot_start >= b.start_at and i.slot_start < b.end_at
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = b.lot_id and i.slot_start >= b.start_at and i.slot_start < b.end_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    return false;
  end if;

  update public.lot_slot_inventory i
     set booked = i.booked + 1
   where i.lot_id = b.lot_id and i.slot_start >= b.start_at and i.slot_start < b.end_at;
  return true;
end;
$$;

revoke execute on function public.fn_reacquire_booking(uuid) from public, anon, authenticated;
grant execute on function public.fn_reacquire_booking(uuid) to parkly_api;
