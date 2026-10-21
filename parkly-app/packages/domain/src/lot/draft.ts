/**
 * Rules for creating and editing a lot before it is submitted (FR-LOT-002,
 * doc 03 §2.2). Pure; the API applies them.
 */

/** Doc 02 §2.4 `lots.amenities`. */
export const AMENITIES = [
  'GUARD',
  'CCTV',
  'LIGHTING',
  'COVERED',
  'EV',
  'ACCESS_CONTROL',
  'TOILET',
] as const;
export type Amenity = (typeof AMENITIES)[number];

/** Doc 02 §2.4 `lots.vehicle_types`. */
export const VEHICLE_TYPES = ['CAR', 'SUV', 'BUS'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** A sanity cap: the largest Lagos car parks hold a few thousand cars. */
const MAX_CAPACITY = 100_000;

export function checkCapacity(
  total: number,
  bookable: number,
): 'TOTAL_INVALID' | 'BOOKABLE_INVALID' | 'BOOKABLE_ABOVE_TOTAL' | null {
  if (!Number.isInteger(total) || total <= 0 || total > MAX_CAPACITY) return 'TOTAL_INVALID';
  if (!Number.isInteger(bookable) || bookable <= 0) return 'BOOKABLE_INVALID';
  if (bookable > total) return 'BOOKABLE_ABOVE_TOTAL';
  return null;
}

/**
 * Doc 03 §2.2: the pin must be inside Lagos State. A bounding box around the
 * state (Badagry in the west to Epe/Lekki in the east, the lagoon coast to
 * Ikorodu), slightly generous: it keeps out the rest of Nigeria and Benin,
 * which is what matters for a typo or a wrong-city pin.
 */
const LAGOS_BOUNDS = { south: 6.35, north: 6.75, west: 2.68, east: 4.4 };

export function isInLagosState(p: { lat: number; lng: number }): boolean {
  return (
    p.lat >= LAGOS_BOUNDS.south &&
    p.lat <= LAGOS_BOUNDS.north &&
    p.lng >= LAGOS_BOUNDS.west &&
    p.lng <= LAGOS_BOUNDS.east
  );
}

export type OpeningDay =
  | { weekday: number; is24h: true }
  | { weekday: number; is24h: false; opensAt?: string; closesAt?: string };

export type HoursProblem = {
  weekday: number;
  problem: 'BAD_WEEKDAY' | 'BAD_TIME' | 'SAME_OPEN_AND_CLOSE' | 'DUPLICATE_DAY';
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One window per weekday (0 = Sunday). A day left out is closed. Overnight
 * windows close before they open (18:00–06:00); times are Africa/Lagos.
 */
export function validateOpeningHours(days: readonly OpeningDay[]): HoursProblem[] {
  const problems: HoursProblem[] = [];
  const seen = new Set<number>();
  for (const day of days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) {
      problems.push({ weekday: day.weekday, problem: 'BAD_WEEKDAY' });
      continue;
    }
    if (!day.is24h) {
      if (!day.opensAt || !day.closesAt || !HHMM.test(day.opensAt) || !HHMM.test(day.closesAt))
        problems.push({ weekday: day.weekday, problem: 'BAD_TIME' });
      else if (day.opensAt === day.closesAt)
        problems.push({ weekday: day.weekday, problem: 'SAME_OPEN_AND_CLOSE' });
    }
    if (seen.has(day.weekday)) problems.push({ weekday: day.weekday, problem: 'DUPLICATE_DAY' });
    seen.add(day.weekday);
  }
  return problems;
}

/** URL-safe base for `lots.slug`; the API adds a short random suffix for uniqueness. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return base || 'lot';
}
