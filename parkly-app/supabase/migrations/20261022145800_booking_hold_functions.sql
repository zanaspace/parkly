-- Hand-written. Sprint 4 story 2: grants, triggers, ledger invariant and the
-- slot-inventory functions for bookings (doc 01 §5.2, doc 02 §2.6–2.7, §5, ADR 0006).

-- Bookings, payments, refunds and webhook rows are kept, never deleted by the API.
grant select, insert, update on public.bookings, public.payments, public.refunds,
  public.webhook_events to parkly_api;
grant select, insert, update, delete on public.idempotency_keys to parkly_api;
grant select, insert on public.ledger_accounts to parkly_api;
-- Append-only: no UPDATE/DELETE grant, matching the RLS policies.
grant select, insert on public.booking_status_history, public.ledger_entries to parkly_api;

create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

create trigger booking_status_history_append_only before update or delete
  on public.booking_status_history
  for each row execute function public.fn_block_mutation();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function public.fn_block_mutation();

-- Every journal balances (Σ debits = Σ credits), checked at commit so the lines
-- of one journal can be inserted one by one (doc 02 §2.7).
create or replace function public.fn_ledger_balanced_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  diff bigint;
begin
  select coalesce(sum(case when e.direction = 'DEBIT' then e.amount_kobo else -e.amount_kobo end), 0)
    into diff
    from public.ledger_entries e
   where e.journal_id = new.journal_id;
  if diff <> 0 then
    raise exception 'ledger journal % is unbalanced by % kobo', new.journal_id, diff
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_ledger_balanced_check() from public, anon, authenticated;

create constraint trigger ledger_balanced_check
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.fn_ledger_balanced_check();

-- Platform accounts; OPERATOR_PAYABLE:<operatorId> rows are added by the API.
insert into public.ledger_accounts (id, code, type) values
  (public.uuid_v7(), 'DRIVER_RECEIVABLE', 'ASSET'),
  (public.uuid_v7(), 'PROVIDER_CLEARING:PAYSTACK', 'ASSET'),
  (public.uuid_v7(), 'PROVIDER_CLEARING:FAKE', 'ASSET'),
  (public.uuid_v7(), 'PLATFORM_REVENUE_COMMISSION', 'REVENUE'),
  (public.uuid_v7(), 'PLATFORM_REVENUE_SERVICE_FEE', 'REVENUE'),
  (public.uuid_v7(), 'PAYMENT_FEES_EXPENSE', 'EXPENSE'),
  (public.uuid_v7(), 'REFUNDS_CLEARING', 'LIABILITY')
on conflict (code) do nothing;

-- Creates a PENDING_PAYMENT booking and takes one space in every 15-minute slot
-- of its window (doc 02 §5). Prices come from packages/domain; no pricing here.
-- Business failures raise with the problem+json code as the MESSAGE, which the
-- API maps; the caller's transaction is then rolled back.
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
     or extract(epoch from p_end_at)::bigint % 900 <> 0 then
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

  insert into public.lot_slot_inventory (lot_id, slot_start, capacity)
  select p_lot_id, s, bookable
    from generate_series(p_start_at, p_end_at - interval '15 minutes', interval '15 minutes') s
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

-- Adds the deltas to every slot of a booking's window, locking in slot order.
-- The caller holds the booking row lock and changes the booking status in the
-- same transaction, so each move happens exactly once per booking.
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

  slots := (extract(epoch from b.end_at - b.start_at) / 900)::integer;

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

-- Payment verified: the held space becomes booked.
create or replace function public.fn_convert_hold(p_booking_id uuid)
returns void
language sql
set search_path = ''
as $$
  select public.fn_move_booking_slots(p_booking_id, -1, 1);
$$;

-- Gives a space back: an unpaid hold ending ('held') or a paid booking
-- cancelled or marked no-show ('booked').
create or replace function public.fn_release_slots(p_booking_id uuid, p_from text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_from = 'held' then
    perform public.fn_move_booking_slots(p_booking_id, -1, 0);
  elsif p_from = 'booked' then
    perform public.fn_move_booking_slots(p_booking_id, 0, -1);
  else
    raise exception 'p_from must be held or booked, not %', p_from using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.fn_hold_booking(uuid, text, uuid, uuid, text, uuid,
  public.product, timestamptz, timestamptz, timestamptz, bigint, bigint, integer, uuid, jsonb,
  public.booking_source) from public, anon, authenticated;
revoke execute on function public.fn_move_booking_slots(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.fn_convert_hold(uuid) from public, anon, authenticated;
revoke execute on function public.fn_release_slots(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hold_booking(uuid, text, uuid, uuid, text, uuid,
  public.product, timestamptz, timestamptz, timestamptz, bigint, bigint, integer, uuid, jsonb,
  public.booking_source) to parkly_api;
grant execute on function public.fn_move_booking_slots(uuid, integer, integer) to parkly_api;
grant execute on function public.fn_convert_hold(uuid) to parkly_api;
grant execute on function public.fn_release_slots(uuid, text) to parkly_api;

comment on table public.bookings is 'C2/C3. Driver bookings (doc 02 §2.6). Never deleted by the API.';
comment on table public.booking_status_history is 'C2. Append-only booking status changes.';
comment on table public.payments is 'C2/C3/C4. One row per collection attempt; id = provider reference.';
comment on table public.refunds is 'C2. Refunds; their sum never exceeds the payment.';
comment on table public.webhook_events is 'C3. Provider webhooks, deduplicated; payload kept 180 days.';
comment on table public.idempotency_keys is 'C2. Replayable responses per Idempotency-Key, 48 hours.';
comment on table public.ledger_accounts is 'C2. Chart of accounts.';
comment on table public.ledger_entries is 'C2. Append-only double-entry lines; each journal balances.';
