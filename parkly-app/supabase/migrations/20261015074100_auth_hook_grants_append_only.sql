-- Hand-written. Sprint 1: grants and triggers for the account tables, append-only
-- enforcement, the Custom Access Token Hook and legal document versions.

grant select, insert, update, delete on public.vehicles, public.devices,
  public.data_subject_requests to parkly_api;
grant select, insert on public.consents to parkly_api;

create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
create trigger data_subject_requests_set_updated_at before update on public.data_subject_requests
  for each row execute function public.set_updated_at();

-- Append-only, enforced in the database for every role, not just by grants
-- (FR-AUTH-008, Sprint 1 task 6).
create or replace function public.fn_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.fn_block_mutation() from public, anon, authenticated;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.fn_block_mutation();
create trigger consents_append_only before update or delete on public.consents
  for each row execute function public.fn_block_mutation();

-- Custom Access Token Hook (doc 02 §2.2, doc 05 §4.4). Adds role claims to
-- every JWT Supabase issues. Claims are a hint for the UI; the API re-reads
-- roles from user_roles on every request.
create or replace function public.fn_custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  uid uuid := (event ->> 'user_id')::uuid;
  roles jsonb;
  operator uuid;
begin
  select coalesce(jsonb_agg(distinct ur.role), '[]'::jsonb),
         (array_agg(ur.operator_id order by ur.created_at) filter (where ur.operator_id is not null))[1]
    into roles, operator
    from public.user_roles ur
   where ur.user_id = uid;

  claims := jsonb_set(claims, '{app_roles}', roles);
  claims := jsonb_set(claims, '{operator_id}', coalesce(to_jsonb(operator), 'null'::jsonb));
  -- Attendant lot assignments arrive with lots in Sprint 2.
  claims := jsonb_set(claims, '{lot_ids}', '[]'::jsonb);

  return jsonb_build_object('claims', claims);
end;
$$;

revoke execute on function public.fn_custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.fn_custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Legal versions the apps must show for acceptance (FR-AUTH-002). Bump when the documents change.
insert into public.platform_settings (key, value, description) values
  ('legal.terms_version', '"2026-10-01"', 'Current Driver Terms version'),
  ('legal.privacy_version', '"2026-10-01"', 'Current Privacy Notice version')
on conflict (key) do nothing;
