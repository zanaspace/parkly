import { describe, expect, it } from 'vitest';
import { dayLabel, freeTone, isStale, STALE_AFTER_MS, totals, updatedLabel } from './live';

const item = (parked: number, walkIns: number, expected: number, available: number) => ({
  lotId: '00000000-0000-0000-0000-000000000001',
  name: 'Eko Hotel Car Park',
  capacityTotal: 10,
  parked,
  walkIns,
  expected,
  available,
});

describe('live occupancy helpers (FR-OPS-001)', () => {
  it('adds up cars in the lot, expected arrivals and free spaces across lots', () => {
    expect(totals([item(2, 1, 3, 7), item(0, 4, 1, 6)])).toEqual({
      inLot: 7,
      expected: 4,
      available: 13,
    });
    expect(totals([])).toEqual({ inLot: 0, expected: 0, available: 0 });
  });

  it('flags numbers as out of date after three missed refreshes', () => {
    const asOf = '2026-11-06T09:00:00.000Z';
    const t = Date.parse(asOf);
    expect(isStale(asOf, t + STALE_AFTER_MS)).toBe(false);
    expect(isStale(asOf, t + STALE_AFTER_MS + 1)).toBe(true);
  });

  it('shows the update time in Lagos', () => {
    expect(updatedLabel('2026-11-06T09:42:05.000Z')).toBe('Updated 10:42:05');
  });

  it('labels the week: today, tomorrow, then short dates', () => {
    expect(dayLabel('2026-11-06', 0)).toBe('Today');
    expect(dayLabel('2026-11-07', 1)).toBe('Tomorrow');
    expect(dayLabel('2026-11-08', 2)).toBe('Sun 8 Nov');
  });

  it('marks a lot full, busy (under a fifth free) or fine', () => {
    expect(freeTone(0, 10)).toBe('full');
    expect(freeTone(1, 10)).toBe('busy');
    expect(freeTone(2, 10)).toBe('ok');
    expect(freeTone(3, 0)).toBe('ok');
  });
});
