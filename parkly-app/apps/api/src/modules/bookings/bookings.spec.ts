import { randomUUID } from 'node:crypto';
import type { Booking } from '@parkly/contracts';
import { verifyQrToken } from '@parkly/domain/qr';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import type { AppDeps } from '../../app.js';
import { settlePaymentsJob } from '../../jobs/settle-payments.js';
import { TEST_NOW, testDeps, world } from '../../test-helpers.js';
import { closedForExtensionDetail } from './routes.js';

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
  booking: Booking;
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

  it('takes a 5-minute test stay only when test stays are switched on (gap review L-2)', async () => {
    const fiveMin = { startAt: START, endAt: '2026-10-20T07:05:00.000Z' };
    const off = await setup();
    const res = await off.book(await off.newDriver(), undefined, fiveMin);
    expect(res.body?.code).toBe('BOOKING_WINDOW_INVALID');

    const on = await setup({}, { config: { ...testDeps().config, testShortStays: true } });
    expect((await on.book(await on.newDriver(), undefined, fiveMin)).status).toBe(201);
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

describe('booking from the website', () => {
  it('sends Paystack back to our own site only', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const ok = await t.book(driver, undefined, {
      source: 'WEB',
      returnTo: 'http://localhost:3000/bookings/paid',
    });
    expect(ok.status).toBe(201);
    expect(t.payments.initialized[0]?.callbackUrl).toBe('http://localhost:3000/bookings/paid');
    expect(t.store.booking.bookingRows[0]?.source).toBe('WEB');
    const other = await t.newDriver();
    const evil = await t.book(other, undefined, { returnTo: 'https://evil.example/steal' });
    expect(evil.status).toBe(400);
    expect(evil.body?.code).toBe('VALIDATION_FAILED');
  });
});

describe('QR ticket (doc 01 §7, ADR 0007)', () => {
  it('signs a ticket only once paid, with one key per lot, stored encrypted', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    const pending = await t.call('GET', `/v1/bookings/${created.booking.id}`, { as: driver.id });
    expect(pending.body?.qrToken).toBeNull();

    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });
    const paid = await t.call('GET', `/v1/bookings/${created.booking.id}`, { as: driver.id });
    const token = paid.body?.qrToken as string;
    expect(token).toMatch(/^PK1\./);

    const [key] = t.store.lotKeyRows;
    expect(t.store.lotKeyRows).toHaveLength(1);
    expect(key?.privateKeyCiphertext).not.toContain(token.split('.')[3] ?? '');
    const check = await verifyQrToken(token, {
      publicKeys: { [key?.kid ?? '']: new Uint8Array(key?.publicKey ?? []) },
      lotId: t.lot.id,
      now: new Date('2026-10-20T07:10:00Z'),
      earlyArrivalMin: 30,
      overstayAllowanceMin: 240,
    });
    expect(check).toMatchObject({
      ok: true,
      claims: { b: created.booking.id, p: 'LND123AB', c: created.booking.code },
    });

    // A second paid booking at the same lot uses the same key.
    const other = await t.newDriver();
    const second = (await t.book(other)).body as unknown as Created;
    t.payments.pay(second.payment.reference);
    await t.call('POST', `/v1/payments/${second.payment.reference}/verify`, { as: other.id });
    const list = await t.call('GET', '/v1/bookings', { as: other.id });
    expect((list.body?.items as { qrToken: string }[])[0]?.qrToken).toMatch(/^PK1\./);
    expect(t.store.lotKeyRows).toHaveLength(1);
  });
});

