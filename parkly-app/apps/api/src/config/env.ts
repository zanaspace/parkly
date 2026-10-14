import { z } from 'zod';

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default(''),
    JOB_HMAC_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Supavisor transaction-mode URL as parkly_api (port 6543). */
    DATABASE_URL: z.url().optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    SENTRY_DSN: z.url().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
  })
  .superRefine((env, ctx) => {
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
  return {
    appEnv: e.APP_ENV,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jobHmacSecret: e.JOB_HMAC_SECRET,
    databaseUrl: e.DATABASE_URL,
    upstash:
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
        ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }
        : undefined,
    sentryDsn: e.SENTRY_DSN,
    port: e.PORT,
  };
}
