import type { Booking } from '@parkly/contracts';

/** Which self check the booking can take now, if the owner allows it (ADR 0016). */
export function selfCheckKind(b: Booking): 'in' | 'out' | null {
  if (!b.lot.selfCheckIn) return null;
  if (b.status === 'CONFIRMED' && !b.stay?.checkedInAt) return 'in';
  if (b.status === 'CHECKED_IN' && !b.stay?.checkedOutAt) return 'out';
  return null;
}
