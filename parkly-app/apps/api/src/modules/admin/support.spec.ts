import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addLiveLot, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos; the booking is 10:00–12:00 Lagos.
const START = '2026-10-19T09:00:00.000Z';
const END = '2026-10-19T11:00:00.000Z';
const PHONE = '+2348031234567';

async function setup() {
  const w = world();
  const { lot } = await addLiveLot(w.store);
  const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Ada');
  // The driver's contact as bootstrap stores it: blind index, last 4, encrypted copies.
  Object.assign(w.store.userRows.get(driver) ?? {}, {
    phoneLast4: '4567',
    phoneHash: w.deps.crypto.lookupHash(PHONE),
    phoneEnc: w.deps.crypto.encrypt(PHONE),
    emailEnc: w.deps.crypto.encrypt('ada@example.com'),
  });
  const vehicle = await w.store.vehicles.create({
    userId: driver,
    plateRaw: 'LND 123 AB',
    plateNorm: 'LND123AB',
    make: null,
    model: null,
    colour: null,
    isDefault: true,
  });
  const created = await w.call('POST', '/v1/bookings', {
    as: driver,
    headers: { 'idempotency-key': randomUUID() },
    body: { lotId: lot.id, vehicleId: vehicle.id, startAt: START, endAt: END },
  });
  const reference = (created.body?.payment as { reference: string }).reference;
  w.payments.pay(reference);
  await w.call('POST', `/v1/payments/${reference}/verify`, { as: driver });
  const booking = created.body?.booking as { id: string; code: string };
  const staff = (role: 'ADMIN_SUPPORT' | 'ADMIN_COMPLIANCE' | 'ADMIN_FINANCE') => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const search = (q: string, as = staff('ADMIN_SUPPORT')) =>
    w.call('GET', `/v1/admin/support/search?q=${encodeURIComponent(q)}`, as);
  return { w, driver, booking, reference, staff, search };
}

describe('support search (FR-ADM-002)', () => {
  it('finds the booking by code, phone, plate or payment reference, masked', async () => {
    const t = await setup();
    for (const [q, kind] of [
      [t.booking.code.toLowerCase(), 'CODE'],
      ['0803 123 4567', 'PHONE'],
      ['lnd-123-ab', 'PLATE'],
      [t.reference, 'REFERENCE'],
    ] as const) {
      const res = await t.search(q);
      expect(res.status, q).toBe(200);
      expect(res.body?.kind).toBe(kind);
      expect(res.body?.items).toEqual([
        expect.objectContaining({
          id: t.booking.id,
          code: t.booking.code,
          status: 'CONFIRMED',
          lotName: 'Eko Hotel Car Park',
          operatorName: 'Eko Parking',
          plate: 'LND123AB',
          driver: { firstName: 'Ada', phoneMasked: '+234 *** *** 4567', hasEmail: true },
        }),
      ]);
      // The full number and email never appear in search results.
      expect(JSON.stringify(res.body)).not.toContain('8031234567');
      expect(JSON.stringify(res.body)).not.toContain('ada@example.com');
    }
  });

  it('records phone searches in the audit log, without the number', async () => {
    const t = await setup();
    await t.search('08031234567');
    const row = t.w.store.auditRows.at(-1);
    expect(row).toMatchObject({ action: 'support.phone_searched', after: { results: 1 } });
    expect(JSON.stringify(row)).not.toContain('8031234567');
  });

  it('returns nothing for an unknown or unusable query', async () => {
    const t = await setup();
    expect((await t.search('PK-ZZZZZZ')).body?.items).toEqual([]);
    expect((await t.search('hello there')).body).toEqual({ kind: 'INVALID', items: [] });
    expect((await t.search('abc')).status).toBe(400);
  });

  it('is for support, ops and finance; compliance and drivers are refused', async () => {
    const t = await setup();
    expect((await t.search(t.booking.code, t.staff('ADMIN_FINANCE'))).status).toBe(200);
    expect((await t.search(t.booking.code, t.staff('ADMIN_COMPLIANCE'))).status).toBe(403);
    expect((await t.search(t.booking.code, { as: t.driver, aal: 'aal2' })).status).toBe(403);
  });
});

