import { describe, expect, it } from 'vitest';
import type { Kobo } from '../money/money.js';
import type { RatePlanPrices } from '../pricing/quote.js';
import { calculateEarlyStartQuote, earlyStartFor, extensionApplies } from './early-start.js';

// ₦1,000/h, 15-minute blocks, 1 h minimum, 12% commission.
const plan: RatePlanPrices = {
  product: 'HOURLY',
  hourlyRateKobo: 100_000,
  minMinutes: 60,
  dailyCapKobo: null,
  dailyRateKobo: null,
  monthlyRateKobo: null,
};
// A 12:00–14:00 Lagos booking (11:00–13:00 UTC).
const START = new Date('2026-11-06T11:00:00Z');
const END = new Date('2026-11-06T13:00:00Z');

describe('earlyStartFor (ADR 0023 stage 2)', () => {
  it('moves the start so check-in opens now, keeping the free 30 minutes', () => {
    // 11:11 Lagos: start at 11:30, check-in opens at 11:00.
    expect(
      earlyStartFor({ now: new Date('2026-11-06T10:11:00Z'), startAt: START, earlyArrivalMin: 30 }),
    ).toEqual({ newStartAt: new Date('2026-11-06T10:30:00Z'), addedMinutes: 30 });
    // 10:00 Lagos: start at 10:30, 90 minutes earlier.
    expect(
      earlyStartFor({ now: new Date('2026-11-06T09:00:00Z'), startAt: START, earlyArrivalMin: 30 }),
    ).toEqual({ newStartAt: new Date('2026-11-06T09:30:00Z'), addedMinutes: 90 });
  });

  it('buys just enough when check-in opens in a few minutes', () => {
    // 11:20 Lagos: check-in opens at 11:30, so a 15-minute early start (11:45).
    expect(
      earlyStartFor({ now: new Date('2026-11-06T10:20:00Z'), startAt: START, earlyArrivalMin: 30 }),
    ).toEqual({ newStartAt: new Date('2026-11-06T10:45:00Z'), addedMinutes: 15 });
  });

  it('is not needed once check-in is open', () => {
    expect(
      earlyStartFor({ now: new Date('2026-11-06T10:30:00Z'), startAt: START, earlyArrivalMin: 30 }),
    ).toBeNull();
  });
});

describe('calculateEarlyStartQuote', () => {
  it('charges the whole stay from the new start, less what was paid', () => {
    const q = calculateEarlyStartQuote({
      ratePlan: plan,
      commissionBps: 1200,
      newStartAt: new Date('2026-11-06T10:30:00Z'),
      endAt: END,
      currentPriceKobo: 200_000 as Kobo,
    });
    // 2 h 30 m = 250,000; paid 200,000 → 50,000; commission 6,000.
    expect(q).toEqual({
      priceKobo: 50_000,
      commissionKobo: 6_000,
      operatorAmountKobo: 44_000,
    });
  });

  it('never charges less than nothing (a later price cut)', () => {
    expect(
      calculateEarlyStartQuote({
        ratePlan: plan,
        commissionBps: 1200,
        newStartAt: new Date('2026-11-06T10:30:00Z'),
        endAt: END,
        currentPriceKobo: 999_000 as Kobo,
      }).priceKobo,
    ).toBe(0);
  });
});

describe('extensionApplies (both stores and SQL agree)', () => {
  const booking = { status: 'CONFIRMED' as const, startAt: START, endAt: END };
  it('an extension meets the booking’s end while confirmed or parked', () => {
    const ext = {
      kind: 'EXTEND' as const,
      startAt: END,
      newEndAt: new Date('2026-11-06T14:00:00Z'),
    };
    expect(extensionApplies(ext, booking)).toBe(true);
    expect(extensionApplies(ext, { ...booking, status: 'CHECKED_IN' })).toBe(true);
    expect(extensionApplies(ext, { ...booking, status: 'CANCELLED' })).toBe(false);
    expect(extensionApplies(ext, { ...booking, endAt: new Date('2026-11-06T14:00:00Z') })).toBe(
      false,
    );
  });

  it('an early start meets the booking’s start, only before the car is in', () => {
    const ext = {
      kind: 'EARLY_START' as const,
      startAt: new Date('2026-11-06T10:30:00Z'),
      newEndAt: START,
    };
    expect(extensionApplies(ext, booking)).toBe(true);
    expect(extensionApplies(ext, { ...booking, status: 'CHECKED_IN' })).toBe(false);
    expect(extensionApplies(ext, { ...booking, startAt: new Date('2026-11-06T10:30:00Z') })).toBe(
      false,
    );
  });
});
