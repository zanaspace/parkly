import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import type { AppDeps } from '../../app.js';
import { testDeps, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos. Tomorrow 08:00–10:00 Lagos:
const START = '2026-10-20T07:00:00.000Z';
const END = '2026-10-20T09:00:00.000Z';

/** A LIVE lot built the way S2 does, ₦500/hour, open 06:00–22:00 on weekdays. */
async function addLot(store: MemoryStore, opts: { capacity?: number; subaccount?: boolean } = {}) {
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
    addressLine: '1415 Adetokunbo Ademola St',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    location: { lat: 6.4281, lng: 3.4219 },
    entranceNotes: null,
    capacityTotal: 50,
    capacityBookable: opts.capacity ?? 20,
    amenities: [],
    vehicleTypes: ['CAR'],
    createdBy: ownerId,
  });
  const reviewer = { reviewerId: ownerId, at: new Date('2026-10-10T10:00:00Z') };
  const permit = await store.permits.create({
    lotId: lot.id,
    permitNumber: 'LASPA/VI/2026/0012',
    issuedAt: '2026-01-10',
    expiresAt: '2027-01-09',
    documentFileId: randomUUID(),
    submittedBy: ownerId,
  });
  await store.permits.approve(permit.id, { ...reviewer, note: 'checked' });
  const visit = await store.verifications.create({
    lotId: lot.id,
    inspectorUserId: ownerId,
    inspectedAt: new Date('2026-10-09T10:00:00Z'),
    capacityCounted: 50,
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
    [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      is24h: false,
      opensAt: '06:00',
      closesAt: '22:00',
    })),
  );
  if (opts.subaccount !== false)
    store.payoutRows.set(op.id, {
      operatorId: op.id,
      bankCode: '058',
      bankName: 'GTBank',
      accountNumberLast4: '6789',
      accountName: 'EKO PARKING LTD',
      pendingAccountNumberEnc: null,
      nameMismatch: false,
      providerSubaccountCode: 'ACCT_eko',
      status: 'ACTIVE',
      verifiedAt: new Date('2026-10-01T10:00:00Z'),
    });
  await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
  await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
  return { lot, operatorId: op.id };
}

async function setup(opts: Parameters<typeof addLot>[1] = {}, overrides: Partial<AppDeps> = {}) {
  const w = world(overrides);
  const { lot, operatorId } = await addLot(w.store, opts);
  const newDriver = async () => {
    const id = w.user();
    const vehicle = await w.store.vehicles.create({
      userId: id,
      plateRaw: 'LND 123 AB',
      plateNorm: 'LND123AB',
      make: null,
      model: null,
      colour: null,
      isDefault: true,
    });
    return { id, vehicleId: vehicle.id };
  };
  const book = (
    driver: { id: string; vehicleId: string },
    key: string = randomUUID(),
    body: Record<string, unknown> = {},
  ) =>
    w.call('POST', '/v1/bookings', {
      as: driver.id,
      headers: { 'idempotency-key': key },
      body: { lotId: lot.id, vehicleId: driver.vehicleId, startAt: START, endAt: END, ...body },
    });
  return { ...w, lot, operatorId, newDriver, book };
}

type Created = {
  booking: { id: string; code: string; status: string; totalKobo: number; holdExpiresAt: string };
  payment: { reference: string; status: string; authorizationUrl: string };
};

