import { isBalanced } from '@parkly/domain/booking';
import { describe, expect, it } from 'vitest';
import type { VerifiedCharge } from '../providers/index.js';
import { settlePlan } from './settle-plan.js';
import type { BookingRow, PaymentRow } from './types.js';

const AT = new Date('2026-10-19T08:05:00Z');
const booking = (status: BookingRow['status']): BookingRow => ({
  id: 'b1',
  code: 'PK-7HQ4MZ',
  driverId: 'd1',
  vehicleId: 'v1',
  plateNorm: 'LND123AB',
  lotId: 'l1',
  product: 'HOURLY',
  startAt: new Date('2026-10-20T07:00:00Z'),
  endAt: new Date('2026-10-20T09:00:00Z'),
  status,
  holdExpiresAt: AT,
  priceKobo: 100_000,
  serviceFeeKobo: 10_000,
  totalKobo: 110_000,
  commissionBps: 1200,
  ratePlanId: 'r1',
  pricingBreakdown: [],
  source: 'MOBILE',
  createdAt: AT,
});
const payment: PaymentRow = {
  id: 'p1',
  bookingId: 'b1',
  payerUserId: 'd1',
  provider: 'PAYSTACK',
  status: 'PENDING',
  amountKobo: 110_000,
  platformAmountKobo: 22_000,
  operatorAmountKobo: 88_000,
  operatorId: 'op1',
  subaccountCode: 'ACCT_x',
  authorizationUrl: null,
  paidAt: null,
  failureCode: null,
  createdAt: AT,
};
const charge = (over: Partial<VerifiedCharge> = {}): VerifiedCharge => ({
  status: 'success',
  amountKobo: 110_000,
  currency: 'NGN',
  paidAt: AT,
  feesKobo: 1_650,
  channel: 'card',
  cardLast4: '4081',
  cardBrand: 'visa',
  ...over,
});

describe('settlement plans (doc 02 §7.5)', () => {
  it('confirms: converts the hold, records the card and posts balanced journals', () => {
    const plan = settlePlan('CONFIRM', charge(), booking('PENDING_PAYMENT'), payment);
    expect(plan).toMatchObject({
      payment: { status: 'SUCCEEDED', cardLast4: '4081', feesKobo: 1_650 },
      booking: { from: 'PENDING_PAYMENT', to: 'CONFIRMED' },
      slots: 'convert',
      refund: null,
    });
    expect(plan.journals).toHaveLength(2);
    expect(plan.journals.every(isBalanced)).toBe(true);
  });

  it('posts no fee journal when the provider reports no fee', () => {
    const plan = settlePlan(
      'CONFIRM',
      charge({ feesKobo: null }),
      booking('PENDING_PAYMENT'),
      payment,
    );
    expect(plan.journals).toHaveLength(1);
  });

  it('re-books late money without touching held slots', () => {
    expect(
      settlePlan('REACQUIRE_AND_CONFIRM', charge(), booking('EXPIRED'), payment),
    ).toMatchObject({
      booking: { from: 'EXPIRED', to: 'CONFIRMED', reason: 'payment.late' },
      slots: null,
    });
  });

  it('keeps the money on record and asks for a full refund', () => {
    expect(settlePlan('REFUND_HOLD_EXPIRED', charge(), booking('EXPIRED'), payment)).toMatchObject({
      payment: { status: 'SUCCEEDED' },
      booking: null,
      refund: { amountKobo: 110_000, reason: 'HOLD_EXPIRED' },
    });
    expect(settlePlan('REFUND_CANCELLED', charge(), booking('CANCELLED'), payment).refund).toEqual({
      amountKobo: 110_000,
      reason: 'DRIVER_CANCEL',
    });
  });

  it('fails the payment and releases a pending hold', () => {
    expect(
      settlePlan('FAIL', charge({ status: 'failed' }), booking('PENDING_PAYMENT'), payment),
    ).toMatchObject({
      payment: { status: 'FAILED', failureCode: 'failed' },
      booking: { to: 'EXPIRED' },
      slots: 'release',
    });
    expect(
      settlePlan('FAIL', charge({ status: 'failed' }), booking('EXPIRED'), payment),
    ).toMatchObject({
      booking: null,
      slots: null,
    });
  });

  it('only flags a wrong amount, and does nothing for the rest', () => {
    expect(
      settlePlan('AMOUNT_MISMATCH', charge(), booking('PENDING_PAYMENT'), payment),
    ).toMatchObject({
      payment: { failureCode: 'AMOUNT_MISMATCH' },
      booking: null,
      journals: [],
    });
    for (const d of ['WAIT', 'NOOP', 'NEEDS_REVIEW'] as const)
      expect(settlePlan(d, charge(), booking('PENDING_PAYMENT'), payment)).toEqual({
        payment: null,
        booking: null,
        slots: null,
        journals: [],
        refund: null,
      });
  });
});
