import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '@parkly/domain/booking';
import { createLogger } from '../lib/logger.js';
import { FakeEmailProvider, FakePaymentProvider } from '../providers/fakes.js';
import { MemoryStore } from '../store/memory.js';
import { testDeps } from '../test-helpers.js';
import type { BookingRow, PaymentRow, SettleResult } from '../store/types.js';
import { reconcilePaymentsJob } from './reconcile-payments.js';

function setup(nowStr = '2026-11-06T06:00:00.000Z') {
  const store = new MemoryStore();
  const payments = new FakePaymentProvider();
  const logger = createLogger({ level: 'silent' });
  const now = () => new Date(nowStr);
  const notifications = testDeps({ store }).notifications;
  const job = reconcilePaymentsJob({ store, payments, logger, now, notifications });
  return { store, payments, logger, now, job };
}

function addPayment(
  store: MemoryStore,
  payment: Partial<PaymentRow> & {
    id: string;
    amountKobo: number;
    status: PaymentStatus;
    paidAt: Date | null;
    /** Leave out the ledger journal (review item 7 tests). */
    noLedger?: boolean;
    /** Post the journal with another amount (review item 7 tests). */
    ledgerAmountKobo?: number;
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
  // A settled payment has its journal (review item 7), as the real settle path posts.
  if (['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(row.status) && !payment.noLedger)
    store.booking.ledgerRows.push({
      account: `PROVIDER_CLEARING:${row.provider}`,
      direction: 'DEBIT',
      amountKobo: (payment.ledgerAmountKobo ?? row.amountKobo) as never,
      journalId: randomUUID(),
      paymentId: row.id,
    });
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
    // The fix goes through verifyAndSettle, which asks Paystack again (review fix 4).
    await payments.initialize({
      reference: ref,
      amountKobo: 60_000,
      email: 'driver@example.com',
      subaccountCode: null,
      platformShareKobo: 6_000,
      callbackUrl: null,
      metadata: {},
    });
    payments.pay(ref);

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
      notifications: testDeps({ store }).notifications,
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

describe('review fixes (2026-11-06)', () => {
  const RUN = { deadline: new Date('2100-01-01T00:00:00Z'), payload: {} };
  const paidOn = new Date('2026-11-05T12:00:00.000Z');
  const tx = (reference: string, amountKobo = 10_000) => ({
    reference,
    amountKobo,
    currency: 'NGN',
    status: 'success',
    paidAt: paidOn,
    feesKobo: 150,
    channel: 'card',
  });

  it('fix 1: reads every page of Paystack transactions, not just the first 50', async () => {
    const { job, store, payments } = setup();
    for (let i = 0; i < 120; i++) {
      const id = randomUUID();
      addPayment(store, { id, amountKobo: 10_000, status: 'SUCCEEDED', paidAt: paidOn });
      payments.transactions.push(tx(id));
    }
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run).toMatchObject({ status: 'COMPLETED', matchedCount: 120, mismatchedCount: 0 });
  });

  it('fix 2: re-running a day does not pile up its exceptions', async () => {
    const { job, store, payments } = setup();
    payments.transactions.push(tx('unknown-ref-1'), tx('unknown-ref-2'));
    await job(RUN);
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 50 });
    expect(items.map((i) => i.providerReference).sort()).toEqual([
      'unknown-ref-1',
      'unknown-ref-2',
    ]);
  });

  it('fix 3: a payment we hold under the day before is matched, not missing', async () => {
    const { job, store, payments } = setup();
    const id = randomUUID();
    // Created 23:55 Lagos the day before; Paystack lists it on the business day.
    addPayment(store, {
      id,
      amountKobo: 10_000,
      status: 'SUCCEEDED',
      paidAt: null,
      createdAt: new Date('2026-11-04T22:55:00.000Z'),
    });
    const row = store.booking.paymentRows.find((p) => p.id === id);
    if (row)
      Object.assign(row, { createdAt: new Date('2026-11-04T22:55:00.000Z'), paidAt: paidOn });
    payments.transactions.push(tx(id));
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run).toMatchObject({ matchedCount: 1, mismatchedCount: 0 });
  });

  it('fix 3: a settled payment Paystack lists under another day is verified, not missing', async () => {
    const { job, store, payments } = setup();
    const id = randomUUID();
    addPayment(store, { id, amountKobo: 10_000, status: 'SUCCEEDED', paidAt: paidOn });
    await payments.initialize({
      reference: id,
      amountKobo: 10_000,
      email: 'driver@example.com',
      subaccountCode: null,
      platformShareKobo: 1_000,
      callbackUrl: null,
      metadata: {},
    });
    payments.pay(id);
    // Paystack's day list holds something else, so ours is found only by verify.
    const other = randomUUID();
    addPayment(store, { id: other, amountKobo: 10_000, status: 'SUCCEEDED', paidAt: paidOn });
    payments.transactions.push(tx(other));
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    expect(run).toMatchObject({ matchedCount: 2, mismatchedCount: 0 });
  });

  it('fix 3: when verify fails too, the payment is reported missing at the provider', async () => {
    const { job, store, payments } = setup();
    const id = randomUUID();
    addPayment(store, { id, amountKobo: 10_000, status: 'SUCCEEDED', paidAt: paidOn });
    payments.transactions.push(tx('someone-else'));
    payments.verify = async () => {
      throw new Error('provider down');
    };
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 10 });
    expect(items.find((i) => i.providerReference === id)?.result).toBe('MISSING_PROVIDER');
  });

  it('fix 1: stops with a failed run rather than paging forever', async () => {
    const { job, store, payments } = setup();
    payments.listTransactions = async () => ({ items: [tx(randomUUID())], total: 1e9 });
    await expect(job(RUN)).rejects.toThrow('provider transactions in one day');
    expect(await store.reconciliation.findRun('FAKE', '2026-11-05')).toMatchObject({
      status: 'FAILED',
    });
  });
});

