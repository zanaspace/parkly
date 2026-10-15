import { randomUUID } from 'node:crypto';
import { createDb } from '@parkly/db';
import { sql } from 'drizzle-orm';
import { afterAll } from 'vitest';
import { drizzleStore } from '../../src/store/drizzle.js';
import { storeContract } from '../../src/store/store-contract.js';

// Runs against `supabase start` (CI, or locally with Docker).
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { db, close } = createDb(url, { max: 2 });

afterAll(() => close());

storeContract('DrizzleStore (Postgres)', () => ({
  store: drizzleStore(db),
  newUser: async (roles = [{ role: 'DRIVER', operatorId: null }]) => {
    const id = randomUUID();
    // The on_auth_user_created trigger creates the profile and DRIVER role for phone sign-ups.
    await db.execute(sql`
      insert into auth.users (id, phone, aud, role)
      values (${id}, ${`23480${Math.floor(10_000_000 + Math.random() * 89_999_999)}`}, 'authenticated', 'authenticated')`);
    await db.execute(sql`delete from public.user_roles where user_id = ${id}`);
    for (const r of roles) {
      await db.execute(sql`
        insert into public.user_roles (id, user_id, role, operator_id)
        values (${randomUUID()}, ${id}, ${r.role}::public.role, ${r.operatorId})`);
    }
    return id;
  },
}));
