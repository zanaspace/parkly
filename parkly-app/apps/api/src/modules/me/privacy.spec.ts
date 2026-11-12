import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { accountErasureJob } from '../../jobs/account-erasure.js';
import { retentionPurgeJob } from '../../jobs/retention-purge.js';
import { createLogger } from '../../lib/logger.js';
import { addLiveLot, TEST_NOW, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos; the booking is 10:00-12:00 Lagos.
const START = '2026-10-19T09:00:00.000Z';
const END = '2026-10-19T11:00:00.000Z';
const DAY = 86_400_000;
const DEADLINE = new Date('2100-01-01T00:00:00Z');

async function setup() {
  const w = world();
  const { lot } = await addLiveLot(w.store);
  const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Ada');
  Object.assign(w.store.userRows.get(driver) ?? {}, {
    lastName: 'Okafor',
    phoneLast4: '4567',
    phoneHash: Buffer.from('hash'),
    phoneEnc: w.deps.crypto.encrypt('+2348031234567'),
    emailEnc: w.deps.crypto.encrypt('ada@example.com'),
  });
  const vehicle = await w.store.vehicles.create({
    userId: driver,
    plateRaw: 'LND 123 AB',
    plateNorm: 'LND123AB',
    make: 'Toyota',
    model: 'Corolla',
    colour: 'Blue',
    isDefault: true,
  });
  const unused = await w.store.vehicles.create({
    userId: driver,
    plateRaw: 'ABC 999 XY',
    plateNorm: 'ABC999XY',
    make: null,
    model: null,
    colour: null,
    isDefault: false,
  });
  const book = async () => {
    const created = await w.call('POST', '/v1/bookings', {
      as: driver,
      headers: { 'idempotency-key': randomUUID() },
      body: { lotId: lot.id, vehicleId: vehicle.id, startAt: START, endAt: END },
    });
    const reference = (created.body?.payment as { reference: string }).reference;
    w.payments.pay(reference);
    await w.call('POST', `/v1/payments/${reference}/verify`, { as: driver });
    return created.body?.booking as { id: string; code: string };
  };
  const staff = (role: 'ADMIN_COMPLIANCE' | 'SUPER_ADMIN' | 'ADMIN_OPS') => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const erase = () =>
    accountErasureJob({
      store: w.store,
      authAdmin: w.authAdmin,
      logger: createLogger({ level: 'silent' }),
      now: () => w.deps.now(),
    })({ payload: {}, deadline: DEADLINE });
  return { w, lot, driver, vehicle, unused, book, staff, erase };
}

/** Closes the booking so the account can be closed (it ended long ago). */
function finish(t: Awaited<ReturnType<typeof setup>>, bookingId: string) {
  const b = t.w.store.booking.bookingRows.find((r) => r.id === bookingId);
  if (b) b.status = 'COMPLETED';
}

describe('asking to close an account (doc 06 section 6.1)', () => {
  it('waits while a booking has not finished, then accepts', async () => {
    const t = await setup();
    const booking = await t.book();
    const blocked = await t.w.call('DELETE', '/v1/me', { as: t.driver });
    expect(blocked.status).toBe(409);
    expect(blocked.body?.code).toBe('ACCOUNT_HAS_OBLIGATIONS');
    expect(t.w.store.userRows.get(t.driver)?.status).toBe('ACTIVE');

    finish(t, booking.id);
    const ok = await t.w.call('DELETE', '/v1/me', { as: t.driver });
    expect(ok.status).toBe(202);
  });

  it('waits while an overstay is unpaid', async () => {
    const t = await setup();
    const booking = await t.book();
    finish(t, booking.id);
    t.w.store.attending.sessionRows.push({
      bookingId: booking.id,
      lotId: t.lot.id,
      plateNorm: 'LND123AB',
      overstayMinutes: 30,
      overstayAmountKobo: 5000,
      overstayStatus: 'UNPAID',
    } as never);
    const res = await t.w.call('DELETE', '/v1/me', { as: t.driver });
    expect(res.status).toBe(409);
    expect(res.body?.code).toBe('ACCOUNT_HAS_OBLIGATIONS');
  });

  it('lets the driver change their mind inside the 30 days, once, and ask again later', async () => {
    const t = await setup();
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    expect(t.w.store.userRows.get(t.driver)?.status).toBe('PENDING_DELETION');

    const res = await t.w.call('POST', '/v1/me/deletion/cancel', { as: t.driver });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ACTIVE' });
    expect(t.w.store.userRows.get(t.driver)?.status).toBe('ACTIVE');
    expect(t.w.store.dsrRows[0]?.status).toBe('CANCELLED');
    expect(t.w.store.auditRows.at(-1)).toMatchObject({ action: 'user.deletion_cancelled' });

    const again = await t.w.call('POST', '/v1/me/deletion/cancel', { as: t.driver });
    expect(again.status).toBe(409);
    expect((await t.w.call('DELETE', '/v1/me', { as: t.driver })).status).toBe(202);
  });
});

describe('a copy of your data (doc 06 section 11)', () => {
  it('builds the file, stores it privately, and hands out a short-lived link', async () => {
    const t = await setup();
    const booking = await t.book();
    const res = await t.w.call('POST', '/v1/me/data-export', { as: t.driver });
    expect(res.status).toBe(201);
    const id = res.body?.requestId as string;

    const dsr = t.w.store.dsrRows.find((r) => r.id === id);
    expect(dsr).toMatchObject({ type: 'ACCESS', status: 'COMPLETED' });
    expect(dsr?.dueAt.toISOString()).toBe(new Date(TEST_NOW.getTime() + 30 * DAY).toISOString());
    const path = `${t.driver}/${id}.json`;
    expect(dsr?.exportStoragePath).toBe(path);

    const file = JSON.parse(
      new TextDecoder().decode(t.w.storage.objects.get(`exports/${path}`)?.body),
    );
    expect(file.profile).toMatchObject({
      firstName: 'Ada',
      lastName: 'Okafor',
      phoneEndsWith: '4567',
    });
    expect(file.vehicles.map((v: { plate: string }) => v.plate).sort()).toEqual([
      'ABC 999 XY',
      'LND 123 AB',
    ]);
    expect(file.bookings).toEqual([
      expect.objectContaining({
        code: booking.code,
        carPark: 'Eko Hotel Car Park',
        status: 'CONFIRMED',
        plate: 'LND123AB',
        payments: [expect.objectContaining({ status: 'SUCCEEDED' })],
      }),
    ]);
    // The full phone and email never go in the file.
    const text = JSON.stringify(file);
    expect(text).not.toContain('8031234567');
    expect(text).not.toContain('ada@example.com');

    const link = await t.w.call('GET', `/v1/me/data-export/${id}`, { as: t.driver });
    expect(link.status).toBe(200);
    expect(link.body).toMatchObject({ expiresInSeconds: 900 });
    expect(String(link.body?.url)).toContain(`exports/${path}`);
    expect(t.w.store.auditRows.map((a) => a.action)).toEqual(
      expect.arrayContaining(['user.data_export_created', 'user.data_export_downloaded']),
    );
  });

  it('is only for its owner: someone else gets 404, and there is no export of a deletion', async () => {
    const t = await setup();
    const res = await t.w.call('POST', '/v1/me/data-export', { as: t.driver });
    const id = res.body?.requestId as string;
    const other = t.w.user([{ role: 'DRIVER', operatorId: null }], 'Bola');
    expect((await t.w.call('GET', `/v1/me/data-export/${id}`, { as: other })).status).toBe(404);
    expect(
      (await t.w.call('GET', `/v1/me/data-export/${randomUUID()}`, { as: t.driver })).status,
    ).toBe(404);
    const operator = t.w.user([{ role: 'OPERATOR_OWNER', operatorId: randomUUID() }]);
    expect((await t.w.call('POST', '/v1/me/data-export', { as: operator })).status).toBe(403);
  });
});

describe('the account-erasure job', () => {
  it('leaves an account alone until its 30 days are up', async () => {
    const t = await setup();
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    expect(await t.erase()).toEqual({ processed: 0, remaining: 0 });
    expect(t.w.authAdmin.deleted).toEqual([]);
    expect(t.w.store.userRows.get(t.driver)?.firstName).toBe('Ada');
  });

  it('erases the Auth user and anonymises the rest, keeping what the law keeps', async () => {
    const t = await setup();
    const booking = await t.book();
    finish(t, booking.id);
    await t.w.store.notifications.enqueue({
      userId: t.driver,
      bookingId: booking.id,
      eventKey: 'booking.confirmed',
      dedupeKey: `booking.confirmed:${booking.id}:x`,
      payload: { lotName: 'Eko' },
      notBefore: TEST_NOW,
    });
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    const dsr = t.w.store.dsrRows[0];

    // 30 days on.
    t.w.deps.now = () => new Date(TEST_NOW.getTime() + 30 * DAY + 1000);
    expect(await t.erase()).toEqual({ processed: 1, remaining: 0 });

    expect(t.w.authAdmin.deleted).toEqual([t.driver]);
    const user = t.w.store.userRows.get(t.driver);
    expect(user).toMatchObject({
      status: 'DELETED',
      firstName: null,
      lastName: null,
      phoneLast4: null,
      phoneHash: null,
      phoneEnc: null,
      emailEnc: null,
      marketingOptIn: false,
    });
    expect(t.w.store.roleRows.some((r) => r.userId === t.driver)).toBe(false);
    expect(t.w.store.outbox.rows.some((r) => r.userId === t.driver)).toBe(false);

    // The booking stays (financial record), with the plate turned into a one-way stand-in.
    const kept = t.w.store.booking.bookingRows.find((b) => b.id === booking.id);
    expect(kept?.plateNorm).toMatch(/^~[0-9a-f]{10}$/);
    expect(kept?.plateNorm).not.toBe('LND123AB');
    // The vehicle a booking points at is scrubbed; the unused one is gone.
    const left = t.w.store.vehicleRows.filter((v) => v.userId === t.driver);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: t.vehicle.id, make: null, model: null, colour: null });
    expect(left[0]?.plateRaw).toBe(kept?.plateNorm);
    expect(t.w.store.vehicleRows.some((v) => v.id === t.unused.id)).toBe(false);

    expect(t.w.store.dsrRows.find((r) => r.id === dsr?.id)?.status).toBe('COMPLETED');
    expect(t.w.store.erasureLogRows).toEqual([
      { userId: t.driver, dsrId: dsr?.id, erasedAt: expect.any(Date) },
    ]);
    const audit = t.w.store.auditRows.at(-1);
    expect(audit).toMatchObject({
      action: 'account.erased',
      actorRole: 'SYSTEM',
      entityId: t.driver,
      after: { vehicles: 2, notifications: 2 },
    });
    // No personal data in the audit row.
    expect(JSON.stringify(audit)).not.toMatch(/Ada|Okafor|LND123AB|8031234567|ada@/);

    // Running it again does nothing.
    expect(await t.erase()).toEqual({ processed: 0, remaining: 0 });
    expect(t.w.authAdmin.deleted).toHaveLength(1);
  });

  it('gives the same plate the same stand-in, and different people different ones', async () => {
    const t = await setup();
    const a = await t.book();
    finish(t, a.id);
    const b = await t.book();
    finish(t, b.id);
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    t.w.deps.now = () => new Date(TEST_NOW.getTime() + 31 * DAY);
    await t.erase();
    const plates = t.w.store.booking.bookingRows.map((r) => r.plateNorm);
    expect(plates).toHaveLength(2);
    expect(plates[0]).toBe(plates[1]);
  });

  it('waits while a booking is still running, and retries when Supabase Auth was down', async () => {
    const t = await setup();
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    // A booking made after the request: the account can't close until it is over.
    const booking = await t.book();
    t.w.deps.now = () => new Date(TEST_NOW.getTime() - 1000 + 31 * DAY);
    const running = t.w.store.booking.bookingRows.find((r) => r.id === booking.id);
    if (running) running.endAt = new Date(TEST_NOW.getTime() + 40 * DAY);
    expect(await t.erase()).toEqual({ processed: 0, remaining: 1 });
    expect(t.w.store.userRows.get(t.driver)?.status).toBe('PENDING_DELETION');

    finish(t, booking.id);
    t.w.authAdmin.failNext = true;
    expect(await t.erase()).toEqual({ processed: 0, remaining: 1 });
    // Auth failed first, so nothing in our database was touched yet.
    expect(t.w.store.userRows.get(t.driver)?.firstName).toBe('Ada');
    expect(await t.erase()).toEqual({ processed: 1, remaining: 0 });
    expect(t.w.store.userRows.get(t.driver)?.status).toBe('DELETED');
  });
});

