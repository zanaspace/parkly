import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createDb } from '@parkly/db';
import * as Sentry from '@sentry/node';
import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { InMemoryReplayGuard, type ReplayGuard } from './jobs/replay-guard.js';
import { createLogger } from './lib/logger.js';
import { allowAllRateLimiter, type RateLimiter } from './middleware/rate-limit.js';
import { jobs } from './jobs/registry.js';

/** Wires real adapters from the environment. Tests use test-helpers.ts instead. */
export function bootstrap(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const logger = createLogger({ level: config.logLevel });

  if (config.sentryDsn) {
    // EU data region (doc 05 sub-processors); no PII in events.
    Sentry.init({ dsn: config.sentryDsn, environment: config.appEnv, tracesSampleRate: 0 });
  }

  let rateLimiter: RateLimiter = allowAllRateLimiter;
  let replayGuard: ReplayGuard = new InMemoryReplayGuard();
  const readinessChecks: Record<string, () => Promise<boolean>> = {};

  if (config.databaseUrl) {
    const { db } = createDb(config.databaseUrl);
    readinessChecks.db = async () => (await db.execute(sql`select 1`)).length === 1;
  }

  if (config.upstash) {
    const redis = new Redis({ url: config.upstash.url, token: config.upstash.token });
    // Default per-IP budget; tighter per-route limits come with their modules (doc 05 rate-limit table).
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      prefix: 'rl',
    });
    rateLimiter = { limit: (key) => limiter.limit(key) };
    replayGuard = {
      firstSeen: async (id, ttlSec) => (await redis.set(id, 1, { nx: true, ex: ttlSec })) === 'OK',
    };
    readinessChecks.redis = async () => (await redis.ping()) === 'PONG';
  }

  const app = createApp({
    config,
    logger,
    readinessChecks,
    rateLimiter,
    replayGuard,
    jobs,
    now: () => new Date(),
    ...(config.sentryDsn
      ? {
          reportError: (err: unknown, ctx: { requestId: string | undefined; path: string }) =>
            Sentry.captureException(err, { tags: { requestId: ctx.requestId, path: ctx.path } }),
        }
      : {}),
  });
  return { app, config, logger };
}
