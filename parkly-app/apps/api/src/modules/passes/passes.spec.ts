import { randomUUID } from 'node:crypto';
import { verifyQrToken } from '@parkly/domain/qr';
import { describe, expect, it } from 'vitest';
import { gateCodes } from '../../lib/gate-codes.js';
import { passRemindersJob } from '../../jobs/pass-reminders.js';
import { reapplyErasuresJob } from '../../jobs/reapply-erasures.js';
import { retryWebhooksJob } from '../../jobs/retry-webhooks.js';
import type { MemoryStore } from '../../store/memory.js';
import { TEST_NOW, world } from '../../test-helpers.js';

async function addMonthlyLot(
  store: MemoryStore,
  opts: { capacity?: number; requiresVerifiedDriver?: boolean; selfCheckin?: boolean } = {},
) {
  const ownerId = randomUUID();
  store.seedUser(ownerId, {
    roles: [],
  });
  const op = await store.operators.create({
    legalName: 'Victoria Island Parking Ltd',
    tradingName: 'VI Parking',
    type: 'COMMERCIAL_LOT',
    cacNumberEnc: null,
    tinEnc: null,
    addressLine: null,
    contactEmail: null,
    contactPhoneEnc: null,
    ownerUserId: ownerId,
    commissionBps: 1200,
  });
  store.seedUser(ownerId, {
    roles: [{ role: 'OPERATOR_OWNER', operatorId: op.id }],
  });
  Object.assign(store.operatorRows.get(op.id) ?? {}, { status: 'ACTIVE', kybStatus: 'APPROVED' });
  const lot = await store.lots.create({
    operatorId: op.id,
    type: 'COMMERCIAL_LOT',
    name: 'Adeola Odeku Tower Park',
    slug: `adeola-${randomUUID().slice(0, 8)}`,
    description: null,
    addressLine: '42 Adeola Odeku St',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    location: { lat: 6.4281, lng: 3.4219 },
    entranceNotes: 'Gate B',
    capacityTotal: 20,
    capacityBookable: opts.capacity ?? 4,
    amenities: ['CCTV', 'GUARDED'],
    vehicleTypes: ['CAR', 'SUV'],
    requiresVerifiedDriver: opts.requiresVerifiedDriver ?? false,
    createdBy: ownerId,
  });
  if (opts.selfCheckin) {
    await store.lots.setSelfCheckin(op.id, lot.id, true);
  }
  const reviewer = { reviewerId: ownerId, at: new Date('2026-10-10T10:00:00Z') };
  const permit = await store.permits.create({
    lotId: lot.id,
    permitNumber: 'LASPA/VI/2026/0099',
    issuedAt: '2026-01-10',
    expiresAt: '2027-01-09',
    documentFileId: randomUUID(),
    submittedBy: ownerId,
  });
  await store.permits.approve(permit.id, { ...reviewer, note: 'ok' });
  const visit = await store.verifications.create({
    lotId: lot.id,
    inspectorUserId: ownerId,
    inspectedAt: new Date('2026-10-09T10:00:00Z'),
    capacityCounted: 20,
    gps: null,
    notes: null,
    validUntil: '2027-10-09',
    items: [{ item: 'LASPA_PERMIT', result: 'PASS', comment: null }],
  });
  await store.verifications.approve(visit.id, reviewer);
  const hourly = await store.ratePlans.submit({
    lotId: lot.id,
    product: 'HOURLY',
    hourlyRateKobo: 50_000,
    minMinutes: 60,
    dailyCapKobo: null,
    dailyRateKobo: null,
    monthlyRateKobo: null,
    submittedBy: ownerId,
  });
  await store.ratePlans.approve(hourly.id, reviewer);
  const monthly = await store.ratePlans.submit({
    lotId: lot.id,
    product: 'MONTHLY',
    hourlyRateKobo: null,
    minMinutes: 60,
    dailyCapKobo: null,
    dailyRateKobo: null,
    monthlyRateKobo: 2_500_000, // ₦25,000
    submittedBy: ownerId,
  });
  await store.ratePlans.approve(monthly.id, reviewer);
  await store.lots.setOpeningHours(
    lot.id,
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      is24h: true,
      opensAt: null,
      closesAt: null,
    })),
  );
  store.payoutRows.set(op.id, {
    operatorId: op.id,
    bankCode: '058',
    bankName: 'GTBank',
    accountNumberLast4: '6789',
    accountName: 'VI PARKING LTD',
    pendingAccountNumberEnc: null,
    nameMismatch: false,
    providerSubaccountCode: 'ACCT_vi',
    status: 'ACTIVE',
    verifiedAt: new Date('2026-10-09T10:00:00Z'),
  });
  await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
  await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
  return { lot, operatorId: op.id, ownerId };
}

