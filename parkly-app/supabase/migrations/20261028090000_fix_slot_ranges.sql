-- Hand-written. Fixes P-1 of docs/sprints/S0-S6-gap-review.md.
-- 20261027003000 widened the slot range of fn_hold_booking and fn_move_booking_slots
-- to [start_at, end_at + 10 min). For an aligned booking that takes in the next
-- booking's first slot, so convert/release raised check_violation (rows moved <>
-- slots) and one such row aborted every fn_expire_holds run. A booking covers
-- exactly the slots that start inside [start_at, end_at) again; a 5-minute test
-- stay still covers the one slot it starts in.

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
  -- Windows sit on the 15-minute grid; the only exception is a 5-minute test stay,
  -- which the API offers only when test stays are switched on (never in prod).
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
    where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.lot_slot_inventory i
     set held = i.held + 1
   where i.lot_id = p_lot_id and i.slot_start >= p_start_at and i.slot_start < p_end_at;

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
     where i.lot_id = b.lot_id and i.slot_start >= b.start_at and i.slot_start < b.end_at
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

-- One booking that cannot be released must not stop every other hold from
-- expiring: each row runs in its own subtransaction and a failure is logged and
-- retried on the next run.
create or replace function public.fn_expire_holds()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  b record;
  expired integer := 0;
  failed integer := 0;
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
    begin
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
    exception when others then
      raise warning 'fn_expire_holds: booking % not expired: %', b.id, sqlerrm;
      failed := failed + 1;
    end;
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

  return jsonb_build_object('expired', expired, 'failed', failed, 'abandoned', abandoned, 'purged', purged);
end;
$$;

revoke execute on function public.fn_expire_holds() from public, anon, authenticated;

-- Repair: holds taken under the widened range left held + 1 on the slot after
-- their window. Only `held` was affected (a failed convert or release rolled
-- back), so recompute it for current and future slots from the live holds.
with live_holds as (
  select bk.lot_id, bk.start_at, bk.end_at
    from public.bookings bk
   where bk.status = 'PENDING_PAYMENT'
  union all
  select bk.lot_id, e.start_at, e.new_end_at
    from public.booking_extensions e
    join public.bookings bk on bk.id = e.booking_id
   where e.status = 'PENDING_PAYMENT'
),
expected as (
  select i.lot_id, i.slot_start, count(h.lot_id)::integer as held
    from public.lot_slot_inventory i
    left join live_holds h
      on h.lot_id = i.lot_id and i.slot_start >= h.start_at and i.slot_start < h.end_at
   where i.slot_start >= now() - interval '15 minutes'
   group by i.lot_id, i.slot_start
)
update public.lot_slot_inventory i
   set held = expected.held
  from expected
 where i.lot_id = expected.lot_id and i.slot_start = expected.slot_start
   and i.held > expected.held;
