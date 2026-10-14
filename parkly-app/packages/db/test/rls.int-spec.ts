import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

// Runs against `supabase start` (CI, or locally with Docker). Default is the local stack.
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(url, { max: 1 });

afterAll(() => sql.end());

describe('RLS deny-all baseline (doc 02 §1, AGENTS.md rule 14)', () => {
  it('every table in public has RLS enabled', async () => {
    const rows = await sql`
      select tablename from pg_tables
      where schemaname = 'public' and not rowsecurity
        and tablename not in ('spatial_ref_sys')`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('no policy grants anything to anon, authenticated or public', async () => {
    const rows = await sql`
      select tablename, policyname, roles from pg_policies
      where schemaname = 'public'
        and roles && array['anon', 'authenticated', 'public']::name[]`;
    expect(rows).toEqual([]);
  });

  it('anon and authenticated hold no table privileges in public', async () => {
    const rows = await sql`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and table_name not in ('spatial_ref_sys')`;
    expect(rows).toEqual([]);
  });

  it('the API role cannot update or delete audit logs', async () => {
    const [row] = await sql`
      select has_table_privilege('parkly_api', 'public.audit_logs', 'UPDATE') as can_update,
             has_table_privilege('parkly_api', 'public.audit_logs', 'DELETE') as can_delete`;
    expect(row).toEqual({ can_update: false, can_delete: false });
  });

  it('job and trigger functions are not callable by clients', async () => {
    const rows = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('fn_invoke_job', 'fn_on_auth_user_created')
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`;
    expect(rows).toEqual([]);
  });
});

describe('auth trigger', () => {
  it('creates a users row and DRIVER role for a phone sign-up', async () => {
    const [user] = await sql`
      insert into auth.users (id, phone, aud, role)
      values (gen_random_uuid(), '2348000000099', 'authenticated', 'authenticated')
      returning id`;
    const id = user?.id as string;
    expect(id).toBeTruthy();
    try {
      const [profile] = await sql`select phone_last4 from public.users where id = ${id}`;
      expect(profile?.phone_last4).toBe('0099');
      const roles = await sql`select role from public.user_roles where user_id = ${id}`;
      expect(roles.map((r) => r.role)).toEqual(['DRIVER']);
    } finally {
      await sql`delete from public.user_roles where user_id = ${id}`;
      await sql`delete from public.users where id = ${id}`;
      await sql`delete from auth.users where id = ${id}`;
    }
  });
});
