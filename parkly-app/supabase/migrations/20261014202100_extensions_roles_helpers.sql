-- Hand-written (ADR 0002). Runs before the first drizzle-kit migration.

-- Extensions. Supabase keeps most in the `extensions` schema; pg_net and pgmq
-- create their own schemas (`net`, `pgmq`).
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists pgmq;

-- The API's database role. NOLOGIN here; each environment's runbook sets
-- LOGIN + password out of band (never in git). Access is granted per table in
-- later migrations, and RLS gives it an explicit policy per table (doc 02 §1).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'parkly_api') then
    create role parkly_api nologin noinherit;
  end if;
end
$$;

grant usage on schema public to parkly_api;
grant usage on schema extensions to parkly_api;

-- Supabase's default privileges hand every new public table to anon and
-- authenticated. Clients only use Supabase for Auth (AGENTS.md rule 12), so
-- remove that for all future tables; RLS deny-all is the second line.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- UUIDv7 for rows created inside SQL (triggers). App code generates its own.
create or replace function public.uuid_v7()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- Shared trigger for every table with updated_at (doc 02 §1).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