describe('POST /v1/bookings (FR-BOOK-001)', () => {
  it('holds a space, prices it on the server and starts a split checkout', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const res = await t.book(driver);
    expect(res.status).toBe(201);
    const body = res.body as unknown as Created;
    expect(body.booking).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalKobo: 110_000, // 2 h × ₦500 + ₦100 fee
      holdExpiresAt: '2026-10-19T08:10:00.000Z',
    });
    expect(body.booking.code).toMatch(/^PK-[A-Z2-9]{6}$/);
    expect(body.payment).toMatchObject({
      status: 'PENDING',
      authorizationUrl: `https://checkout.fake/${body.payment.reference}`,
    });
    expect(t.payments.initialized).toEqual([
      expect.objectContaining({
        reference: body.payment.reference,
        amountKobo: 110_000,
        subaccountCode: 'ACCT_eko',
        platformShareKobo: 22_000, // 12% of ₦1,000 + ₦100 fee
      }),
    ]);
    const slots = t.store.slotRows.filter((s) => s.lotId === t.lot.id);
    expect(slots).toHaveLength(8);
    expect(slots.every((s) => s.held === 1)).toBe(true);
  });

  it('needs an Idempotency-Key and replays the first answer for a repeat', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const missing = await t.call('POST', '/v1/bookings', {
      as: driver.id,
      body: { lotId: t.lot.id, vehicleId: driver.vehicleId, startAt: START, endAt: END },
    });
    expect(missing.status).toBe(400);
    expect(missing.body?.code).toBe('IDEMPOTENCY_KEY_MISSING');

    const key = randomUUID();
    const first = await t.book(driver, key);
    const again = await t.book(driver, key);
    expect(again.status).toBe(201);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(t.payments.initialized).toHaveLength(1);

    const other = await t.book(driver, key, { endAt: '2026-10-20T10:00:00.000Z' });
    expect(other.status).toBe(409);
    expect(other.body?.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('refuses when the lot is full, and the same car twice', async () => {
    const t = await setup({ capacity: 1 });
    const first = await t.newDriver();
    expect((await t.book(first)).status).toBe(201);
    const again = await t.book(first);
    expect(again.body?.code).toBe('BOOKING_OVERLAP_SAME_VEHICLE');
    const second = await t.newDriver();
    const full = await t.book(second);
    expect(full.status).toBe(409);
    expect(full.body?.code).toBe('BOOKING_SLOT_UNAVAILABLE');
  });

  it('checks the window, opening hours and the driver’s own car', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    expect(
      (await t.book(driver, undefined, { startAt: '2026-10-20T07:10:00.000Z' })).body?.code,
    ).toBe('BOOKING_WINDOW_INVALID');
    // Saturday: closed.
    expect(
      (
        await t.book(driver, undefined, {
          startAt: '2026-10-24T07:00:00.000Z',
          endAt: '2026-10-24T09:00:00.000Z',
        })
      ).body?.code,
    ).toBe('BOOKING_OUTSIDE_OPENING_HOURS');
    const someoneElse = await t.newDriver();
    const res = await t.book(driver, undefined, { vehicleId: someoneElse.vehicleId });
    expect(res.status).toBe(404);
    expect((await t.book(driver, undefined, { lotId: randomUUID() })).body?.code).toBe(
      'LOT_NOT_BOOKABLE',
    );
  });

  it('gives the space back when checkout cannot start', async () => {
    const t = await setup({ capacity: 1 });
    const driver = await t.newDriver();
    t.payments.failInitialize = true;
    const res = await t.book(driver);
    expect(res.status).toBe(502);
    expect(res.body?.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(t.store.booking.bookingRows[0]?.status).toBe('EXPIRED');
    expect(t.store.slotRows.every((s) => s.held === 0)).toBe(true);
    t.payments.failInitialize = false;
    expect((await t.book(driver)).status).toBe(201);
  });

  it('is for drivers only', async () => {
    const t = await setup();
    const owner = t.user([{ role: 'OPERATOR_OWNER', operatorId: t.operatorId }]);
    const res = await t.call('POST', '/v1/bookings', {
      as: owner,
      aal: 'aal2',
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: t.lot.id, vehicleId: randomUUID(), startAt: START, endAt: END },
    });
    expect(res.status).toBe(403);
    expect((await t.call('POST', '/v1/bookings', { body: {} })).status).toBe(401);
  });
});

