-- Hand-written. Fixes P-4, P-5 and L-6 of docs/sprints/S0-S6-gap-review.md.
-- Extension holds never expired, any number could be held for one booking, and
-- confirm never re-checked the booking. Now:
--   * a booking has at most one PENDING_PAYMENT extension; a new request
--     releases the previous one (the driver retrying an abandoned checkout);
--   * extension holds expire like booking holds (fn_expire_holds);
--   * cancelling a booking releases its pending extension;
--   * an extension is confirmed only on a live booking that still ends where
--     the extension starts; otherwise fn_confirm_extension raises and the API
--     refunds the payment;
--   * an extension cannot run into the same car's next booking.

alter table public.booking_extensions add column hold_expires_at timestamptz;

-- Gives one pending extension's held space back and closes it with p_status.
-- Returns false when the extension was not pending (already confirmed or closed).
create or replace function public.fn_release_extension(
  p_extension_id uuid,
  p_status public.booking_status
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  ext record;
  lot uuid;
begin
  select e.id, e.booking_id, e.start_at, e.new_end_at, e.status
    into ext
    from public.booking_extensions e
   where e.id = p_extension_id
     for update;
  if not found or ext.status <> 'PENDING_PAYMENT' then
    return false;
  end if;

  select b.lot_id into lot from public.bookings b where b.id = ext.booking_id;

  with locked as (
    select i.lot_id, i.slot_start
      from public.lot_slot_inventory i
     where i.lot_id = lot and i.slot_start >= ext.start_at and i.slot_start < ext.new_end_at
     order by i.slot_start
       for update
  )
  update public.lot_slot_inventory i
     set held = i.held - 1
    from locked
   where i.lot_id = locked.lot_id and i.slot_start = locked.slot_start;

  update public.booking_extensions
     set status = p_status, hold_expires_at = null, updated_at = now()
   where id = ext.id;

  -- A checkout that never opened can no longer be paid.
  update public.payments
     set status = 'FAILED', failure_code = 'extension.released', updated_at = now()
   where id = (select e.payment_id from public.booking_extensions e where e.id = ext.id)
     and status = 'INITIATED';
  return true;
end;
$$;

-- Clean up before the one-pending rule: keep only the newest pending extension
-- per booking, and give every pending hold an expiry.
do $$
declare
  r record;
begin
  for r in
    select e.id
      from public.booking_extensions e
     where e.status = 'PENDING_PAYMENT'
       and exists (
         select 1 from public.booking_extensions newer
          where newer.booking_id = e.booking_id
            and newer.status = 'PENDING_PAYMENT'
            and (newer.created_at, newer.id) > (e.created_at, e.id)
       )
  loop
    perform public.fn_release_extension(r.id, 'EXPIRED');
  end loop;
end;
$$;

update public.booking_extensions
   set hold_expires_at = created_at + interval '10 minutes'
 where status = 'PENDING_PAYMENT' and hold_expires_at is null;

create unique index booking_extensions_one_pending_idx
  on public.booking_extensions (booking_id)
  where status = 'PENDING_PAYMENT';
create index booking_extensions_hold_expiry_idx
  on public.booking_extensions (hold_expires_at)
  where status = 'PENDING_PAYMENT';

drop function public.fn_hold_extension(uuid, uuid, timestamptz, bigint, bigint, bigint);

-- Holds one space for an extension window [booking.end_at, p_new_end_at).
create function public.fn_hold_extension(
  p_extension_id uuid,
  p_booking_id uuid,
  p_new_end_at timestamptz,
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

  -- A new request replaces the driver's own unpaid one; holds never stack.
  for previous in
    select e.id from public.booking_extensions e
     where e.booking_id = bk.id and e.status = 'PENDING_PAYMENT'
  loop
    perform public.fn_release_extension(previous, 'EXPIRED');
  end loop;

  -- The same car cannot be in two live bookings at once (as fn_hold_booking).
  perform 1 from public.vehicles v where v.id = bk.vehicle_id for update;
  if exists (
    select 1 from public.bookings other
     where other.vehicle_id = bk.vehicle_id
       and other.id <> bk.id
       and other.status in ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       and other.start_at < p_new_end_at and other.end_at > bk.end_at
  ) then
    raise exception 'BOOKING_OVERLAP_SAME_VEHICLE' using errcode = 'P0001';
  end if;

  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select bk.lot_id, s, bookable
    from generate_series(bk.end_at, p_new_end_at - interval '15 minutes', interval '15 minutes') s
   order by s
  on conflict (lot_id, slot_start) do nothing;

  perform 1
     from public.lot_slot_inventory i
    where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at
    order by i.slot_start
      for update;

  select count(*) into full_slots
    from public.lot_slot_inventory i
   where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at
     and i.capacity - i.booked - i.held - i.pass_reserved - i.blocked < 1;
  if full_slots > 0 then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.lot_slot_inventory i
     set held = i.held + 1
   where i.lot_id = bk.lot_id and i.slot_start >= bk.end_at and i.slot_start < p_new_end_at;

  added_mins := (extract(epoch from p_new_end_at - bk.end_at) / 60)::integer;

  insert into public.booking_extensions (
    id, booking_id, start_at, new_end_at, added_minutes, price_kobo,
    platform_amount_kobo, operator_amount_kobo, status, hold_expires_at
  ) values (
    p_extension_id, p_booking_id, bk.end_at, p_new_end_at, added_mins, p_price_kobo,
    p_platform_amount_kobo, p_operator_amount_kobo, 'PENDING_PAYMENT', p_hold_expires_at
  );

  return p_extension_id;
end;
$$;

-- Confirms an extension after payment: held -> booked and the booking ends later.
-- Locks the booking before the extension (the order settle uses).
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
  select b.id, b.lot_id, b.status, b.end_at
    into bk
    from public.bookings b
   where b.id = (select e.booking_id from public.booking_extensions e where e.id = p_extension_id)
     for update;
  if not found then
    raise exception 'EXTENSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select e.id, e.booking_id, e.start_at, e.new_end_at, e.price_kobo, e.status, e.payment_id
    into ext
    from public.booking_extensions e
   where e.id = p_extension_id
     for update;

  if ext.status <> 'PENDING_PAYMENT' then
    raise exception 'EXTENSION_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;
  if bk.status not in ('CONFIRMED', 'CHECKED_IN') or ext.start_at <> bk.end_at then
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

-- Cancelling also gives back a pending extension's held space.
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
  pending uuid;
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

  for pending in
    select e.id from public.booking_extensions e
     where e.booking_id = p_booking_id and e.status = 'PENDING_PAYMENT'
  loop
    perform public.fn_release_extension(pending, 'CANCELLED');
  end loop;

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

-- fn_expire_holds also expires extension holds, each in its own subtransaction.
create or replace function public.fn_expire_holds()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  b record;
  expired integer := 0;
  extensions_expired integer := 0;
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
      update public.payments
         set status = 'FAILED', failure_code = 'hold.expired', updated_at = now()
       where booking_id = b.id and status = 'INITIATED';
      expired := expired + 1;
    exception when others then
      raise warning 'fn_expire_holds: booking % not expired: %', b.id, sqlerrm;
      failed := failed + 1;
    end;
  end loop;

  for b in
    select e.id
      from public.booking_extensions e
     where e.status = 'PENDING_PAYMENT' and e.hold_expires_at < now()
     order by e.hold_expires_at
     limit 500
       for update skip locked
  loop
    begin
      if public.fn_release_extension(b.id, 'EXPIRED') then
        extensions_expired := extensions_expired + 1;
      end if;
    exception when others then
      raise warning 'fn_expire_holds: extension % not expired: %', b.id, sqlerrm;
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

  return jsonb_build_object(
    'expired', expired, 'extensions_expired', extensions_expired, 'failed', failed,
    'abandoned', abandoned, 'purged', purged
  );
end;
$$;

revoke execute on function public.fn_expire_holds() from public, anon, authenticated;
revoke execute on function public.fn_release_extension(uuid, public.booking_status)
  from public, anon, authenticated;
revoke execute on function public.fn_hold_extension(uuid, uuid, timestamptz, bigint, bigint, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_release_extension(uuid, public.booking_status) to parkly_api;
grant execute on function public.fn_hold_extension(uuid, uuid, timestamptz, bigint, bigint, bigint, timestamptz)
  to parkly_api;

comment on column public.booking_extensions.hold_expires_at is
  'When an unpaid extension gives its held space back (fn_expire_holds).';
