import { z } from 'zod';

// Local-only fallbacks so `pnpm dev` works without a .env. Never used outside APP_ENV=local.
const LOCAL_JOB_HMAC_SECRET = 'local-dev-job-secret-change-me-0123456789'; // = supabase/seed.sql
const LOCAL_CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001,http://localhost:3002';

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default(''),
    JOB_HMAC_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /** Supavisor transaction-mode URL as parkly_api (port 6543). */
    DATABASE_URL: z.url().optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    SENTRY_DSN: z.url().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'local' && !env.JOB_HMAC_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JOB_HMAC_SECRET'],
        message: 'required outside local',
      });
    }
    if (env.APP_ENV !== 'local' && (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['UPSTASH_REDIS_REST_URL'],
        message: 'required outside local',
      });
    }
    if (env.APP_ENV !== 'local' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required outside local' });
    }
  });

export type AppConfig = {
  appEnv: 'local' | 'dev' | 'staging' | 'prod';
  logLevel: string;
  corsOrigins: string[];
  jobHmacSecret: string;
  databaseUrl: string | undefined;
  upstash: { url: string; token: string } | undefined;
  sentryDsn: string | undefined;
  port: number;
};

/** Fails fast at boot. Error lists variable names only, never values. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;
  const local = e.APP_ENV === 'local';
  const corsOrigins = e.CORS_ORIGINS || (local ? LOCAL_CORS_ORIGINS : '');
  return {
    appEnv: e.APP_ENV,
    logLevel: e.LOG_LEVEL,
    corsOrigins: corsOrigins
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // superRefine guarantees a value outside local.
    jobHmacSecret: e.JOB_HMAC_SECRET ?? LOCAL_JOB_HMAC_SECRET,
    databaseUrl: e.DATABASE_URL,
    upstash:
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
        ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }
        : undefined,
    sentryDsn: e.SENTRY_DSN,
    port: e.PORT,
  };
}