async function addVehicle(w: ReturnType<typeof world>, driverId: string, plate = 'LAG-123AA') {
  const res = await w.call('POST', '/v1/me/vehicles', {
    as: driverId,
    body: { plate, make: 'Toyota', model: 'Corolla' },
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; plateNorm: string };
}

describe('Monthly passes (FR-PASS-001…004)', () => {
  it('purchases a monthly pass, activates on payment verify, and issues a signed P QR ticket', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store);
    const driver = w.user();
    const v1 = await addVehicle(w, driver, 'LAG-111AA');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        lotId: lot.id,
        vehicleId: v1.id,
        startDate: '2026-10-20',
        source: 'WEB',
      },
    });
    expect(created.status).toBe(201);
    const passId = (created.body?.pass as { id: string }).id;
    expect(created.body?.pass).toMatchObject({
      status: 'HELD',
      periodStart: '2026-10-20',
      periodEnd: '2026-11-18',
      priceKobo: 2_500_000,
      swapsUsed: 0,
      swapsRemaining: 2,
      qrToken: null,
    });

    w.payments.pay((created.body?.payment as { reference: string }).reference);
    const verified = await w.call('POST', `/v1/passes/${passId}/verify`, { as: driver });
    expect(verified.status).toBe(200);
    const activePass = verified.body?.pass as {
      id: string;
      code: string;
      status: string;
      qrToken: string;
    };
    expect(activePass.status).toBe('ACTIVE');
    expect(activePass.qrToken).toMatch(/^PK1\./);

    // Verify the Ed25519 QR signature with the lot's public key
    const keyRow = w.store.lotKeyRows.find((k) => k.lotId === lot.id);
    expect(keyRow).toBeDefined();
    if (!keyRow) throw new Error('missing keyRow');
    const qrCheck = await verifyQrToken(activePass.qrToken, {
      lotId: lot.id,
      now: new Date('2026-10-20T10:00:00Z'),
      publicKeys: { [keyRow.kid]: new Uint8Array(keyRow.publicKey) },
      earlyArrivalMin: 15,
      overstayAllowanceMin: 15,
    });
    expect(qrCheck.ok).toBe(true);
    if (qrCheck.ok) {
      expect(qrCheck.claims.t).toBe('P');
      expect(qrCheck.claims.b).toBe(passId);
      expect(qrCheck.claims.p).toBe('LAG111AA');
    }

    // List active passes
    const listRes = await w.call('GET', '/v1/passes?status=active', { as: driver });
    expect(listRes.status).toBe(200);
    expect((listRes.body?.items as unknown[]).length).toBe(1);
  });

  it('enforces pass.max_share_percent capacity cap (50%) and allows joining the waitlist', async () => {
    const w = world();
    // capacityBookable = 4, max_share_percent = 50% => max 2 passes
    const { lot } = await addMonthlyLot(w.store, { capacity: 4 });

    for (let i = 0; i < 2; i++) {
      const d = w.user();
      const v = await addVehicle(w, d, `LAG-20${i}AA`);
      const res = await w.call('POST', '/v1/passes', {
        as: d,
        headers: { 'idempotency-key': randomUUID() },
        body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-20', source: 'MOBILE' },
      });
      expect(res.status).toBe(201);
    }

    // 3rd pass over the same window must be refused (BOOKING_LOT_FULL)
    const d3 = w.user();
    const v3 = await addVehicle(w, d3, 'LAG-209AA');
    const full = await w.call('POST', '/v1/passes', {
      as: d3,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v3.id, startDate: '2026-10-20', source: 'MOBILE' },
    });
    expect(full.status).toBe(409);
    expect(full.body?.code).toBe('BOOKING_LOT_FULL');

    // Driver can join the waitlist
    const wait = await w.call('POST', '/v1/passes/waitlist', {
      as: d3,
      body: { lotId: lot.id, desiredStart: '2026-10-20' },
    });
    expect(wait.status).toBe(201);
    expect(wait.body).toMatchObject({
      lotId: lot.id,
      desiredStart: '2026-10-20',
      status: 'WAITING',
    });
  });

  it('swaps vehicles up to 2 times/month, re-signs QR token, and blocks a 3rd swap (FR-PASS-004)', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store);
    const driver = w.user();
    const v1 = await addVehicle(w, driver, 'LAG-301AA');
    const v2 = await addVehicle(w, driver, 'LAG-302BB');
    const v3 = await addVehicle(w, driver, 'LAG-303CC');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v1.id, startDate: '2026-10-19', source: 'WEB' },
    });
    const passId = (created.body?.pass as { id: string }).id;
    w.payments.pay((created.body?.payment as { reference: string }).reference);
    await w.call('POST', `/v1/passes/${passId}/verify`, { as: driver });

    // Cannot delete v1 while attached to active pass
    const delInUse = await w.call('DELETE', `/v1/me/vehicles/${v1.id}`, { as: driver });
    expect(delInUse.status).toBe(409);
    expect(delInUse.body?.code).toBe('VEHICLE_IN_USE');

    // Swap 1 -> v2
    const swap1 = await w.call('POST', `/v1/passes/${passId}/swap-vehicle`, {
      as: driver,
      body: { vehicleId: v2.id },
    });
    expect(swap1.status).toBe(200);
    expect(swap1.body).toMatchObject({
      vehicle: { id: v2.id, plate: 'LAG302BB' },
      swapsUsed: 1,
      swapsRemaining: 1,
    });

    // Swap 2 -> v3
    const swap2 = await w.call('POST', `/v1/passes/${passId}/swap-vehicle`, {
      as: driver,
      body: { vehicleId: v3.id },
    });
    expect(swap2.status).toBe(200);
    expect(swap2.body).toMatchObject({
      vehicle: { id: v3.id, plate: 'LAG303CC' },
      swapsUsed: 2,
      swapsRemaining: 0,
    });

    // Swap 3 -> v1 (rejected: PASS_SWAP_LIMIT_REACHED)
    const swap3 = await w.call('POST', `/v1/passes/${passId}/swap-vehicle`, {
      as: driver,
      body: { vehicleId: v1.id },
    });
    expect(swap3.status).toBe(422);
    expect(swap3.body?.code).toBe('PASS_SWAP_LIMIT_REACHED');

    // Audit log recorded both vehicle swaps
    const swapAudits = w.store.auditRows.filter((a) => a.action === 'pass.vehicle_swapped');
    expect(swapAudits).toHaveLength(2);
  });

  it('enforces one vehicle in lot at a time on pass check-in and supports one-tap renewal & reminders', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store, { selfCheckin: true });
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Chidi');
    const v1 = await addVehicle(w, driver, 'LAG-401AA');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v1.id, startDate: '2026-10-19', source: 'MOBILE' },
    });
    const passId = (created.body?.pass as { id: string }).id;
    w.payments.pay((created.body?.payment as { reference: string }).reference);
    await w.call('POST', `/v1/passes/${passId}/verify`, { as: driver });

    // Build signed poster gate code for the lot
    const gateCode = gateCodes(w.deps.crypto).poster(lot.id);

    // Check in #1 -> APPLIED
    const in1 = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: gateCode,
        lat: 6.4281,
        lng: 3.4219,
      },
    });
    expect(in1.status).toBe(200);
    expect(in1.body).toEqual({ result: 'APPLIED', reason: null });

    // Check in #2 while still inside -> REJECTED (ALREADY_IN_LOT)
    const in2 = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: gateCode,
        lat: 6.4281,
        lng: 3.4219,
      },
    });
    expect(in2.status).toBe(200);
    expect(in2.body).toEqual({ result: 'REJECTED', reason: 'ALREADY_IN_LOT' });

    // Check out -> APPLIED
    const out1 = await w.call('POST', `/v1/passes/${passId}/self-check-out`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: gateCode,
        lat: 6.4281,
        lng: 3.4219,
      },
    });
    expect(out1.status).toBe(200);
    expect(out1.body).toEqual({ result: 'APPLIED', reason: null });

    // One-tap renewal -> creates next 30-day pass starting day after 2026-11-17 (2026-11-18)
    const renewed = await w.call('POST', `/v1/passes/${passId}/renew`, {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { source: 'MOBILE' },
    });
    expect(renewed.status).toBe(201);
    expect(renewed.body?.pass).toMatchObject({
      periodStart: '2026-11-18',
      renewedFromId: passId,
    });

    // Advance clock to 7 days before periodEnd (2026-11-17 - 7 days = 2026-11-10)
    const job = passRemindersJob({
      store: w.store,
      notifications: w.deps.notifications,
      logger: w.deps.logger,
      now: () => new Date('2026-11-10T09:00:00Z'),
    });
    const jobRes = await job({ payload: {}, deadline: new Date('2026-11-10T09:01:00Z') });
    expect(jobRes.processed).toBeGreaterThanOrEqual(1);
    const passRow = await w.store.passes.find(passId);
    expect(passRow?.lastReminderDays).toBe(7);
  });
});

