-- Hand-written. Gap review G-4: no-shows were marked while the car was inside.
-- A gate phone with no network keeps check-ins in its queue; marking the
-- booking a no-show at start + grace freed and resold the space, and the late
-- re-booking then counted slots twice.
--
-- 1. No no-shows at a lot with no way to check in (no approved gate phone and
--    self check-in off): nobody there could have checked the car in.
-- 2. Every gate phone on shift (synced in the 12 hours before the deadline)
--    must have synced since the deadline; otherwise wait for the next run.
--    After 12 hours of silence the booking is marked anyway.
-- 3. Re-booking a no-show that did arrive takes only slots from now on: past
--    slots don't matter for capacity, and the no-show released from its own
--    run time, which is never later than now.

create or replace function public.fn_mark_no_shows()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  grace integer := coalesce(
    (select (s.value #>> '{}')::integer from public.platform_settings s
      where s.key = 'booking.no_show_grace_min'),
    30);
  b record;
  marked integer := 0;
begin
  for b in
    select bk.id, bk.lot_id, bk.start_at, bk.end_at
      from public.bookings bk
      join public.lots l on l.id = bk.lot_id
     where bk.status = 'CONFIRMED'
       and bk.start_at < now() - make_interval(mins => grace)
       and not exists (
         select 1 from public.sessions s
          where s.booking_id = bk.id and s.check_in_at is not null)
       -- (1) The lot has a way to check in.
       and (
         l.self_checkin_enabled
         or exists (
           select 1 from public.devices d
            where d.lot_id = bk.lot_id and d.approved_at is not null and d.revoked_at is null))
       -- (2) No gate phone on shift is still silent since the deadline.
       and (
         bk.start_at + make_interval(mins => grace) < now() - interval '12 hours'
         or not exists (
           select 1 from public.devices d
            where d.lot_id = bk.lot_id
              and d.approved_at is not null
              and d.revoked_at is null
              and exists (
                select 1 from public.attendant_sync_batches sb
                 where sb.device_id = d.id
                   and sb.server_received_at
                       > bk.start_at + make_interval(mins => grace) - interval '12 hours')
              and not exists (
                select 1 from public.attendant_sync_batches sb
                 where sb.device_id = d.id
                   and sb.server_received_at > bk.start_at + make_interval(mins => grace))))
     order by bk.start_at
     limit 500
       for update of bk skip locked
  loop
    update public.lot_slot_inventory i
       set booked = i.booked - 1
     where i.lot_id = b.lot_id
       and i.slot_start >= greatest(b.start_at, public.fn_slot_floor(now()))
       and i.slot_start < b.end_at;
    update public.bookings
       set status = 'NO_SHOW', version = version + 1, updated_at = now()
     where id = b.id;
    insert into public.booking_status_history (id, booking_id, from_status, to_status, actor_type, reason)
    values (public.uuid_v7(), b.id, 'CONFIRMED', 'NO_SHOW', 'SYSTEM', 'no_show.grace_over');
    marked := marked + 1;
  end loop;
  return marked;
end;
$$;

-- A NO_SHOW car turns up after all (doc 02 §3.1 NO_SHOW → CHECKED_IN): take a
-- space again from the current slot to the end. `p_at` (the arrival time) is
-- kept for callers; slots before now are not re-taken (G-4). False, changing
-- nothing, when any of those slots is full.
create or replace function public.fn_rebook_no_show(p_booking_id uuid, p_at timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  b record;
  from_slot timestamptz;
  full_slots integer;
begin
  select bk.lot_id, bk.start_at, bk.end_at, l.capacity_bookable into b
    from public.bookings bk
    join public.lots l on l.id = bk.lot_id
   where bk.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  from_slot := greatest(b.start_at, public.fn_slot_floor(now()));
  if from_slot >= b.end_at then
    return true;
  end if;

  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select b.lot_id, s, b.capacity_bookable
    from generate_series(from_slot, b.end_at - interval '15 minutes', interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = b.lot_id and i.slot_start >= from_slot and i.slot_start < b.end_at
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = b.lot_id and i.slot_start >= from_slot and i.slot_start < b.end_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    return false;
  end if;

  update public.lot_slot_inventory i
     set booked = i.booked + 1
   where i.lot_id = b.lot_id and i.slot_start >= from_slot and i.slot_start < b.end_at;
  return true;
end;
$$;

revoke execute on function public.fn_mark_no_shows() from public, anon, authenticated;
revoke execute on function public.fn_rebook_no_show(uuid, timestamptz) from public, anon, authenticated;

-- The silence check reads each gate phone's latest syncs.
create index if not exists attendant_sync_batches_device_received_idx
  on public.attendant_sync_batches (device_id, server_received_at);
