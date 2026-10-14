import { defineConfig } from 'vitest/config';

// Only pure logic is tested here; components need a native renderer (added with the mobile e2e setup).
export default defineConfig({ test: { include: ['src/**/*.spec.ts'] } });