describe('settle-payments job (doc 02 §7.6)', () => {
  const deadline = new Date('2100-01-01T00:00:00Z');
  const later = (min: number) => () => new Date(TEST_NOW.getTime() + min * 60_000);

  it('confirms a paid checkout whose webhook never came', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    const job = settlePaymentsJob({ ...t.deps, now: later(1) });
    // Too early: the driver may still be on the Paystack page.
    expect(await job({ payload: {}, deadline })).toEqual({ processed: 0, remaining: 0 });
    const run = await settlePaymentsJob({ ...t.deps, now: later(3) })({ payload: {}, deadline });
    expect(run).toEqual({ processed: 1, remaining: 0 });
    expect(t.store.booking.bookingRows[0]?.status).toBe('CONFIRMED');
  });

  it('retries a failed webhook, at most five times', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    const original = t.payments.verify.bind(t.payments);
    t.payments.verify = () => Promise.reject(new Error('down'));
    await t.app.request('/v1/webhooks/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': 'valid' },
      body: JSON.stringify({
        event: 'charge.success',
        data: { id: 9, reference: created.payment.reference },
      }),
    });
    const row = t.store.booking.webhookRows[0];
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1 });
    const job = settlePaymentsJob({ ...t.deps, now: later(2) });
    for (let i = 0; i < 6; i++) await job({ payload: {}, deadline });
    expect(row?.attempts).toBe(5);
    t.payments.verify = original;
    // Recovered on the safety-net pass (open checkout), even though the event gave up.
    await settlePaymentsJob({ ...t.deps, now: later(3) })({ payload: {}, deadline });
    expect(t.store.booking.bookingRows[0]?.status).toBe('CONFIRMED');
  });

  it('marks a retried event for an unknown payment as ignored', async () => {
    const t = await setup();
    t.store.booking.webhookRows.push({
      id: randomUUID(),
      key: 'PAYSTACK:x',
      eventType: 'charge.success',
      reference: randomUUID(),
      receivedAt: TEST_NOW,
      attempts: 0,
      status: 'PENDING',
      error: null,
    });
    await settlePaymentsJob({ ...t.deps, now: later(2) })({ payload: {}, deadline });
    expect(t.store.booking.webhookRows[0]).toMatchObject({
      status: 'IGNORED',
      error: 'unknown reference',
    });
  });

  it('stops at the deadline and says what is left', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    await t.book(driver);
    const run = await settlePaymentsJob({ ...t.deps, now: later(3) })({
      payload: {},
      deadline: new Date(0),
    });
    expect(run).toEqual({ processed: 0, remaining: 1 });
  });
});

describe('Paystack webhook sender check (doc 02 §6.9)', () => {
  it('outside local, accepts only Paystack’s addresses', async () => {
    const config = { ...testDeps().config, appEnv: 'dev' as const };
    const t = await setup({}, { config });
    const send = (ip?: string) =>
      t.app.request('/v1/webhooks/paystack', {
        method: 'POST',
        headers: {
          'x-paystack-signature': 'valid',
          ...(ip ? { 'x-forwarded-for': `${ip}, 10.0.0.1` } : {}),
        },
        body: JSON.stringify({ event: 'transfer.success', data: { id: 1, reference: 'x' } }),
      });
    expect((await send()).status).toBe(403);
    expect((await send('203.0.113.9')).status).toBe(403);
    expect(t.store.booking.webhookRows).toEqual([]);
    expect((await send('52.31.139.75')).status).toBe(200);
  });
});

