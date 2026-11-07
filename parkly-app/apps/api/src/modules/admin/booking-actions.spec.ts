import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addLiveLot, world } from '../../test-helpers.js';

// TEST_NOW is Monday 2026-10-19 09:00 Lagos; the booking is 10:00–12:00 Lagos (₦1,000 + fee).
const START = '2026-10-19T09:00:00.000Z';
const END = '2026-10-19T11:00:00.000Z';

async function setup() {
  const w = world();
  const { lot } = await addLiveLot(w.store);
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
  w.payments.pay(reference);
  await w.call('POST', `/v1/payments/${reference}/verify`, { as: driver });
  const booking = created.body?.booking as { id: string; totalKobo: number };
  const staff = (role: 'ADMIN_SUPPORT' | 'ADMIN_FINANCE' | 'ADMIN_OPS') => ({
    as: w.user([{ role, operatorId: null }], role),
    aal: 'aal2' as const,
  });
  const post = (
    path: string,
    as: { as: string; aal: 'aal2' },
    body: unknown,
    key: string | null = randomUUID(),
  ) =>
    w.call('POST', path, {
      ...as,
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
      body,
    });
  const notices = (key: string) =>
    w.store.outbox.rows.filter((r) => r.bookingId === booking.id && r.eventKey === key);
  return { w, driver, booking, reference, staff, post, notices };
}

describe('staff cancel (FR-ADM-003)', () => {
  it('cancels under the driver’s policy, refunds, notifies and audits; a retry changes nothing', async () => {
    const t = await setup();
    const support = t.staff('ADMIN_SUPPORT');
    const key = randomUUID();
    const path = `/v1/admin/bookings/${t.booking.id}/cancel`;
    const res = await t.post(path, support, { reason: 'Driver called: plans changed' }, key);
    expect(res.status).toBe(200);
    // An hour before the start, inside the free window: the whole amount back.
    expect(res.body).toEqual({ status: 'CANCELLED', refundKobo: t.booking.totalKobo });
    expect(t.w.payments.refunds).toEqual([
      { reference: t.reference, amountKobo: t.booking.totalKobo },
    ]);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'booking.cancelled_by_staff',
      entityId: t.booking.id,
      after: { status: 'CANCELLED', reason: 'Driver called: plans changed' },
    });
    expect(t.notices('booking.cancelled')).toHaveLength(1);

    const again = await t.post(path, support, { reason: 'Driver called: plans changed' }, key);
    expect(again.body).toEqual(res.body);
    expect(t.w.payments.refunds).toHaveLength(1);
  });

  it('needs an Idempotency-Key and a reason, and refuses a booking already cancelled', async () => {
    const t = await setup();
    const support = t.staff('ADMIN_SUPPORT');
    const path = `/v1/admin/bookings/${t.booking.id}/cancel`;
    expect((await t.post(path, support, { reason: 'no key here' }, null)).status).toBe(400);
    expect((await t.post(path, support, { reason: 'no' })).status).toBe(400);
    await t.post(path, support, { reason: 'Driver asked us to' });
    expect((await t.post(path, support, { reason: 'Second time' })).body?.code).toBe(
      'BOOKING_NOT_CANCELLABLE',
    );
  });
});

