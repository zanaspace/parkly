import { describe, expect, it } from 'vitest';
import { readSearch, searchQuery } from './search';

// Thursday 22 Oct 2026, 14:20 in Lagos. Shared rules are tested in @parkly/domain/discovery.
const NOW = new Date('2026-10-22T13:20:00Z');

describe('reading a search from the URL', () => {
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

  it('round-trips through links', () => {
    const s = readSearch({ area: 'yaba', duration: '4' }, NOW);
    expect(readSearch(Object.fromEntries(new URLSearchParams(searchQuery(s))), NOW)).toEqual(s);
    const near = readSearch({ lat: '6.5', lng: '3.4' }, NOW);
    expect(searchQuery(near, { sort: 'price' })).toContain('lat=6.5');
  });
});

describe('a place picked from suggestions', () => {
  it('keeps its name through links, and is capped in length', () => {
    const s = readSearch({ lat: '6.4247', lng: '3.4284', place: 'Eko Hotel' }, NOW);
    expect(s).toMatchObject({ lat: 6.4247, lng: 3.4284, place: 'Eko Hotel' });
    expect(readSearch(Object.fromEntries(new URLSearchParams(searchQuery(s))), NOW)).toEqual(s);
    expect(readSearch({ lat: '6.4', lng: '3.4', place: 'x'.repeat(200) }, NOW).place).toHaveLength(
      80,
    );
  });
});
