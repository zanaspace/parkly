import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  defaultStart,
  distanceLabel,
  lagosWeekday,
  lineLabel,
  searchWindow,
  spacesLabel,
  windowLabel,
} from './discovery.js';

// Thursday 22 Oct 2026, 14:20 in Lagos.
const NOW = new Date('2026-10-22T13:20:00Z');

describe('search time in Lagos', () => {
  it('starts at the next full hour, rolling past midnight', () => {
    expect(defaultStart(NOW)).toEqual({ date: '2026-10-22', time: '15:00' });
    expect(defaultStart(new Date('2026-10-22T23:30:00Z'))).toEqual({
      date: '2026-10-23',
      time: '01:00',
    });
  });

  it('allows today to 30 days ahead and steps days', () => {
    expect(dateRange(new Date('2026-10-22T23:30:00Z'))).toEqual({
      today: '2026-10-23',
      lastDay: '2026-11-22',
    });
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(lagosWeekday(NOW)).toBe(4);
  });

  it('turns hours or a full day into the API window', () => {
    expect(searchWindow({ date: '2026-10-23', time: '08:00', duration: 10 })).toEqual({
      startAt: '2026-10-23T07:00:00.000Z',
      endAt: '2026-10-23T17:00:00.000Z',
      product: 'HOURLY',
    });
    expect(searchWindow({ date: '2026-10-23', time: '08:00', duration: 'day' })).toEqual({
      startAt: '2026-10-22T23:00:00.000Z',
      endAt: '2026-10-23T23:00:00.000Z',
      product: 'DAILY',
    });
  });
});

describe('words for results', () => {
  it('bands spaces and says when a lot is closed', () => {
    expect(spacesLabel(20, true)).toBe('20 spaces');
    expect(spacesLabel(3, true)).toBe('Few left (3)');
    expect(spacesLabel(0, true)).toBe('Full');
    expect(spacesLabel(20, false)).toBe('Closed at that time');
  });

  it('shows distance and the window', () => {
    expect(distanceLabel(184)).toBe('180 m away');
    expect(distanceLabel(1322)).toBe('1.3 km away');
    expect(searchWindow({ date: '2026-10-23', time: '08:00', duration: '5m' })).toEqual({
      startAt: '2026-10-23T07:00:00.000Z',
      endAt: '2026-10-23T07:05:00.000Z',
      product: 'HOURLY',
    });
    expect(windowLabel({ date: '2026-10-23', time: '08:00', duration: 1 })).toBe(
      'Fri 23 Oct, 08:00 for 1 hour',
    );
    expect(windowLabel({ date: '2026-10-23', time: '08:00', duration: '5m' })).toBe(
      'Fri 23 Oct, 08:00 for 5 min (Test)',
    );
    expect(windowLabel({ date: '2026-10-23', time: '08:00', duration: 'day' })).toBe(
      'Fri 23 Oct, all day',
    );
  });

  it('describes every kind of quote line', () => {
    const base = { amountKobo: 1 };
    expect(
      lineLabel({ ...base, kind: 'HOURLY_DAY', date: '2026-10-23', minutes: 5, capped: false }),
    ).toBe('Fri 23 Oct · 5 min (Test)');
    expect(
      lineLabel({ ...base, kind: 'HOURLY_DAY', date: '2026-10-23', minutes: 600, capped: true }),
    ).toBe('Fri 23 Oct · 10 h (daily maximum)');
    expect(
      lineLabel({ ...base, kind: 'HOURLY_DAY', date: '2026-10-23', minutes: 75, capped: false }),
    ).toBe('Fri 23 Oct · 1 h 15 min');
    expect(lineLabel({ ...base, kind: 'DAY', date: '2026-10-23' })).toBe('Fri 23 Oct · full day');
    expect(
      lineLabel({ ...base, kind: 'MONTH', periodStart: '2026-10-23', periodEnd: '2026-11-21' }),
    ).toBe('Fri 23 Oct to Sat 21 Nov');
    expect(lineLabel({ ...base, kind: 'EXTENSION', minutes: 30 })).toBe('Extra 30 min');
    expect(lineLabel({ ...base, kind: 'OVERSTAY', minutes: 15 })).toBe('Overstay 15 min');
    expect(lineLabel({ ...base, kind: 'SERVICE_FEE' })).toBe('Parkly service fee');
  });
});
