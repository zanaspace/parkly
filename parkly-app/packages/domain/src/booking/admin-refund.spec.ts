import { describe, expect, it } from 'vitest';
import type { Kobo } from '../money/money.js';
import {
  needsSecondApproval,
  refundableKobo,
  splitAdminRefund,
  staffRefundedKobo,
  supportRefundLeftKobo,
} from './admin-refund.js';

const k = (n: number) => n as Kobo;

describe('staff refunds (FR-ADM-003)', () => {
  it('can give back what was paid for the booking and extensions, less refunds and pending requests', () => {
    expect(
      refundableKobo({
        payments: [
          { kind: 'BOOKING', status: 'SUCCEEDED', amountKobo: 110_000 },
          { kind: 'EXTENSION', status: 'PARTIALLY_REFUNDED', amountKobo: 50_000 },
          { kind: 'OVERSTAY', status: 'SUCCEEDED', amountKobo: 25_000 },
          { kind: 'BOOKING', status: 'FAILED', amountKobo: 110_000 },
          { kind: 'BOOKING', status: 'INITIATED', amountKobo: 110_000 },
        ],
        refunds: [
          { status: 'SUCCEEDED', amountKobo: 20_000 },
          { status: 'PENDING', amountKobo: 10_000 },
          { status: 'FAILED', amountKobo: 99_000 },
        ],
        pendingRequestsKobo: 30_000,
      }),
    ).toBe(100_000);
  });

  it('never goes below zero, and nothing is refundable before payment', () => {
    expect(
      refundableKobo({
        payments: [{ status: 'SUCCEEDED', amountKobo: 10_000 }],
        refunds: [{ status: 'SUCCEEDED', amountKobo: 10_000 }],
        pendingRequestsKobo: 5_000,
      }),
    ).toBe(0);
    expect(
      refundableKobo({ payments: [{ status: 'PENDING', amountKobo: 10_000 }], refunds: [] }),
    ).toBe(0);
  });

  it('takes a refund off the parking price first, then the service fee', () => {
    const booking = { priceKobo: 100_000, serviceFeeKobo: 10_000 };
    expect(splitAdminRefund(k(40_000), booking)).toEqual({
      refundPriceKobo: 40_000,
      refundServiceFeeKobo: 0,
    });
    expect(splitAdminRefund(k(105_000), booking)).toEqual({
      refundPriceKobo: 100_000,
      refundServiceFeeKobo: 5_000,
    });
  });

  it('counts only refunds staff chose (they carry a note), not policy or failed ones', () => {
    expect(
      staffRefundedKobo([
        { status: 'SUCCEEDED', amountKobo: 3_000, note: 'Goodwill' },
        { status: 'PENDING', amountKobo: 2_000, note: 'Barrier stuck' },
        { status: 'FAILED', amountKobo: 9_000, note: 'Retry' },
        { status: 'SUCCEEDED', amountKobo: 110_000, note: null },
        { status: 'SUCCEEDED', amountKobo: 50_000 },
      ]),
    ).toBe(5_000);
  });

  it('lets support give back up to their limit per booking, less what staff already gave', () => {
    expect(
      supportRefundLeftKobo({
        limitKobo: 1_000_000,
        staffRefundedKobo: 0,
        refundableKobo: 110_000,
      }),
    ).toBe(110_000);
    expect(
      supportRefundLeftKobo({
        limitKobo: 1_000_000,
        staffRefundedKobo: 400_000,
        refundableKobo: 5_000_000,
      }),
    ).toBe(600_000);
    expect(
      supportRefundLeftKobo({
        limitKobo: 1_000_000,
        staffRefundedKobo: 1_200_000,
        refundableKobo: 5_000_000,
      }),
    ).toBe(0);
  });

  it('needs a second approval only above the threshold', () => {
    expect(needsSecondApproval(5_000_000, 5_000_000)).toBe(false);
    expect(needsSecondApproval(5_000_001, 5_000_000)).toBe(true);
  });
});
