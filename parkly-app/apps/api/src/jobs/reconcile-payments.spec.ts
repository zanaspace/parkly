import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '@parkly/domain/booking';
import { createLogger } from '../lib/logger.js';
import { FakePaymentProvider } from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import type { BookingRow, PaymentRow, SettleResult } from '../store/types.js';
import { reconcilePaymentsJob } from './reconcile-payments.js';

function setup(nowStr = '2026-11-06T06:00:00.000Z') {
  const store = new MemoryStore();
  const payments = new FakePaymentProvider();
  const logger = createLogger({ level: 'silent' });
  const now = () => new Date(nowStr);
  const job = reconcilePaymentsJob({ store, payments, logger, now });
  return { store, payments, logger, now, job };
}

function addPayment(
  store: MemoryStore,
  payment: Partial<PaymentRow> & {
    id: string;
    amountKobo: number;
    status: PaymentStatus;
    paidAt: Date | null;
  },
) {
  const createdAt = payment.paidAt ?? new Date('2026-11-05T12:00:00.000Z');
  const row = {
    id: payment.id,
    bookingId: payment.bookingId ?? null,
    kind: payment.kind ?? ('BOOKING' as const),
    payerUserId: payment.payerUserId ?? randomUUID(),
    provider: payment.provider ?? ('FAKE' as const),
    status: payment.status,
    amountKobo: payment.amountKobo,
    platformAmountKobo: payment.platformAmountKobo ?? Math.round(payment.amountKobo * 0.1),
    operatorAmountKobo: payment.operatorAmountKobo ?? Math.round(payment.amountKobo * 0.9),
    operatorId: payment.operatorId ?? randomUUID(),
    subaccountCode: null,
    authorizationUrl: null,
    paidAt: payment.paidAt,
    failureCode: null,
    feesKobo: null,
    channel: null,
    cardLast4: null,
    cardBrand: null,
    accessCode: null,
    createdAt,
  };
  store.booking.paymentRows.push(row);
  return row;
}

