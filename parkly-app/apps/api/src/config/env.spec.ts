import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const secret = 's'.repeat(32);

describe('loadConfig', () => {
  it('parses a local config with defaults', () => {
    const config = loadConfig({
      JOB_HMAC_SECRET: secret,
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(config).toMatchObject({
      appEnv: 'local',
      corsOrigins: ['http://a.test', 'http://b.test'],
      upstash: undefined,
      port: 4000,
    });
  });

  it('starts locally with no .env at all, using local-only defaults', () => {
    const config = loadConfig({});
    expect(config.appEnv).toBe('local');
    expect(config.jobHmacSecret).toBe('local-dev-job-secret-change-me-0123456789'); // matches supabase/seed.sql
    expect(config.corsOrigins).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ]);
  });

  it('requires Termii in prod', () => {
    expect(() => loadConfig({ APP_ENV: 'prod' })).toThrow(/SMS_PROVIDER: must be termii in prod/);
  });

  it('never falls back to the local secret outside local', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(/JOB_HMAC_SECRET/);
  });

  it('requires Upstash outside local', () => {
    expect(() => loadConfig({ APP_ENV: 'dev', JOB_HMAC_SECRET: secret })).toThrow(
      /UPSTASH_REDIS_REST_URL/,
    );
    const config = loadConfig({
      APP_ENV: 'dev',
      JOB_HMAC_SECRET: secret,
      DATABASE_URL: 'postgresql://parkly_api.ref:pw@pooler.supabase.com:6543/postgres',
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_0123456789abcdef',
      SUPABASE_SMS_HOOK_SECRET: 'v1,whsec_c2VjcmV0',
      HASH_PEPPER_V1: 'p'.repeat(32),
      ENC_KEY_V1: Buffer.alloc(32, 1).toString('base64'),
      UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 't',
    });
    expect(config.upstash).toEqual({ url: 'https://x.upstash.io', token: 't' });
  });

  it('names the bad variable but never echoes its value', () => {
    expect(() => loadConfig({ JOB_HMAC_SECRET: 'short-secret-value' })).toThrow(/JOB_HMAC_SECRET/);
    expect(() => loadConfig({ JOB_HMAC_SECRET: 'short-secret-value' })).not.toThrow(
      /short-secret-value/,
    );
  });
});
