import { defineConfig } from 'vitest/config';

// Needs a running database (`supabase start`); not part of `pnpm test`.
export default defineConfig({
  test: { include: ['test/**/*.int-spec.ts'], testTimeout: 20_000 },
});
