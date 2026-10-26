-- Hand-written. Sprint 6 story 2: lifecycle SQL functions for extension, cancel, and overstay (doc 02 §4, §5, FR-BOOK-005, FR-BOOK-006, FR-BOOK-008).

-- Holds one space for an extension window [booking.end_at, p_new_end_at).
create or replace function public.fn_hold_extension(
  p_extension_id uuid,
  p_booking_id uuid,
  p_new_end_at timestamptz,
  p_price_kobo bigint,
  p_platform_amount_kobo bigint,
  p_operator_amount_kobo bigint
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  bk record;
  bookable integer;
  full_slots integer;
  added_mins integer;
begin
  select b.id, b.lot_id, b.end_at, b.status, b.vehicle_id
    into bk
    from public.bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if bk.status not in ('CONFIRMED', 'CHECKED_IN') then
    raise exception 'BOOKING_NOT_EXTENDABLE' using errcode = 'P0001';
  end if;

  if p_new_end_at <= bk.end_at or extract(epoch from p_new_end_at)::bigint % 900 <> 0 then
    raise exception 'BOOKING_WINDOW_INVALID' using errcode = '22023';
  end if;

  select l.capacity_bookable into bookable
    from public.lots l
   where l.id = bk.lot_id and l.status = 'LIVE'
     for share;
  if not found then
    raise exception 'LOT_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  -- Lock the vehicle row to prevent concurrent extensions/holds
  perform 1 from public.vehicles v where v.id = bk.vehicle_id for update;

  -- Materialise slot rows for the extension window
  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select bk.lot_id, s, bookable
    from generate_series(bk.end_at, p_new_end_at - interval '15 minutes', interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  -- Ordered locking on extension slots
  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at
    order by i.slot_start
      for update;

  -- Check capacity
  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Reserve space in held
  update public.lot_slot_inventory i
     set held = i.held + 1
   where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at;

  added_mins := (extract(epoch from p_new_end_at - bk.end_at) / 60)::integer;

  insert into public.booking_extensions (
    id, booking_id, start_at, new_end_at, added_minutes, price_kobo,
    platform_amount_kobo, operator_amount_kobo, status
  ) values (
    p_extension_id, p_booking_id, bk.end_at, p_new_end_at, added_mins, p_price_kobo,
    p_platform_amount_kobo, p_operator_amount_kobo, 'PENDING_PAYMENT'
  );

  return p_extension_id;
end;
$$;

-- Confirms an extension after payment succeeds: moves held -> booked and advances booking end_at.
create or replace function public.fn_confirm_extension(
  p_extension_id uuid,
  p_payment_id uuid
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  ext record;
  bk record;
  slots integer;
  moved integer;
begin
  select e.id, e.booking_id, e.start_at, e.new_end_at, e.price_kobo, e.status
    into ext
    from public.booking_extensions e
   where e.id = p_extension_id
     for update;
  if not found then
    raise exception 'EXTENSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if ext.status <> 'PENDING_PAYMENT' then
    raise exception 'EXTENSION_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;

  select b.id, b.lot_id, b.status, b.end_at, b.price_kobo, b.total_kobo
    into bk
    from public.bookings b
   where b.id = ext.booking_id
     for update;

  -- Move extension slots from held to booked
  slots := (extract(epoch from ext.new_end_at - ext.start_at) / 900)::integer;

  with locked as (
    select i.lot_id, i.slot_start
      from public.lot_slot_inventory i
     where i.lot_id = bk.lot_id and i.slot_start >= ext.start_at and i.slot_start < ext.new_end_at
     order by i.slot_start
       for update
  )
  update public.lot_slot_inventory i
     set held = i.held - 1,
         booked = i.booked + 1
    from locked
   where i.lot_id = locked.lot_id and i.slot_start = locked.slot_start;
  get diagnostics moved = row_count;

  if moved <> slots then
    raise exception 'extension % covers % slots but % inventory rows were moved', p_extension_id, slots, moved
      using errcode = 'check_violation';
  end if;

  update public.booking_extensions
     set status = 'CONFIRMED',
         payment_id = p_payment_id,
         updated_at = now()
   where id = ext.id;

  update public.bookings
     set end_at = ext.new_end_at,
         price_kobo = price_kobo + ext.price_kobo,
         total_kobo = total_kobo + ext.price_kobo,
         version = version + 1,
         updated_at = now()
   where id = bk.id;

  return bk.id;
end;
$$;

-- Cancels a booking, releases its slots (booked or held), and records the status transition.
create or replace function public.fn_cancel_booking(
  p_booking_id uuid,
  p_actor public.booking_actor,
  p_actor_id uuid,
  p_reason text
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  bk record;
begin
  select b.id, b.status
    into bk
    from public.bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if bk.status not in ('PENDING_PAYMENT', 'CONFIRMED') then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  -- Release slots according to previous status
  if bk.status = 'CONFIRMED' then
    perform public.fn_release_slots(p_booking_id, 'booked');
  elsif bk.status = 'PENDING_PAYMENT' then
    perform public.fn_release_slots(p_booking_id, 'held');
  end if;

  update public.bookings
     set status = 'CANCELLED',
         version = version + 1,
         updated_at = now()
   where id = p_booking_id;

  insert into public.booking_status_history (
    id, booking_id, from_status, to_status, actor_type, actor_id, reason
  ) values (
    public.uuid_v7(), p_booking_id, bk.status, 'CANCELLED', p_actor, p_actor_id, p_reason
  );

  return p_booking_id;
end;
$$;

-- Marks a session's overstay as PAID once payment succeeds.
create or replace function public.fn_mark_overstay_paid(
  p_booking_id uuid
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  s record;
begin
  select id into s from public.sessions where booking_id = p_booking_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.sessions
     set overstay_status = 'PAID',
         updated_at = now()
   where id = s.id;

  return s.id;
end;
$$;

-- Security: parkly_api only; revoke from public, anon, authenticated.
revoke execute on function public.fn_hold_extension(uuid, uuid, timestamptz, bigint, bigint, bigint)
  from public, anon, authenticated;
revoke execute on function public.fn_confirm_extension(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.fn_cancel_booking(uuid, public.booking_actor, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.fn_mark_overstay_paid(uuid)
  from public, anon, authenticated;

grant execute on function public.fn_hold_extension(uuid, uuid, timestamptz, bigint, bigint, bigint)
  to parkly_api;
grant execute on function public.fn_confirm_extension(uuid, uuid)
  to parkly_api;
grant execute on function public.fn_cancel_booking(uuid, public.booking_actor, uuid, text)
  to parkly_api;
grant execute on function public.fn_mark_overstay_paid(uuid)
  to parkly_api;
