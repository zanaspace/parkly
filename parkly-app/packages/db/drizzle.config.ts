import { defineConfig } from 'drizzle-kit';

// Generates SQL into supabase/migrations; the Supabase CLI applies it (ADR 0002).
// Hand-written SQL (functions, grants, cron) lives in the same folder.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  migrations: { prefix: 'supabase' },
  schemaFilter: ['public'],
  entities: { roles: { provider: 'supabase', exclude: ['parkly_api'] } },
  strict: true,
  verbose: true,
});
