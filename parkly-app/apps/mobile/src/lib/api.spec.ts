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

describe('driver discovery', () => {
  const quote = {
    product: 'HOURLY',
    priceKobo: 500_000,
    serviceFeeKobo: 10_000,
    totalKobo: 510_000,
    lines: [{ kind: 'SERVICE_FEE', amountKobo: 10_000 }],
  };

  it('searches with the window in the query and parses results', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: { items: [], radiusM: 2000 } }]);
    const res = await client(fetch).searchLots({
      lat: 6.4281,
      lng: 3.4219,
      radiusM: 2000,
      startAt: '2026-10-23T07:00:00.000Z',
      endAt: '2026-10-23T17:00:00.000Z',
      product: 'HOURLY',
      sort: 'distance',
    });
    expect(res).toEqual({ items: [], radiusM: 2000 });
    const url = new URL(calls[0]?.url ?? '');
    expect(url.pathname).toBe('/v1/lots/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      lat: '6.4281',
      radiusM: '2000',
      product: 'HOURLY',
    });
  });

  it('asks the server for the price and shows its errors in plain words', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: quote },
      { status: 422, body: { code: 'BOOKING_OUTSIDE_OPENING_HOURS' } },
    ]);
    const api = client(fetch);
    const window = {
      product: 'HOURLY' as const,
      startAt: '2026-10-23T07:00:00.000Z',
      endAt: '2026-10-23T17:00:00.000Z',
    };
    expect((await api.quote('lot-1', window)).totalKobo).toBe(510_000);
    expect(calls[0]?.url).toBe('http://api.test/v1/lots/lot-1/quote');
    await expect(api.quote('lot-1', window)).rejects.toMatchObject({
      code: 'BOOKING_OUTSIDE_OPENING_HOURS',
      message: 'The car park is closed for part of that time. Check its opening hours.',
    });
  });
});

