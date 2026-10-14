-- Hand-written. Grants, triggers and default settings for the Sprint 0 tables.

-- Belt and braces: tables created before the default-privilege change.
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update, delete on public.users, public.user_roles,
  public.platform_settings, public.feature_flags to parkly_api;

-- Append-only: no UPDATE/DELETE grant, matching the RLS policies.
grant select, insert on public.audit_logs to parkly_api;

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger platform_settings_set_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- Every auth user gets a profile row (FK target for everything else). Phone
-- sign-ups are drivers; staff arrive by email invite and get roles from the
-- invite flow (Sprint 1). phone_hash/email_hash need the pepper, so the API
-- fills them on /v1/auth/bootstrap (doc 02 §2.2).
create or replace function public.fn_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, phone_last4)
  values (new.id, case when new.phone is not null then right(new.phone, 4) end)
  on conflict (id) do nothing;

  if new.phone is not null and new.email is null then
    insert into public.user_roles (id, user_id, role)
    values (public.uuid_v7(), new.id, 'DRIVER')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_on_auth_user_created() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_on_auth_user_created();

-- Defaults from doc 02 §8. Values are JSON; money in kobo.
insert into public.platform_settings (key, value, description) values
  ('fees.commission_bps_default', '1200', 'Platform commission in basis points (range 1000–1500)'),
  ('fees.service_fee_kobo', '10000', 'Driver service fee on short bookings (₦100)'),
  ('fees.service_fee_max_duration_min', '1440', 'Service fee applies below this duration'),
  ('fees.fee_bearer', '"PLATFORM"', 'Who bears payment provider fees'),
  ('booking.hold_minutes', '10', 'Unpaid booking holds capacity this long'),
  ('booking.min_lead_min', '0', ''),
  ('booking.max_advance_days', '30', ''),
  ('booking.max_duration_hours', '24', 'HOURLY bookings'),
  ('booking.free_cancel_before_start_min', '30', ''),
  ('booking.no_show_grace_min', '30', ''),
  ('booking.early_arrival_min', '30', ''),
  ('session.overstay_grace_min', '10', ''),
  ('session.overstay_payment_wait_min', '10', ''),
  ('pass.max_share_of_capacity', '0.5', ''),
  ('pass.length_days', '30', ''),
  ('lot.default_bookable_buffer_pct', '10', ''),
  ('lot.verification_validity_months', '12', ''),
  ('permit.reminder_days', '[30, 14, 7, 1]', ''),
  ('permit.honour_bookings_within_hours', '72', 'On suspension'),
  ('refund.approval_threshold_kobo', '5000000', '₦50,000 needs a second approver'),
  ('payments.primary_provider', '"PAYSTACK"', ''),
  ('payments.secondary_enabled', 'false', ''),
  ('attend.max_offline_hours', '48', 'Older offline events are rejected'),
  ('attend.manifest_poll_sec', '300', ''),
  ('app.min_supported_version.android', '"1.0.0"', 'Force-update gate'),
  ('support.phone', 'null', 'Set per environment'),
  ('support.whatsapp', 'null', 'Set per environment')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled) values
  ('claims_enabled', false),
  ('ratings_enabled', false),
  ('passes_enabled', false),
  ('events_enabled', false),
  ('employer_passes_enabled', false),
  ('referrals_enabled', false),
  ('operator_pro_tier_enabled', false),
  ('saved_cards_enabled', false),
  ('payments_flutterwave_enabled', false),
  ('driver_web_booking_enabled', false)
on conflict (key) do nothing;
