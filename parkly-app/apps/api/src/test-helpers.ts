import { createApp, type AppDeps } from './app.js';
import { createLogger } from './lib/logger.js';
import { InMemoryReplayGuard } from './jobs/replay-guard.js';
import { allowAllRateLimiter } from './middleware/rate-limit.js';

export const TEST_JOB_SECRET = 'test-job-secret-that-is-at-least-32-chars';

/** App wired with fakes only — no network, no DB (doc 02 §12.5). */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config: {
      appEnv: 'local',
      corsOrigins: ['http://localhost:3000'],
      jobHmacSecret: TEST_JOB_SECRET,
    },
    logger: createLogger({ level: 'silent' }),
    readinessChecks: {},
    rateLimiter: allowAllRateLimiter,
    replayGuard: new InMemoryReplayGuard(),
    jobs: {},
    now: () => new Date('2026-10-19T08:00:00Z'),
    ...overrides,
  });
}
