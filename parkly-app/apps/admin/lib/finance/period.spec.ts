import { describe, expect, it } from 'vitest';
import { money, percent, periodRange, readPeriod } from './period';

// Thursday 5 Nov 2026, 23:30 UTC = Friday 6 Nov, 00:30 in Lagos.
const LATE = Date.parse('2026-11-05T23:30:00Z');

describe('admin revenue periods', () => {
  it('reads the period, falling back to this month', () => {
    expect(readPeriod({ period: 'week' })).toBe('week');
    expect(readPeriod({ period: 'all' })).toBe('month');
  });

  it('uses Lagos dates, Monday weeks and a 90-day window', () => {
    expect(periodRange('today', LATE)).toEqual({ from: '2026-11-06', to: '2026-11-06' });
    expect(periodRange('week', LATE)).toEqual({ from: '2026-11-02', to: '2026-11-06' });
    expect(periodRange('month', LATE)).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(periodRange('90d', LATE)).toEqual({ from: '2026-08-09', to: '2026-11-06' });
  });

  it('formats money and rates', () => {
    expect(money(1_234_56)).toBe('₦1,234.56');
    expect(money(-50)).toBe('−₦0.50');
    expect(percent(1200)).toBe('12%');
    expect(percent(1250)).toBe('12.5%');
    expect(percent(1025)).toBe('10.25%');
  });
});