describe('the retention job (doc 06 section 4)', () => {
  const run = (t: Awaited<ReturnType<typeof setup>>) =>
    retentionPurgeJob({
      store: t.w.store,
      storage: t.w.storage,
      logger: createLogger({ level: 'silent' }),
      now: () => t.w.deps.now(),
    })({ payload: {}, deadline: DEADLINE });

  it('removes expired export files, old finished notifications and expired idempotency keys, and keeps the rest', async () => {
    const t = await setup();
    const res = await t.w.call('POST', '/v1/me/data-export', { as: t.driver });
    const id = res.body?.requestId as string;
    const path = `${t.driver}/${id}.json`;
    await t.w.store.notifications.enqueue({
      userId: t.driver,
      bookingId: null,
      eventKey: 'booking.confirmed',
      dedupeKey: 'old-sent',
      payload: {},
      notBefore: TEST_NOW,
    });
    const sent = t.w.store.outbox.rows.find((r) => r.dedupeKey === 'old-sent');
    if (sent) Object.assign(sent, { status: 'SENT', sentAt: TEST_NOW });
    await t.w.store.notifications.enqueue({
      userId: t.driver,
      bookingId: null,
      eventKey: 'booking.confirmed',
      dedupeKey: 'old-pending',
      payload: {},
      notBefore: TEST_NOW,
    });
    t.w.store.booking.idempotencyRows.set('a:old', {
      method: 'POST',
      path: '/x',
      requestHash: 'h',
      status: 'COMPLETED',
      responseStatus: 200,
      body: {},
      expiresAt: new Date(TEST_NOW.getTime() + DAY),
    });

    // Today: nothing is old enough.
    expect(await run(t)).toEqual({ processed: 0, remaining: 0 });
    expect(t.w.storage.objects.has(`exports/${path}`)).toBe(true);

    // 91 days on.
    t.w.deps.now = () => new Date(TEST_NOW.getTime() + 91 * DAY);
    const result = await run(t);
    expect(result).toEqual({ processed: 3, remaining: 0 });
    expect(t.w.storage.objects.has(`exports/${path}`)).toBe(false);
    expect(t.w.store.dsrRows.find((r) => r.id === id)?.exportStoragePath).toBeNull();
    expect(t.w.store.outbox.rows.map((r) => r.dedupeKey)).toEqual(['old-pending']);
    expect(t.w.store.booking.idempotencyRows.size).toBe(0);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'retention.run',
      actorRole: 'SYSTEM',
      after: { idempotencyKeys: 1, notifications: 1, exportFiles: 1 },
    });
    // The download link now says it is gone.
    expect((await t.w.call('GET', `/v1/me/data-export/${id}`, { as: t.driver })).status).toBe(404);
  });
});