describe('booking detail and timeline (FR-ADM-002)', () => {
  it('tells the booking’s story from checkout to confirmation', async () => {
    const t = await setup();
    const res = await t.w.call(
      'GET',
      `/v1/admin/bookings/${t.booking.id}/support`,
      t.staff('ADMIN_SUPPORT'),
    );
    expect(res.status).toBe(200);
    expect(res.body?.booking).toMatchObject({ id: t.booking.id, status: 'CONFIRMED' });
    expect(res.body?.supportRefundLeftKobo).toBe(110_000);
    const labels = (res.body?.timeline as { label: string }[]).map((e) => e.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Pending payment',
        'Booking checkout started',
        'Booking paid',
        'Pending payment → confirmed',
      ]),
    );
    expect(
      (
        await t.w.call(
          'GET',
          `/v1/admin/bookings/${randomUUID()}/support`,
          t.staff('ADMIN_SUPPORT'),
        )
      ).status,
    ).toBe(404);

    // Timeline includes refunds and overstay session when present
    await t.w.store.payments.refundBooking(
      t.booking.id,
      {
        amountKobo: 20_000,
        refundPriceKobo: 20_000,
        refundServiceFeeKobo: 0,
        reason: 'OPS_GOODWILL',
        note: 'Partial refund',
        approvedBy: null,
      },
      'system',
      new Date(),
    );
    t.w.store.attending.sessionRows.push({
      id: randomUUID(),
      bookingId: t.booking.id,
      lotId: 'lot-1',
      checkInAt: new Date(),
      checkOutAt: null,
      flags: [],
      plateNorm: 'LND123AB',
      overstayMinutes: 15,
      overstayAmountKobo: 50_000,
      overstayStatus: 'DUE',
    });
    const withDetails = await t.w.call(
      'GET',
      `/v1/admin/bookings/${t.booking.id}/support`,
      t.staff('ADMIN_SUPPORT'),
    );
    expect(withDetails.status).toBe(200);
    expect(withDetails.body?.overstay).toEqual({
      status: 'DUE',
      minutes: 15,
      amountKobo: 50_000,
    });
    expect(withDetails.body?.refundableKobo).toBe(90_000);
    expect(withDetails.body?.supportRefundLeftKobo).toBe(90_000);
  });
});

describe('revealing a driver’s contact (FR-ADM-002)', () => {
  it('shows the full phone or email only with a reason, and audits it first', async () => {
    const t = await setup();
    const reveal = (field: 'phone' | 'email', reason: string, as = t.staff('ADMIN_SUPPORT')) =>
      t.w.call('POST', `/v1/admin/bookings/${t.booking.id}/reveal`, {
        ...as,
        body: { field, reason },
      });

    const phone = await reveal('phone', 'Driver called: gate refused entry');
    expect(phone.body).toEqual({ field: 'phone', value: PHONE });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'booking.contact_revealed',
      entityId: t.booking.id,
      after: { field: 'phone', reason: 'Driver called: gate refused entry', driverId: t.driver },
    });
    expect(JSON.stringify(t.w.store.auditRows.at(-1))).not.toContain('8031234567');

    expect((await reveal('email', 'Send the receipt again')).body).toEqual({
      field: 'email',
      value: 'ada@example.com',
    });
    expect((await reveal('phone', 'no')).status).toBe(400);
    expect((await reveal('phone', 'compliance wants it', t.staff('ADMIN_COMPLIANCE'))).status).toBe(
      403,
    );
  });
});

describe('admin booking list (FR-BOOK-008)', () => {
  it('lists recent bookings or filters by code', async () => {
    const t = await setup();
    const support = t.staff('ADMIN_SUPPORT');
    const recent = await t.w.call('GET', '/v1/admin/bookings', support);
    expect(recent.status).toBe(200);
    expect(recent.body?.items).toHaveLength(1);

    const byCode = (await t.w.call(
      'GET',
      `/v1/admin/bookings?code=${t.booking.code}`,
      support,
    )) as { body?: { items?: { code: string }[] }; status: number };
    expect(byCode.status).toBe(200);
    expect(byCode.body?.items?.[0]?.code).toBe(t.booking.code);

    const notFound = (await t.w.call('GET', '/v1/admin/bookings?code=PK-UNKNOWN', support)) as {
      body?: { items?: unknown[] };
      status: number;
    };
    expect(notFound.status).toBe(200);
    expect(notFound.body?.items).toEqual([]);
  });
});
