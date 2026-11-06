-- Hand-written. ADR 0023 stage 2: a driver who arrives early can pay to start
-- earlier when there is space. An early start is a booking_extensions row with
-- kind EARLY_START whose held window is [new start, booking start). It reuses
-- the extension machinery: one pending per booking, hold expiry
-- (fn_expire_holds), release (fn_release_extension, window based) and the
-- extension payment settle path.

-- Holds one space for [p_new_start_at, booking.start_at) on a paid booking whose
-- car is not in yet.
create function public.fn_hold_early_start(
  p_extension_id uuid,
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_price_kobo bigint,
  p_platform_amount_kobo bigint,
  p_operator_amount_kobo bigint,
  p_hold_expires_at timestamptz
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  bk record;
  previous uuid;
  bookable integer;
  full_slots integer;
begin
  select b.id, b.lot_id, b.start_at, b.status, b.vehicle_id
    into bk
    from public.bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only a paid booking whose car is not in: CHECKED_IN no longer needs it.
  if bk.status <> 'CONFIRMED' then
    raise exception 'BOOKING_NOT_EXTENDABLE' using errcode = 'P0001';
  end if;

  if p_new_start_at >= bk.start_at or extract(epoch from p_new_start_at)::bigint % 900 <> 0 then
    raise exception 'BOOKING_WINDOW_INVALID' using errcode = '22023';
  end if;

  select l.capacity_bookable into bookable
    from public.lots l
   where l.id = bk.lot_id and l.status = 'LIVE'
     for share;
  if not found then
    raise exception 'LOT_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  -- A new request replaces the driver's own unpaid one; holds never stack.
  for previous in
    select e.id from public.booking_extensions e
     where e.booking_id = bk.id and e.status = 'PENDING_PAYMENT'
  loop
    perform public.fn_release_extension(previous, 'EXPIRED');
  end loop;

  -- The same car cannot be in two live bookings at once.
  perform 1 from public.vehicles v where v.id = bk.vehicle_id for update;
  if exists (
    select 1 from public.bookings other
     where other.vehicle_id = bk.vehicle_id
       and other.id <> bk.id
       and other.status in ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       and other.start_at < bk.start_at and other.end_at > p_new_start_at
  ) then
    raise exception 'BOOKING_OVERLAP_SAME_VEHICLE' using errcode = 'P0001';
  end if;

  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select bk.lot_id, s, bookable
    from generate_series(p_new_start_at, bk.start_at - interval '15 minutes', interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = bk.lot_id and i.slot_start >= p_new_start_at and i.slot_start < bk.start_at
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = bk.lot_id and i.slot_start >= p_new_start_at and i.slot_start < bk.start_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.lot_slot_inventory i
     set held = i.held + 1
   where i.lot_id = bk.lot_id and i.slot_start >= p_new_start_at and i.slot_start < bk.start_at;

  insert into public.booking_extensions (
    id, booking_id, kind, start_at, new_end_at, added_minutes, price_kobo,
    platform_amount_kobo, operator_amount_kobo, status, hold_expires_at
  ) values (
    p_extension_id, p_booking_id, 'EARLY_START', p_new_start_at, bk.start_at,
    (extract(epoch from bk.start_at - p_new_start_at) / 60)::integer, p_price_kobo,
    p_platform_amount_kobo, p_operator_amount_kobo, 'PENDING_PAYMENT', p_hold_expires_at
  );

  return p_extension_id;
end;
$$;

-- Confirms an extension or an early start after payment: held -> booked, then
-- the booking ends later (EXTEND) or starts earlier (EARLY_START). Locks the
-- booking before the extension (the order settle uses). Raises when the
-- booking moved on (cancelled, checked in for an early start, or its edge is
-- no longer where the window meets it); the API then refunds the payment.
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
  select b.id, b.lot_id, b.status, b.start_at, b.end_at
    into bk
    from public.bookings b
   where b.id = (select e.booking_id from public.booking_extensions e where e.id = p_extension_id)
     for update;
  if not found then
    raise exception 'EXTENSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select e.id, e.booking_id, e.kind, e.start_at, e.new_end_at, e.price_kobo, e.status, e.payment_id
    into ext
    from public.booking_extensions e
   where e.id = p_extension_id
     for update;

  if ext.status <> 'PENDING_PAYMENT' then
    raise exception 'EXTENSION_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;
  if ext.kind = 'EARLY_START' then
    if bk.status <> 'CONFIRMED' or ext.new_end_at <> bk.start_at then
      raise exception 'EXTENSION_NOT_APPLICABLE' using errcode = 'P0001';
    end if;
  elsif bk.status not in ('CONFIRMED', 'CHECKED_IN') or ext.start_at <> bk.end_at then
    raise exception 'EXTENSION_NOT_APPLICABLE' using errcode = 'P0001';
  end if;
  if p_payment_id is not null and ext.payment_id is distinct from p_payment_id then
    raise exception 'EXTENSION_PAYMENT_MISMATCH' using errcode = 'P0001';
  end if;

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
         payment_id = coalesce(p_payment_id, payment_id),
         hold_expires_at = null,
         updated_at = now()
   where id = ext.id;

  if ext.kind = 'EARLY_START' then
    update public.bookings
       set start_at = ext.start_at,
           price_kobo = price_kobo + ext.price_kobo,
           total_kobo = total_kobo + ext.price_kobo,
           version = version + 1,
           updated_at = now()
     where id = bk.id;
  else
    update public.bookings
       set end_at = ext.new_end_at,
           price_kobo = price_kobo + ext.price_kobo,
           total_kobo = total_kobo + ext.price_kobo,
           version = version + 1,
           updated_at = now()
     where id = bk.id;
  end if;

  return bk.id;
end;
$$;

revoke execute on function public.fn_hold_early_start(uuid, uuid, timestamptz, bigint, bigint, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_hold_early_start(uuid, uuid, timestamptz, bigint, bigint, bigint, timestamptz)
  to parkly_api;
