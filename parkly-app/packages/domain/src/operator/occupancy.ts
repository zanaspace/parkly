import { floorToSlot, lagosDateKey } from '../time/slots.js';

const DAY_MS = 24 * 60 * 60_000;
/** Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60_000;

/** One 15-minute slot of a lot's inventory (doc 02 §2.5). */
export type OutlookSlot = {
  slotStart: Date;
  capacity: number;
  booked: number;
  held: number;
  passReserved: number;
  blocked: number;
};

export type OutlookDay = {
  /** Lagos date, YYYY-MM-DD. */
  date: string;
  /** Paid bookings due to start that day and not yet arrived. */
  arrivals: number;
  /** Spaces taken at the busiest 15 minutes of the day (booked, held, passes, blocked). */
  peakInUse: number;
  /** Bookable spaces still free at that busiest moment. */
  minFree: number;
};

/** Midnight in Lagos of the day `key`, as a UTC instant. */
function lagosMidnight(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) - LAGOS_OFFSET_MS;
}

/**
 * FR-OPS-001: today and the next six days for one lot, from its slot inventory
 * and the start times of paid bookings not yet arrived. Today counts only from
 * the current slot on. Slots with no row have nothing booked.
 */
export function weekOutlook(input: {
  now: Date;
  capacityBookable: number;
  slots: OutlookSlot[];
  arrivals: Date[];
  days?: number;
}): OutlookDay[] {
  const { now, capacityBookable } = input;
  const from = floorToSlot(now).getTime();
  const today = lagosMidnight(lagosDateKey(now));
  return Array.from({ length: input.days ?? 7 }, (_, i) => {
    const start = today + i * DAY_MS;
    const end = start + DAY_MS;
    const lower = Math.max(start, i === 0 ? from : start);
    const inDay = (t: number) => t >= lower && t < end;

    let peakInUse = 0;
    let minFree = capacityBookable;
    for (const s of input.slots) {
      if (!inDay(s.slotStart.getTime())) continue;
      const used = s.booked + s.held + s.passReserved + s.blocked;
      peakInUse = Math.max(peakInUse, used);
      minFree = Math.min(minFree, s.capacity - used);
    }
    return {
      date: lagosDateKey(new Date(start)),
      arrivals: input.arrivals.filter((a) => inDay(a.getTime())).length,
      peakInUse,
      minFree: Math.max(0, minFree),
    };
  });
}