describe('confirming a payment (FR-BOOK-003, FR-PAY-002)', () => {
  async function held(opts: Parameters<typeof addLot>[1] = {}) {
    const t = await setup(opts);
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    const verify = () =>
      t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });
    return { ...t, driver, created, verify };
  }

  it('stays pending until the provider says the charge succeeded', async () => {
    const t = await held();
    const res = await t.verify();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      payment: { status: 'PENDING' },
      booking: { status: 'PENDING_PAYMENT' },
    });
  });

  it('confirms on verify: slots booked, history and a balanced ledger', async () => {
    const t = await held();
    t.payments.pay(t.created.payment.reference);
    const res = await t.verify();
    expect(res.body).toMatchObject({
      payment: { status: 'SUCCEEDED', authorizationUrl: null },
      booking: { status: 'CONFIRMED', holdExpiresAt: null },
    });
    const slots = t.store.slotRows.filter((s) => s.lotId === t.lot.id);
    expect(slots.every((s) => s.held === 0 && s.booked === 1)).toBe(true);
    const ledger = t.store.booking.ledgerRows;
    const sum = (d: string) =>
      ledger.filter((l) => l.direction === d).reduce((a, l) => a + l.amountKobo, 0);
    expect(sum('DEBIT')).toBe(sum('CREDIT'));
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: `OPERATOR_PAYABLE:${t.operatorId}`,
          amountKobo: 88_000,
        }),
        expect.objectContaining({ account: 'PLATFORM_REVENUE_COMMISSION', amountKobo: 12_000 }),
        expect.objectContaining({ account: 'PLATFORM_REVENUE_SERVICE_FEE', amountKobo: 10_000 }),
        expect.objectContaining({ account: 'PAYMENT_FEES_EXPENSE', amountKobo: 1_500 }),
      ]),
    );
    // Asking again changes nothing.
    await t.verify();
    expect(t.store.booking.ledgerRows).toHaveLength(ledger.length);
  });

  it('never confirms a wrong amount', async () => {
    const t = await held();
    t.payments.pay(t.created.payment.reference, { amountKobo: 1_000 });
    const res = await t.verify();
    expect(res.body).toMatchObject({ booking: { status: 'PENDING_PAYMENT' } });
    expect(t.store.booking.ledgerRows).toEqual([]);
  });

  it('ends the hold when the charge fails', async () => {
    const t = await held({ capacity: 1 });
    t.payments.pay(t.created.payment.reference, { status: 'failed' });
    const res = await t.verify();
    expect(res.body).toMatchObject({
      payment: { status: 'FAILED' },
      booking: { status: 'EXPIRED' },
    });
    expect(t.store.slotRows.every((s) => s.held === 0)).toBe(true);
  });

  it('hides other drivers’ payments and bookings', async () => {
    const t = await held();
    const other = await t.newDriver();
    const res = await t.call('POST', `/v1/payments/${t.created.payment.reference}/verify`, {
      as: other.id,
    });
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('PAYMENT_NOT_FOUND');
    const view = await t.call('GET', `/v1/bookings/${t.created.booking.id}`, { as: other.id });
    expect(view.body?.code).toBe('BOOKING_NOT_FOUND');
  });

  it('lists upcoming and past bookings', async () => {
    const t = await held();
    const mine = await t.call('GET', `/v1/bookings/${t.created.booking.id}`, { as: t.driver.id });
    expect(mine.body).toMatchObject({
      code: t.created.booking.code,
      lot: { name: 'Eko Hotel Car Park' },
    });
    const upcoming = await t.call('GET', '/v1/bookings', { as: t.driver.id });
    expect((upcoming.body?.items as unknown[]).length).toBe(1);
    const past = await t.call('GET', '/v1/bookings?status=past', { as: t.driver.id });
    expect(past.body?.items).toEqual([]);
  });
});

describe('POST /v1/webhooks/paystack (doc 02 §7)', () => {
  const event = (reference: string) =>
    JSON.stringify({ event: 'charge.success', data: { id: 77, reference, status: 'success' } });

  it('rejects a bad signature with 401 and stores nothing', async () => {
    const t = await setup();
    const res = await t.app.request('/v1/webhooks/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': 'forged', 'content-type': 'application/json' },
      body: event(randomUUID()),
    });
    expect(res.status).toBe(401);
    expect(t.store.booking.webhookRows).toEqual([]);
  });

  it('confirms through verify, once, however often the event arrives', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    const send = () =>
      t.app.request('/v1/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': 'valid', 'content-type': 'application/json' },
        body: event(created.payment.reference),
      });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(t.store.booking.webhookRows).toHaveLength(1);
    expect(t.store.booking.webhookRows[0]?.status).toBe('PROCESSED');
    expect(t.store.booking.bookingRows[0]?.status).toBe('CONFIRMED');
    expect(t.store.booking.historyRows.filter((h) => h.to === 'CONFIRMED')).toHaveLength(1);
  });

  it('refunds a payment that arrives after the hold expired and the space is gone', async () => {
    const t = await setup({ capacity: 1 });
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    // The hold ran out and someone else took the space.
    await t.store.bookings.releaseHold(created.booking.id, 'hold.expired', new Date());
    const rival = await t.newDriver();
    expect((await t.book(rival)).status).toBe(201);
    t.payments.pay(created.payment.reference);
    await t.app.request('/v1/webhooks/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': 'valid' },
      body: event(created.payment.reference),
    });
    expect(t.payments.refunds).toEqual([
      { reference: created.payment.reference, amountKobo: 110_000 },
    ]);
    expect(t.store.booking.refundRows[0]).toMatchObject({
      reason: 'HOLD_EXPIRED',
      providerRefundId: 'rf_1',
    });
    expect(t.store.booking.bookingRows[0]?.status).toBe('EXPIRED');
  });

  it('ignores events it does not act on', async () => {
    const t = await setup();
    const res = await t.app.request('/v1/webhooks/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': 'valid' },
      body: JSON.stringify({ event: 'transfer.success', data: { id: 1, reference: 'x' } }),
    });
    expect(res.status).toBe(200);
    expect(t.store.booking.webhookRows[0]?.status).toBe('IGNORED');
  });
});

