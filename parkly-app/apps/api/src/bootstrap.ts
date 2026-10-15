import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createDb } from '@parkly/db';
import * as Sentry from '@sentry/node';
import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { supabaseTokenVerifier } from './auth/token.js';
import { loadConfig } from './config/env.js';
import { InMemoryReplayGuard, type ReplayGuard } from './jobs/replay-guard.js';
import { jobs } from './jobs/registry.js';
import { createCrypto } from './lib/crypto.js';
import { createLogger } from './lib/logger.js';
import { MemoryRateLimiter, type LimitRule, type RateLimiter } from './middleware/rate-limit.js';
import { FakeSmsProvider } from './providers/fakes.js';
import type { SmsProvider } from './providers/index.js';
import {
  FakeSessionRevoker,
  supabaseSessions,
  type SessionRevoker,
} from './providers/supabase-sessions.js';
import { termiiSmsProvider } from './providers/termii.js';
import { drizzleStore } from './store/drizzle.js';

// Local Supabase from `supabase start` (supabase/config.toml ports).
const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function upstashLimiter(redis: Redis): RateLimiter {
  const byRule = new Map<string, Ratelimit>();
  const get = (rule: LimitRule) => {
    let rl = byRule.get(rule.name);
    if (!rl) {
      rl = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSec} s`),
        prefix: `rl:${rule.name}`,
      });
      byRule.set(rule.name, rl);
    }
    return rl;
  };
  return {
    limit: async (key, rule) => {
      const r = await get(rule).limit(key);
      return { success: r.success, remaining: r.remaining, reset: r.reset };
    },
    peek: async (key, rule) => {
      const r = await get(rule).getRemaining(key);
      return { success: r.remaining > 0, remaining: r.remaining, reset: r.reset };
    },
  };
}

/** Wires real adapters from the environment. Tests use test-helpers.ts instead. */
export function bootstrap(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const logger = createLogger({ level: config.logLevel });

  if (config.sentryDsn) {
    // EU data region (doc 05 sub-processors); no PII in events.
    Sentry.init({ dsn: config.sentryDsn, environment: config.appEnv, tracesSampleRate: 0 });
  }

  let rateLimiter: RateLimiter = new MemoryRateLimiter(Date.now);
  let replayGuard: ReplayGuard = new InMemoryReplayGuard();
  const readinessChecks: Record<string, () => Promise<boolean>> = {};

  const { db } = createDb(config.databaseUrl ?? LOCAL_DATABASE_URL);
  readinessChecks.db = async () => (await db.execute(sql`select 1`)).length === 1;

  if (config.upstash) {
    const redis = new Redis({ url: config.upstash.url, token: config.upstash.token });
    rateLimiter = upstashLimiter(redis);
    replayGuard = {
      firstSeen: async (id, ttlSec) => (await redis.set(id, 1, { nx: true, ex: ttlSec })) === 'OK',
    };
    readinessChecks.redis = async () => (await redis.ping()) === 'PONG';
  }

  // Until Termii approves the sender ID, dev uses the fake provider and
  // Supabase "test phone numbers" (README). Prod config refuses the fake.
  const primary: SmsProvider =
    config.sms.provider === 'termii'
      ? termiiSmsProvider({ apiKey: config.sms.apiKey, senderId: config.sms.senderId })
      : new FakeSmsProvider();

  let sessions: SessionRevoker;
  if (config.supabase.publishableKey) {
    sessions = supabaseSessions({
      url: config.supabase.url,
      apiKey: config.supabase.publishableKey,
    });
  } else {
    logger.warn(
      'SUPABASE_PUBLISHABLE_KEY not set: sign-out will not revoke Supabase sessions (local only)',
    );
    sessions = new FakeSessionRevoker();
  }

  const app = createApp({
    config,
    logger,
    readinessChecks,
    rateLimiter,
    replayGuard,
    jobs,
    now: () => new Date(),
    store: drizzleStore(db),
    verifyToken: supabaseTokenVerifier(config.supabase.url),
    crypto: createCrypto({
      encKeys: config.encKeys,
      currentEncVersion: config.encKeyCurrent,
      pepper: config.hashPepper,
    }),
    sms: { primary },
    sessions,
    ...(config.sentryDsn
      ? {
          reportError: (err: unknown, ctx: { requestId: string | undefined; path: string }) =>
            Sentry.captureException(err, { tags: { requestId: ctx.requestId, path: ctx.path } }),
        }
      : {}),
  });
  return { app, config, logger };
}
