import { randomUUID } from 'node:crypto';
import { verifyQrToken, fromBase64Url } from '@parkly/domain/qr';
import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../store/memory.js';
import { attendantGateCodeFor, gateCodePayload, gateMinute } from '@parkly/domain/checkin';
import { gateCodes, signGatePayload } from '../../lib/gate-codes.js';
import { TEST_NOW, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos; bookings 10:00–12:00 Lagos today.
const START = '2026-10-19T09:00:00.000Z';
const END = '2026-10-19T11:00:00.000Z';
const min = (n: number) => new Date(TEST_NOW.getTime() + n * 60_000).toISOString();

async function addLot(store: MemoryStore, capacity = 5) {
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
    addressLine: 'VI',
    area: null,
    lga: null,
    location: { lat: 6.43, lng: 3.42 },
    entranceNotes: null,
    capacityTotal: capacity + 5,
    capacityBookable: capacity,
    amenities: [],
    vehicleTypes: ['CAR'],
    createdBy: ownerId,
  });
  const reviewer = { reviewerId: ownerId, at: new Date('2026-10-10T10:00:00Z') };
  const permit = await store.permits.create({
    lotId: lot.id,
    permitNumber: 'LASPA/1',
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
    capacityCounted: 10,
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
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      is24h: true,
      opensAt: null,
      closesAt: null,
    })),
  );
  await store.lots.setStatus(op.id, lot.id, 'DRAFT', 'PENDING_VERIFICATION', null);
  await store.lots.setStatus(op.id, lot.id, 'PENDING_VERIFICATION', 'LIVE', null);
  return { lot, operatorId: op.id, ownerId };
}

