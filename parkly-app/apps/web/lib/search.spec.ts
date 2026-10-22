import { describe, expect, it } from 'vitest';
import {
  defaultStart,
  distanceLabel,
  lineLabel,
  readSearch,
  searchQuery,
  searchWindow,
  spacesLabel,
  windowLabel,
} from './search';

// Thursday 22 Oct 2026, 14:20 in Lagos.
const NOW = new Date('2026-10-22T13:20:00Z');

describe('reading a search', () => {
  it('defaults to Victoria Island from the next full hour for 2 hours', () => {
    expect(readSearch({}, NOW)).toEqual({
      lat: 6.4281,
      lng: 3.4219,
      place: 'Victoria Island',
      date: '2026-10-22',
      time: '15:00',
      duration: 2,
      sort: 'distance',
      radiusM: 2000,
    });
  });

  it('reads an area, a full day, price sort and a wider radius', () => {
    const s = readSearch(
      { area: 'ikoyi', date: '2026-10-24', duration: 'day', sort: 'price', radius: '5000' },
      NOW,
    );
    expect(s).toMatchObject({ place: 'Ikoyi', duration: 'day', sort: 'price', radiusM: 5000 });
  });

  it('uses the device location for "near me" and ignores bad values', () => {
    const s = readSearch(
      { lat: '6.43', lng: '3.42', time: '09:10', duration: '7', radius: '9' },
      NOW,
    );
    expect(s).toMatchObject({
      lat: 6.43,
      lng: 3.42,
      place: 'your location',
      time: '15:00',
      duration: 2,
      radiusM: 2000,
    });
  });

  it('rolls the default start past midnight in Lagos', () => {
    expect(defaultStart(new Date('2026-10-22T23:30:00Z'))).toEqual({
      date: '2026-10-23',
      time: '01:00',
    });
  });
});

describe('the API window', () => {
  it('turns a Lagos start and hours into UTC instants', () => {
    expect(searchWindow({ date: '2026-10-23', time: '08:00', duration: 10 })).toEqual({
      startAt: '2026-10-23T07:00:00.000Z',
      endAt: '2026-10-23T17:00:00.000Z',
      product: 'HOURLY',
    });
  });

  it('covers the whole Lagos day for a full day', () => {
    expect(searchWindow({ date: '2026-10-23', time: '08:00', duration: 'day' })).toEqual({
      startAt: '2026-10-22T23:00:00.000Z',
      endAt: '2026-10-23T23:00:00.000Z',
      product: 'DAILY',
    });
  });

  it('round-trips through links', () => {
    const s = readSearch({ area: 'yaba', duration: '4' }, NOW);
    expect(readSearch(Object.fromEntries(new URLSearchParams(searchQuery(s))), NOW)).toEqual(s);
    const near = readSearch({ lat: '6.5', lng: '3.4' }, NOW);
    expect(searchQuery(near, { sort: 'price' })).toContain('lat=6.5');
  });
});

describe('labels', () => {
  it('bands spaces and says when a lot is closed', () => {
    expect(spacesLabel(20, true)).toBe('20 spaces');
    expect(spacesLabel(3, true)).toBe('Few left (3)');
    expect(spacesLabel(0, true)).toBe('Full');
    expect(spacesLabel(20, false)).toBe('Closed at that time');
  });

  it('shows distance and the window in words', () => {
    expect(distanceLabel(184)).toBe('180 m away');
    expect(distanceLabel(1322)).toBe('1.3 km away');
    expect(windowLabel({ date: '2026-10-23', time: '08:00', duration: 10 })).toBe(
      'Fri 23 Oct, 08:00 for 10 hours',
    );
    expect(windowLabel({ date: '2026-10-23', time: '08:00', duration: 'day' })).toBe(
      'Fri 23 Oct, all day',
    );
  });

  it('describes the server’s quote lines', () => {
    expect(
      lineLabel({
        kind: 'HOURLY_DAY',
        date: '2026-10-23',
        minutes: 600,
        amountKobo: 1,
        capped: true,
      }),
    ).toBe('Fri 23 Oct · 10 h (daily maximum)');
    expect(
      lineLabel({
        kind: 'HOURLY_DAY',
        date: '2026-10-23',
        minutes: 75,
        amountKobo: 1,
        capped: false,
      }),
    ).toBe('Fri 23 Oct · 1 h 15 min');
    expect(lineLabel({ kind: 'DAY', date: '2026-10-23', amountKobo: 1 })).toBe(
      'Fri 23 Oct · full day',
    );
    expect(lineLabel({ kind: 'SERVICE_FEE', amountKobo: 1 })).toBe('Parkly service fee');
  });
});

describe('dates', () => {
  it('allows today to 30 days ahead, in Lagos', async () => {
    const { dateRange, lagosWeekday } = await import('./search');
    expect(dateRange(new Date('2026-10-22T23:30:00Z'))).toEqual({
      today: '2026-10-23',
      lastDay: '2026-11-22',
    });
    expect(lagosWeekday(NOW)).toBe(4);
  });
});
