-- Hand-written. Gap review P-8: the refunds table comment promised "their sum
-- never exceeds the payment", but nothing enforced it. A refund that is not
-- FAILED counts against its payment; the payment row is locked so two refunds
-- for the same charge are checked one after the other.

create or replace function public.fn_refunds_within_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  paid bigint;
  taken bigint;
begin
  if new.status = 'FAILED' then
    return new;
  end if;

  select p.amount_kobo into paid
    from public.payments p
   where p.id = new.payment_id
     for update;

  select coalesce(sum(r.amount_kobo), 0) into taken
    from public.refunds r
   where r.payment_id = new.payment_id
     and r.status <> 'FAILED'
     and r.id <> new.id;

  if taken + new.amount_kobo > paid then
    raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_refunds_within_payment() from public, anon, authenticated;

create trigger refunds_within_payment
  before insert or update of amount_kobo, status, payment_id on public.refunds
  for each row execute function public.fn_refunds_within_payment();
