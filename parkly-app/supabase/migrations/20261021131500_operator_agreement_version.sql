-- Hand-written. Sprint 2: the Operator Agreement version operators accept at
-- sign-up (doc 03 O-01). Bump when the agreement changes; existing operators
-- are then asked to accept the new version.
insert into public.platform_settings (key, value, description) values
  ('legal.operator_agreement_version', '"2026-10-01"', 'Current Operator Agreement version')
on conflict (key) do nothing;