async function setup() {
  const w = world();
  const { lot, operatorId, ownerId } = await addLot(w.store);
  w.store.roleRows.push({ userId: ownerId, role: 'OPERATOR_OWNER', operatorId });

  const attendant = w.user([{ role: 'OPERATOR_ATTENDANT', operatorId }], 'Musa');
  w.store.memberRows.push({
    id: randomUUID(),
    operatorId,
    userId: attendant,
    role: 'ATTENDANT',
    lotIds: [],
    status: 'ACTIVE',
    inviteeName: 'Musa',
    inviteExpiresAt: null,
    invitedBy: ownerId,
    acceptedAt: TEST_NOW,
    createdAt: TEST_NOW,
    inviteePhoneHash: null,
    inviteeEmailHash: null,
    inviteTokenHash: null,
  });

  /** A paid booking for today 10:00–12:00 Lagos. */
  async function paidBooking(plate = 'LND 123 AB') {
    const driver = w.user();
    const vehicle = await w.store.vehicles.create({
      userId: driver,
      plateRaw: plate,
      plateNorm: plate.replace(/\s/g, ''),
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
    const ref = (created.body?.payment as { reference: string }).reference;
    w.payments.pay(ref);
    await w.call('POST', `/v1/payments/${ref}/verify`, { as: driver });
    const id = (created.body?.booking as { id: string }).id;
    // The ticket (and the lot key) are made when the driver opens the booking.
    const view = await w.call('GET', `/v1/bookings/${id}`, { as: driver });
    return { id, qrToken: view.body?.qrToken as string, driver };
  }

  const device = randomUUID();
  const register = (as: string, aal?: 'aal2', clientDeviceId = device) =>
    w.call('POST', '/v1/attend/devices', {
      as,
      ...(aal ? { aal } : {}),
      body: { clientDeviceId, lotId: lot.id },
    });
  const approve = async (deviceId: string, decision: 'approve' | 'revoke' = 'approve') =>
    w.call('POST', `/v1/operators/${operatorId}/devices/${deviceId}`, {
      as: ownerId,
      aal: 'aal2',
      body: { decision },
    });
  const manifest = (as = attendant, clientDeviceId = device) =>
    w.call('GET', `/v1/attend/lots/${lot.id}/manifest?clientDeviceId=${clientDeviceId}`, { as });
  const sync = (
    events: unknown[],
    opts: { batchId?: string; as?: string; clientDeviceId?: string } = {},
  ) =>
    w.call('POST', '/v1/attend/sync', {
      as: opts.as ?? attendant,
      body: {
        clientDeviceId: opts.clientDeviceId ?? device,
        lotId: lot.id,
        batchId: opts.batchId ?? randomUUID(),
        // The phone and server clocks agree (drift correction is tested in attend-plan.spec).
        deviceSentAt: w.deps.now().toISOString(),
        events,
      },
    });
  async function readyDevice() {
    const reg = await register(attendant);
    await approve((reg.body as { id: string }).id);
  }
  return {
    ...w,
    lot,
    operatorId,
    ownerId,
    attendant,
    paidBooking,
    register,
    approve,
    manifest,
    sync,
    readyDevice,
    device,
  };
}

const checkIn = (bookingId: string, deviceTime: string, extra: Record<string, unknown> = {}) => ({
  type: 'CHECK_IN',
  clientEventId: randomUUID(),
  bookingId,
  method: 'QR',
  deviceTime,
  ...extra,
});

describe('attendant phones (doc 05 §4.4)', () => {
  it('needs a manager’s approval before the manifest; owners need none', async () => {
    const t = await setup();
    const reg = await t.register(t.attendant);
    expect(reg.body).toMatchObject({ approved: false, revoked: false });
    expect((await t.manifest()).body?.code).toBe('DEVICE_NOT_APPROVED');

    const list = await t.call('GET', `/v1/operators/${t.operatorId}/devices`, {
      as: t.ownerId,
      aal: 'aal2',
    });
    expect(list.body?.items).toEqual([
      expect.objectContaining({
        attendantName: 'Musa',
        lotName: 'Eko Hotel Car Park',
        approved: false,
      }),
    ]);
    expect((await t.approve((reg.body as { id: string }).id)).body).toMatchObject({
      approved: true,
    });
    expect((await t.manifest()).status).toBe(200);
    expect(t.store.auditRows.some((a) => a.action === 'attendant_device.approve')).toBe(true);

    const ownerDevice = randomUUID();
    const own = await t.register(t.ownerId, 'aal2', ownerDevice);
    expect(own.body).toMatchObject({ approved: true });
  });

  it('keeps a blocked phone blocked, even if it registers again', async () => {
    const t = await setup();
    await t.readyDevice();
    const id = t.store.attending.deviceRows[0]?.id ?? '';
    await t.approve(id, 'revoke');
    expect((await t.manifest()).body?.code).toBe('DEVICE_REVOKED');
    expect((await t.register(t.attendant)).body).toMatchObject({ approved: false, revoked: true });
    expect((await t.sync([])).body?.code).toBe('DEVICE_REVOKED');
  });

  it('stays blocked when the attendant signs in again on that phone (gap review S-1)', async () => {
    const t = await setup();
    await t.readyDevice();
    await t.approve(t.store.attending.deviceRows[0]?.id ?? '', 'revoke');
    // Sign-in registers the same phone as a driver device, which used to clear the block.
    await t.call('POST', '/v1/me/devices', {
      as: t.attendant,
      body: { deviceId: t.device, platform: 'ANDROID' },
    });
    expect((await t.manifest()).body?.code).toBe('DEVICE_REVOKED');
  });

  it('needs a new approval when the phone moves to another operator’s lot (gap review G-3)', async () => {
    const t = await setup();
    await t.readyDevice();
    const other = await addLot(t.store);
    t.store.roleRows.push({
      userId: t.attendant,
      role: 'OPERATOR_ATTENDANT',
      operatorId: other.operatorId,
    });
    const member = t.store.memberRows.find((m) => m.userId === t.attendant);
    if (member)
      t.store.memberRows.push({ ...member, id: randomUUID(), operatorId: other.operatorId });
    const moved = await t.call('POST', '/v1/attend/devices', {
      as: t.attendant,
      body: { clientDeviceId: t.device, lotId: other.lot.id },
    });
    expect(moved.body).toMatchObject({ approved: false });
    const there = await t.call(
      'GET',
      `/v1/attend/lots/${other.lot.id}/manifest?clientDeviceId=${t.device}`,
      { as: t.attendant },
    );
    expect(there.body?.code).toBe('DEVICE_NOT_APPROVED');
  });

  it('keeps a blocked phone’s queue for review without applying it (gap review G-6, G-7)', async () => {
    const t = await setup();
    await t.readyDevice();
    const { id } = await t.paidBooking('LND 123 AB');
    await t.approve(t.store.attending.deviceRows[0]?.id ?? '', 'revoke');
    const res = await t.sync([checkIn(id, min(-5))]);
    expect(res.body?.code).toBe('DEVICE_REVOKED');
    expect(t.store.attending.eventRows).toEqual([
      expect.objectContaining({ result: 'REJECTED', reason: 'DEVICE_REVOKED' }),
    ]);
    expect((await t.store.bookings.find(id))?.status).toBe('CONFIRMED');

    // Removed from the team: the phone is told to wipe, not "lot not found".
    const t2 = await setup();
    await t2.readyDevice();
    t2.store.roleRows.splice(
      t2.store.roleRows.findIndex((r) => r.userId === t2.attendant),
      1,
    );
    await t2.store.devices.revokeAll(t2.attendant);
    expect((await t2.sync([])).body?.code).toBe('DEVICE_REVOKED');
    expect((await t2.manifest()).body?.code).toBe('DEVICE_REVOKED');
  });

  it('hides other operators’ lots and refuses drivers', async () => {
    const t = await setup();
    const stranger = t.user([{ role: 'OPERATOR_ATTENDANT', operatorId: randomUUID() }]);
    expect((await t.register(stranger)).body?.code).toBe('LOT_NOT_FOUND');
    expect((await t.register(t.user())).status).toBe(404);
  });
});

describe('lot picker (A-01)', () => {
  it('lists the lots an attendant works, and nothing for others', async () => {
    const t = await setup();
    const mine = await t.call('GET', '/v1/attend/lots', { as: t.attendant });
    expect(mine.body?.items).toEqual([
      { id: t.lot.id, name: 'Eko Hotel Car Park', status: 'LIVE' },
    ]);
    const driver = await t.call('GET', '/v1/attend/lots', { as: t.user() });
    expect(driver.body?.items).toEqual([]);
  });
});

describe('manifest (doc 01 §7)', () => {
  it('has today’s paid bookings, the lot key, rules and the server time', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const m = (await t.manifest()).body as {
      serverTime: string;
      bookings: { id: string; status: string; plateNorm: string }[];
      keys: { kid: string; publicKey: string }[];
      rules: { earlyArrivalMin: number };
    };
    expect(m.serverTime).toBe(TEST_NOW.toISOString());
    expect(m.bookings).toEqual([
      expect.objectContaining({ id: paid.id, status: 'CONFIRMED', plateNorm: 'LND123AB' }),
    ]);
    expect(m.rules.earlyArrivalMin).toBe(30);
    // The gate can check the driver's ticket offline with the manifest's key.
    const key = m.keys[0];
    const check = await verifyQrToken(paid.qrToken, {
      publicKeys: { [key?.kid ?? '']: fromBase64Url(key?.publicKey ?? '') ?? new Uint8Array() },
      lotId: t.lot.id,
      now: new Date(START),
      earlyArrivalMin: 30,
      overstayAllowanceMin: 240,
    });
    expect(check.ok).toBe(true);
  });
});

describe('sync (doc 01 §5.3)', () => {
  it('checks in, ignores repeats, checks out and prices the overstay', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const first = checkIn(paid.id, min(55), { plateSeen: 'LND123AB' });
    const batch = randomUUID();
    const r1 = await t.sync([first], { batchId: batch });
    expect(r1.body?.results).toEqual([
      { clientEventId: first.clientEventId, result: 'APPLIED', reason: null },
    ]);
    expect(t.store.booking.bookingRows.find((b) => b.id === paid.id)?.status).toBe('CHECKED_IN');

    // The same batch again (lost reply), and the same event in a new batch.
    expect((await t.sync([first], { batchId: batch })).body?.results).toEqual([
      { clientEventId: first.clientEventId, result: 'DUPLICATE', reason: 'ALREADY_SYNCED' },
    ]);
    expect(((await t.sync([first])).body?.results as { result: string }[])[0]?.result).toBe(
      'DUPLICATE',
    );

    // Left at 12:40 Lagos: 40 min after the end, 10 min grace → 30 min overstay.
    const out = {
      type: 'CHECK_OUT',
      clientEventId: randomUUID(),
      bookingId: paid.id,
      method: 'QR',
      deviceTime: min(220),
    };
    expect(((await t.sync([out])).body?.results as { result: string }[])[0]?.result).toBe(
      'APPLIED',
    );
    expect(t.store.booking.bookingRows.find((b) => b.id === paid.id)?.status).toBe('COMPLETED');
    expect(t.store.attending.sessionRows[0]).toMatchObject({
      overstayMinutes: 30,
      overstayAmountKobo: 25_000,
    });
    // FR-NOT-002: one notice each, however often the events were synced.
    expect(
      t.store.outbox.rows.map((r) => r.eventKey).filter((k) => k.startsWith('session.')),
    ).toEqual(['session.checked_in', 'session.checked_out', 'session.overstay_due']);
    expect(
      t.store.outbox.rows.find((r) => r.eventKey === 'session.overstay_due')?.payload,
    ).toMatchObject({
      overstayMinutes: 30,
      amountKobo: 25_000,
    });
  });

  it('keeps the earliest check-in when two phones both checked the car in', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const other = randomUUID();
    const reg = await t.register(t.attendant, undefined, other);
    await t.approve((reg.body as { id: string }).id);
    await t.sync([checkIn(paid.id, min(58))]);
    const earlier = checkIn(paid.id, min(52));
    const later = checkIn(paid.id, min(59));
    const res = await t.sync([earlier, later], { clientDeviceId: other });
    expect((res.body?.results as { result: string }[]).map((r) => r.result)).toEqual([
      'APPLIED',
      'DUPLICATE',
    ]);
    expect(t.store.attending.sessionRows[0]?.checkInAt?.toISOString()).toBe(min(52));
  });

  it('records a car on a booking cancelled while offline, and rejects unknown bookings', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const b = t.store.booking.bookingRows.find((r) => r.id === paid.id);
    if (b) b.status = 'CANCELLED';
    const res = await t.sync([checkIn(paid.id, min(55)), checkIn(randomUUID(), min(56))]);
    expect(res.body?.results).toEqual([
      expect.objectContaining({ result: 'CONFLICT', reason: 'ENTRY_AFTER_CANCEL' }),
      expect.objectContaining({ result: 'REJECTED', reason: 'UNKNOWN_BOOKING' }),
    ]);
    expect(t.store.attending.sessionRows[0]?.flags).toContain('ENTRY_AFTER_CANCEL');
  });

  it('lets a late car in after a no-show, taking the space again', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const b = t.store.booking.bookingRows.find((r) => r.id === paid.id);
    if (b) b.status = 'NO_SHOW';
    for (const s of t.store.slotRows) if (s.lotId === t.lot.id) s.booked = 0;
    const res = await t.sync([checkIn(paid.id, min(100))]);
    expect((res.body?.results as { result: string }[])[0]?.result).toBe('APPLIED');
    expect(b?.status).toBe('CHECKED_IN');
    const later = t.store.slotRows.filter(
      (s) => s.lotId === t.lot.id && s.slotStart.toISOString() >= min(90),
    );
    expect(later.every((s) => s.booked === 1)).toBe(true);
  });

  it('counts walk-ins, never below zero, and accepts issue reports', async () => {
    const t = await setup();
    await t.readyDevice();
    const walk = (delta: number) => ({
      type: 'WALK_IN',
      clientEventId: randomUUID(),
      delta,
      deviceTime: min(1),
    });
    await t.sync([walk(1), walk(-1), walk(-1), walk(1)]);
    expect(t.store.attending.walkInCounts.get(t.lot.id)).toBe(1);
    const issue = {
      type: 'ISSUE',
      clientEventId: randomUUID(),
      note: 'Gate barrier stuck',
      deviceTime: min(2),
    };
    expect(((await t.sync([issue])).body?.results as { result: string }[])[0]?.result).toBe(
      'APPLIED',
    );
    expect((await t.manifest()).body?.walkIns).toBe(1);
  });

  it('syncs twenty offline check-ins in one batch, losing none', async () => {
    const t = await setup();
    await t.readyDevice();
    const events = [];
    for (let i = 0; i < 4; i++) {
      const paid = await t.paidBooking(`LND 12${i} AB`);
      events.push(checkIn(paid.id, min(50 + i)));
    }
    for (let i = 0; i < 16; i++)
      events.push({
        type: 'WALK_IN',
        clientEventId: randomUUID(),
        delta: 1,
        deviceTime: min(60 + i),
      });
    const res = await t.sync(events);
    expect((res.body?.results as unknown[]).length).toBe(20);
    expect((res.body?.results as { result: string }[]).every((r) => r.result === 'APPLIED')).toBe(
      true,
    );
    expect(t.store.attending.eventRows).toHaveLength(20);
  });
});