describe('ledger, settlements and the alert (review items 7 and 8)', () => {
  const RUN = { deadline: new Date('2100-01-01T00:00:00Z'), payload: {} };
  const paidOn = new Date('2026-11-05T12:00:00.000Z');
  const tx = (reference: string, amountKobo = 10_000) => ({
    reference,
    amountKobo,
    currency: 'NGN',
    status: 'success',
    paidAt: paidOn,
    feesKobo: 150,
    channel: 'card',
  });

  it('flags a settled payment with no journal, or one for the wrong amount', async () => {
    const { job, store, payments } = setup();
    const none = randomUUID();
    const wrong = randomUUID();
    addPayment(store, {
      id: none,
      amountKobo: 10_000,
      status: 'SUCCEEDED',
      paidAt: paidOn,
      noLedger: true,
    });
    addPayment(store, {
      id: wrong,
      amountKobo: 10_000,
      status: 'SUCCEEDED',
      paidAt: paidOn,
      ledgerAmountKobo: 9_000,
    });
    payments.transactions.push(tx(none), tx(wrong));
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 50 });
    const byRef = new Map(
      items
        .filter((i) => i.result.startsWith('LEDGER'))
        .map((i) => [i.providerReference, i.result]),
    );
    expect(byRef.get(none)).toBe('LEDGER_MISSING');
    expect(byRef.get(wrong)).toBe('LEDGER_MISMATCH');
    expect(run).toMatchObject({ status: 'COMPLETED_WITH_EXCEPTIONS', mismatchedCount: 2 });
  });

  it('lists provider payouts still held for review', async () => {
    const { job, store } = setup();
    await store.settlements.record(
      {
        provider: 'PAYSTACK',
        providerSettlementId: '3090026',
        operatorId: null,
        subaccountCode: null,
        status: 'NEEDS_REVIEW',
        amountKobo: 70_000,
        grossKobo: 70_000,
        feesKobo: 0,
        settledAt: paidOn,
        raw: {},
        reviewReason: 'Unknown settlement status: on_hold',
      },
      paidOn,
    );
    await job(RUN);
    const run = await store.reconciliation.findRun('FAKE', '2026-11-05');
    const items = await store.reconciliation.listItems({ runId: run?.id ?? '', limit: 50 });
    expect(items).toEqual([
      expect.objectContaining({
        result: 'SETTLEMENT_REVIEW',
        providerReference: 'settlement:3090026',
        details: expect.objectContaining({ reason: 'Unknown settlement status: on_hold' }),
      }),
    ]);
  });

  it('emails finance a summary when there are exceptions, and only then', async () => {
    const store = new MemoryStore();
    const payments = new FakePaymentProvider();
    const email = new FakeEmailProvider();
    const job = reconcilePaymentsJob({
      store,
      payments,
      logger: createLogger({ level: 'silent' }),
      now: () => new Date('2026-11-06T06:00:00.000Z'),
      notifications: testDeps({ store }).notifications,
      email,
      financeAlertEmail: 'finance@parkly.test',
    });
    await job(RUN);
    expect(email.sent).toHaveLength(0);

    payments.transactions.push(tx('stranger'));
    await job(RUN);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: 'finance@parkly.test',
      subject: 'Parkly reconciliation 2026-11-05: 1 to review',
    });
    expect(email.sent[0]?.text).toContain('MISSING_INTERNAL: 1');
  });

  it('a failing alert email never fails the run', async () => {
    const store = new MemoryStore();
    const payments = new FakePaymentProvider();
    const email = new FakeEmailProvider();
    email.failNext = true;
    const job = reconcilePaymentsJob({
      store,
      payments,
      logger: createLogger({ level: 'silent' }),
      now: () => new Date('2026-11-06T06:00:00.000Z'),
      notifications: testDeps({ store }).notifications,
      email,
      financeAlertEmail: 'finance@parkly.test',
    });
    payments.transactions.push(tx('stranger'));
    await expect(job(RUN)).resolves.toMatchObject({ remaining: 0 });
  });
});
