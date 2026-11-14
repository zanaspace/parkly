import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import { allowAllRateLimiter } from '../../middleware/rate-limit.js';
import { world } from '../../test-helpers.js';

// Tomorrow 08:00–10:00 Lagos
const START = '2026-10-20T07:00:00.000Z';
const END = '2026-10-20T09:00:00.000Z';

async function addLot(store: MemoryStore, capacity: number) {
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
    capacityTotal: capacity,
    capacityBookable: capacity,
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
    capacityCounted: capacity,
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
  return { lot, operatorId: op.id };
}

describe('Sprint 10 — Concurrency & Overbooking Protection (doc 17 §2, NFR-PERF-003)', () => {
  it('proves no overbooking: 200 concurrent booking attempts for the last 5 spaces confirm exactly 5', async () => {
    const w = world({ rateLimiter: allowAllRateLimiter });
    const { lot } = await addLot(w.store, 5);

    // Pre-create 200 distinct drivers, each with their own vehicle
    const drivers = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const id = w.user();
        const plate = `APP${String(i).padStart(3, '0')}XY`;
        const vehicle = await w.store.vehicles.create({
          userId: id,
          plateRaw: plate,
          plateNorm: plate,
          make: null,
          model: null,
          colour: null,
          isDefault: true,
        });
        return { id, vehicleId: vehicle.id };
      }),
    );

    // Fire 200 concurrent booking requests simultaneously
    const results = await Promise.all(
      drivers.map((driver) =>
        w.call('POST', '/v1/bookings', {
          as: driver.id,
          headers: { 'idempotency-key': randomUUID() },
          body: {
            lotId: lot.id,
            vehicleId: driver.vehicleId,
            startAt: START,
            endAt: END,
          },
        }),
      ),
    );

    const successful = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);

    // Exactly 5 confirmed holds
    expect(successful).toHaveLength(5);
    // Exactly 195 rejected due to capacity exceeded
    expect(rejected).toHaveLength(195);
    // All 200 requests accounted for
    expect(successful.length + rejected.length).toBe(200);

    // Verify rejection payloads have appropriate error code
    for (const res of rejected) {
      const body = res.body as { code?: string };
      expect(['CAPACITY_EXCEEDED', 'HOLD_CAPACITY_EXCEEDED', 'BOOKING_SLOT_UNAVAILABLE']).toContain(
        body?.code,
      );
    }
  });
});