describe('driver timer data (ADR 0016)', () => {
  it('shows the overstay price, the check-in time and a live, then final, overstay', async () => {
    const t = await setup();
    const paid = await t.paidBooking();
    await t.readyDevice();
    const view = () => t.call('GET', `/v1/bookings/${paid.id}`, { as: paid.driver });

    // ₦500 an hour → ₦125 per 15 minutes after a 10-minute grace.
    expect((await view()).body).toMatchObject({
      overstay: { graceMin: 10, per15Kobo: 12_500 },
      stay: null,
    });

    await t.sync([checkIn(paid.id, min(55))]);
    expect((await view()).body?.stay).toEqual({
      checkedInAt: min(55),
      checkedOutAt: null,
      overstayMinutes: 0,
      overstayKobo: 0,
    });

    // 12:40 Lagos, still parked: 40 min past the end, 10 min grace → 30 min so far.
    t.deps.now = () => new Date(min(220));
    expect((await view()).body?.stay).toMatchObject({ overstayMinutes: 30, overstayKobo: 25_000 });

    const out = {
      type: 'CHECK_OUT',
      clientEventId: randomUUID(),
      bookingId: paid.id,
      method: 'QR',
      deviceTime: min(226),
    };
    await t.sync([out]);
    t.deps.now = () => new Date(min(300));
    expect((await view()).body?.stay).toEqual({
      checkedInAt: min(55),
      checkedOutAt: min(226),
      overstayMinutes: 45,
      overstayKobo: 37_500,
    });
  });
});