describe('daily payments reconciliation job (reconcile-payments)', () => {
  it('runs successfully with empty records', async () => {
    const { job, store } = setup();
    const res = await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });
    expect(res).toEqual({ processed: 0, remaining: 0 });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run).toMatchObject({
      businessDate: '2026-11-05',
      provider: 'FAKE',
      status: 'COMPLETED',
      totalInternal: 0,
      totalProvider: 0,
      matchedCount: 0,
      mismatchedCount: 0,
    });
  });

  it('accepts explicit businessDate in payload', async () => {
    const { job, store } = setup();
    const res = await job({
      deadline: new Date('2100-01-01T00:00:00Z'),
      payload: { businessDate: '2026-11-01' },
    });
    expect(res).toEqual({ processed: 0, remaining: 0 });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-01');
    expect(run?.businessDate).toBe('2026-11-01');
  });

  it('rejects invalid businessDate format', async () => {
    const { job } = setup();
    await expect(
      job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: { businessDate: 'invalid' } }),
    ).rejects.toThrow(/Invalid businessDate format/);
  });

  it('matches transactions that agree on amount and success status', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const paidAt = new Date('2026-11-05T12:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'SUCCEEDED',
      amountKobo: 50_000,
      paidAt,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 50_000,
      currency: 'NGN',
      status: 'success',
      paidAt,
      feesKobo: 750,
      channel: 'card',
    });

    const res = await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });
    expect(res.processed).toBe(1);

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run).toBeDefined();
    expect(run?.status).toBe('COMPLETED');
    expect(run?.totalInternal).toBe(1);
    expect(run?.totalProvider).toBe(1);
    expect(run?.matchedCount).toBe(1);
    expect(run?.mismatchedCount).toBe(0);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]?.result).toBe('MATCHED');
  });

  it('flags MISSING_INTERNAL when provider has transaction unknown internally', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const paidAt = new Date('2026-11-05T14:30:00.000Z');

    payments.transactions.push({
      reference: ref,
      amountKobo: 120_000,
      currency: 'NGN',
      status: 'success',
      paidAt,
      feesKobo: 1_800,
      channel: 'card',
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(run?.mismatchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('MISSING_INTERNAL');
    expect(items[0]?.providerReference).toBe(ref);
  });

  it('flags MISSING_PROVIDER when internal SUCCEEDED payment is absent in provider records', async () => {
    const { job, store } = setup();
    const ref = randomUUID();
    const paidAt = new Date('2026-11-05T10:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'SUCCEEDED',
      amountKobo: 80_000,
      paidAt,
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(run?.mismatchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('MISSING_PROVIDER');
  });

  it('flags AMOUNT_MISMATCH when amounts differ between provider and internal', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const paidAt = new Date('2026-11-05T09:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'SUCCEEDED',
      amountKobo: 100_000,
      paidAt,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 90_000, // Provider received 90k instead of 100k
      currency: 'NGN',
      status: 'success',
      paidAt,
      feesKobo: 1_350,
      channel: 'card',
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(run?.mismatchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('AMOUNT_MISMATCH');
  });

  it('auto-settles PENDING payment that succeeded on provider (AUTO_FIXED)', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const bookingId = randomUUID();
    const lotId = randomUUID();
    const startAt = new Date('2026-11-05T16:00:00.000Z');
    const endAt = new Date('2026-11-05T18:00:00.000Z');
    const createdAt = new Date('2026-11-05T16:00:00.000Z');

    for (let t = startAt.getTime(); t < endAt.getTime(); t += 15 * 60 * 1000) {
      store.slotRows.push({
        lotId,
        slotStart: new Date(t),
        capacity: 10,
        booked: 0,
        held: 1,
        passReserved: 0,
        blocked: 0,
      });
    }

    store.booking.bookingRows.push({
      id: bookingId,
      code: 'PK-TEST01',
      driverId: randomUUID(),
      vehicleId: randomUUID(),
      plateNorm: 'ABC123XY',
      lotId,
      product: 'HOURLY',
      startAt,
      endAt,
      status: 'PENDING_PAYMENT',
      holdExpiresAt: new Date('2026-11-05T16:30:00.000Z'),
      priceKobo: 54_000,
      serviceFeeKobo: 6_000,
      totalKobo: 60_000,
      commissionBps: 1000,
      ratePlanId: randomUUID(),
      pricingBreakdown: null,
      source: 'WEB',
      createdAt,
    });

    addPayment(store, {
      id: ref,
      bookingId,
      status: 'PENDING',
      amountKobo: 60_000,
      paidAt: null,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 60_000,
      currency: 'NGN',
      status: 'success',
      paidAt: createdAt,
      feesKobo: 900,
      channel: 'card',
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED');
    expect(run?.mismatchedCount).toBe(0);
    expect(run?.matchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('AUTO_FIXED');

    const updatedPayment = await store.payments.find(ref);
    expect(updatedPayment?.status).toBe('SUCCEEDED');
  });

  it('flags STATUS_MISMATCH when provider failed/reversed but internal payment was marked SUCCEEDED', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const paidAt = new Date('2026-11-05T11:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'SUCCEEDED',
      amountKobo: 40_000,
      paidAt,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 40_000,
      currency: 'NGN',
      status: 'reversed',
      paidAt,
      feesKobo: null,
      channel: 'card',
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(run?.mismatchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('STATUS_MISMATCH');
  });

  it('updates existing run when re-run for same provider and business date', async () => {
    const { job, store } = setup();
    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });
    const run1 = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run1).toBeTruthy();

    // Re-run
    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });
    const run2 = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run2?.id).toBe(run1?.id);
  });

  it('supports paystack provider name and handles non-Error exception', async () => {
    const { store } = setup();
    const payments = new FakePaymentProvider();
    Object.defineProperty(payments, 'name', { value: 'paystack' });
    const logger = createLogger({ level: 'silent' });
    const job = reconcilePaymentsJob({
      store,
      payments,
      logger,
      now: () => new Date('2026-11-06T06:00:00.000Z'),
    });

    payments.listTransactions = async () => {
      // Non-Error exception thrown
      throw 'string error thrown directly';
    };

    await expect(job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} })).rejects.toBe(
      'string error thrown directly',
    );

    const run = await store.reconciliation.findRun('PAYSTACK', '2026-11-05');
    expect(run?.status).toBe('FAILED');
    expect(run?.error).toBe('string error thrown directly');
  });

  it('handles settle error during auto-fix gracefully', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();

    addPayment(store, {
      id: ref,
      status: 'PENDING',
      amountKobo: 50_000,
      paidAt: null,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 50_000,
      currency: 'NGN',
      status: 'success',
      paidAt: null, // Test fallback to deps.now()
      feesKobo: 750,
      channel: 'card',
    });

    store.payments.settle = async () => {
      throw new Error('Settle DB failure');
    };

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(run?.mismatchedCount).toBe(1);

    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('STATUS_MISMATCH');
  });

  it('does not auto-fix if settle decision is not CONFIRM or internal is ABANDONED', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const createdAt = new Date('2026-11-05T16:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'ABANDONED',
      amountKobo: 50_000,
      paidAt: null,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 50_000,
      currency: 'NGN',
      status: 'success',
      paidAt: createdAt,
      feesKobo: 750,
      channel: 'card',
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
  });

  it('does not auto-fix if internal is PENDING but settle decision is EXPIRED', async () => {
    const { job, store, payments } = setup();
    const ref = randomUUID();
    const createdAt = new Date('2026-11-05T16:00:00.000Z');

    addPayment(store, {
      id: ref,
      status: 'PENDING',
      amountKobo: 50_000,
      paidAt: null,
    });

    payments.transactions.push({
      reference: ref,
      amountKobo: 50_000,
      currency: 'NGN',
      status: 'success',
      paidAt: createdAt,
      feesKobo: 750,
      channel: 'card',
    });

    store.payments.settle = async (): Promise<SettleResult> => ({
      decision: 'REFUND_HOLD_EXPIRED',
      booking: {} as BookingRow,
      payment: {} as PaymentRow,
      refund: null,
    });

    await job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: { businessDate: 123 } });

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items[0]?.result).toBe('STATUS_MISMATCH');
  });

  it('marks run as FAILED when provider call throws non-Error value', async () => {
    const { job, store, payments } = setup();
    payments.listTransactions = async () => {
      throw 'string error message';
    };

    await expect(job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} })).rejects.toBe(
      'string error message',
    );

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('FAILED');
    expect(run?.error).toBe('string error message');
  });

  it('marks run as FAILED when provider call throws', async () => {
    const { job, store, payments } = setup();
    payments.listTransactions = async () => {
      throw new Error('Provider API network timeout');
    };

    await expect(job({ deadline: new Date('2100-01-01T00:00:00Z'), payload: {} })).rejects.toThrow(
      'Provider API network timeout',
    );

    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run?.status).toBe('FAILED');
    expect(run?.error).toContain('Provider API network timeout');
  });
});
