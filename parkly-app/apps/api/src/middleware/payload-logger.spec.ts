import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { payloadLogger, sanitizePayload } from './payload-logger.js';

describe('sanitizePayload', () => {
  it('handles primitives, null, and undefined', () => {
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeUndefined();
    expect(sanitizePayload('hello')).toBe('hello');
    expect(sanitizePayload(123)).toBe(123);
    expect(sanitizePayload(true)).toBe(true);
  });

  it('redacts sensitive fields and masks phone', () => {
    const raw = {
      name: 'Adebayo',
      email: 'driver@parkly.ng',
      phone: '+2348012345678',
      password: 'mypassword123',
      secretKey: 'topsecret',
      otp: '123456',
      token: 'jwt-access-token',
      refreshToken: 'refresh-jwt',
      authorization: 'Bearer token',
      cookie: 'session=xyz',
      cardNumber: '5399831234567890',
      accountNumber: '0123456789',
    };

    const sanitized = sanitizePayload(raw) as Record<string, unknown>;
    expect(sanitized.name).toBe('Adebayo');
    expect(sanitized.email).toBe('driver@parkly.ng');
    expect(sanitized.phone).toContain('****');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.secretKey).toBe('[REDACTED]');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.refreshToken).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized.cardNumber).toBe('[REDACTED]');
    expect(sanitized.accountNumber).toBe('[REDACTED]');
  });

  it('recursively sanitizes nested objects and arrays', () => {
    const nested = {
      users: [
        { name: 'User 1', password: 'secret1' },
        { name: 'User 2', otp: '999999' },
      ],
      meta: {
        token: 'abc',
        detail: { key: 'val' },
      },
    };

    const sanitized = sanitizePayload(nested) as {
      users: { password?: string; otp?: string }[];
      meta: { token?: string; detail: { key: string } };
    };
    expect(sanitized.users[0]?.password).toBe('[REDACTED]');
    expect(sanitized.users[1]?.otp).toBe('[REDACTED]');
    expect(sanitized.meta.token).toBe('[REDACTED]');
    expect(sanitized.meta.detail.key).toBe('val');
  });
});

describe('payloadLogger middleware', () => {
  it('skips health routes without logging', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', payloadLogger());
    app.get('/health/live', (c) => c.text('ok'));

    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('logs request and response with query and json body', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', payloadLogger());
    app.post('/api/test', async (c) => {
      const body = await c.req.json();
      return c.json({ received: body, ok: true }, 201);
    });

    const res = await app.request('/api/test?filter=recent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-123',
      },
      body: JSON.stringify({ name: 'Parkly', password: 'secret' }),
    });

    expect(res.status).toBe(201);
    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((c) => c.includes('--> [API REQ] POST /api/test'))).toBe(true);
    expect(calls.some((c) => c.includes('<-- [API RES] 201 POST /api/test'))).toBe(true);
    logSpy.mockRestore();
  });

  it('handles non-json bodies and responses gracefully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', payloadLogger());
    app.post('/api/text', async (c) => {
      return c.text('plain text result', 400);
    });

    const res = await app.request('/api/text', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'non-json string',
    });

    expect(res.status).toBe(400);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
