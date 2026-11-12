import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/env.js';
import { TEST_HOOK_SECRET, TEST_JOB_SECRET, tokenFor, world } from '../../test-helpers.js';

const config = (adminIpAllowlist: string) => ({
  appEnv: 'local' as const,
  paystackWebhookIps: ['52.31.139.75'],
  corsOrigins: ['http://localhost:3000'],
  jobHmacSecret: TEST_JOB_SECRET,
  smsHookSecret: TEST_HOOK_SECRET,
  adminIpAllowlist,
});

describe('admin network allowlist (doc 05 section 4.6)', () => {
  const OFFICE = '203.0.113.7';

  function setup(list = '203.0.113.0/24, 198.51.100.9') {
    const w = world({ config: config(list) });
    const admin = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'Root');
    const from = (ip: string | null) => ({
      as: admin,
      aal: 'aal2' as const,
      ...(ip ? { headers: { 'x-forwarded-for': ip } } : {}),
    });
    return { w, admin, from };
  }

  it('lets the admin API answer to a listed address or range, and refuses anywhere else', async () => {
    const t = setup();
    expect((await t.w.call('GET', '/v1/admin/settings', t.from(OFFICE))).status).toBe(200);
    expect((await t.w.call('GET', '/v1/admin/settings', t.from('198.51.100.9'))).status).toBe(200);
    // The first address in the header is the client; later ones are proxies.
    expect(
      (await t.w.call('GET', '/v1/admin/settings', t.from(`${OFFICE}, 10.0.0.1`))).status,
    ).toBe(200);

    const outside = await t.w.call('GET', '/v1/admin/settings', t.from('192.0.2.50'));
    expect(outside.status).toBe(403);
    expect(outside.body?.code).toBe('ADMIN_IP_NOT_ALLOWED');
    expect((await t.w.call('GET', '/v1/admin/settings', t.from(null))).status).toBe(403);
  });

  it('answers before any role check, so a wrong network never reveals anything about the role', async () => {
    const t = setup();
    const driver = t.w.user([{ role: 'DRIVER', operatorId: null }]);
    const res = await t.w.call('GET', '/v1/admin/settings', {
      as: driver,
      headers: { 'x-forwarded-for': '192.0.2.50' },
    });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('ADMIN_IP_NOT_ALLOWED');
    const anon = await t.w.call('GET', '/v1/admin/settings', {
      headers: { 'x-forwarded-for': '192.0.2.50' },
    });
    expect(anon.body?.code).toBe('ADMIN_IP_NOT_ALLOWED');
  });

  it('only guards the admin API, not the apps drivers and operators use', async () => {
    const t = setup();
    const driver = t.w.user([{ role: 'DRIVER', operatorId: null }]);
    const me = await t.w.call('GET', '/v1/me', {
      as: driver,
      headers: { 'x-forwarded-for': '192.0.2.50' },
    });
    expect(me.status).toBe(200);
    expect((await t.w.call('GET', '/health/live')).status).toBe(200);
  });

  it('is off when no list is set', async () => {
    const t = setup('');
    expect((await t.w.call('GET', '/v1/admin/settings', t.from('192.0.2.50'))).status).toBe(200);
    expect((await t.w.call('GET', '/v1/admin/settings', t.from(null))).status).toBe(200);
  });

  it('refuses to start with an entry that is not an address, so a typo cannot open or lock the door', () => {
    expect(() => world({ config: config('203.0.113.7, office-wifi') })).toThrow(
      /ADMIN_IP_ALLOWLIST.*office-wifi/,
    );
  });

  it('reads the list from the environment', () => {
    const cfg = loadConfig({ APP_ENV: 'local', ADMIN_IP_ALLOWLIST: '203.0.113.0/24' });
    expect(cfg.adminIpAllowlist).toBe('203.0.113.0/24');
    expect(loadConfig({ APP_ENV: 'local' }).adminIpAllowlist).toBe('');
  });
});