describe('Driver Identity Verification (FR-AUTH-009) & Verified Driver Gating (FR-PASS-005)', () => {
  it('blocks unverified drivers at gated lots and allows them after Tier 2 KYC verification', async () => {
    const w = world();
    const { lot, operatorId, ownerId } = await addMonthlyLot(w.store, {
      requiresVerifiedDriver: true,
    });
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Ngozi');
    const v = await addVehicle(w, driver, 'LAG-777KY');

    // Unverified driver blocked from booking or buying a pass at this lot
    const blockedPass = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-20', source: 'WEB' },
    });
    expect(blockedPass.status).toBe(403);
    expect(blockedPass.body?.code).toBe('DRIVER_VERIFICATION_REQUIRED');

    const blockedBooking = await w.call('POST', '/v1/bookings', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        lotId: lot.id,
        vehicleId: v.id,
        product: 'HOURLY',
        startAt: '2026-10-20T09:00:00.000Z',
        endAt: '2026-10-20T11:00:00.000Z',
        source: 'WEB',
      },
    });
    expect(blockedBooking.status).toBe(403);
    expect(blockedBooking.body?.code).toBe('DRIVER_VERIFICATION_REQUIRED');

    // Verify driver via FRSC Driver's License
    const verRes = await w.call('POST', '/v1/me/verification', {
      as: driver,
      body: {
        method: 'FRSC_LICENSE',
        idNumber: 'AKW06968AA2',
        dateOfBirth: '1992-06-15',
      },
    });
    expect(verRes.status).toBe(200);
    expect(verRes.body).toMatchObject({
      isVerifiedDriver: true,
      verification: {
        method: 'FRSC_LICENSE',
        status: 'VERIFIED',
        maskedIdNumber: 'AKW******A2',
      },
    });

    // Stored encrypted at rest, never plaintext
    const storedRow = w.store.driverVerificationRows[0];
    expect(storedRow).toBeDefined();
    if (!storedRow) throw new Error('missing storedRow');
    expect(storedRow.idNumberEnc).not.toContain('AKW06968AA2');
    expect(w.deps.crypto.decrypt(storedRow.idNumberEnc)).toBe('AKW06968AA2');

    // Profile now shows isVerifiedDriver: true
    const me = await w.call('GET', '/v1/me', { as: driver });
    expect(me.body?.isVerifiedDriver).toBe(true);

    // Now pass purchase succeeds
    const passOk = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-19', source: 'WEB' },
    });
    expect(passOk.status).toBe(201);
    const passId = (passOk.body?.pass as { id: string }).id;
    w.payments.pay((passOk.body?.payment as { reference: string }).reference);
    await w.call('POST', `/v1/passes/${passId}/verify`, { as: driver });

    // Attendant manifest includes active pass and driverVerified badge
    const clientDeviceId = randomUUID();
    await w.call('POST', '/v1/attend/devices', {
      as: ownerId,
      aal: 'aal2',
      body: { lotId: lot.id, clientDeviceId },
    });
    const manifest = await w.call(
      'GET',
      `/v1/attend/lots/${lot.id}/manifest?clientDeviceId=${clientDeviceId}`,
      { as: ownerId, aal: 'aal2' },
    );
    expect(manifest.status).toBe(200);
    expect(manifest.body?.passes).toEqual([
      expect.objectContaining({
        id: passId,
        plateNorm: 'LAG777KY',
        driverVerified: true,
      }),
    ]);

    // Operator can toggle requiresVerifiedDriver on a LIVE lot
    const currentLot = await w.call('GET', `/v1/operators/${operatorId}/lots/${lot.id}`, {
      as: ownerId,
      aal: 'aal2',
    });
    const patched = await w.call('PATCH', `/v1/operators/${operatorId}/lots/${lot.id}`, {
      as: ownerId,
      aal: 'aal2',
      body: {
        version: (currentLot.body as { version: number }).version,
        requiresVerifiedDriver: false,
      },
    });
    expect(patched.status).toBe(200);
    expect(patched.body?.requiresVerifiedDriver).toBe(false);
  });
});

