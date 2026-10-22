import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeSmsProvider } from '../../providers/fakes.js';
import { signedHook, tokenFor, world } from '../../test-helpers.js';

const PHONE = '+2348031234567';
const hookBody = (phone = '2348031234567', otp = '123456') =>
  JSON.stringify({ user: { id: randomUUID(), phone }, sms: { otp } });
const precheck = (
  w: ReturnType<typeof world>,
  phone = '0803 123 4567',
  deviceId = randomUUID(),
  ip = '1.2.3.4',
) =>
  w.call('POST', '/v1/auth/otp/precheck', {
    body: { phone, deviceId },
    headers: { 'x-forwarded-for': ip },
  });

describe('Send SMS Hook (FR-AUTH-001)', () => {
  it('sends a 6-digit OTP to a Nigerian mobile', async () => {
    const w = world();
    const res = await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()));
    expect(res.status).toBe(200);
    expect(w.sms.sent).toEqual([
      {
        to: PHONE,
        kind: 'OTP',
        body: 'Your Parkly code is 123456. It expires in 5 minutes. Never share it.',
      },
    ]);
  });

  it('rejects an unsigned or forged request without sending anything', async () => {
    const w = world();
    const forged = signedHook(hookBody());
    forged.headers['webhook-signature'] = 'v1,Zm9yZ2Vk';
    const res = await w.app.request('/hooks/supabase/send-sms', forged);
    expect(res.status).toBe(401);
    expect(w.sms.sent).toHaveLength(0);
  });

  it('refuses non-Nigerian numbers', async () => {
    const w = world();
    const res = await w.app.request(
      '/hooks/supabase/send-sms',
      signedHook(hookBody('14155550123')),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { http_code: 400, message: 'Only Nigerian mobile numbers are supported' },
    });
    expect(w.sms.sent).toHaveLength(0);
  });

  it('Scenario: OTP abuse is throttled — the 4th code in 15 minutes is not sent', async () => {
    const w = world();
    for (let i = 0; i < 3; i++) {
      expect((await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()))).status).toBe(
        200,
      );
    }
    const res = await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()));
    expect(res.status).toBe(429);
    expect(w.sms.sent).toHaveLength(3);
  });

  it('falls back to the secondary provider, and fails cleanly if both are down', async () => {
    const primary = new FakeSmsProvider();
    const secondary = new FakeSmsProvider();
    primary.failNext = true;
    const w = world({ sms: { primary, secondary } });
    expect((await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()))).status).toBe(
      200,
    );
    expect(secondary.sent).toHaveLength(1);

    primary.failNext = true;
    secondary.failNext = true;
    expect((await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()))).status).toBe(
      502,
    );
  });

  it('never logs the OTP', async () => {
    const lines: string[] = [];
    const { createLogger } = await import('../../lib/logger.js');
    const { Writable } = await import('node:stream');
    const logger = createLogger({
      level: 'info',
      stream: new Writable({ write: (chunk, _e, cb) => (lines.push(String(chunk)), cb()) }),
    });
    const w = world({ logger });
    await w.app.request(
      '/hooks/supabase/send-sms',
      signedHook(hookBody('2348031234567', '987654')),
    );
    expect(lines.join('')).not.toContain('987654');
    expect(lines.join('')).not.toContain('8031234567');
  });
});

