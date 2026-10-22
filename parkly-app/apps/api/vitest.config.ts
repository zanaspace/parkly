import { defineConfig } from 'vitest/config';

// Doc 02 §12.2: apps/api coverage gate is 85%.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points and network adapters are covered by deploy smoke tests, not unit tests.
      exclude: [
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/server.ts',
        'src/instrumentation.ts',
        'src/bootstrap.ts',
        'src/providers/**',
        // DB adapter: covered by the store contract in test/integration against real Postgres.
        'src/store/drizzle.ts',
        // Test doubles and helpers.
        'src/store/memory.ts',
        'src/store/store-contract.ts',
        'src/test-helpers.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