describe('Capacity blackouts (FR-LOT-008)', () => {
  it('allows operators to create, list, and delete capacity blackouts and reduces available bays', async () => {
    const w = world();
    const { lot, operatorId, ownerId } = await addMonthlyLot(w.store, { capacity: 4 });

    const created = await w.call('POST', `/v1/operators/${operatorId}/lots/${lot.id}/blocks`, {
      as: ownerId,
      aal: 'aal2',
      body: {
        startsAt: '2026-10-20T08:00:00.000Z',
        endsAt: '2026-10-20T12:00:00.000Z',
        blockedBays: 3,
        reason: 'Private wedding event',
      },
    });
    expect(created.status).toBe(201);
    const blockId = (created.body as { id: string }).id;

    // Availability during blackout reflects 4 - 3 = 1 available space
    const avail = await w.call(
      'GET',
      `/v1/lots/${lot.id}/availability?product=HOURLY&startAt=2026-10-20T09:00:00.000Z&endAt=2026-10-20T11:00:00.000Z`,
    );
    expect(avail.status).toBe(200);
    expect(avail.body?.availableCount).toBe(1);

    // List blackouts
    const list = await w.call('GET', `/v1/operators/${operatorId}/lots/${lot.id}/blocks`, {
      as: ownerId,
      aal: 'aal2',
    });
    expect(list.status).toBe(200);
    expect((list.body?.items as unknown[]).length).toBe(1);

    // Delete blackout restores availability to 4
    const del = await w.call(
      'DELETE',
      `/v1/operators/${operatorId}/lots/${lot.id}/blocks/${blockId}`,
      { as: ownerId, aal: 'aal2' },
    );
    expect(del.status).toBe(204);

    const availAfter = await w.call(
      'GET',
      `/v1/lots/${lot.id}/availability?product=HOURLY&startAt=2026-10-20T09:00:00.000Z&endAt=2026-10-20T11:00:00.000Z`,
    );
    expect(availAfter.body?.availableCount).toBe(4);
  });
});

