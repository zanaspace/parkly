import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { RoleGrant } from '@parkly/domain/authz';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp, type AppDeps } from './app.js';
import { createTokenVerifier } from './auth/token.js';
import { InMemoryReplayGuard } from './jobs/replay-guard.js';
import { createCrypto } from './lib/crypto.js';
import { createLogger } from './lib/logger.js';
import { allowAllRateLimiter, MemoryRateLimiter } from './middleware/rate-limit.js';
import {
  FakeMalwareScanner,
  FakeMapsProvider,
  FakePaymentProvider,
  FakeSettlementProvider,
  FakeSmsProvider,
  FakeStorageProvider,
} from './providers/fakes.js';
import { FakeSessionRevoker } from './providers/supabase-sessions.js';
import { MemoryStore } from './store/memory.js';

export const TEST_JOB_SECRET = 'test-job-secret-that-is-at-least-32-chars';
export const TEST_HOOK_KEY = Buffer.from('test-sms-hook-key-test-sms-hook!');
export const TEST_HOOK_SECRET = `v1,whsec_${TEST_HOOK_KEY.toString('base64')}`;
export const TEST_NOW = new Date('2026-10-19T08:00:00Z');

const ISSUER = 'https://test.supabase.co/auth/v1';
const keyPair = await generateKeyPair('ES256', { extractable: true });
const jwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(keyPair.publicKey)), kid: 'test', alg: 'ES256' }],
});
export const testVerifier = createTokenVerifier({ issuer: ISSUER, jwks });

/** Signs a Supabase-shaped access token for tests. */
export async function tokenFor(
  userId: string,
  opts: { aal?: 'aal1' | 'aal2'; sessionId?: string; phone?: string; email?: string } = {},
): Promise<string> {
  return new SignJWT({
    aal: opts.aal ?? 'aal1',
    session_id: opts.sessionId ?? randomUUID(),
    role: 'authenticated',
    ...(opts.phone ? { phone: opts.phone.replace(/^\+/, '') } : {}),
    ...(opts.email ? { email: opts.email } : {}),
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .setExpirationTime('15m')
    .sign(keyPair.privateKey);
}

/** Signs a Supabase Send SMS Hook request (Standard Webhooks). */
export function signedHook(body: string, nowSec = Math.floor(TEST_NOW.getTime() / 1000)) {
  const id = `msg_${randomUUID()}`;
  const signature = createHmac('sha256', TEST_HOOK_KEY)
    .update(`${id}.${nowSec}.${body}`)
    .digest('base64');
  return {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(nowSec),
      'webhook-signature': `v1,${signature}`,
    },
  };
}

/** App wired with fakes only — no network, no DB (doc 02 §12.5). */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp(testDeps(overrides));
}

export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    config: {
      appEnv: 'local',
      paystackWebhookIps: ['52.31.139.75'],
      corsOrigins: ['http://localhost:3000'],
      jobHmacSecret: TEST_JOB_SECRET,
      smsHookSecret: TEST_HOOK_SECRET,
    },
    logger: createLogger({ level: 'silent' }),
    readinessChecks: {},
    rateLimiter: allowAllRateLimiter,
    replayGuard: new InMemoryReplayGuard(),
    jobs: {},
    now: () => TEST_NOW,
    store: new MemoryStore(),
    verifyToken: testVerifier,
    crypto: createCrypto({
      encKeys: { v1: randomBytes(32) },
      currentEncVersion: 'v1',
      pepper: 'test-pepper-test-pepper-test-pepper',
    }),
    sms: { primary: new FakeSmsProvider() },
    sessions: new FakeSessionRevoker(),
    settlement: new FakeSettlementProvider(),
    payments: new FakePaymentProvider(),
    storage: new FakeStorageProvider(),
    scanner: new FakeMalwareScanner(),
    maps: new FakeMapsProvider(),
    ...overrides,
  };
}

/** A full context for route tests: store, fakes and signed-in users. */
export function world(overrides: Partial<AppDeps> = {}) {
  const store = new MemoryStore();
  const sms = new FakeSmsProvider();
  const sessions = new FakeSessionRevoker();
  const rateLimiter = new MemoryRateLimiter(() => TEST_NOW.getTime());
  const settlement = new FakeSettlementProvider();
  const payments = new FakePaymentProvider();
  const storage = new FakeStorageProvider();
  const scanner = new FakeMalwareScanner();
  const deps = testDeps({
    store,
    sms: { primary: sms },
    sessions,
    rateLimiter,
    settlement,
    payments,
    storage,
    scanner,
    ...overrides,
  });
  const app = createApp(deps);

  const user = (
    roles: RoleGrant[] = [{ role: 'DRIVER', operatorId: null }],
    firstName?: string,
  ) => {
    const id = randomUUID();
    store.seedUser(id, { roles, ...(firstName ? { firstName } : {}) });
    return id;
  };

  const call = async (
    method: string,
    path: string,
    opts: {
      as?: string;
      aal?: 'aal1' | 'aal2';
      body?: unknown;
      sessionId?: string;
      /** Identity claims on the token (Supabase phone / email sign-in). */
      phone?: string;
      email?: string;
      headers?: Record<string, string>;
    } = {},
  ) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.as) {
      const t = await tokenFor(opts.as, {
        ...(opts.aal ? { aal: opts.aal } : {}),
        ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        ...(opts.phone ? { phone: opts.phone } : {}),
        ...(opts.email ? { email: opts.email } : {}),
      });
      headers.authorization = `Bearer ${t}`;
    }
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(path, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    // Non-JSON responses (HTML receipts) are read from `raw`.
    let body: Record<string, unknown> | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    return {
      status: res.status,
      headers: res.headers,
      body,
      raw: text,
    };
  };

  return {
    app,
    deps,
    store,
    sms,
    sessions,
    settlement,
    payments,
    storage,
    scanner,
    user,
    call,
    tokenFor,
  };
}