describe('Booking Extensions (FR-BOOK-005, doc 02 §4)', () => {
  it('extends a confirmed booking, creates an extension hold and starts checkout', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    // Confirm initial booking
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Extend by 1 hour (from 09:00 to 10:00 UTC)
    const newEnd = '2026-10-20T10:00:00.000Z';
    const extRes = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: newEnd },
    });
    expect(extRes.status).toBe(200);
    const body = extRes.body as any;
    expect(body.extension).toMatchObject({
      bookingId: created.booking.id,
      addedMinutes: 60,
      priceKobo: 50_000,
      status: 'PENDING_PAYMENT',
    });
    expect(body.payment).toMatchObject({
      status: 'PENDING',
      authorizationUrl: expect.stringContaining('https://checkout.fake/'),
    });

    // Verify payment for extension
    t.payments.pay(body.payment.reference);
    const verifyRes = await t.call('POST', `/v1/payments/${body.payment.reference}/verify`, {
      as: driver.id,
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body?.booking).toMatchObject({
      endAt: newEnd,
      priceKobo: 150_000, // ₦1,000 + ₦500
      totalKobo: 160_000, // ₦1,500 + ₦100 fee
    });
    const extRow = await t.store.bookings.findExtension(body.extension.id);
    expect(extRow?.status).toBe('CONFIRMED');
  });

  it('settles an extension payment once, and never on a short charge (gap review P-2, P-3)', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });
    const extend = async (newEndAt: string) =>
      (
        await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
          as: driver.id,
          headers: { 'idempotency-key': randomUUID() },
          body: { newEndAt },
        })
      ).body as unknown as { extension: { id: string }; payment: { reference: string } };
    const verify = (ref: string) => t.call('POST', `/v1/payments/${ref}/verify`, { as: driver.id });
    const linesFor = (ref: string) => t.store.booking.ledgerRows.filter((l) => l.paymentId === ref);

    const short = await extend('2026-10-20T10:00:00.000Z');
    t.payments.pay(short.payment.reference, { amountKobo: 100 });
    await verify(short.payment.reference);
    expect((await t.store.bookings.findExtension(short.extension.id))?.status).toBe(
      'PENDING_PAYMENT',
    );
    expect(linesFor(short.payment.reference)).toEqual([]);

    const paid = await extend('2026-10-20T10:00:00.000Z');
    t.payments.pay(paid.payment.reference);
    await verify(paid.payment.reference);
    const posted = linesFor(paid.payment.reference).length;
    expect(posted).toBeGreaterThan(0);
    // The webhook settles the same payment again after the app's verify.
    await verify(paid.payment.reference);
    expect(linesFor(paid.payment.reference)).toHaveLength(posted);
    expect((await t.store.bookings.findExtension(paid.extension.id))?.status).toBe('CONFIRMED');
  });

  it('holds one extension at a time and gives it back when it cannot go ahead (gap review P-4, P-5)', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });
    const extend = () =>
      t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
        as: driver.id,
        headers: { 'idempotency-key': randomUUID() },
        body: { newEndAt: '2026-10-20T10:00:00.000Z' },
      });
    const heldAfterEnd = () =>
      t.store.slotRows
        .filter((s) => s.lotId === t.lot.id && s.slotStart.toISOString() >= END)
        .reduce((n, s) => n + s.held, 0);

    for (let i = 0; i < 5; i++) await extend();
    expect(heldAfterEnd()).toBe(4); // one extension's four slots, not five times that

    t.payments.failInitialize = true;
    expect((await extend()).body?.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(heldAfterEnd()).toBe(0);
    t.payments.failInitialize = false;

    // Paid after the booking was cancelled: nothing to extend, so the money goes back.
    const late = (await extend()).body as unknown as { payment: { reference: string } };
    await t.call('POST', `/v1/bookings/${created.booking.id}/cancel`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(heldAfterEnd()).toBe(0);
    t.payments.pay(late.payment.reference);
    const res = await t.call('POST', `/v1/payments/${late.payment.reference}/verify`, {
      as: driver.id,
    });
    expect(res.body?.booking).toMatchObject({ status: 'CANCELLED', endAt: END });
    expect(t.payments.refunds).toEqual(
      expect.arrayContaining([{ reference: late.payment.reference, amountKobo: 50_000 }]),
    );
  });

  it('auto-confirms extension with null payment when daily cap is reached (₦0 incremental price)', async () => {
    const t = await setup();
    // Update rate plan with daily cap of 100_000 (₦1,000)
    t.store.ratePlanRows[0]!.dailyCapKobo = 100_000;

    const driver = await t.newDriver();
    // Book 2 hours: 2h * 500 = 1,000 -> hits the cap
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Extend by 1 hour (from 09:00 to 10:00 UTC) -> incremental quote is 0!
    const newEnd = '2026-10-20T10:00:00.000Z';
    const extRes = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: newEnd },
    });
    expect(extRes.status).toBe(200);
    const body = extRes.body as any;
    expect(body.extension).toMatchObject({
      bookingId: created.booking.id,
      addedMinutes: 60,
      priceKobo: 0,
      status: 'CONFIRMED',
    });
    expect(body.payment).toBeNull();
    expect(body.booking).toMatchObject({
      endAt: newEnd,
      priceKobo: 100_000,
    });
  });

  it('rejects extension if window is invalid or not slot-aligned', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Earlier or equal to endAt
    const invalidTime = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: END },
    });
    expect(invalidTime.status).toBe(400);
    expect(invalidTime.body?.code).toBe('BOOKING_WINDOW_INVALID');

    // Not aligned to 15-min slot
    const notAligned = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: '2026-10-20T09:07:00.000Z' },
    });
    expect(notAligned.status).toBe(400);
    expect(notAligned.body?.code).toBe('BOOKING_WINDOW_INVALID');
  });

  it('rejects extension if car park is closed during window', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Lot closes at 22:00 Lagos (21:00 UTC)
    const afterHours = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: '2026-10-20T22:00:00.000Z' },
    });
    expect(afterHours.status).toBe(422);
    expect(afterHours.body?.code).toBe('BOOKING_OUTSIDE_OPENING_HOURS');
    // Says exactly when it closes and reopens, in Lagos time.
    expect(afterHours.body?.detail).toBe('The car park closes at 22:00 and reopens Wed 06:00');
  });

  it('lists how far a stay can be extended before the car park closes', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    const res = await t.call('GET', `/v1/bookings/${created.booking.id}/extensions/options`, {
      as: driver.id,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      extendable: true,
      extendableUntil: '2026-10-20T21:00:00.000Z', // 22:00 Lagos
      closesAt: '2026-10-20T21:00:00.000Z',
      reopensAt: '2026-10-21T05:00:00.000Z', // Wed 06:00 Lagos
      maxEndAt: '2026-10-21T07:00:00.000Z', // start + 24h
    });
  });

  it('runs through back-to-back 24-hour days up to the longest stay allowed', async () => {
    const t = await setup();
    await t.store.lots.setOpeningHours(
      t.lot.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        is24h: true,
        opensAt: null,
        closesAt: null,
      })),
    );
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    const res = await t.call('GET', `/v1/bookings/${created.booking.id}/extensions/options`, {
      as: driver.id,
    });
    expect(res.body).toMatchObject({
      extendable: true,
      extendableUntil: '2026-10-21T07:00:00.000Z',
      closesAt: null,
      reopensAt: null,
    });
  });

  it('offers nothing for an unpaid booking and hides other drivers’ bookings', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;

    const unpaid = await t.call('GET', `/v1/bookings/${created.booking.id}/extensions/options`, {
      as: driver.id,
    });
    expect(unpaid.body).toMatchObject({ extendable: false, extendableUntil: null });

    const stranger = await t.newDriver();
    const other = await t.call('GET', `/v1/bookings/${created.booking.id}/extensions/options`, {
      as: stranger.id,
    });
    expect([other.status, other.body?.code]).toEqual([404, 'BOOKING_NOT_FOUND']);
  });

  it('words the closed-hours refusal for each case', () => {
    expect(closedForExtensionDetail(null, null)).toBe(
      'The car park is closed during the extension window',
    );
    expect(closedForExtensionDetail(new Date('2026-10-26T23:00:00Z'), null)).toBe(
      'The car park closes at 00:00, so this stay can’t be extended',
    );
    expect(
      closedForExtensionDetail(new Date('2026-10-26T23:00:00Z'), new Date('2026-10-27T06:00:00Z')),
    ).toBe('The car park closes at 00:00 and reopens Tue 07:00');
  });

  it('rejects extension if booking is not in extendable status', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    // Initial booking is still PENDING_PAYMENT (not CONFIRMED or CHECKED_IN)
    const res = await t.call('POST', `/v1/bookings/${created.booking.id}/extensions`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { newEndAt: '2026-10-20T10:00:00.000Z' },
    });
    expect(res.status).toBe(409);
    expect(res.body?.code).toBe('BOOKING_NOT_EXTENDABLE');
  });
});