describe('place search', () => {
  it('asks the API (never the provider) and returns suggestions with coordinates', async () => {
    const { fetch, calls } = fakeFetch([
      {
        status: 200,
        body: {
          items: [
            { id: 'p1', label: 'Eko Hotel', detail: 'Victoria Island', lat: 6.4247, lng: 3.4284 },
          ],
        },
      },
    ]);
    const items = await client(fetch).places('eko hotel');
    expect(items[0]).toMatchObject({ label: 'Eko Hotel', lat: 6.4247 });
    expect(calls[0]?.url).toBe('http://api.test/v1/places/autocomplete?q=eko+hotel');
  });

  it('sends the Idempotency-Key when booking and asks the server to verify payment', async () => {
    const booking = {
      id: '0199f0a0-0000-7000-8000-0000000000b1',
      code: 'PK-7HQ4MZ',
      status: 'PENDING_PAYMENT',
      product: 'HOURLY',
      startAt: '2026-10-20T07:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      holdExpiresAt: '2026-10-19T08:10:00.000Z',
      lot: {
        id: '0199f0a0-0000-7000-8000-0000000000a1',
        slug: 'eko',
        name: 'Eko Hotel Car Park',
        addressLine: 'VI',
        selfCheckIn: false,
      },
      vehicle: { id: vehicle.id, plate: 'LND123AB' },
      priceKobo: 100000,
      serviceFeeKobo: 10000,
      totalKobo: 110000,
      lines: [],
      qrToken: null,
      overstay: null,
      stay: null,
      createdAt: '2026-10-19T08:00:00.000Z',
    };
    const payment = {
      reference: '0199f0a0-0000-7000-8000-0000000000c1',
      status: 'PENDING',
      authorizationUrl: 'https://checkout.paystack.com/x',
      expiresAt: '2026-10-19T08:10:00.000Z',
    };
    const { fetch, calls } = fakeFetch([
      { status: 201, body: { booking, payment } },
      { status: 200, body: { booking, payment } },
    ]);
    const c = client(fetch);
    const created = await c.createBooking(
      {
        lotId: booking.lot.id,
        vehicleId: vehicle.id,
        product: 'HOURLY',
        startAt: booking.startAt,
        endAt: booking.endAt,
      },
      'key-123456',
    );
    expect(created.payment.authorizationUrl).toBe('https://checkout.paystack.com/x');
    expect((calls[0]?.init.headers as Record<string, string>)['idempotency-key']).toBe(
      'key-123456',
    );
    await c.verifyPayment(payment.reference);
    expect(calls[1]?.url).toBe(`http://api.test/v1/payments/${payment.reference}/verify`);
    expect(calls[1]?.init.method).toBe('POST');
  });

  it('supports extension, cancellation, overstay pay, and receipt lifecycle methods', async () => {
    const booking = {
      id: '0199f0a0-0000-7000-8000-0000000000b1',
      code: 'PK-X1Y2Z3',
      status: 'CONFIRMED',
      product: 'HOURLY',
      startAt: '2026-10-19T09:00:00.000Z',
      endAt: '2026-10-19T11:00:00.000Z',
      lot: {
        id: '0199f0a0-0000-7000-8000-000000000001',
        slug: 'eko-hotel',
        name: 'Eko Hotel',
        addressLine: '1415 Adetokunbo Ademola St',
        selfCheckIn: true,
      },
      vehicle: { id: vehicle.id, plate: vehicle.plateNorm },
      priceKobo: 100000,
      serviceFeeKobo: 10000,
      totalKobo: 110000,
      lines: [],
      holdExpiresAt: null,
      qrToken: null,
      overstay: null,
      stay: null,
      createdAt: '2026-10-19T08:00:00.000Z',
    };
    const extension = {
      id: '0199f0a0-0000-7000-8000-0000000000e1',
      bookingId: booking.id,
      startAt: booking.endAt,
      newEndAt: '2026-10-19T12:00:00.000Z',
      addedMinutes: 60,
      priceKobo: 50000,
      status: 'CONFIRMED',
      createdAt: '2026-10-19T10:00:00.000Z',
    };
    const payment = {
      reference: '0199f0a0-0000-7000-8000-0000000000c2',
      status: 'PENDING',
      authorizationUrl: 'https://checkout.paystack.com/ext',
      expiresAt: '2026-10-19T10:10:00.000Z',
    };
    const receipt = {
      bookingId: booking.id,
      bookingCode: booking.code,
      status: 'CONFIRMED',
      receiptNumber: 'R-000001',
      revision: 1,
      issuedAt: '2026-10-19T10:00:00.000Z',
      revisedAt: '2026-10-19T10:00:00.000Z',
      issuer: { name: 'Eko Parking' },
      lot: {
        id: booking.lot.id,
        name: booking.lot.name,
        addressLine: booking.lot.addressLine,
        area: 'VI',
        permitNumber: null,
      },
      vehicle: { plate: booking.vehicle.plate },
      driver: { firstName: 'Tunde', lastName: 'Bakare', phoneLast4: '1234' },
      product: 'HOURLY',
      startAt: booking.startAt,
      endAt: booking.endAt,
      durationMinutes: 120,
      priceKobo: 100000,
      serviceFeeKobo: 10000,
      totalKobo: 110000,
      lines: [],
      charges: [],
      totals: { chargedKobo: 110000, refundedKobo: 0, refundPendingKobo: 0 },
      vat: null,
      payments: [],
      refunds: [],
    };

    const { fetch, calls } = fakeFetch([
      // 1. extendBooking
      { status: 200, body: { extension, booking, payment } },
      // 2. cancelBooking
      {
        status: 200,
        body: {
          booking: { ...booking, status: 'CANCELLED' },
          refundKobo: 110000,
          isFreeCancellation: true,
        },
      },
      // 3. payOverstay
      { status: 200, body: { payment, overstayMinutes: 30, amountKobo: 25000 } },
      // 4. receipt, then a signed receipt link
      { status: 200, body: receipt },
      {
        status: 200,
        body: {
          url: 'http://api.test/v1/receipts/b?exp=1&sig=s',
          expiresAt: '2026-10-19T08:05:00.000Z',
        },
      },
      // 5. registerDevice
      { status: 204 },
    ]);

    const c = client(fetch);

    // 1. Extend
    const extRes = await c.extendBooking(
      booking.id,
      { newEndAt: '2026-10-19T12:00:00.000Z' },
      'ext-key-1',
    );
    expect(extRes.extension.addedMinutes).toBe(60);
    expect((calls[0]?.init.headers as Record<string, string>)['idempotency-key']).toBe('ext-key-1');

    // 2. Cancel
    const canRes = await c.cancelBooking(booking.id, { reason: 'CHANGE_OF_PLANS' }, 'can-key-1');
    expect(canRes.isFreeCancellation).toBe(true);
    expect(canRes.refundKobo).toBe(110000);

    // 3. Pay overstay
    const ovrRes = await c.payOverstay(booking.id, {}, 'ovr-key-1');
    expect(ovrRes.amountKobo).toBe(25000);

    // 4. Receipt
    const recRes = await c.receipt(booking.id);
    expect(recRes.bookingCode).toBe('PK-X1Y2Z3');
    expect(await c.receiptUrl(booking.id)).toBe('http://api.test/v1/receipts/b?exp=1&sig=s');
    expect(calls[4]?.url).toBe(`http://api.test/v1/bookings/${booking.id}/receipt-link`);

    // 5. Register device
    await c.registerDevice({ deviceId: 'dev-1', platform: 'ANDROID', pushToken: 'push-tok' });
    expect(calls[5]?.url).toBe('http://api.test/v1/me/devices');
  });
});