describe('live occupancy (doc 03 §2.4)', () => {
  it('counts parked cars, walk-ins and who is still expected', async () => {
    const t = await setup();
    const a = await t.paidBooking('LND 111 AB');
    await t.paidBooking('LND 222 AB');
    await t.readyDevice();
    await t.sync([
      checkIn(a.id, min(55)),
      { type: 'WALK_IN', clientEventId: randomUUID(), delta: 1, deviceTime: min(56) },
    ]);
    const res = await t.call('GET', `/v1/operators/${t.operatorId}/occupancy`, {
      as: t.ownerId,
      aal: 'aal2',
    });
    expect(res.body?.items).toEqual([
      {
        lotId: t.lot.id,
        name: 'Eko Hotel Car Park',
        capacityTotal: 10,
        parked: 1,
        walkIns: 1,
        expected: 1,
      },
    ]);
  });
});

describe('self check-in (ADR 0016)', () => {
  const AT_LOT = { lat: 6.4301, lng: 3.4201 };
  async function selfSetup() {
    const t = await setup();
    const paid = await t.paidBooking();
    const toggle = (enabled: boolean, as = t.ownerId) =>
      t.call('POST', `/v1/operators/${t.operatorId}/lots/${t.lot.id}/self-check-in`, {
        as,
        aal: 'aal2',
        body: { enabled },
      });
    const codes = gateCodes(t.deps.crypto);
    const poster = codes.poster(t.lot.id);
    /** What the attendant's phone shows at `at` (it signs with the manifest's gate key). */
    const phoneCode = (at: Date) => {
      const minute = gateMinute(at);
      const key = Buffer.from(codes.attendantKey(t.lot.id), 'base64url');
      const payload = gateCodePayload({ kind: 'ATTENDANT', lotId: t.lot.id, minute });
      return attendantGateCodeFor(t.lot.id, minute, signGatePayload(key, payload));
    };
    const self = (
      kind: 'in' | 'out',
      body: Partial<{ code: string; lat: number; lng: number; clientEventId: string }> = {},
      as = paid.driver,
    ) =>
      t.call('POST', `/v1/bookings/${paid.id}/self-check-${kind}`, {
        as,
        body: { clientEventId: randomUUID(), code: poster, ...AT_LOT, ...body },
      });
    return { ...t, paid, toggle, self, poster, phoneCode };
  }

  it('is off until the owner turns it on; managers and attendants cannot switch it', async () => {
    const t = await selfSetup();
    t.deps.now = () => new Date(min(55));
    expect((await t.self('in')).body?.code).toBe('SELF_CHECKIN_OFF');
    expect((await t.toggle(true, t.attendant)).status).toBe(404);

    const on = await t.toggle(true);
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ lotId: t.lot.id, enabled: true, gateCode: t.poster });
    expect(t.store.auditRows.at(-1)).toMatchObject({ action: 'lot.self_checkin_on' });
    const read = await t.call(
      'GET',
      `/v1/operators/${t.operatorId}/lots/${t.lot.id}/self-check-in`,
      {
        as: t.ownerId,
        aal: 'aal2',
      },
    );
    expect(read.body?.enabled).toBe(true);
    expect(
      (await t.call('GET', `/v1/bookings/${t.paid.id}`, { as: t.paid.driver })).body?.lot,
    ).toMatchObject({ selfCheckIn: true });
  });

  it('checks the driver in at the lot during the window, once, then out with the overstay', async () => {
    const t = await selfSetup();
    await t.toggle(true);
    t.deps.now = () => new Date(min(55));
    const id = randomUUID();
    expect((await t.self('in', { clientEventId: id })).body).toEqual({
      result: 'APPLIED',
      reason: null,
    });
    expect((await t.self('in', { clientEventId: id })).body?.result).toBe('DUPLICATE');
    const view = await t.call('GET', `/v1/bookings/${t.paid.id}`, { as: t.paid.driver });
    expect(view.body).toMatchObject({ status: 'CHECKED_IN', stay: { checkedInAt: min(55) } });

    t.deps.now = () => new Date(min(226));
    expect((await t.self('out')).body?.result).toBe('APPLIED');
    const after = await t.call('GET', `/v1/bookings/${t.paid.id}`, { as: t.paid.driver });
    expect(after.body?.stay).toMatchObject({ overstayMinutes: 45, overstayKobo: 37_500 });
    expect(
      t.store.outbox.rows.map((r) => r.eventKey).filter((k) => k.startsWith('session.')),
    ).toEqual(['session.checked_in', 'session.checked_out', 'session.overstay_due']);
  });

  it('refuses the wrong poster, a phone far away, outside the window, and other drivers', async () => {
    const t = await selfSetup();
    await t.toggle(true);
    t.deps.now = () => new Date(min(55));
    expect((await t.self('in', { code: `PKG1.${randomUUID()}` })).body?.code).toBe('QR_WRONG_LOT');
    // The old unsigned code, which anyone could build from a booking (gap review G-1).
    expect((await t.self('in', { code: `PKG1.${t.lot.id}` })).body?.code).toBe('QR_WRONG_LOT');
    expect((await t.self('in', { code: `PKGA.${t.lot.id}` })).body?.code).toBe('QR_WRONG_LOT');
    // An attendant code from three minutes ago, or with someone else's signature.
    expect((await t.self('in', { code: t.phoneCode(new Date(min(52))) })).body?.code).toBe(
      'QR_WRONG_LOT',
    );
    const forged = t.phoneCode(new Date(min(55))).replace(/.[^.]+$/, '.AAAAAAAAAAAAAAAA');
    expect((await t.self('in', { code: forged })).body?.code).toBe('QR_WRONG_LOT');
    expect((await t.self('in', { code: 'hello' })).body?.code).toBe('QR_WRONG_LOT');
    expect((await t.self('in', { lat: 6.44, lng: 3.42 })).body?.code).toBe('SELF_CHECKIN_TOO_FAR');
    expect((await t.self('out')).body?.code).toBe('BOOKING_NOT_ACTIVE');
    expect((await t.self('in', {}, t.user())).status).toBe(404);
    expect((await t.self('in', {}, t.ownerId)).status).toBe(404);
    t.deps.now = () => new Date(min(0));
    expect((await t.self('in')).body?.code).toBe('QR_OUTSIDE_WINDOW');
  });

  it('allows driver to check in and out by scanning attendant phone barcode even when unmanned self-checkin is off', async () => {
    const t = await selfSetup();
    // unmanned self-checkin is off by default
    t.deps.now = () => new Date(min(55));
    // Poster code is refused because unmanned self-checkin is off
    expect((await t.self('in')).body?.code).toBe('SELF_CHECKIN_OFF');

    // The code on the attendant's phone, signed for this minute, succeeds.
    const inRes = await t.self('in', { code: t.phoneCode(new Date(min(55))) });
    expect(inRes.body).toEqual({ result: 'APPLIED', reason: null });

    t.deps.now = () => new Date(min(226));
    const outRes = await t.self('out', { code: t.phoneCode(new Date(min(226))) });
    expect(outRes.body?.result).toBe('APPLIED');
  });

  it('can be turned off again', async () => {
    const t = await selfSetup();
    await t.toggle(true);
    await t.toggle(false);
    t.deps.now = () => new Date(min(55));
    expect((await t.self('in')).body?.code).toBe('SELF_CHECKIN_OFF');
    expect((await t.self('out')).body?.code).toBe('SELF_CHECKIN_OFF');
  });
});
