import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './api';

const vehicle = {
  id: '0b8f3a8e-1d4c-4d5e-9f00-000000000001',
  plate: 'lnd 123-ab',
  plateNorm: 'LND123AB',
  make: null,
  model: null,
  colour: null,
  isDefault: true,
};

function fakeFetch(
  responses: { status: number; body?: unknown; headers?: Record<string, string> }[],
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new TypeError('Network request failed');
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: r.headers ?? {},
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const client = (f: typeof fetch, token: string | null = 'tok') =>
  createApiClient({
    baseUrl: 'http://api.test/',
    getAccessToken: async () => token,
    fetch: f,
    now: () => new Date('2026-10-19T08:00:00Z'),
  });

describe('api client', () => {
  it('sends the bearer token and JSON body, and parses responses with the contract schema', async () => {
    const { fetch, calls } = fakeFetch([{ status: 201, body: vehicle }]);
    const created = await client(fetch).addVehicle({ plate: 'lnd 123-ab' });
    expect(created.plateNorm).toBe('LND123AB');
    expect(calls[0]?.url).toBe('http://api.test/v1/me/vehicles');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    expect(headers['content-type']).toBe('application/json');
    expect(calls[0]?.init.body).toBe('{"plate":"lnd 123-ab"}');
  });

  it('omits the token when signed out and handles 204', async () => {
    const { fetch, calls } = fakeFetch([{ status: 204 }]);
    await client(fetch, null).precheckOtp('+2348031234567', 'd');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('turns problem+json into ApiError with friendly copy', async () => {
    const { fetch } = fakeFetch([
      { status: 409, body: { code: 'VEHICLE_DUPLICATE', status: 409 } },
    ]);
    const err = await client(fetch)
      .addVehicle({ plate: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: 'VEHICLE_DUPLICATE',
      message: 'This plate is already on your account.',
    });
  });

  it('reads Retry-After on 429', async () => {
    const { fetch } = fakeFetch([
      { status: 429, body: { code: 'OTP_RATE_LIMITED' }, headers: { 'retry-after': '90' } },
    ]);
    const err = (await client(fetch)
      .precheckOtp('+2348031234567', 'd')
      .catch((e: unknown) => e)) as ApiError;
    expect(err.retryAfterSec).toBe(90);
  });

  it('reports network failures as offline', async () => {
    const { fetch } = fakeFetch([]);
    const err = (await client(fetch)
      .me()
      .catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ status: 0, message: expect.stringMatching(/offline/) });
  });

  it('rejects responses that do not match the contract', async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { items: [{ id: 'not-a-uuid' }] } }]);
    await expect(client(fetch).vehicles()).rejects.toThrow();
  });
});
