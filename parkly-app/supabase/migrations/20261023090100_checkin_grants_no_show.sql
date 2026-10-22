-- Hand-written. Sprint 5 story 2: grants and triggers for sessions and check-in
-- events, the no-show job and late-arrival re-booking (doc 02 §2.6, §3.1, §9).

grant select, insert, update on public.sessions, public.lot_walk_ins to parkly_api;
grant select, insert on public.attendant_sync_batches to parkly_api;
-- Append-only: no UPDATE/DELETE grant, matching the RLS policies.
grant select, insert on public.checkin_events to parkly_api;

create trigger sessions_set_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();
create trigger lot_walk_ins_set_updated_at before update on public.lot_walk_ins
  for each row execute function public.set_updated_at();
create trigger checkin_events_append_only before update or delete on public.checkin_events
  for each row execute function public.fn_block_mutation();

-- The 15-minute slot that contains `t` (slots start on the quarter hour, UTC).
create or replace function public.fn_slot_floor(t timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select to_timestamp(floor(extract(epoch from t) / 900) * 900);
$$;

-- CONFIRMED bookings nobody checked in by start + `booking.no_show_grace_min`
-- (default 30) become NO_SHOW and give back their space from the current slot
-- to the end; earlier slots stay booked (doc 02 §3.1 "release remaining future
-- slots"). 500 per run, skipping rows another transaction holds.
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
     where bk.status = 'CONFIRMED'
       and bk.start_at < now() - make_interval(mins => grace)
       and not exists (
         select 1 from public.sessions s
          where s.booking_id = bk.id and s.check_in_at is not null)
     order by bk.start_at
     limit 500
       for update skip locked
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
-- space again from the arrival slot to the end. False, changing nothing, when
-- any of those slots is full.
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
  from_slot := greatest(b.start_at, public.fn_slot_floor(p_at));
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

revoke execute on function public.fn_slot_floor(timestamptz) from public, anon, authenticated;
revoke execute on function public.fn_mark_no_shows() from public, anon, authenticated;
revoke execute on function public.fn_rebook_no_show(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_slot_floor(timestamptz) to parkly_api;
grant execute on function public.fn_rebook_no_show(uuid, timestamptz) to parkly_api;

select cron.schedule('mark-no-shows', '*/5 * * * *', $$select public.fn_mark_no_shows()$$);

comment on table public.sessions is 'C3. One car''s stay for a booking: check-in, check-out, overstay.';
comment on table public.checkin_events is 'C3. Append-only attendant events with the server verdict.';
comment on table public.attendant_sync_batches is 'C2. One row per attendant sync call.';
comment on table public.lot_walk_ins is 'C1. Walk-ins currently inside, per lot (count only).';