describe('booking edge cases', () => {
  it('refuses a stay shorter than the lot minimum', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const res = await t.book(driver, undefined, { endAt: '2026-10-20T07:30:00.000Z' });
    expect(res.body?.code).toBe('PRICING_INVALID_DURATION');
  });

  it('takes payment without a split outside prod when the operator has no subaccount', async () => {
    const t = await setup({ subaccount: false });
    const driver = await t.newDriver();
    expect((await t.book(driver)).status).toBe(201);
    expect(t.payments.initialized[0]?.subaccountCode).toBeNull();
  });

  it('refuses such a lot in prod', async () => {
    const config = { ...testDeps().config, appEnv: 'prod' as const };
    const t = await setup({ subaccount: false }, { config });
    const driver = await t.newDriver();
    expect((await t.book(driver)).body?.code).toBe('LOT_NOT_BOOKABLE');
  });

  it('rejects a malformed Idempotency-Key', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const res = await t.book(driver, 'short');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION_FAILED');
  });

  it('answers verify from the database once settled, and 502 when the provider is down', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    const verify = () =>
      t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });
    const original = t.payments.verify.bind(t.payments);
    t.payments.verify = () => Promise.reject(new Error('down'));
    expect((await verify()).body?.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    t.payments.verify = original;
    t.payments.pay(created.payment.reference);
    expect((await verify()).body).toMatchObject({ booking: { status: 'CONFIRMED' } });
    t.payments.verify = () => Promise.reject(new Error('not called once settled'));
    expect((await verify()).body).toMatchObject({ payment: { status: 'SUCCEEDED' } });
    const unknown = await t.call('POST', `/v1/payments/${randomUUID()}/verify`, { as: driver.id });
    expect(unknown.body?.code).toBe('PAYMENT_NOT_FOUND');
    const missing = await t.call('GET', `/v1/bookings/${randomUUID()}`, { as: driver.id });
    expect(missing.body?.code).toBe('BOOKING_NOT_FOUND');
  });

  it('keeps a booking pending when the provider does not know the reference yet', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.verify = () => Promise.resolve(null);
    const res = await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, {
      as: driver.id,
    });
    expect(res.body).toMatchObject({ booking: { status: 'PENDING_PAYMENT' } });
  });

  it('webhooks: rejects a non-JSON body, ignores unknown references, survives failures', async () => {
    const t = await setup();
    const post = (body: string) =>
      t.app.request('/v1/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': 'valid' },
        body,
      });
    expect((await post('not json')).status).toBe(400);
    const unknown = JSON.stringify({
      event: 'charge.success',
      data: { id: 5, reference: randomUUID() },
    });
    expect((await post(unknown)).status).toBe(200);
    expect(t.store.booking.webhookRows.at(-1)).toMatchObject({
      status: 'IGNORED',
      error: 'unknown reference',
    });

    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.verify = () => Promise.reject(new Error('down'));
    const res = await post(
      JSON.stringify({
        event: 'charge.success',
        data: { id: 6, reference: created.payment.reference },
      }),
    );
    expect(res.status).toBe(200);
    expect(t.store.booking.webhookRows.at(-1)?.status).toBe('FAILED');
  });
});
