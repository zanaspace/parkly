import { describe, expect, it } from 'vitest';
import type { RatePlanPrices } from '../pricing/quote.js';
import { calculateOverstay, validateOverstayRatePlan, type OverstaySettings } from './overstay.js';

describe('calculateOverstay (FR-BOOK-008, doc 02 §4 Worked Example 6, ADR 0016)', () => {
  const settings: OverstaySettings = {
    defaultGraceMin: 10,
    commissionBps: 1200, // 12%
  };

  const ratePlan: RatePlanPrices = {
    product: 'HOURLY',
    hourlyRateKobo: 100_000, // ₦1,000/h -> 25,000 kobo per 15 min
    minMinutes: 60,
    dailyCapKobo: null,
    dailyRateKobo: null,
    monthlyRateKobo: null,
  };

  const endAt = new Date('2026-10-27T12:00:00Z');

  it('reports zero overstay when check-out is on or before the end time', () => {
    const checkOutAt = new Date('2026-10-27T11:58:00Z');
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan,
      settings,
    });

    expect(res.isOverstay).toBe(false);
    expect(res.overstayMinutes).toBe(0);
    expect(res.blocks).toBe(0);
    expect(res.amountKobo).toBe(0);
    expect(res.status).toBe('NONE');
  });

  it('reports zero overstay within the 10-minute grace period', () => {
    // 7 minutes after endAt
    const checkOutAt = new Date('2026-10-27T12:07:00Z');
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan,
      settings,
    });

    expect(res.isOverstay).toBe(false);
    expect(res.overstayMinutes).toBe(0);
    expect(res.amountKobo).toBe(0);
    expect(res.status).toBe('NONE');
  });

  it('computes exact Worked Example 6: 22 min late with 10 min grace -> 1 block of 25,000 kobo', () => {
    // 22 minutes past endAt (12:22:00Z), grace 10 -> 12 min excess past grace -> ceil15(12) = 15 min -> 1 block
    const checkOutAt = new Date('2026-10-27T12:22:00Z');
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan,
      settings,
    });

    expect(res.isOverstay).toBe(true);
    expect(res.excessMinutes).toBe(12);
    expect(res.overstayMinutes).toBe(15);
    expect(res.blocks).toBe(1);
    expect(res.per15Kobo).toBe(25_000);
    expect(res.amountKobo).toBe(25_000);
    expect(res.commissionKobo).toBe(3_000); // 12% of 25,000
    expect(res.operatorAmountKobo).toBe(22_000);
    expect(res.status).toBe('DUE');
  });

  it('computes multiple 15-minute blocks for longer overstays', () => {
    // 55 minutes past endAt, grace 10 -> 45 min excess -> ceil15(45) = 45 min -> 3 blocks
    const checkOutAt = new Date('2026-10-27T12:55:00Z');
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan,
      settings,
    });

    expect(res.isOverstay).toBe(true);
    expect(res.blocks).toBe(3);
    expect(res.overstayMinutes).toBe(45);
    expect(res.amountKobo).toBe(75_000); // 3 * 25,000
    expect(res.commissionKobo).toBe(9_000);
    expect(res.operatorAmountKobo).toBe(66_000);
  });

  it('uses custom operator overstay rate when specified on the rate plan (ADR 0016)', () => {
    // Operator set custom overstay price of ₦350 per 15 min (35,000 kobo)
    const customRatePlan: RatePlanPrices & {
      overstayRateKobo?: number;
      overstayGraceMin?: number;
    } = {
      ...ratePlan,
      overstayRateKobo: 35_000,
      overstayGraceMin: 15, // Custom 15 min grace
    };

    // 40 min past endAt -> 25 min excess -> ceil15(25) = 30 min -> 2 blocks
    const checkOutAt = new Date('2026-10-27T12:40:00Z');
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan: customRatePlan,
      settings,
    });

    expect(res.isOverstay).toBe(true);
    expect(res.blocks).toBe(2);
    expect(res.per15Kobo).toBe(35_000);
    expect(res.amountKobo).toBe(70_000); // 2 * 35,000
  });

  it('falls back to daily rate / 24 / 4 if lot has only DAILY rate', () => {
    const dailyPlan: RatePlanPrices = {
      product: 'DAILY',
      hourlyRateKobo: null,
      minMinutes: 1440,
      dailyCapKobo: null,
      dailyRateKobo: 480_000, // ₦4,800/day -> 20,000/h -> 5,000 per 15 min
      monthlyRateKobo: null,
    };

    const checkOutAt = new Date('2026-10-27T12:25:00Z'); // 25 min late, grace 10 -> 15 min -> 1 block
    const res = calculateOverstay({
      endAt,
      checkOutAt,
      ratePlan: dailyPlan,
      settings,
    });

    expect(res.isOverstay).toBe(true);
    expect(res.blocks).toBe(1);
    expect(res.per15Kobo).toBe(5_000);
    expect(res.amountKobo).toBe(5_000);
  });
});

describe('validateOverstayRatePlan (ADR 0016)', () => {
  it('approves an overstay rate within the platform maximum multiplier (2.0x)', () => {
    // Hourly rate 100,000 kobo -> base 15-min block = 25,000 kobo. Max 2.0x = 50,000 kobo.
    const res = validateOverstayRatePlan({
      hourlyRateKobo: 100_000,
      overstayRateKobo: 40_000, // 1.6x base
      maxMultiplier: 2.0,
      minGraceMin: 10,
      graceMin: 15,
    });

    expect(res.ok).toBe(true);
  });

  it('rejects an overstay rate that exceeds the platform maximum multiplier', () => {
    // Base 25,000 kobo. Requested 60,000 kobo (2.4x)
    const res = validateOverstayRatePlan({
      hourlyRateKobo: 100_000,
      overstayRateKobo: 60_000,
      maxMultiplier: 2.0,
      minGraceMin: 10,
      graceMin: 10,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('OVERSTAY_RATE_EXCEEDS_MAX');
    }
  });

  it('rejects an operator grace period shorter than platform minimum (10 min)', () => {
    const res = validateOverstayRatePlan({
      hourlyRateKobo: 100_000,
      overstayRateKobo: 25_000,
      maxMultiplier: 2.0,
      minGraceMin: 10,
      graceMin: 5, // Shorter than 10
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('OVERSTAY_GRACE_BELOW_MINIMUM');
    }
  });
});
