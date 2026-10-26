import type { Booking } from '@parkly/contracts';

/**
 * Which scan check-in/out action the booking can take now (barrier poster or attendant phone).
 * Available for any confirmed/active stay.
 */
export function selfCheckKind(b: Booking): 'in' | 'out' | null {
  if (b.status === 'CONFIRMED' && !b.stay?.checkedInAt) return 'in';
  if (b.status === 'CHECKED_IN' && !b.stay?.checkedOutAt) return 'out';
  return null;
}
