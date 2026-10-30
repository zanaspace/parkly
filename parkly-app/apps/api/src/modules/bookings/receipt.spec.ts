import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import { world } from '../../test-helpers.js';
import { buildReceiptData, renderReceiptHtml } from './receipt.js';

const START = '2026-10-20T07:00:00.000Z';

type Held = { booking: { id: string }; payment: { reference: string } };
type ReceiptJson = {
  bookingId: string;
  bookingCode: string;
  status: string;
  lot: { name: string };
  vehicle: { plate: string };
  totalKobo: number;
  payments: { status: string }[];
};
const END = '2026-10-20T09:00:00.000Z';

async function addLot(store: MemoryStore) {
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
    capacityBookable: 20,
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
  return lot;
}

async function addVehicle(store: MemoryStore, driverId: string) {
  return store.vehicles.create({
    userId: driverId,
    plateRaw: 'LND 123 XY',
    plateNorm: 'LND123XY',
    make: 'Toyota',
    model: 'Corolla',
    colour: 'Silver',
    isDefault: true,
  });
}

describe('Receipt Generator & Endpoint (Story 4)', () => {
  it('buildReceiptData constructs complete receipt with duration and breakdown', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const startAt = new Date('2026-10-20T07:00:00Z');
    const endAt = new Date('2026-10-20T09:15:00Z');

    const receipt = buildReceiptData({
      booking: {
        id: randomUUID(),
        code: 'PK-99ABC1',
        driverId: randomUUID(),
        vehicleId: randomUUID(),
        plateNorm: 'ABC123XY',
        lotId: randomUUID(),
        ratePlanId: randomUUID(),
        product: 'HOURLY',
        startAt,
        endAt,
        status: 'CONFIRMED',
        holdExpiresAt: null,
        priceKobo: 125_000,
        serviceFeeKobo: 10_000,
        totalKobo: 135_000,
        commissionBps: 1200,
        pricingBreakdown: [
          {
            kind: 'HOURLY_DAY',
            date: '2026-10-20',
            minutes: 135,
            amountKobo: 125_000,
            capped: false,
          },
          { kind: 'SERVICE_FEE', amountKobo: 10_000 },
        ],
        source: 'MOBILE',
        createdAt: new Date('2026-10-20T06:00:00Z'),
      },
      lot: {
        id: randomUUID(),
        name: 'Victoria Mall Parking',
        addressLine: 'Ahmadu Bello Way',
        area: 'Victoria Island',
      },
      user: {
        id: randomUUID(),
        firstName: 'Tunde',
        lastName: 'Bakare',
        phoneLast4: '4321',
        status: 'ACTIVE',
        marketingOptIn: false,
      },
      payments: [
        {
          id: randomUUID(),
          bookingId: randomUUID(),
          kind: 'BOOKING',
          payerUserId: randomUUID(),
          operatorId: randomUUID(),
          subaccountCode: null,
          amountKobo: 135_000,
          platformAmountKobo: 25_000,
          operatorAmountKobo: 110_000,
          status: 'SUCCEEDED',
          provider: 'PAYSTACK',
          paidAt: new Date('2026-10-20T06:05:00Z'),
          feesKobo: 2025,
          channel: 'card',
          cardLast4: '4081',
          cardBrand: 'visa',
          authorizationUrl: null,
          failureCode: null,
          createdAt: new Date('2026-10-20T06:00:00Z'),
        },
      ],
      refunds: [],
      now,
    });

    expect(receipt.bookingCode).toBe('PK-99ABC1');
    expect(receipt.durationMinutes).toBe(135);
    expect(receipt.driver.firstName).toBe('Tunde');
    expect(receipt.driver.phoneLast4).toBe('4321');
    expect(receipt.vehicle.plate).toBe('ABC123XY');
    expect(receipt.lines).toHaveLength(2);
    expect(receipt.payments).toHaveLength(1);
    expect(receipt.payments[0]?.cardLast4).toBe('4081');
    expect(receipt.payments[0]?.status).toBe('SUCCEEDED');
  });

  it('renderReceiptHtml generates beautiful valid HTML with printable styling', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const startAt = new Date('2026-10-20T07:00:00Z');
    const endAt = new Date('2026-10-20T09:00:00Z');

    const receipt = buildReceiptData({
      booking: {
        id: randomUUID(),
        code: 'PK-RECEIPT1',
        driverId: randomUUID(),
        vehicleId: randomUUID(),
        plateNorm: 'LND123XY',
        lotId: randomUUID(),
        ratePlanId: randomUUID(),
        product: 'HOURLY',
        startAt,
        endAt,
        status: 'COMPLETED',
        holdExpiresAt: null,
        priceKobo: 100_000,
        serviceFeeKobo: 10_000,
        totalKobo: 110_000,
        commissionBps: 1200,
        pricingBreakdown: null,
        source: 'MOBILE',
        createdAt: new Date('2026-10-20T06:00:00Z'),
      },
      lot: {
        id: randomUUID(),
        name: 'Silverbird Galleria Lot',
        addressLine: '133 Ahmadu Bello Way',
        area: 'Victoria Island',
      },
      user: {
        id: randomUUID(),
        firstName: 'Chioma',
        lastName: 'Adeyemi',
        phoneLast4: '9988',
        status: 'ACTIVE',
        marketingOptIn: false,
      },
      payments: [
        {
          id: randomUUID(),
          bookingId: randomUUID(),
          kind: 'BOOKING',
          payerUserId: randomUUID(),
          operatorId: randomUUID(),
          subaccountCode: null,
          amountKobo: 110_000,
          platformAmountKobo: 22_000,
          operatorAmountKobo: 88_000,
          status: 'SUCCEEDED',
          provider: 'PAYSTACK',
          paidAt: new Date('2026-10-20T06:05:00Z'),
          feesKobo: 1650,
          channel: 'card',
          cardLast4: '1234',
          cardBrand: 'mastercard',
          authorizationUrl: null,
          failureCode: null,
          createdAt: new Date('2026-10-20T06:00:00Z'),
        },
      ],
      refunds: [],
      now,
    });

    const html = renderReceiptHtml(receipt);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('PK-RECEIPT1');
    expect(html).toContain('Silverbird Galleria Lot');
    expect(html).toContain('LND123XY');
    expect(html).toContain('Chioma Adeyemi');
    expect(html).toContain('•••• 9988');
    expect(html).toContain('₦1,100.00'); // total 110,000 kobo = ₦1,100.00
    expect(html).toContain('Print / Save PDF');
    expect(html).toContain('@media print');
    expect(html).toContain('#008080'); // Parkly primary teal
  });

  it('serves GET /v1/bookings/:id/receipt in JSON and HTML format', async () => {
    const w = world();
    const lot = await addLot(w.store);
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'D');
    const vehicle = await addVehicle(w.store, driver);

    // Create and pay for a booking
    const holdRes = await w.call('POST', '/v1/bookings', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        lotId: lot.id,
        vehicleId: vehicle.id,
        product: 'HOURLY',
        startAt: START,
        endAt: END,
      },
    });
    expect(holdRes.status).toBe(201);
    const held = holdRes.body as unknown as Held;
    const bookingId = held.booking.id;
    const ref = held.payment.reference;

    // Settle payment
    w.payments.pay(ref);
    const verifyRes = await w.call('POST', `/v1/payments/${ref}/verify`, { as: driver });
    expect(verifyRes.status).toBe(200);

    // 1. Default JSON receipt
    const jsonRes = await w.call('GET', `/v1/bookings/${bookingId}/receipt`, { as: driver });
    expect(jsonRes.status).toBe(200);
    const receipt = jsonRes.body as unknown as ReceiptJson;
    expect(receipt.bookingId).toBe(bookingId);
    expect(receipt.bookingCode).toMatch(/^PK-/);
    expect(receipt.status).toBe('CONFIRMED');
    expect(receipt.lot.name).toBe('Eko Hotel Car Park');
    expect(receipt.vehicle.plate).toBe('LND123XY');
    expect(receipt.totalKobo).toBe(110_000);
    expect(receipt.payments).toHaveLength(1);
    expect(receipt.payments[0]?.status).toBe('SUCCEEDED');

    // 2. HTML format query
    const htmlRes = await w.call('GET', `/v1/bookings/${bookingId}/receipt?format=html`, {
      as: driver,
    });
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.raw).toContain('<!DOCTYPE html>');
    expect(htmlRes.raw).toContain('Official Parking Receipt');
    expect(htmlRes.raw).toContain('Eko Hotel Car Park');

    // 3. Accept: text/html header
    const acceptRes = await w.call('GET', `/v1/bookings/${bookingId}/receipt`, {
      as: driver,
      headers: { accept: 'text/html' },
    });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.raw).toContain('<!DOCTYPE html>');

    // 4. Other driver cannot access receipt (404, no enumeration)
    const otherDriver = w.user([{ role: 'DRIVER', operatorId: null }], 'O');
    const unauthorizedRes = await w.call('GET', `/v1/bookings/${bookingId}/receipt`, {
      as: otherDriver,
    });
    expect(unauthorizedRes.status).toBe(404);

    // 5. A token in the URL is never accepted (gap review S-2).
    const driverToken = await w.tokenFor(driver);
    const tokenRes = await w.call(
      'GET',
      `/v1/bookings/${bookingId}/receipt?format=html&token=${driverToken}`,
    );
    expect(tokenRes.status).toBe(401);

    // 6. A signed, short-lived link opens in any browser, for this booking only.
    const link = await w.call('POST', `/v1/bookings/${bookingId}/receipt-link`, { as: driver });
    expect(link.status).toBe(200);
    const url = new URL((link.body as unknown as { url: string }).url);
    expect(url.search).not.toContain(driverToken);
    const opened = await w.call('GET', url.pathname + url.search);
    expect(opened.status).toBe(200);
    expect(opened.raw).toContain('Official Parking Receipt');
    const forged = url.search.replace(/sig=[^&]+/, 'sig=forged');
    expect((await w.call('GET', url.pathname + forged)).status).toBe(404);
    const otherBooking = `/v1/receipts/${randomUUID()}${url.search}`;
    expect((await w.call('GET', otherBooking)).status).toBe(404);
    expect(
      (await w.call('POST', `/v1/bookings/${bookingId}/receipt-link`, { as: otherDriver })).status,
    ).toBe(404);
  });

  it('escapes what operators and drivers typed (gap review S-3)', async () => {
    const w = world();
    const lot = await addLot(w.store);
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'D');
    const vehicle = await addVehicle(w.store, driver);
    const hold = await w.call('POST', '/v1/bookings', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: vehicle.id, product: 'HOURLY', startAt: START, endAt: END },
    });
    const row = w.store.lotRows.get(lot.id);
    if (row) row.name = '<img src=x onerror=alert(1)>';
    const heldId = (hold.body as unknown as Held).booking.id;
    const res = await w.call('GET', `/v1/bookings/${heldId}/receipt?format=html`, {
      as: driver,
    });
    expect(res.raw).not.toContain('<img src=x');
    expect(res.raw).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders HTML for cancelled, no-show, and refunded bookings with proper badges', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const bookingBase = {
      id: randomUUID(),
      code: 'PK-STATUS1',
      driverId: randomUUID(),
      vehicleId: randomUUID(),
      plateNorm: 'ABC123XY',
      lotId: randomUUID(),
      ratePlanId: randomUUID(),
      product: 'HOURLY' as const,
      startAt: new Date('2026-10-20T08:00:00Z'),
      endAt: new Date('2026-10-20T10:00:00Z'),
      holdExpiresAt: null,
      priceKobo: 50_000,
      serviceFeeKobo: 0,
      totalKobo: 50_000,
      commissionBps: 1200,
      pricingBreakdown: null,
      source: 'WEB' as const,
      createdAt: new Date('2026-10-20T07:00:00Z'),
    };

    // 1. Cancelled with refund
    const cancelledReceipt = buildReceiptData({
      booking: { ...bookingBase, status: 'CANCELLED' },
      lot: { id: randomUUID(), name: 'Main Lot', addressLine: '123 St', area: 'VI' },
      user: null,
      payments: [
        {
          id: randomUUID(),
          bookingId: bookingBase.id,
          kind: 'BOOKING',
          payerUserId: bookingBase.driverId,
          operatorId: randomUUID(),
          subaccountCode: null,
          amountKobo: 50_000,
          platformAmountKobo: 5_000,
          operatorAmountKobo: 45_000,
          status: 'SUCCEEDED',
          provider: 'PAYSTACK',
          paidAt: new Date('2026-10-20T07:05:00Z'),
          feesKobo: 750,
          channel: 'bank_transfer',
          cardLast4: null,
          cardBrand: null,
          authorizationUrl: null,
          failureCode: null,
          createdAt: new Date('2026-10-20T07:00:00Z'),
        },
      ],
      refunds: [
        {
          id: randomUUID(),
          paymentId: randomUUID(),
          amountKobo: 50_000,
          status: 'SUCCEEDED',
          reason: 'DRIVER_CANCEL',
          providerRefundId: 'ref-1',
          requestedBy: null,
          approvedBy: null,
          note: null,
          createdAt: new Date('2026-10-20T07:30:00Z'),
        },
      ],
      now,
    });

    const cancelledHtml = renderReceiptHtml(cancelledReceipt);
    expect(cancelledHtml).toContain('CANCELLED');
    expect(cancelledHtml).toContain('Refund (DRIVER_CANCEL)');
    expect(cancelledHtml).toContain('bank_transfer');
    expect(cancelledHtml).toContain('Parkly Driver');

    // 2. NO_SHOW
    const noShowReceipt = buildReceiptData({
      booking: { ...bookingBase, status: 'NO_SHOW' },
      lot: { id: randomUUID(), name: 'Main Lot', addressLine: '123 St', area: 'VI' },
      user: {
        id: bookingBase.driverId,
        firstName: null,
        lastName: null,
        phoneLast4: null,
        status: 'ACTIVE',
        marketingOptIn: false,
      },
      payments: [],
      refunds: [],
      now,
    });
    const noShowHtml = renderReceiptHtml(noShowReceipt);
    expect(noShowHtml).toContain('NO_SHOW');
    expect(noShowHtml).toContain('No payments recorded');

    // 3. DAILY and MONTHLY lines
    const dailyMonthlyReceipt = buildReceiptData({
      booking: { ...bookingBase, status: 'CONFIRMED' },
      lot: { id: randomUUID(), name: 'Main Lot', addressLine: '123 St', area: 'VI' },
      user: null,
      payments: [],
      refunds: [],
      now,
    });
    dailyMonthlyReceipt.lines = [
      { kind: 'DAY', date: '2026-10-20', amountKobo: 200_000 },
      { kind: 'MONTH', periodStart: '2026-10-01', periodEnd: '2026-10-31', amountKobo: 5_000_000 },
    ];
    const html = renderReceiptHtml(dailyMonthlyReceipt);
    expect(html).toContain('Daily Parking (2026-10-20)');
    expect(html).toContain('Monthly Pass (2026-10-01 to 2026-10-31)');
  });
});
