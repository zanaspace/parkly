import { describe, expect, it } from 'vitest';
import {
  AMENITIES,
  checkCapacity,
  isInLagosState,
  slugify,
  validateOpeningHours,
  VEHICLE_TYPES,
} from './draft.js';

describe('lot draft rules (FR-LOT-002, doc 03 §2.2)', () => {
  it('lists the amenities and vehicle types from doc 02 §2.4', () => {
    expect([...AMENITIES]).toEqual([
      'GUARD',
      'CCTV',
      'LIGHTING',
      'COVERED',
      'EV',
      'ACCESS_CONTROL',
      'TOILET',
    ]);
    expect([...VEHICLE_TYPES]).toEqual(['CAR', 'SUV', 'BUS']);
  });

  describe('capacity', () => {
    it.each([
      [100, 80, null],
      [100, 100, null],
      [1, 1, null],
      [0, 0, 'TOTAL_INVALID'],
      [100, 0, 'BOOKABLE_INVALID'],
      [100, 101, 'BOOKABLE_ABOVE_TOTAL'],
      [10.5, 5, 'TOTAL_INVALID'],
      [10, 2.5, 'BOOKABLE_INVALID'],
      [100_001, 10, 'TOTAL_INVALID'],
    ])('total %d, bookable %d → %s', (total, bookable, expected) => {
      expect(checkCapacity(total, bookable)).toBe(expected);
    });
  });

  describe('location must be in Lagos State', () => {
    it.each([
      ['Victoria Island', 6.4281, 3.4219, true],
      ['Ikeja', 6.6018, 3.3515, true],
      ['Lekki Phase 1', 6.4474, 3.4723, true],
      ['Badagry', 6.4153, 2.8813, true],
      ['Epe', 6.5841, 3.9834, true],
      ['Abuja', 9.0765, 7.3986, false],
      ['Ibadan', 7.3775, 3.947, false],
      ['Cotonou', 6.3703, 2.3912, false],
      ['0,0', 0, 0, false],
    ])('%s (%d, %d) → %s', (_n, lat, lng, inside) => {
      expect(isInLagosState({ lat, lng })).toBe(inside);
    });
  });

  describe('opening hours', () => {
    it('accepts 24h days, normal days and overnight windows', () => {
      expect(
        validateOpeningHours([
          { weekday: 0, is24h: true },
          { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '22:00' },
          { weekday: 5, is24h: false, opensAt: '18:00', closesAt: '06:00' },
        ]),
      ).toEqual([]);
    });

    it('allows days to be left out (closed)', () => {
      expect(validateOpeningHours([])).toEqual([]);
    });

    it('rejects a day listed twice, an empty window and bad times', () => {
      expect(
        validateOpeningHours([
          { weekday: 1, is24h: false, opensAt: '07:00', closesAt: '07:00' },
          { weekday: 1, is24h: true },
          { weekday: 2, is24h: false, opensAt: '25:00', closesAt: '10:00' },
          { weekday: 3, is24h: false, opensAt: '08:00' },
          { weekday: 7, is24h: true },
        ]),
      ).toEqual([
        { weekday: 1, problem: 'SAME_OPEN_AND_CLOSE' },
        { weekday: 1, problem: 'DUPLICATE_DAY' },
        { weekday: 2, problem: 'BAD_TIME' },
        { weekday: 3, problem: 'BAD_TIME' },
        { weekday: 7, problem: 'BAD_WEEKDAY' },
      ]);
    });
  });

  describe('slugify', () => {
    it.each([
      ['Eko Hotel Car Park', 'eko-hotel-car-park'],
      ['  Ikoyi Club 1938 — Main Lot! ', 'ikoyi-club-1938-main-lot'],
      ['Café & Lounge', 'cafe-and-lounge'],
      ['###', 'lot'],
    ])('%j → %s', (name, slug) => {
      expect(slugify(name)).toBe(slug);
    });

    it('keeps slugs short enough for the 120-character column with room for a suffix', () => {
      expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(100);
    });
  });
});
