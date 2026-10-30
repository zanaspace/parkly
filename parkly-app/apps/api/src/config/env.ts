import { z } from 'zod';

// Local-only fallbacks so `pnpm dev` works without a .env. Never used outside APP_ENV=local.
const LOCAL = {
  jobHmacSecret: 'local-dev-job-secret-change-me-0123456789', // = supabase/seed.sql
  corsOrigins: 'http://localhost:3000,http://localhost:3001,http://localhost:3002',
  supabaseUrl: 'http://127.0.0.1:54321',
  // = SUPABASE_SMS_HOOK_SECRET in supabase/.env.example
  smsHookSecret: `v1,whsec_${Buffer.from('local-dev-sms-hook-secret-change-me').toString('base64')}`,
  pepper: 'local-dev-hash-pepper-change-me-0123456789',
  encKeyV1: Buffer.alloc(32, 7).toString('base64'),
};

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

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
    SUPABASE_URL: z.url().optional(),
    /** Publishable (anon) key; used only as the `apikey` header when signing users out. */
    SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
    SUPABASE_SMS_HOOK_SECRET: z.string().startsWith('v1,whsec_').optional(),
    HASH_PEPPER_V1: z.string().min(32).optional(),
    ENC_KEY_V1: base64Key.optional(),
    ENC_KEY_V2: base64Key.optional(),
    ENC_KEY_CURRENT: z.enum(['v1', 'v2']).default('v1'),
    SMS_PROVIDER: z.enum(['fake', 'termii']).default('fake'),
    TERMII_API_KEY: z.string().min(10).optional(),
    TERMII_SENDER_ID: z.string().min(3).max(11).optional(),
    /** Notification email (ADR 0020). `log` only logs; Resend needs a verified domain. */
    EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
    RESEND_API_KEY: z.string().startsWith('re_').min(10).optional(),
    /** e.g. `Parkly <no-reply@parkly.example>`, on the domain verified in Resend. */
    EMAIL_FROM: z.string().min(3).optional(),
    /** Push to the driver app through Expo; the access token is optional. */
    PUSH_PROVIDER: z.enum(['fake', 'expo']).default('fake'),
    /** The driver website, for links in SMS and email (e.g. https://parkly-web-two.vercel.app). */
    WEB_BASE_URL: z.url().optional(),
    EXPO_ACCESS_TOKEN: z.string().min(10).optional(),
    /** Server-only secret key (sb_secret_…) for Supabase Storage. Never in a client. */
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),
    STORAGE_PROVIDER: z.enum(['fake', 'supabase']).default('fake'),
    SETTLEMENT_PROVIDER: z.enum(['fake', 'paystack']).default('fake'),
    PAYSTACK_SECRET_KEY: z
      .string()
      .regex(/^sk_(test|live)_[A-Za-z0-9]+$/, 'must be a Paystack secret key')
      .optional(),
    /**
     * Paystack's webhook senders (doc 02 §6.9). Defaults to the addresses Paystack
     * publishes; set only if Paystack announces new ones.
     */
    PAYSTACK_WEBHOOK_IPS: z.string().optional(),
    /** Only the fake exists until ADR 0013 picks a hosted scanner. */
    MALWARE_SCANNER: z.enum(['fake']).default('fake'),
    /** Address search (ADR 0014). Without it, dev uses the fake place list. */
    LOCATIONIQ_API_KEY: z.string().min(10).optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    SENTRY_DSN: z.url().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_PAYLOADS: z.coerce.boolean().optional(),
    /** 5-minute test stays for overstay testing on dev; refused in prod (gap review L-2). */
    TEST_SHORT_STAYS: z.enum(['on', 'off']).default('off'),
  })
  .superRefine((env, ctx) => {
    const required = (key: keyof typeof env) => {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'required outside local' });
    };
    if (env.APP_ENV !== 'local') {
      required('JOB_HMAC_SECRET');
      required('DATABASE_URL');
      required('UPSTASH_REDIS_REST_URL');
      required('UPSTASH_REDIS_REST_TOKEN');
      required('SUPABASE_URL');
      required('SUPABASE_PUBLISHABLE_KEY');
      required('SUPABASE_SMS_HOOK_SECRET');
      required('HASH_PEPPER_V1');
      required('ENC_KEY_V1');
      required('WEB_BASE_URL');
    }
    if (env.APP_ENV === 'prod' && env.SMS_PROVIDER !== 'termii') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'must be termii in prod' });
    }
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.SETTLEMENT_PROVIDER === 'paystack') required('PAYSTACK_SECRET_KEY');
    const liveKey = env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ?? false;
    if (env.APP_ENV === 'prod') {
      if (env.SETTLEMENT_PROVIDER !== 'paystack')
        issue('SETTLEMENT_PROVIDER', 'must be paystack in prod');
      if (!liveKey) issue('PAYSTACK_SECRET_KEY', 'prod needs a live key');
      if (env.MALWARE_SCANNER === 'fake')
        issue('MALWARE_SCANNER', 'the fake scanner is not allowed in prod');
      required('LOCATIONIQ_API_KEY');
      if (env.TEST_SHORT_STAYS === 'on')
        issue('TEST_SHORT_STAYS', 'test stays are not allowed in prod');
    } else if (liveKey) {
      issue('PAYSTACK_SECRET_KEY', 'live keys are only allowed in prod');
    }
    if (env.APP_ENV !== 'local' && env.STORAGE_PROVIDER !== 'supabase')
      issue('STORAGE_PROVIDER', 'must be supabase outside local');
    if (env.STORAGE_PROVIDER === 'supabase') required('SUPABASE_SECRET_KEY');
    if (env.SMS_PROVIDER === 'termii') {
      required('TERMII_API_KEY');
      required('TERMII_SENDER_ID');
    }
    if (env.EMAIL_PROVIDER === 'resend') {
      required('RESEND_API_KEY');
      required('EMAIL_FROM');
    }
    if (env.APP_ENV === 'prod') {
      if (env.EMAIL_PROVIDER !== 'resend') issue('EMAIL_PROVIDER', 'must be resend in prod');
      if (env.PUSH_PROVIDER !== 'expo') issue('PUSH_PROVIDER', 'must be expo in prod');
    }
  });

