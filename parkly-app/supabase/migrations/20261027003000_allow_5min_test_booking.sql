-- Migration: 20261027003000_allow_5min_test_booking.sql
-- Allow 5-minute test bookings for rapid lifecycle and overstay testing

create or replace function public.fn_hold_booking(
  p_booking_id uuid,
  p_code text,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_plate_norm text,
  p_lot_id uuid,
  p_product public.product,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_hold_expires_at timestamptz,
  p_price_kobo bigint,
  p_service_fee_kobo bigint,
  p_commission_bps integer,
  p_rate_plan_id uuid,
  p_pricing_breakdown jsonb,
  p_source public.booking_source
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  bookable integer;
  full_slots integer;
begin
  if p_end_at <= p_start_at
     or extract(epoch from p_start_at)::bigint % 900 <> 0
     or (extract(epoch from p_end_at)::bigint % 900 <> 0 and extract(epoch from (p_end_at - p_start_at))::bigint <> 300) then
    raise exception 'BOOKING_WINDOW_INVALID' using errcode = '22023';
  end if;

  select l.capacity_bookable into bookable
    from public.lots l
   where l.id = p_lot_id and l.status = 'LIVE'
     for share;
  if not found then
    raise exception 'LOT_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  -- One live booking per vehicle at a time. Locking the vehicle row makes two
  -- concurrent requests for the same car (even at different lots) take turns.
  perform 1 from public.vehicles v where v.id = p_vehicle_id for update;
  if exists (
    select 1 from public.bookings bk
     where bk.vehicle_id = p_vehicle_id
       and bk.status in ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       and bk.start_at < p_end_at and bk.end_at > p_start_at
  ) then
    raise exception 'BOOKING_OVERLAP_SAME_VEHICLE' using errcode = 'P0001';
  end if;

  -- Seed the inventory grid if any slot in the window has never been booked.
  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select p_lot_id, s, bookable
    from generate_series(p_start_at, greatest(p_start_at, p_end_at - interval '15 minutes'), interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  -- Ordered locking: overlapping windows always lock slots in the same order.
  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at + interval '10 minutes'
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at + interval '10 minutes'
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.lot_slot_inventory i
     set held = i.held + 1
   where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at + interval '10 minutes';

  insert into public.bookings (
    id, code, driver_id, vehicle_id, plate_norm_snapshot, lot_id, product, start_at, end_at,
    status, hold_expires_at, price_kobo, service_fee_kobo, total_kobo, commission_bps,
    rate_plan_id, pricing_breakdown, source
  ) values (
    p_booking_id, p_code, p_driver_id, p_vehicle_id, p_plate_norm, p_lot_id, p_product,
    p_start_at, p_end_at, 'PENDING_PAYMENT', p_hold_expires_at, p_price_kobo,
    p_service_fee_kobo, p_price_kobo + p_service_fee_kobo, p_commission_bps, p_rate_plan_id,
    p_pricing_breakdown, p_source
  );

  insert into public.booking_status_history (id, booking_id, from_status, to_status, actor_type, actor_id)
  values (
    public.uuid_v7(), p_booking_id, null, 'PENDING_PAYMENT',
    case when p_source = 'ADMIN' then 'ADMIN' else 'DRIVER' end::public.booking_actor,
    p_driver_id
  );

  return p_booking_id;
end;
$$;

create or replace function public.fn_move_booking_slots(
  p_booking_id uuid,
  p_held_delta integer,
  p_booked_delta integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  b record;
  slots integer;
  moved integer;
begin
  select bk.lot_id, bk.start_at, bk.end_at into b
    from public.bookings bk
   where bk.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  slots := ceil(extract(epoch from b.end_at - b.start_at) / 900.0)::integer;

  with locked as (
    select i.lot_id, i.slot_start
      from public.lot_slot_inventory i
     where i.lot_id = b.lot_id and i.slot_start >= b.start_at and i.slot_start < b.end_at + interval '10 minutes'
     order by i.slot_start
       for update
  )
  update public.lot_slot_inventory i
     set held = i.held + p_held_delta,
         booked = i.booked + p_booked_delta
    from locked
   where i.lot_id = locked.lot_id and i.slot_start = locked.slot_start;
  get diagnostics moved = row_count;

  -- Counts never go negative (table CHECK); a missing slot means the hold never happened.
  if moved <> slots then
    raise exception 'booking % covers % slots but % inventory rows exist', p_booking_id, slots, moved
      using errcode = 'check_violation';
  end if;
end;
$$;
