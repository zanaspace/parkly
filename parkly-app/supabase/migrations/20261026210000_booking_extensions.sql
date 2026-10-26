-- Hand-written. Sprint 6 story 2: booking_extensions table (doc 02 §2.6, §4, FR-BOOK-005).

create table public.booking_extensions (
  id uuid primary key default public.uuid_v7(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  start_at timestamptz not null,
  new_end_at timestamptz not null,
  added_minutes integer not null,
  price_kobo bigint not null,
  platform_amount_kobo bigint not null,
  operator_amount_kobo bigint not null,
  payment_id uuid references public.payments(id) on delete set null,
  status public.booking_status not null default 'PENDING_PAYMENT',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_extensions_window_check check (new_end_at > start_at),
  constraint booking_extensions_price_check check (
    price_kobo >= 0 and platform_amount_kobo >= 0 and operator_amount_kobo >= 0
    and platform_amount_kobo + operator_amount_kobo = price_kobo
  )
);

create index booking_extensions_booking_idx on public.booking_extensions (booking_id);
create index booking_extensions_payment_idx on public.booking_extensions (payment_id);
create index booking_extensions_status_idx on public.booking_extensions (status);

alter table public.booking_extensions enable row level security;

create policy "api_access" on public.booking_extensions
  to parkly_api using (true) with check (true);

create trigger booking_extensions_set_updated_at before update on public.booking_extensions
  for each row execute function public.set_updated_at();

grant select, insert, update on public.booking_extensions to parkly_api;

comment on table public.booking_extensions is 'C2/C3. Extensions to an existing stay (FR-BOOK-005, doc 02 §4).';