export type AppConfig = {
  appEnv: 'local' | 'dev' | 'staging' | 'prod';
  logLevel: string;
  logPayloads: boolean;
  corsOrigins: string[];
  jobHmacSecret: string;
  databaseUrl: string | undefined;
  supabase: { url: string; publishableKey: string | undefined };
  smsHookSecret: string;
  hashPepper: string;
  encKeys: Record<string, Buffer>;
  encKeyCurrent: string;
  sms: { provider: 'fake' } | { provider: 'termii'; apiKey: string; senderId: string };
  email: { provider: 'log' } | { provider: 'resend'; apiKey: string; from: string };
  push: { provider: 'fake' } | { provider: 'expo'; accessToken: string | undefined };
  /** The driver website, for links in messages. */
  webBaseUrl: string;
  settlement: { provider: 'fake' } | { provider: 'paystack'; secretKey: string };
  storage: { provider: 'fake' } | { provider: 'supabase'; secretKey: string };
  malwareScanner: 'fake';
  maps: { provider: 'fake' } | { provider: 'locationiq'; apiKey: string };
  /** Webhooks from other addresses are refused outside local. */
  paystackWebhookIps: string[];
  upstash: { url: string; token: string } | undefined;
  sentryDsn: string | undefined;
  port: number;
  /** 5-minute test stays (never in prod). */
  testShortStays: boolean;
};

/** Fails fast at boot. Error lists variable names only, never values. */
/** Published by Paystack (docs: Webhooks → IP whitelisting). */
const PAYSTACK_WEBHOOK_IPS = '52.31.139.75,52.49.173.169,52.214.14.220';

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;
  const local = e.APP_ENV === 'local';
  const corsOrigins = e.CORS_ORIGINS || (local ? LOCAL.corsOrigins : '');

  // superRefine guarantees the real values outside local; the fallbacks only apply locally.
  const encKeys: Record<string, Buffer> = {
    v1: Buffer.from(e.ENC_KEY_V1 ?? LOCAL.encKeyV1, 'base64'),
  };
  if (e.ENC_KEY_V2) encKeys.v2 = Buffer.from(e.ENC_KEY_V2, 'base64');

  return {
    appEnv: e.APP_ENV,
    logLevel: e.LOG_LEVEL,
    logPayloads: local ? (e.LOG_PAYLOADS ?? true) : false,
    corsOrigins: corsOrigins
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jobHmacSecret: e.JOB_HMAC_SECRET ?? LOCAL.jobHmacSecret,
    databaseUrl: e.DATABASE_URL,
    supabase: {
      url: e.SUPABASE_URL ?? LOCAL.supabaseUrl,
      publishableKey: e.SUPABASE_PUBLISHABLE_KEY,
    },
    smsHookSecret: e.SUPABASE_SMS_HOOK_SECRET ?? LOCAL.smsHookSecret,
    hashPepper: e.HASH_PEPPER_V1 ?? LOCAL.pepper,
    encKeys,
    encKeyCurrent: e.ENC_KEY_CURRENT,
    sms:
      e.SMS_PROVIDER === 'termii' && e.TERMII_API_KEY && e.TERMII_SENDER_ID
        ? { provider: 'termii', apiKey: e.TERMII_API_KEY, senderId: e.TERMII_SENDER_ID }
        : { provider: 'fake' },
    email:
      e.EMAIL_PROVIDER === 'resend' && e.RESEND_API_KEY && e.EMAIL_FROM
        ? { provider: 'resend', apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM }
        : { provider: 'log' },
    webBaseUrl: (e.WEB_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    push:
      e.PUSH_PROVIDER === 'expo'
        ? { provider: 'expo', accessToken: e.EXPO_ACCESS_TOKEN }
        : { provider: 'fake' },
    settlement:
      e.SETTLEMENT_PROVIDER === 'paystack' && e.PAYSTACK_SECRET_KEY
        ? { provider: 'paystack', secretKey: e.PAYSTACK_SECRET_KEY }
        : { provider: 'fake' },
    storage:
      e.STORAGE_PROVIDER === 'supabase' && e.SUPABASE_SECRET_KEY
        ? { provider: 'supabase', secretKey: e.SUPABASE_SECRET_KEY }
        : { provider: 'fake' },
    malwareScanner: e.MALWARE_SCANNER,
    paystackWebhookIps: (e.PAYSTACK_WEBHOOK_IPS ?? PAYSTACK_WEBHOOK_IPS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maps: e.LOCATIONIQ_API_KEY
      ? { provider: 'locationiq', apiKey: e.LOCATIONIQ_API_KEY }
      : { provider: 'fake' },
    upstash:
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
        ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }
        : undefined,
    sentryDsn: e.SENTRY_DSN,
    port: e.PORT,
    testShortStays: e.TEST_SHORT_STAYS === 'on',
  };
}
