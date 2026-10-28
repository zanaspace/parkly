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

  it('keeps 5-minute test stays off unless asked, and refuses them in prod', () => {
    expect(loadConfig({}).testShortStays).toBe(false);
    expect(loadConfig({ TEST_SHORT_STAYS: 'on' }).testShortStays).toBe(true);
    expect(() => loadConfig({ APP_ENV: 'prod', TEST_SHORT_STAYS: 'on' })).toThrow(
      /TEST_SHORT_STAYS: test stays are not allowed in prod/,
    );
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
      STORAGE_PROVIDER: 'supabase',
      SUPABASE_SECRET_KEY: 'sb_secret_0123456789abcdef',
    });
    expect(config.upstash).toEqual({ url: 'https://x.upstash.io', token: 't' });
    expect(config.logPayloads).toBe(false);
  });

  it('names the bad variable but never echoes its value', () => {
    expect(() => loadConfig({ JOB_HMAC_SECRET: 'short-secret-value' })).toThrow(/JOB_HMAC_SECRET/);
    expect(() => loadConfig({ JOB_HMAC_SECRET: 'short-secret-value' })).not.toThrow(
      /short-secret-value/,
    );
  });

  describe('payments, storage and scanning (Sprint 2)', () => {
    it('uses fakes locally by default', () => {
      expect(loadConfig({})).toMatchObject({
        settlement: { provider: 'fake' },
        storage: { provider: 'fake' },
        malwareScanner: 'fake',
      });
    });

    it('uses Paystack with a test key outside prod', () => {
      const config = loadConfig({
        SETTLEMENT_PROVIDER: 'paystack',
        PAYSTACK_SECRET_KEY: 'sk_test_0123456789abcdef',
      });
      expect(config.settlement).toEqual({
        provider: 'paystack',
        secretKey: 'sk_test_0123456789abcdef',
      });
    });

    it('requires the key when Paystack is selected', () => {
      expect(() => loadConfig({ SETTLEMENT_PROVIDER: 'paystack' })).toThrow(/PAYSTACK_SECRET_KEY/);
    });

    it('refuses a live Paystack key outside prod (no real money in tests)', () => {
      expect(() =>
        loadConfig({
          SETTLEMENT_PROVIDER: 'paystack',
          PAYSTACK_SECRET_KEY: 'sk_live_0123456789abcdef',
        }),
      ).toThrow(/PAYSTACK_SECRET_KEY: live keys are only allowed in prod/);
    });

    it('requires live Paystack, Supabase Storage and a real scanner in prod', () => {
      const err = (() => {
        try {
          loadConfig({ APP_ENV: 'prod', PAYSTACK_SECRET_KEY: 'sk_test_0123456789abcdef' });
        } catch (e) {
          return (e as Error).message;
        }
        return '';
      })();
      expect(err).toMatch(/SETTLEMENT_PROVIDER: must be paystack in prod/);
      expect(err).toMatch(/PAYSTACK_SECRET_KEY: prod needs a live key/);
      expect(err).toMatch(/STORAGE_PROVIDER: must be supabase outside local/);
      expect(err).toMatch(/MALWARE_SCANNER: the fake scanner is not allowed in prod/);
      expect(err).not.toContain('sk_test_0123456789abcdef');
    });

    it('requires the Supabase secret key for Supabase Storage', () => {
      expect(() => loadConfig({ STORAGE_PROVIDER: 'supabase' })).toThrow(/SUPABASE_SECRET_KEY/);
      expect(
        loadConfig({
          STORAGE_PROVIDER: 'supabase',
          SUPABASE_SECRET_KEY: 'sb_secret_0123456789abcdef',
        }).storage,
      ).toEqual({ provider: 'supabase', secretKey: 'sb_secret_0123456789abcdef' });
    });
  });
});
