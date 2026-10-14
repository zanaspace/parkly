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

  it('requires Upstash outside local', () => {
    expect(() => loadConfig({ APP_ENV: 'dev', JOB_HMAC_SECRET: secret })).toThrow(
      /UPSTASH_REDIS_REST_URL/,
    );
    const config = loadConfig({
      APP_ENV: 'dev',
      JOB_HMAC_SECRET: secret,
      DATABASE_URL: 'postgresql://parkly_api.ref:pw@pooler.supabase.com:6543/postgres',
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
