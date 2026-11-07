import { describe, expect, it } from 'vitest';
import {
  financeQuery,
  money,
  monthLabel,
  periodRange,
  readFinanceFilters,
  readPeriod,
  statementMonths,
} from './period';

// Thursday 5 Nov 2026, 23:30 UTC = Friday 6 Nov, 00:30 in Lagos.
const LATE = Date.parse('2026-11-05T23:30:00Z');
// Sunday 8 Nov 2026, 12:00 Lagos.
const SUNDAY = Date.parse('2026-11-08T11:00:00Z');

describe('revenue periods', () => {
  it('reads the period, falling back to this month', () => {
    expect(readPeriod({ period: 'today' })).toBe('today');
    expect(readPeriod({ period: '90d' })).toBe('90d');
    expect(readPeriod({ period: 'all' })).toBe('month');
    expect(readPeriod({ period: ['week'] })).toBe('month');
    expect(readPeriod({})).toBe('month');
  });

  it('uses the Lagos date, not UTC', () => {
    expect(periodRange('today', LATE)).toEqual({ from: '2026-11-06', to: '2026-11-06' });
  });

  it('starts the week on Monday, including on a Sunday', () => {
    expect(periodRange('week', LATE)).toEqual({ from: '2026-11-02', to: '2026-11-06' });
    expect(periodRange('week', SUNDAY)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('starts the month on the 1st', () => {
    expect(periodRange('month', LATE)).toEqual({ from: '2026-11-01', to: '2026-11-06' });
  });

  it('covers 90 days including today, inside the 93-day limit', () => {
    expect(periodRange('90d', LATE)).toEqual({ from: '2026-08-09', to: '2026-11-06' });
  });

  it('formats money, including a negative day of refunds', () => {
    expect(money(0)).toBe('₦0.00');
    expect(money(150_000)).toBe('₦1,500.00');
    expect(money(1_505)).toBe('₦15.05');
    expect(money(-50)).toBe('−₦0.50');
    expect(money(-123_456)).toBe('−₦1,234.56');
  });
});

describe('finance page filters and statements', () => {
  it('defaults to this month so far and keeps valid params', () => {
    expect(readFinanceFilters({}, LATE)).toEqual({
      from: '2026-11-01',
      to: '2026-11-06',
      lotId: '',
    });
    const lotId = '0192e220-0000-7000-8000-0000000000a1';
    expect(readFinanceFilters({ from: '2026-10-01', to: '2026-10-31', lotId }, LATE)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      lotId,
    });
    expect(readFinanceFilters({ from: 'x', lotId: 'nope' }, LATE).lotId).toBe('');
  });

  it('builds the query without an empty car park', () => {
    expect(financeQuery({ from: '2026-11-01', to: '2026-11-06', lotId: '' })).toBe(
      'from=2026-11-01&to=2026-11-06',
    );
  });

  it('lists statement months from now back to when the operator joined, across a year end', () => {
    expect(statementMonths('2026-09-15T10:00:00Z', LATE)).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
    ]);
    const months = statementMonths(null, Date.parse('2027-02-10T10:00:00Z'), 4);
    expect(months).toEqual(['2027-02', '2027-01', '2026-12', '2026-11']);
  });

  it('names a month', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});
