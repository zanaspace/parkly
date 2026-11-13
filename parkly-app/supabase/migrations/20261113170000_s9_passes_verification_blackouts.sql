-- Sprint 9: Monthly passes (FR-PASS-001..004), Driver Identity Verification Tier 2 KYC (FR-AUTH-009),
-- Verified Driver gating (FR-PASS-005), and Capacity blackouts (FR-LOT-008).

-- 1. Enums
do $$ begin
  create type public.pass_status as enum ('HELD', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REVOKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pass_waitlist_status as enum ('WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.driver_verification_method as enum ('FRSC_LICENSE', 'NIN_PHONE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.driver_verification_status as enum ('VERIFIED', 'REJECTED', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.identity_provider as enum ('DOJAH', 'FAKE');
exception when duplicate_object then null; end $$;

-- 2. Alter users & lots & lot_closures
alter table public.users
  add column if not exists is_verified_driver boolean not null default false,
  add column if not exists verified_at timestamptz;

alter table public.lots
  add column if not exists requires_verified_driver boolean not null default false;

alter table public.lot_closures
  add column if not exists blocked_bays integer not null default 1;

do $$ begin
  alter table public.lot_closures
    add constraint lot_closures_bays_check check (blocked_bays > 0);
exception when duplicate_object then null; end $$;

-- 3. driver_verifications (Tier 2 KYC, FR-AUTH-009)
create table if not exists public.driver_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  method public.driver_verification_method not null,
  status public.driver_verification_status not null,
  provider public.identity_provider not null,
  provider_reference varchar(120) not null,
  id_number_enc text not null,
  id_number_hash bytea not null,
  masked_id_number varchar(32) not null,
  verified_name varchar(120),
  date_of_birth_enc text,
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_verifications_user_idx
  on public.driver_verifications (user_id, created_at desc);
create index if not exists driver_verifications_hash_idx
  on public.driver_verifications (id_number_hash);

alter table public.driver_verifications enable row level security;

drop policy if exists driver_verifications_api_access on public.driver_verifications;
create policy driver_verifications_api_access
  on public.driver_verifications
  as permissive
  for all
  to parkly_api
  using (true)
  with check (true);

-- 4. passes & pass_waitlist (FR-PASS-001..004)
create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  code varchar(9) not null,
  driver_id uuid not null references public.users(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  plate_norm_snapshot varchar(12) not null,
  lot_id uuid not null references public.lots(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.pass_status not null default 'HELD',
  hold_expires_at timestamptz,
  price_kobo bigint not null,
  service_fee_kobo bigint not null default 0,
  total_kobo bigint not null,
  commission_bps integer not null,
  rate_plan_id uuid not null references public.rate_plans(id) on delete restrict,
  pricing_breakdown jsonb not null,
  swaps_used smallint not null default 0,
  last_reminder_days smallint,
  renewed_from_pass_id uuid,
  source public.booking_source not null default 'MOBILE',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passes_period_check check (period_end >= period_start),
  constraint passes_window_check check (ends_at > starts_at),
  constraint passes_amounts_check check (price_kobo > 0 and service_fee_kobo >= 0 and total_kobo = price_kobo + service_fee_kobo),
  constraint passes_swaps_check check (swaps_used between 0 and 2),
  constraint passes_hold_check check (status <> 'HELD' or hold_expires_at is not null)
);

create unique index if not exists passes_code_key on public.passes (code);
create index if not exists passes_driver_period_idx on public.passes (driver_id, period_end desc);
create index if not exists passes_lot_status_period_idx on public.passes (lot_id, status, period_start, period_end);
create index if not exists passes_status_hold_idx on public.passes (status, hold_expires_at);
create index if not exists passes_vehicle_idx on public.passes (vehicle_id);

alter table public.passes enable row level security;

drop policy if exists passes_api_access on public.passes;
create policy passes_api_access
  on public.passes
  as permissive
  for all
  to parkly_api
  using (true)
  with check (true);

create table if not exists public.pass_waitlist (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete cascade,
  desired_start_date date not null,
  status public.pass_waitlist_status not null default 'WAITING',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pass_waitlist_lot_status_idx
  on public.pass_waitlist (lot_id, status, created_at);
create index if not exists pass_waitlist_driver_idx
  on public.pass_waitlist (driver_id);

alter table public.pass_waitlist enable row level security;

drop policy if exists pass_waitlist_api_access on public.pass_waitlist;
create policy pass_waitlist_api_access
  on public.pass_waitlist
  as permissive
  for all
  to parkly_api
  using (true)
  with check (true);

-- 5. Link payments, sessions, checkin_events to passes
alter table public.payments
  add column if not exists pass_id uuid references public.passes(id) on delete restrict;

create index if not exists payments_pass_idx on public.payments (pass_id);

do $$ begin
  alter table public.payments
    add constraint payments_pass_target_check check (kind <> 'PASS' or pass_id is not null);
exception when duplicate_object then null; end $$;

alter table public.sessions
  alter column booking_id drop not null,
  add column if not exists pass_id uuid references public.passes(id) on delete restrict;

drop index if exists public.sessions_booking_key;
create unique index if not exists sessions_booking_key
  on public.sessions (booking_id)
  where booking_id is not null;

create unique index if not exists sessions_pass_open_key
  on public.sessions (pass_id)
  where pass_id is not null and check_out_at is null;

create index if not exists sessions_pass_idx on public.sessions (pass_id);

do $$ begin
  alter table public.sessions
    add constraint sessions_source_check check (booking_id is not null or pass_id is not null);
exception when duplicate_object then null; end $$;

alter table public.checkin_events
  add column if not exists pass_id uuid;
