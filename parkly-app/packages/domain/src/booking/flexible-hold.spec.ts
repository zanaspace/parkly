import { describe, expect, it } from 'vitest';
import {
  calculateHoldExpiration,
  calculateHoldingFee,
  checkHoldCapacity,
  holdHourlyRateKobo,
  DEFAULT_FREE_HOLD_MINUTES,
  isFlexibleHoldExpired,
} from './flexible-hold.js';

describe('Flexible hold domain logic (ADR 0024)', () => {
  const baseRateKobo = 100_000; // ₦1,000/hr -> 25,000 kobo per 15 min block
  const commissionBps = 1200; // 12%

  describe('calculateHoldingFee', () => {
    it('returns zero fee when driver checks in within free 60-minute courtesy hold', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T10:45:00Z'); // 45 min hold

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: baseRateKobo,
        commissionBps,
      });

      expect(res.isFeeAccrued).toBe(false);
      expect(res.heldMinutes).toBe(45);
      expect(res.freeHoldMinutes).toBe(DEFAULT_FREE_HOLD_MINUTES);
      expect(res.excessMinutes).toBe(0);
      expect(res.holdingFeeKobo).toBe(0);
      expect(res.commissionKobo).toBe(0);
      expect(res.operatorAmountKobo).toBe(0);
    });

    it('returns zero fee at exactly the 60-minute free hold boundary', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T11:00:00Z'); // exactly 60 min

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: baseRateKobo,
        commissionBps,
      });

      expect(res.isFeeAccrued).toBe(false);
      expect(res.heldMinutes).toBe(60);
      expect(res.holdingFeeKobo).toBe(0);
    });

    it('calculates 1 block of 25% hourly rate when checking in 15 minutes past courtesy window', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T11:15:00Z'); // 75 min total, 15 min excess

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: baseRateKobo,
        commissionBps,
      });

      expect(res.isFeeAccrued).toBe(true);
      expect(res.heldMinutes).toBe(75);
      expect(res.excessMinutes).toBe(15);
      expect(res.blocks).toBe(1);
      expect(res.per15Kobo).toBe(25_000); // ₦250
      expect(res.holdingFeeKobo).toBe(25_000);
      expect(res.commissionKobo).toBe(3_000); // 12% of 25,000 = 3,000
      expect(res.operatorAmountKobo).toBe(22_000);
    });

    it('rounds partial 15-minute blocks up (e.g. 70 min hold = 10 min excess -> 1 block)', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T11:10:00Z'); // 70 min total, 10 min excess

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: baseRateKobo,
        commissionBps,
      });

      expect(res.isFeeAccrued).toBe(true);
      expect(res.blocks).toBe(1);
      expect(res.holdingFeeKobo).toBe(25_000);
    });

    it('enforces the ₦150 floor (15,000 kobo) when 25% of hourly rate is below floor', () => {
      const lowRateKobo = 40_000; // ₦400/hr -> 25% is 10,000 kobo (₦100) < ₦150 floor
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T11:30:00Z'); // 90 min total, 30 min excess = 2 blocks

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: lowRateKobo,
        commissionBps,
      });

      expect(res.isFeeAccrued).toBe(true);
      expect(res.per15Kobo).toBe(15_000); // Floor applied!
      expect(res.blocks).toBe(2);
      expect(res.holdingFeeKobo).toBe(30_000); // 2 * 15,000
    });

    it('caps billable hold at maxHoldMinutes (e.g. 180 min)', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const checkedInAt = new Date('2026-11-06T13:30:00Z'); // 210 min (exceeds 180 min cap)

      const res = calculateHoldingFee({
        holdStartedAt,
        checkedInAt,
        hourlyRateKobo: baseRateKobo,
        commissionBps,
        freeHoldMinutes: 60,
        maxHoldMinutes: 180,
      });

      expect(res.heldMinutes).toBe(210);
      expect(res.excessMinutes).toBe(120); // 180 - 60 = 120 min max
      expect(res.blocks).toBe(8); // 120 / 15 = 8 blocks
      expect(res.holdingFeeKobo).toBe(8 * 25_000);
    });
  });

  describe('calculateHoldExpiration and isFlexibleHoldExpired', () => {
    it('computes hold expiration correctly', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      const expiresAt = calculateHoldExpiration(holdStartedAt, 180);
      expect(expiresAt.toISOString()).toBe('2026-11-06T13:00:00.000Z');
    });

    it('identifies when hold has expired vs still active', () => {
      const holdStartedAt = new Date('2026-11-06T10:00:00Z');
      expect(isFlexibleHoldExpired(holdStartedAt, new Date('2026-11-06T12:59:00Z'), 180)).toBe(
        false,
      );
      expect(isFlexibleHoldExpired(holdStartedAt, new Date('2026-11-06T13:00:00Z'), 180)).toBe(
        true,
      );
      expect(isFlexibleHoldExpired(holdStartedAt, new Date('2026-11-06T13:05:00Z'), 180)).toBe(
        true,
      );
    });
  });

  describe('checkHoldCapacity', () => {
    it('allows hold when active holds are below the percentage cap', () => {
      // 50 spaces * 30% = 15 allowed holds
      const res = checkHoldCapacity({
        activeHoldsCount: 5,
        capacityBookable: 50,
        holdCapPercent: 30,
      });
      expect(res.allowed).toBe(true);
      expect(res.maxHolds).toBe(15);
    });

    it('blocks hold when active holds reach the cap', () => {
      const res = checkHoldCapacity({
        activeHoldsCount: 15,
        capacityBookable: 50,
        holdCapPercent: 30,
      });
      expect(res.allowed).toBe(false);
      expect(res.maxHolds).toBe(15);
    });

    it('allows at least 1 hold for small lots when cap percent > 0', () => {
      // 2 spaces * 30% = 0.6 -> floor is 0, but max(1, 0) gives 1
      const res = checkHoldCapacity({
        activeHoldsCount: 0,
        capacityBookable: 2,
        holdCapPercent: 30,
      });
      expect(res.allowed).toBe(true);
      expect(res.maxHolds).toBe(1);
    });

    it('disallows holds completely when holdCapPercent is 0', () => {
      const res = checkHoldCapacity({
        activeHoldsCount: 0,
        capacityBookable: 50,
        holdCapPercent: 0,
      });
      expect(res.allowed).toBe(false);
      expect(res.maxHolds).toBe(0);
    });
  });
});