describe('Booking Cancellation (FR-BOOK-006, doc 02 §5)', () => {
  it('cancels confirmed booking >= 30m before start with 100% refund', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Cancel now (Monday morning, booking starts Tuesday morning -> > 30m)
    const cancelRes = await t.call('POST', `/v1/bookings/${created.booking.id}/cancel`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
      body: { reason: 'Plans changed' },
    });
    expect(cancelRes.status).toBe(200);
    const body = cancelRes.body as any;
    expect(body.isFreeCancellation).toBe(true);
    expect(body.refundKobo).toBe(110_000); // 100% refund of parking + service fee
    expect(body.booking.status).toBe('CANCELLED');

    // Refund row saved and requested
    expect(t.store.booking.refundRows).toHaveLength(1);
    expect(t.store.booking.refundRows[0]?.amountKobo).toBe(110_000);
  });

  it('cancels confirmed booking < 30m before start with 0 refund', async () => {
    // START is 2026-10-20T07:00:00.000Z
    // 10 minutes before start:
    const lateNow = new Date('2026-10-20T06:50:00.000Z');
    const t = await setup({}, { now: () => lateNow });
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    const cancelRes = await t.call('POST', `/v1/bookings/${created.booking.id}/cancel`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(cancelRes.status).toBe(200);
    const body = cancelRes.body as any;
    expect(body.isFreeCancellation).toBe(false);
    expect(body.refundKobo).toBe(0);
    expect(body.booking.status).toBe('CANCELLED');
    expect(t.store.booking.refundRows).toHaveLength(0);
  });

  it('rejects cancellation when already CANCELLED', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    await t.call('POST', `/v1/bookings/${created.booking.id}/cancel`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });

    const secondCancel = await t.call('POST', `/v1/bookings/${created.booking.id}/cancel`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(secondCancel.status).toBe(409);
    expect(secondCancel.body?.code).toBe('BOOKING_NOT_CANCELLABLE');
  });
});