describe('step-up for sensitive admin actions (doc 05 section 4.6)', () => {
  function setup() {
    const w = world();
    const sa = w.user([{ role: 'SUPER_ADMIN', operatorId: null }], 'Root');
    const finance = w.user([{ role: 'ADMIN_FINANCE', operatorId: null }], 'Fin');
    const ops = w.user([{ role: 'ADMIN_OPS', operatorId: null }], 'Ops');
    const as = (id: string, stepUp?: 'fresh' | 'stale' | 'none') => ({
      as: id,
      aal: 'aal2' as const,
      ...(stepUp ? { stepUp } : {}),
    });
    return { w, sa, finance, ops, as };
  }

  /** Each action that needs the check, a body that would otherwise get past validation, and who may do it. */
  const ACTIONS = (t: ReturnType<typeof setup>) => [
    {
      name: 'approve a refund',
      method: 'POST',
      path: `/v1/admin/refund-requests/${randomUUID()}/approve`,
      body: {},
      headers: { 'idempotency-key': randomUUID() },
      who: t.finance,
      afterCheck: 404,
    },
    {
      name: 'reject a refund',
      method: 'POST',
      path: `/v1/admin/refund-requests/${randomUUID()}/reject`,
      body: { note: 'Not justified' },
      headers: undefined,
      who: t.finance,
      afterCheck: 404,
    },
    {
      name: 'change an operator commission',
      method: 'PUT',
      path: `/v1/admin/operators/${randomUUID()}/commission`,
      body: { commissionBps: 1100, reason: 'Negotiated rate' },
      headers: undefined,
      who: t.finance,
      afterCheck: 404,
    },
    {
      name: 'change a platform setting',
      method: 'PUT',
      path: '/v1/admin/settings/booking.hold_minutes',
      body: { value: 12, reason: 'Slow card checkouts' },
      headers: undefined,
      who: t.sa,
      afterCheck: 200,
    },
    {
      name: 'change a feature flag',
      method: 'PUT',
      path: '/v1/admin/feature-flags/claims_enabled',
      body: { enabled: false, reason: 'Keep it off' },
      headers: undefined,
      who: t.sa,
      afterCheck: 200,
    },
    {
      name: 'cancel a suspended car park’s bookings',
      method: 'POST',
      path: `/v1/admin/lots/${randomUUID()}/cancel-upcoming-bookings`,
      body: { reason: 'Barrier broken for a week' },
      headers: undefined,
      who: t.ops,
      afterCheck: 404,
    },
  ];

  it('asks for a fresh authenticator check, and carries on once there is one', async () => {
    const t = setup();
    for (const a of ACTIONS(t)) {
      const call = (stepUp?: 'fresh' | 'stale' | 'none') =>
        t.w.call(a.method, a.path, {
          ...t.as(a.who, stepUp),
          body: a.body,
          ...(a.headers ? { headers: a.headers } : {}),
        });

      const stale = await call('stale');
      expect(stale.status, `${a.name}: old check`).toBe(403);
      expect(stale.body?.code, a.name).toBe('STEP_UP_REQUIRED');

      const none = await call('none');
      expect(none.status, `${a.name}: password only`).toBe(403);
      expect(none.body?.code, a.name).toBe('STEP_UP_REQUIRED');

      expect((await call('fresh')).status, `${a.name}: fresh check`).toBe(a.afterCheck);
    }
  });

  it('leaves nothing changed when it refuses', async () => {
    const t = setup();
    await t.w.call('PUT', '/v1/admin/settings/booking.hold_minutes', {
      ...t.as(t.sa, 'stale'),
      body: { value: 12, reason: 'Slow card checkouts' },
    });
    await t.w.call('PUT', '/v1/admin/feature-flags/claims_enabled', {
      ...t.as(t.sa, 'stale'),
      body: { enabled: true, reason: 'Switch it on' },
    });
    expect(await t.w.store.settings.get('booking.hold_minutes')).toBeUndefined();
    expect(await t.w.store.flags.enabled('claims_enabled')).toBe(false);
    expect(t.w.store.auditRows).toEqual([]);
  });

  it('does not slow down reading, only changing', async () => {
    const t = setup();
    expect((await t.w.call('GET', '/v1/admin/settings', t.as(t.sa, 'stale'))).status).toBe(200);
    expect((await t.w.call('GET', '/v1/admin/feature-flags', t.as(t.sa, 'none'))).status).toBe(200);
  });

  it('checks the role first: someone who may not do it gets 403 FORBIDDEN, not a step-up prompt', async () => {
    const t = setup();
    const res = await t.w.call('PUT', '/v1/admin/settings/booking.hold_minutes', {
      ...t.as(t.finance, 'stale'),
      body: { value: 12, reason: 'Slow card checkouts' },
    });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('FORBIDDEN');
  });

  it('counts the check by its time in the signed token, so one used six minutes later has expired', async () => {
    const t = setup();
    // Minted at the test's fixed time, with an authenticator check 5 seconds before.
    const token = await tokenFor(t.sa, { aal: 'aal2' });
    const put = () =>
      t.w.app.request('/v1/admin/feature-flags/claims_enabled', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false, reason: 'Keep it off' }),
      });
    expect((await put()).status).toBe(200);

    const later = new Date(t.w.deps.now().getTime() + 6 * 60_000);
    t.w.deps.now = () => later;
    const res = await put();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('STEP_UP_REQUIRED');
  });
});
