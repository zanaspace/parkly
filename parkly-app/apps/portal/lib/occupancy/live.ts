import type { Occupancy } from '@parkly/contracts';

/** FR-OPS-001 / doc 20 S7 task 1: the dashboard refreshes this often. */
export const REFRESH_MS = 15_000;

/** After three missed refreshes the numbers are flagged as out of date. */
export const STALE_AFTER_MS = 3 * REFRESH_MS;

export type OccupancyItem = Occupancy['items'][number];

/** Totals across every lot for the summary card. */
export function totals(items: OccupancyItem[]) {
  return items.reduce(
    (acc, o) => ({
      inLot: acc.inLot + o.parked + o.walkIns,
      expected: acc.expected + o.expected,
      available: acc.available + o.available,
    }),
    { inLot: 0, expected: 0, available: 0 },
  );
}

/** True when the last good refresh is too old to trust. */
export function isStale(asOf: string, now: number): boolean {
  return now - Date.parse(asOf) > STALE_AFTER_MS;
}

/** "Updated 10:42:05" in Lagos time. */
export function updatedLabel(asOf: string): string {
  const time = new Date(asOf).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `Updated ${time}`;
}

/** "Today", "Tomorrow", then "Wed 5 Nov" for a Lagos YYYY-MM-DD date. */
export function dayLabel(date: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  // Noon UTC is the same calendar day in Lagos (UTC+1).
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Free spaces: under a fifth of bookable spaces left is "busy", none is "full". */
export function freeTone(free: number, capacity: number): 'full' | 'busy' | 'ok' {
  if (free <= 0) return 'full';
  if (capacity > 0 && free / capacity < 0.2) return 'busy';
  return 'ok';
}

/**
 * More cars counted in than the car park holds (gap review G-9): a check-out
 * was missed or the walk-in count is off. Stale sessions close on their own
 * 12 hours after the booking ends and walk-ins reset at 03:00.
 */
export function overCapacity(o: OccupancyItem): boolean {
  return o.parked + o.walkIns > o.capacityTotal;
}
