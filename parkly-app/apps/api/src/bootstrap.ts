import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createDb } from '@parkly/db';
import * as Sentry from '@sentry/node';
import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { supabaseTokenVerifier } from './auth/token.js';
import { loadConfig } from './config/env.js';
import { InMemoryReplayGuard, type ReplayGuard } from './jobs/replay-guard.js';
import { createJobs } from './jobs/registry.js';
import { createCrypto } from './lib/crypto.js';
import { createLogger } from './lib/logger.js';
import { MemoryRateLimiter, type LimitRule, type RateLimiter } from './middleware/rate-limit.js';
import {
  FakeMalwareScanner,
  FakeMapsProvider,
  FakePaymentProvider,
  FakeSettlementProvider,
  FakeSmsProvider,
  FakeStorageProvider,
} from './providers/fakes.js';
import type {
  PaymentProvider,
  SettlementProvider,
  SmsProvider,
  StorageProvider,
} from './providers/index.js';
import { logOnlyEmail } from './providers/log-email.js';
import { locationIqMaps } from './providers/locationiq.js';
import { paystackPaymentProvider } from './providers/paystack-payments.js';
import { paystackSettlementProvider } from './providers/paystack-settlement.js';
import { supabaseStorage } from './providers/supabase-storage.js';
import {
  FakeSessionRevoker,
  supabaseSessions,
  type SessionRevoker,
} from './providers/supabase-sessions.js';
import { termiiSmsProvider } from './providers/termii.js';
import { drizzleStore } from './store/drizzle.js';
import { MemoryStore } from './store/memory.js';
import type { Store } from './store/types.js';

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

  let store: Store;
  if (config.databaseUrl) {
    const { db } = createDb(config.databaseUrl);
    readinessChecks.db = async () => (await db.execute(sql`select 1`)).length === 1;
    store = drizzleStore(db);
  } else if (config.appEnv === 'local') {
    logger.warn('DATABASE_URL not set: using in-memory store for local development');
    readinessChecks.db = async () => true;
    store = new MemoryStore();
  } else {
    const { db } = createDb(LOCAL_DATABASE_URL);
    readinessChecks.db = async () => (await db.execute(sql`select 1`)).length === 1;
    store = drizzleStore(db);
  }

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

  // Config refuses fakes where they are not allowed (live Paystack + Supabase Storage outside local).
  const settlement: SettlementProvider =
    config.settlement.provider === 'paystack'
      ? paystackSettlementProvider({ secretKey: config.settlement.secretKey })
      : new FakeSettlementProvider();
  const payments: PaymentProvider =
    config.settlement.provider === 'paystack'
      ? paystackPaymentProvider({ secretKey: config.settlement.secretKey })
      : new FakePaymentProvider();
  const storage: StorageProvider =
    config.storage.provider === 'supabase'
      ? supabaseStorage({ url: config.supabase.url, secretKey: config.storage.secretKey })
      : new FakeStorageProvider();
  if (config.storage.provider === 'fake')
    logger.warn('STORAGE_PROVIDER=fake: uploads are kept in memory (local only)');

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

  const now = () => new Date();
  const jobs = createJobs({
    store,
    email: logOnlyEmail(logger),
    logger,
    now,
    appEnv: config.appEnv,
  });

  const app = createApp({
    config,
    logger,
    readinessChecks,
    rateLimiter,
    replayGuard,
    jobs,
    now,
    store,
    verifyToken: supabaseTokenVerifier(config.supabase.url, {
      allowDevTokens: config.appEnv === 'local',
    }),
    crypto: createCrypto({
      encKeys: config.encKeys,
      currentEncVersion: config.encKeyCurrent,
      pepper: config.hashPepper,
    }),
    sms: { primary },
    sessions,
    settlement,
    payments,
    storage,
    scanner: new FakeMalwareScanner(),
    maps:
      config.maps.provider === 'locationiq'
        ? locationIqMaps({ apiKey: config.maps.apiKey })
        : new FakeMapsProvider(),
    ...(config.sentryDsn
      ? {
          reportError: (err: unknown, ctx: { requestId: string | undefined; path: string }) =>
            Sentry.captureException(err, { tags: { requestId: ctx.requestId, path: ctx.path } }),
        }
      : {}),
  });
  return { app, config, logger };
}
