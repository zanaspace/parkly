import { describe, expect, it } from 'vitest';
import { createRoute, z } from '@hono/zod-openapi';
import type { Problem } from '@parkly/contracts';
import { ApiError } from './lib/errors.js';
import { testApp } from './test-helpers.js';

describe('health', () => {
  it('GET /health/live returns ok', async () => {
    const res = await testApp().request('/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready is ok when every check passes', async () => {
    const app = testApp({ readinessChecks: { db: async () => true, redis: async () => true } });
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });

  it('GET /health/ready is 503 degraded when a check fails or throws', async () => {
    const app = testApp({
      readinessChecks: {
        db: async () => false,
        redis: async () => {
          throw new Error('down');
        },
      },
    });
    const res = await app.request('/health/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', checks: { db: 'fail', redis: 'fail' } });
  });
});

describe('errors are RFC 9457 problem+json', () => {
  it('unknown route → 404 NOT_FOUND with request id', async () => {
    const res = await testApp().request('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = (await res.json()) as Problem;
    expect(body).toMatchObject({ status: 404, code: 'NOT_FOUND', instance: '/nope' });
    expect(body.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('ApiError maps to its catalogue status and code', async () => {
    const app = testApp();
    app.get('/boom', () => {
      throw new ApiError('BOOKING_SLOT_UNAVAILABLE', 'Lot is full');
    });
    const res = await app.request('/boom');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'BOOKING_SLOT_UNAVAILABLE',
      detail: 'Lot is full',
    });
  });

  it('invalid input → 400 VALIDATION_FAILED with field errors', async () => {
    const app = testApp();
    app.openapi(
      createRoute({
        method: 'get',
        path: '/echo',
        request: { query: z.object({ limit: z.coerce.number().int().max(100) }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({ limit: c.req.valid('query').limit }, 200),
    );
    const res = await app.request('/echo?limit=500');
    expect(res.status).toBe(400);
    const body = (await res.json()) as Problem;
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors?.[0]?.path).toBe('limit');
    expect((await app.request('/echo?limit=5')).status).toBe(200);
  });

  it('unexpected errors → 500 INTERNAL_ERROR without leaking the message', async () => {
    const app = testApp();
    app.get('/crash', () => {
      throw new Error('db password is hunter2');
    });
    const res = await app.request('/crash');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('hunter2');
  });

  it('reports unexpected errors to error tracking with the request id, but not 4xx errors', async () => {
    const reported: { err: unknown; requestId: string | undefined }[] = [];
    const app = testApp({
      reportError: (err, ctx) => reported.push({ err, requestId: ctx.requestId }),
    });
    app.get('/crash', () => {
      throw new Error('boom');
    });
    app.get('/conflict', () => {
      throw new ApiError('BOOKING_SLOT_UNAVAILABLE');
    });
    const res = await app.request('/crash');
    await app.request('/conflict');
    expect(reported).toHaveLength(1);
    expect(reported[0]?.requestId).toBe(res.headers.get('x-request-id'));
  });
});

describe('security middleware', () => {
  it('sets secure headers and a request id', async () => {
    const res = await testApp().request('/health/live');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('allows only configured CORS origins', async () => {
    const app = testApp();
    const ok = await app.request('/health/live', { headers: { origin: 'http://localhost:3000' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    const bad = await app.request('/health/live', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 429 RATE_LIMITED with Retry-After when the limiter denies', async () => {
    const app = testApp({
      rateLimiter: {
        limit: async () => ({ success: false, reset: Date.parse('2026-10-19T08:00:30Z') }),
      },
    });
    const res = await app.request('/health/live');
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
