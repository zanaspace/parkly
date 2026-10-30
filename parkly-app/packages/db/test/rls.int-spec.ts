import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

// Runs against `supabase start` (CI, or locally with Docker). Default is the local stack.
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(url, { max: 1 });

afterAll(() => sql.end());

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, so tests leave no rows. */
async function inRolledBackTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

async function newAuthUser(tx: postgres.TransactionSql, phone: string): Promise<string> {
  const rows = await tx`
    insert into auth.users (id, phone, aud, role)
    values (gen_random_uuid(), ${phone}, 'authenticated', 'authenticated')
    returning id`;
  const id = rows[0]?.id as string | undefined;
  if (!id) throw new Error('auth user not created');
  return id;
}

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

  it('only approved lot photos are public, and clients have no storage.objects policies (doc 05 V12)', async () => {
    // Approved lot photos are public by design (doc 06 §1.2, ADR 0002); only the API writes
    // them, after admin approval. Every other bucket stays private.
    const publicBuckets = await sql`select id from storage.buckets where public order by id`;
    expect(publicBuckets.map((b) => b.id)).toEqual(['lot-photos-public']);
    const policies = await sql`
      select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and roles && array['anon', 'authenticated', 'public']::name[]`;
    expect(policies).toEqual([]);
    const buckets = await sql`select id from storage.buckets order by id`;
    expect(buckets.map((b) => b.id)).toEqual(
      expect.arrayContaining(['kyb-docs', 'lot-photos', 'permits', 'verification']),
    );
  });

  it('anon and authenticated hold no table privileges in public', async () => {
    const rows = await sql`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and table_name not in ('spatial_ref_sys')`;
    expect(rows).toEqual([]);
  });

  it('the API role cannot update or delete audit logs or consents', async () => {
    const [row] = await sql`
      select has_table_privilege('parkly_api', 'public.audit_logs', 'UPDATE') as audit_update,
             has_table_privilege('parkly_api', 'public.audit_logs', 'DELETE') as audit_delete,
             has_table_privilege('parkly_api', 'public.consents', 'UPDATE') as consent_update,
             has_table_privilege('parkly_api', 'public.consents', 'DELETE') as consent_delete`;
    expect(row).toEqual({
      audit_update: false,
      audit_delete: false,
      consent_update: false,
      consent_delete: false,
    });
  });

  it('no SECURITY DEFINER function in public is callable by clients, and all pin search_path (doc 05 §5.4)', async () => {
    const exposed = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`;
    expect(exposed).toEqual([]);
    const unpinned = await sql`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')`;
    expect(unpinned).toEqual([]);
  });
});

describe('append-only tables (FR-AUTH-008)', () => {
  it.each(['audit_logs', 'consents'])(
    '%s rejects UPDATE and DELETE, even for the owner',
    async (table) => {
      await inRolledBackTx(async (tx) => {
        const userId = await newAuthUser(tx, '2348000000098');
        if (table === 'audit_logs') {
          await tx`insert into public.audit_logs (id, action, entity_type) values (gen_random_uuid(), 'test', 'test')`;
        } else {
          await tx`insert into public.consents (id, user_id, type, version, granted)
                 values (gen_random_uuid(), ${userId}, 'TERMS', 'v1', true)`;
        }
        await tx`savepoint before_update`;
        await expect(tx.unsafe(`update public.${table} set created_at = now()`)).rejects.toThrow(
          /append-only/,
        );
        await tx`rollback to savepoint before_update`;
        await expect(tx.unsafe(`delete from public.${table}`)).rejects.toThrow(/append-only/);
      });
    },
  );
});

describe('auth trigger', () => {
  it('creates a users row and DRIVER role for a phone sign-up', async () => {
    await inRolledBackTx(async (tx) => {
      const id = await newAuthUser(tx, '2348000000099');
      const [profile] = await tx`select phone_last4 from public.users where id = ${id}`;
      expect(profile?.phone_last4).toBe('0099');
      const roles = await tx`select role from public.user_roles where user_id = ${id}`;
      expect(roles.map((r) => r.role)).toEqual(['DRIVER']);
    });
  });
});

describe('custom access token hook', () => {
  it('adds app_roles, operator_id and lot_ids from user_roles', async () => {
    await inRolledBackTx(async (tx) => {
      const id = await newAuthUser(tx, '2348000000097');
      const [row] = await tx`
        select public.fn_custom_access_token_hook(
          jsonb_build_object('user_id', ${id}::text, 'claims', jsonb_build_object('sub', ${id}::text))) as out`;
      expect(row?.out).toEqual({
        claims: { sub: id, app_roles: ['DRIVER'], operator_id: null, lot_ids: [] },
      });
    });
  });

  it('is executable by Supabase Auth only', async () => {
    const [row] = await sql`
      select has_function_privilege('supabase_auth_admin', 'public.fn_custom_access_token_hook(jsonb)', 'EXECUTE') as auth,
             has_function_privilege('authenticated', 'public.fn_custom_access_token_hook(jsonb)', 'EXECUTE') as client`;
    expect(row).toEqual({ auth: true, client: false });
  });
});
