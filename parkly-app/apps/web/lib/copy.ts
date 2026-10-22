import type { Amenity, PublicPrice, VerificationItem } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';

export const AMENITY_LABEL: Record<Amenity, string> = {
  GUARD: 'Guard',
  CCTV: 'CCTV',
  LIGHTING: 'Lit at night',
  COVERED: 'Covered',
  EV: 'EV charging',
  ACCESS_CONTROL: 'Gated',
  TOILET: 'Toilet',
};

/** Doc 03 §1.3 verified sheet. */
export const CHECK_LABEL: Record<VerificationItem, string> = {
  LASPA_PERMIT: 'LASPA permit checked',
  GUARD_PRESENCE: 'Guard on duty',
  LIGHTING: 'Lighting after dark',
  CCTV: 'CCTV',
  ACCESS_CONTROL: 'Access control',
  CAPACITY_COUNT: 'Spaces counted',
  OWNER_IDENTITY: 'Owner identity checked',
  ENTRANCE_SIGNAGE: 'Entrance signage',
  FIRE_SAFETY: 'Fire safety',
};

/** Rate cards as published by the lot (the price for a window always comes from the API). */
export function priceLine(p: PublicPrice): string {
  switch (p.product) {
    case 'HOURLY': {
      const min = p.minMinutes === 60 ? '' : `, minimum ${p.minMinutes / 60} h`;
      const cap = p.dailyCapKobo ? `, at most ${formatNaira(p.dailyCapKobo)} a day` : '';
      return `${formatNaira(p.hourlyRateKobo ?? 0)} an hour${min}${cap}`;
    }
    case 'DAILY':
      return `${formatNaira(p.dailyRateKobo ?? 0)} a day`;
    case 'MONTHLY':
      return `${formatNaira(p.monthlyRateKobo ?? 0)} a month (30-day pass)`;
  }
}

/** Driver-facing words for API problems on search and quotes. */
export function problemText(code: string): string {
  switch (code) {
    case 'SEARCH_INVALID_WINDOW':
    case 'BOOKING_WINDOW_INVALID':
      return 'Pick a start time from now up to 30 days ahead, for at most 24 hours.';
    case 'BOOKING_OUTSIDE_OPENING_HOURS':
      return 'The car park is closed for part of that time. Check its opening hours.';
    case 'PRICING_INVALID_DURATION':
      return 'That stay is shorter than this car park’s minimum.';
    case 'LOT_NOT_BOOKABLE':
      return 'This car park doesn’t sell that option.';
    default:
      return 'We couldn’t get prices just now. Please try again in a moment.';
  }
}