describe('holdHourlyRateKobo (ADR 0024)', () => {
  const start = new Date('2026-11-07T10:00:00Z');
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000);

  it("uses the booking's plan rate, however long the stay", () => {
    expect(
      holdHourlyRateKobo({
        planHourlyKobo: 50_000,
        priceKobo: 150_000,
        startAt: start,
        endAt: at(3),
      }),
    ).toBe(50_000);
  });

  it('falls back to the price per hour booked, never the whole price', () => {
    expect(
      holdHourlyRateKobo({
        planHourlyKobo: null,
        priceKobo: 150_000,
        startAt: start,
        endAt: at(3),
      }),
    ).toBe(50_000);
    expect(
      holdHourlyRateKobo({ planHourlyKobo: 0, priceKobo: 75_000, startAt: start, endAt: at(1.5) }),
    ).toBe(50_000);
    expect(
      holdHourlyRateKobo({ planHourlyKobo: null, priceKobo: 40_000, startAt: start, endAt: start }),
    ).toBe(40_000);
  });

  it('makes a 3-hour hold cost the same per block as a 1-hour one', () => {
    const held = { holdStartedAt: start, checkedInAt: at(1.5), commissionBps: 1200 };
    const rate = (hours: number) =>
      holdHourlyRateKobo({
        planHourlyKobo: null,
        priceKobo: 50_000 * hours,
        startAt: start,
        endAt: at(hours),
      });
    expect(calculateHoldingFee({ ...held, hourlyRateKobo: rate(3) }).holdingFeeKobo).toBe(
      calculateHoldingFee({ ...held, hourlyRateKobo: rate(1) }).holdingFeeKobo,
    );
  });
});
