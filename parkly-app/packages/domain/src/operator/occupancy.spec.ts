import { describe, expect, it } from 'vitest';
import { weekOutlook } from './occupancy.js';

// Monday 2026-11-02 09:10 Lagos (08:10 UTC).
const NOW = new Date('2026-11-02T08:10:00Z');
const slot = (
  iso: string,
  used: Partial<Record<'booked' | 'held' | 'passReserved' | 'blocked', number>>,
  capacity = 10,
) => ({
  slotStart: new Date(iso),
  capacity,
  booked: 0,
  held: 0,
  passReserved: 0,
  blocked: 0,
  ...used,
});

describe('weekOutlook (FR-OPS-001)', () => {
  it('gives seven Lagos days from today, all free when nothing is booked', () => {
    const days = weekOutlook({ now: NOW, capacityBookable: 10, slots: [], arrivals: [] });
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(days[0]).toEqual({ date: '2026-11-02', arrivals: 0, peakInUse: 0, minFree: 10 });
  });

  it('counts arrivals by Lagos day, including late evening (UTC the day before)', () => {
    const days = weekOutlook({
      now: NOW,
      capacityBookable: 10,
      slots: [],
      arrivals: [
        new Date('2026-11-02T10:00:00Z'),
        new Date('2026-11-02T23:30:00Z'), // 00:30 Tuesday in Lagos
        new Date('2026-11-03T22:59:00Z'), // 23:59 Tuesday in Lagos
        new Date('2026-11-20T10:00:00Z'), // beyond the week
      ],
    });
    expect(days.map((d) => d.arrivals)).toEqual([1, 2, 0, 0, 0, 0, 0]);
  });

  it('finds the busiest moment of each day and the spaces free then', () => {
    const days = weekOutlook({
      now: NOW,
      capacityBookable: 10,
      slots: [
        slot('2026-11-02T09:00:00Z', { booked: 3, held: 1 }),
        slot('2026-11-02T09:15:00Z', { booked: 6, blocked: 1 }),
        slot('2026-11-03T12:00:00Z', { booked: 2, passReserved: 2 }),
        // A smaller capacity on that slot (a closure) leaves fewer free.
        slot('2026-11-04T12:00:00Z', { booked: 1 }, 4),
      ],
      arrivals: [],
    });
    expect(days.slice(0, 3).map((d) => [d.peakInUse, d.minFree])).toEqual([
      [7, 3],
      [4, 6],
      [1, 3],
    ]);
  });

  it('ignores the part of today that has passed', () => {
    const days = weekOutlook({
      now: NOW,
      capacityBookable: 10,
      slots: [
        slot('2026-11-02T06:00:00Z', { booked: 9 }),
        slot('2026-11-02T08:00:00Z', { booked: 2 }),
      ],
      arrivals: [new Date('2026-11-02T07:00:00Z')],
    });
    // 06:00 UTC is over; the 08:00 slot is still running at 08:10.
    expect(days[0]).toEqual({ date: '2026-11-02', arrivals: 0, peakInUse: 2, minFree: 8 });
  });

  it('never reports fewer than zero free', () => {
    const [today] = weekOutlook({
      now: NOW,
      capacityBookable: 5,
      slots: [slot('2026-11-02T10:00:00Z', { booked: 7 }, 5)],
      arrivals: [],
    });
    expect(today?.minFree).toBe(0);
  });
});
