import { isInLagosState, validateOpeningHours, validateRatePlan } from '@parkly/domain/lot';
import { describe, expect, it } from 'vitest';
import { DEMO_LOTS, DEMO_SLUG_PREFIX, hoursFor, perfLots } from './demo-lots.js';

describe('demo lots (doc 20 S3 task 7)', () => {
  const all = [...DEMO_LOTS, ...perfLots(500)];

  it('are all in Lagos State with unique demo slugs', () => {
    expect(new Set(all.map((l) => l.slug)).size).toBe(all.length);
    for (const l of all) {
      expect(l.slug.startsWith(DEMO_SLUG_PREFIX), l.slug).toBe(true);
      expect(isInLagosState(l), l.slug).toBe(true);
    }
  });

  it('centre on Victoria Island (doc 00 Q1)', () => {
    expect(DEMO_LOTS.filter((l) => l.area === 'Victoria Island').length).toBeGreaterThan(5);
  });

  it('have prices, capacity and hours the domain accepts', () => {
    for (const l of DEMO_LOTS) {
      expect(l.capacityBookable).toBeLessThanOrEqual(l.capacityTotal);
      const plans = [
        l.hourlyKobo && {
          product: 'HOURLY' as const,
          hourlyRateKobo: l.hourlyKobo,
          minMinutes: 60,
        },
        l.dailyKobo && { product: 'DAILY' as const, dailyRateKobo: l.dailyKobo },
        l.monthlyKobo && { product: 'MONTHLY' as const, monthlyRateKobo: l.monthlyKobo },
      ].filter(Boolean);
      expect(plans.length, l.slug).toBeGreaterThan(0);
      for (const p of plans) if (p) expect(validateRatePlan(p), l.slug).toEqual([]);
      const days = hoursFor(l.hours).map((h) =>
        h.is24h
          ? { weekday: h.weekday, is24h: true as const }
          : {
              weekday: h.weekday,
              is24h: false as const,
              opensAt: h.opensAt ?? '',
              closesAt: h.closesAt ?? '',
            },
      );
      expect(validateOpeningHours(days), l.slug).toEqual([]);
    }
  });
});