describe('Flutterwave webhook (FR-PAY-007), retry-webhooks job & reapply-erasures job', () => {
  it('processes Flutterwave charge.completed webhook and settles pass payment', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store);
    const driver = w.user();
    const v = await addVehicle(w, driver, 'LAG-888FW');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-20', source: 'WEB' },
    });
    const passId = (created.body?.pass as { id: string }).id;
    const reference = (created.body?.payment as { reference: string }).reference;

    const payload = JSON.stringify({
      event: 'charge.completed',
      data: {
        id: 99123,
        tx_ref: reference,
        status: 'successful',
        amount: 25100,
        currency: 'NGN',
        payment_type: 'card',
      },
    });
    const sig = w.payments.signWebhook(payload);
    w.payments.pay(reference);
    const hookRes = await w.call('POST', '/v1/webhooks/flutterwave', {
      headers: { 'verif-hash': sig },
      body: JSON.parse(payload),
    });
    expect(hookRes.status).toBe(200);

    const passAfter = await w.call('GET', `/v1/passes/${passId}`, { as: driver });
    expect(passAfter.body?.status).toBe('ACTIVE');
  });

  it('retries failed webhooks via retryWebhooksJob and re-scrubs restored users via reapplyErasuresJob', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store);
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'RestoredUser');
    const v = await addVehicle(w, driver, 'LAG-999RR');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-20', source: 'WEB' },
    });
    const passId = (created.body?.pass as { id: string }).id;
    const reference = (created.body?.payment as { reference: string }).reference;

    // Seed a FAILED webhook for that reference
    const rec = await w.store.webhooks.record({
      provider: 'PAYSTACK',
      dedupeKey: `charge.success:${reference}:1`,
      eventType: 'charge.success',
      reference,
      payload: { event: 'charge.success' },
      at: new Date(TEST_NOW.getTime() - 60_000),
    });
    await w.store.webhooks.finish(
      rec.id,
      'FAILED',
      'transient error',
      new Date(TEST_NOW.getTime() - 60_000),
    );
    w.payments.pay(reference);

    const retryJob = retryWebhooksJob({
      store: w.store,
      payments: w.payments,
      notifications: w.deps.notifications,
      logger: w.deps.logger,
      now: () => TEST_NOW,
    });
    const retryRes = await retryJob({ payload: {}, deadline: new Date(TEST_NOW.getTime() + 5000) });
    expect(retryRes.processed).toBe(1);
    expect((await w.store.passes.find(passId))?.status).toBe('ACTIVE');

    // Simulate a backup restore where an erased user still has status ACTIVE and firstName set
    w.store.erasureLogRows.push({
      userId: driver,
      dsrId: null,
      erasedAt: new Date('2026-10-18T00:00:00Z'),
    });
    const eraseJob = reapplyErasuresJob({
      store: w.store,
      logger: w.deps.logger,
      now: () => TEST_NOW,
    });
    const eraseRes = await eraseJob({ payload: {}, deadline: new Date(TEST_NOW.getTime() + 5000) });
    expect(eraseRes.processed).toBe(1);
    const userAfter = await w.store.users.find(driver);
    expect(userAfter?.status).toBe('DELETED');
    expect(userAfter?.firstName).toBeNull();
  });

  it('handles self-checkin, self-checkout, and waitlist validation edge cases', async () => {
    const w = world();
    const { lot } = await addMonthlyLot(w.store, { selfCheckin: false });
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'SelfCheckDriver');
    const otherDriver = w.user([{ role: 'DRIVER', operatorId: null }], 'OtherDriver');
    const v = await addVehicle(w, driver, 'LAG-888ZZ');

    const created = await w.call('POST', '/v1/passes', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: v.id, startDate: '2026-10-19', source: 'WEB' },
    });
    const passId = (created.body?.pass as { id: string }).id;
    w.payments.pay((created.body?.payment as { reference: string }).reference);
    await w.call('POST', `/v1/passes/${passId}/verify`, { as: driver });

    // Other driver gets 404
    const otherGet = await w.call('GET', `/v1/passes/${passId}`, { as: otherDriver });
    expect(otherGet.status).toBe(404);

    // Owner gets 200
    const ownerGet = await w.call('GET', `/v1/passes/${passId}`, { as: driver });
    expect(ownerGet.status).toBe(200);

    // Waitlist validations
    const wlPast = await w.call('POST', '/v1/passes/waitlist', {
      as: driver,
      body: { lotId: lot.id, desiredStartDate: '2026-09-01' },
    });
    expect(wlPast.status).toBe(400);

    const wlFar = await w.call('POST', '/v1/passes/waitlist', {
      as: driver,
      body: { lotId: lot.id, desiredStartDate: '2026-12-01' },
    });
    expect(wlFar.status).toBe(400);

    // Self check-in when lot has self-checkin disabled -> SELF_CHECKIN_OFF (400)
    const posterCode = gateCodes(w.deps.crypto).poster(lot.id);
    const selfCheckOff = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: posterCode,
        lat: lot.location.lat,
        lng: lot.location.lng,
      },
    });
    expect(selfCheckOff.status).toBe(422);

    // Enable self-checkin on lot
    await w.store.lots.setSelfCheckin(lot.operatorId, lot.id, true);

    // Bad gate code -> QR_WRONG_LOT
    const badCode = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: 'INVALID_CODE',
        lat: lot.location.lat,
        lng: lot.location.lng,
      },
    });
    expect(badCode.status).toBe(422);

    // Far coordinates -> SELF_CHECKIN_TOO_FAR
    const farCheck = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: posterCode,
        lat: lot.location.lat + 1.0,
        lng: lot.location.lng + 1.0,
      },
    });
    expect(farCheck.status).toBe(422);

    // Successful self-check-in
    const selfIn = await w.call('POST', `/v1/passes/${passId}/self-check-in`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: posterCode,
        lat: lot.location.lat,
        lng: lot.location.lng,
      },
    });
    expect(selfIn.status).toBe(200);

    // Successful self-check-out
    const selfOut = await w.call('POST', `/v1/passes/${passId}/self-check-out`, {
      as: driver,
      body: {
        clientEventId: randomUUID(),
        code: posterCode,
        lat: lot.location.lat,
        lng: lot.location.lng,
      },
    });
    expect(selfOut.status).toBe(200);
  });
});

