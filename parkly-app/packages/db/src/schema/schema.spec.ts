import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './index.js';

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));

describe('schema conventions (doc 02 §1)', () => {
  it('finds the tables', () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      'audit_logs',
      'consents',
      'data_subject_requests',
      'devices',
      'feature_flags',
      'platform_settings',
      'user_roles',
      'users',
      'vehicles',
    ]);
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s enables RLS with an API policy',
    (_name, table) => {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.length).toBeGreaterThan(0);
      for (const policy of config.policies) {
        expect(policy.to).toBeDefined();
      }
    },
  );

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s has created_at',
    (_name, table) => {
      expect(getTableConfig(table).columns.map((c) => c.name)).toContain('created_at');
    },
  );
});
