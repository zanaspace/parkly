-- Hand-written. Sprint 3: the API reads slot inventory for search and
-- availability; the booking functions (S4) write it.
grant select, insert, update, delete on public.lot_slot_inventory to parkly_api;
comment on table public.lot_slot_inventory is
  'C2. One row per lot per 15-minute slot (doc 02 §2.5, ADR 0006). Rows created on demand.';
