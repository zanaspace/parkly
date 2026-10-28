import { describe, expect, it } from 'vitest';
import type { Kobo } from '../money/money.js';
import type { RatePlanPrices } from '../pricing/quote.js';
import {
  calculateExtensionQuote,
  validateExtensionWindow,
  type ExtensionSettings,
} from './extension.js';

describe('validateExtensionWindow (FR-BOOK-005, doc 02 §4)', () => {
  const startAt = new Date('2026-10-27T10:00:00Z');
  const currentEndAt = new Date('2026-10-27T12:00:00Z');
  const maxDurationMinutes = 1440; // 24 hours

  it('approves a valid extension aligned to the 15-minute grid', () => {
    const newEndAt = new Date('2026-10-27T13:00:00Z');
    const res = validateExtensionWindow({
      startAt,
      currentEndAt,
      newEndAt,
      now: new Date('2026-10-27T11:00:00Z'),
      status: 'CONFIRMED',
      maxDurationMinutes,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addedMinutes).toBe(60);
      expect(res.totalMinutes).toBe(180);
    }
  });

  it('rejects an extension where newEndAt is not later than currentEndAt', () => {
    const res = validateExtensionWindow({
      startAt,
      currentEndAt,
      newEndAt: currentEndAt,
      now: new Date('2026-10-27T11:00:00Z'),
      status: 'CONFIRMED',
      maxDurationMinutes,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('EXTENSION_NOT_LATER');
    }
  });

  it('rejects an extension not aligned to the 15-minute slot boundary', () => {
    const newEndAt = new Date('2026-10-27T13:07:00Z'); // Not :00, :15, :30, :45
    const res = validateExtensionWindow({
      startAt,
      currentEndAt,
      newEndAt,
      now: new Date('2026-10-27T11:00:00Z'),
      status: 'CONFIRMED',
      maxDurationMinutes,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('EXTENSION_NOT_SLOT_ALIGNED');
    }
  });

  it('refuses a +5 min extension unless test stays are switched on', () => {
    const input = {
      startAt,
      currentEndAt,
      newEndAt: new Date('2026-10-27T12:05:00Z'),
      now: new Date('2026-10-27T11:00:00Z'),
      status: 'CONFIRMED' as const,
      maxDurationMinutes,
    };
    expect(validateExtensionWindow(input)).toEqual({
      ok: false,
      code: 'EXTENSION_NOT_SLOT_ALIGNED',
    });
    expect(validateExtensionWindow({ ...input, allowTestStays: true }).ok).toBe(true);
  });

  it('refuses to extend over time already spent past end + grace (gap review P-11)', () => {
    const input = {
      startAt,
      currentEndAt,
      newEndAt: new Date('2026-10-27T14:00:00Z'),
      status: 'CHECKED_IN' as const,
      maxDurationMinutes,
      graceMin: 10,
    };
    expect(validateExtensionWindow({ ...input, now: new Date('2026-10-27T12:10:00Z') }).ok).toBe(
      true,
    );
    expect(validateExtensionWindow({ ...input, now: new Date('2026-10-27T13:40:00Z') })).toEqual({
      ok: false,
      code: 'EXTENSION_TOO_LATE',
    });
  });

  it('rejects an extension exceeding the maximum booking duration (24 hours)', () => {
    // 25 hours from start
    const newEndAt = new Date('2026-10-28T11:00:00Z');
    const res = validateExtensionWindow({
      startAt,
      currentEndAt,
      newEndAt,
      now: new Date('2026-10-27T11:00:00Z'),
      status: 'CONFIRMED',
      maxDurationMinutes,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('EXTENSION_EXCEEDS_MAX_DURATION');
    }
  });

  it('allows extending both CONFIRMED and CHECKED_IN bookings', () => {
    const newEndAt = new Date('2026-10-27T13:00:00Z');
    for (const status of ['CONFIRMED', 'CHECKED_IN'] as const) {
      const res = validateExtensionWindow({
        startAt,
        currentEndAt,
        newEndAt,
        now: new Date('2026-10-27T11:00:00Z'),
        status,
        maxDurationMinutes,
      });
      expect(res.ok).toBe(true);
    }
  });

  it('rejects extension for non-extendable statuses (COMPLETED, CANCELLED, EXPIRED, NO_SHOW, PENDING_PAYMENT)', () => {
    const newEndAt = new Date('2026-10-27T13:00:00Z');
    for (const status of [
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'NO_SHOW',
      'PENDING_PAYMENT',
    ] as const) {
      const res = validateExtensionWindow({
        startAt,
        currentEndAt,
        newEndAt,
        now: new Date('2026-10-27T11:00:00Z'),
        status,
        maxDurationMinutes,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('BOOKING_NOT_EXTENDABLE');
      }
    }
  });
});

describe('calculateExtensionQuote (doc 02 §4 Worked Example 5)', () => {
  // Rate ₦1,000/h = 100,000 kobo; block 15 min; min 60; fee ₦100 = 10,000 kobo; commission 1200 bps
  const ratePlan: RatePlanPrices = {
    product: 'HOURLY',
    hourlyRateKobo: 100_000,
    minMinutes: 60,
    dailyCapKobo: null,
    dailyRateKobo: null,
    monthlyRateKobo: null,
  };

  const settings: ExtensionSettings = {
    commissionBps: 1200, // 12%
  };

  it('computes exact Worked Example 5: extend 2 h 15 m to 3 h', () => {
    const startAt = new Date('2026-10-27T10:00:00Z');
    const currentEndAt = new Date('2026-10-27T12:15:00Z'); // 2 h 15 m
    const newEndAt = new Date('2026-10-27T13:00:00Z'); // 3 h
    const currentPriceKobo = 225_000 as Kobo; // Already paid for parking

    const quote = calculateExtensionQuote({
      ratePlan,
      settings,
      startAt,
      currentEndAt,
      newEndAt,
      currentPriceKobo,
    });

    // quote(3 h) = 300,000 kobo.
    // incremental price = 300,000 - 225,000 = 75,000 kobo.
    // service fee = 0 kobo.
    // total = 75,000 kobo.
    // commission = 12% of 75,000 = 9,000 kobo.
    // operator amount = 66,000 kobo.
    expect(quote.addedMinutes).toBe(45);
    expect(quote.priceKobo).toBe(75_000);
    expect(quote.serviceFeeKobo).toBe(0);
    expect(quote.totalKobo).toBe(75_000);
    expect(quote.commissionKobo).toBe(9_000);
    expect(quote.operatorAmountKobo).toBe(66_000);
  });

  it('respects daily cap when extending into capped territory', () => {
    // ₦1,000/h, daily cap ₦6,000 (600,000 kobo)
    const cappedPlan: RatePlanPrices = {
      ...ratePlan,
      dailyCapKobo: 600_000,
    };
    const startAt = new Date('2026-10-27T08:00:00Z');
    const currentEndAt = new Date('2026-10-27T13:00:00Z'); // 5 hours: 500,000 kobo
    const newEndAt = new Date('2026-10-27T18:00:00Z'); // 10 hours: uncapped = 1,000,000, capped = 600,000

    const quote = calculateExtensionQuote({
      ratePlan: cappedPlan,
      settings,
      startAt,
      currentEndAt,
      newEndAt,
      currentPriceKobo: 500_000 as Kobo,
    });

    // incremental price = 600,000 - 500,000 = 100,000 kobo
    expect(quote.priceKobo).toBe(100_000);
    expect(quote.totalKobo).toBe(100_000);
    expect(quote.commissionKobo).toBe(12_000);
    expect(quote.operatorAmountKobo).toBe(88_000);
  });
});
