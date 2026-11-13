import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { RoleGrant } from '@parkly/domain/authz';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp, type AppDeps } from './app.js';
import { createTokenVerifier } from './auth/token.js';
import { InMemoryReplayGuard } from './jobs/replay-guard.js';
import { createCrypto } from './lib/crypto.js';
import { createLogger } from './lib/logger.js';
import { allowAllRateLimiter, MemoryRateLimiter } from './middleware/rate-limit.js';
import { NotificationService } from './notifications/service.js';
import {
  FakeEmailProvider,
  FakeIdentityVerificationProvider,
  FakeMalwareScanner,
  FakeMapsProvider,
  FakePaymentProvider,
  FakePushProvider,
  FakeSettlementProvider,
  FakeSmsProvider,
  FakeStorageProvider,
} from './providers/fakes.js';
import { FakeAuthAdmin } from './providers/auth-admin.js';
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
  opts: {
    aal?: 'aal1' | 'aal2';
    sessionId?: string;
    phone?: string;
    email?: string;
    /** The authenticator check behind an aal2 token: fresh (default), old, or none (password only). */
    stepUp?: 'fresh' | 'stale' | 'none';
    /** The test clock when the token is minted, in ms (default TEST_NOW). */
    nowMs?: number;
  } = {},
): Promise<string> {
  const nowSec = Math.floor((opts.nowMs ?? TEST_NOW.getTime()) / 1000);
  const totpAt = opts.stepUp === 'stale' ? nowSec - 3600 : nowSec - 5;
  const amr =
    (opts.aal ?? 'aal1') !== 'aal2'
      ? []
      : opts.stepUp === 'none'
        ? [{ method: 'password', timestamp: totpAt }]
        : [
            { method: 'password', timestamp: totpAt - 5 },
            { method: 'totp', timestamp: totpAt },
          ];
  return new SignJWT({
    aal: opts.aal ?? 'aal1',
    amr,
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
  const deps: Omit<AppDeps, 'notifications'> = {
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
    authAdmin: new FakeAuthAdmin(),
    settlement: new FakeSettlementProvider(),
    payments: new FakePaymentProvider(),
    identityVerification: new FakeIdentityVerificationProvider(),
    storage: new FakeStorageProvider(),
    scanner: new FakeMalwareScanner(),
    maps: new FakeMapsProvider(),
    ...overrides,
  };
  // Shares the test's store, key and clock (read live: tests move it), so a
  // test can read what was queued.
  const full = { ...deps } as AppDeps;
  full.notifications =
    overrides.notifications ??
    new NotificationService({
      sms: deps.sms.primary,
      email: new FakeEmailProvider(),
      push: new FakePushProvider(),
      store: deps.store,
      logger: deps.logger,
      crypto: deps.crypto,
      now: () => full.now(),
    });
  return full;
}

/** A full context for route tests: store, fakes and signed-in users. */
export function world(overrides: Partial<AppDeps> = {}) {
  const store = new MemoryStore();
  const sms = new FakeSmsProvider();
  const sessions = new FakeSessionRevoker();
  const authAdmin = new FakeAuthAdmin();
  const rateLimiter = new MemoryRateLimiter(() => TEST_NOW.getTime());
  const settlement = new FakeSettlementProvider();
  const payments = new FakePaymentProvider();
  const identityVerification = new FakeIdentityVerificationProvider();
  const storage = new FakeStorageProvider();
  const scanner = new FakeMalwareScanner();
  const deps = testDeps({
    store,
    sms: { primary: sms },
    sessions,
    rateLimiter,
    settlement,
    payments,
    identityVerification,
    storage,
    scanner,
    ...overrides,
  });
  // Visible email and push fakes; email counts as real (Resend) unless a test turns it off.
  const email = new FakeEmailProvider();
  const push = new FakePushProvider();
  let emailIsLive = true;
  if (!overrides.notifications)
    deps.notifications = new NotificationService({
      sms,
      email,
      push,
      store,
      logger: deps.logger,
      crypto: deps.crypto,
      now: () => deps.now(),
      links: { web: 'http://localhost:3000', portal: 'http://localhost:3001' },
      emailLive: () => emailIsLive,
    });
  // Auth emails (ADR 0022) go to the same visible fake, signed like the SMS hook.
  if (!('authEmail' in overrides))
    deps.authEmail = {
      provider: email,
      hookSecret: TEST_HOOK_SECRET,
      supabaseUrl: 'https://test.supabase.co',
    };
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
      /** How fresh the authenticator check on an aal2 token is. */
      stepUp?: 'fresh' | 'stale' | 'none';
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
        ...(opts.stepUp ? { stepUp: opts.stepUp } : {}),
        // A token is minted when it is used, so it is as fresh as the test clock says.
        nowMs: deps.now().getTime(),
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
    authAdmin,
    settlement,
    payments,
    identityVerification,
    storage,
    scanner,
    email,
    push,
    emailLive: (on: boolean) => {
      emailIsLive = on;
    },
    user,
    call,
    tokenFor,
  };
}

/** A LIVE lot with an approved permit, visit and hourly plan (₦500/h), open 24 h. */
export async function addLiveLot(store: MemoryStore, capacity = 5) {
  const ownerId = randomUUID();
  store.seedUser(ownerId, { roles: [] });
  const op = await store.operators.create({
    legalName: 'Eko Parking Ltd',
    tradingName: 'Eko Parking',
    type: 'HOTEL',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: null,
    contactPhoneEnc: null,
    ownerUserId: ownerId,
    commissionBps: 1200,
  });
  Object.assign(store.operatorRows.get(op.id) ?? {}, { status: 'ACTIVE', kybStatus: 'APPROVED' });
  const lot = await store.lots.create({
    operatorId: op.id,
    type: 'HOTEL',
    name: 'Eko Hotel Car Park',
    slug: `eko-${randomUUID().slice(0, 8)}`,
    description: null,
    addressLine: 'VI',
    area: null,
    lga: null,
    location: { lat: 6.43, lng: 3.42 },
    entranceNotes: null,
    capacityTotal: capacity + 5,
    capacityBookable: capacity,
    amenities: [],
    vehicleTypes: ['CAR'],
    createdBy: ownerId,
  });
  const reviewer = { reviewerId: ownerId, at: new Date('2026-10-10T10:00:00Z') };
  const permit = await store.permits.create({
    lotId: lot.id,
    permitNumber: 'LASPA/1',
    issuedAt: '2026-01-10',
    expiresAt: '2027-01-09',
    documentFileId: randomUUID(),
    submittedBy: ownerId,
  });
  await store.permits.approve(permit.id, { ...reviewer, note: 'ok' });
  const visit = await store.verifications.create({
    lotId: lot.id,
    inspectorUserId: ownerId,
    inspectedAt: new Date('2026-10-09T10:00:00Z'),
    capacityCounted: 10,
    gps: null,
    notes: null,
    validUntil: '2027-10-09',
    items: [{ item: 'LASPA_PERMIT', result: 'PASS', comment: null }],
  });
  await store.verifications.approve(visit.id, reviewer);
  const plan = await store.ratePlans.submit({
    lotId: lot.id,
    product: 'HOURLY',
    hourlyRateKobo: 50_000,
    minMinutes: 60,
    dailyCapKobo: null,
    dailyRateKobo: null,
    monthlyRateKobo: null,
    submittedBy: ownerId,
  });
  await store.ratePlans.approve(plan.id, reviewer);
  await store.lots.setOpeningHours(
    lot.id,
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      is24h: true,
      opensAt: null,
      closesAt: null,
    })),
  );
  await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
  await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
  return { lot, operatorId: op.id, ownerId };
}
