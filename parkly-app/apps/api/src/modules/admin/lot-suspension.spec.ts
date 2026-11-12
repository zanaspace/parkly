import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addLiveLot, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos; the booking is 10:00–12:00 Lagos.
const START = '2026-10-19T09:00:00.000Z';
const END = '2026-10-19T11:00:00.000Z';

type Role = 'ADMIN_SUPPORT' | 'ADMIN_OPS' | 'ADMIN_FINANCE' | 'ADMIN_COMPLIANCE';

async function setup() {
  const w = world();
  const { lot } = await addLiveLot(w.store);
  // A new driver each time: one car can't hold two overlapping bookings.
  const book = async (pay: boolean) => {
    const driver = w.user([{ role: 'DRIVER', operatorId: null }], 'Ada');
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
    if (pay) {
      w.payments.pay(reference);
      await w.call('POST', `/v1/payments/${reference}/verify`, { as: driver });
    }
    const booking = created.body?.booking as { id: string; code: string; totalKobo: number };
    return { ...booking, reference };
  };
  const staff = (role: Role) => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const suspend = () =>
    w.store.lots.setStatus(lot.operatorId, lot.id, 'LIVE', 'SUSPENDED', 'Permit problem');
  const impact = (who = staff('ADMIN_OPS')) =>
    w.call('GET', `/v1/admin/lots/${lot.id}/suspension-impact`, who);
  const cancelAll = (
    body: unknown = { reason: 'Barrier broken for a week' },
    who = staff('ADMIN_OPS'),
  ) => w.call('POST', `/v1/admin/lots/${lot.id}/cancel-upcoming-bookings`, { ...who, body });
  return { w, lot, book, staff, suspend, impact, cancelAll };
}

describe('lot suspension impact (doc 03 §4.3)', () => {
  it('counts paid bookings to cancel, unpaid holds and the refund total, with first names only', async () => {
    const t = await setup();
    const paid = await t.book(true);
    await t.book(false);
    const res = await t.impact();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      lotId: t.lot.id,
      lotName: 'Eko Hotel Car Park',
      activeCount: 0,
      holdCount: 1,
      totalRefundKobo: paid.totalKobo,
      upcoming: [
        { id: paid.id, code: paid.code, totalKobo: paid.totalKobo, driverFirstName: 'Ada' },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain('LND123AB');
  });

  it('is for ops, compliance and super admin, and 404s an unknown car park', async () => {
    const t = await setup();
    expect((await t.impact(t.staff('ADMIN_COMPLIANCE'))).status).toBe(200);
    expect((await t.impact(t.staff('ADMIN_SUPPORT'))).status).toBe(403);
    const missing = await t.w.call(
      'GET',
      `/v1/admin/lots/${randomUUID()}/suspension-impact`,
      t.staff('ADMIN_OPS'),
    );
    expect(missing.status).toBe(404);
  });
});

describe('cancelling upcoming bookings after a suspension', () => {
  it('cancels each paid booking in full, tells the driver and audits it; a second run does nothing', async () => {
    const t = await setup();
    const a = await t.book(true);
    const b = await t.book(true);
    await t.book(false); // an unpaid hold is left to lapse
    await t.suspend();

    const res = await t.cancelAll();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cancelled: 2, failed: [], refundedKobo: a.totalKobo + b.totalKobo });
    expect(t.w.payments.refunds).toHaveLength(2);
    expect(t.w.payments.refunds).toEqual(
      expect.arrayContaining([
        { reference: a.reference, amountKobo: a.totalKobo },
        { reference: b.reference, amountKobo: b.totalKobo },
      ]),
    );
    for (const bk of [a, b]) {
      expect((await t.w.store.bookings.find(bk.id))?.status).toBe('CANCELLED');
      expect(
        t.w.store.outbox.rows.filter(
          (r) => r.bookingId === bk.id && r.eventKey === 'booking.lot_unavailable',
        ),
      ).toHaveLength(1);
    }
    expect(
      t.w.store.auditRows.filter((r) => r.action === 'booking.cancelled_lot_suspended'),
    ).toHaveLength(2);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'lot.upcoming_bookings_cancelled',
      entityId: t.lot.id,
      after: { cancelled: 2, failed: 0, refundedKobo: a.totalKobo + b.totalKobo },
    });

    const again = await t.cancelAll();
    expect(again.body).toEqual({ cancelled: 0, failed: [], refundedKobo: 0 });
    expect(t.w.payments.refunds).toHaveLength(2);
    expect((await t.impact()).body).toMatchObject({
      upcoming: [],
      totalRefundKobo: 0,
      holdCount: 1,
    });
  });

  it('refunds in full even right before the start, where a driver would get nothing', async () => {
    const t = await setup();
    const a = await t.book(true);
    await t.suspend();
    // 10 minutes before the start: inside the no-refund window for a driver's own cancel.
    t.w.deps.now = () => new Date('2026-10-19T08:50:00Z');
    const res = await t.cancelAll();
    expect(res.body).toMatchObject({ cancelled: 1, refundedKobo: a.totalKobo });
  });

  it('only after the car park is suspended, with a reason, for the right roles', async () => {
    const t = await setup();
    await t.book(true);
    const live = await t.cancelAll();
    expect(live.status).toBe(409);
    expect(live.body?.code).toBe('INVALID_STATE_TRANSITION');

    await t.suspend();
    expect((await t.cancelAll({ reason: 'no' })).status).toBe(400);
    expect((await t.cancelAll(undefined, t.staff('ADMIN_SUPPORT'))).status).toBe(403);
    expect((await t.cancelAll(undefined, t.staff('ADMIN_COMPLIANCE'))).status).toBe(403);
    const missing = await t.w.call(
      'POST',
      `/v1/admin/lots/${randomUUID()}/cancel-upcoming-bookings`,
      { ...t.staff('ADMIN_OPS'), body: { reason: 'Barrier broken' } },
    );
    expect(missing.status).toBe(404);
    expect(t.w.payments.refunds).toHaveLength(0);
    expect((await t.cancelAll(undefined, t.staff('ADMIN_FINANCE'))).status).toBe(200);
  });
});
