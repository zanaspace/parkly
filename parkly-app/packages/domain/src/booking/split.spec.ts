import { describe, expect, it } from 'vitest';
import { paymentSplit } from './split.js';

describe('Paystack split (doc 01 §5.2, ADR 0004)', () => {
  it('sends the operator price − commission and keeps commission + fee', () => {
    expect(
      paymentSplit({ priceKobo: 200_000, serviceFeeKobo: 10_000, commissionBps: 1200 }),
    ).toEqual({
      amountKobo: 210_000,
      commissionKobo: 24_000,
      transactionChargeKobo: 34_000,
      operatorAmountKobo: 176_000,
      platformAmountKobo: 34_000,
    });
  });

  it('rounds commission half up, the same way as the quote', () => {
    // 1,250 kobo × 12% = 150 exactly; 1,254 × 12% = 150.48 → 150; 1,255 × 12% = 150.6 → 151.
    expect(
      paymentSplit({ priceKobo: 1_255, serviceFeeKobo: 0, commissionBps: 1200 }),
    ).toMatchObject({ commissionKobo: 151, operatorAmountKobo: 1_104 });
  });

  it('always adds up to what the driver pays', () => {
    for (const priceKobo of [1, 99, 150_000, 1_234_567]) {
      for (const bps of [1000, 1234, 1500]) {
        const s = paymentSplit({ priceKobo, serviceFeeKobo: 10_000, commissionBps: bps });
        expect(s.operatorAmountKobo + s.transactionChargeKobo).toBe(s.amountKobo);
      }
    }
  });

  it('rejects a commission outside 0–100%', () => {
    expect(() => paymentSplit({ priceKobo: 1000, serviceFeeKobo: 0, commissionBps: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      paymentSplit({ priceKobo: 1000, serviceFeeKobo: 0, commissionBps: 10_001 }),
    ).toThrow(RangeError);
  });

  it('rejects a free booking, which Paystack cannot charge', () => {
    expect(() => paymentSplit({ priceKobo: 0, serviceFeeKobo: 0, commissionBps: 1200 })).toThrow(
      RangeError,
    );
  });
});