describe('Sprint 9 RBAC Matrix', () => {
  it('enforces authentication, role checks, and cross-tenant isolation on all Sprint 9 endpoints', async () => {
    const w = world();
    const { lot, operatorId } = await addMonthlyLot(w.store);
    const driverA = w.user();
    const driverB = w.user();
    const attendant = w.user([{ role: 'OPERATOR_ATTENDANT', operatorId }]);
    const vA = await addVehicle(w, driverA, 'LAG-501AA');

    const passRes = await w.call('POST', '/v1/passes', {
      as: driverA,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: vA.id, startDate: '2026-10-20', source: 'WEB' },
    });
    const passId = (passRes.body?.pass as { id: string }).id;

    // 1. Unauthenticated requests -> 401
    expect((await w.call('GET', '/v1/passes')).status).toBe(401);
    expect((await w.call('POST', '/v1/passes', { body: {} })).status).toBe(401);
    expect((await w.call('GET', '/v1/me/verification')).status).toBe(401);
    expect((await w.call('GET', `/v1/operators/${operatorId}/lots/${lot.id}/blocks`)).status).toBe(
      401,
    );

    // 2. Non-driver cannot create or read driver passes -> 403
    expect((await w.call('GET', '/v1/passes', { as: attendant })).status).toBe(403);
    expect(
      (
        await w.call('POST', '/v1/passes/waitlist', {
          as: attendant,
          body: { lotId: lot.id, desiredStart: '2026-10-20' },
        })
      ).status,
    ).toBe(403);

    // 3. Cross-driver isolation on pass endpoints -> 404 (no enumeration)
    expect((await w.call('GET', `/v1/passes/${passId}`, { as: driverB })).status).toBe(404);
    expect((await w.call('POST', `/v1/passes/${passId}/verify`, { as: driverB })).status).toBe(404);
    expect(
      (
        await w.call('POST', `/v1/passes/${passId}/swap-vehicle`, {
          as: driverB,
          body: { vehicleId: vA.id },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await w.call('POST', `/v1/passes/${passId}/renew`, {
          as: driverB,
          body: { source: 'WEB' },
        })
      ).status,
    ).toBe(404);

    // 4. Capacity blackouts require operator owner/manager with AAL2 -> 404 for driver/attendant
    expect(
      (await w.call('GET', `/v1/operators/${operatorId}/lots/${lot.id}/blocks`, { as: driverA }))
        .status,
    ).toBe(404);
    expect(
      (await w.call('GET', `/v1/operators/${operatorId}/lots/${lot.id}/blocks`, { as: attendant }))
        .status,
    ).toBe(404);
  });
});
