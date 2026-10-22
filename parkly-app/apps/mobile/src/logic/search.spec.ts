import { describe, expect, it } from 'vitest';
import {
  dayChoices,
  durationLabel,
  fromParams,
  initialSearch,
  searchPoint,
  stepTime,
  toParams,
} from './search';

// Thursday 22 Oct 2026, 14:20 in Lagos.
const NOW = new Date('2026-10-22T13:20:00Z');

describe('mobile search state', () => {
  it('starts in Victoria Island at the next full hour for 2 hours', () => {
    expect(initialSearch(NOW)).toEqual({
      area: 'victoria-island',
      coords: null,
      placeLabel: null,
      date: '2026-10-22',
      time: '15:00',
      duration: 2,
      sort: 'distance',
    });
  });

  it('offers today, tomorrow and five more days', () => {
    const days = dayChoices(NOW);
    expect(days).toHaveLength(7);
    expect(days.slice(0, 3).map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Sat 24 Oct']);
    expect(days[6]?.date).toBe('2026-10-28');
  });

  it('steps the time by quarter hours within the day', () => {
    expect(stepTime('08:00', 1)).toBe('08:15');
    expect(stepTime('08:00', -4)).toBe('07:00');
    expect(stepTime('00:15', -3)).toBe('00:00');
    expect(stepTime('23:30', 4)).toBe('23:45');
    expect(durationLabel(3)).toBe('3 h');
    expect(durationLabel('day')).toBe('Full day');
  });

  it('centres on the area or the device', () => {
    expect(searchPoint(initialSearch(NOW))).toMatchObject({ place: 'Victoria Island' });
    const near = {
      ...initialSearch(NOW),
      area: null,
      coords: { lat: 6.5, lng: 3.4 },
      placeLabel: null,
    };
    expect(searchPoint(near)).toEqual({ lat: 6.5, lng: 3.4, place: 'your location' });
  });

  it('round-trips through route params and ignores bad values', () => {
    const s = {
      ...initialSearch(NOW),
      area: 'ikoyi',
      duration: 'day' as const,
      sort: 'price' as const,
    };
    expect(fromParams(toParams(s), NOW)).toEqual(s);
    const near = {
      ...initialSearch(NOW),
      area: null,
      coords: { lat: 6.5, lng: 3.4 },
      placeLabel: null,
    };
    expect(fromParams(toParams(near), NOW)).toEqual(near);
    expect(fromParams({ area: 'mars', time: '08:10', duration: '7' }, NOW)).toEqual(
      initialSearch(NOW),
    );
  });
});

describe('a place picked from suggestions', () => {
  it('names the search after the place and keeps it across screens', () => {
    const s = {
      ...initialSearch(NOW),
      area: null,
      coords: { lat: 6.4247, lng: 3.4284 },
      placeLabel: 'Eko Hotel',
    };
    expect(searchPoint(s)).toEqual({ lat: 6.4247, lng: 3.4284, place: 'Eko Hotel' });
    expect(fromParams(toParams(s), NOW)).toEqual(s);
  });
});