describe('POST /v1/auth/otp/precheck', () => {
  it('accepts local formats and returns 204', async () => {
    expect((await precheck(world())).status).toBe(204);
  });

  it('rejects invalid numbers', async () => {
    const res = await precheck(world(), '12345');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('AUTH_PHONE_INVALID');
  });

  it('warns early once the hook has sent 3 codes, without using up the allowance itself', async () => {
    const w = world();
    for (let i = 0; i < 5; i++)
      expect((await precheck(w, PHONE, randomUUID(), `10.0.0.${i}`)).status).toBe(204);
    for (let i = 0; i < 3; i++)
      await w.app.request('/hooks/supabase/send-sms', signedHook(hookBody()));
    const res = await precheck(w, PHONE, randomUUID(), '10.0.1.1');
    expect(res.status).toBe(429);
    expect(res.body?.code).toBe('OTP_RATE_LIMITED');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('limits requests per IP', async () => {
    const w = world();
    for (let i = 0; i < 10; i++) {
      expect((await precheck(w, `0803123450${i}`, randomUUID(), '9.9.9.9')).status).toBe(204);
    }
    expect((await precheck(w, '08031234599', randomUUID(), '9.9.9.9')).status).toBe(429);
  });
});

describe('POST /v1/auth/bootstrap', () => {
  const body = () => ({ deviceId: randomUUID(), platform: 'ANDROID', appVersion: '0.1.0' });

  it('requires a valid token', async () => {
    const w = world();
    expect((await w.call('POST', '/v1/auth/bootstrap', { body: body() })).status).toBe(401);
    const res = await w.app.request('/v1/auth/bootstrap', {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(401);
  });

  it('creates the profile for a brand-new driver, records the device and hashes the phone', async () => {
    const w = world();
    const userId = randomUUID();
    const sessionId = randomUUID();
    const b = body();
    const token = await tokenFor(userId, { phone: PHONE, sessionId });
    const res = await w.app.request('/v1/auth/bootstrap', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(b),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      isNewUser: boolean;
      user: { phoneLast4: string; profileComplete: boolean };
    };
    expect(json.isNewUser).toBe(true);
    expect(json.user.phoneLast4).toBe('4567');
    expect(json.user.profileComplete).toBe(false);

    expect(w.store.deviceRows[0]).toMatchObject({
      userId,
      clientDeviceId: b.deviceId,
      authSessionId: sessionId,
      platform: 'ANDROID',
    });
    const hash = w.store.userRows.get(userId)?.phoneHash;
    expect(hash?.equals(w.deps.crypto.lookupHash(PHONE))).toBe(true);
  });

  it('makes an email sign-up a driver only when a driver app asks (ADR 0015)', async () => {
    const w = world();
    const userId = randomUUID();
    const token = await tokenFor(userId, { email: 'ada@example.com' });
    const send = (extra: Record<string, unknown>) =>
      w.app.request('/v1/auth/bootstrap', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...body(), ...extra }),
      });
    const portal = (await (await send({})).json()) as { user: { roles: unknown[] } };
    expect(portal.user.roles).toEqual([]);
    const driver = (await (await send({ asDriver: true })).json()) as {
      user: { roles: unknown[] };
    };
    expect(driver.user.roles).toEqual([{ role: 'DRIVER', operatorId: null }]);
    await send({ asDriver: true });
    expect(await w.store.users.roles(userId)).toHaveLength(1);
  });

  it('blocks suspended accounts', async () => {
    const w = world();
    const id = w.user();
    await w.store.users.setStatus(id, 'SUSPENDED');
    const res = await w.call('POST', '/v1/auth/bootstrap', { as: id, body: body() });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('AUTH_ACCOUNT_LOCKED');
  });
});

describe('POST /v1/auth/sessions/revoke (FR-AUTH-006)', () => {
  it('signs out this device only', async () => {
    const w = world();
    const id = w.user();
    const sessionId = randomUUID();
    await w.store.devices.upsert({
      userId: id,
      clientDeviceId: randomUUID(),
      platform: 'ANDROID',
      appVersion: null,
      authSessionId: sessionId,
    });
    await w.store.devices.upsert({
      userId: id,
      clientDeviceId: randomUUID(),
      platform: 'WEB',
      appVersion: null,
      authSessionId: randomUUID(),
    });

    const res = await w.call('POST', '/v1/auth/sessions/revoke', {
      as: id,
      sessionId,
      body: { scope: 'device' },
    });
    expect(res.status).toBe(204);
    expect(w.store.deviceRows.filter((d) => d.revokedAt)).toHaveLength(1);
    expect(w.sessions.calls[0]?.scope).toBe('local');
  });

  it('signs out every device', async () => {
    const w = world();
    const id = w.user();
    for (let i = 0; i < 2; i++) {
      await w.store.devices.upsert({
        userId: id,
        clientDeviceId: randomUUID(),
        platform: 'ANDROID',
        appVersion: null,
        authSessionId: randomUUID(),
      });
    }
    expect(
      (await w.call('POST', '/v1/auth/sessions/revoke', { as: id, body: { scope: 'all' } })).status,
    ).toBe(204);
    expect(w.store.deviceRows.every((d) => d.revokedAt)).toBe(true);
    expect(w.sessions.calls[0]?.scope).toBe('global');
  });
});