describe('Overstay Payment (FR-BOOK-008, doc 02 §4)', () => {
  it('rejects overstay payment when no overstay is due', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    const res = await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(res.status).toBe(409);
    expect(res.body?.code).toBe('OVERSTAY_NOT_DUE');
  });

  it('initiates and settles overstay payment', async () => {
    const t = await setup();
    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    t.payments.pay(created.payment.reference);
    await t.call('POST', `/v1/payments/${created.payment.reference}/verify`, { as: driver.id });

    // Seed session with overstay due
    const sessionId = randomUUID();
    t.store.attending.sessionRows.push({
      id: sessionId,
      bookingId: created.booking.id,
      lotId: t.lot.id,
      plateNorm: 'LND123AB',
      checkInAt: new Date(START),
      checkOutAt: new Date(new Date(END).getTime() + 45 * 60_000), // 45m late
      overstayMinutes: 35,
      overstayAmountKobo: 37_500,
      overstayStatus: 'DUE',
      flags: [],
    });

    const payRes = await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(payRes.status).toBe(200);
    const body = payRes.body as any;
    expect(body.amountKobo).toBe(37_500);
    expect(body.payment).toMatchObject({
      status: 'PENDING',
      authorizationUrl: expect.stringContaining('https://checkout.fake/'),
    });

    // A second tap (new key) or a retry (same key) never opens a second checkout (P-7, P-13).
    const again = await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, {
      as: driver.id,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect((again.body as unknown as Created).payment.reference).toBe(body.payment.reference);
    const key = randomUUID();
    const first = await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, {
      as: driver.id,
      headers: { 'idempotency-key': key },
    });
    const replay = await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, {
      as: driver.id,
      headers: { 'idempotency-key': key },
    });
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(
      (await t.call('POST', `/v1/bookings/${created.booking.id}/overstay/pay`, { as: driver.id }))
        .body?.code,
    ).toBe('IDEMPOTENCY_KEY_MISSING');
    expect(
      t.payments.initialized.filter((i) => i.reference !== created.payment.reference),
    ).toHaveLength(1);

    // Settle overstay payment
    t.payments.pay(body.payment.reference);
    const verifyRes = await t.call('POST', `/v1/payments/${body.payment.reference}/verify`, {
      as: driver.id,
    });
    expect(verifyRes.status).toBe(200);
    const session = await t.store.attend.sessionByBooking(created.booking.id);
    expect(session?.overstayStatus).toBe('PAID');
  });

  it('exposes entrance landmark, location coordinates, area, and operator phone on booking.lot', async () => {
    const t = await setup();
    const opRow = t.store.operatorRows.get(t.operatorId);
    if (opRow) opRow.contactPhoneEnc = t.deps.crypto.encrypt('+2348012345678');
    const lotRow = t.store.lotRows.get(t.lot.id);
    if (lotRow) lotRow.entranceNotes = 'Gate 2 on Adeola Odeku, beside GTBank';

    const driver = await t.newDriver();
    const created = (await t.book(driver)).body as unknown as Created;
    expect(created.booking.lot).toMatchObject({
      area: 'Victoria Island',
      location: { lat: 6.4281, lng: 3.4219 },
      entranceNotes: 'Gate 2 on Adeola Odeku, beside GTBank',
      contactPhone: '+2348012345678',
    });

    const getRes = await t.call('GET', `/v1/bookings/${created.booking.id}`, { as: driver.id });
    expect(getRes.status).toBe(200);
    const fetched = getRes.body as any;
    expect(fetched.lot).toMatchObject({
      area: 'Victoria Island',
      location: { lat: 6.4281, lng: 3.4219 },
      entranceNotes: 'Gate 2 on Adeola Odeku, beside GTBank',
      contactPhone: '+2348012345678',
    });
  });
});