describe('the compliance queue (NFR-PRIV-001)', () => {
  it('lists requests with first name only, who is deleted, and what is overdue', async () => {
    const t = await setup();
    await t.w.call('POST', '/v1/me/data-export', { as: t.driver });
    await t.w.call('DELETE', '/v1/me', { as: t.driver });
    const compliance = t.staff('ADMIN_COMPLIANCE');

    const res = await t.w.call('GET', '/v1/admin/data-requests', compliance);
    expect(res.status).toBe(200);
    const items = res.body?.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    const deletion = items.find((i) => i.type === 'DELETION');
    expect(deletion).toMatchObject({
      status: 'OPEN',
      userFirstName: 'Ada',
      userStatus: 'PENDING_DELETION',
      overdue: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Okafor|4567|ada@/);
    expect(items.find((i) => i.type === 'ACCESS')).toMatchObject({ status: 'COMPLETED' });

    const filtered = await t.w.call(
      'GET',
      '/v1/admin/data-requests?type=DELETION&status=OPEN',
      compliance,
    );
    expect((filtered.body?.items as unknown[]).length).toBe(1);

    // 31 days later an open deletion is past its date.
    t.w.deps.now = () => new Date(TEST_NOW.getTime() + 31 * DAY);
    const late = await t.w.call('GET', '/v1/admin/data-requests?status=OPEN', compliance);
    expect((late.body?.items as { overdue: boolean }[])[0]?.overdue).toBe(true);
  });

  it('is for compliance and super admins only', async () => {
    const t = await setup();
    expect((await t.w.call('GET', '/v1/admin/data-requests', t.staff('SUPER_ADMIN'))).status).toBe(
      200,
    );
    expect((await t.w.call('GET', '/v1/admin/data-requests', t.staff('ADMIN_OPS'))).status).toBe(
      403,
    );
    expect((await t.w.call('GET', '/v1/admin/data-requests', { as: t.driver })).status).toBe(403);
  });
});