describe('staff refunds and maker-checker (FR-ADM-003)', () => {
  it('lets finance refund part of a booking now, up to what is left, and support up to their limit', async () => {
    const t = await setup();
    const finance = t.staff('ADMIN_FINANCE');
    const support = t.staff('ADMIN_SUPPORT');
    const ops = t.staff('ADMIN_OPS');
    const path = `/v1/admin/bookings/${t.booking.id}/refunds`;
    const body = { amountKobo: 20_000, reason: 'OPS_GOODWILL', note: 'Barrier stuck for 20 min' };

    // Ops cannot refund
    expect((await t.post(path, ops, body)).status).toBe(403);

    // Support can refund up to the support limit (default ₦10,000 = 1,000,000 kobo)
    const refundKey = randomUUID();
    const supRes = await t.post(path, support, body, refundKey);
    expect(supRes.body).toEqual({ outcome: 'ISSUED', amountKobo: 20_000 });
    const supResRetry = await t.post(path, support, body, refundKey);
    expect(supResRetry.body).toEqual(supRes.body);
    expect(t.w.payments.refunds).toHaveLength(1);
    expect(t.w.payments.refunds).toEqual([{ reference: t.reference, amountKobo: 20_000 }]);
    expect(t.w.store.booking.refundRows.at(-1)).toMatchObject({
      amountKobo: 20_000,
      reason: 'OPS_GOODWILL',
      note: 'Barrier stuck for 20 min',
    });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'refund.issued',
      after: {
        amountKobo: 20_000,
        reason: 'OPS_GOODWILL',
        note: 'Barrier stuck for 20 min',
        by: 'support',
      },
    });
    expect(t.notices('booking.refunded')).toHaveLength(1);

    // Support asking for more than the remaining support limit gets 403 REFUND_NEEDS_FINANCE
    t.w.store.settingRows.set('refund.support_limit_kobo', 25_000);
    const overLimit = await t.post(path, support, { ...body, amountKobo: 10_000 });
    expect(overLimit.status).toBe(403);
    expect(overLimit.body?.code).toBe('REFUND_NEEDS_FINANCE');

    // When support has exhausted their full allowance (supportLeft === 0)
    t.w.store.settingRows.set('refund.support_limit_kobo', 20_000);
    const exhausted = await t.post(path, support, { ...body, amountKobo: 1_000 });
    expect(exhausted.status).toBe(403);
    expect(exhausted.body?.code).toBe('REFUND_NEEDS_FINANCE');
    expect((exhausted.body as { detail?: string })?.detail).toContain(
      'Support has refunded as much as it can',
    );

    // Finance can refund past the support limit
    const res = await t.post(path, finance, { ...body, amountKobo: 30_000 });
    expect(res.body).toEqual({ outcome: 'ISSUED', amountKobo: 30_000 });
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'refund.issued',
      after: {
        amountKobo: 30_000,
        reason: 'OPS_GOODWILL',
        note: 'Barrier stuck for 20 min',
        by: 'finance',
      },
    });

    // The booking itself stays as it was.
    expect((await t.w.store.bookings.find(t.booking.id))?.status).toBe('CONFIRMED');

    const tooMuch = await t.post(path, finance, { ...body, amountKobo: t.booking.totalKobo });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body?.code).toBe('REFUND_EXCEEDS_REFUNDABLE');
  });

  it('holds a refund over the threshold for a different finance admin, who issues it once', async () => {
    const t = await setup();
    t.w.store.settingRows.set('refund.approval_threshold_kobo', 50_000);
    const maker = t.staff('ADMIN_FINANCE');
    const checker = t.staff('ADMIN_FINANCE');
    const res = await t.post(`/v1/admin/bookings/${t.booking.id}/refunds`, maker, {
      amountKobo: 60_000,
      reason: 'LOT_UNAVAILABLE',
      note: 'Car park flooded; driver turned away',
    });
    expect(res.body).toMatchObject({
      outcome: 'PENDING_APPROVAL',
      request: { status: 'PENDING_APPROVAL', amountKobo: 60_000, bookingId: t.booking.id },
    });
    expect(t.w.payments.refunds).toEqual([]);
    const id = (res.body?.request as { id: string }).id;

    // The pending amount is set aside: a second request can't take the same money.
    const greedy = await t.post(`/v1/admin/bookings/${t.booking.id}/refunds`, maker, {
      amountKobo: 60_000,
      reason: 'OTHER',
      note: 'Trying to take what was set aside',
    });
    expect(greedy.status).toBe(409);
    expect(greedy.body?.code).toBe('REFUND_EXCEEDS_REFUNDABLE');

    const detail = await t.w.call('GET', `/v1/admin/bookings/${t.booking.id}/support`, maker);
    expect(detail.body?.refundableKobo).toBe(t.booking.totalKobo - 60_000);

    const queue = await t.w.call(
      'GET',
      '/v1/admin/refund-requests?status=PENDING_APPROVAL',
      checker,
    );
    expect((queue.body?.items as { id: string }[]).map((r) => r.id)).toEqual([id]);

    const byBooking = await t.w.call(
      'GET',
      `/v1/admin/refund-requests?bookingId=${t.booking.id}`,
      checker,
    );
    expect((byBooking.body?.items as { id: string }[]).map((r) => r.id)).toEqual([id]);

    const unknownApprove = await t.post(
      `/v1/admin/refund-requests/${randomUUID()}/approve`,
      checker,
      {},
    );
    expect(unknownApprove.status).toBe(404);

    const own = await t.post(`/v1/admin/refund-requests/${id}/approve`, maker, {});
    expect(own.status).toBe(403);
    expect(own.body?.code).toBe('FOUR_EYES_REQUIRED');

    const ok = await t.post(`/v1/admin/refund-requests/${id}/approve`, checker, {
      note: 'Checked',
    });
    expect(ok.body).toMatchObject({ id, status: 'APPROVED', decisionNote: 'Checked' });
    expect(t.w.payments.refunds).toEqual([{ reference: t.reference, amountKobo: 60_000 }]);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'refund.approved',
      after: { requestId: id, amountKobo: 60_000 },
    });

    const twice = await t.post(
      `/v1/admin/refund-requests/${id}/approve`,
      t.staff('ADMIN_FINANCE'),
      {},
    );
    expect(twice.status).toBe(409);
    expect(t.w.payments.refunds).toHaveLength(1);
  });

  it('lets another finance admin reject a request with a reason; nothing is refunded', async () => {
    const t = await setup();
    t.w.store.settingRows.set('refund.approval_threshold_kobo', 50_000);
    const maker = t.staff('ADMIN_FINANCE');
    const res = await t.post(`/v1/admin/bookings/${t.booking.id}/refunds`, maker, {
      amountKobo: 60_000,
      reason: 'OTHER',
      note: 'Driver says the app double charged',
    });
    const id = (res.body?.request as { id: string }).id;
    const checker = t.staff('ADMIN_FINANCE');
    const reject = (note: string) =>
      t.w.call('POST', `/v1/admin/refund-requests/${id}/reject`, { ...checker, body: { note } });
    expect((await reject('no')).status).toBe(400);
    const done = await reject('Only one charge on Paystack');
    expect(done.body).toMatchObject({
      status: 'REJECTED',
      decisionNote: 'Only one charge on Paystack',
    });
    expect(t.w.payments.refunds).toEqual([]);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({ action: 'refund.rejected' });

    // Approving a request that is already REJECTED fails
    const approveRejected = await t.post(`/v1/admin/refund-requests/${id}/approve`, checker, {});
    expect(approveRejected.status).toBe(409);
    expect(approveRejected.body?.code).toBe('INVALID_STATE_TRANSITION');

    // Maker cannot reject their own request
    const makerReject = await t.w.call('POST', `/v1/admin/refund-requests/${id}/reject`, {
      ...maker,
      body: { note: 'Self rejection not allowed' },
    });
    expect(makerReject.status).toBe(403);
    expect(makerReject.body?.code).toBe('FOUR_EYES_REQUIRED');

    // Unknown request ID returns 404
    const unknownReject = await t.w.call(
      'POST',
      `/v1/admin/refund-requests/${randomUUID()}/reject`,
      { ...checker, body: { note: 'Not found test' } },
    );
    expect(unknownReject.status).toBe(404);

    // Rejecting an already decided request fails
    const alreadyDecided = await reject('Another rejection');
    expect(alreadyDecided.status).toBe(409);
  });

  it('marks request failed when approved request exceeds refundable amount', async () => {
    const t = await setup();
    t.w.store.settingRows.set('refund.approval_threshold_kobo', 50_000);
    const maker = t.staff('ADMIN_FINANCE');
    const checker = t.staff('ADMIN_FINANCE');
    const res = await t.post(`/v1/admin/bookings/${t.booking.id}/refunds`, maker, {
      amountKobo: 60_000,
      reason: 'OPS_GOODWILL',
      note: 'Needs approval',
    });
    const id = (res.body?.request as { id: string }).id;

    // Simulate another refund issued in the background exhausting the balance
    await t.w.store.payments.refundBooking(
      t.booking.id,
      {
        amountKobo: 80_000,
        refundPriceKobo: 70_000,
        refundServiceFeeKobo: 10_000,
        reason: 'OPS_GOODWILL',
        note: 'Direct refund',
        approvedBy: null,
      },
      'system',
      new Date(),
    );

    // Approval now exceeds available refundable amount
    const approveRes = await t.post(`/v1/admin/refund-requests/${id}/approve`, checker, {});
    expect(approveRes.status).toBe(409);
    expect(approveRes.body?.code).toBe('REFUND_EXCEEDS_REFUNDABLE');
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'refund.approval_failed',
      entityId: t.booking.id,
    });
    const failedReq = await t.w.store.refundRequests.find(id);
    expect(failedReq?.status).toBe('FAILED');
  });
});

describe('resending the ticket (FR-ADM-003)', () => {
  it('queues the confirmation again, once a minute, and audits it', async () => {
    const t = await setup();
    const support = t.staff('ADMIN_SUPPORT');
    const path = `/v1/admin/bookings/${t.booking.id}/resend-ticket`;
    const before = t.notices('booking.confirmed').length;
    expect((await t.w.call('POST', path, support)).status).toBe(204);
    expect((await t.w.call('POST', path, support)).status).toBe(204);
    expect(t.notices('booking.confirmed')).toHaveLength(before + 1);
    expect(t.w.store.auditRows.at(-1)).toMatchObject({
      action: 'booking.ticket_resent',
      entityId: t.booking.id,
    });

    await t.post(`/v1/admin/bookings/${t.booking.id}/cancel`, support, { reason: 'Driver asked' });
    expect((await t.w.call('POST', path, support)).status).toBe(409);

    // Ticket can also be resent when CHECKED_IN
    const b = t.w.store.booking.bookingRows.find((r) => r.id === t.booking.id);
    if (b) b.status = 'CHECKED_IN';
    expect((await t.w.call('POST', path, support)).status).toBe(204);
  });
});
