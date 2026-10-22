import { describe, expect, it } from 'vitest';
import {
  PAYMENT_STATUSES,
  canTransitionPayment,
  confirmDecision,
  statusAfterRefund,
  type ConfirmInput,
} from './payment.js';

describe('payment transitions (doc 02 §3.2)', () => {
  it('allows exactly the listed transitions', () => {
    const listed = new Set([
      'INITIATED>PENDING',
      'INITIATED>SUCCEEDED',
      'PENDING>SUCCEEDED',
      'INITIATED>FAILED',
      'PENDING>FAILED',
      'PENDING>ABANDONED',
      'SUCCEEDED>PARTIALLY_REFUNDED',
      'SUCCEEDED>REFUNDED',
      'PARTIALLY_REFUNDED>PARTIALLY_REFUNDED',
      'PARTIALLY_REFUNDED>REFUNDED',
    ]);
    for (const from of PAYMENT_STATUSES) {
      for (const to of PAYMENT_STATUSES) {
        expect(canTransitionPayment(from, to), `${from} → ${to}`).toBe(listed.has(`${from}>${to}`));
      }
    }
  });
});

describe('refund status', () => {
  it('is partial until refunds reach the amount', () => {
    expect(
      statusAfterRefund({ amountKobo: 210_000, refundedKobo: 0, refundKobo: 100_000 }),
    ).toEqual({ ok: true, status: 'PARTIALLY_REFUNDED' });
    expect(
      statusAfterRefund({ amountKobo: 210_000, refundedKobo: 100_000, refundKobo: 110_000 }),
    ).toEqual({ ok: true, status: 'REFUNDED' });
  });

  it('never refunds more than was paid, or nothing', () => {
    expect(
      statusAfterRefund({ amountKobo: 210_000, refundedKobo: 100_000, refundKobo: 110_001 }),
    ).toEqual({ ok: false, code: 'REFUND_EXCEEDS_PAYMENT' });
    expect(statusAfterRefund({ amountKobo: 210_000, refundedKobo: 0, refundKobo: 0 })).toEqual({
      ok: false,
      code: 'REFUND_EXCEEDS_PAYMENT',
    });
  });
});

describe('confirming a payment (doc 02 §7.5, doc 01 §5.2 edge cases)', () => {
  const base: ConfirmInput = {
    payment: { status: 'PENDING', amountKobo: 210_000 },
    verify: { status: 'success', amountKobo: 210_000, currency: 'NGN' },
    bookingStatus: 'PENDING_PAYMENT',
    capacityAvailable: true,
  };
  const decide = (over: Partial<ConfirmInput>) => confirmDecision({ ...base, ...over });

  it('confirms a pending booking when verify matches', () => {
    expect(decide({})).toBe('CONFIRM');
  });

  it('is a no-op once the payment already succeeded', () => {
    expect(decide({ payment: { status: 'SUCCEEDED', amountKobo: 210_000 } })).toBe('NOOP');
    expect(decide({ payment: { status: 'REFUNDED', amountKobo: 210_000 } })).toBe('NOOP');
  });

  it('records a failure when the provider says it failed', () => {
    expect(decide({ verify: { status: 'failed', amountKobo: 210_000, currency: 'NGN' } })).toBe(
      'FAIL',
    );
  });

  it('waits while the provider is still processing', () => {
    expect(decide({ verify: { status: 'pending', amountKobo: 210_000, currency: 'NGN' } })).toBe(
      'WAIT',
    );
  });

  it('flags a wrong amount or currency and never confirms', () => {
    expect(decide({ verify: { status: 'success', amountKobo: 200_000, currency: 'NGN' } })).toBe(
      'AMOUNT_MISMATCH',
    );
    expect(decide({ verify: { status: 'success', amountKobo: 210_000, currency: 'USD' } })).toBe(
      'AMOUNT_MISMATCH',
    );
  });

  it('re-acquires capacity after the hold expired, or refunds', () => {
    expect(decide({ bookingStatus: 'EXPIRED' })).toBe('REACQUIRE_AND_CONFIRM');
    expect(decide({ bookingStatus: 'EXPIRED', capacityAvailable: false })).toBe(
      'REFUND_HOLD_EXPIRED',
    );
  });

  it('refunds money that arrives for a cancelled booking', () => {
    expect(decide({ bookingStatus: 'CANCELLED' })).toBe('REFUND_CANCELLED');
  });

  it('ignores a repeated failure and sends disagreements to ops', () => {
    const failed = { status: 'failed', amountKobo: 210_000, currency: 'NGN' };
    expect(decide({ payment: { status: 'FAILED', amountKobo: 210_000 }, verify: failed })).toBe(
      'NOOP',
    );
    expect(decide({ payment: { status: 'ABANDONED', amountKobo: 210_000 } })).toBe('NEEDS_REVIEW');
    expect(decide({ bookingStatus: 'CONFIRMED' })).toBe('NEEDS_REVIEW');
  });
});
